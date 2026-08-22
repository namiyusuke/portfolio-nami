// ページ内で動いているアニメーション(Projects の折りたたみなど)を、
// そのまま Swup の遷移演出として使うための受け渡し。
//
// 登録側は visit を受け取り、その遷移を引き受けるなら
//   { leave: Promise, enter?: () => Promise }
// を、引き受けないなら null を返す関数を渡す。
// leave  … 退場（画面を覆い切るまで）
// enter  … 入場（差し替わった新しいページを見せるまで）
// transition.js の leave()/enter() が引き受け手を探し、居なければ既定のフェードに落ちる。

let handler = null;
// 退場を引き受けた演出の「続き」。enter() で取り出して再生する
let pendingEnter = null;

export const registerPageExit = (fn) => {
  handler = fn;
};

// 自分が登録したものだけ外す(遷移で新旧のインスタンスが入れ替わるため)
export const clearPageExit = (fn) => {
  if (handler === fn) {
    handler = null;
  }
};

export const runPageExit = (visit) => {
  const handled = handler?.(visit) ?? null;
  pendingEnter = handled?.enter ?? null;
  return handled?.leave ?? null;
};

export const runPageEnter = () => {
  const enter = pendingEnter;
  pendingEnter = null;
  return enter?.() ?? null;
};
