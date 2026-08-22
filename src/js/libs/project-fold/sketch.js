import gsap from "gsap";
import * as THREE from "three/webgpu";
import { getLenis } from "../lenis.js";
import { clearPageExit, registerPageExit } from "../page-exit.js";
import { handoffProjectHero, HERO_HANDOFF_CLASS } from "../project-hero.js";
import { getSwup } from "../swup.js";
// 板のサイズ・カメラ設定は詳細ページの画像配置と共有する(遷移で画像を動かさないため)
import { CAMERA_FOV, CAMERA_Z, PLANE_HEIGHT, PLANE_WIDTH, plateScale } from "./plate-metrics.js";
import {
  float,
  Fn,
  frontFacing,
  mix,
  positionLocal,
  pow,
  rotate,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

const BG_Z = -2; // 背景テキスト板の奥行き
// マーキーは上下中央の1行だけ。行の高さは表示範囲の高さに対する比率で決める
const BG_ROW_HEIGHT = 1 / 6;
const TEXT_SPEED = 0.05;
const TEXT_OPACITY = 0.35;

const FADE_HOLD = 2.6; // 次のプロジェクトへ切り替わるまでの待ち時間(秒)
const FADE_DURATION = 1.2; // クロスフェードにかける時間(秒)
const FOLD_DURATION = 2.4; // 折りたたみ / 展開にかける時間(秒)

// 遷移演出（折りたたみの続き）
const ALIGN_DURATION = 0.6; // ステージをビューポートに揃えるスクロールの時間(秒)
const LAND_FALLBACK = 4000; // 入場側が呼ばれなかったときに板を片付けるまで(ms)

// tsl-easings を足さずに済むよう、使う2本だけ TSL で持つ
const easeOutQuad = (x) => x.oneMinus().pow(2).oneMinus();
const easeInOutCubic = (x) =>
  mix(x.pow(3).mul(4), float(1).sub(x.mul(-2).add(2).pow(3).div(2)), step(0.5, x));

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
// 板は常に1枚で、テクスチャ(=プロジェクト)を一定間隔でクロスフェードしながら
// 巡回する。板(またはタイトルのリンク)をクリックすると折りたたみが始まり、
// めくれた板を画面に残したまま中身が詳細ページに差し替わる → その板が
// 詳細ページのメイン画像の位置へ収まって実物と入れ替わる、という流れで遷移する。
export default class ProjectFold {
  constructor({ section, container, items, textures, texts, release }) {
    this.section = section;
    this.container = container;
    this.items = items;
    this.texts = texts;
    this.urls = textures;
    this.release = release;
    this.disposed = false;
    this.current = 0;
    this.folded = false;
    this.leaving = false;
    // canvas を body 直下へ移して、遷移をまたいで見せている間 true
    this.detached = false;
    this.exitTweens = [];
    this.exitResolvers = [];
    this.time = 0;

    this.uniforms = {
      time: uniform(0),
      progress: uniform(0), // 0 = 平ら / 1 = 折りたたみ完了
      texMix: uniform(0), // 0 = current / 1 = next
      textRepeat: uniform(new THREE.Vector2(1, 1)), // 背景テキストの横タイル数(x=current, y=next)
      textSpeed: uniform(TEXT_SPEED),
      textOpacity: uniform(TEXT_OPACITY),
    };
  }

  // WebGPU のデバイス取得は非同期なので constructor から分離する
  async init() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.startCycle();

    // 詳細ページへの遷移は、この板の折りたたみを退場演出として使う
    this.pageExit = this.handlePageExit.bind(this);
    registerPageExit(this.pageExit);

    // Lenis と同じ gsap.ticker に乗せて描画ループを1本化する
    this.tick = this.render.bind(this);
    gsap.ticker.add(this.tick);
  }

  addObjects() {
    const { progress, texMix } = this.uniforms;
    // 巡回のたびに value を差し替えるので、ノードの実体を持っておく
    this.texA = texture(this.textures[0]);
    this.texB = texture(this.textures[Math.min(1, this.textures.length - 1)]);

    this.material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

    this.material.colorNode = Fn(() => {
      // 裏面は鏡像になるので、回転軸(X)に対応する v を反転して向きを揃える
      const backUv = vec2(uv().x, uv().y.oneMinus());
      const finalUv = frontFacing.select(uv(), backUv);
      // current → next を texMix でクロスフェード。表裏どちらの面でも同じ絵になる
      return mix(this.texA.sample(finalUv), this.texB.sample(finalUv), texMix);
    })();

    this.material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      // 回転軸を板の手前(z = 高さの半分)に置くと、ページをめくるように奥から手前へ倒れる
      const center = vec3(0, 0, PLANE_HEIGHT * 0.5);
      const offset = uv().y.add(uv().x).mul(0.4).clamp(0, 1);
      // offset で頂点ごとに遅延させた 0..1 のランプ。このままだと両端が折れ線になるので
      // ランプ自体にもイージングをかけて、各頂点の折れ始め/折れ終わりを滑らかにする
      const ramp = easeOutQuad(progress).sub(pow(offset.mul(0.4), 2)).div(0.6).clamp(0, 1);
      const smoothProgress = easeInOutCubic(ramp);
      return rotate(pos.sub(center), vec3(smoothProgress.mul(-Math.PI), 0, 0));
    })();

    this.geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, 100, 100);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
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

  // 表示中(current)と次(next)のテクスチャをノードへ流し込む
  applyTextures() {
    const next = (this.current + 1) % this.textures.length;
    this.texA.value = this.textures[this.current];
    this.texB.value = this.textures[next];
    this.bgA.value = this.bgTextures[this.current];
    this.bgB.value = this.bgTextures[next];
    // テキストは文字数ごとに帯のアスペクトが違うので、タイル数を引き直す
    this.layoutBackground();
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

  // texMix を 0 → 1 で送っては current を進める、を繰り返してプロジェクトを巡回する
  startCycle() {
    if (this.textures.length < 2) {
      return;
    }

    this.cycle = gsap.timeline({ repeat: -1 }).to(this.uniforms.texMix, {
      value: 1,
      duration: FADE_DURATION,
      delay: FADE_HOLD,
      ease: "power2.inOut", // 等速だと切り替わりの頭と尻が目立つ
      onUpdate: () => this.syncItems(),
      onComplete: () => {
        this.current = (this.current + 1) % this.textures.length;
        this.uniforms.texMix.value = 0;
        this.applyTextures();
        this.syncItems();
      },
    });
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

    const hitMesh = () => {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      return this.raycaster.intersectObject(this.mesh, false).length > 0;
    };

    this.onPointerMove = (event) => {
      updatePointer(event);
      el.style.cursor = hitMesh() ? "pointer" : "";
    };

    this.onPointerDown = (event) => {
      updatePointer(event);
      if (hitMesh()) {
        this.openCurrent();
      }
    };

    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
  }

  // 表示中の項目（クロスフェードで半分を超えた側が「見えている」板）
  currentItem() {
    const index =
      this.uniforms.texMix.value > 0.5 ? (this.current + 1) % this.items.length : this.current;
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
    // クロスフェードの途中で踏まれても、遷移先の板を表向きに確定させてから折る
    if (this.current !== index || this.uniforms.texMix.value > 0) {
      this.current = index;
      this.uniforms.texMix.value = 0;
      this.applyTextures();
      this.syncItems();
    }

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
    this.section.classList.add("is-folded");
    // 遷移先のメイン画像は、板から位置を引き渡すまで隠しておく
    document.documentElement.classList.add(HERO_HANDOFF_CLASS);

    // 板が画面から外れていると引き渡せないので、位置を揃えてスクロールを止める
    this.lockStage();

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
    const width = PLANE_WIDTH * this.mesh.scale.x * pxPerX;
    const height = PLANE_HEIGHT * this.mesh.scale.y * pxPerY;

    return {
      left: canvas.left + canvas.width / 2 + this.mesh.position.x * pxPerX - width / 2,
      top: canvas.top + canvas.height / 2 - this.mesh.position.y * pxPerY - height / 2,
      width,
      height,
    };
  }

  // カメラから板までの距離。折り終わった板は頂点シェーダ側で半分の高さぶん手前に出ている
  plateDistance() {
    return this.camera.position.z - this.mesh.position.z - PLANE_HEIGHT * 0.5 * this.mesh.scale.z;
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
  // Swup が #swup の中身を差し替えても板と背景のテキスト帯はそのまま画面に残り、
  // マーキーも動き続けたまま、差し替わった先の画像へ繋がる
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

    // 板が画面からはみ出さないよう、表示範囲に対して縮める
    this.mesh.scale.setScalar(plateScale(this.camera.aspect));

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
    }

    for (const tex of this.textures ?? []) {
      tex.dispose();
    }
    for (const tex of this.bgTextures ?? []) {
      tex.dispose();
    }
    this.material?.dispose();
    this.bgMaterial?.dispose();
    this.geometry?.dispose();
    this.bgGeometry?.dispose();

    this.renderer?.dispose();
    el?.remove();
  }
}
