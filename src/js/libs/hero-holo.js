// FV のホログラム表示の mount / dispose を受け持つ。
// three 本体とローダー(GLTF / DRACO)はここでだけ要るので、FV があるページで動的に読み込む。

import { isWebGL2Available } from "./webgl-support.js";

let instance = null;
// 遷移が読み込みを追い越したときに、古い読み込み結果を捨てるための世代番号
let generation = 0;

export const destroyHeroHolo = () => {
  generation += 1;
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initHeroHolo = async () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyHeroHolo();

  const section = document.querySelector(".js-hero-holo");
  if (!section) {
    return;
  }

  const container = section.querySelector(".js-hero-canvas");
  if (!container) {
    return;
  }

  // 非対応・モーション低減の場合は素の FV(背景のみ)のままにして、
  // モデルもデコーダも一切取りに行かない
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !isWebGL2Available()) {
    return;
  }

  // キャンバスの実寸を先に確定させてから読み込む(display:none のままだと 0 になる)
  section.classList.add("is-webgl");

  const current = generation;
  const { default: HeroHolo } = await import("./hero-holo/sketch.js");
  if (current !== generation || !section.isConnected) {
    return;
  }

  try {
    const sketch = new HeroHolo({ section, container });
    instance = sketch;
    await sketch.init();
    // init の待ち時間に遷移が起きていたら後始末する
    if (current !== generation) {
      sketch.destroy();
    }
  } catch (error) {
    console.error(error);
    destroyHeroHolo();
    section.classList.remove("is-webgl");
  }
};
