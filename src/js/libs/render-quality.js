// 各 sketch の描画バッファの品質。モバイルとデスクトップで段階を切る。
//
// モバイルは塗り面積(フィルレート)とメモリ帯域が律速になる。
// pixelRatio は縦横どちらにも掛かるのでピクセル数には2乗で効き、
// 2 → 1.5 で塗る量が約半分(4.0倍 → 2.25倍)になる。
// DPR3 の端末では元から 2 に丸めて等倍表示を諦めているので、
// 1.5 まで落としても高密度パネル上での見た目の劣化は小さい。
//
// antialias(MSAA)はサンプル数ぶんのカラーバッファと解決パスを増やすため、
// モバイルでは切る。コンテキスト生成時の属性なので、あとから変更はできない。

// hero-holo が使っていた閾値を踏襲する
const MOBILE_QUERY = "(max-width: 767px)";

export const isMobileViewport = () => window.matchMedia(MOBILE_QUERY).matches;

// renderer の生成時に読む。pixelRatio は端末の devicePixelRatio との
// 小さいほうを採るための上限値として使う(低 DPR 端末で引き上げないため)。
export const rendererQuality = () =>
  isMobileViewport() ? { pixelRatio: 1.5, antialias: false } : { pixelRatio: 2, antialias: true };
