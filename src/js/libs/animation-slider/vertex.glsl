uniform float progress;

varying vec2 vUv;
varying vec3 vPosition;

float PI = 3.1415926535897932384626433832795;

vec3 rotateY(vec3 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  vUv = uv;

  // progress はスクロール量（1スライド = 2.0）。板を縦に流しつつ、
  // 中央（y=0）で正面、上下へ離れるほど Y 軸まわりに倒す。
  vec3 pos = position;
  pos.y += progress;
  pos = rotateY(pos, -cos(smoothstep(-2., 2., pos.y) * PI ));

  vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vPosition = worldPosition;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
