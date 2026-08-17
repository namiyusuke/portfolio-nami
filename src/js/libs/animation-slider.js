// Animation セクションの WebGL スライダーの mount / dispose を受け持つ。
// three は重い（gzip 約170KB）ので、セクションがあるページでだけ動的に読み込む。

import { isWebGL2Available } from "./webgl-support.js";

let instance = null;
// 遷移が読み込みを追い越したときに、古い読み込み結果を捨てるための世代番号
let generation = 0;

export const destroyAnimationSlider = () => {
  generation += 1;
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initAnimationSlider = async () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyAnimationSlider();

  const section = document.querySelector(".js-animation-slider");
  if (!section) {
    return;
  }

  const container = section.querySelector(".js-animation-canvas");
  const items = [...section.querySelectorAll(".js-animation-item")];
  const textures = items.map((item) => item.dataset.texture).filter(Boolean);
  // サムネ未設定の項目が混ざると板とタイトルの枚数がずれるので、その場合は素のリストのまま
  if (!container || items.length === 0 || textures.length !== items.length) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !isWebGL2Available()) {
    return;
  }

  // レイアウト（sticky 化とスクロール長の確保）を先に確定させてから読み込む
  section.classList.add("is-webgl");

  const current = generation;
  const { default: AnimationSlider } = await import("./animation-slider/sketch.js");
  if (current !== generation || !section.isConnected) {
    return;
  }

  try {
    instance = new AnimationSlider({ section, container, items, textures });
  } catch (error) {
    console.error(error);
    section.classList.remove("is-webgl");
  }
};
