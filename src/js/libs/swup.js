import SwupBodyClassPlugin from '@swup/body-class-plugin';
import SwupHeadPlugin from '@swup/head-plugin';
import SwupScriptsPlugin from '@swup/scripts-plugin';
import Swup from 'swup';
import { sendPageView } from './analytics.js';

let onPageInit = () => {};
let onInitial = () => Promise.resolve();
let onLeave = () => Promise.resolve();
let onEnter = () => Promise.resolve();

export const registerPageInit = (fn) => {
  onPageInit = fn;
};

export const registerPageTransition = ({ initial, leave, enter } = {}) => {
  if (initial) {
    onInitial = initial;
  }
  if (leave) {
    onLeave = leave;
  }
  if (enter) {
    onEnter = enter;
  }
};

export const initSwup = () => {
  const swup = new Swup({
    containers: ['#swup'],
    // CSSアニメーション検出を無効化(アニメーションは下のフックでGSAPが制御する)
    animationSelector: false,
    // head-plugin: title/meta/ページ固有CSSの差し替え
    // body-class-plugin: ページごとに変わる body のクラスを遷移時に差し替える
    // scripts-plugin: Astroのアイランド(client:*)等、遷移後の新DOM内スクリプトを再実行
    plugins: [
      new SwupHeadPlugin(),
      new SwupBodyClassPlugin(),
      new SwupScriptsPlugin(),
    ],
  });

  // 初期化の時の処理
  onPageInit();
  sendPageView();
  onInitial();

  // 遷移前(古いページを退場)
  swup.hooks.replace('animation:out:await', async (visit) => {
    await onLeave(visit);
  });

  // 遷移後(新しいページを入場)
  swup.hooks.replace('animation:in:await', async (visit) => {
    await onEnter(visit);
  });

  swup.hooks.on('page:view', () => {
    onPageInit();
    sendPageView();
  });

  return swup;
};
