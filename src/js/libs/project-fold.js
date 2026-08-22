// Projects セクションの WebGPU ステージの mount / dispose を受け持つ。
// three/webgpu は WebGL 版とは別ビルドで重いので、セクションがあるページでだけ動的に読み込む。

import { isWebGL2Available } from "./webgl-support.js";

let instance = null;
// 遷移が読み込みを追い越したときに、古い読み込み結果を捨てるための世代番号
let generation = 0;

export const destroyProjectFold = () => {
  generation += 1;
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initProjectFold = async () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyProjectFold();

  const section = document.querySelector(".js-project-fold");
  if (!section) {
    return;
  }

  const container = section.querySelector(".js-project-canvas");
  const items = [...section.querySelectorAll(".js-project-item")];
  const textures = items.map((item) => item.dataset.texture).filter(Boolean);
  // サムネ未設定の項目が混ざると板とタイトルの枚数がずれるので、その場合は素のリストのまま
  if (!container || items.length === 0 || textures.length !== items.length) {
    return;
  }

  // WebGPU 非対応環境では WebGPURenderer が WebGL2 バックエンドへ落ちる。
  // その WebGL2 も無い場合だけ素のリストにフォールバックする。
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !isWebGL2Available()) {
    return;
  }

  // レイアウト（ステージ化）を先に確定させてから読み込む
  section.classList.add("is-webgl");

  const current = generation;
  const { default: ProjectFold } = await import("./project-fold/sketch.js");
  if (current !== generation || !section.isConnected) {
    return;
  }

  const texts = items.map((item) => item.dataset.text || "");

  try {
    const sketch = new ProjectFold({
      section,
      container,
      items,
      textures,
      texts,
      // 遷移をまたぐために canvas を body 直下へ移したあとは、
      // ページ差し替え時の destroy 対象から外して sketch 自身に後始末を任せる
      release: () => {
        if (instance === sketch) {
          instance = null;
        }
      },
    });
    instance = sketch;
    await sketch.init();
    // init の待ち時間に遷移が起きていたら後始末する
    if (current !== generation) {
      sketch.destroy();
    }
  } catch (error) {
    console.error(error);
    destroyProjectFold();
    section.classList.remove("is-webgl");
  }
};
