import { scrollToTarget } from "./anchor-scroll.js";
import { getLenis } from "./lenis.js";
import { getSwup } from "./swup.js";

// 戻る / 進むのスクロール位置を自前で復元する。
//
// Swup は pushState で遷移するので、戻る操作は「同一ドキュメント内の popstate」に
// なる(再読み込みも bfcache も挟まらない)。このときブラウザは / の履歴エントリに
// 保存したピクセル値を復元しようとするが、その瞬間 #swup の中身はまだ詳細ページの
// ままで、トップ(100lvh + (Animation の件数 + 1) × 80lvh)よりずっと短い。復元値は
// その短い高さにクランプされ、直後の content:replace と .is-webgl でページが伸びても
// クランプされた位置に取り残される。結果、Projects の手前の Animation に着地していた。
//
// しかも popstate の visit は animation.animate が false なので animation:in:await が
// 呼ばれず、main.js の enter(resetScroll → scrollToHash)が走らない。swup 自身も
// scroll.reset / scroll.target を false にするため、誰もこのズレを直さない。
//
// そこで scrollRestoration を manual に固定してブラウザの復元を完全に止め、
// レイアウトが確定する page:view のあとに自分で戻す。

// URL(pathname + search) → そのページを離れたときのスクロール位置。
// ドキュメントが生きている間だけ持てばよいので sessionStorage は使わない
const positions = new Map();

const isProjectDetail = (url) => /(^|\/)project\/[^/]+\/?$/.test(url ?? "");

// 詳細ページから戻ってきたときだけは、記録したピクセル値ではなく Projects
// セクションそのものへ着地させる。板の折りたたみ演出が離脱直前にステージを画面
// 上端へ寄せているので値としてもほぼ同じだが、要素基準ならビューポートの高さや
// 件数が変わってもセクションの頭に必ず止まる
const landingTarget = (visit) => {
  if (isProjectDetail(visit.from?.url)) {
    const section = document.querySelector("#projects");
    if (section) {
      return section;
    }
  }

  return positions.get(visit.to?.url) ?? 0;
};

export const initScrollMemory = () => {
  // ブラウザ任せのピクセル復元を止める。以降の復元はこのモジュールだけが行う。
  // (以前は hero-intro.js がイントロ再生時だけ manual にしていたので、イントロが
  //  流れない環境 — reduced-motion や詳細ページ直入り — でだけブラウザの復元が
  //  生き残り、上のクランプを踏んでいた)
  history.scrollRestoration = "manual";

  const swup = getSwup();
  if (!swup) {
    return;
  }

  // visit:start は退場演出より前に呼ばれる。演出がスクロールを動かす前の
  // 「ユーザーが見ていた位置」を覚えておく
  swup.hooks.on("visit:start", (visit) => {
    positions.set(visit.from.url, window.scrollY);
  });

  // page:view は content:replace のあと。swup.js の page:view ハンドラより後に
  // 登録しているので、この時点で onPageInit() が .is-webgl を付け終えていて
  // ページの高さは確定している
  swup.hooks.on("page:view", (visit) => {
    if (!visit?.history?.popstate) {
      return;
    }

    // 高さが変わった直後。Lenis の limit は ResizeObserver 待ちでまだ差し替え前の
    // 短い値のままなので、先に測り直す。忘れると Lenis 側で同じクランプを食らう
    getLenis()?.resize();

    scrollToTarget(landingTarget(visit), { immediate: true });
  });
};
