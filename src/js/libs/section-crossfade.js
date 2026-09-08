import gsap from "gsap";

// MV(Hero) → Animation → Projects のセクション間クロスフェード。
// CSS 側(index.astro)で隣り合うセクションを 100svh ずつ重ねてあり、その区間で
// 手前の要素を 1→0、次のセクションのステージを 0→1 に振る。
// 位置には触らない(固定しない)ので、次のセクションは通常のスクロールで
// 下から流れ込みながらフェードインする。

let tick = null;
let targets = null;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// セクション上端(top)の位置をフェードの 0〜1 に直す。
// ステージは CSS 側で 100svh 固定なので、スマホで URL バーが隠れている間は
// 画面の高さ(window.innerHeight = 100lvh)より 60〜100px ぶん低い。
// つまり上端が 0 に届く前に「ステージが画面に収まりきった」状態になるため、
// 終点を 0 にしたままだと背面のセクションが数%残って透けて見える。
// ステージの下端が画面下端に届く位置を終点にして、そこで振り切らせる
// (デスクトップは vh === stageHeight なので終点 0 = 従来どおり)
const fadeProgress = (top, vh, stageHeight) => {
  const end = Math.max(vh - stageHeight, 0);
  const span = vh - end;
  return span > 0 ? clamp01((vh - top) / span) : 1;
};

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
  const heroTypography = document.querySelector(".js-hero .js-hero-typography");

  // Animation → Projects。Projects も WebGL 表示のときだけ重なりがある
  const project = document.querySelector(".js-project-fold.is-webgl");
  const projectStage = project?.querySelector(".js-project-stage") ?? null;

  if (!heroTypography && !projectStage) {
    return;
  }

  const update = () => {
    const vh = window.innerHeight;

    // MV → Animation:
    // Animation セクション上端がビューポート下端(vh)から、
    // ステージが画面に収まりきる位置に達するまでを 0〜1 に
    let enterFade = 1;
    if (heroTypography) {
      const top = animation.getBoundingClientRect().top;
      enterFade = fadeProgress(top, vh, animationStage.getBoundingClientRect().height);

      // タイトルはステージの中(sticky)にあるので、opacity はステージごと下で振る

      // MV 側は同じ区間で消えていく(sticky で止まったまま薄くなる)
      heroTypography.style.opacity = enterFade > 0 ? String(1 - enterFade) : "";
      heroTypography.style.visibility = enterFade === 1 ? "hidden" : "";
    }

    // Animation → Projects: 同じく Projects セクション上端の位置で 0〜1 に
    let exitFade = 0;
    if (project && projectStage) {
      const top = project.getBoundingClientRect().top;
      exitFade = fadeProgress(top, vh, projectStage.getBoundingClientRect().height);

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

  targets = [animationStage, projectStage, heroTypography].filter(Boolean);
  // Lenis や各 sketch と同じ gsap.ticker に乗せて同期させる
  tick = update;
  gsap.ticker.add(tick);
};
