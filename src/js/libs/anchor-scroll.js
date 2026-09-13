import { resumeHeroSnap, suspendHeroSnap } from "./hero-snap.js";
import { getLenis } from "./lenis.js";
import { getSwup } from "./swup.js";

// ヘッダーのアンカーリンク(/#animation 等)の着地を Lenis に一本化する。
//
// Swup は document でクリックを拾い、preventDefault を見ない。同じページ内への
// アンカーは link:anchor → scrollToContent → scrollIntoView(behavior:"auto")、
// 現在ページへのリンク(Top)は link:self → window.scrollTo(0,0) と、いずれも
// ネイティブのスクロールを直接叩く。Lenis は自分の知らない位置移動を次の raf で
// 巻き戻すため、放っておくとアンカーが「効かない」ように見える。
// そこで scroll:anchor / scroll:top を差し替え、Lenis のスムーススクロールに繋ぐ。

// 搬送の世代。連打で新しい搬送が始まったら古い onComplete は無視する
let token = 0;

// target は要素か数値(ページ位置)。0 は falsy なので存在判定は == null で行う。
// immediate を付けると搬送を見せずに一瞬で着地する(履歴復元のように
// 「移動の過程を見せたくない」場合に使う)
export const scrollToTarget = (target, { immediate = false } = {}) => {
  const lenis = getLenis();
  if (!lenis || target == null) {
    return false;
  }

  const current = ++token;

  // MV ↔ Animation の重なり区間を通り過ぎる搬送(例: MV から Projects へ)は、
  // hero-snap がスナップとみなして目的地を横取りしてしまう。着地まで黙らせる。
  // lock は搬送中にホイールで割り込ませないため(= onComplete が必ず来る)、
  // force は hero-snap 側の lock が残っていても動けるようにするため
  suspendHeroSnap();
  lenis.scrollTo(target, {
    lock: true,
    force: true,
    immediate,
    onComplete: () => {
      if (current === token) {
        resumeHeroSnap();
      }
    },
  });

  return true;
};

// location.hash に対応する要素へスムーススクロールする。要素が無ければ何もしない
export const scrollToHash = (hash) => {
  const target = hash ? document.querySelector(hash) : null;
  return target ? scrollToTarget(target) : false;
};

export const initAnchorScroll = () => {
  const swup = getSwup();
  if (!swup) {
    return;
  }

  // アンカーへの着地。true を返すと Swup は「処理済み」とみなし先頭へ戻さない
  swup.hooks.replace("scroll:anchor", (visit, { hash }) => {
    const target = swup.getAnchorElement(hash);
    if (!target) {
      return false;
    }

    // 別ページからのアンカー付き遷移(下層 → /#animation 等)は、まだ入場演出の前で
    // レイアウトも確定していない。位置合わせは main.js の enter フック
    // (resetScroll → 入場 → scrollToHash)に任せ、ここでは動かさない
    if (visit.to.url !== visit.from.url) {
      return true;
    }

    return scrollToTarget(target);
  });

  // 現在ページへのリンク(ヘッダーの Top)。ネイティブの window.scrollTo を止める
  swup.hooks.replace("scroll:top", (visit) => {
    // 遷移時の先頭戻しは main.js の enter フック(resetScroll)が受け持つ
    if (visit.to.url !== visit.from.url) {
      return false;
    }

    return scrollToTarget(0);
  });
};
