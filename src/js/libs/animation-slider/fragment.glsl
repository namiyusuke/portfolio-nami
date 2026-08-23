uniform sampler2D uTexture;

varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vec3 color = texture2D(uTexture, vUv).rgb;

  // 奥（カメラから遠い側）へ回り込んだ面ほど透過させて、板の重なりをぼかす
  float alpha = smoothstep(-.7, 0., vPosition.z);

  gl_FragColor = vec4(color, 1.0);
}
