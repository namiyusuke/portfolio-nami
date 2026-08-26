import gsap from "gsap";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { BLUR_FRAGMENT, BRIGHT_FRAGMENT, COMPOSITE_FRAGMENT, QUAD_VERTEX } from "./holo-effect.js";
import { createHoloEnvironment } from "./holo-environment.js";

const MODEL_URL = "/human.glb";

// three 同梱の glTF 用デコーダを public/draco へコピーして自己ホストしている。
// three が export している DRACO_GLTF_CONFIG は使えない:
// あれは three のソース位置からの相対 URL なので、dev では Vite の事前バンドル先
// (node_modules/.vite/deps/)を基準に解決されてしまい 404 になる。
// 絶対パスなら dev / build のどちらでも同じ場所を指す。
// gstatic から取ると FV の表示に外部ドメインへの接続が 1 本挟まるため、CDN も使わない。
const DRACO_PATHS = {
  js: "/draco/draco_wasm_wrapper.js",
  wasm: "/draco/draco_decoder.wasm",
};

// FV は Animation / Projects のキャンバスと同じページで動く。
// 単体で回すときの設定をそのまま持ってくると食い合うので、解像度は控えめに振る。
const QUALITY = {
  desktop: { pixelRatio: 1.5, bloomScale: 0.5, blurPasses: 2, samples: 4 },
  mobile: { pixelRatio: 1.25, bloomScale: 0.35, blurPasses: 2, samples: 0 },
};

const BLOOM_THRESHOLD = 0.01;
const BLOOM_STRENGTH = 0.3;

// bloom の色。シーンの色(シアン/マゼンタ)は捨てて輝度だけ使い、この 2 色の
// グラデーションで塗り直す。CSS と同じ sRGB の hex で書いて、描画時にリニアへ変換する。
// 角度もサイト背景(global.css の body::before)の 162.93deg に合わせてある。
const BLOOM_COLOR_A = "#7cf0b4";
const BLOOM_COLOR_B = "#1e5a46";
const BLOOM_ANGLE_DEG = 162.93;
// カメラに収めるときの余白(1.0 でぴったり)
const FRAME_MARGIN = 1.35;

// スクロールで往復させる 2 つの構図。
// モデルは高さ 1 に正規化してあるので、足元が y=-0.5、頭頂が y=+0.5。
// height = 画面に収める世界単位の高さ、focusY = 画面中央に置く高さ。
const FRAMING = {
  // 全身
  start: { focusY: 0, height: 1 },
  // 上半身(胸から頭まで)
  end: { focusY: 0.28, height: 0.45 },
};

export default class HeroHolo {
  constructor({ section, container }) {
    this.section = section;
    this.container = container;
    this.quality = window.matchMedia("(max-width: 767px)").matches ? QUALITY.mobile : QUALITY.desktop;

    this.width = 0;
    this.height = 0;
    this.time = 0;
    // スクロール区間を 0〜1 に正規化した値。カメラの寄りを駆動する
    this.progress = 0;
    this.running = false;
    this.visible = false;
    this.disposed = false;

    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();

    this.tick = this.render.bind(this);
    this.onResize = this.handleResize.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  async init() {
    this.readSize();
    this.setupRenderer();
    this.setupScene();
    this.setupPost();
    await this.loadModel();

    // 読み込み中に Swup 遷移が起きていたら、もう描き始めない
    if (this.disposed) {
      return;
    }

    this.observe();
    this.section.classList.add("is-ready");
  }

  // -- setup ------------------------------------------------------

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      // 描画はすべてレンダーターゲット経由なので、既定フレームバッファの MSAA は効かない。
      // アンチエイリアスは sceneRT の samples でかける。
      antialias: false,
      // 背面にサイト共通の背景(body::before のグラデーション)を透かすので透過で持つ
      alpha: true,
      stencil: false,
      // 画面へは合成用の quad を 1 枚描くだけなので深度は要らない
      depth: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(this.width, this.height);
    // sceneRT をアルファ 0 で塗る。モデルの居ない画素が抜けて背景が透ける
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // three の ACES は内部で toneMappingExposure / 0.6 している。
    // 0.6 で実効 1.0 倍(素通し)。ここを上げると環境マップの緑が白へ飛ぶ。
    this.renderer.toneMappingExposure = 0.6;
    this.container.appendChild(this.renderer.domElement);
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 100);
    // モデルはこのグループごと回す(反射の回転とは別軸で動かしたいため)
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.envMap = createHoloEnvironment(this.renderer);
  }

  setupPost() {
    const { width, height } = this.bufferSize();
    const bloom = this.bloomSize();

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeometry);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);

    // HalfFloat。暗い背景をリニアの 8bit で持つと、ぼかしたときに階調が破綻する
    this.sceneRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: this.quality.samples,
    });

    const bloomOptions = {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.bloomA = new THREE.WebGLRenderTarget(bloom.width, bloom.height, bloomOptions);
    this.bloomB = new THREE.WebGLRenderTarget(bloom.width, bloom.height, bloomOptions);

    // 全画面 quad は常に手前を塗り潰すだけなので、深度は一切使わない
    const quadOptions = { depthTest: false, depthWrite: false };

    this.brightMaterial = new THREE.ShaderMaterial({
      ...quadOptions,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: BLOOM_THRESHOLD },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: BRIGHT_FRAGMENT,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      ...quadOptions,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      ...quadOptions,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uBloomStrength: { value: BLOOM_STRENGTH },
        // 合成シェーダはリニア空間で計算しているので、色もリニアへ変換して渡す
        uBloomColorA: { value: new THREE.Color(BLOOM_COLOR_A).convertSRGBToLinear() },
        uBloomColorB: { value: new THREE.Color(BLOOM_COLOR_B).convertSRGBToLinear() },
        uBloomAngle: { value: THREE.MathUtils.degToRad(BLOOM_ANGLE_DEG) },
        uScanline: { value: 0.12 },
        uRgbShift: { value: 0.0018 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
    });
  }

  loadModel() {
    // human.glb は Draco 必須(extensionsRequired)なのでデコーダを外せない。
    // オブジェクト形式で渡すと wasm だけを取りに行く(JS 版フォールバックは読まない)。
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATHS);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    return new Promise((resolve, reject) => {
      loader.load(
        MODEL_URL,
        (gltf) => {
          // デコーダの worker はモデル 1 体を展開したら用済み
          draco.dispose();

          if (this.disposed) {
            resolve();
            return;
          }

          try {
            this.addModel(gltf.scene);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        undefined,
        (error) => {
          draco.dispose();
          reject(error);
        },
      );
    });
  }

  addModel(root) {
    let mesh = null;
    root.traverse((child) => {
      if (!mesh && child.isMesh) {
        mesh = child;
      }
    });

    if (!mesh) {
      throw new Error("hero-holo: glb にメッシュが見つからない");
    }

    const geometry = mesh.geometry;
    geometry.center();
    geometry.computeBoundingBox();

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    // 高さ 1 に正規化しておくと、カメラの寄りをモデルの実寸に依存させずに決められる
    this.modelAspect = size.x / size.y;

    this.material = new THREE.MeshStandardMaterial({
      metalness: 1,
      roughness: 0.26,
      envMap: this.envMap,
      // 環境マップが 1.0 未満に収まっているぶん、ここで持ち上げて陰影を出す。
      // roughness でぼけた反射になるので、映る明部は環境マップの値よりかなり下がる
      envMapIntensity: 2.4,
    });

    this.model = new THREE.Mesh(geometry, this.material);
    this.model.scale.setScalar(1 / size.y);
    this.group.add(this.model);
    this.frameCamera();
  }

  observe() {
    // FV を通り過ぎたら描画を止める。
    // 下の Animation / Projects のキャンバスと GPU を食い合わせないための一番効く対策。
    this.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) {
          this.start();
        } else {
          this.stop();
        }
      },
      { threshold: 0 },
    );
    this.intersectionObserver.observe(this.section);

    // 100svh 指定はモバイルのアドレスバー開閉でも動くので、window の resize では拾い切れない
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
  }

  // -- loop -------------------------------------------------------

  start() {
    if (this.running || this.disposed || document.hidden) {
      return;
    }
    // Lenis と同じ gsap.ticker に乗せて描画ループを 1 本化する
    gsap.ticker.add(this.tick);
    this.running = true;
  }

  stop() {
    if (!this.running) {
      return;
    }
    gsap.ticker.remove(this.tick);
    this.running = false;
  }

  render(_time, deltaTime) {
    // タブ復帰などで大きく飛んだフレームは丸めて、回転が瞬間移動しないようにする
    const delta = Math.min(deltaTime / 1000, 0.05);
    this.time += delta;

    this.group.rotation.y += delta * 0.25;

    // スクロール量に応じて全身 → 上半身へ寄る
    this.progress = this.getProgress();
    this.frameCamera();

    // ポインタへ緩やかに追従(フレームレートに依存しない補間)
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-6 * delta));
    this.group.rotation.x = this.pointer.y * 0.12;
    this.group.position.x = this.pointer.x * 0.05;

    // 反射だけモデルと別速度で回すと、金属面にホログラムのうねりが出る。
    // envMapRotation は three が毎フレーム参照するので needsUpdate は要らない。
    this.material.envMapRotation.y = this.time * 0.35;
    this.material.envMapRotation.x = Math.sin(this.time * 0.2) * 0.25;

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.render(this.scene, this.camera);

    this.brightMaterial.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.drawQuad(this.brightMaterial, this.bloomA);

    const { width, height } = this.bloomA;
    for (let pass = 0; pass < this.quality.blurPasses; pass += 1) {
      this.blurMaterial.uniforms.tDiffuse.value = this.bloomA.texture;
      this.blurMaterial.uniforms.uDirection.value.set(1 / width, 0);
      this.drawQuad(this.blurMaterial, this.bloomB);

      this.blurMaterial.uniforms.tDiffuse.value = this.bloomB.texture;
      this.blurMaterial.uniforms.uDirection.value.set(0, 1 / height);
      this.drawQuad(this.blurMaterial, this.bloomA);
    }

    this.compositeMaterial.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.compositeMaterial.uniforms.tBloom.value = this.bloomA.texture;
    this.compositeMaterial.uniforms.uTime.value = this.time;
    this.drawQuad(this.compositeMaterial, null);
  }

  // 指定したマテリアルで全画面 quad を target(null なら画面)へ描く
  drawQuad(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCamera);
  }

  // -- events -----------------------------------------------------

  handlePointerMove(event) {
    this.pointerTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else if (this.visible) {
      this.start();
    }
  }

  handleResize() {
    // ResizeObserver はレイアウトのたびに鳴るので、実寸が変わったときだけ作り直す
    if (!this.readSize() || !this.width || !this.height) {
      return;
    }

    this.renderer.setSize(this.width, this.height);

    const { width, height } = this.bufferSize();
    const bloom = this.bloomSize();
    this.sceneRT.setSize(width, height);
    this.bloomA.setSize(bloom.width, bloom.height);
    this.bloomB.setSize(bloom.width, bloom.height);
    this.compositeMaterial.uniforms.uResolution.value.set(width, height);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.frameCamera();
  }

  // -- helpers ----------------------------------------------------

  readSize() {
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight;

    if (width === this.width && height === this.height) {
      return false;
    }

    this.width = width;
    this.height = height;
    return true;
  }

  bufferSize() {
    const ratio = this.renderer.getPixelRatio();
    return {
      width: Math.max(1, Math.round(this.width * ratio)),
      height: Math.max(1, Math.round(this.height * ratio)),
    };
  }

  bloomSize() {
    const { width, height } = this.bufferSize();
    return {
      width: Math.max(1, Math.round(width * this.quality.bloomScale)),
      height: Math.max(1, Math.round(height * this.quality.bloomScale)),
    };
  }

  // セクションのスクロール区間を 0〜1 に正規化する(Animation セクションと同じ考え方)
  getProgress() {
    const rect = this.section.getBoundingClientRect();
    const distance = rect.height - window.innerHeight;

    // WebGL 無効時の高さ(1画面ぶん)のままだと区間が無いので、その場合は全身のまま
    if (distance <= 0) {
      return 0;
    }

    return Math.min(Math.max(-rect.top / distance, 0), 1);
  }

  // 指定した世界単位の高さが画面に収まるカメラ距離。
  // 肩幅は上半身に寄っても残るので、横方向は常に全身の幅で判定する
  fitDistance(worldHeight) {
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const distanceV = ((worldHeight / 2) * FRAME_MARGIN) / half;
    const distanceH = ((this.modelAspect / 2) * FRAME_MARGIN) / (half * this.camera.aspect);

    return Math.max(distanceV, distanceH);
  }

  frameCamera() {
    if (!this.model) {
      return;
    }

    // 端で加減速させて、寄り始め・寄り終わりを滑らかにする(smoothstep)
    const p = this.progress;
    const t = p * p * (3 - 2 * p);
    const focusY = FRAMING.start.focusY + (FRAMING.end.focusY - FRAMING.start.focusY) * t;
    const height = FRAMING.start.height + (FRAMING.end.height - FRAMING.start.height) * t;

    // 寄っても目線の高さは被写体に合わせる(見上げ・見下ろしにしない)
    this.camera.position.set(0, focusY, this.fitDistance(height));
    this.camera.lookAt(0, focusY, 0);
  }

  // -- teardown ---------------------------------------------------

  destroy() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.stop();
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pointermove", this.onPointerMove);

    this.model?.geometry.dispose();
    this.material?.dispose();
    this.envMap?.dispose();

    this.quadGeometry?.dispose();
    this.brightMaterial?.dispose();
    this.blurMaterial?.dispose();
    this.compositeMaterial?.dispose();
    this.sceneRT?.dispose();
    this.bloomA?.dispose();
    this.bloomB?.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }

    this.section.classList.remove("is-ready", "is-webgl");
  }
}
