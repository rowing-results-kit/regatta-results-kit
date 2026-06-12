# regatta-results-kit — システムアーキテクチャ

このドキュメントは regatta-results-kit の全体像を整理し、
テンプレートを利用する協会・大会担当者が構造を理解できるようにするための設計資料である。

## 関連文書

| ドキュメント | 内容 |
|---|---|
| `docs/SPEC_phase3_config.md` | Phase 3B インターフェース契約書（v1.1 凍結）。tournament.config.json / master.json v3 スキーマ正本 |
| `docs/SETUP_GUIDE.md` | GAS・Cloudflare Pages セットアップ手順（一般手順書） |

## 1. 全体構造

### データフロー図

```
CSV（計測システム）
    │
    ▼
Google Drive
  race_csv/500m/
  race_csv/1000m/
    │
    │  2分おきに GAS が取り込み
    ▼
Google Apps Script（A. CSV→JSON Push GAS）
    │  GitHub API で Push
    ▼
GitHub リポジトリ
  site/data/master.json
  site/data/results/race_NNN.json
  site/data/theme.json          ← 管理者ポータル「デザイン」タブが生成・コミット
    │
    │  Cloudflare Pages が自動デプロイ
    ▼
速報サイト（Cloudflare Pages）
  shared.js applyTheme() が起動時に theme.json を fetch
  → --color-primary / --color-accent CSS 変数を上書き（失敗時は既定色維持）
    │
    ▼
観客のスマホ・PC（120秒間隔で自動更新）

管理者ポータル（GAS Web アプリ）
    │
    ├─ タブ1: 大会管理 → hub/association.json を GitHub にコミット
    ├─ タブ2: 接続設定 → Script Properties を読み書き
    ├─ タブ3: デザイン → site/data/theme.json を GitHub にコミット
    └─ タブ4: 状態    → props / ログ参照
```

### 主要コンポーネント一覧

| コンポーネント | 場所 | 役割 |
|---|---|---|
| 速報サイト | `site/index.html`, `site/js/app.js`, `site/css/style.css` | Cloudflare Pages 上で公開される大会速報 UI。`master.json` と `race_NNN.json` を読み込み、レース情報・着順・区分を表示する。 |
| Admin Portal | `gas/AdminPortal.gs`, `gas/portal.html` | GAS Web アプリとして動作する管理者ポータル。大会の登録・年度管理・Drive 接続設定・デザイン変更をブラウザだけで完結させる（4タブ: 大会管理・接続設定・デザイン・状態）。 |
| テーマ設定 | `site/data/theme.json` | 管理者ポータルの「デザイン」タブが GitHub にコミットするブランド色設定ファイル。速報サイト起動時に `shared.js applyTheme()` が fetch し `--color-primary` / `--color-accent` CSS 変数を上書きする（ファイルがなければ既定色を維持）。 |
| 大会マスタ | Drive `master/`, GitHub `site/data/master.json` | `schedule.csv`, `entries.csv` を元に生成される大会全体の基礎データ。 |
| 結果 JSON | GitHub `site/data/results/race_NNN.json` | 500m / 1000m CSV から生成されるレース別結果データ。速報サイト表示と PDF 自動生成のトリガーになる。 |
| CSV→JSON Push GAS | `gas/Code.gs` | Drive 上の CSV を解析し、GitHub の JSON データを更新する GAS。Admin Portal はこの GAS プロジェクトに同居する。 |
| PDF Publisher GAS | `gas/pdf_publisher/Code.gs`, `gas/pdf_publisher/Setup.gs` | GitHub の結果 JSON を監視し、競漕記録 PDF と準備資料 PDF を生成する GAS。 |
| 判定員帳票 GAS | `gas/judge_form_publisher/Code.gs`, `gas/judge_form_publisher/Setup.gs` | 判定員用帳票 PDF を手動生成する GAS。 |
| 雛形 Sheets | Drive 上の Template | PDF Publisher と判定員帳票 GAS がコピーして使う帳票テンプレート。 |
| Drive 出力フォルダ | 結果格納・印刷済・削除アーカイブ等 | PDF 成果物の保存、手動運用、削除退避に使う。 |

## 2. データソース・データフロー

### 入力データ

- Drive `master/` フォルダ
  - `schedule.csv`: レース番号、日時、距離、カテゴリ等のスケジュール情報。
  - `entries.csv`: 出漕クルー、団体名、クルー名、レーン、カテゴリ等のエントリー情報。
- Drive `race_csv/500m/`, `race_csv/1000m/`
  - 計測結果 CSV。CSV→JSON Push GAS が未処理 CSV を取り込む。
- Drive 上の Template
  - 競漕記録テンプレ、準備資料テンプレ、判定員帳票テンプレ。

### 中間データ

- GitHub `site/data/master.json`
  - 速報サイト、PDF Publisher、判定員帳票生成で共通参照する大会マスタ。
- GitHub `site/data/results/race_NNN.json`
  - レースごとの計測結果。速報サイト表示と PDF 自動生成のトリガーになる。

### 出力

- 速報サイト
  - Cloudflare Pages で公開。GitHub の `site/data/` を読み込む。
- Drive 結果フォルダ
  - 競漕記録 PDF、判定員帳票 PDF を格納する。
- 印刷済・掲出済アーカイブ
  - 掲出後の PDF を運営が手動移動する。
- 削除アーカイブ
  - PDF Publisher GAS が削除・再生成時の退避先として自動移動する。
- 準備資料 PDF
  - 結果なしの事前配布・運営確認用資料。

## 3. GAS プロジェクト一覧（3つ）

### A. CSV→JSON Push GAS

- 場所: `gas/Code.gs`（リポジトリ内）
- 役割: Drive `race_csv/` の CSV を解析し、`race_NNN.json` を生成して GitHub に Push する。
- トリガー: `setupTrigger()` で設定。`everyMinutes(2)` により 2 分間隔で `onTrigger` を実行する。
- 主要関数:
  - `runImportMaster`
  - `processPendingCSVs`
  - `clearAllResults`
  - `onTrigger`
  - `setupTrigger`
  - `deleteTriggers`
- スクリプトプロパティ:
  - `GITHUB_TOKEN`
  - `GITHUB_REPO`
  - `DRIVE_FOLDER_ID_500M`
  - `DRIVE_FOLDER_ID_1000M`
  - `DRIVE_FOLDER_ID_MASTER`
  - `MEASUREMENT_POINTS`

### B. PDF Publisher GAS

- 場所: `gas/pdf_publisher/Code.gs`, `gas/pdf_publisher/Setup.gs`
- 役割: GitHub の `race_NNN.json` を監視し、競漕記録 PDF を自動生成して Drive 結果フォルダに格納する。
- トリガー: 1分間隔。
- 主要関数:
  - `processPendingPDFs`
  - `generatePdf`
  - `generatePreRaceBookletForDate`
  - `initializeTemplate`
  - `setupFromConfig`
- スクリプトプロパティ:
  - `GITHUB_TOKEN`
  - `GITHUB_REPO`
  - `TEMPLATE_SHEET_ID`
  - `PDF_OUTPUT_FOLDER_ID`
  - `PDF_ARCHIVE_FOLDER_ID`

### C. 判定員帳票 GAS

- 場所: `gas/judge_form_publisher/Code.gs`, `gas/judge_form_publisher/Setup.gs`
- 役割: 判定員用帳票 PDF を手動生成する。A4横、モノクロ、レーン 1〜6 の横並び方式。
- トリガー: なし。手動実行のみ。
- 主要関数:
  - `generateAllJudgeForms`
  - `generateJudgeFormForDate`
  - `setupFromConfig`

## 4. 雛形 Sheets 構造

### A. 競漕記録テンプレ

- PDF Publisher が結果記入版 PDF の生成に使う。
- 主な列: 順位・クルー名（2段: 団体名 + クルー名）・レーン・カテゴリ・500m・1000m・備考
- `race_NNN.json` の結果値を流し込み、競漕記録として PDF 化する。

### B. 準備資料テンプレ

- `generatePreRaceBookletForDate` が結果なし版 PDF の生成に使う。
- レーン 1〜6 固定。
- 着順は手書き対応。
- 大会前・当日朝の確認資料として、日付単位で分割生成する。

### C. 判定員帳票テンプレ（別 Spreadsheet）

- 判定員帳票 GAS が使う。
- A4横モノクロ。
- レーン 1〜6 を列方向に展開する横並び方式。
- レースごとに判定員が記入しやすい形で PDF 化する。

## 5. Drive フォルダ・スクリプトプロパティ一覧

| 用途 | スクリプトプロパティ |
|---|---|
| master/（`schedule.csv`, `entries.csv` 置場） | `DRIVE_FOLDER_ID_MASTER` |
| race_csv/500m/ | `DRIVE_FOLDER_ID_500M` |
| race_csv/1000m/ | `DRIVE_FOLDER_ID_1000M` |
| 結果格納 | `PDF_OUTPUT_FOLDER_ID` |
| 削除アーカイブ（GAS 自動移動） | `PDF_ARCHIVE_FOLDER_ID` |
| 準備資料 PDF 出力 | `OUTPUT_FOLDER_ID`（pdf_publisher） |
| 判定員帳票テンプレ Spreadsheet | 判定員帳票 GAS 側 `TEMPLATE_SHEET_ID` |

印刷済・掲出済フォルダ、雛形 Sheets の置き場は大会ごとに任意設定。
フォルダ ID はすべてスクリプトプロパティで管理する（コード直書き禁止）。

## 6. 主要なハマりポイントと対処

1. **GitHub API レート制限**
   - `Authorization` ヘッダー必須。未認証アクセスではレート制限が厳しく、GAS 定期実行で失敗しやすい。

2. **GAS UrlFetchApp 日次クォータ（20,000/日）**
   - `sha` 比較で fetch を削減する。
   - 必要以上に短いトリガー間隔を避ける。
   - PDF Publisher 側は既生成・未変更レースをスキップする。

3. **CacheService 値サイズ 100KB 制限**
   - 大きい JSON をキャッシュすると失敗する。
   - `try-catch` で CacheService 失敗時も処理継続できるようにする。

4. **GAS 実行時間 6 分制限**
   - 全日程・全レースを一括生成しない。
   - `generatePreRaceBookletForDate` のように日付ごとに分割実行する。

5. **Range.copyTo クロス Spreadsheet 禁止**
   - 異なる Spreadsheet 間では `Range.copyTo` が使えない。
   - 雛形 Spreadsheet を `makeCopy` してから `Sheet.copyTo` する。

6. **雛形セル結合**
   - 結合セルがある状態で範囲書き込みすると失敗・崩れが起きる。
   - 書き込み前に `breakApart()` で解除する。

7. **`runImportMaster` が `last_cleared_at` を消す**
   - `clearAllResults` を続けて実行する運用にする。
   - マスタ再取り込み後の結果クリア状態を確認する。

8. **`Sheet#getRange` の `setValue` を 1セルずつ呼ぶと遅い**
   - 帳票生成では `setValues` で一括書き込みする。
   - 書式設定も可能な限り範囲単位にまとめる。

9. **`master.json` の `entries` に `category` が無い問題**
   - `entries.csv` に `category` 列を追加する。
   - 速報サイト、PDF Publisher、判定員帳票の表示項目とマスタ仕様を揃える。

## 7. 将来の管理者ダッシュボード構想

### 機能要件

1. 大会作成フォーム
   - 大会名（`race_name`）
   - 開催日（`dates`）
   - 会場（`venue`）
   - コース距離選択（500m / 1000m / 2000m）
   - 計測ポイント設定（`measurement_points`）

2. 自動セットアップ
   - GitHub リポジトリ作成、または既存リポジトリへのブランチ追加。
   - Google Drive 大会用フォルダ自動生成（`master/`, `race_csv/`, `results/`）。
   - 雛形 Sheets コピー。
   - GAS プロジェクト 3本を新大会用に複製。
   - スクリプトプロパティを自動投入。

3. 大会一覧表示
   - 過去開催大会の管理（年・大会名・状態）。
   - 各大会への切替。

4. アクセス管理
   - 管理者、運営スタッフ、閲覧者の権限を分離する。

### 技術的検討

- フロントエンド: 既存サイト（Cloudflare Pages + Vanilla JS）の管理画面拡張。
- バックエンド: Google Apps Script の Web App API または Cloudflare Workers。
- 大会管理データ: 複数大会を一覧化する `master_index.json` を別途管理する。
- 認証: Google OAuth（Workspace 管理）を基本候補とする。

## 8. 主要ファイル

| パス | 役割 |
|---|---|
| `site/index.html` | 速報サイトの HTML エントリポイント。 |
| `site/js/app.js` | 速報サイトのロジック。区分列、着順表示、JSON 読み込みを担当。 |
| `site/css/style.css` | 速報サイトのスタイル。 |
| `site/data/master.json` | 大会マスタデータ（scaffold 生成後に配置）。 |
| `site/data/results/race_NNN.json` | レース別結果データ（GAS が Push）。 |
| `site/_headers` | Cloudflare Pages の HTTP ヘッダー設定。`data/*` に `no-store` を付与。 |
| `gas/Code.gs` | CSV→JSON Push GAS。 |
| `gas/AdminPortal.gs` | 管理者ポータル サーバー関数。doGet + 4タブのサーバー処理。CSV→JSON Push GAS プロジェクトに同居。 |
| `gas/portal.html` | 管理者ポータル UI（HTMLService テンプレート）。4タブ: 大会管理・接続設定・デザイン・状態。 |
| `site/data/theme.json` | ブランド色設定ファイル（scaffold または管理者ポータルが生成）。`primary_color` / `accent_color` / `font_family` を持つ。速報サイト起動時に applyTheme() が fetch して CSS 変数に反映。 |
| `gas/pdf_publisher/` | PDF Publisher GAS。競漕記録 PDF と準備資料 PDF を生成する。 |
| `gas/judge_form_publisher/` | 判定員帳票 GAS。 |
| `tools/scaffold.py` | 一発生成の中枢。`tournament.config.json` から `site/` 以下を生成する。brand 色は `site/data/theme.json` として出力（CSS ファイル直書きは廃止）。 |
| `template/tournament.config.example.json` | 大会設定ファイルのテンプレート。 |
| `docs/` | プロジェクトドキュメント。 |

---

## 9. CSV・データ仕様

### CSVファイル命名規則（レース結果）

正規表現: `/^(?:\d{8}_\d{6}_)?R(\d{3})_(.+)\.csv$/i`

| 形式 | 例 | 備考 |
|---|---|---|
| 推奨 | `R001_500m.csv` | レース番号3桁ゼロ埋め必須 |
| 旧形式（互換） | `20260607_070000_R001_500m.csv` | RowingTimerWeb が自動付与する日時プレフィクス |

よくあるミス（GAS がスキップする）:

| NG例 | 問題点 |
|---|---|
| `R001_500.csv` | `m` が抜けている |
| `r001_500m.csv` | 先頭が小文字 |
| `R01_500m.csv` | レース番号が2桁（3桁必須） |

### schedule.csv カラム

| カラム | 例 | 説明 |
|---|---|---|
| race_no | 1 | レース番号（1から連番） |
| event_code | M1X | 種別コード（半角英数）。全角は自動正規化 |
| event_name | 男子シングルスカル | 種目名 |
| category | M / W / Mix | 性別区分 |
| age_group | G / DEF / JKLMN | 年齢カテゴリー。複数カテゴリー合同レースは連続記入（例: `DEF`） |
| round | FA | ラウンド（FA=決勝A等） |
| date | 2026/5/23 | 開催日（YYYY/M/DD） |
| time | 07:00 | 発艇時刻（HH:MM） |
| course_length | （空欄=1000m） | 500m種目は `500` と記入 |

### entries.csv カラム

| カラム | 例 | 説明 |
|---|---|---|
| race_no | 1 | レース番号 |
| lane | 1 | レーン番号（1〜6程度） |
| crew_name | 田中 太郎 | 選手名またはクルー名 |
| affiliation | 東京ローイングクラブ | 所属団体名 |
| category | D | 年齢カテゴリーコード（A〜N）。複数カテゴリー合同レースは必須 |

### フロントエンド仕様

UI は3ビュー構成（種目別・全レース一覧・スケジュール）。外部ライブラリ・ビルドツール一切不使用（Vanilla JS）。

| 処理 | 実装 |
|---|---|
| 初期ロード | `master.json` fetch → 全レース結果を並列 fetch |
| 自動更新 | 120秒間隔。±15秒のランダムジッター付き |
| キャッシュ回避 | `cache: 'no-cache'` 指定 + fetch URL に `?t=タイムスタンプ` を付加 |

---

## 10. インフラ・セキュリティ

### HTTPヘッダー（site/_headers）

| 対象 | Cache-Control | 目的 |
|---|---|---|
| デフォルト（HTML等） | `no-cache` | 毎回再検証 |
| `data/*`（JSON） | `no-store, no-cache, must-revalidate` | 速報性確保 |
| `css/*, js/*` | `public, max-age=86400` | 1日キャッシュ |

### シークレット管理

| 項目 | 保管場所 |
|---|---|
| GitHub Token | GAS スクリプトプロパティ（暗号化保存） |
| Drive フォルダ ID | GAS スクリプトプロパティ |

### 禁止事項

- GitHub Token を GitHub に push しない
- `site/data/master.json` を直接手で編集しない（Python スクリプト使用）
- `site/data/results/` フォルダを手で削除しない
- GAS スクリプトを無断で変更しない

---

## 11. 当日オペレーション

### 朝の準備（大会開始1時間前）

- [ ] 速報サイトにアクセス確認
- [ ] スケジュールが全レース表示されているか確認
- [ ] Google Drive フォルダへのアクセス確認
- [ ] `race_csv/500m/`, `race_csv/1000m/` フォルダが存在するか確認
- [ ] GAS トリガーが有効か確認（`checkTriggerStatus()` 実行）

### レース中の運用

1. 計測担当者が `race_csv/500m/` に CSV ファイルをアップロード
2. 計測担当者が `race_csv/1000m/` に CSV ファイルをアップロード
3. 最短 2 分待機 → GAS が自動処理（CSV → JSON → GitHub Push）
4. 約 1 分後 → 速報サイトに結果が反映される（合計最短 3 分・通常 3〜5 分）

### トラブルシューティング

| 症状 | 原因候補 | 対処 |
|---|---|---|
| 5分以上更新されない | GAS トリガー停止 / CSV のフォルダ誤り / ファイル名不正 | GAS エディタでトリガー確認 → `onTrigger()` 手動実行 |
| GAS 実行時間が枯渇 | 実行回数が多すぎた（想定外） | 翌日自動リセット。`onTrigger()` で補完 |
| 誤 CSV をアップした | スタッフミス | 正しい CSV で上書きアップ。GAS が最新ファイルを自動採用 |
| GitHub Token 切れ | Token 有効期限超過 | Token を再生成 → GAS スクリプトプロパティを更新 |
| サイト真っ白（全員） | Cloudflare Pages ダウン | Cloudflare Status ページ確認 |
| スケジュール未表示 | master.json が欠損 | GitHub で `site/data/master.json` を確認 |

### 既知の制約・リスク

| 制約 | 対策 |
|---|---|
| GAS 実行時間 90 分/日（無料枠）。実績は 32〜40 分/日 | 前日 ON・最終日後 OFF の運用 |
| GitHub API 5,000 回/時 | 1レース 1〜2 Push のため問題なし。制限検知時は 15 分自動スキップ |
| 反映遅延 最短 2〜3 分・通常 3〜5 分 | 速報用途として許容範囲。マニュアルに明記 |
