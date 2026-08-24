import * as THREE from "three";

// 金属面に映す環境マップ。
// HDRI や環境用の JPG を読みに行くと、FV の初期表示がその通信を待つことになる。
// 見えているのはぼけた反射だけなので、必要なグラデーションをその場で作って PMREM に通す。

// equirect の縦方向(v)に置く色。トーンマッピング前のリニア値で、
// 1.0 を超える値がそのまま bloom の光源になる。
// 黒基調に緑。metalness:1 のモデルはこの景色をそのまま映すので、
// ここの配分がそのまま人体の見え方になる。
// 値には gain(最大 1.5) × envMapIntensity × toneMappingExposure/0.6 が掛かるので、
// 1.0 を超える値を置くと ACES で白へ張り付く。緑を残すため全部 1.0 未満に収めてある。
const STOPS = [
  [0.0, [0.001, 0.002, 0.0015]],
  [0.3, [0.003, 0.013, 0.008]],
  [0.46, [0.013, 0.075, 0.04]],
  // いちばん明るい帯。ここだけ緑がはっきり出る
  [0.54, [0.09, 0.42, 0.23]],
  [0.62, [0.022, 0.11, 0.06]],
  [0.78, [0.004, 0.016, 0.009]],
  [1.0, [0.001, 0.002, 0.002]],
];

// equirect なので幅は高さの 2 倍。ぼかして使うためこの解像度で足りる。
const HEIGHT = 64;
const WIDTH = HEIGHT * 2;
// 横方向に入れる光源の帯の数。モデルが回ったときに反射が動いて見えるようにする。
const STRIPS = 3;

const sampleGradient = (v) => {
  let index = 0;
  while (index < STOPS.length - 2 && v > STOPS[index + 1][0]) {
    index += 1;
  }

  const [fromV, fromColor] = STOPS[index];
  const [toV, toColor] = STOPS[index + 1];
  const t = toV === fromV ? 0 : (v - fromV) / (toV - fromV);

  return [
    fromColor[0] + (toColor[0] - fromColor[0]) * t,
    fromColor[1] + (toColor[1] - fromColor[1]) * t,
    fromColor[2] + (toColor[2] - fromColor[2]) * t,
  ];
};

export const createHoloEnvironment = (renderer) => {
  const data = new Float32Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    const [r, g, b] = sampleGradient(y / (HEIGHT - 1));

    for (let x = 0; x < WIDTH; x += 1) {
      // 帯の間を暗く落として、回転が反射のうねりとして出るようにする
      const strip = 0.5 + 0.5 * Math.cos((x / WIDTH) * Math.PI * 2 * STRIPS);
      const gain = 0.45 + 1.05 * strip * strip;
      const offset = (y * WIDTH + x) * 4;

      data[offset] = r * gain;
      data[offset + 1] = g * gain;
      data[offset + 2] = b * gain;
      data[offset + 3] = 1;
    }
  }

  const source = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.minFilter = THREE.LinearFilter;
  source.magFilter = THREE.LinearFilter;
  source.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(source).texture;

  // 生成済みのキューブマップだけ残ればいいので、元データはここで捨てる
  pmrem.dispose();
  source.dispose();

  return envMap;
};
