import {
  initSwup,
  registerPageInit,
  registerPageTransition,
} from './libs/swup.js';
import { enter, initial, leave } from './libs/transition.js';

registerPageTransition({ initial, leave, enter });
initSwup();

registerPageInit(() => {
  // ページごとに動かす関数はすべてこの中で呼ぶ。
  // Swup遷移後はDOMが差し替わるため、ここに登録しないと2ページ目以降で動かなくなる。
});
