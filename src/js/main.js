import "swiper/css";

import { initLenis, resetScroll } from "./libs/lenis.js";
import { initSwup, registerPageInit, registerPageTransition } from "./libs/swup.js";
import { enter, initial, leave } from "./libs/transition.js";
import Observer from "./libs/observer.js";
import { initNoteSwiper } from "./libs/swiper.js";
initLenis();

registerPageTransition({
  initial,
  leave,
  // ページ入場前にスクロール位置を先頭へ戻す
  enter: async (visit) => {
    resetScroll();
    await enter(visit);
  },
});
registerPageInit(() => {
  const _fadeOutObserver = new Observer(
    ".js-fadeOut",
    {
      rootMargin: "0% 0% 0% 0%",
      threshold: 0,
      once: false,
    },
    true,
    true,
  );
  // ページごとに動かす関数はすべてこの中で呼ぶ。
  // Swup遷移後はDOMが差し替わるため、ここに登録しないと2ページ目以降で動かなくなる。
  initNoteSwiper();
});

initSwup();
