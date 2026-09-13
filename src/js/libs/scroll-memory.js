import { scrollToTarget } from "./anchor-scroll.js";
import { getLenis } from "./lenis.js";
import { getSwup } from "./swup.js";

// 戻る / 進むのスクロール位置を自前で復元する。
//
// ブラウザ任せのピクセル復元だと、復元する瞬間のドキュメントが本来より短いために
// 値がクランプされ、あとからページが伸びてもズレた位置に取り残される。
// 短くなる理由は経路によって違う:
//
//   1. 同一ドキュメント内の popstate(通常はこちら。Swup は pushState で遷移する)
//      復元の瞬間 #swup の中身はまだ詳細ページで、トップ
//      (100lvh + (Animation の件数 + 1) × 80lvh)よりずっと短い。
//      直後の content:replace と .is-webgl でページが伸びてももう遅い。
//   2. タブが破棄されるなどして戻るが本物の再読み込みになった場合
//      JS が .is-webgl を付ける前の素のリスト表示の高さで復元される。
//
// しかも 1 の popstate は visit.animation.animate が false なので
// animation:in:await が呼ばれず、main.js の enter(resetScroll → scrollToHash)が
// 走らない。swup 自身も scroll.reset / scroll.target を false にするため、
// 誰もこのズレを直さない。
//
// そこで scrollRestoration を manual に固定してブラウザの復元を完全に止め、
// レイアウトが確定したあとに自分で戻す。

const STORE_KEY = "scroll-memory";

// ブラウザの復元に先回りして止める。init を待つと読み込み直後の復元に間に合わない
history.scrollRestoration = "manual";

const currentUrl = () => window.location.pathname + window.location.search;

// この読み込みが戻る / 進むによるものか(= 同一ドキュメントの popstate にならず、
// ドキュメントごと作り直された場合の判定)
export const isHistoryNavigation = () => performance.getEntriesByType("navigation")[0]?.type === "back_forward";

// URL → そのページを離れたときのスクロール位置と、直前に見ていた URL。
// 同一ドキュメント内で完結するなら Map で足りるが、上の 2 の経路では
// ドキュメントごと作り直されるので sessionStorage に逃がしておく
const readStore = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "") ?? {};
  } catch {
    return {};
  }
};

const remember = (url) => {
  if (!url) {
    return;
  }

  const { positions } = readStore();

  try {
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({ positions: { ...positions, [url]: window.scrollY }, last: url }),
    );
  } catch {
    // シークレットで容量制限に当たっても、復元が効かなくなるだけなので黙って諦める
  }
};

const isProjectDetail = (url) => /(^|\/)project\/[^/]+\/?$/.test(url ?? "");

// 詳細ページから戻ってきたときだけは、記録したピクセル値ではなく Projects
// セクションそのものへ着地させる。板の折りたたみ演出が離脱直前にステージを画面
// 上端へ寄せているので値としてもほぼ同じだが、要素基準ならビューポートの高さや
// 件数が変わってもセクションの頭に必ず止まる
const landingTarget = (fromUrl, toUrl) => {
  if (isProjectDetail(fromUrl)) {
    const section = document.querySelector("#projects");
    if (section) {
      return section;
    }
  }

  return readStore().positions?.[toUrl] ?? 0;
};

const restore = (fromUrl, toUrl) => {
  // 高さが変わった直後。Lenis の limit は ResizeObserver(250ms デバウンス)待ちで
  // まだ差し替え前の短い値のままなので、先に測り直す。
  // これを忘れると今度は Lenis 側で同じクランプを食らう
  getLenis()?.resize();

  scrollToTarget(landingTarget(fromUrl, toUrl), { immediate: true });
};

export const initScrollMemory = () => {
  const swup = getSwup();
  if (!swup) {
    return;
  }

  // visit:start は退場演出より前に呼ばれる。演出がスクロールを動かす前の
  // 「ユーザーが見ていた位置」を覚えておく
  swup.hooks.on("visit:start", (visit) => {
    remember(visit.from?.url);
  });

  // 再読み込みやタブ離脱に備えて。unload ではなく pagehide を使う(bfcache を壊さない)
  window.addEventListener("pagehide", () => {
    remember(currentUrl());
  });

  // 経路 1: 同一ドキュメント内の戻る / 進む。
  // page:view は content:replace のあとで、swup.js の page:view ハンドラより後に
  // 登録しているので、この時点で onPageInit() が .is-webgl を付け終えている
  swup.hooks.on("page:view", (visit) => {
    if (!visit?.history?.popstate) {
      return;
    }

    restore(visit.from?.url, visit.to?.url);
  });

  // 経路 2: ドキュメントごと作り直された戻る / 進む。
  // initSwup() のあとに呼ばれている = onPageInit() が .is-webgl を付け終えていて、
  // 高さは lvh だけで決まるのでこの時点で確定している
  if (isHistoryNavigation()) {
    restore(readStore().last, currentUrl());
  }

  // bfcache から戻ってきた場合。scrollRestoration が manual だとブラウザが
  // 位置を戻さないことがあるので、ここでも自分で戻す
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      restore(readStore().last, currentUrl());
    }
  });
};
