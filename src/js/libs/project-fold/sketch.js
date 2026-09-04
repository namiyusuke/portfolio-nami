import gsap from "gsap";
import {
  cos,
  cross,
  dot,
  float,
  Fn,
  frontFacing,
  mix,
  normalize,
  positionLocal,
  pow,
  rotate,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";

import { getLenis } from "../lenis.js";
import { clearPageExit, registerPageExit } from "../page-exit.js";
import { handoffProjectHero, HERO_HANDOFF_CLASS } from "../project-hero.js";
import { rendererQuality } from "../render-quality.js";
import { getSwup } from "../swup.js";
// 板のサイズ・カメラ設定は詳細ページの画像配置と共有する(遷移で画像を動かさないため)
import { CAMERA_FOV, CAMERA_Z, DEFAULT_ASPECT, FOLD_DEPTH, PLANE_HEIGHT, plateScale } from "./plate-metrics.js";

const BG_Z = -2; // 背景テキスト板の奥行き
// マーキーは上下中央の1行だけ。行の高さは表示範囲の高さに対する比率で決める
const BG_ROW_HEIGHT = 1 / 6;
const TEXT_SPEED = 0.05;
const TEXT_OPACITY = 0.35;

// ホバーで板を軽く動かす量。すべて「高さ 1 の単位板」基準
const HOVER_RADIUS = 0.62; // ポインタの効き幅(これより遠い頂点は動かない)
const HOVER_LIFT = 0.15; // ポインタの真下が手前へ出る量
const HOVER_PULL = 0.5; // まわりの頂点をポインタ側へ引き寄せる量
const HOVER_EASE = 8; // ホバーの追従の速さ(1秒あたり。大きいほど機敏)

const SWAP_HOLD = 2.6; // 次のプロジェクトへ切り替わるまでの待ち時間(秒)
const SWAP_FADE = 1.2; // 背景テキストと DOM タイトルのクロスフェードにかける時間(秒)
const EXIT_DURATION = 1.2; // 今の板がめくれを巻き上げながら真上へ抜けていく時間(秒)
const ENTER_DURATION = 1.8; // 次の板が真下から昇ってくる時間(秒)。デモの1サイクルは3秒
const ENTER_DELAY = 0.2; // 退場が始まってから次の板が入り始めるまでの間(秒)

// 入退場のめくれ(hero-intro の vertex.glsl の自動再生と同じ動き)。
// デモは p を等速で回し、uFlip = p / uAngle = p×0.25 / uBend = sin(pπ)×0.35 で駆動している
const FLIP_AXIS = [1.6, 1.0, 0.5]; // めくれ本体の斜め回転軸
const FLIP_SPIN = 0.65; // スピン量。uAngle×π×4 に uAngle = p×0.25 を入れた値(約半回転)
const FLIP_BEND = 0.125; // 湾曲の強さ。デモの uBend 最大 0.35 を板の高さ(3.2 → 1)に換算
const OFFSCREEN_MARGIN = 1.1; // 板を画面外に置くときの余裕(1 = 画面端ぴったり)
const FOLD_DURATION = 2.4; // 折りたたみ / 展開にかける時間(秒)

// 遷移演出（折りたたみの続き）
// 背景の流れる文字を消す時間(秒)。DOM 側のタイトル(.p-project__list / __title)は
// index.astro の .is-folded で同じ長さのフェードを掛けているので、値を揃えること
const TEXT_FADE_DURATION = 0.6;
const ALIGN_DURATION = 0.6; // ステージをビューポートに揃えるスクロールの時間(秒)
const LAND_FALLBACK = 4000; // 入場側が呼ばれなかったときに板を片付けるまで(ms)

// tsl-easings を足さずに済むよう、使う2本だけ TSL で持つ
const easeOutQuad = (x) => x.oneMinus().pow(2).oneMinus();
const easeInOutCubic = (x) => mix(x.pow(3).mul(4), float(1).sub(x.mul(-2).add(2).pow(3).div(2)), step(0.5, x));

// テキストを横一列に敷き詰めた帯を作る。
// キャンバス幅を「1文字送り(step)の整数倍」にしておくと、RepeatWrapping で
// 右端と左端がぴったり繋がるので、UV をずらすだけで無限ループのマーキーになる
const makeTextTexture = (text, { height = 256, fontSize = 170, gap = 140 } = {}) => {
  const ctx = document.createElement("canvas").getContext("2d");
  const font = `700 ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.font = font;
  const advance = Math.ceil(ctx.measureText(text).width + gap);
  const count = Math.max(1, Math.round(2048 / advance));

  const canvas = ctx.canvas;
  canvas.width = advance * count;
  canvas.height = height;
  ctx.font = font; // canvas のリサイズで 2D コンテキストの状態はリセットされる
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < count; i++) {
    ctx.fillText(text, i * advance, height / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.aspect = canvas.width / canvas.height; // 板に貼るときの歪み補正に使う
  return tex;
};

// Projects セクションの WebGPU ステージ。
// プロジェクトは一定間隔で入れ替わりながら巡回する。今の板が hero-intro と同じ
// めくれ(スピン + 斜め軸のフリップ + 垂れ下がり)を巻き上げながら真上へ抜けていき、
// 次の板が真下から同じめくれをほどきながら中央へ昇ってくる。
// 板(またはタイトルのリンク)をクリックすると折りたたみが始まり、
// めくれた板を画面に残したまま中身が詳細ページに差し替わる → その板が
// 詳細ページのメイン画像の位置へ収まって実物と入れ替わる、という流れで遷移する。
export default class ProjectFold {
  constructor({ section, container, items, textures, texts, aspects, release }) {
    this.section = section;
    this.container = container;
    this.items = items;
    this.texts = texts;
    this.urls = textures;
    // 板の形はテクスチャの比率そのまま。取れなかったものだけ既定値で埋める
    this.aspects = textures.map((_, index) => {
      const aspect = Number(aspects?.[index]);
      return aspect > 0 ? aspect : DEFAULT_ASPECT;
    });
    this.release = release;
    this.disposed = false;
    this.current = 0;
    // 板に今貼られているテクスチャの番号。入れ替え中だけ current より先に進む
    this.plateIndex = 0;
    this.folded = false;
    this.leaving = false;
    // canvas を body 直下へ移して、遷移をまたいで見せている間 true
    this.detached = false;
    this.exitTweens = [];
    this.exitResolvers = [];
    this.time = 0;
    // 入れ替えの timeline が走っている間 true(GUI の「今すぐ入れ替え」の二重起動よけ)
    this.swapping = false;
    // GUI から触る時間まわりの調整値。playSwap が毎回読むので次のサイクルから効く
    this.params = {
      hold: SWAP_HOLD,
      fade: SWAP_FADE,
      exitDuration: EXIT_DURATION,
      enterDuration: ENTER_DURATION,
      enterDelay: ENTER_DELAY,
    };
    // ホバーの狙い値。uniform 側はこれをフレームごとに追いかける
    this.hoverUv = new THREE.Vector2(0.5, 0.5);
    this.hoverTarget = 0;

    this.uniforms = {
      time: uniform(0),
      progress: uniform(0), // 0 = 平ら / 1 = 折りたたみ完了
      texMix: uniform(0), // 0 = current / 1 = next(背景テキストと DOM タイトルの入れ替えに使う)
      plateAspect: uniform(DEFAULT_ASPECT), // 今の板の比率
      leave: uniform(0), // 退場のめくれの進行度(0 = 中央で平ら / 1 = めくれて抜けた)
      enter: uniform(0), // 入場のめくれの進行度(1 = めくれて回っている / 0 = 着地)
      textRepeat: uniform(new THREE.Vector2(1, 1)), // 背景テキストの横タイル数(x=current, y=next)
      textSpeed: uniform(TEXT_SPEED),
      textOpacity: uniform(TEXT_OPACITY),
      hoverUv: uniform(new THREE.Vector2(0.5, 0.5)), // ホバー中の位置(板の UV)
      hoverStrength: uniform(0), // 0 = 触っていない / 1 = ホバー中
      // 入退場のめくれの見た目。GUI から実行中に触れるよう uniform で持つ
      flipSpin: uniform(FLIP_SPIN),
      flipBend: uniform(FLIP_BEND),
      flipAxis: uniform(new THREE.Vector3(...FLIP_AXIS)),
    };
  }

  // WebGPU のデバイス取得は非同期なので constructor から分離する
  async init() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    const quality = rendererQuality();
    this.renderer = new THREE.WebGPURenderer({ antialias: quality.antialias, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.setSize(this.width, this.height);
    // ステージの背景色は CSS 側で敷くので塗り潰さない
    this.renderer.setClearAlpha(0);

    await this.renderer.init();
    // init を待っている間に destroy されていたら（renderer は destroy 側で始末済み）何も足さない
    if (this.disposed) {
      return;
    }

    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, this.width / this.height, 0.01, 100);
    this.camera.position.set(0, 0, CAMERA_Z);

    this.loader = new THREE.TextureLoader();
    // テクスチャは Sanity の CDN から読むので CORS 必須。
    // Sanity 側の CORS origins にこのサイトのオリジンが無いと 403 になる。
    this.loader.setCrossOrigin("anonymous");
    this.textures = this.urls.map((url) => {
      const tex = this.loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
    this.bgTextures = this.texts.map((text) => makeTextTexture(text));

    this.addBackground();
    this.addObjects();
    this.applyTextures();
    this.resize();
    this.syncItems();

    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize);
    this.setupPointer();
    this.scheduleSwap();
    this.setupGui();

    // 詳細ページへの遷移は、この板の折りたたみを退場演出として使う
    this.pageExit = this.handlePageExit.bind(this);
    registerPageExit(this.pageExit);

    // Lenis と同じ gsap.ticker に乗せて描画ループを1本化する
    this.tick = this.render.bind(this);
    gsap.ticker.add(this.tick);
  }

  addObjects() {
    const { progress, plateAspect, hoverUv, hoverStrength, leave, enter, flipSpin, flipBend, flipAxis } = this.uniforms;
    // 巡回のたびに value を差し替えるので、ノードの実体を持っておく
    this.plateTex = texture(this.textures[0]);
    this.exitTex = texture(this.textures[0]);

    // 裏面は鏡像になるので、回転軸(X)に対応する v を反転して向きを揃える
    const faceUv = () => frontFacing.select(uv(), vec2(uv().x, uv().y.oneMinus()));

    // 入退場のめくれ(hero-intro の vertex.glsl の移植)。t = 0 で平ら、1 でめくれ切った状態。
    // 任意軸の回転はロドリゲスの回転公式: v' = v c + (k×v) s + k (k·v)(1 - c)。
    // 元の GLSL は行列の並びの都合で逆回転になっているので、角度を負にして向きを揃える
    const rotateAround = (p, axis, angle) => {
      const k = normalize(axis);
      const s = sin(angle.negate());
      const c = cos(angle.negate());
      return p
        .mul(c)
        .add(cross(k, p).mul(s))
        .add(k.mul(dot(k, p).mul(c.oneMinus())));
    };
    const flipDeform = (pos, t) => {
      // 両方の edge に uv.x を混ぜることで、左端から右端へ時間差でめくれる
      const flipProgress = smoothstep(uv().x.mul(0.4), uv().x.mul(0.2).add(0.8), t);
      const spin = t.mul(flipSpin);
      // Z 軸まわり = 画面内でのスピン
      pos.assign(rotateAround(pos, vec3(0, 0, 1), spin));
      // 斜め軸まわり = めくれ本体(最大 180°) + 上と同じスピン量を合成
      pos.assign(rotateAround(pos, flipAxis, flipProgress.mul(Math.PI).add(spin)));
      // 上辺 0 → 下辺 -1 の垂れ下がり。回転「後」に足すので、板の向きに関係なく奥行き方向へ反る。
      // 強さはデモと同じ sin(t×π) の釣鐘型 = めくれの途中で最も反り、両端では平ら
      const sag = uv().y.negate().mul(uv().y.sub(2)).sub(1); // quadraticOut(uv.y) - 1
      pos.z.addAssign(sag.mul(sin(t.mul(Math.PI)).mul(flipBend)).mul(6));
    };

    // 板の形はテクスチャの比率そのものなので、UV はそのまま貼れば切り取りなしで収まる
    this.material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    this.material.colorNode = Fn(() => this.plateTex.sample(faceUv()))();

    this.material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();

      // ホバー: ポインタが重なっているところを軽く手前へ持ち上げ、
      // まわりの頂点をそこへ引き寄せる(布を指で摘まみ上げるイメージ)。
      // 板は横に伸びているので、距離だけは比率で補正して効き幅を真円にする。
      // ずらす量そのものは UV の差をそのまま使う(= 見た目の変位が縦横で揃う)
      const delta = uv().sub(hoverUv);
      const dist = delta.mul(vec2(plateAspect.div(PLANE_HEIGHT), 1)).length();
      // 中心 1 → 効き幅の外 0。二乗して中心付近だけ強く出す
      const falloff = smoothstep(0, HOVER_RADIUS, dist).oneMinus().pow(2).mul(hoverStrength);
      pos.addAssign(vec3(delta.mul(falloff.mul(-HOVER_PULL)), falloff.mul(HOVER_LIFT)));

      // 入場: enter が 1 → 0 でスピンとめくれがほどけて平らに着地する
      flipDeform(pos, enter);

      // 回転軸を板の手前(z = FOLD_DEPTH)に置くと、ページをめくるように奥から手前へ倒れる
      const center = vec3(0, 0, FOLD_DEPTH);
      const offset = uv().y.add(uv().x).mul(0.4).clamp(0, 1);
      // offset で頂点ごとに遅延させた 0..1 のランプ。このままだと両端が折れ線になるので
      // ランプ自体にもイージングをかけて、各頂点の折れ始め/折れ終わりを滑らかにする
      const ramp = easeOutQuad(progress)
        .sub(pow(offset.mul(0.4), 2))
        .div(0.6)
        .clamp(0, 1);
      const smoothProgress = easeInOutCubic(ramp);
      return rotate(pos.sub(center), vec3(smoothProgress.mul(-Math.PI), 0, 0));
    })();

    // 高さ 1 の単位板。横幅はテクスチャの比率ぶん mesh.scale.x で伸ばす
    this.geometry = new THREE.PlaneGeometry(1, PLANE_HEIGHT, 100, 100);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    // 退場専用の板。入れ替えのときだけ現れて、前の絵を持ったまま真上へ抜けていく
    this.exitMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    this.exitMaterial.colorNode = Fn(() => this.exitTex.sample(faceUv()))();
    this.exitMaterial.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      // 入場と同じめくれ。leave が 0 → 1 でめくれを巻き上げながら出ていく
      flipDeform(pos, leave);
      // 本体の板は折りたたみの回転軸の都合で常に FOLD_DEPTH ぶん奥に描かれている
      // (positionNode 末尾の pos.sub(center))ので、同じだけ奥へ置いて大きさを揃える
      return pos.sub(vec3(0, 0, FOLD_DEPTH));
    })();
    this.exitMesh = new THREE.Mesh(this.geometry, this.exitMaterial);
    this.exitMesh.visible = false;
    this.scene.add(this.exitMesh);
  }

  addBackground() {
    const { time, texMix, textRepeat, textSpeed, textOpacity } = this.uniforms;
    this.bgA = texture(this.bgTextures[0]);
    this.bgB = texture(this.bgTextures[Math.min(1, this.bgTextures.length - 1)]);

    // 板の高さ = テキスト1行ぶんなので、v はそのまま使って横だけタイルさせる
    const strip = (map, repeatX) => {
      const u = uv().x.mul(repeatX).add(time.mul(textSpeed));
      return map.sample(vec2(u, uv().y));
    };

    const color = mix(strip(this.bgA, textRepeat.x), strip(this.bgB, textRepeat.y), texMix);

    this.bgMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    this.bgMaterial.colorNode = color.rgb; // alpha は opacityNode 側で扱うので rgb だけ渡す
    this.bgMaterial.opacityNode = color.a.mul(textOpacity);

    this.bgGeometry = new THREE.PlaneGeometry(1, 1);
    this.bg = new THREE.Mesh(this.bgGeometry, this.bgMaterial);
    this.bg.position.z = BG_Z;
    this.scene.add(this.bg);
  }

  // 表示中(current)のテクスチャを板へ、current と次を背景テキストへ流し込む
  applyTextures() {
    const next = (this.current + 1) % this.textures.length;
    this.plateIndex = this.current;
    this.plateTex.value = this.textures[this.current];
    this.bgA.value = this.bgTextures[this.current];
    this.bgB.value = this.bgTextures[next];
    // 板の形もテクスチャに合わせて引き直す
    this.applyPlateScale();
    // テキストは文字数ごとに帯のアスペクトが違うので、タイル数を引き直す
    this.layoutBackground();
  }

  // 板の比率と拡大率を入れ直す。板が画面からはみ出さないよう、表示範囲に対して縮める
  applyPlateScale() {
    const aspect = this.aspects[this.plateIndex] ?? DEFAULT_ASPECT;
    const scale = plateScale(this.width, this.height, aspect);

    this.uniforms.plateAspect.value = aspect;
    // 奥行きは高さと同じ倍率にする(折りたたみの回転が比率で歪まないように)
    this.mesh.scale.set(scale * aspect, scale, scale);
  }

  // DOM 側のタイトルを板のクロスフェードと同じタイミングで入れ替える
  syncItems() {
    const mixValue = this.uniforms.texMix.value;
    const next = (this.current + 1) % this.items.length;

    this.items.forEach((item, index) => {
      let opacity = 0;
      if (index === this.current) {
        opacity = 1 - mixValue;
      } else if (index === next) {
        opacity = mixValue;
      }
      item.style.opacity = opacity;
      // 見えていないタイトルのリンクは踏めないようにする
      item.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
      item.classList.toggle("is-current", opacity > 0.5);
    });
  }

  // 「待つ → 入れ替える」を繰り返してプロジェクトを巡回する。
  // this.cycle が常に今動いている方(待ちの delayedCall か入れ替えの timeline)を指すので、
  // 画面外での pause / resume や destroy の kill はどの瞬間でも効く
  scheduleSwap() {
    if (this.textures.length < 2) {
      return;
    }

    this.cycle = gsap.delayedCall(this.params.hold, () => this.playSwap());
  }

  // 入れ替え本体。今の板が退場用の板としてめくれを巻き上げながら真上へ抜けていき、
  // 次の絵に差し替えた本体の板が真下から同じめくれをほどきながら中央へ昇ってくる
  playSwap() {
    this.swapping = true;
    const { fade, exitDuration, enterDuration, enterDelay } = this.params;
    const next = (this.current + 1) % this.textures.length;
    const view = this.getViewSize(this.camera.position.z);

    // 退場する板: 今の見た目(絵・大きさ)をそのまま引き継いで中央に置く
    this.exitTex.value = this.textures[this.current];
    this.exitMesh.scale.copy(this.mesh.scale);
    this.exitMesh.position.set(0, 0, 0);
    this.exitMesh.rotation.set(0, 0, 0);
    this.exitMesh.visible = true;

    // 退場する板が画面外に出るまでの距離。めくれで回転するぶん対角半径で取る
    const exitHalfDiagonal = Math.hypot(this.exitMesh.scale.x, this.exitMesh.scale.y) / 2;
    this.uniforms.leave.value = 0;

    // 入場する板: 次のテクスチャに差し替えて真下の画面外へ
    this.plateIndex = next;
    this.plateTex.value = this.textures[next];
    this.applyPlateScale();
    const halfDiagonal = Math.hypot(this.mesh.scale.x, this.mesh.scale.y) / 2;
    this.mesh.position.set((view.width / 2 + halfDiagonal) * OFFSCREEN_MARGIN, -(view.height / 2 + halfDiagonal) * OFFSCREEN_MARGIN, 0);
    this.uniforms.enter.value = 1; // めくれて回った状態から入り、着地でほどける

    const tl = gsap.timeline({
      onComplete: () => {
        this.swapping = false;
        this.exitMesh.visible = false;
        this.uniforms.leave.value = 0;
        this.uniforms.enter.value = 0;
        this.current = next;
        this.uniforms.texMix.value = 0;
        this.applyTextures();
        this.syncItems();
        this.scheduleSwap();
      },
    });

    // 背景テキストと DOM タイトルは今まで通りクロスフェードで入れ替える
    tl.to(
      this.uniforms.texMix,
      {
        value: 1,
        duration: fade,
        ease: "power2.inOut",
        onUpdate: () => this.syncItems(),
      },
      0,
    );

    // 退場: 入場と同じめくれを巻き上げながら、真上へ抜けていく
    tl.to(this.uniforms.leave, { value: 1, duration: exitDuration, ease: "none" }, 0);
    tl.to(
      this.exitMesh.position,
      {
        y: (view.height / 2 + exitHalfDiagonal) * OFFSCREEN_MARGIN,
        x:-(view.width / 2 + exitHalfDiagonal) * OFFSCREEN_MARGIN,
        duration: exitDuration,
        ease: "power3.in",
      },
      0,
    );

    // 入場: 真下から、めくれとスピンをほどきながら中央へ昇ってくる。
    // デモの自動再生は p を等速で回している(表情は smoothstep と sin が作る)ので、
    // enter にイージングは掛けない
    tl.to(this.mesh.position, {
       y: 0, duration: enterDuration, ease: "power3.out",
       x: 0, duration: enterDuration, ease: "power3.out"
      }, enterDelay);
    tl.to(this.uniforms.enter, { value: 0, duration: enterDuration, ease: "power3.out" }, enterDelay);

    this.cycle = tl;
  }

  // 入れ替え演出の調整パネル(開発ビルドのみ)。
  // 時間まわりは params 経由なので次のサイクルから、めくれは uniform なので即座に効く
  async setupGui() {
    if (!import.meta.env.DEV) {
      return;
    }

    const { default: GUI } = await import("lil-gui");
    if (this.disposed) {
      return;
    }

    const { flipSpin, flipBend, flipAxis } = this.uniforms;
    this.gui = new GUI({ title: "project swap" });

    const timing = this.gui.addFolder("timing");
    timing.add(this.params, "hold", 0, 8, 0.1).name("待ち時間");
    timing.add(this.params, "fade", 0.1, 3, 0.05).name("クロスフェード");
    timing.add(this.params, "exitDuration", 0.2, 4, 0.05).name("退場");
    timing.add(this.params, "enterDuration", 0.2, 4, 0.05).name("入場");
    timing.add(this.params, "enterDelay", 0, 2, 0.05).name("入場の遅れ");

    const flip = this.gui.addFolder("flip");
    flip.add(flipSpin, "value", 0, Math.PI * 2, 0.01).name("スピン");
    flip.add(flipBend, "value", 0, 0.5, 0.005).name("湾曲");
    flip.add(flipAxis.value, "x", -2, 2, 0.05).name("軸 X");
    flip.add(flipAxis.value, "y", -2, 2, 0.05).name("軸 Y");
    flip.add(flipAxis.value, "z", -2, 2, 0.05).name("軸 Z");

    this.gui.add({ swap: () => this.swapNow() }, "swap").name("今すぐ入れ替え");
  }

  // GUI 用。待ち時間を飛ばしてすぐ入れ替えを始める
  swapNow() {
    if (this.swapping || this.folded || this.textures.length < 2) {
      return;
    }

    this.cycle?.kill();
    this.playSwap();
  }

  // メッシュ自体をクリックしたときだけ反応する。
  // 折りたたみは頂点シェーダ側の変形なので、レイキャストの当たり判定は
  // 変形前の平面（progress=0 の見た目）のまま
  setupPointer() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const el = this.renderer.domElement;

    const updatePointer = (event) => {
      const rect = el.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    // 当たった位置の UV。外れていたら null
    const hitUv = () => {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      return this.raycaster.intersectObject(this.mesh, false)[0]?.uv ?? null;
    };

    this.onPointerMove = (event) => {
      updatePointer(event);
      const hit = hitUv();
      el.style.cursor = hit ? "pointer" : "";
      this.setHover(hit);
    };

    this.onPointerDown = (event) => {
      updatePointer(event);
      if (hitUv()) {
        this.openCurrent();
      }
    };

    this.onPointerLeave = () => this.setHover(null);

    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerleave", this.onPointerLeave);
  }

  // ホバーの狙い値を更新する。hit が null なら板から外れた = 平らへ戻す
  setHover(hit) {
    if (!hit || this.leaving) {
      this.hoverTarget = 0;
      return;
    }

    // 触れた瞬間は、前に触っていた場所から膨らみが滑ってくると不自然なので位置を合わせる
    if (this.uniforms.hoverStrength.value < 0.001) {
      this.uniforms.hoverUv.value.copy(hit);
    }
    this.hoverUv.copy(hit);
    this.hoverTarget = .5;
  }

  // 位置も強さもフレームをまたいで追いつかせる(ポインタの飛びをそのまま板に出さない)。
  // deltaTime に依らず同じ速さで収束するよう、指数で減衰させる
  updateHover(deltaTime) {
    const { hoverUv, hoverStrength } = this.uniforms;
    const t = 1 - Math.exp((-deltaTime / 1000) * HOVER_EASE);
    // 折りたたみが始まったらホバーは邪魔なので、そのまま平らへ戻す
    const target = this.leaving ? 0 : this.hoverTarget;

    hoverUv.value.lerp(this.hoverUv, t);
    hoverStrength.value += (target - hoverStrength.value) * t;
  }

  // 表示中の項目（クロスフェードで半分を超えた側が「見えている」板）
  currentItem() {
    const index = this.uniforms.texMix.value > 0.5 ? (this.current + 1) % this.items.length : this.current;
    return this.items[index];
  }

  // 板をクリック = 表示中のプロジェクトへ遷移。
  // 遷移を先に始めておくと、折りたたみを見せている間に次ページの取得が進むので、
  // アニメーションが終わったところで待ち時間なく詳細ページへ繋がる
  openCurrent() {
    if (this.leaving) {
      return;
    }

    const href = this.currentItem()?.querySelector("a")?.href;
    if (!href) {
      return;
    }

    const swup = getSwup();
    if (!swup) {
      // Swup が無い（= 素の遷移）場合は、演出を見せ切ってから移動する
      this.playExit().then(() => {
        window.location.href = href;
      });
      return;
    }

    // 実際の演出は leave フックから handlePageExit() が再生する
    swup.navigate(href);
  }

  // 遷移演出の引き受け。行き先がこのセクションのプロジェクトなら退場 / 入場を返す。
  // タイトルのリンクを直接クリックした遷移もここを通る
  handlePageExit(visit) {
    if (this.disposed || !visit?.to?.url) {
      return null;
    }

    const path = new URL(visit.to.url, window.location.href).pathname;
    const index = this.items.findIndex((item) => {
      const link = item.querySelector("a");
      return link ? new URL(link.href).pathname === path : false;
    });
    if (index < 0) {
      return null;
    }

    this.cycle?.pause();
    // 入れ替えの途中で踏まれても、板を中央に戻して遷移先の絵を確定させてから折る
    this.exitMesh.visible = false;
    this.uniforms.leave.value = 0;
    this.uniforms.enter.value = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.current = index;
    this.uniforms.texMix.value = 0;
    this.applyTextures();
    this.syncItems();

    return {
      leave: this.playExit(),
      enter: () => this.playReveal(),
    };
  }

  // 退場。板を折りたたみ、折り終わったところで canvas をページから切り離す。
  // 板は動かさずその場に残るので、裏で中身が差し替わっても画面上は何も動かない
  async playExit() {
    this.leaving = true;
    this.folded = true;
    // 入れ替えの途中でも、板を中央へ戻してから折る(Swup 無しの直接遷移もここを通る)
    this.cycle?.pause();
    this.exitMesh.visible = false;
    this.uniforms.leave.value = 0;
    this.uniforms.enter.value = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.section.classList.add("is-folded");
    // 遷移先のメイン画像は、板から位置を引き渡すまで隠しておく
    document.documentElement.classList.add(HERO_HANDOFF_CLASS);

    // 板が画面から外れていると引き渡せないので、位置を揃えてスクロールを止める
    this.lockStage();

    // 背景の流れる文字も一緒に消して、板の動きだけを残す。
    // 折りたたみと並行で走らせるので待たない(destroy 時は exitTweens として片付く)
    this.exitTweens.push(
      gsap.to(this.uniforms.textOpacity, {
        value: 0,
        duration: TEXT_FADE_DURATION,
        ease: "power2.out",
      }),
    );

    await this.tweenTo(this.uniforms.progress, {
      value: 1,
      duration: FOLD_DURATION,
      ease: "none", // イージングはシェーダ側の ramp で掛けている
    });
    if (this.disposed) {
      return;
    }

    this.detachCanvas();
  }

  // 入場。板が映っている矩形をそのまま遷移先の画像に写してから入れ替える。
  // 位置を計算し直さず実測値を渡すので、ヘッダーの有無やスクロール位置に関わらずズレない。
  // アニメーションは挟まない(＝画像は動かない・大きさも変わらない)。
  // ただし「入場を引き受けた」ことを伝えるため、Promise は返しておく(既定のフェード回避)
  async playReveal() {
    clearTimeout(this.landTimer);
    if (this.disposed) {
      return;
    }

    // 画像を板と同じ位置に置き、描ける状態になるまで待ってから引き渡す
    await handoffProjectHero(this.plateRect());
    if (this.disposed) {
      return;
    }

    // destroy が canvas を消し、隠していた画像を出す。同じフレームで入れ替わる
    this.destroy();
  }

  // 板が今ビューポート上に映っている矩形(px)
  plateRect() {
    const canvas = this.renderer.domElement.getBoundingClientRect();
    const view = this.getViewSize(this.plateDistance());
    const pxPerX = canvas.width / view.width;
    const pxPerY = canvas.height / view.height;
    // 板は高さ 1 の単位板なので、mesh.scale がそのままワールド上の幅・高さになる
    const width = this.mesh.scale.x * pxPerX;
    const height = PLANE_HEIGHT * this.mesh.scale.y * pxPerY;

    return {
      left: canvas.left + canvas.width / 2 + this.mesh.position.x * pxPerX - width / 2,
      top: canvas.top + canvas.height / 2 - this.mesh.position.y * pxPerY - height / 2,
      width,
      height,
    };
  }

  // カメラから板までの距離。折り終わった板は頂点シェーダ側で FOLD_DEPTH ぶん手前に出ている
  plateDistance() {
    return this.camera.position.z - this.mesh.position.z - FOLD_DEPTH * this.mesh.scale.z;
  }

  // 演出用の tween。destroy が割り込んでも待ち側が止まらないよう resolve を控えておく
  tweenTo(target, vars) {
    return new Promise((resolve) => {
      this.exitResolvers.push(resolve);
      this.exitTweens.push(gsap.to(target, { ...vars, onComplete: resolve }));
    });
  }

  // ステージの上端をビューポートの上端に合わせ、演出中はスクロールを止める。
  // 途中で動かされると板の位置がずれて、引き渡し先の画像もその位置に付いていってしまう
  lockStage() {
    const lenis = getLenis();
    if (!lenis) {
      const top = this.container.getBoundingClientRect().top;
      if (Math.abs(top) >= 2) {
        window.scrollBy({ top, behavior: "smooth" });
      }
      return;
    }

    lenis.stop();
    // stop() 中はスクロール入力を受け付けないが、force を付けた位置合わせだけは通す
    lenis.scrollTo(this.container, { duration: ALIGN_DURATION, force: true });
  }

  unlockStage() {
    getLenis()?.start();
  }

  // canvas を body 直下の固定要素に移す。
  // Swup が #swup の中身を差し替えても板はそのまま画面に残り、
  // 差し替わった先の画像へ繋がる(背景のテキストはこの時点で消えている)
  detachCanvas() {
    const el = this.renderer.domElement;
    // 今見えている位置のまま固定に切り替える(＝切り離しても見た目は 1px も動かない)
    const rect = el.getBoundingClientRect();

    this.detached = true;

    el.style.position = "fixed";
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.left}px`;
    el.style.zIndex = "9990";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    // 貼り替え直後の canvas は中身が空になることがあるので、その場で描き直す
    this.renderer.render(this.scene, this.camera);

    // canvas は固定になったので、以降スクロールされても板は動かない
    this.unlockStage();
    // ページ差し替え時の destroy 対象から外し、後始末は playReveal() 側で行う
    this.release?.();
    // 遷移が中断された場合に板が残り続けないようにする
    this.landTimer = setTimeout(() => this.destroy(), LAND_FALLBACK);
  }

  resize() {
    // 切り離したあとは container から離れているので、サイズは触らない
    if (this.detached) {
      return;
    }

    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    if (this.width === 0 || this.height === 0) {
      return;
    }

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.applyPlateScale();

    this.layoutBackground();
  }

  // 指定した奥行き位置でカメラに見えている範囲(ワールド単位)
  getViewSize(distance) {
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    return { width: height * this.camera.aspect, height };
  }

  // 背景テキストの板を、BG_Z の位置で画面幅いっぱい × 1行ぶんの高さに合わせる
  layoutBackground() {
    if (!this.bg) {
      return;
    }

    const { width: w, height: h } = this.getViewSize(this.camera.position.z - BG_Z);
    const rowHeight = h * BG_ROW_HEIGHT;
    this.bg.scale.set(w, rowHeight, 1);

    // 文字が伸び縮みしないよう、横のタイル数を
    // 板のアスペクトとテキスト帯のアスペクトから逆算する
    const repeat = this.uniforms.textRepeat.value;
    repeat.x = w / rowHeight / this.bgA.value.aspect;
    repeat.y = w / rowHeight / this.bgB.value.aspect;
  }

  render(_time, deltaTime) {
    if (this.disposed) {
      return;
    }

    // 切り離している間はセクションから離れているので、常に描き続ける
    if (!this.detached) {
      // 画面外のセクションは描画せず、プロジェクトの巡回も止めておく
      // （見に来たときに必ず1件目から始まるように）
      const rect = this.section.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (visible !== this.visible) {
        this.visible = visible;
        if (!visible) {
          this.cycle?.pause();
        } else if (!this.folded) {
          this.cycle?.resume();
        }
      }
      if (!visible) {
        return;
      }
    }

    this.updateHover(deltaTime);
    // デモの「1フレーム +0.05」を 60fps 基準の秒速に直した値
    this.time += deltaTime * 0.003;
    this.uniforms.time.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }

  // Swup 遷移で DOM が差し替わるたびに呼ぶ。
  // 破棄しないと GPU コンテキストが溜まっていく。
  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.pageExit) {
      clearPageExit(this.pageExit);
    }
    // 引き渡し完了。隠していた遷移先の画像を出し、止めていたスクロールも戻す
    document.documentElement.classList.remove(HERO_HANDOFF_CLASS);
    this.unlockStage();

    this.gui?.destroy();
    clearTimeout(this.landTimer);
    this.cycle?.kill();
    for (const tween of this.exitTweens) {
      tween.kill();
    }
    // 演出の途中で破棄された場合に、待っている leave / enter を取りこぼさない
    for (const resolve of this.exitResolvers) {
      resolve();
    }
    this.exitTweens = [];
    this.exitResolvers = [];
    if (this.tick) {
      gsap.ticker.remove(this.tick);
    }
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
    }

    const el = this.renderer?.domElement;
    if (el && this.onPointerMove) {
      el.removeEventListener("pointermove", this.onPointerMove);
      el.removeEventListener("pointerdown", this.onPointerDown);
      el.removeEventListener("pointerleave", this.onPointerLeave);
    }

    for (const tex of this.textures ?? []) {
      tex.dispose();
    }
    for (const tex of this.bgTextures ?? []) {
      tex.dispose();
    }
    this.material?.dispose();
    this.exitMaterial?.dispose();
    this.bgMaterial?.dispose();
    this.geometry?.dispose();
    this.bgGeometry?.dispose();

    this.renderer?.dispose();
    el?.remove();
  }
}
