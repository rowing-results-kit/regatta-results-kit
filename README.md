# regatta-results-kit v0.1.0

ボート競技大会の速報サイトを一発生成するテンプレートキット。
年度ハブ（協会ページ）＋各大会の速報サイトを静的ファイルで構成し、
**日常運用は Google ツール（Spreadsheet / Drive）だけ**で完結する。

---

> **English summary** — A template kit for rowing regatta live-result websites.
> Fill in `tournament.config.json` and run `scaffold.py` to generate a complete static site.
> Day-to-day operation requires only Google tools (Sheets / Drive → GAS auto-processing). No direct git access needed.

---

## What（このキットでできること）

- **一発生成**: `tournament.config.json` を書いて `scaffold.py` を実行するだけで、大会専用の速報サイトが出来上がる
- **年度ハブ**: 協会の大会一覧ページ（`hub/`）を静的1ページで作成できる。大会追加は `association.json` に1行追記するだけ
- **Googleツールのみで日常運用**: 結果 CSV を Google Drive に置くだけで GAS が自動処理し速報サイトに反映。git への接触は不要

---

## クイックスタート

### A. スラッシュコマンド経由（推奨）

```bash
# 1. テンプレートから新規リポジトリを作成（GitHub 画面で "Use this template"）
# 2. ローカルに clone して Claude Code を起動
cd <your-new-repo>
claude

# 3. ウィザードを起動
/regatta-setup
```

`/regatta-setup` が対話形式で設定を作成し、scaffold 実行・GAS/Pages の手順書提示まで誘導する。

### B. 手動セットアップ

```bash
# 1. テンプレートから新規リポジトリを作成（GitHub 画面で "Use this template"）
# 2. ローカルに clone
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>

# 3. 大会設定ファイルを作成
cp template/tournament.config.example.json tournament.config.json
# → tournament.config.json を編集（大会名・日程・会場・ブランド色 等）

# 4. 一発生成（scaffold）
python3 tools/scaffold.py --config tournament.config.json

# 5. 動作確認
cd site
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く

# 6. Cloudflare Pages に接続してデプロイ（Build output directory = site を必ず設定）
#    詳細は docs/SETUP_GUIDE.generated.md 参照
```

---

## リポジトリ構成

```
regatta-results-kit/
├── hub/                        ← 協会年度ハブ（本ファイル §「年度ハブの使い方」参照）
│   ├── association.json        ← 協会名・大会一覧データ（編集するのはここだけ）
│   └── index.html              ← 年タブ＋大会カード一覧（association.json を fetch して表示）
├── site/                       ← 速報サイト配信テンプレ
│   ├── index.html
│   ├── js/
│   │   ├── app.js              ← フロントエンドロジック
│   │   └── shared.js           ← 共通ユーティリティ（h()・fetchJSON 等）
│   ├── css/style.css
│   ├── data/                   ← scaffold 生成後: master.json・results/ が入る
│   ├── admin/__ADMIN_PATH__/   ← scaffold がランダムパスに置換
│   ├── 404.html
│   ├── _headers
│   └── _redirects
├── staff/__STAFF_PATH__/       ← スタッフ向け HTML テンプレ（6本 + shared.css）
├── gas/                        ← GAS プロジェクト（クリーン版）+ shared/
├── template/                   ← CSV テンプレ・サンプル（フィクションデータ）
│   └── tournament.config.example.json
├── tools/                      ← Python CLI ツール群
│   ├── scaffold.py             ← 一発生成の中枢
│   ├── generate_master.py
│   ├── simulate_pipeline.py
│   ├── init_tournament.py      ← セットアップウィザード
│   └── build_gas.py
├── test/                       ← e2e_test.py + フィクション fixture
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP_GUIDE.md          ← GAS セットアップ手順（手動）
│   └── SPEC_phase3_config.md   ← tournament.config.json スキーマ正本
├── .claude/commands/
│   └── regatta-setup.md        ← /regatta-setup スラッシュコマンド定義
├── .github/workflows/
│   ├── validate.yml
│   └── heartbeat-watchdog.yml
├── Makefile
├── VERSION
├── LICENSE
└── .gitignore
```

---

## GAS セットアップ概要

結果の自動処理（CSV → 速報サイト）は Google Apps Script（GAS）が担う。

> **重要: すべて「利用する協会・大会自身のアカウント」で構築します。**
> Google Drive・スプレッドシート・GAS・GitHub リポジトリ・PAT は、すべて利用者自身のアカウント上に作成するものを使います。本キットの提供者の Google Drive や GitHub を共有・利用する仕組みは一切ありません（キットには提供者のフォルダ ID 等は含まれていません）。インフラもデータも 100% 利用者の所有です。

### 必要なもの（すべて利用者自身のアカウントで用意）

- Google アカウント（無料アカウント可）
- GitHub の **fine-grained Personal Access Token (PAT)**
  - 権限: **Contents: Read and Write**
  - 対象リポジトリ: 速報サイトのリポジトリのみに限定（全リポジトリ権限は付与しない）
  - 有効期限: **90日**（定期的に更新すること）

### セットアップ手順

1. `docs/SETUP_GUIDE.md`（一般手順書）または scaffold 実行後に生成される `docs/SETUP_GUIDE.generated.md`（大会固有値入り・scaffold 実行後に生成されます）を開く
2. GAS プロジェクトを作成し `gas/` 配下のコードを clasp でプッシュする
3. GAS のスクリプトプロパティに PAT・Drive フォルダ ID・GitHub リポジトリ名を設定する
4. GAS で `setupFromConfig()` を実行して初期設定を完了する
5. トリガーを設定（2分間隔の時間ベーストリガーで自動処理）

> PAT は **fine-grained** で発行し、対象リポジトリを速報サイトのリポジトリのみに限定してください。
> Classic token は必要以上に広い権限を持つため推奨しません。

---

## 年度ハブの使い方

`hub/` は協会や組織が複数大会をまとめる「入口ページ」です。
大会速報サイトへのリンクを年タブ形式で一覧表示します。

### 大会を追加するには

`hub/association.json` の `tournaments` 配列に1エントリ追加するだけです。

```json
{
  "id": "spring-2027",
  "name": "サンプル春季ローイング大会",
  "year": 2027,
  "dates": ["2027-05-08", "2027-05-09"],
  "venue": "サンプル漕艇場",
  "status": "upcoming",
  "url": "https://<your-site>.pages.dev"
}
```

| フィールド | 値の例 | 説明 |
|---|---|---|
| `id` | `"spring-2027"` | 一意な識別子（英数字・ハイフン） |
| `name` | `"サンプル春季..."` | 大会名（表示に使用） |
| `year` | `2027` | 年度（年タブの振り分けに使用） |
| `dates` | `["2027-05-08","2027-05-09"]` | 開催日の配列（ISO 8601形式） |
| `venue` | `"サンプル漕艇場"` | 会場名（任意） |
| `status` | `"upcoming"` | `upcoming` / `live` / `final` |
| `url` | `"https://..."` | 速報サイトの URL |

**status の意味**

| 値 | バッジ表示 | 説明 |
|---|---|---|
| `upcoming` | 開催予定（緑） | 開催前 |
| `live` | 速報中（赤・点滅） | 開催中・リアルタイム更新中 |
| `final` | 結果確定（グレー） | 大会終了・「過去大会」セクションに移動 |

`final` の大会は同じ年タブ内の「過去大会」セクションに自動的に分離して表示されます。

### ハブと速報サイトを連携させるには

速報サイト側の `tournament.config.json` に `hub_url` を設定してください。
設定すると、速報サイトのヘッダーに「◀ 大会一覧へ」リンクが自動表示されます。

```json
{
  "tournament": {
    "hub_url": "https://<your-hub>.pages.dev"
  }
}
```

`hub_url` が空または未設定の場合はリンクが表示されません。ハードコードは行いません。

---

## 個人情報に関するガイダンス

速報サイトに選手氏名・所属団体を掲載する場合は、以下を必ず確認してください。

- 選手氏名・所属の公開掲載は、**大会規程および参加申込書に明示された利用目的の範囲内**であることを確認してください
- JARA（日本ボート協会）の個人情報保護方針およびオープンデータ公開規程を参照し、掲載方法を決定してください
- 参加申込の同意内容に掲載が含まれていない場合は、別途、本人の同意を取得してください
- サンプルデータ（`template/` 配下）はすべてフィクションデータです。実際の選手名・所属は含まれていません

---

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。
