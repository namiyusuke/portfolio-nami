import gsap from "gsap";

// MV(Hero) → Animation → Projects のセクション間クロスフェード。
// CSS 側(index.astro)で隣り合うセクションを 100svh ずつ重ねてあり、その区間で
// 手前の要素を 1→0、次のセクションのステージを 0→1 に振る。
// 次のステージはフェード中 translateY でビューポート上端に留めて、
// 下から流れ込む動きを消し「同じ位置」でフェードインさせる。
// セクション上端がビューポート上端に達すると transform が外れ、
// ちょうど通常フローの位置に着地して以降は普通のスクロールに戻る。

let tick = null;
let targets = null;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

export const destroySectionCrossfade = () => {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }

  if (targets) {
    for (const target of targets) {
      target.style.transform = "";
      target.style.opacity = "";
      target.style.visibility = "";
    }
    targets = null;
  }
};

export const initSectionCrossfade = () => {
  // Swup 遷移では前ページの ticker が残っているので必ず先に外す
  destroySectionCrossfade();

  // 重なり(CSS)が生まれるのは Animation が WebGL 表示のときだけ。
  // 素のリスト表示のときは通常スクロールのままにする
  const animation = document.querySelector(".js-animation-slider.is-webgl");
  if (!animation) {
    return;
  }

  const animationStage = animation.querySelector(".js-animation-stage");
  if (!animationStage) {
    return;
  }

  // MV → Animation。タイポグラフィは sticky なので、消えるまで画面に留まっている
  const heroTypography = document.querySelector(".js-hero-holo .js-hero-typography");
  // タイトルは固定しない方針なので opacity だけ合わせる(位置は通常フローのまま)
  const animationTitle = animation.querySelector(".js-animation-title");

  // Animation → Projects。Projects も WebGL 表示のときだけ重なりがある
  const project = document.querySelector(".js-project-fold.is-webgl");
  const projectStage = project?.querySelector(".js-project-stage") ?? null;

  if (!heroTypography && !projectStage) {
    return;
  }

  const update = () => {
    const vh = window.innerHeight;

    // MV → Animation:
    // Animation セクション上端がビューポート下端(vh)から上端(0)に達するまでを 0〜1 に
    let enterFade = 1;
    if (heroTypography) {
      const top = animation.getBoundingClientRect().top;
      enterFade = clamp01(1 - top / vh);

      // フェード区間中だけ Animation ステージをビューポート上端に固定する。
      // 区間が終わると transform が外れ、そのまま sticky(通常フロー)へ着地する
      const pinned = top > 0 && top < vh;
      animationStage.style.transform = pinned ? `translateY(${-top}px)` : "";

      // タイトルはスクロールで流れたまま、透明度だけステージと同じ曲線で上げる
      if (animationTitle) {
        animationTitle.style.opacity = enterFade < 1 ? String(enterFade) : "";
        animationTitle.style.visibility = enterFade === 0 ? "hidden" : "";
      }

      // MV 側は同じ区間で消えていく(sticky で止まったまま薄くなる)
      heroTypography.style.opacity = enterFade > 0 ? String(1 - enterFade) : "";
      heroTypography.style.visibility = enterFade === 1 ? "hidden" : "";
    }

    // Animation → Projects: 同じく Projects セクション上端の位置で 0〜1 に
    let exitFade = 0;
    if (project && projectStage) {
      const top = project.getBoundingClientRect().top;
      exitFade = clamp01(1 - top / vh);

      // フェード区間中だけビューポート上端に固定する
      const pinned = top > 0 && top < vh;
      projectStage.style.transform = pinned ? `translateY(${-top}px)` : "";
      projectStage.style.opacity = exitFade < 1 ? String(exitFade) : "";
      // 透明なあいだはリンクの当たり判定ごと消しておく
      projectStage.style.visibility = exitFade === 0 ? "hidden" : "";
    }

    // Animation ステージは入りで 0→1、抜けで 1→0。
    // 二つの区間は重ならないので min でそのまま合成できる
    const opacity = Math.min(enterFade, 1 - exitFade);
    animationStage.style.opacity = opacity < 1 ? String(opacity) : "";
    animationStage.style.visibility = opacity === 0 ? "hidden" : "";
  };

  targets = [animationStage, animationTitle, projectStage, heroTypography].filter(Boolean);
  // Lenis や各 sketch と同じ gsap.ticker に乗せて同期させる
  tick = update;
  gsap.ticker.add(tick);
};
