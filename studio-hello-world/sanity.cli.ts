import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'rdwryb0t',
    dataset: 'production'
  },
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
  vite: {
    ssr: {
      /**
       * `sanity deploy` / `sanity schema extract` は sanity.config.ts を Vite の SSR で
       * 読み込むが、その既定が `ssr.noExternal: true`（全依存をバンドル）になっている。
       * lexorank（@sanity/orderable-document-list の依存）は素の CJS なので、
       * そのままバンドルされると実行時に "exports is not defined" で落ちる。
       * 外部化して Node の CJS ローダーに任せる。
       */
      external: ['lexorank'],
    },
  },
})
