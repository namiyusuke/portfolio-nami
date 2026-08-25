uniform float progress;
uniform float uTime;
uniform float uIndex;

varying vec2 vUv;
varying vec3 vPosition;

float PI = 3.1415926535897932384626433832795;

vec3 rotateY(vec3 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

// 捻れが最大になるまでの距離。中央からこの距離（1スライド = 2.0）で効き切る。
// 小さいほど中央を外れた直後から捻れる。
const float TWIST_RANGE = .8;
// 捻れの倍率。1.0 で板の縦位置なりの自然な捻れ、それ以上で誇張される。
const float TWIST_STRENGTH = 1.15;

// 縦位置 y に対する Y 軸まわりの傾き。中央（y = 0）で 0 = 正面。
float tiltAngle(float y) {
  return -cos(smoothstep(-2., 2., y) * PI);
}

void main() {
  vUv = uv;

  vec3 pos = position;

  // 左右の端だけを時間で前後に泳がせる。中央（uv.x = 0.5）では 0 なので、
  // 板の真ん中は動かず端だけがゆらゆらする。uIndex は板ごとに位相をずらすため。
  float edge = abs(uv.x - .5) * 2.;
  pos.z += sin(uTime * 1.5 + uIndex * 1.7 + uv.x * PI * 1.5 + pos.y * 3.) * edge * edge * .06;

  // progress はスクロール量（1スライド = 2.0）。板を縦に流しつつ、
  // 中央（y=0）で正面、上下へ離れるほど Y 軸まわりに倒す。
  pos.y += progress;

  // 板の中の y で角度を決めると板そのものが捻れてしまい、中央に居座る
  // 1枚目まで曲がって見える。板全体の向き（base）を基準に、中心から
  // 離れるほど縦位置なりの角度差を足していく。中央では差が 0 ＝まっすぐ正面。
  float base = tiltAngle(progress);
  float twist = smoothstep(0., TWIST_RANGE, abs(progress)) * TWIST_STRENGTH;
  pos = rotateY(pos, base + (tiltAngle(pos.y) - base) * twist);

  vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vPosition = worldPosition;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
