// @ts-check
import { fileURLToPath } from "node:url";

import globalData from "@csstools/postcss-global-data";
import sanity from "@sanity/astro";
import { defineConfig } from "astro/config";
import customMedia from "postcss-custom-media";
import { loadEnv } from "vite";

// カスタムメディア定義ファイル（@custom-media を集約）
const customMediaPath = fileURLToPath(new URL("./src/styles/custom-media.css", import.meta.url));

// astro.config は Node 側で評価されるため import.meta.env は使えない。
// .env を Vite のローダーで直接読み込む。
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: env.PUBLIC_SANITY_PROJECT_ID,
      dataset: env.PUBLIC_SANITY_DATASET,
      apiVersion: env.PUBLIC_SANITY_API_VERSION,
      // 静的ビルドなので CDN キャッシュを挟まず常に最新を取得する
      useCdn: false,
    }),
  ],
  vite: {
    css: {
      // PostCSS でカスタムメディアを展開する。
      // Astro はスコープ付き <style> もこの PostCSS パイプラインを通すため、
      // global-data で定義を全 CSS に供給することで、どのコンポーネントからでも
      // `@media (--md)` を参照できる。
      postcss: {
        plugins: [globalData({ files: [customMediaPath] }), customMedia()],
      },
    },
  },
});
