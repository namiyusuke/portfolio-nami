#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// =====================
// Oxlint ガイド
// =====================

const OXLINT_GUIDE = `# @yu_nami/oxlint-config — ルールガイド

Oxlint v1 を対象とした共有設定です（JS / TS / JSX の Linter）。

> ⚠️ Oxlint は **CSS をパースしません**。CSS の Lint は \`@yu_nami/stylelint-config\` を使ってください。

## 基本方針

- 対象: \`.js\` / \`.ts\` / \`.jsx\` / \`.tsx\`（\`.astro\` / \`.php\` テンプレートは対象外）
- plugins: \`typescript\` / \`unicorn\` / \`oxc\` を有効化
- env: \`browser\` / \`es2024\` のグローバルを有効化

## カテゴリ設定

| カテゴリ | レベル | 説明 |
|---|---|---|
| \`correctness\` | \`error\` | 明確に間違っているコード |
| \`suspicious\` | \`warn\` | 間違っている可能性が高いコード |

それ以外（\`pedantic\` / \`style\` / \`perf\` / \`restriction\` / \`nursery\`）はデフォルト（OFF）。
個別ルールの上書きはせず、カテゴリ単位で有効化する方針です。

## 利用方法（extends はパス参照）

Oxlint の \`extends\` は **ファイルパスのみ**対応（npm パッケージ名は不可）。

\`\`\`jsonc
// .oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@yu_nami/oxlint-config/.oxlintrc.json"],
  "rules": {
    "eslint/no-console": "warn"  // プロジェクト固有のルールは後勝ちで上書き
  }
}
\`\`\`

## コード例 — これは通る / 通らない

\`\`\`ts
/* ✅ OK */
const name = "Taro";
let count = 0;

/* ❌ エラー: correctness（未定義変数の参照・到達不能コード等） */
console.log(notDefined);
\`\`\`
`;

// =====================
// Oxfmt ガイド
// =====================

const OXFMT_GUIDE = `# @yu_nami/oxfmt-config — ルールガイド

Oxfmt（Oxc Formatter）を対象とした共有設定です（JS / TS のフォーマッター）。

> ⚠️ Oxfmt は現状 **JS / TS が対象**で CSS は整形しません。CSS は \`@yu_nami/stylelint-config\` 側で管理します。

## フォーマット設定

| 項目 | 設定値 | 説明 |
|---|---|---|
| \`printWidth\` | \`120\` | 行幅 |
| \`tabWidth\` | \`2\` | インデント幅 |
| \`useTabs\` | \`false\` | スペースインデント |
| \`semi\` | \`true\` | 文末セミコロンを付与 |
| \`singleQuote\` | \`false\` | ダブルクォート |
| \`trailingComma\` | \`"all"\` | 末尾カンマを常に付与 |
| \`insertFinalNewline\` | \`true\` | ファイル末尾に改行を付与 |
| \`sortImports\` | \`true\` | import の自動整列（旧 Biome の organizeImports 相当） |

## 利用方法（extends 非対応）

Oxfmt には extends / パッケージ共有の仕組みが無いため、設定ファイルをコピーして使う。

\`\`\`bash
cp node_modules/@yu_nami/oxfmt-config/.oxfmtrc.json .oxfmtrc.json
\`\`\`

または \`oxfmt.config.ts\` で JSON を再エクスポート（\`resolveJsonModule\` 必要）。

\`\`\`ts
import config from "@yu_nami/oxfmt-config/.oxfmtrc.json" with { type: "json" };
export default config;
\`\`\`

## コード例 — フォーマット後の姿

\`\`\`ts
// 行幅 120 / ダブルクォート / セミコロンあり / 末尾カンマあり
import { foo } from "./foo";
import { bar } from "./bar";

const config = {
  name: "Taro",
  items: ["a", "b", "c"],
};
\`\`\`
`;

// =====================
// Stylelint ガイド
// =====================

const STYLELINT_GUIDE = `# @yu_nami/stylelint-config — ルールガイド

## 拡張している設定とその効果

### stylelint-config-recess-order

CSS プロパティの記述順を以下のカテゴリ順に強制します（自動修正あり）。

**順序のカテゴリ（上から優先）**

1. **カスタムプロパティの定義**
   \`--container-max-size\`, \`--grid-cols\` など

2. **ボックスの表示・ポジション**
   \`display\`, \`visibility\`, \`position\`, \`inset\`, \`top\`, \`right\`, \`bottom\`, \`left\`,
   \`z-index\`, \`inline-size\`, \`block-size\`, \`width\`, \`height\`,
   \`margin\`, \`padding\`, \`overflow\`, \`flex\`, \`grid\` 関連

3. **ボーダー**
   \`border\`, \`border-width\`, \`border-style\`, \`border-color\`,
   \`border-radius\`, \`border-image\`, \`outline\`

4. **背景**
   \`background\`, \`background-color\`, \`background-image\`,
   \`background-size\`, \`background-position\`, \`background-repeat\`

5. **文字・フォント**
   \`color\`, \`font-family\`, \`font-size\`, \`font-weight\`,
   \`line-height\`, \`letter-spacing\`, \`text-align\`, \`text-decoration\`,
   \`white-space\`, \`word-break\`

6. **その他**
   \`opacity\`, \`cursor\`, \`pointer-events\`,
   \`transition\`, \`animation\`, \`transform\`

\`\`\`css
/* ✅ OK — カテゴリ順に並んでいる */
.card {
  --card-padding: calc(24 * var(--torem));  /* 1. カスタムプロパティ */

  display: block grid;                      /* 2. ボックス */
  position: relative;
  width: 100%;

  border: 1px solid;                        /* 3. ボーダー */
  border-radius: 8px;

  background-color: var(--color-white);     /* 4. 背景 */

  color: var(--color-dark);                 /* 5. 文字 */
  font-size: calc(16 * var(--torem));

  transition: box-shadow 0.2s;             /* 6. その他 */
}
\`\`\`

### stylelint-config-html

\`.html\`, \`.astro\`, \`.vue\` などの HTML 内 \`<style>\` タグも lint 対象になります。

---

## オプション

| オプション | 設定値 | 説明 |
|---|---|---|
| \`cache\` | \`true\` | 変更がないファイルはスキップ（高速化） |
| \`fix\` | \`true\` | 自動修正を有効化 |

---

## カスタムルール

| ルール | 設定値 | 説明 |
|---|---|---|
| \`length-zero-no-unit\` | \`true\` | \`0px\` → \`0\`（単位を省略） |
| \`color-hex-length\` | \`"short"\` | \`#ffffff\` → \`#fff\` |
| \`color-function-notation\` | \`"modern"\` | \`rgb(255, 0, 0)\` → \`rgb(255 0 0)\`（スペース区切り） |
| \`alpha-value-notation\` | \`"modern"\` | \`rgba(0,0,0,0.5)\` → \`rgb(0 0 0 / 50%)\` |
| \`font-weight-notation\` | \`"numeric"\` | \`bold\` → \`700\` |
| \`function-name-case\` | \`"lower"\` | 関数名は小文字 |
| \`selector-type-case\` | \`"lower"\` | タイプセレクターは小文字 |
| \`value-keyword-case\` | \`"lower"\` | 値のキーワードは小文字 |
| \`declaration-no-important\` | \`true\`（警告） | \`!important\` は使わない（緊急時は警告を無視して可） |

---

## コード例

\`\`\`css
/* ✅ OK */
.heading {
  font-size: calc(32 * var(--torem));
  font-weight: 700;
  line-height: 1.4;
  color: var(--color-dark);
}

.overlay {
  background-color: rgb(0 0 0 / 50%);
}

/* ❌ エラー: font-weight-notation */
.heading { font-weight: bold; }

/* ❌ エラー: color-function-notation */
.overlay { background-color: rgba(0, 0, 0, 0.5); }

/* ❌ エラー: length-zero-no-unit */
.box { margin: 0px; }

/* ⚠️ 警告: declaration-no-important */
.override { color: red !important; }
\`\`\`

---

## よく使うパターン

\`\`\`css
/* 文字サイズ（px を rem に変換） */
font-size: calc(24 * var(--torem));

/* カスタムメディアクエリ（Lightning CSS でトランスフォーム） */
@media (--md) { ... }
@media (--lg) { ... }

/* コンテナークエリ */
.card {
  container: card / inline-size;
}

/* ネスト内の記述順序 */
.button {
  /* 1. 要素のスタイル */
  display: block;

  /* 2. コンテナー / メディアクエリ */
  @container (inline-size >= 40rem) { ... }

  /* 3. 擬似要素 */
  &::after { ... }

  /* 4. 擬似クラス */
  &:hover, &:focus-visible { ... }
  &:disabled { ... }

  /* 5. 結合子 */
  & + & { ... }
  & > * { ... }
}
\`\`\`
`;

// =====================
// Markuplint ガイド
// =====================

const MARKUPLINT_GUIDE = `# @yu_nami/markuplint-config — ルールガイド

3種類のプリセットを提供しています。

## プリセット一覧

| プリセット | 対象 | extends の書き方 |
|---|---|---|
| \`@yu_nami/markuplint-config\` | 通常の HTML | \`"extends": ["@yu_nami/markuplint-config"]\` |
| \`@yu_nami/markuplint-config/astro\` | Astro プロジェクト | \`"extends": ["@yu_nami/markuplint-config/astro"]\` |
| \`@yu_nami/markuplint-config/wp\` | WordPress / PHP | \`"extends": ["@yu_nami/markuplint-config/wp"]\` |

すべて \`markuplint:recommended\` をベースにしています。

---

## 全プリセット共通のルール

### markuplint:recommended が検証する主な内容

| ルール | 内容 |
|---|---|
| \`invalid-attr\` | 無効な属性・属性値をエラー |
| \`required-attr\` | 必須属性の欠落をエラー（\`alt\`, \`href\`, \`src\` 等） |
| \`permitted-contents\` | 仕様上許可されていない子要素の配置をエラー |
| \`required-element\` | \`<title>\` など必須要素の欠落をエラー |
| \`heading-levels\` | 見出し階層の飛び越し（h1→h3 等）をエラー |
| \`required-h1\` | h1 要素が存在しないページをエラー |
| \`no-empty-palpable-content\` | 内容のない要素をエラー |
| \`character-reference\` | \`&\`, \`<\`, \`>\` 等の特殊文字をエンティティ参照にするよう警告 |
| \`use-list\` | リスト的なコンテンツに適切な ul/ol の使用を推奨 |

### 追加ルール（全プリセット共通）

| ルール | 説明 |
|---|---|
| \`no-use-event-handler-attr\` | \`onclick\`, \`onload\` 等のインライン JS を禁止。JS は外部ファイルで管理する |

---

## HTML の書き方ガイド

### アウトライン（見出し構造）

ページの見出しは h1 から始め、コンテンツの階層に合わせて順番に使う。

\`\`\`html
<!-- ❌ エラー: heading-levels（h2 を飛ばして h3） -->
<h1>タイトル</h1>
<h3>サブタイトル</h3>

<!-- ✅ OK -->
<h1>タイトル</h1>
<section>
  <h2>セクション</h2>
  <section>
    <h3>サブセクション</h3>
  </section>
</section>
\`\`\`

### ランドマーク

ページの主要構造には暗黙のランドマークロールを持つ要素を使う。

\`\`\`html
<body>
  <header><!-- banner -->
    <nav aria-label="メインメニュー"><!-- navigation --></nav>
  </header>
  <main><!-- main --></main>
  <footer><!-- contentinfo --></footer>
</body>
\`\`\`

### 画像

\`alt\` 属性は必ず記述する。装飾目的の画像は空文字で。

\`\`\`html
<!-- ✅ コンテンツ画像 -->
<img src="/assets/images/coffee.jpg" width="480" height="320" alt="コーヒーを淹れている様子" loading="lazy" />

<!-- ✅ 装飾画像 -->
<img src="/assets/images/deco.svg" alt="" />
\`\`\`

---

## astro プリセットの特別ルール

### コンポーネント内の見出し（heading-levels / required-h1）

\`src/components/**/*.astro\` では \`required-h1\` と \`heading-levels\` を無効化。
コンポーネントは h2 や h3 から始まることがあるため。

\`\`\`astro
<!-- ✅ OK: コンポーネントは h3 から始めてよい -->
<!-- src/components/Card.astro -->
<article>
  <h3>{title}</h3>
</article>
\`\`\`

\`src/layouts/**/*.astro\` は \`required-h1: false\`（h1 はページ側で持つため）。

### hgroup の中にコンポーネントを入れる

markuplint は静的解析のため Astro コンポーネントの中身を展開できない。
\`hgroup\` の直下にコンポーネントを置くと「見出しがない」と誤判定されるため、
\`hgroup\` の \`permitted-contents\` を無効化している。

\`\`\`astro
<!-- ✅ OK: hgroup の中にコンポーネントを入れても大丈夫 -->
<hgroup>
  <Heading level={2} text="タイトル" />
  <p>サブタイトル</p>
</hgroup>
\`\`\`

### async 属性

\`<script async>\` などに対して \`required-attr\` を無効化。

---

## wp プリセットの特別ルール

PHP テンプレートは HTML として完結しないため、\`.php\` ファイルに以下を無効化：

| ルール | 理由 |
|---|---|
| \`required-h1\` | テンプレートは部分的な HTML のため |
| \`character-reference\` | PHP コード内の記号をエスケープ不要にするため |
| \`permitted-contents\` | PHP 変数・関数が含まれる要素の静的解析限界のため |
| \`html\` の \`invalid-attr\` / \`required-attr\` | PHP で動的に属性を出力するため |
| \`head\` の \`required-element\` | ヘッダーが分割されているため |
`;

// =====================
// MCP Server
// =====================

const server = new McpServer({
  name: "configs-mcp",
  version: "0.2.2",
});

server.registerTool(
  "get_oxlint_rules",
  {
    description:
      "@yu_nami/oxlint-config（JS/TS の Linter）で有効なカテゴリ・ルール、plugins、extends の書き方、コード例を返す。CSS は対象外（Stylelint を使う）",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: "text", text: OXLINT_GUIDE }] })
);

server.registerTool(
  "get_oxfmt_rules",
  {
    description:
      "@yu_nami/oxfmt-config（JS/TS のフォーマッター）の設定値（行幅・クォート・末尾カンマ・import 整列等）と利用方法、コード例を返す。CSS は対象外",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: "text", text: OXFMT_GUIDE }] })
);

server.registerTool(
  "get_stylelint_rules",
  {
    description:
      "@yu_nami/stylelint-config で有効なルール一覧。CSS プロパティの並び順カテゴリ、色・font-weight 等の記法ルール、コード例を返す",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: "text", text: STYLELINT_GUIDE }] })
);

server.registerTool(
  "get_markuplint_rules",
  {
    description:
      "@yu_nami/markuplint-config のプリセット一覧と有効ルール。Astro コンポーネントの見出し・hgroup 対応、HTML の書き方ガイド（ランドマーク・画像・見出し構造）を返す",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: "text", text: MARKUPLINT_GUIDE }] })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("configs-mcp server running on stdio");
}

main().catch(console.error);
