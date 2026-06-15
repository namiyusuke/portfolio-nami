# @yu_nami/oxlint-config

> Oxlint shared config for @yu_nami projects

Oxlint v1 向けの共有設定です。`correctness` カテゴリをエラー、`suspicious` カテゴリを警告として有効化し、Web 制作向けにルールを調整しています。

```bash
npm install -D @yu_nami/oxlint-config oxlint
# or
pnpm add -D @yu_nami/oxlint-config oxlint
```

## Requirements

- **Oxlint**: 1.0.0 以上

---

## Usage

> [!IMPORTANT]
> Oxlint の `.oxlintrc.json` の `extends` は **ファイルパスのみ**対応で、npm パッケージ名での `extends` はできません（[公式ドキュメント](https://oxc.rs/docs/guide/usage/linter/config)）。利用方法は以下の 2 通りです。

### A. `node_modules` のパスを extends する（推奨）

プロジェクトルートの `.oxlintrc.json`:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@yu_nami/oxlint-config/.oxlintrc.json"]
}
```

`extends` は first → last の順にマージされ、後勝ちで上書きできます。プロジェクト固有のルールは下に追記してください。

```jsonc
{
  "extends": ["./node_modules/@yu_nami/oxlint-config/.oxlintrc.json"],
  "rules": {
    "eslint/no-console": "warn"
  }
}
```

### B. ファイルをコピーして使う

`node_modules/@yu_nami/oxlint-config/.oxlintrc.json` をプロジェクトルートにコピーして直接編集する方法です。

---

## 設定内容

### plugins

`typescript` / `unicorn` / `oxc` を有効化しています。

### categories

| カテゴリ | レベル | 説明 |
|---|---|---|
| `correctness` | `error` | 明確に間違っているコード |
| `suspicious` | `warn` | 間違っている可能性が高いコード |

### env

`browser` / `es2024` のグローバルを有効化しています。

> 個別ルールの上書きはせず、カテゴリ単位で有効化する方針です。プロジェクト固有のルールは利用側の `.oxlintrc.json` で追記してください。

---

## Astro / WordPress プロジェクトについて

Oxlint は `.astro` や `.php` をパースしません。これらのテンプレート内の `<script>` は対象外です。`.ts` / `.js` ファイルのみが Lint 対象になります。

---

## License

MIT © yu_nami
