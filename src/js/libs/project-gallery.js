// 詳細ページの画像ギャラリー(WebGPU ステージ)の mount / dispose を受け持つ。
// three/webgpu は WebGL 版とは別ビルドで重いので、ギャラリーがあるページでだけ動的に読み込む。

import { isWebGL2Available } from "./webgl-support.js";

let instance = null;
// 遷移が読み込みを追い越したときに、古い読み込み結果を捨てるための世代番号
let generation = 0;

export const destroyProjectGallery = () => {
  generation += 1;
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initProjectGallery = async () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyProjectGallery();

  const list = document.querySelector(".js-project-gallery");
  const images = list ? [...list.querySelectorAll(".js-project-gallery-item")] : [];
  if (images.length === 0) {
    return;
  }

  // WebGPU 非対応環境では WebGPURenderer が WebGL2 バックエンドへ落ちる。
  // その WebGL2 も無い場合は素の画像のまま(捲れ演出なし)にする。
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !isWebGL2Available()) {
    return;
  }

  const current = generation;
  const { default: ProjectGallery } = await import("./project-gallery/sketch.js");
  if (current !== generation || !list.isConnected) {
    return;
  }

  try {
    const sketch = new ProjectGallery({
      images,
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
    destroyProjectGallery();
  }
};
