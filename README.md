# regatta-results-kit v0.1.0

ボート競技大会の速報サイトを一発生成するテンプレートキット。
年度ハブ（協会ページ）＋各大会の速報サイトを静的ファイルで構成し、
**日常運用は Google ツール（Drive）だけ**で完結する。

成果物の提出前は [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) の全項目をパスすること。

---

## 協会担当者の方へ

> 配布者から受け取った URL を開き、7 ステップを自力で完結できます。
>
> **オンボーディングサイト**: https://rowing-results-kit.github.io/regatta-results-kit/onboarding/
>
> ターミナル・Python・git 操作は不要です。すべてブラウザだけで完結します。

---

> **English summary** — A template kit for rowing regatta live-result websites.
> Use this template on GitHub, run the "大会初期構築" workflow from the Actions tab,
> then connect GAS and Cloudflare Pages following the onboarding site above.
> Day-to-day operation requires only Google Drive (upload CSV → GAS auto-processing). No direct git access needed.
>
> **Note**: Data files under `site/data/` are sample data only and do not represent real athletes or participants.

---

## What（このキットでできること）

- **GitHub Actions で一発生成**: Actions タブの "大会初期構築" を Run workflow するだけで、大会専用の速報サイトが出来上がる（ターミナル・Python 不要）
- **年度ハブ**: 協会の大会一覧ページ（`hub/`）を静的1ページで作成できる。大会追加は管理者ポータルから操作するだけ
- **Googleツールのみで日常運用**: 結果 CSV を Google Drive に置くだけで GAS が自動処理し速報サイトに反映。git への接触は不要
- **管理者ポータル（ブラウザだけで大会登録・年度管理・Drive 接続設定・デザイン変更）**: GAS の Web アプリとして動作。大会の追加・ステータス切替・ブランド色変更まで、ターミナルや git を一切触らずにブラウザだけで完結する
- **進行モデル（全日本モデルなど公開ライブラリから選択）**: `progression/registry.json` に蓄積されたモデルを管理者ポータルの「接続設定」タブから選択・保存できる。モデルの追加は `/progression-add` スラッシュコマンドで行う（詳細: `progression/README.md`）

---

## クイックスタート

### 協会担当者向け（推奨・ターミナル不要）

1. オンボーディングサイト（https://rowing-results-kit.github.io/regatta-results-kit/onboarding/）を開く
2. Step 1〜7 を順番に進める

### 技術者・配布者向け（ローカル開発・テスト用）

```bash
# 1. テンプレートから新規リポジトリを作成（GitHub 画面で "Use this template"）
# 2. ローカルに clone して Claude Code を起動
cd <your-new-repo>
claude

# 3. ウィザードを起動（Claude Code あり環境のみ）
/regatta-setup
```

---

## リポジトリ構成

```
regatta-results-kit/
├── progression/                ← 進行モデルライブラリ（予選→準決→決勝の組分けルール）
│   ├── registry.json           ← モデル台帳（ポータル選択肢の正本）
│   ├── templates/              ← モデル定義 JSON（全日本モデル A/B など）
│   ├── engine/                 ← 進行計算エンジン（TypeScript）
│   └── README.md               ← ライブラリの使い方・登録フロー
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
│   ├── AdminPortal.gs          ← 管理者ポータル サーバー関数（doGet + タブ処理）
│   ├── portal.html             ← 管理者ポータル UI（4タブ: 大会管理・接続設定・デザイン・状態）
├── template/                   ← CSV テンプレ・サンプル（フィクションデータ）
│   └── tournament.config.example.json
├── tools/                      ← Python CLI ツール群（技術者・配布者向け）
│   ├── scaffold.py             ← 一発生成の中枢（GitHub Actions 経由で実行される）
│   ├── generate_master.py
│   ├── simulate_pipeline.py
│   └── init_tournament.py
├── test/                       ← e2e_test.py + フィクション fixture
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP_GUIDE.md          ← 協会担当者向け 7 ステップ手順書
│   ├── DISTRIBUTION.md         ← 配布者向け運用手順書
│   └── SPEC_phase3_config.md   ← tournament.config.json スキーマ正本
├── docs/onboarding/            ← オンボーディングサイト（GitHub Pages）
├── .github/workflows/
│   ├── setup-tournament.yml    ← 大会初期構築 workflow（Run workflow フォームから実行）
│   ├── validate.yml
│   └── heartbeat-watchdog.yml
├── Makefile
├── VERSION
├── LICENSE
└── .gitignore
```

---

## GAS セットアップ概要（技術者向け参考情報）

結果の自動処理（CSV → 速報サイト）は Google Apps Script（GAS）が担う。

> **重要: すべて「利用する協会・大会自身のアカウント」で構築します。**
> Google Drive・スプレッドシート・GAS・GitHub リポジトリ・PAT は、すべて利用者自身のアカウント上に作成するものを使います。本キットの提供者の Google Drive や GitHub を共有・利用する仕組みは一切ありません（キットには提供者のフォルダ ID 等は含まれていません）。インフラもデータも 100% 利用者の所有です。

### 必要なもの（すべて利用者自身のアカウントで用意）

- Google アカウント（無料アカウント可）
- GitHub の **fine-grained Personal Access Token (PAT)**
  - 権限: **Contents: Read and Write**
  - 対象リポジトリ: 速報サイトのリポジトリのみに限定（全リポジトリ権限は付与しない）
  - 有効期限: **90日**（定期的に更新すること）

### セットアップ手順（概要）

1. オンボーディングサイト（または `docs/SETUP_GUIDE.md`）の 7 ステップを実施
2. GAS テンプレートを「コピーを作成」してスクリプトプロパティに設定値を入力
3. 管理者ポータルをデプロイして接続テストが全グリーンになれば完了

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

## 進行モデル

大会の「予選→準決→決勝」の組分けルールを進行モデルとして管理します。
初期収載モデル（全日本モデル A/B）を含む公開ライブラリから大会に合ったモデルを選べます。

**モデルの考え方**: 進行モデルは「クルー数ごとのパターンを統合した1バンドル」です。大会は1モデルを選んで採用するだけでよく、種目ごとのクルー数に応じてどのパターンを使うかはエンジンが内部で自動判断します。管理者が「エントリー数 N クルーのときはパターン X を使う」と細かく設定する必要はありません。

### 選び方（ポータルから）

管理者ポータルの「接続設定」タブ →「進行モデル」セクションのセレクトから選択して保存してください。
選択肢は自リポジトリの `progression/registry.json` から自動で読み込まれます。
例: 全日本マスターズの場合は「全日本モデル A」を選択 → あとは種目ごとのクルー数に応じてモデルが自動適用されます。

### モデルの追加拡充

```bash
# /progression-add スラッシュコマンドで登録
# → Claude Code が検証・命名・コミット・push を行う
```

詳細な登録フロー（JSON 貼り付け / ファイルパス / 口頭ルールの3方式）は `progression/README.md` を参照してください。

### 初期収載モデル

| ID | 名称 | 対応レーン数 | 対応クルー数（カバレッジ） | 内容 |
|---|---|---|---|---|
| `alljapan-a` | 全日本モデル A | 6 | 1〜42 | 予選→準決→決勝。タイム拾い上げあり |
| `alljapan-b` | 全日本モデル B | 6 | 1〜42 | 予選→準決→決勝。タイム拾い上げあり（標準版） |

「対応クルー数」は参考情報（モデルが内部でカバーできる範囲）です。大会はクルー数を気にせずモデルを選んでかまいません。

> **v1 の範囲**: ライブラリ・選択・保存・表示まで。**進行計算の自動実行は次フェーズ**（`progression/engine/README.md` 参照）。

---

## 個人情報に関するガイダンス

速報サイトに選手氏名・所属団体を掲載する場合は、以下を必ず確認してください。

- 選手氏名・所属の公開掲載は、**大会規程および参加申込書に明示された利用目的の範囲内**であることを確認してください
- JARA（日本ボート協会）の個人情報保護方針およびオープンデータ公開規程を参照し、掲載方法を決定してください
- 参加申込の同意内容に掲載が含まれていない場合は、別途、本人の同意を取得してください
- サンプルデータ（`template/` 配下）はすべてフィクションデータです。実際の選手名・所属は含まれていません

---

## 配布する方へ

約20協会への配布運用手順（配布方法・アップデートポリシー・チェックリスト）: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)

---

## Claude Code プラグインとして導入する方法（技術者・配布者向け）

> **注意**: プラグインとしての `/plugin install` による導入は、リポジトリが **public** 公開後に有効になります。現在は private のため、テンプレート配布（クローン方式）または `--plugin-dir` によるローカルテストのみ利用可能です。

### テンプレート配布（推奨・現在有効）

```bash
# 1. GitHub の "Use this template" ボタンで新規リポジトリを作成
# 2. ローカルに clone して Claude Code を起動
git clone https://github.com/<your-org>/<your-repo>
cd <your-repo>
claude

# 3. ウィザードを起動
/regatta-setup
```

### プラグインとして導入する（public 公開後に有効）

```bash
# マーケットプレイスを登録
/plugin marketplace add rowing-results-kit/regatta-results-kit

# プラグインをインストール
/plugin install regatta-results-kit@regatta-results-kit
```

インストール後、コマンドは名前空間付きで利用可能になります:

```bash
/regatta-results-kit:regatta-setup
/regatta-results-kit:progression-add
```

### ローカルテスト（plugin-dir フラグ）

```bash
git clone https://github.com/rowing-results-kit/regatta-results-kit
cd ..  # 親ディレクトリから実行
claude --plugin-dir ./regatta-results-kit
```

---

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。
