import "swiper/css";
import { initAboutFold } from "./libs/about-fold.js";
import { initAnimationSlider } from "./libs/animation-slider.js";
import { initGlobalNav } from "./libs/global-nav.js";
import { initTextMagnet } from "./libs/text-magnet.js";
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
import { initScrollMemory, isHistoryNavigation } from "./libs/scroll-memory.js";
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
  // .js-text-magnet を文書全体から拾い直す。ヘッダーや About は #swup の外で
  // 生き続けるが、分解済みの span をそのまま拾うので二重には割れない
  initTextMagnet();
});

initSwup();

// ページ内アンカー(/#animation 等)を Lenis のスムーススクロールで処理する。
// Swup のスクロール系フックを差し替えるので initSwup() のあとに呼ぶ
initAnchorScroll();

// 戻る / 進むのスクロール位置の復元。page:view を onPageInit() より後に
// 走らせる必要があるので、こちらも initSwup() のあとに呼ぶ
initScrollMemory();

// 直打ちやリロードで /#projects のようにハッシュ付きで開かれたときの着地。
//
// 初回ロードの着地はブラウザ任せだが、それが走るのは JS が .is-webgl を付ける前、
// つまり素のリスト表示の高さのとき。直後に Animation が (件数 + 1) × 80lvh へ伸びて
// Projects は数画面ぶん下へ動くので、止まった位置はそのまま Animation の途中になる。
// ブラウザは読み込み中フラグメントへの再スクロールを試み続けるため、.is-webgl が
// 間に合った回だけ正しく着地する = ズレたりズレなかったりする。
//
// ここは initSwup() → onPageInit() が .is-webgl を付け終えたあと。高さは lvh だけで
// 決まるのでこの時点で確定していて、あとから動くことはない。
// (前ページの短い値のままの Lenis の limit は scrollToTarget() が測り直す)
//
// 戻る / 進むでの読み込みは scroll-memory.js が元の位置へ戻すので任せる
if (!isHistoryNavigation()) {
  // ブラウザが既にそこへ跳んでいる = 移動の過程は見せない
  scrollToHash(window.location.hash, { immediate: true });
}
