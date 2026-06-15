/** @type {import('markuplint').Config} */
export default {
  parser: {
    "\\.astro$": "@markuplint/astro-parser",
  },
  extends: ["markuplint:recommended"],
  rules: {
    // インライン JS（onclick 等）は禁止。JS は外部ファイルで管理する
    "no-use-event-handler-attr": true,
    // Astro はコンポーネントベースのため h1 の存在を静的解析で追えない
    "required-h1": false,
    // コンポーネント単体での見出し階層チェックも意味をなさないため無効化
    "heading-levels": false,
  },
  nodeRules: [
    {
      // hgroup の中に Astro コンポーネントを入れると静的解析できず
      // "見出しがない" と判定されるため permitted-contents を無効化
      selector: "hgroup",
      rules: {
        "permitted-contents": false,
      },
    },
    {
      // <script async> など async 属性が付いた要素の required-attr を無効化
      selector: "[async]",
      rules: {
        "required-attr": false,
      },
    },
  ],
  // ※ components / layouts の required-h1 等は各プロジェクトの .markuplintrc で overrides する
  //   extends 経由の overrides はパスが node_modules 起点になるため機能しない
};
