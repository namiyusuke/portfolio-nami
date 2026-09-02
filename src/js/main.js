import "swiper/css";
import { initAboutFold } from "./libs/about-fold.js";
import { initAnimationSlider } from "./libs/animation-slider.js";
import { initHeaderWeather } from "./libs/header-weather.js";
import { initHeroHolo } from "./libs/hero-holo.js";
import { initHeroIntro } from "./libs/hero-intro.js";
import { initHeroTypography } from "./libs/hero-typography.js";
import { initAnchorScroll } from "./libs/anchor-scroll.js";
import { initLenis, resetScroll, scrollToHash } from "./libs/lenis.js";
import Observer from "./libs/observer.js";
import { initProjectFold } from "./libs/project-fold.js";
import { initProjectGallery } from "./libs/project-gallery.js";
import { initProjectHero } from "./libs/project-hero.js";
import { initSectionCrossfade } from "./libs/section-crossfade.js";
import { initNoteSwiper } from "./libs/swiper.js";
import { initSwup, registerPageInit, registerPageTransition } from "./libs/swup.js";
import { enter, initial, leave } from "./libs/transition.js";
initLenis();

// ヘッダーは #swup の外にあり遷移時も保持されるため、初回に一度だけ更新する
initHeaderWeather();
// About オーバーレイ(紙めくり)もヘッダー同様 #swup の外なので初回に一度だけ配線する
initAboutFold();
// ページ内アンカー(/#animation 等)を Lenis のスムーススクロールで処理する
initAnchorScroll();

registerPageTransition({
  initial,
  leave,
  // ページ入場前にスクロール位置を先頭へ戻し、
  // アンカー付き遷移(下層ページ → /#animation 等)は入場演出のあとスムーススクロールで移動
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
  // ページごとに動かす関数はすべてこの中で呼ぶ。
  // Swup遷移後はDOMが差し替わるため、ここに登録しないと2ページ目以降で動かなくなる。
  initNoteSwiper();
  // 前ページのインスタンス破棄も関数内で行うため、遷移のたびに呼んでよい
  // イントロ(カードが奥へ流れて FV が現れる)は初回表示のときだけ再生される
  initHeroIntro();
  // FV のタイポグラフィ。初回はイントロ(hero-intro)の終了を待って再生される
  initHeroTypography();
  initHeroHolo();
  initAnimationSlider();
  initProjectFold();
  // Animation → Projects のクロスフェード。
  // 両 init が同期的に付ける is-webgl を見るので、この順で呼ぶ
  initSectionCrossfade();
  // 詳細ページのメイン画像を板と同じ矩形に合わせる(遷移演出の着地先になる)
  initProjectHero();
  // 詳細ページの画像ギャラリー。下端が捲れた板をスクロールで平らに戻す
  initProjectGallery();
});

initSwup();
