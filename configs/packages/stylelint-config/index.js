/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-recess-order", "stylelint-config-html"],
  cache: true,
  fix: true,
  rules: {
    "length-zero-no-unit": true,
    "color-hex-length": "short",
    "color-function-notation": "modern",
    "alpha-value-notation": "number",
    "font-weight-notation": "numeric",
    "function-name-case": "lower",
    "selector-type-case": "lower",
    "value-keyword-case": "lower",
    "declaration-no-important": [true, { severity: "warning" }],
  },
  overrides: [
    {
      // base / reset / vendors レイヤーは !important を許容する
      // - base/reset: prefers-reduced-motion でのアニメーション無効化など
      // - vendors: サードパーティ CSS の詳細度上書きなど
      files: ["**/styles/reset/**", "**/styles/vendors/**"],
      rules: {
        "declaration-no-important": null,
      },
    },
  ],
};
