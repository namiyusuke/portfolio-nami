// 詳細ページのメインビジュアルを、一覧の板(WebGL)がめくり終わった位置・大きさに合わせる。
// 両方が同じ矩形になるので、遷移してきたときに画像が動いたり大きさが変わったりしない。
//
// 直リンクで開いたときは foldedPlateSize() から計算した位置に置き、
// 遷移で来たときは板が実際に映っている矩形をそのまま写す(placeProjectHero)。

import { foldedPlateSize } from "./project-fold/plate-metrics.js";

// 板から画像へ引き渡すまでの間、遷移先の画像を隠しておくクラス(html に付ける)
export const HERO_HANDOFF_CLASS = "is-project-handoff";

const STAGE_SELECTOR = ".js-project-hero-stage";
const IMAGE_SELECTOR = ".js-project-hero";
// 画像が用意できるのを待つ上限(ms)。読めない画像で板が残り続けないようにする
const DECODE_TIMEOUT = 800;

let teardown = null;

// 画像の位置と大きさはすべてカスタムプロパティ経由で渡す(top はステージ上端からの距離)
const setFrame = (stage, { width, height, top }) => {
  stage.style.setProperty("--p-project-hero-w", `${width}px`);
  stage.style.setProperty("--p-project-hero-h", `${height}px`);
  stage.style.setProperty("--p-project-hero-top", `${top}px`);
};

export const destroyProjectHero = () => {
  teardown?.();
  teardown = null;
};

export const initProjectHero = () => {
  // Swup 遷移では前ページ分の監視が残っているので必ず先に外す
  destroyProjectHero();

  const stage = document.querySelector(STAGE_SELECTOR);
  if (!stage?.querySelector(IMAGE_SELECTOR)) {
    return;
  }

  // ステージは一覧の canvas と同じ「画面幅 × 100svh」。同じ寸法から同じ答えが出る
  const apply = () => {
    const { width, height } = foldedPlateSize(stage.offsetWidth, stage.offsetHeight);
    // 一覧の canvas はビューポート上端に揃うので、板の上端はビューポートから見て
    // (100svh - 画像高) / 2。ステージはヘッダーのぶん下から始まるため、その分を引く
    const stageTop = stage.getBoundingClientRect().top + window.scrollY;

    setFrame(stage, { width, height, top: (stage.offsetHeight - height) / 2 - stageTop });
  };

  apply();
  window.addEventListener("resize", apply);
  teardown = () => window.removeEventListener("resize", apply);
};

// 遷移演出からの引き渡し。板が今映っている矩形(ビューポート基準)をそのまま画像に写す。
// 計算し直さず実測値を使うので、ヘッダーの有無やスクロール位置に関係なくズレない。
//
// そのうえで画像が描ける状態になるまで待つ。ここを待たずに板を消すと、
// 画像のデコードが間に合わずに一瞬空白が見える(＝ちらつきの正体)。
export const handoffProjectHero = async (rect) => {
  const stage = document.querySelector(STAGE_SELECTOR);
  const image = stage?.querySelector(IMAGE_SELECTOR);
  if (!stage || !image) {
    return false;
  }

  const box = stage.getBoundingClientRect();
  setFrame(stage, { width: rect.width, height: rect.height, top: rect.top - box.top });

  // decode() は visibility: hidden のままでも走る。読めなくても遷移は止めない
  await Promise.race([
    image.decode().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, DECODE_TIMEOUT)),
  ]);

  return true;
};
