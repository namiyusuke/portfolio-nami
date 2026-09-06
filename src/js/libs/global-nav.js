// ヘッダーの SP 用ドロワー。ヘッダーは #swup の外にあり遷移をまたいで
// 保持されるため、初回に一度だけ配線すればよい。
// 開閉は CSS の transition に任せ、ここは状態クラスとスクロールロックだけ持つ。

import { getLenis } from "./lenis.js";

export const initGlobalNav = () => {
  const toggle = document.querySelector(".js-nav-toggle");
  const nav = document.querySelector(".js-nav");
  if (!toggle || !nav) {
    return;
  }

  const toggleLabel = toggle.querySelector(".js-nav-toggle-label");

  const isOpen = () => nav.classList.contains("is-open");

  // keepScrollLock: 閉じたあとに別のオーバーレイがスクロールを止め続ける場合、
  // ここで start() すると一瞬スクロールが戻ってしまうので解除しない
  const setOpen = (open, { keepScrollLock = false } = {}) => {
    nav.classList.toggle("is-open", open);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    if (toggleLabel) {
      toggleLabel.textContent = open ? "close" : "menu";
    }

    if (open) {
      // .lenis-stopped の overflow: hidden で背面のスクロールごと止まる
      getLenis()?.stop();
    } else if (!keepScrollLock) {
      getLenis()?.start();
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(!isOpen());
  });

  // ドロワー内のリンクを踏んだら閉じる。About は続けて紙のオーバーレイが
  // 開き、そちらが自前でスクロールを止め直すのでロックは解かない
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !isOpen()) {
      return;
    }
    setOpen(false, { keepScrollLock: link.classList.contains("js-about-open") });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      setOpen(false);
    }
  });

  // PC 幅に戻したときにドロワーが開いたまま残らないようにする
  const desktop = window.matchMedia("(width >= 768px)");
  desktop.addEventListener("change", (event) => {
    if (event.matches && isOpen()) {
      setOpen(false);
    }
  });
};
