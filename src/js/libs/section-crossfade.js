import gsap from "gsap";

// Animation セクション → Projects セクションのクロスフェード。
// CSS 側(index.astro)で両セクションを 100svh 重ねてあり、その区間で
// Animation のステージを 1→0、Projects のステージを 0→1 に振る。
// Projects のステージはフェード中 translateY でビューポート上端に留めて、
// 下から流れ込む動きを消し「同じ位置」でフェードインさせる。
// セクション上端がビューポート上端に達すると transform が外れ、
// ちょうど通常フローの位置に着地して以降は普通のスクロールに戻る。

let tick = null;
let stages = null;

export const destroySectionCrossfade = () => {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }

  if (stages) {
    for (const stage of stages) {
      stage.style.transform = "";
      stage.style.opacity = "";
      stage.style.visibility = "";
    }
    stages = null;
  }
};

export const initSectionCrossfade = () => {
  // Swup 遷移では前ページの ticker が残っているので必ず先に外す
  destroySectionCrossfade();

  // 重なり(CSS)が生まれるのは両方 WebGL 表示のときだけ。
  // 素のリスト表示のときは通常スクロールのままにする
  const animation = document.querySelector(".js-animation-slider.is-webgl");
  const project = document.querySelector(".js-project-fold.is-webgl");
  if (!animation || !project) {
    return;
  }

  const animationStage = animation.querySelector(".js-animation-stage");
  const projectStage = project.querySelector(".js-project-stage");
  if (!animationStage || !projectStage) {
    return;
  }

  const update = () => {
    // transform は stage 側にかけるので、位置はセクションの rect から取る
    const top = project.getBoundingClientRect().top;
    const vh = window.innerHeight;
    // セクション上端がビューポート下端(vh)から上端(0)に達するまでを 0〜1 に
    const fade = Math.min(Math.max(1 - top / vh, 0), 1);

    // フェード区間中だけビューポート上端に固定する
    const pinned = top > 0 && top < vh;
    projectStage.style.transform = pinned ? `translateY(${-top}px)` : "";
    projectStage.style.opacity = fade < 1 ? String(fade) : "";
    // 透明なあいだはリンクの当たり判定ごと消しておく
    projectStage.style.visibility = fade === 0 ? "hidden" : "";

    // Animation 側は同じ区間で消えていく(sticky で止まったまま薄くなる)
    animationStage.style.opacity = fade > 0 ? String(1 - fade) : "";
    animationStage.style.visibility = fade === 1 ? "hidden" : "";
  };

  stages = [animationStage, projectStage];
  // Lenis や各 sketch と同じ gsap.ticker に乗せて同期させる
  tick = update;
  gsap.ticker.add(tick);
};
