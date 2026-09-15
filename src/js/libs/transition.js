import gsap from "gsap";

import { runPageEnter, runPageExit } from "./page-exit.js";

// 初回ロード時のアニメーション(ローディング画面: カウンター + プログレスバー)
// ローディングのマークアップは任意。Layout に .c-loading を置いていない場合は
// 何も再生せずそのまま完了させる(GSAPに存在しないターゲットを渡さない)
export const initial = () => {
  const loading = document.querySelector(".c-loading");

  if (!loading) {
    document.documentElement.classList.add("is-ready");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const counter = loading.querySelector(".c-loading__counter");
    const barFill = loading.querySelector(".c-loading__bar-fill");
    const progress = { value: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        document.documentElement.classList.add("is-ready");
        resolve();
      },
    });

    // カウンター 000 → 100
    tl.to(progress, {
      value: 100,
      duration: 1.8,
      ease: "power2.inOut",
      onUpdate: () => {
        if (counter) {
          counter.textContent = String(Math.floor(progress.value)).padStart(3, "0");
        }
      },
    });

    // バー 0 → 100% (カウンターと同時進行)
    if (barFill) {
      tl.to(
        barFill,
        {
          scaleX: 1,
          duration: 1.8,
          ease: "power2.inOut",
        },
        "<",
      );
    }

    // ロード完了後フェードアウト
    tl.to(
      loading,
      {
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
      },
      "+=0.2",
    );
  });
};

const fadeOut = (duration) =>
  new Promise((resolve) => {
    gsap.to("#swup", {
      opacity: 0,
      duration,
      ease: "power2.in",
      onComplete: resolve,
    });
  });

// ページでていく時のアニメーション。
// Projects の折りたたみのように、ページ側が遷移演出を持っている場合はフェードをかけない。
// 演出が画面に残した要素(めくれた板)がそのまま次のページへの繋ぎになる。
export const leave = async (visit) => {
  const exit = runPageExit(visit);

  if (exit) {
    await exit;
    return;
  }

  await fadeOut(0.4);
};

// ページ入っていく時のアニメーション。
// 退場を引き受けた演出があれば、新しいページをそのまま出したうえで
// その続き(残した板を遷移先の画像に重ねる)を再生する。
export const enter = async () => {
  const reveal = runPageEnter();

  if (reveal) {
    // フェードは挟まない。板が動いている間に中身が出そろう
    gsap.set("#swup", { opacity: 1 });
    await reveal;
    return;
  }

  await new Promise((resolve) => {
    gsap.fromTo(
      "#swup",
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.4,
        ease: "power2.out",
        onComplete: resolve,
      },
    );
  });
};
