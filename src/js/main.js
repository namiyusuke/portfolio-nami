import "swiper/css";
import { initAboutFold } from "./libs/about-fold.js";
import { initAnimationSlider } from "./libs/animation-slider.js";
import { initGlobalNav } from "./libs/global-nav.js";
import { initHeaderWeather } from "./libs/header-weather.js";
import { initHeroIntro } from "./libs/hero-intro.js";
import { initHeroSnap } from "./libs/hero-snap.js";
import { initHeroTypography } from "./libs/hero-typography.js";
import { initAnchorScroll, scrollToHash } from "./libs/anchor-scroll.js";
import { initLenis, resetScroll } from "./libs/lenis.js";
import Observer from "./libs/observer.js";
import { initProjectFold } from "./libs/project-fold.js";
import { initProjectGallery } from "./libs/project-gallery.js";
import { initProjectHero } from "./libs/project-hero.js";
import { initSectionCrossfade } from "./libs/section-crossfade.js";
import { initNoteSwiper } from "./libs/swiper.js";
import { initSwup, registerPageInit, registerPageTransition } from "./libs/swup.js";
import { enter, initial, leave } from "./libs/transition.js";
initLenis();
initHeaderWeather();
initAboutFold();
initGlobalNav();
registerPageTransition({
  initial,
  leave,
  enter: async (visit) => {
    resetScroll();
    await enter(visit);
    scrollToHash(window.location.hash);
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
  initNoteSwiper();
  initHeroIntro();
  initHeroTypography();
  initAnimationSlider();
  initProjectFold();
  initSectionCrossfade();
  initHeroSnap();
  initProjectHero();
  // 詳細ページの画像ギャラリー。下端が捲れた板をスクロールで平らに戻す
  initProjectGallery();
});

initSwup();

// ページ内アンカー(/#animation 等)を Lenis のスムーススクロールで処理する。
// Swup のスクロール系フックを差し替えるので initSwup() のあとに呼ぶ
initAnchorScroll();
