// WebGL2 が使えるかどうかの判定。
// WebGPURenderer も WebGPU 非対応環境では WebGL2 バックエンドへ落ちるため、
// WebGL 版・WebGPU 版どちらのセクションでもこの判定を入口に使う。
export const isWebGL2Available = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
  } catch {
    return false;
  }
};
