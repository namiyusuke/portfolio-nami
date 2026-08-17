import gsap from "gsap";
import * as THREE from "three";

import fragmentShader from "./fragment.glsl?raw";
import vertexShader from "./vertex.glsl?raw";

// 1スライド送るのに必要なスクロール量。シェーダ内の pos.y と同じ単位で、
// 板は 2.0 間隔で並んでいる想定。
const UNITS_PER_SLIDE = 2;
// タイトル（DOM）を1枚ぶん送ったときの X 軸回転量
const ROTATION_ANGLE = 50;
// 中央から1枚ぶん離れたタイトルの不透明度
const MIN_OPACITY = 0.2;
// 中央からこの距離を超えた板は描画しない
const CULL_DISTANCE = UNITS_PER_SLIDE * 1.5;

// スクロールに追従して板を縦に流す WebGL スライダー。
// スクロール量はセクションの位置から毎フレーム求めるため、
// Lenis（gsap.ticker で駆動）と二重にホイールを拾うことはない。
export default class AnimationSlider {
  constructor({ section, container, items, textures }) {
    this.section = section;
    this.container = container;
    this.items = items;
    this.disposed = false;
    // タイトル1枚ぶん = UNITS_PER_SLIDE なので、全体のスクロール量はこの値
    this.total = textures.length * UNITS_PER_SLIDE;

    this.width = container.offsetWidth;
    this.height = container.offsetHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    // ページ背景を透かすので塗り潰さない
    this.renderer.setClearAlpha(0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.1, 10);
    this.camera.position.set(0, 0, 2);

    this.loader = new THREE.TextureLoader();
    // WebGL テクスチャは CORS 必須。Sanity 側の CORS origins に
    // このサイトのオリジンが登録されていないと 403 になる。
    this.loader.setCrossOrigin("anonymous");

    this.createTimeline();
    this.addObjects(textures);

    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize);

    // Lenis と同じ gsap.ticker に乗せて描画ループを1本化する
    this.tick = this.render.bind(this);
    gsap.ticker.add(this.tick);
  }

  // DOM 側のタイトルを板と同じタイミングで回す
  createTimeline() {
    this.timeline = gsap.timeline({ paused: true });

    const count = this.items.length;
    this.items.forEach((item, index) => {
      this.timeline.fromTo(
        item,
        {
          rotationX: -index * ROTATION_ANGLE,
          transformOrigin: "50% 50% -250",
        },
        {
          rotationX: (count - index) * ROTATION_ANGLE,
          duration: 1,
          ease: "none",
          onUpdate: () => {
            // センター(0°)で 1、1枚ぶん離れたら MIN_OPACITY まで落とす
            const rotation = gsap.getProperty(item, "rotationX");
            const distance = Math.min(Math.abs(rotation) / ROTATION_ANGLE, 1);
            item.style.opacity = 1 - (1 - MIN_OPACITY) * distance;
          },
        },
        "<",
      );
    });
  }

  addObjects(textures) {
    // 板はすべて原点に置き、縦位置はシェーダの progress で動かす
    this.geometry = new THREE.PlaneGeometry(2, 1, 100, 100);
    this.meshes = textures.map((url, index) => {
      const material = this.createMaterial(url);
      const mesh = new THREE.Mesh(this.geometry, material);
      this.scene.add(mesh);

      return { mesh, material, pos: index * UNITS_PER_SLIDE };
    });
  }

  createMaterial(url) {
    const texture = this.loader.load(url);
   // texture.colorSpace = THREE.SRGBColorSpace;

    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      // 半透明な板が重なるため、深度書き込みを切って前後の破綻を防ぐ
      depthWrite: false,
      uniforms: {
        progress: { value: 0 },
        uTexture: { value: texture },
      },
      vertexShader,
      fragmentShader,
    });
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

  // セクションの sticky 区間を 0〜1 に正規化する
  getProgress() {
    const rect = this.section.getBoundingClientRect();
    const distance = rect.height - window.innerHeight;
    if (distance <= 0) {
      return 0;
    }

    return Math.min(Math.max(-rect.top / distance, 0), 1);
  }

  render() {
    if (this.disposed) {
      return;
    }

    // 画面外のセクションは描画しない
    const rect = this.section.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return;
    }

    const progress = this.getProgress();
    this.timeline.progress(progress);

    const scroll = progress * this.total;
    for (const item of this.meshes) {
      const offset = scroll - item.pos;
      item.mesh.visible = Math.abs(offset) < CULL_DISTANCE;
      item.material.uniforms.progress.value = offset;
    }

    this.renderer.render(this.scene, this.camera);
  }

  // Swup 遷移で DOM が差し替わるたびに呼ぶ。
  // 破棄しないと WebGL コンテキストが上限（およそ16）まで溜まる。
  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    gsap.ticker.remove(this.tick);
    window.removeEventListener("resize", this.onResize);
    this.timeline.kill();
    gsap.set(this.items, { clearProps: "all" });

    for (const { mesh, material } of this.meshes) {
      this.scene.remove(mesh);
      material.uniforms.uTexture.value?.dispose();
      material.dispose();
    }
    this.geometry.dispose();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
