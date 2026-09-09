// テキストをカーソルで押しのけるマグネット演出。
// hero-typography.js の SVG 版と同じばね式を、DOM テキストに移したもの。
// .js-text-magnet が付いた要素を文書全体から拾うので、ヘッダーのナビでも
// セクション見出しでも同じ実装で動く。
//
// 効きは要素ごとに data 属性で調整する:
//   data-magnet-radius="180"  反応する半径(px)
//   data-magnet-force="28"    ポインタ直下での最大押しのけ量(px)

const CONFIG = {
  // 座標は viewBox ではなく px。既定値は 16px 前後のナビ用
  radius: 56,
  force: 9,
  damping: 0.82,
  follow: 0.16,
};

let instance = null;

export const destroyTextMagnet = () => {
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initTextMagnet = () => {
  // Swup 遷移では前ページの要素を掴んだままなので、必ず作り直す
  destroyTextMagnet();

  // モーション低減時は何もしない(分解もしない)
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  // タッチ主体の端末では pointermove がタップ時しか来ず、押しのけたまま固まる
  if (!window.matchMedia("(hover: hover)").matches) {
    return;
  }

  // ---------------------------------------------------------------
  // 対象要素を1文字ずつの span へ分解してグループにまとめる。
  // 読み上げが1文字ずつにならないよう、テキストは aria-label に移す
  // ---------------------------------------------------------------
  const groups = [];
  document.querySelectorAll(".js-text-magnet").forEach((el) => {
    const chars = [];
    if (el.dataset.magnet === "split") {
      // ヘッダーや About は #swup の外で生き続けるので、分解済みなら再利用する
      el.querySelectorAll(".c-magnet__char").forEach((node) => {
        chars.push({ el: node, rx: 0, ry: 0, ox: 0, oy: 0, vx: 0, vy: 0 });
      });
    } else {
      const text = el.textContent.trim();
      // 入れ子のある要素は分解すると中身を壊すので触らない
      if (!text || el.children.length) {
        return;
      }
      el.setAttribute("aria-label", text);
      el.textContent = "";
      for (const ch of text) {
        const node = document.createElement("span");
        node.className = "c-magnet__char";
        node.setAttribute("aria-hidden", "true");
        // 語中の空白は CSS の white-space: pre で潰れないようにしてある
        node.textContent = ch;
        el.appendChild(node);
        chars.push({ el: node, rx: 0, ry: 0, ox: 0, oy: 0, vx: 0, vy: 0 });
      }
      el.dataset.magnet = "split";
    }
    if (!chars.length) {
      return;
    }
    groups.push({
      el,
      chars,
      radius: Number(el.dataset.magnetRadius) || CONFIG.radius,
      force: Number(el.dataset.magnetForce) || CONFIG.force,
      // el の矩形と、その中で実際に文字が占める矩形(inset)。measure で埋める
      box: null,
      inset: null,
      active: false,
    });
  });

  if (!groups.length) {
    return;
  }

  // ---------------------------------------------------------------
  // 計測。要素の矩形は毎フレーム読み直すが(スクロール・sticky・オーバーレイ
  // 開閉で動く)、その中での文字の位置は resize とフォント差し替えでしか
  // 変わらないので、矩形からの相対値にして使い回す
  // ---------------------------------------------------------------
  const isVisible = (el) => el.checkVisibility?.({ visibilityProperty: true }) ?? true;

  const measureBoxes = () => {
    for (const g of groups) {
      const r = g.el.getBoundingClientRect();
      g.box = r.width > 0 && r.height > 0 && isVisible(g.el) ? r : null;
    }
  };

  const measureLayout = () => {
    for (const g of groups) {
      const box = g.el.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) {
        g.inset = null;
        continue;
      }
      let l = Infinity;
      let t = Infinity;
      let r = -Infinity;
      let b = -Infinity;
      for (const c of g.chars) {
        const cr = c.el.getBoundingClientRect();
        // 押しのけ中に測っても静止位置が出るよう、現在のオフセットを引く
        const x = cr.left - box.left - c.ox;
        const y = cr.top - box.top - c.oy;
        c.rx = x + cr.width / 2;
        c.ry = y + cr.height / 2;
        l = Math.min(l, x);
        t = Math.min(t, y);
        r = Math.max(r, x + cr.width);
        b = Math.max(b, y + cr.height);
      }
      // 見出しは block なので el の矩形は行幅いっぱいある。
      // 判定は文字が実際に載っている範囲だけに絞る
      g.inset = { l, t, r, b };
    }
    measureBoxes();
  };

  // 文字の矩形から radius ぶん外まではカーソルを追う
  const nearGroup = (g, x, y) =>
    !!g.box &&
    !!g.inset &&
    x > g.box.left + g.inset.l - g.radius &&
    x < g.box.left + g.inset.r + g.radius &&
    y > g.box.top + g.inset.t - g.radius &&
    y < g.box.top + g.inset.b + g.radius;

  // ---------------------------------------------------------------
  // magnet — 動きが収まったら rAF を止める
  // ---------------------------------------------------------------
  const ac = new AbortController();
  let pointer = null;
  let raf = null;
  // スクロール中は矩形を読まずに印だけ付け、必要になった時点で測り直す
  let boxesDirty = false;

  const setActive = (g, active) => {
    if (g.active === active) {
      return;
    }
    g.active = active;
    // 合成レイヤーは効いているグループの間だけ持たせる
    g.el.classList.toggle("is-magnet-active", active);
  };

  const frame = () => {
    measureBoxes();
    boxesDirty = false;
    let moving = false;
    for (const g of groups) {
      const near = !!pointer && nearGroup(g, pointer.x, pointer.y);
      for (const c of g.chars) {
        let tx = 0;
        let ty = 0;
        if (near) {
          const dx = g.box.left + c.rx - pointer.x;
          const dy = g.box.top + c.ry - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < g.radius) {
            const f = (1 - dist / g.radius) * g.force;
            tx = (dx / (dist || 1)) * f;
            ty = (dy / (dist || 1)) * f;
          }
        }
        c.vx = c.vx * CONFIG.damping + (tx - c.ox) * CONFIG.follow;
        c.vy = c.vy * CONFIG.damping + (ty - c.oy) * CONFIG.follow;
        c.ox += c.vx;
        c.oy += c.vy;
        if (Math.abs(c.vx) > 0.01 || Math.abs(c.vy) > 0.01 || Math.abs(c.ox) > 0.05 || Math.abs(c.oy) > 0.05) {
          moving = true;
          c.el.style.transform = `translate(${c.ox.toFixed(2)}px, ${c.oy.toFixed(2)}px)`;
        } else if (c.ox || c.oy) {
          c.ox = c.oy = c.vx = c.vy = 0;
          c.el.style.transform = "";
        }
      }
      setActive(g, near);
    }
    raf = moving || pointer ? requestAnimationFrame(frame) : null;
  };

  const kick = () => {
    if (!raf) {
      raf = requestAnimationFrame(frame);
    }
  };

  // 要素の外も含めて追うので、対象ではなく document で拾う
  document.addEventListener(
    "pointermove",
    (e) => {
      if (boxesDirty) {
        measureBoxes();
        boxesDirty = false;
      }
      const near = groups.some((g) => nearGroup(g, e.clientX, e.clientY));
      if (!near) {
        // どのグループの圏内でもなくなったら pointer を捨てる。
        // あとは減衰で原点に戻り、収まったところで rAF が止まる
        if (pointer) {
          pointer = null;
          kick();
        }
        return;
      }
      pointer = { x: e.clientX, y: e.clientY };
      kick();
    },
    { signal: ac.signal },
  );

  document.addEventListener(
    "pointerleave",
    () => {
      pointer = null;
      kick();
    },
    { signal: ac.signal },
  );

  // スクロールでは印だけ。実測は次の pointermove か rAF に任せる
  window.addEventListener(
    "scroll",
    () => {
      boxesDirty = true;
    },
    { passive: true, signal: ac.signal },
  );
  window.addEventListener("resize", measureLayout, { signal: ac.signal });

  measureLayout();
  // ウェブフォントが載ると字幅が変わるので測り直す
  document.fonts?.ready.then(measureLayout);

  instance = {
    destroy() {
      ac.abort();
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = null;
      for (const g of groups) {
        setActive(g, false);
        g.chars.forEach((c) => {
          c.el.style.transform = "";
        });
      }
    },
  };
};
