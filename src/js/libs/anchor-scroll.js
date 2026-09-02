import { getLenis } from "./lenis.js";

// ヘッダーのアンカーリンク(/#animation 等)を Lenis のスムーススクロールに繋ぐ。
// ここで拾うのは「今いるページ内へのアンカー」だけ。別ページへのアンカー付き遷移は
// Swup が通常遷移し、main.js の enter フック(scrollToHash)が着地位置を合わせる。
export const initAnchorScroll = () => {
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href*="#"]');
    if (!link) {
      return;
    }
    const url = new URL(link.href, window.location.href);
    // 別ページへのリンクは Swup に任せる。href="#" だけのリンク(js-about-open 等)も対象外
    if (url.pathname !== window.location.pathname || !url.hash) {
      return;
    }
    const target = document.querySelector(url.hash);
    if (!target) {
      return;
    }
    event.preventDefault();
    getLenis()?.scrollTo(target);
    history.pushState(null, "", url.hash);
  });
};
