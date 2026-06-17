import gsap from 'gsap';

// 初回ロード時のアニメーション(ローディング画面: カウンター + プログレスバー)
export const initial = () =>
  new Promise((resolve) => {
    const counter = document.querySelector('.c-loading__counter');
    const progress = { value: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        document.documentElement.classList.add('is-ready');
        resolve();
      },
    });

    // カウンター 000 → 100
    tl.to(progress, {
      value: 100,
      duration: 1.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        if (counter) {
          counter.textContent = String(Math.floor(progress.value)).padStart(
            3,
            '0'
          );
        }
      },
    });

    // バー 0 → 100% (カウンターと同時進行)
    tl.to(
      '.c-loading__bar-fill',
      {
        scaleX: 1,
        duration: 1.8,
        ease: 'power2.inOut',
      },
      '<'
    );

    // ロード完了後フェードアウト
    tl.to(
      '.c-loading',
      {
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      },
      '+=0.2'
    );
  });

// ページでていく時のアニメーション
export const leave = () =>
  new Promise((resolve) => {
    gsap.to('#swup', {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: resolve,
    });
  });

// ページ入っていく時のアニメーション
export const enter = () =>
  new Promise((resolve) => {
    gsap.fromTo(
      '#swup',
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: resolve,
      }
    );
  });
