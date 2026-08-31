import gsap from "gsap";
import {
  cos,
  float,
  Fn,
  frontFacing,
  mix,
  positionLocal,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";

const CURL_RADIUS = 1.8;
const CURL_HEIGHT = 0.62;
const CURL_TILT = 0; // 折り線の傾き。左右で捲れ量に差をつけて紙らしくする
const CURL_SHADE = 0; // 巻かれた部分に落とす陰の濃さ
const BACK_FADE = 0.72; // 裏面をどれだけ紙の白へ寄せるか
// 折り線の初期値(捲れゼロのときの位置)。下端よりわずかに外へ置いて確実に平らにする
const FOLD_OUT = -0.02;

// スクロール連動(スクラブ)の範囲。ビューポート高に対する比率(1 = 下端 / 0 = 上端)で、
// 画像の上端が START のラインで捲れたまま現れ、END のラインへ昇るまでの間に
// 巻きがほどけて平らになる。tween ではなくスクロール量に直結しているので、戻せばまた捲れる
const SCRUB_START = 0.3;
const SCRUB_END = 0.1;
const SCRUB_EASE = "power3.inOut"; // 進行度に掛けるイージング(等速だと機械的に見える)
// スクロールへの追従の速さ(1秒あたり。小さいほど捲れが遅れてついてくる)。
// ScrollTrigger の scrub: 1 と同じ発想で、スクロールを止めたあとも
// この速さで目標値へ収束し続けるので、動きがゆったり見える
const SCRUB_SMOOTH = 2.5;

// カメラをこの距離に置き、fov を逆算してワールド座標とスクリーンの px を 1:1 にする
const CAMERA_Z = 1000;
// 画面外判定の余白(px)。捲れで板の外へはみ出すぶんを見込む
const VIEW_MARGIN = 50;

// 詳細ページの画像ギャラリー。DOM の <img> と同じ矩形に WebGPU の板を重ね、
// 下端だけページの角のように捲れた状態で見せる。捲れの戻りはスクロール量に
// 直結していて、画像がビューポートを昇っていくのに合わせて巻きがほどける。
// DOM の画像はテクスチャが用意できた項目から順に visibility: hidden へ差し替える
// (WebGL が使えない環境ではそのまま素の画像が見える)。
export default class ProjectGallery {
  constructor({ images, release }) {
    this.images = images;
    this.release = release;
    this.disposed = false;
    this.items = [];
    // 前フレームに何か描いたか。画面外に出た直後の1回だけ描いてキャンバスを空にする
    this.hadVisible = false;

    // スクラブの範囲は GUI から触るので params に持つ。イージングは関数化して毎フレーム使う
    this.params = { start: SCRUB_START, end: SCRUB_END, smooth: SCRUB_SMOOTH };
    this.ease = gsap.parseEase(SCRUB_EASE);

    // 捲れの見た目は全項目で共有(GUI から一括で触るため uniform で持つ)
    this.uniforms = {
      radius: uniform(CURL_RADIUS),
      foldHeight: uniform(CURL_HEIGHT),
      tilt: uniform(CURL_TILT),
      shade: uniform(CURL_SHADE),
      backFade: uniform(BACK_FADE),
    };
  }

  // WebGPU のデバイス取得は非同期なので constructor から分離する
  async init() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearAlpha(0);
    await this.renderer.init();
    if (this.disposed) {
      return;
    }

    const el = this.renderer.domElement;
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "5";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fovFor(this.height), this.width / this.height, 10, CAMERA_Z * 2);
    this.camera.position.set(0, 0, CAMERA_Z);

    // 捲れは下端 4 割ほどに集中するので、縦の分割を厚めに取る
    this.geometry = new THREE.PlaneGeometry(1, 1, 60, 160);

    this.loader = new THREE.TextureLoader();
    // テクスチャは Sanity の CDN から読むので CORS 必須。
    // <img> 側にも crossorigin="anonymous" を付けてキャッシュを共有している
    this.loader.setCrossOrigin("anonymous");

    for (const img of this.images) {
      this.addItem(img);
    }

    this.setupGui();

    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize);

    // Lenis と同じ gsap.ticker に乗せて描画ループを1本化する
    this.tick = this.render.bind(this);
    gsap.ticker.add(this.tick);
  }

  // ビューポートの高さ(px)がワールドの高さと一致する fov
  fovFor(height) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / CAMERA_Z));
  }

  // 画像 1 枚ぶんの板を作る。テクスチャが読めたらその項目だけ DOM から引き継ぐ
  addItem(img) {
    const item = {
      img,
      ready: false,
      curl: uniform(1), // 1 = 捲れた初期状態 / 0 = 平ら。syncItem がスクロール位置から毎フレーム入れ直す
    };

    item.tex = this.loader.load(img.currentSrc || img.src, () => {
      if (this.disposed) {
        return;
      }
      item.ready = true;
      // 板が描ける状態になってから DOM の画像を隠す(それまでは素の画像を見せておく)
      img.classList.add("is-webgl");
    });
    item.tex.colorSpace = THREE.SRGBColorSpace;

    item.material = this.buildMaterial(item);
    item.mesh = new THREE.Mesh(this.geometry, item.material);
    item.mesh.visible = false;
    this.scene.add(item.mesh);
    this.items.push(item);
  }

  buildMaterial(item) {
    const { radius, foldHeight, tilt, shade, backFade } = this.uniforms;
    const { curl } = item;

    // 折り線の高さ(uv.y)。curl が 0 へ戻ると下端の外へ抜けて、板は完全に平らになる。
    // uv.x で傾けて、角から捲れたような左右差をつける
    const foldAt = () => mix(float(FOLD_OUT), foldHeight, curl).add(uv().x.sub(0.5).mul(tilt).mul(curl));
    // 折り線から下の弧長(0 なら平らな領域)と、円筒に巻き付く角度
    const curlTheta = () => foldAt().sub(uv().y).max(0).div(radius);

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

    material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      const d = foldAt().sub(uv().y).max(0);
      const theta = d.div(radius);
      pos.y.addAssign(d.sub(sin(theta).mul(radius)));
      pos.z.addAssign(cos(theta).oneMinus().mul(radius));
      return pos;
    })();
    const tex = texture(item.tex);
    material.colorNode = Fn(() => {
      const sampled = tex.sample(uv());
      const paper = mix(sampled.rgb, vec3(1, 1, 1), backFade);
      const color = frontFacing.select(sampled.rgb, paper);
      const dark = smoothstep(0, Math.PI, curlTheta()).mul(shade);
      return color.mul(dark.oneMinus());
    })();

    return material;
  }

  // 捲れの調整パネル(開発ビルドのみ)。uniform なので動かしながら効く
  async setupGui() {
    if (!import.meta.env.DEV) {
      return;
    }

    const { default: GUI } = await import("lil-gui");
    if (this.disposed) {
      return;
    }

    const { radius, foldHeight, tilt, shade, backFade } = this.uniforms;
    this.gui = new GUI({ title: "project gallery" });
    this.gui.add(radius, "value", 0.02, 0.4, 0.005).name("巻きの半径");
    this.gui.add(foldHeight, "value", 0.05, 0.9, 0.01).name("捲れの高さ");
    this.gui.add(tilt, "value", -0.5, 0.5, 0.01).name("折り線の傾き");
    this.gui.add(shade, "value", 0, 1, 0.01).name("陰の濃さ");
    this.gui.add(backFade, "value", 0, 1, 0.01).name("裏面の白さ");
    this.gui.add(this.params, "start", 0.2, 1.2, 0.01).name("捲れ始めのライン");
    this.gui.add(this.params, "end", 0, 1, 0.01).name("戻り切るライン");
    this.gui.add(this.params, "smooth", 0.5, 12, 0.1).name("追従の速さ");
  }

  syncItem(item, deltaTime) {
    const rect = item.img.getBoundingClientRect();
    const visible = rect.bottom > -VIEW_MARGIN && rect.top < this.height + VIEW_MARGIN;
    item.mesh.visible = visible && item.ready;
    if (!item.mesh.visible) {
      return false;
    }

    // スクロールに合わせて捲れをほどく。画像の上端が start のラインから
    // end のラインへ昇る間の進行度を目標値にして(戻せばまた捲れる)、
    // curl はそこへ smooth の速さで追いつかせる = スクロールより一拍遅れてゆったり動く。
    // deltaTime に依らず同じ速さで収束するよう、指数で減衰させる
    const { start, end, smooth } = this.params;
    const progress = (start - rect.top / this.height) / (start - end);
    const target = 1 - this.ease(THREE.MathUtils.clamp(progress, 0, 1));
    const t = 1 - Math.exp((-deltaTime / 1000) * smooth);
    item.curl.value += (target - item.curl.value) * t;
    item.mesh.position.set(
      rect.left + rect.width / 2 - this.width / 2,
      this.height / 2 - rect.top - rect.height / 2,
      0,
    );
    // 奥行きは高さと同じ倍率にする(捲れの巻きが板の比率で歪まないように)
    item.mesh.scale.set(rect.width, rect.height, rect.height);
    return true;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.fovFor(this.height);
    this.camera.updateProjectionMatrix();
  }

  // gsap.ticker から (time, deltaTime[ms]) で呼ばれる
  render(_time, deltaTime) {
    if (this.disposed) {
      return;
    }

    let anyVisible = false;
    for (const item of this.items) {
      anyVisible = this.syncItem(item, deltaTime) || anyVisible;
    }

    if (!anyVisible && !this.hadVisible) {
      return;
    }
    this.hadVisible = anyVisible;
    this.renderer.render(this.scene, this.camera);
  }

  // Swup 遷移で DOM が差し替わるたびに呼ぶ。
  // 破棄しないと GPU コンテキストが溜まっていく
  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.gui?.destroy();
    if (this.tick) {
      gsap.ticker.remove(this.tick);
    }
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
    }

    // 隠していた DOM の画像を戻す(遷移で DOM ごと消える場合はそのまま)
    for (const item of this.items) {
      item.img.classList.remove("is-webgl");
      item.tex?.dispose();
      item.material?.dispose();
    }
    this.geometry?.dispose();

    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
    this.release?.();
  }
}
