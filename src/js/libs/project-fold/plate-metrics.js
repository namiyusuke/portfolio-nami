
export const PLANE_HEIGHT = 1;
// テクスチャの比率が分からないときに使う既定の比率
export const DEFAULT_ASPECT = 1.6;
// 板が画面幅・画面高に対して占める最大比率(左右上下の余白を確保する)
export const PLANE_FIT = 0.82;
// スマホは画面が狭いぶん板が小さく映りすぎるので、余白を詰めて大きく取る。
// [slug].astro のフォールバック CSS(--p-project-hero-w)も同じ切り替えを持つので、値を揃えること
export const PLANE_FIT_NARROW = 1.05;
export const NARROW_STAGE_WIDTH = 768;
const planeFit = (stageWidth) => (stageWidth < NARROW_STAGE_WIDTH ? PLANE_FIT_NARROW : PLANE_FIT);
export const CAMERA_FOV = 70;
export const CAMERA_Z = 1.5;
export const FOLD_DEPTH = PLANE_HEIGHT * 0.3;

// 指定した奥行きでカメラに見えている高さ(ワールド単位)
export const viewHeightAt = (distance) => 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * distance;

// 折り終わった板の横幅の目標(px)。詳細ページのメインビジュアルとコンテンツ列も
// 同じ幅になる。画面が足りないときは下の PLANE_FIT の余白ルールで縮む
export const PLATE_WIDTH = 1440;
const scaleForFoldedWidth = (width, stageHeight, aspect) => {
  const height = (width * PLANE_HEIGHT) / aspect;
  const unit = viewHeightAt(1);

  return (height * unit * CAMERA_Z) / (PLANE_HEIGHT * stageHeight + height * unit * FOLD_DEPTH);
};
export const plateScale = (stageWidth, stageHeight, aspect = DEFAULT_ASPECT) => {
  const fit = planeFit(stageWidth);
  const width = Math.min(PLATE_WIDTH, stageWidth * fit, ((stageHeight * fit) / PLANE_HEIGHT) * aspect);

  return scaleForFoldedWidth(width, stageHeight, aspect);
};

// 折り終わり(progress = 1)の板がステージ内で占める大きさ(px)。
// 折り終わった板は FOLD_DEPTH ぶんカメラ側へ出るので、その分だけ大きく映る
export const foldedPlateSize = (stageWidth, stageHeight, aspect = DEFAULT_ASPECT) => {
  const scale = plateScale(stageWidth, stageHeight, aspect);
  const view = viewHeightAt(CAMERA_Z - FOLD_DEPTH * scale);
  const height = ((PLANE_HEIGHT * scale) / view) * stageHeight;

  return { width: (height * aspect) / PLANE_HEIGHT, height };
};
