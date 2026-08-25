import gsap from "gsap";
import * as THREE from "three";

import fragmentShader from "./fragment.glsl?raw";
import vertexShader from "./vertex.glsl?raw";

// 螺旋(ヘリックス)の形。角度は進行度に比例して回り、
// 半径は奥へいくほど絞ることで渦のように収束させる
const RADIUS = 2.2;
const TURNS = 1.25;
const RADIUS_SHRINK = 0.72;
// シェーダー側の動き(めくれ・自転・湾曲)の強さ
const FLIP = 1.6;
const SPIN = 0.25;
const BEND = 0.22;
// 手前(カメラ近く)で現れて、奥へ消えるまでの区間
const Z_START = 3.0;
const Z_END = -26.0;
// イントロ全体の長さ(秒)と、1枚のカードが旅に使う割合。
// 残り(1 - CARD_SPAN)をカード間の時間差に均等配分するので、
// 最後のカードがちょうど t=1 で奥に消える
const DURATION = 4.2;
const CARD_SPAN = 0.55;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// FV の手前で一度だけ再生するイントロ。
// カードが1枚ずつ螺旋を描きながら奥へ流れ、全部消えたら play() が解決する。
export default class HeroIntro {
  constructor({ container, textures }) {
    this.container = container;
    this.urls = textures;
    this.disposed = false;
    // タイムラインの進行度(0→1)。gsap のトゥイーンで進める
    this.t = 0;

    this.width = container.offsetWidth;
    this.height = container.offsetHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    // ページ背景(サイト共通のグラデーション)を透かすので塗り潰さない
    this.renderer.setClearAlpha(0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 200);
    this.camera.position.set(0, 0, 6);

    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize);

    // Lenis と同じ gsap.ticker に乗せて描画ループを1本化する
    this.tick = this.render.bind(this);
    gsap.ticker.add(this.tick);
  }

  // テクスチャを読み切ってから始める(読み込み中の真っ黒な板を見せない)。
  // 失敗した分は無地で埋めて、枚数はそのまま保つ
  async load() {
    const loader = new THREE.TextureLoader();
    // WebGL テクスチャは CORS 必須。Sanity 側の CORS origins に
    // このサイトのオリジンが登録されていないと 403 になる。
    loader.setCrossOrigin("anonymous");

    const results = await Promise.allSettled(
      this.urls.map(
        (url) =>
          new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          }),
      ),
    );

    this.textures = results.map((result) =>
      result.status === "fulfilled" ? result.value : this.createFallbackTexture(),
    );
  }

  createFallbackTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2e2e2e";
    context.fillRect(0, 0, 2, 2);

    return new THREE.CanvasTexture(canvas);
  }

  addObjects() {
    // 分割数が粗いと湾曲が折れ線になる
    this.geometry = new THREE.PlaneGeometry(1.5, 2.0, 64, 64);
    const fogColor = new THREE.Color(0x1e1e1e);

    this.cards = this.textures.map((texture) => {
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uBend: { value: 0 },
          uFlip: { value: 0 },
          uFlipBend: { value: 0 },
          uAngle: { value: 0 },
          uTexture: { value: texture },
          uOpacity: { value: 0 },
          uFogColor: { value: fogColor },
        },
        // 裏返る表現なので両面描画が必須
        side: THREE.DoubleSide,
        transparent: true,
        // 半透明同士の重なりを素直に処理させる
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      this.scene.add(mesh);

      return { mesh, material };
    });
  }

  // 再生を開始し、最後のカードが奥へ消えたら解決する Promise を返す
  play() {
    this.addObjects();

    return new Promise((resolve) => {
      this.resolvePlay = resolve;
      this.tween = gsap.to(this, {
        t: 1,
        duration: DURATION,
        ease: "none",
        onComplete: () => this.finish(),
      });
    });
  }

  // destroy からも呼ぶので、待っている側が宙吊りにならないよう一度だけ解決する
  finish() {
    if (this.resolvePlay) {
      this.resolvePlay();
      this.resolvePlay = null;
    }
  }

  resize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    if (this.width === 0 || this.height === 0) {
      return;
    }

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.disposed || !this.cards) {
      return;
    }

    const count = this.cards.length;
    const gap = count > 1 ? (1 - CARD_SPAN) / (count - 1) : 0;

    this.cards.forEach((card, index) => {
      // カードごとの進行度(0〜1)。開始を index ぶんずらして1枚ずつ送り出す
      const p = clamp01((this.t - index * gap) / CARD_SPAN);

      // まだ出発していない / もう消えたカードは描かない
      card.mesh.visible = p > 0 && p < 1;
      if (!card.mesh.visible) {
        return;
      }

      // 螺旋上の位置。手前 → 奥へ
      const theta = p * TURNS * Math.PI * 2;
      const radius = RADIUS * (1 - RADIUS_SHRINK * p);
      card.mesh.position.set(Math.cos(theta) * radius, Math.sin(theta) * radius, Z_START + (Z_END - Z_START) * p);

      // シェーダーの動きを p で駆動。旅の途中で1回めくれ、中間で最も大きく反る
      card.material.uniforms.uFlip.value = Math.min(p * FLIP, 1);
      card.material.uniforms.uAngle.value = p * SPIN;
      card.material.uniforms.uBend.value = Math.sin(p * Math.PI) * BEND;

      // 出現直後と、奥へ消えるときに透明にする
      const fadeIn = smoothstep(0, 0.05, p);
      const fadeOut = 1 - smoothstep(0.62, 0.98, p);
      card.material.uniforms.uOpacity.value = fadeIn * fadeOut;
    });

    this.renderer.render(this.scene, this.camera);
  }

  // Swup 遷移で DOM が差し替わるたびに呼ぶ。
  // 破棄しないと WebGL コンテキストが上限(およそ16)まで溜まる。
  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.finish();
    this.tween?.kill();
    gsap.ticker.remove(this.tick);
    window.removeEventListener("resize", this.onResize);

    for (const texture of this.textures ?? []) {
      texture.dispose();
    }
    for (const { mesh, material } of this.cards ?? []) {
      this.scene.remove(mesh);
      material.dispose();
    }
    this.geometry?.dispose();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
