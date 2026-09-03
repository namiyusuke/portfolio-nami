import gsap from "gsap";
import Lenis from "lenis";

let lenis = null;

// Lenis(スムーススクロール)を初期化。GSAPのtickerで駆動して描画を1本化する。
export const initLenis = () => {
  if (lenis) {
    return lenis;
  }

  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    smoothWheel: true,
  });

  // requestAnimationFrameを自前で回さず、GSAPのtickerに同期させる
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  return lenis;
};

export const getLenis = () => lenis;

// Swup遷移時にスクロール位置を先頭へ戻す(即時)。
// スナップ搬送(lock)や stop() 中でも Lenis の scrollTo は force なしだと
// 黙って無視されるため必ず force を付ける。immediate の内部 reset() が
// 走りかけの搬送アニメとロックも一緒に破棄してくれる
export const resetScroll = () => {
  if (lenis) {
    lenis.scrollTo(0, { immediate: true, force: true });
  }
};

// location.hash に対応する要素へスムーススクロールする。要素が無ければ何もしない
export const scrollToHash = (hash) => {
  const target = hash ? document.querySelector(hash) : null;
  if (lenis && target) {
    lenis.scrollTo(target);
  }
};
