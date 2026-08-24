import "swiper/css";
import { initAnimationSlider } from "./libs/animation-slider.js";
import { initHeaderWeather } from "./libs/header-weather.js";
import { initHeroHolo } from "./libs/hero-holo.js";
import { initLenis, resetScroll } from "./libs/lenis.js";
import Observer from "./libs/observer.js";
import { initProjectFold } from "./libs/project-fold.js";
import { initProjectHero } from "./libs/project-hero.js";
import { initNoteSwiper } from "./libs/swiper.js";
import { initSwup, registerPageInit, registerPageTransition } from "./libs/swup.js";
import { enter, initial, leave } from "./libs/transition.js";
initLenis();

// ヘッダーは #swup の外にあり遷移時も保持されるため、初回に一度だけ更新する
initHeaderWeather();

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
  const _headerObserver = new Observer(
    ".js-section",
    {
      rootMargin: "0% 0% -20% 0%",
      threshold: 0,
      once: false,
    },
    true,
    true,
  );
  // ページごとに動かす関数はすべてこの中で呼ぶ。
  // Swup遷移後はDOMが差し替わるため、ここに登録しないと2ページ目以降で動かなくなる。
  initNoteSwiper();
  // 前ページのインスタンス破棄も関数内で行うため、遷移のたびに呼んでよい
  initHeroHolo();
  initAnimationSlider();
  initProjectFold();
  // 詳細ページのメイン画像を板と同じ矩形に合わせる(遷移演出の着地先になる)
  initProjectHero();
});

initSwup();
