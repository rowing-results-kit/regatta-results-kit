---
project: regatta-results-kit
version: 1.0.0
inherits: ryuiyamada-design-system
updated: 2026-06-12
---

# DESIGN.md — regatta-results-kit

> Claude Code / Codex が UI を作るとき**毎回最初に読む**設計契約。
> グローバルDS（`ryuiyamada-design-system`）を継承し、
> **このプロジェクト固有の差分と禁止ルール**をここに書く。矛盾がある場合はこのファイルが優先。

---

## 1. このプロダクトは何か

- **何をするものか**: ボート競技大会の速報サイトを協会・実行委員会が自前で構築・運用するためのキット。計測CSVを所定フォルダに置くだけで約2分後に公開サイトが更新される
- **主な利用者**: 競技運営の担当者（非エンジニア）・協会職員・大会運営ボランティア。現場での操作を前提にする
- **利用デバイス**: セットアップ=PC必須。観戦中の閲覧=スマートフォン（375px基準）
- **トーン**: 競技の公的記録・協会資料に準じた信頼感。感嘆符・煽り文句不要。数値と構造で説得する

---

## 2. なぜこのデザインか

漕艇競技は日本のマイナースポーツだが、大会運営は全国高校・大学・社会人の協会が担い、記録は公的に残る。速報サイトはそのインフラ。

**協会の公的トーン × 競技の現場感**という二軸でデザイン判断する。

- SaaSサービスのマーケLP（紫グラデ・丸ボタン・絵文字）は場違い
- スポーツ中継の結果表（タブレータ・鮮明な数値・レーン表現）が参照すべき世界
- 余白を詰めて情報密度を保つ。ゆったり見せる余裕より、必要な情報を素早く取れることが優先

---

## 3. デザイン原則

1. **数値で語る** — 「約2分」「7ステップ」のように具体的数値で伝える。「簡単に」「誰でも」は禁止
2. **構造が読まれる前に意味が伝わる** — 左揃え・罫線・高さの差で情報の重み付けをする。テキストを読まなくても何の画面か分かること
3. **競技の視覚言語を使う** — レーン罫線・ブイ点列・進行バーをモチーフにする。ウォーターフロントの深い青緑がベース
4. **アイコンは線画で語る** — 絵文字は一切禁止。stroke 1.5px のインラインSVGのみ。アイコンがなくても成立するレイアウトを先に作る
5. **信頼は引き算で作る** — 影を盛らない・グラデを使わない・border-radius を最小にする。装飾を削ると公的文書のトーンが出る

---

## 4. カラートークン

CSS変数名のみを使う。HEX直書き禁止。

```css
/* Primary — 水面の深い青緑 */
--color-primary:     #0E4D5C;   /* CTAボタン・リンク・インタラクティブ要素 */
--color-primary-600: #0B3D4A;   /* hover / pressed */
--color-primary-500: #326874;   /* primary背景上のバッジ等。半透明白の不透明代替 */
--color-primary-100: #E0F2F7;   /* badge背景・ハイライト */

/* Accent — 審判旗の赤（1画面1箇所のみ） */
--color-accent:    #C0392B;   /* 勝者・重要アラートのみ */
--color-accent-bg: #FDEDEC;   /* accent淡色背景 */

/* レーンカラー（6レーン = 6色・結果表の色分けに使用） */
--color-lane-1: #0E4D5C;
--color-lane-2: #196B7A;
--color-lane-3: #1F8A9A;
--color-lane-4: #26A9BB;
--color-lane-5: #2EC7DC;
--color-lane-6: #7AD8E4;

/* Surface */
--color-bg:      #FFFFFF;
--color-bg-sub:  #F5F7F8;   /* オフホワイト・生成りトーン */
--color-text:    #1A1A2E;
--color-muted:   #6B7280;
--color-border:  #DDE4E8;   /* 罫線・レーン罫線 */

/* Semantic */
--color-success: #16A34A;
--color-warning: #D97706;
--color-warning-700: #92400E;   /* warning淡色背景上の文字色（コントラスト確保） */
--color-error:   #DC2626;
```

**禁止色**（絶対に使わない）:
- `#7C3AED` / `#8B5CF6` / `#A855F7` — 紫系（汎用SaaSグラデの典型）
- `#60A5FA` + `#A78BFA` の組み合わせ — AIサービス典型の青紫ペア
- 明るい水色（`#22D3EE` 系）の単体使用 — lane-6 より明るい色禁止

---

## 5. タイポグラフィ

```css
font-family: "Noto Sans JP", sans-serif;
font-feature-settings: 'palt' 1, 'kern' 1;  /* 全体に必須 */

/* 使用ウェイトは500と700の2種のみ */
/* 本文: 500 / 見出し・ラベル・強調: 700 */
/* font-weight 400以下禁止（現行 onboarding/index.html が違反） */
```

**日本語組版（必須・例外なし）**:
```css
body {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  hanging-punctuation: first;
}
@supports (word-break: auto-phrase) {
  h1, h2, h3 { word-break: auto-phrase; }
}
```

**数値・タイム表示**:
```css
.time, .rank, .step-num, .kpi {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.02em;
}
```
タイム（例: `7:32.41`）・順位・所要分・ステップ番号は必ず tabular-nums で揃える。大きく表示する。

---

## 6. レーンモチーフの使い方

漕艇コースの6レーン構造をUIに翻訳する。

**使う場所（3箇所に限定）**:
1. **ステップ進行バー** — 水平4px高さのバー。primary-100 → primary に進捗で埋まる
2. **セクション区切り罫線** — 1px 水平線。border色。太くしない
3. **結果テーブルのヘッダー下線** — 2px border-bottom。primary色

**ブイ点列（装飾用）**:
```css
/* 水平線上に6pxの円を8px間隔で並べる */
.buoy-line {
  display: flex;
  gap: 8px;
  align-items: center;
}
.buoy-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary-100);
}
```

**使わない場所**:
- ナビゲーション・フッターへの適用禁止
- 装飾目的のランダム配置禁止
- 同一ページに3箇所超の使用禁止

---

## 7. AIが作った感の禁止リスト（最重要）

現行の LP・onboarding で確認された問題と代替手段を対として明記する。

### 7.1 絵文字アイコン全廃

**なぜ禁止**: 絵文字はフォント依存で表示が崩れる・競技運営の公的文書に不適・最も「AI生成っぽい」要素

```
禁止: 🎉 導入完了！/ ✅ ステップ1 / 🚀 今すぐ始める / 📋 マニュアル
代替: stroke 1.5px のインラインSVG + テキスト
     アイコンがなくても読める設計を先に作り、補助としてSVGを置く
```

### 7.2 全面円形ボタン（border-radius: 9999px）禁止

**なぜ禁止**: LP・CTA・ナビのボタン全部が丸ピル型=SaaSサービスの記号

```css
/* 禁止 */
.btn { border-radius: 9999px; }

/* 代替 */
.btn { border-radius: 4px; } /* var(--radius-md) */
/* バッジ・チップのみ border-radius: 9999px 許可 */
```

### 7.3 box-shadow の多用禁止

現行: `.btn-primary:hover { box-shadow: 0 4px 16px rgba(21,46,88,0.35) }` 等6箇所以上

**なぜ禁止**: 影で「立体感・高級感」を出そうとするのはAI的。区切りは罫線で行う

```css
/* 禁止 */
box-shadow: 0 4px 16px rgba(...);  /* hover時の大きな影 */
box-shadow: var(--shadow-raised);  /* 強い影 */

/* 代替 */
box-shadow: var(--shadow-subtle);  /* 0 1px 2px rgba(0,0,0,0.06) のみ許可 */
/* hover: background-colorを変える。shadowを追加しない */
```

### 7.4 等幅3カラムカード羅列禁止

現行: `.pain-grid { grid-template-columns: repeat(3, 1fr) }` `.kpi-grid { repeat(3, 1fr) }`

**なぜ禁止**: 「3つの特長」「3つの理由」を同じ高さのカードで並べる = AI生成LPの最典型

```css
/* 禁止 */
grid-template-columns: repeat(3, 1fr);  /* 同じ重みのカード3並び */

/* 代替 */
/* 情報の重み付けに応じた非対称グリッドを使う */
grid-template-columns: 2fr 1fr;   /* メイン説明+補足 */
/* またはリスト形式（左ラベル+右値の2カラム表）に変える */
```

### 7.5 セクション全体の text-align: center 禁止

現行: `.kpi-card { text-align: center }` が6箇所以上・KPIセクション全体が中央揃え

**なぜ禁止**: 全部中央揃えは「デザインしていない」状態。左揃え基調が文書・競技記録のトーン

```
禁止: セクション・カード全体への text-align: center
代替: 見出しのみ必要に応じて個別指定
     数値（KPI）は数値を大きく・ラベルは左揃えの独立要素として配置
```

### 7.6 「〜できます」連発トーン禁止

現行: 「確認できます」「作成できます」「運用できます」がボディコピーに連続

**なぜ禁止**: 丁寧語による体験語り口 = AI生成コピーの典型。協会文書は事実を端的に書く

```
禁止: 「7つのステップで完了します。詳しい手順は次のページで確認できます」
代替: 「7ステップ。詳細は次ページ→」
     「計測CSV → 2分後に公開」（動詞を省略して構造で示す）
```

### 7.7 同一構造セクションの反復禁止

**なぜ禁止**: eyebrow → 見出し → 説明文 → CTAが全セクションで同じ = AI的自動生成の構造

```
禁止: 全セクションが同じ「eyebrow/見出し/説明3行/CTA」の繰り返し
代替: セクションごとに構造を変える
     統計: 数値を大きく左揃え・ラベルを下に置く
     ステップ: 縦リスト+右側に実画面モック
     FAQ: Q&Aのアコーディオン形式
```

---

## 8. コンポーネント規約

### ボタン

```css
/* Primary CTA — 1画面1個のみ */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-bg);
  border-radius: var(--radius-md);   /* 4px。9999px禁止 */
  font-weight: 700;
  padding: 0.75rem 1.5rem;
  min-height: 44px;
  /* hover: background-color変更のみ。shadow追加禁止 */
}
.btn-primary:hover { background: var(--color-primary-600); }

/* Secondary */
.btn-secondary {
  background: transparent;
  color: var(--color-primary);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
  font-weight: 700;
}
```

### カード

```css
.card {
  background: var(--color-bg);
  border-radius: var(--radius-md);   /* 4px */
  /* border禁止。罫線で区切る場合は border-bottom 1px のみ */
  /* box-shadowは使用しない（または var(--shadow-subtle) のみ）*/
}
```

### ステップ番号（レーン番号の意匠）

```css
.step-num {
  width: 32px;
  height: 32px;
  background: var(--color-primary);
  color: var(--color-bg);
  border-radius: var(--radius-sm);   /* 2px。9999px禁止 */
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 正方形。円形禁止 */
```

### バッジ・チップ（border-radius: 9999px 唯一の例外）

```css
.badge {
  border-radius: 9999px;   /* ここだけ許可 */
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 700;
}
```

---

## 9. レイアウト規約

- **最大幅**: `min(100%, 1040px)`
- **余白**: 8pxグリッド（0.5rem単位）
- **section padding**: `clamp(4rem, 10vw, 7rem)`
- **基調**: 左揃え。中央揃えは数値KPIの数字部分のみ条件付き許可
- **グリッド**: 非対称グリッド優先（2:1・1:2）。等幅3カラム禁止
- **情報密度**: 高め。競技記録・運営資料を参照する人が対象。ゆったりさより速さ

---

## 10. Do / Don't

| Do | Don't |
|---|---|
| `border-radius: 4px` のボタン | `border-radius: 9999px` のピルボタン |
| stroke 1.5px のインラインSVGアイコン | 絵文字アイコン（🚀 ✅ 🎉） |
| `box-shadow: 0 1px 2px rgba(0,0,0,0.06)` | `box-shadow: 0 4px 16px rgba(..., 0.35)` |
| 左揃え本文、見出しは短く言い切る | セクション全体 `text-align: center` |
| `font-variant-numeric: tabular-nums` で数値を揃える | 数値をデフォルトのまま並べる |
| 非対称2カラムグリッド | 等幅 `repeat(3, 1fr)` カード羅列 |
| 「7ステップ・約2分」（数値で伝える） | 「誰でも簡単に始められます」 |
| 背景色の変化でhover状態を示す | hover時に大きな影を追加する |
| 水平罫線・ブイ点でレーンモチーフを使う | 紫・水色のグラデーション |
| `font-weight: 500 / 700` の2種 | `font-weight: 400`（body に使用禁止） |

---

## 11. アクセシビリティ（必須ライン）

- コントラスト比 WCAG AA: 本文 4.5:1 以上・大文字3:1以上
- `focus-visible` リング必須: `outline: 2px solid var(--color-primary); outline-offset: 2px`
- タップターゲット最小 44×44px
- `<html lang="ja">` 必須
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` 必須
- 日本語禁則処理（§5参照）

---

## 12. AI（Claude/Codex）への指示

- UI実装前に必ずこのファイルと global DS を読む
- HEX直書きは禁止。tokens.json の変数名を参照する
- §7の禁止リスト（AI感の排除）を実装前にチェックリストとして使う
- 迷ったら「競技記録・協会資料のトーン」で判断する
- 絵文字を使いたくなったら SVG アイコンに変える
- 丸ボタンを使いたくなったら `border-radius: 4px` にする
- 影を盛りたくなったら `border-bottom: 1px solid var(--color-border)` に変える
- 「読む負担を感じさせない、みてわかるレイアウト」をデフォルト前提にする

---

## 13. 既存グローバル禁止則の継承（ryuiyamada-design-system/rules.json より）

- グラデーション全面禁止（背景・ボタン・カードいずれも）
- glassmorphism 禁止（backdrop-filter: blur 等）
- 円グラフ禁止
- カードへの border 禁止（box-shadow のみ許可だが上記 shadow 規定を優先）
- font-weight 300 以下禁止
- `transition: all` 禁止

---

## 14. カラートークンの主従関係（大会別ブランド）

本キットには `--color-primary` を名乗るトークンが複数箇所に存在するが、**役割がまったく異なる2系統**に分かれる。混同して一括置換しないこと。

### 14.1 系統A: キット自体のツールUIカラー（固定・統一対象）

regatta-results-kit という**ツール自体**の管理画面・スタッフ資料・ドキュメントに使う色。全プロジェクト共通で**固定**し、大会ごとに変えない。

| ファイル | 変数 | 値 |
|---|---|---|
| `DESIGN.md` / `tokens.json`（本キット正本） | `--color-primary` | `#0E4D5C` |
| `staff/__STAFF_PATH__/shared.css` | `--color-primary` | `#0E4D5C` |
| `gas/portal.html`（管理者ポータル自体のUIクロム: ヘッダー・タブ・ボタン等） | `--color-primary` | `#0E4D5C` |
| `docs/onboarding/index.html` 他ドキュメント類 | `--color-primary` | `#0E4D5C` |

これらは2026-07-16のGate1承認で `#2D4F2C`（旧グリーン）から `#0E4D5C`（水面の深い青緑）へ統一済み。

### 14.2 系統B: 大会ごとにカスタマイズされるブランドカラー（可変・保護対象）

**各大会の速報サイト自体**が表示する色。協会・大会ごとに `tournament.config.json` / `theme.json` 経由で自由に変更してよく、系統Aの値と一致させる必要はない（むしろ大会独自色であることが前提）。

| ファイル | 該当箇所 | 例 |
|---|---|---|
| `site/css/style.css` | `:root { --color-primary: #24602A; }`（コメント: `brand.primary_color 相当。scaffold 生成時はここを上書き`） | 大会ごとに任意の色 |
| `gas/portal.html` | `MOCK.portalGetTheme` のサンプル値・デザインタブのプレビュー初期値（`#2D4F2C` 等） | 大会ごとに任意の色 |
| `docs/system-map.html` | 独立した図解用トークン（`--color-primary:#2D4F2C` 等）。本キットUIとは無関係の別配色 | 図解専用・変更不要 |

**やってはいけないこと**: 系統Bの値を系統Aに合わせて機械的に置換すること（大会の独自ブランドを壊す）。今回のスプリントで系統Bの値には手を入れていない。

### 14.3 判定基準

迷ったら「この色は大会運営者が変えたいと思うか？」で判断する。
- Yes（大会名・会場・ロゴに紐づく色）→ 系統B・触らない
- No（キットの管理画面・スタッフ資料自体の見た目）→ 系統A・統一対象

---

## 📜 更新履歴

- 2026-07-16 — Sprint 3（公開品質）Gate1承認反映: 絵文字ゼロ化・グラデーション/backdrop-filter全廃・キットUIカラー統一（#2D4F2C→#0E4D5C）・コントラスト調整（gold/silver/warning-700等）・font-weight/radius整理・§14「カラートークンの主従関係」新設
- 2026-06-12 — 初版。LP・onboarding の AI感特定・レーンモチーフ規定・禁止リスト制定
