# @yu_nami/oxfmt-config

> Oxfmt shared config for @yu_nami projects

Oxfmt（Oxc Formatter）向けの共有設定です。スペースインデント / 行幅 120 / ダブルクォートを基本方針としています。

```bash
npm install -D @yu_nami/oxfmt-config oxfmt
# or
pnpm add -D @yu_nami/oxfmt-config oxfmt
```

## Requirements

- **Oxfmt**: alpha 以降（`.oxfmtrc.json` / `oxfmt.config.ts` 対応版）

---

## Usage

> [!IMPORTANT]
> Oxfmt には `extends` や npm パッケージで設定を共有する仕組みが**ありません**（[公式ドキュメント](https://oxc.rs/docs/guide/usage/formatter/config)）。利用方法は以下の 2 通りです。

### A. ファイルをコピーして使う（推奨）

`node_modules/@yu_nami/oxfmt-config/.oxfmtrc.json` をプロジェクトルートにコピーします。

```bash
cp node_modules/@yu_nami/oxfmt-config/.oxfmtrc.json .oxfmtrc.json
```

### B. `oxfmt.config.ts` で再エクスポートする

プロジェクトルートの `oxfmt.config.ts` から JSON を読み込んで再エクスポートします（`tsconfig.json` に `"resolveJsonModule": true` が必要）。

```ts
import config from "@yu_nami/oxfmt-config/.oxfmtrc.json" with { type: "json" };

export default config;
```

プロジェクト固有の上書きが必要な場合:

```ts
import base from "@yu_nami/oxfmt-config/.oxfmtrc.json" with { type: "json" };

export default {
  ...base,
  printWidth: 100,
};
```

---

## 設定内容

| 項目 | 設定値 | 説明 |
|---|---|---|
| `printWidth` | `120` | 行幅 |
| `tabWidth` | `2` | インデント幅 |
| `useTabs` | `false` | スペースインデント |
| `semi` | `true` | 文末セミコロンを付与 |
| `singleQuote` | `false` | ダブルクォート |
| `trailingComma` | `"all"` | 末尾カンマを常に付与 |
| `insertFinalNewline` | `true` | ファイル末尾に改行を付与 |
| `sortImports` | `true` | import の自動整列を有効 |

> Biome の `organizeImports` に相当する import 整列は、Oxfmt 側の `sortImports` で有効化しています。

---

## License

MIT © yu_nami
