// FV の手前で流すイントロ(カードが螺旋を描いて奥へ流れる)の mount / dispose を受け持つ。
// three は重いので、イントロがあるページでだけ動的に読み込む。

import { resetScroll } from "./lenis.js";
import { isWebGL2Available } from "./webgl-support.js";

let instance = null;
// 遷移が読み込みを追い越したときに、古い読み込み結果を捨てるための世代番号
let generation = 0;
// イントロは初回表示の1回だけ。Swup 遷移でトップへ戻ってきたときは再生しない
let hasPlayed = false;

export const destroyHeroIntro = () => {
  generation += 1;
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initHeroIntro = async () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyHeroIntro();

  const overlay = document.querySelector(".js-hero-intro");
  if (!overlay) {
    // イントロが無いページに直接来たときも、隠しているヘッダーはすぐ出す
    document.documentElement.classList.add("is-intro-done");
    return;
  }

  // 再生してもしなくても、FV 側が「イントロ後」の見た目に入るためのフック
  const markDone = () => {
    overlay.classList.add("is-done");
    document.querySelector(".js-hero-holo")?.classList.add("is-intro-done");
    // ヘッダーは #swup の外なので、html に付けてイントロ後に出す
    document.documentElement.classList.add("is-intro-done");
    // FV 側(hero-typography)がイントロ終了を待って自分の演出を始めるための合図
    document.dispatchEvent(new CustomEvent("hero-intro:done"));
  };

  const container = overlay.querySelector(".js-hero-intro-canvas");
  let textures = [];
  try {
    textures = JSON.parse(overlay.dataset.textures ?? "[]");
  } catch {
    textures = [];
  }

  // 非対応・モーション低減・再訪はイントロを流さず、すぐ FV を見せる
  if (
    hasPlayed ||
    !container ||
    textures.length === 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !isWebGL2Available()
  ) {
    markDone();
    return;
  }

  hasPlayed = true;

  // リロードでブラウザがスクロール位置を復元したままだと、イントロが
  // ページ中腹の景色の上で始まってしまう。再生するときは必ず先頭から。
  // (/#animation のようなアンカー付きで来たときはアンカーを尊重する)
  if (!window.location.hash) {
    // ページの高さが確定したあとにブラウザが復元し直すのも止める
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    resetScroll();
  }

  // キャンバスの実寸を先に確定させてから読み込む(display:none のままだと 0 になる)
  overlay.classList.add("is-webgl");

  const current = generation;
  const { default: HeroIntro } = await import("./hero-intro/sketch.js");
  if (current !== generation || !overlay.isConnected) {
    return;
  }

  try {
    const sketch = new HeroIntro({ container, textures });
    instance = sketch;
    await sketch.load();
    // 読み込みの待ち時間に遷移が起きていたら後始末する
    if (current !== generation) {
      sketch.destroy();
      return;
    }

    await sketch.play();
    if (current !== generation) {
      return;
    }

    markDone();
    // CSS のフェードアウト(0.8s)を見届けてから WebGL を片付ける
    setTimeout(() => {
      if (current === generation) {
        destroyHeroIntro();
      }
    }, 1000);
  } catch (error) {
    console.error(error);
    destroyHeroIntro();
    overlay.classList.remove("is-webgl");
    markDone();
  }
};
