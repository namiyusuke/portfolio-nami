varying vec2 vUv;

uniform float uBend;      // 湾曲の強さ
uniform float uFlip;      // フリップの進行度(0→1)
uniform float uFlipBend;  // 未使用(元コードのまま)
uniform float uAngle;     // 自転量(0→1 で 2 回転)

varying vec3 test;        // .r に |pos.z| を格納(陰影づけに再利用)

float quarticOut(float t) {
  return pow(t - 1.0, 3.0) * (1.0 - t) + 1.0;
}

// 2次イーズアウト: -t(t-2) = 2t - t²
float quadraticOut(float t) {
  return -t * (t - 2.0);
}

// 任意軸まわりの回転行列(ロドリゲスの回転公式)
mat4 rotation3d(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat4(
    oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
    0.0,                                0.0,                                0.0,                                1.0
  );
}

void main() {
  vUv = uv;
  vec3 pos = position;

  // 上辺を軸に、下へいくほど反る
  float bend = (quadraticOut(uv.y) - 1.0) * uBend;

  // 左端から右端へ時間差でめくれる(uv.x を閾値に混ぜているのがポイント)
  float flipProgress = smoothstep(0.0 + uv.x * 0.4, 0.8 + uv.x * 0.2, uFlip);

  // Z軸まわりの自転
  pos = (rotation3d(vec3(0.0, 0.0, 1.0), uAngle * 3.14 * 4.0) * vec4(pos, 1.0)).xyz;

  // 斜め軸まわりのめくれ(最大180°)＋ 自転量の合成
  pos = (rotation3d(vec3(1.6, 1.0, 0.5), 3.14 * flipProgress * 1.0 + uAngle * 3.14 * 4.0) * vec4(pos, 1.0)).xyz;

  // 回転後に足すので、向きに関係なく常に奥行き方向へ反る
  pos.z += bend * 6.0;

  test.r = abs(pos.z);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
