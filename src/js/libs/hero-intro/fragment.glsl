varying vec2 vUv;
varying vec3 test;

uniform sampler2D uTexture;
uniform float uOpacity;   // ライフサイクルのフェード(0→1→0)
uniform vec3  uFogColor;  // 奥で溶け込ませる背景色

void main() {
  // 裏面はUVを左右反転して、絵柄が鏡文字にならないようにする
  vec2 uvF = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
  vec3 col = texture2D(uTexture, uvF).rgb;

  // 裏面は少し沈ませて、表裏の区別をつける
  if (!gl_FrontFacing) col = mix(col, uFogColor, 0.45);

  // test.r(Z変位量)を疑似シェーディングに再利用: 反っている部分ほど暗く
  col *= 1.0 - clamp(test.r * 0.10, 0.0, 0.40);

  // 内側に細い白フチ
  float inner = step(0.02, vUv.x) * step(0.02, vUv.y)
              * step(vUv.x, 0.98) * step(vUv.y, 0.98);
  col = mix(vec3(0.92), col, inner);

  gl_FragColor = vec4(col, uOpacity);
}
