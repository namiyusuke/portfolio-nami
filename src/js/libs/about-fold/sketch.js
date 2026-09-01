import gsap from "gsap";
import {
  cos,
  cross,
  dot,
  Fn,
  frontFacing,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";

import { getLenis } from "../lenis.js";
// 紙の見え方(カメラ)は Projects の板と揃える
import { CAMERA_FOV, CAMERA_Z, viewHeightAt } from "../project-fold/plate-metrics.js";

// めくれの表情は project-fold の入退場(= hero-intro の vertex.glsl)と同じ値
const FLIP_AXIS = [1.0, 1.0, 0.5]; // めくれ本体の斜め回転軸
const FLIP_SPIN = 0.65; // スピン量
const FLIP_BEND = 0.25; // 湾曲の強さ
const OFFSCREEN_MARGIN = 1.1; // 紙を画面外に置くときの余裕(1 = 画面端ぴったり)

const ENTER_DURATION = 1.8; // 紙が降りてくる時間(秒)。project-fold の入場と同じ
const EXIT_DURATION = 1.2; // 紙が巻き上がって抜けていく時間(秒)。同じく退場と同じ
const EXIT_DELAY = 0.25; // 閉じ操作から紙が動き出すまでの間(秒)。中身のフェードを見せる

// 出どころは画面の右斜め上(ヘッダーの About ボタン側)。
// 画面外の縦距離に対する横ずれの比率で斜めの角度が決まる
const ENTER_DIAGONAL = 0.6;
// 紙の傾き(rad)。降りてくる間も着地後もこの角度のまま。
// DOM 側の中身も CSS 変数(--about-paper-tilt)経由で同じ角度に回して重ねる
const ENTER_TILT = 0.14;

// 紙の目標幅(px)と比率。縦横は画面の向きで切り替える
const PAPER_WIDTH = 720;
// 画面に対して紙が占める最大比率(まわりのページが見えるよう控えめにする)
const PAPER_FIT = 0.6;
const ASPECT_WIDE = 1.45;
const ASPECT_TALL = 0.72;

// About オーバーレイの紙。
// ヘッダーの About を押すと、Projects の板と同じめくれ(スピン + 斜め軸の
// フリップ + 垂れ下がり)をほどきながら画面上から降りてきて中央に着地する。
// 着地したら overlay に .is-landed を付け、DOM 側の中身(紙と同じ矩形に
// 重ねたプロフィール)を CSS でフェードインさせる。閉じると逆に巻き上げて抜ける。
export default class AboutFold {
  constructor({ overlay, container }) {
    this.overlay = overlay;
    this.container = container;
    this.disposed = false;
    this.ticking = false;
    // closed → opening → open → closing → closed
    this.state = "closed";

    this.uniforms = {
      // 1 = めくれて回っている / 0 = 平らに着地
      enter: uniform(1),
    };
  }

  // WebGPU のデバイス取得は非同期なので constructor から分離する
  async init() {
    this.width = this.container.offsetWidth || window.innerWidth;
    this.height = this.container.offsetHeight || window.innerHeight;

    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    // 背景の暗幕は CSS 側で敷くので塗り潰さない
    this.renderer.setClearAlpha(0);

    await this.renderer.init();
    if (this.disposed) {
      return;
    }

    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, this.width / this.height, 0.01, 100);
    this.camera.position.set(0, 0, CAMERA_Z);

    this.addPaper();
    this.resize();

    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize);

    this.tick = this.render.bind(this);
  }

  addPaper() {
    const { enter } = this.uniforms;

    // 任意軸の回転はロドリゲスの回転公式。project-fold の rotateAround と同じ
    const rotateAround = (p, axis, angle) => {
      const k = normalize(axis);
      const s = sin(angle.negate());
      const c = cos(angle.negate());
      return p
        .mul(c)
        .add(cross(k, p).mul(s))
        .add(k.mul(dot(k, p).mul(c.oneMinus())));
    };

    this.material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

    // 紙の色。表は生成り、裏はひと回り暗くして、めくれたときに裏返りが分かるようにする。
    // めくれの最中(sin の釣鐘型)だけ全体を少し落として、動きに陰影を足す
    this.material.colorNode = Fn(() => {
      const face = frontFacing.select(vec3(0.96, 0.95, 0.91), vec3(0.8, 0.79, 0.75));
      const shade = uv().y.mul(0.05).add(0.95);
      const curl = sin(enter.mul(Math.PI)).mul(-0.08).add(1);
      return face.mul(shade).mul(curl);
    })();

    // project-fold の flipDeform の移植。enter が 1 → 0 でめくれがほどけて平らになる
    this.material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      // 両方の edge に uv.x を混ぜることで、左端から右端へ時間差でめくれる
      const flipProgress = smoothstep(uv().x.mul(0.4), uv().x.mul(0.2).add(0.8), enter);
      const spin = enter.mul(FLIP_SPIN);
      // Z 軸まわり = 画面内でのスピン
      pos.assign(rotateAround(pos, vec3(0, 0, 1), spin));
      // 斜め軸まわり = めくれ本体(最大 180°) + 上と同じスピン量を合成
      pos.assign(rotateAround(pos, vec3(...FLIP_AXIS), flipProgress.mul(Math.PI).add(spin)));
      // 上辺 0 → 下辺 -1 の垂れ下がり。めくれの途中で最も反り、両端では平ら
      const sag = uv().y.negate().mul(uv().y.sub(2)).sub(1); // quadraticOut(uv.y) - 1
      pos.z.addAssign(sag.mul(sin(enter.mul(Math.PI)).mul(FLIP_BEND)).mul(1));
      return pos;
    })();

    // 高さ 1 の単位板。横幅は比率ぶん mesh.scale.x で伸ばす
    this.geometry = new THREE.PlaneGeometry(1, 1, 100, 100);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  resize() {
    // オーバーレイは visibility: hidden でもレイアウトを持つので、閉じていても測れる
    this.width = this.container.offsetWidth || window.innerWidth;
    this.height = this.container.offsetHeight || window.innerHeight;
    if (this.width === 0 || this.height === 0) {
      return;
    }

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    // 紙の実寸(px)。PAPER_WIDTH を上限に、画面の縦横へ PAPER_FIT の余白を残す。
    // 狭い画面では PAPER_FIT のままだと中身が読めない大きさになるので占有率を上げる
    const aspect = this.width > this.height ? ASPECT_WIDE : ASPECT_TALL;
    const fit = this.width < 768 ? 0.85 : PAPER_FIT;
    const paperWidth = Math.min(PAPER_WIDTH, this.width * fit, this.height * fit * aspect);
    const paperHeight = paperWidth / aspect;

    // px をワールド単位へ。板は高さ 1 の単位板なので scale がそのまま高さになる
    const view = viewHeightAt(CAMERA_Z);
    const scale = (view * paperHeight) / this.height;
    this.mesh.scale.set(scale * aspect, scale, scale);

    // DOM 側の中身を紙と同じ矩形・同じ傾きで重ねるため、実寸と角度を CSS 変数で渡す。
    // 回転の正方向が Three.js(反時計回り)と CSS(時計回り)で逆なので符号を反転する
    this.overlay.style.setProperty("--about-paper-w", `${paperWidth}px`);
    this.overlay.style.setProperty("--about-paper-h", `${paperHeight}px`);
    this.overlay.style.setProperty("--about-paper-tilt", `${-ENTER_TILT}rad`);

    // 開いている途中でリサイズされたら、画面外の置き場所も引き直す
    if (this.state === "closed") {
      const off = this.offscreenY();
      this.mesh.position.set(off * ENTER_DIAGONAL, off, 0);
    }
  }

  // 紙が画面の上端から完全に外れる高さ。めくれで回転するぶん対角半径で取る
  offscreenY() {
    const view = viewHeightAt(CAMERA_Z);
    const halfDiagonal = Math.hypot(this.mesh.scale.x, this.mesh.scale.y) / 2;
    return (view / 2 + halfDiagonal) * OFFSCREEN_MARGIN;
  }

  open() {
    if (this.disposed || this.state === "opening" || this.state === "open") {
      return;
    }

    this.tl?.kill();
    this.state = "opening";
    this.overlay.classList.add("is-open");
    this.overlay.classList.remove("is-leaving", "is-landed");
    this.overlay.setAttribute("aria-hidden", "false");
    getLenis()?.stop();

    this.resize();
    this.startTicker();

    // めくれて回った状態で右斜め上の画面外へ置き、降りながらほどいて着地させる
    this.uniforms.enter.value = 1;
    const off = this.offscreenY();
    this.mesh.position.set(off * ENTER_DIAGONAL, off, 0);
    this.mesh.rotation.z = ENTER_TILT;
    this.mesh.visible = true;

    this.tl = gsap.timeline({
      onComplete: () => {
        this.state = "open";
        // 着地してから中身を出す(CSS 側のフェードイン)
        this.overlay.classList.add("is-landed");
      },
    });
    this.tl.to(this.mesh.position, { x: 0, y: 0, duration: ENTER_DURATION, ease: "power3.out" }, 0);
    this.tl.to(this.uniforms.enter, { value: 0, duration: ENTER_DURATION, ease: "power3.out" }, 0);
    // 着地間際にすっとまっすぐへ戻る
    this.tl.to(this.mesh.rotation, { z: ENTER_TILT, duration: ENTER_DURATION, ease: "power2.in" }, 0);
  }

  close() {
    if (this.disposed || this.state === "closing" || this.state === "closed") {
      return;
    }

    this.tl?.kill();
    this.state = "closing";
    // 先に中身を消し、暗幕のフェードアウトも始める
    this.overlay.classList.remove("is-landed");
    this.overlay.classList.add("is-leaving");

    this.tl = gsap.timeline({
      onComplete: () => {
        this.state = "closed";
        this.mesh.visible = false;
        this.overlay.classList.remove("is-open", "is-leaving");
        this.overlay.setAttribute("aria-hidden", "true");
        getLenis()?.start();
        this.stopTicker();
      },
    });
    // 退場は巻き上げながら、来たときと同じ右斜め上へ抜けていく
    const off = this.offscreenY();
    this.tl.to(this.uniforms.enter, { value: 1, duration: EXIT_DURATION, ease: "none" }, EXIT_DELAY);
    this.tl.to(
      this.mesh.position,
      { x: -off * ENTER_DIAGONAL, y: -off, duration: EXIT_DURATION, ease: "power3.in" },
      EXIT_DELAY,
    );
    // 動き出しと同時に傾け直して、開きと対称の表情にする
    this.tl.to(this.mesh.rotation, { z: ENTER_TILT, duration: EXIT_DURATION, ease: "power2.out" }, EXIT_DELAY);
  }

  // 描画はオーバーレイが開いている間だけ回す
  startTicker() {
    if (!this.ticking) {
      this.ticking = true;
      gsap.ticker.add(this.tick);
    }
  }

  stopTicker() {
    if (this.ticking) {
      this.ticking = false;
      gsap.ticker.remove(this.tick);
    }
  }

  render() {
    if (this.disposed) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.tl?.kill();
    this.stopTicker();
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
    }
    getLenis()?.start();

    this.material?.dispose();
    this.geometry?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}
