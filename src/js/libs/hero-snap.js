import gsap from "gsap";
import { getLenis } from "./lenis.js";

// MV → Animation の切り替えをスクロール量に追従させず、
// ひとスクロールで一気に切り替える(スナップ)。
// 重なり区間(CSS)と opacity の駆動(section-crossfade.js)はそのままに、
// 区間の途中で止まれないよう、スクロールが区間に入った瞬間に
// Lenis で終端まで運ぶ。運んでいる間にスクロール連動のクロスフェードが
// 再生されるので、体感は「ひとスクロール = ワンショットのフェード」になる。

let tick = null;
// アンカースクロール中など、外から一時的にスナップを黙らせるためのフラグ。
// 黙らせないと Animation を通り過ぎる搬送(例: MV → Projects)を横取りしてしまう
let suspended = false;
// 現在のスクロール位置から状態を取り直す関数(init 内で差し込む)
let resync = null;

export const suspendHeroSnap = () => {
  suspended = true;
};

export const resumeHeroSnap = () => {
  suspended = false;
  // 黙らせている間にスクロール位置が変わっているので状態を取り直す
  resync?.();
};

export const destroyHeroSnap = () => {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }
  suspended = false;
  resync = null;
};

export const initHeroSnap = () => {
  // Swup 遷移では前ページの ticker が残っているので必ず先に外す
  destroyHeroSnap();

  // スナップが要るのはクロスフェードの重なり区間があるとき(=WebGL 表示)だけ
  const hero = document.querySelector(".js-hero");
  const animation = document.querySelector(".js-animation-slider.is-webgl");
  if (!hero || !animation) {
    return;
  }

  const lenis = getLenis();
  if (!lenis) {
    return;
  }

  // 判定のゆらぎ(小数 px)でスナップが往復しないよう数 px の余白を持つ
  const EPS = 4;

  // "mv"(MV に静止) / "slider"(Animation 以降を自由スクロール) / "snapping"(運搬中)
  // スクロール復元やアンカー着地で区間の途中にいる場合は、近いほうへ寄る状態を選ぶ
  // ("mv" は下へ、"slider" は上へスナップする)
  const resolveState = () => {
    const top = animation.getBoundingClientRect().top;
    const vh = window.innerHeight;
    if (top <= EPS) {
      return "slider";
    }
    if (top >= vh - EPS) {
      return "mv";
    }
    return top <= vh / 2 ? "mv" : "slider";
  };

  let state = resolveState();

  // "mv" | "slider" — 運搬中の目的地
  let snapDest = null;

  const snapTo = (target, dest) => {
    state = "snapping";
    snapDest = dest;
    // 運搬中はユーザーのスクロールを受け付けない(途中で止まれなくする)。
    // 着地判定は onComplete ではなく update() の位置チェックで行う。
    // Lenis の scrollTo は「既に同じ目的地へ向かっている」と何もせず
    // 即 onComplete を呼ぶため、それを信じると区間の途中で待機状態へ戻り、
    // 逆向きのスナップを誘発してしまう(勢いよく戻ると止まる不具合の原因)
    lenis.scrollTo(target, { lock: true, force: true });
  };

  const update = () => {
    // アンカースクロールの搬送中は一切割り込まない
    if (suspended) {
      return;
    }

    const top = animation.getBoundingClientRect().top;

    if (state === "snapping") {
      const arrived =
        snapDest === "mv" ? top >= window.innerHeight - EPS : top <= EPS;
      if (arrived) {
        state = snapDest;
      } else if (!lenis.isScrolling) {
        // 区間の途中で止まってしまった場合の保険。
        // 近いほうへスナップし直す状態を選んで復帰する("mv" は下へ、"slider" は上へ)
        state = top <= window.innerHeight / 2 ? "mv" : "slider";
      }
      return;
    }

    if (state === "mv") {
      // MV で下へスクロールし始めたら、フェード区間の終端(Animation 先頭)まで運ぶ
      if (top < window.innerHeight - EPS) {
        snapTo(animation, "slider");
      }
    } else if (top > EPS) {
      // スライダー先頭から上へ抜けたら MV まで戻す
      snapTo(0, "mv");
    }
  };

  resync = () => {
    state = resolveState();
    snapDest = null;
  };

  // Lenis や各 sketch と同じ gsap.ticker に乗せて同期させる
  tick = update;
  gsap.ticker.add(tick);
};
