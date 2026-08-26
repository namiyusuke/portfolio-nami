// FV のタイポグラフィ(SVG)の init / destroy を受け持つ。
// 初回表示ではイントロ(glitch / grid / typewriter から抽選)を再生し、
// 以後はカーソルに反発するマグネット演出だけが常時動く。
// カード・イントロ(hero-intro)があるページでは、そのフェードアウト
// (hero-intro:done)を待ってから再生する。

const NS = "http://www.w3.org/2000/svg";

const CONFIG = {
  // 読み込みごとにこの中から1つを抽選
  intros: ["glitch", "grid", "type"],
  magnet: { radius: 90, force: 26, damping: 0.82, follow: 0.16 },
  // 描画確定を待つ猶予(ms)
  introDelay: 120,
};

let instance = null;
// イントロは初回表示の1回だけ。Swup 遷移でトップへ戻ってきたときはマグネットだけ動かす
let hasPlayed = false;

export const destroyHeroTypography = () => {
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export const initHeroTypography = () => {
  // Swup 遷移では前ページのインスタンスが残っているので必ず先に破棄する
  destroyHeroTypography();

  const root = document.querySelector(".js-hero-typography");
  if (!root) {
    return;
  }

  const stage = root.querySelector(".js-hero-typography-svg");
  const defs = stage?.querySelector("defs");
  const srcG = stage?.querySelector(".js-hero-typography-src");
  const glyphsG = stage?.querySelector(".js-hero-typography-glyphs");
  const overlayG = stage?.querySelector(".js-hero-typography-overlay");
  if (!stage || !defs || !srcG || !glyphsG || !overlayG) {
    return;
  }

  const W = stage.viewBox.baseVal.width;
  const H = stage.viewBox.baseVal.height;
  const CX = W / 2;
  const CY = H / 2;

  const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const key in attrs) {
      node.setAttribute(key, attrs[key]);
    }
    return node;
  };

  // ---------------------------------------------------------------
  // 元パスを字形単位に分解して glyphs 層へ複製する。
  // M ごとのサブパスを bbox の包含関係でまとめ、カウンター(穴)を親に戻す
  // ---------------------------------------------------------------
  const tmp = el("path");
  tmp.style.visibility = "hidden";
  stage.appendChild(tmp);

  const splitGlyphs = (d) => {
    const subs = d
      .split(/(?=M)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subs.length < 2) {
      return [d];
    }
    const box = subs.map((s) => {
      tmp.setAttribute("d", s);
      return tmp.getBBox();
    });
    const parent = subs.map(() => -1);
    for (let i = 0; i < subs.length; i++) {
      let best = -1;
      let bestArea = Infinity;
      const a = box[i];
      const aA = a.width * a.height;
      for (let j = 0; j < subs.length; j++) {
        if (i === j) continue;
        const b = box[j];
        const bA = b.width * b.height;
        if (bA <= aA || bA >= bestArea) continue;
        if (
          a.x >= b.x - 0.6 &&
          a.y >= b.y - 0.6 &&
          a.x + a.width <= b.x + b.width + 0.6 &&
          a.y + a.height <= b.y + b.height + 0.6
        ) {
          best = j;
          bestArea = bA;
        }
      }
      parent[i] = best;
    }
    const groups = new Map();
    subs.forEach((s, i) => {
      let r = i;
      let guard = 0;
      while (parent[r] >= 0 && guard++ < 12) r = parent[r];
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(s);
    });
    return [...groups.values()].map((a) => a.join(" "));
  };

  const glyphs = [];
  [...srcG.querySelectorAll("path")].forEach((src, li) => {
    const fill = src.getAttribute("fill");
    splitGlyphs(src.getAttribute("d")).forEach((d) => {
      const p = el("path", { d, fill });
      glyphsG.appendChild(p);
      const bb = p.getBBox();
      if (bb.width < 0.4 && bb.height < 0.4) {
        p.remove();
        return;
      }
      p.style.transformBox = "fill-box";
      p.style.transformOrigin = "center";
      glyphs.push({
        p,
        bb,
        li,
        cx: bb.x + bb.width / 2,
        cy: bb.y + bb.height / 2,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
      });
    });
  });
  tmp.remove();

  // 複製が終わったら元パスは隠す(JS 無効時のフォールバック表示を兼ねている)
  srcG.style.display = "none";

  // typewriter の打鍵順(パス順 → 左から右)
  const reading = [...glyphs].sort((a, b) => a.li - b.li || a.cx - b.cx);

  // ---------------------------------------------------------------
  // glitch 用フィルタ / grid 用マスク / typewriter 用キャレット
  // ---------------------------------------------------------------
  const gf = el("filter", {
    id: "hero-typography-glitch",
    x: "-15%",
    y: "-15%",
    width: "130%",
    height: "130%",
  });
  gf.appendChild(
    el("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.012 0.55",
      numOctaves: "1",
      result: "n",
    }),
  );
  const dmap = el("feDisplacementMap", {
    in: "SourceGraphic",
    in2: "n",
    scale: "0",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  gf.appendChild(dmap);
  defs.appendChild(gf);

  const COLS = 14;
  const ROWS = 8;
  const TW = W / COLS;
  const TH = H / ROWS;
  const tiles = [];
  const gridMask = el("mask", {
    id: "hero-typography-grid-mask",
    maskUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: W,
    height: H,
  });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = el("rect", {
        x: c * TW,
        y: r * TH,
        width: TW + 0.5,
        height: TH + 0.5,
        fill: "#fff",
      });
      t.style.transformBox = "fill-box";
      t.style.transformOrigin = "center";
      t.dist = Math.hypot((c + 0.5) * TW - CX, (r + 0.5) * TH - CY);
      gridMask.appendChild(t);
      tiles.push(t);
    }
  }
  defs.appendChild(gridMask);

  const caret = el("rect", { x: 0, y: 0, width: 3, height: 1, fill: "#3C6754" });
  caret.style.display = "none";
  overlayG.appendChild(caret);

  // ---------------------------------------------------------------
  // 破棄まわり。リスナーは AbortController、タイマー・rAF・WAAPI は手で回収する
  // ---------------------------------------------------------------
  const ac = new AbortController();
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  let anims = [];
  let introRaf = null;
  let magnetRaf = null;
  let magnetOn = false;
  let pointer = null;

  const push = (node, frames, opts) => {
    const a = node.animate(frames, Object.assign({ fill: "both" }, opts));
    anims.push(a);
    return a;
  };

  const clearIntro = () => {
    anims.forEach((a) => a.cancel());
    anims = [];
    if (introRaf) {
      cancelAnimationFrame(introRaf);
      introRaf = null;
    }
    glyphsG.removeAttribute("filter");
    glyphsG.removeAttribute("mask");
    dmap.setAttribute("scale", 0);
    tiles.forEach((t) => {
      t.style.cssText = "transform-box:fill-box;transform-origin:center";
    });
    caret.style.display = "none";
    caret.style.transform = "";
    glyphs.forEach((g) => {
      g.p.style.opacity = "";
      g.p.style.transform = "";
    });
  };

  // ---------------------------------------------------------------
  // イントロ3種
  // ---------------------------------------------------------------
  const INTRO = {
    // glitch — カタつきが安定する。フィルターは全体に1つ
    glitch(done) {
      glyphsG.setAttribute("filter", "url(#hero-typography-glitch)");
      const shuffled = [...glyphs].sort(() => Math.random() - 0.5);
      shuffled.forEach((g, k) => {
        push(
          g.p,
          [
            { opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { opacity: 0.35, offset: 0.32 },
            { opacity: 1, offset: 0.45 },
            { opacity: 1 },
          ],
          { duration: 1300, delay: k * 6, easing: "linear" },
        );
      });
      const t0 = performance.now();
      const D = 2000;
      const loop = (t) => {
        const p = Math.min(1, (t - t0) / D);
        dmap.setAttribute("scale", ((1 - p) ** 2.2 * 36 * (0.55 + Math.random() * 0.8)).toFixed(2));
        if (p < 1) {
          introRaf = requestAnimationFrame(loop);
        } else {
          dmap.setAttribute("scale", 0);
          glyphsG.removeAttribute("filter");
          introRaf = null;
          done();
        }
      };
      introRaf = requestAnimationFrame(loop);
    },

    // grid — マスクのタイルが中央から立ち上がる
    grid(done) {
      glyphsG.setAttribute("mask", "url(#hero-typography-grid-mask)");
      // 出現はマスクが担うので、start() が敷いた字形の opacity:0 は外す。
      // 外し忘れると演出中ずっと不可視のまま、終了時にパッと出てしまう
      glyphs.forEach((g) => {
        g.p.style.opacity = "";
      });
      const max = Math.max(...tiles.map((t) => t.dist));
      tiles.forEach((t) => {
        push(
          t,
          [
            { opacity: 0, transform: "scale(.3)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          {
            duration: 420,
            delay: (t.dist / max) * 700 + Math.random() * 160,
            easing: "cubic-bezier(.16,1,.3,1)",
          },
        );
      });
      later(() => {
        glyphsG.removeAttribute("mask");
        done();
      }, 1480);
    },

    // typewriter — 読み順に置かれ、キャレットが追従
    type(done) {
      const step = 9;
      reading.forEach((g, k) => {
        push(
          g.p,
          [
            { opacity: 0, transform: "scale(.86)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 160, delay: k * step, easing: "cubic-bezier(.2,.9,.3,1)" },
        );
      });
      caret.style.display = "";
      const frames = reading.map((g) => ({
        transform: `translate(${(g.bb.x + g.bb.width).toFixed(1)}px, ${(g.bb.y - 2).toFixed(1)}px) scale(1, ${(g.bb.height + 4).toFixed(1)})`,
      }));
      frames.push(Object.assign({}, frames[frames.length - 1], { opacity: 0 }));
      push(caret, frames, { duration: reading.length * step, easing: "linear" });
      later(
        () => {
          caret.style.display = "none";
          done();
        },
        reading.length * step + 240,
      );
    },
  };

  // ---------------------------------------------------------------
  // magnet — イントロ後は常時ON。動きが収まったら rAF を止める
  // ---------------------------------------------------------------
  const M = CONFIG.magnet;

  const magnetFrame = () => {
    let moving = false;
    for (const g of glyphs) {
      let tx = 0;
      let ty = 0;
      if (pointer) {
        const dx = g.cx - pointer.x;
        const dy = g.cy - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < M.radius) {
          const f = (1 - dist / M.radius) * M.force;
          tx = (dx / (dist || 1)) * f;
          ty = (dy / (dist || 1)) * f;
        }
      }
      g.vx = g.vx * M.damping + (tx - g.ox) * M.follow;
      g.vy = g.vy * M.damping + (ty - g.oy) * M.follow;
      g.ox += g.vx;
      g.oy += g.vy;
      if (Math.abs(g.vx) > 0.01 || Math.abs(g.vy) > 0.01 || Math.abs(g.ox) > 0.05 || Math.abs(g.oy) > 0.05) {
        moving = true;
        g.p.style.transform = `translate(${g.ox.toFixed(2)}px, ${g.oy.toFixed(2)}px)`;
      } else if (g.ox || g.oy) {
        g.ox = g.oy = g.vx = g.vy = 0;
        g.p.style.transform = "";
      }
    }
    magnetRaf = moving || pointer ? requestAnimationFrame(magnetFrame) : null;
  };

  const kick = () => {
    if (magnetOn && !magnetRaf) {
      magnetRaf = requestAnimationFrame(magnetFrame);
    }
  };

  stage.addEventListener(
    "pointermove",
    (e) => {
      const r = stage.getBoundingClientRect();
      pointer = {
        x: ((e.clientX - r.left) / r.width) * W,
        y: ((e.clientY - r.top) / r.height) * H,
      };
      kick();
    },
    { signal: ac.signal },
  );
  stage.addEventListener(
    "pointerleave",
    () => {
      pointer = null;
      kick();
    },
    { signal: ac.signal },
  );

  instance = {
    destroy() {
      ac.abort();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      anims.forEach((a) => a.cancel());
      anims = [];
      if (introRaf) cancelAnimationFrame(introRaf);
      if (magnetRaf) cancelAnimationFrame(magnetRaf);
      introRaf = null;
      magnetRaf = null;
    },
  };

  // ---------------------------------------------------------------
  // 起動
  // ---------------------------------------------------------------
  // モーション低減時はイントロもマグネットも動かさず静止表示のまま
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  // 再訪はイントロを飛ばしてマグネットだけ有効にする
  if (hasPlayed) {
    magnetOn = true;
    kick();
    return;
  }
  hasPlayed = true;

  const start = () => {
    glyphs.forEach((g) => {
      g.p.style.opacity = "0";
    });
    const pick = CONFIG.intros[Math.floor(Math.random() * CONFIG.intros.length)];
    // 何が出たかは data 属性で確認できる
    stage.dataset.intro = pick;
    later(() => {
      INTRO[pick](() => {
        clearIntro();
        magnetOn = true;
        kick();
      });
    }, CONFIG.introDelay);
  };

  // カード・イントロのオーバーレイが被っている間は隠して待ち、
  // フェードアウト開始(hero-intro:done)に合わせて再生する
  const cardIntro = document.querySelector(".js-hero-intro");
  if (cardIntro && !cardIntro.classList.contains("is-done")) {
    glyphs.forEach((g) => {
      g.p.style.opacity = "0";
    });
    document.addEventListener("hero-intro:done", start, {
      once: true,
      signal: ac.signal,
    });
  } else {
    start();
  }
};
