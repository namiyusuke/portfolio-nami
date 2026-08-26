// Projects の板(WebGL)が画面に映る位置と大きさ。
//
// 詳細ページのメイン画像を「めくり終わった板」とまったく同じ矩形に置くことで、
// 遷移しても画像が動かない / 大きさも変わらないようにしている。
// そのため sketch.js（板を描く側）と project-hero.js（詳細ページの画像を置く側）は、
// 必ずこのファイルの値・計算を共有する。

// 板は「高さ 1 の単位板」で持ち、横幅はテクスチャの比率(横 / 縦)で決める。
// 比率はプロジェクトごとに違うので、サイズの計算はすべて aspect を受け取る
export const PLANE_HEIGHT = 1;
// テクスチャの比率が分からないときに使う既定の比率
export const DEFAULT_ASPECT = 1.6;
// 板が画面幅・画面高に対して占める最大比率(左右上下の余白を確保する)
export const PLANE_FIT = 0.82;
export const CAMERA_FOV = 70;
export const CAMERA_Z = 1.5;

// 折りたたみの回転軸を板からどれだけ手前に置くか(板の高さに対する比率)。
// 板は平らなときこのぶん奥、折り終わりで同じぶん手前に来るので、この値が
// 「初期の板が折り終わり(= 詳細ページのメイン画像)に対してどれだけ小さく映るか」を決める。
// 小さくするほど初期が大きく映り、折りたたみで手前に迫ってくる量は減る
export const FOLD_DEPTH = PLANE_HEIGHT * 0.3;

// 指定した奥行きでカメラに見えている高さ(ワールド単位)
export const viewHeightAt = (distance) => 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * distance;

// 折り終わった板の横幅の目標(px)。詳細ページのメインビジュアルとコンテンツ列も
// 同じ幅になる。画面が足りないときは下の PLANE_FIT の余白ルールで縮む
export const PLATE_WIDTH = 1440;

// 折り終わりの板が width(px) ちょうどに映る拡大率。foldedPlateSize() の逆算。
//   height = scale / (unit * (CAMERA_Z - FOLD_DEPTH * scale)) * stageHeight
// を scale について解いたもの
const scaleForFoldedWidth = (width, stageHeight, aspect) => {
  const height = (width * PLANE_HEIGHT) / aspect;
  const unit = viewHeightAt(1);

  return (height * unit * CAMERA_Z) / (PLANE_HEIGHT * stageHeight + height * unit * FOLD_DEPTH);
};

// ステージの大きさから板の拡大率を出す。
// 折り終わりが PLATE_WIDTH になるのが基本。ただし左右・上下には
// PLANE_FIT ぶんの余白を必ず残すので、画面が小さいときはそちらが優先される
export const plateScale = (stageWidth, stageHeight, aspect = DEFAULT_ASPECT) => {
  const width = Math.min(PLATE_WIDTH, stageWidth * PLANE_FIT, ((stageHeight * PLANE_FIT) / PLANE_HEIGHT) * aspect);

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
