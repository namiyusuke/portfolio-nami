/** @type {import('markuplint').Config} */
export default {
  parser: {
    "\\.php$": "@markuplint/php-parser",
  },
  extends: ["markuplint:recommended"],
  rules: {
    // インライン JS（onclick 等）は禁止。JS は外部ファイルで管理する
    "no-use-event-handler-attr": true,
    // WP テーマは PHP パーシャルの集合体であるため以下を無効化
    "doctype": false,
    "required-h1": false,
    "character-reference": false,
    "permitted-contents": false,
    "required-element": false,
    "no-orphaned-end-tag": false,
    // PHP コードが属性位置に展開されるとパーサーがプレースホルダを不正属性と判定するため無効化
    "invalid-attr": false,
  },
  nodeRules: [
    {
      // <html <?php language_attributes(); ?>> の lang・PHP属性は動的出力のため無効化
      selector: "html",
      rules: {
        "required-attr": false,
        "invalid-attr": false,
      },
    },
    {
      // head 内の必須要素チェックを無効化（wp_head() が動的に出力するため）
      selector: "head",
      rules: {
        "required-element": false,
      },
    },
  ],
};
