// ヘッダーの About から開くオーバーレイの mount を受け持つ。
// オーバーレイもヘッダーも #swup の外にあり遷移をまたいで保持されるため、
// 初回に一度だけ配線すればよい。three/webgpu は重いので初めて開くときに動的に読み込む。

import { getLenis } from "./lenis.js";
import { isWebGL2Available } from "./webgl-support.js";

let sketch = null;
let loading = false;

export const initAboutFold = () => {
  const overlay = document.querySelector(".js-about-overlay");
  const openers = [...document.querySelectorAll(".js-about-open")];
  if (!overlay || openers.length === 0) {
    return;
  }

  const container = overlay.querySelector(".js-about-canvas");
  // WebGPU 非対応環境では WebGL2 バックエンドへ落ちる。その WebGL2 も無い場合と
  // prefers-reduced-motion では、CSS だけのフェード表示にフォールバックする
  let webgl =
    Boolean(container) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && isWebGL2Available();
  if (!webgl) {
    overlay.classList.add("is-plain");
  }

  // フォールバック用の素の開閉。紙は CSS の transition で出し入れする
  const openPlain = () => {
    overlay.classList.add("is-open", "is-landed");
    overlay.setAttribute("aria-hidden", "false");
    getLenis()?.stop();
  };
  const closePlain = () => {
    overlay.classList.remove("is-open", "is-landed");
    overlay.setAttribute("aria-hidden", "true");
    getLenis()?.start();
  };

  const open = async () => {
    if (!webgl) {
      openPlain();
      return;
    }

    // 初回だけ読み込む。読み込み中の連打は無視する(開くのは読み込み完了側)
    if (!sketch) {
      if (loading) {
        return;
      }
      loading = true;
      try {
        const { default: AboutFold } = await import("./about-fold/sketch.js");
        const instance = new AboutFold({ overlay, container });
        await instance.init();
        sketch = instance;
      } catch (error) {
        // WebGPU の初期化に失敗したら以降は素の表示に切り替える
        console.error(error);
        webgl = false;
        overlay.classList.add("is-plain");
        openPlain();
        return;
      } finally {
        loading = false;
      }
    }

    sketch.open();
  };

  const close = () => {
    if (webgl) {
      sketch?.close();
    } else {
      closePlain();
    }
  };

  const isOpen = () => overlay.classList.contains("is-open");

  for (const opener of openers) {
    opener.addEventListener("click", (event) => {
      // href="#" の素のジャンプ(ページ先頭へ)を止める。
      // Swup は preventDefault を見ずに document でクリックを拾うので、
      // Swup 側はリンクの data-no-swup 属性で無視させる
      event.preventDefault();
      open();
    });
  }

  for (const closer of overlay.querySelectorAll(".js-about-close")) {
    closer.addEventListener("click", close);
  }

  // 紙の外(暗幕・canvas)をクリックしたら閉じる
  overlay.addEventListener("click", (event) => {
    if (!event.target.closest(".js-about-paper")) {
      close();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      close();
    }
  });
};
