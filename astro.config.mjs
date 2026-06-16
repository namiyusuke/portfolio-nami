// @ts-check
import { fileURLToPath } from "node:url";

import globalData from "@csstools/postcss-global-data";
import { defineConfig } from "astro/config";
import customMedia from "postcss-custom-media";

// カスタムメディア定義ファイル（@custom-media を集約）
const customMediaPath = fileURLToPath(new URL("./src/styles/custom-media.css", import.meta.url));

// https://astro.build/config
export default defineConfig({
  vite: {
    css: {
      // PostCSS でカスタムメディアを展開する。
      // Astro はスコープ付き <style> もこの PostCSS パイプラインを通すため、
      // global-data で定義を全 CSS に供給することで、どのコンポーネントからでも
      // `@media (--md)` を参照できる。
      postcss: {
        plugins: [
          globalData({ files: [customMediaPath] }),
          customMedia(),
        ],
      },
    },
  },
});
