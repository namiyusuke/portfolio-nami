import Swiper from "swiper";
import { FreeMode, Navigation } from "swiper/modules";

// note セクションのスライダーを初期化する。
// 対象要素が無いページでは何もしない（swup 遷移先で安全に呼べる）。
export const initNoteSwiper = () => {
  const el = document.querySelector(".js-noteSwiper");
  if (!el) return;

  return new Swiper(el, {
    modules: [FreeMode, Navigation],
    slidesPerView: "auto",
    spaceBetween: 24,

    speed: 600,
    navigation: {
      nextEl: ".note-swiper__next",
      prevEl: ".note-swiper__prev",
    },
  });
};
