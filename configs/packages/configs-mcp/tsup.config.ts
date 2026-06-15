import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  minify: false,
  sourcemap: false,
  clean: true,
});
