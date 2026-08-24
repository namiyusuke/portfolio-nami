// FV のポストエフェクト用シェーダ。
// sceneRT(リニア) → 明部抽出 → 分離ぼかし → 合成 の順に使う。
// sRGB への変換は合成パスで自前でやる(ShaderMaterial には three が自動で入れてくれないため)。

// 全画面 quad。PlaneGeometry(2,2) をそのままクリップ空間へ置くので行列計算は要らない。
export const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 閾値より明るいぶんだけを取り出す。
export const BRIGHT_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float weight = max(luma - uThreshold, 0.0) / max(luma, 1e-4);
    gl_FragColor = vec4(color * weight, 1.0);
  }
`;

// 分離ガウスぼかし。バイリニア補間を使って 9 タップ相当を 5 フェッチで済ませる。
export const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;

  const float W0 = 0.2270270270;
  const float W1 = 0.3162162162;
  const float W2 = 0.0702702703;
  const float O1 = 1.3846153846;
  const float O2 = 3.2307692308;

  void main() {
    vec3 sum = texture2D(tDiffuse, vUv).rgb * W0;
    sum += texture2D(tDiffuse, vUv + uDirection * O1).rgb * W1;
    sum += texture2D(tDiffuse, vUv - uDirection * O1).rgb * W1;
    sum += texture2D(tDiffuse, vUv + uDirection * O2).rgb * W2;
    sum += texture2D(tDiffuse, vUv - uDirection * O2).rgb * W2;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// 元シーン ＋ bloom ＋ ホログラム(色収差・走査線・周辺減光)。
export const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uBloomStrength;
  uniform vec3 uBloomColorA;
  uniform vec3 uBloomColorB;
  uniform float uBloomAngle;
  uniform float uScanline;
  uniform float uRgbShift;
  varying vec2 vUv;

  vec3 linearToSRGB(vec3 color) {
    vec3 high = pow(color, vec3(1.0 / 2.4)) * 1.055 - 0.055;
    vec3 low = color * 12.92;
    return mix(high, low, step(color, vec3(0.0031308)));
  }

  void main() {
    // 横方向の色ずれ。縦に波を持たせて、走査線と一緒に流れて見えるようにする
    float wave = 0.5 + 0.5 * sin(vUv.y * 90.0 + uTime * 2.0);
    vec2 shift = vec2(uRgbShift * wave, 0.0);

    vec4 center = texture2D(tDiffuse, vUv);
    vec3 base;
    base.r = texture2D(tDiffuse, vUv + shift).r;
    base.g = center.g;
    base.b = texture2D(tDiffuse, vUv - shift).b;

    // bloom は元の色を捨てて輝度だけ使い、指定のグラデーションで塗り直す。
    // 角度は CSS の linear-gradient と同じ流儀(0 = 上向き、時計回り)。
    vec2 dir = vec2(sin(uBloomAngle), cos(uBloomAngle));
    float t = clamp(dot(vUv - 0.5, dir) + 0.5, 0.0, 1.0);
    vec3 tint = mix(uBloomColorA, uBloomColorB, t);

    float bloomLuma = dot(texture2D(tBloom, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 bloom = tint * bloomLuma * uBloomStrength;

    // 出力は premultipliedAlpha(three の既定)。合成は src.rgb + dst.rgb * (1 - src.a) になる。
    // モデルは alpha で背景と入れ替える色なので center.a を掛けるが、
    // bloom は背景に「足す」光なので alpha を掛けない。掛けると、はみ出した光が
    // alpha(= 光の輝度、リニアだと 0.03 程度)ぶんまで薄まって見えなくなる。
    vec3 color = base * center.a + bloom;

    // 走査線。実ピクセル基準なので端末の解像度が変わっても本数が揃う
    float scan = 0.5 + 0.5 * sin(vUv.y * uResolution.y * 1.5 - uTime * 6.0);
    color *= 1.0 - uScanline * scan;

    // 周辺減光。中央のモデルへ視線を寄せる
    float vignette = smoothstep(0.95, 0.25, length(vUv - 0.5));
    color *= mix(0.6, 1.0, vignette);

    // モデルの不透明度に、はみ出した光のぶんを足して背景の隠れ具合を決める
    float glow = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
    float alpha = clamp(center.a + glow, 0.0, 1.0);

    gl_FragColor = vec4(linearToSRGB(max(color, 0.0)), alpha);
  }
`;
