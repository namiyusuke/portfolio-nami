// Projects の板(WebGL)が画面に映る位置と大きさ。
//
// 詳細ページのメイン画像を「めくり終わった板」とまったく同じ矩形に置くことで、
// 遷移しても画像が動かない / 大きさも変わらないようにしている。
// そのため sketch.js（板を描く側）と project-hero.js（詳細ページの画像を置く側）は、
// 必ずこのファイルの値・計算を共有する。

export const PLANE_WIDTH = 1.6;
export const PLANE_HEIGHT = 1;
// 板が画面幅・画面高に対して占める最大比率(左右上下の余白を確保する)
export const PLANE_FIT = 0.82;
export const CAMERA_FOV = 70;
export const CAMERA_Z = 1.5;

// 指定した奥行きでカメラに見えている高さ(ワールド単位)
export const viewHeightAt = (distance) => 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * distance;

// ステージの縦横比から板の拡大率を出す
export const plateScale = (aspect) => {
  const view = viewHeightAt(CAMERA_Z);
  return Math.min(
    1,
    (view * aspect * PLANE_FIT) / PLANE_WIDTH,
    (view * PLANE_FIT) / PLANE_HEIGHT,
  );
};

// 折り終わり(progress = 1)の板がステージ内で占める大きさ(px)。
// 折り終わった板は高さの半分ぶんカメラ側へ出るので、その分だけ大きく映る
export const foldedPlateSize = (stageWidth, stageHeight) => {
  const scale = plateScale(stageWidth / stageHeight);
  const view = viewHeightAt(CAMERA_Z - PLANE_HEIGHT * 0.5 * scale);
  const height = ((PLANE_HEIGHT * scale) / view) * stageHeight;

  return { width: (height * PLANE_WIDTH) / PLANE_HEIGHT, height };
};
