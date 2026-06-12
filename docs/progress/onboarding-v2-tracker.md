---
status: in_progress
progress_pct: 90
last_updated: 2026-06-12
created: 2026-06-12
---

# オンボーディング v2 進捗管理表

## 概要

- **目標**: 配布者が URL を渡すだけで協会担当者（非エンジニア）が自力導入完了できる仕組み
- **SPEC**: `docs/SPEC-onboarding-v2.md`
- **受入完了基準**: GitHub アカウントのみ持っている状態から速報サイト表示 + 管理ポータル全グリーンまで自力で辿り着ける

---

## タスク一覧

### W1: Actions 系（`setup-tournament.yml` + `heartbeat-watchdog.yml` + `validate.yml`）

依存: なし（W1 は他 W に依存しない。並列着手可）

| # | タスク | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| W1-1 | `setup-tournament.yml` 新規作成（workflow_dispatch 5項目 + バリデーション + scaffold 呼び出し + self-commit + 冪等性） | working-engineer | ✅ | なし |
| W1-2 | `heartbeat-watchdog.yml` 改修（`vars.TOURNAMENT_START/END` 廃止 → `tournament.config.json` 読み取り） | working-engineer | ✅ | W1-1（`tournament.config.json` のスキーマが確定してから） |
| W1-3 | `validate.yml` / `test/e2e_test.py` の雛形状態 fail 防止（空 schedule での skip 対応） | working-engineer | ✅ | W1-1 |
| W1-4 | W1 の冪等性テスト実行・確認（ジョブ 2 回実行で 2 回目コミットなし） | qa-reviewer | ✅（ローカル確認済） | W1-1 |

### W2: GAS 系（`gas/AdminPortal.gs` + `gas/portal.html` + `gas/Code.gs` 改修）

依存: なし（W2 は他 W に依存しない。並列着手可）

| # | タスク | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| W2-1 | `gas/AdminPortal.gs` に `portalTestGitHub()` 追加（リポジトリ疎通確認・401/404 のエラーメッセージ日本語化） | working-engineer | ✅ | なし |
| W2-2 | `gas/AdminPortal.gs` の `portalGetStatus()` に PAT 期限取得・キャッシュロジック追加（`PAT_EXPIRES_AT` プロパティ） | working-engineer | ✅ | W2-1 |
| W2-3 | `gas/portal.html` の「接続設定」タブに「GitHub 接続テスト」ボタン追加・結果バッジ表示 | working-engineer | ✅ | W2-1 |
| W2-4 | `gas/portal.html` の「状態」タブに PAT 期限バッジ（赤: 14 日以内 / 黄: 30 日以内）表示追加 | working-engineer | ✅ | W2-2 |
| W2-5 | `gas/Code.gs` のグローバル定数 `SETUP_DRIVE_FOLDER_ID` / `SETUP_GITHUB_TOKEN` 削除（スクリプトプロパティ直接入力を主フロー化） | working-engineer | ✅ | W2-1 完了後（ポータル設定 UI が先に使えるようにしてから削除） |
| W2-6 | `docs/SETUP_GUIDE.md` ステップ 5 を「コピーを作成」方式に書き換え（`saveSetup()` コード貼り付け手順を廃止） | working-engineer | ✅ | W2-5 |
| W2-7 | 整合性 block 解消: 管理者ポータルに「初期セットアップ実行」ボタン新設（Drive サブフォルダ作成＋自動更新トリガー設定・冪等）・状態タブに「自動更新: 🟢/🔴」バナー＋「開始する」ボタン・SETUP_GUIDE Step 7 書き換え・SPEC-onboarding-v2 Step 7 完了基準更新・案 A 配置確定 | working-engineer | ✅ | W2-5 |

### W3: オンボーディングサイト

依存: W1（scaffold 後の手順確定）・W2（GAS テンプレートリンク確定）がある程度固まってから着手推奨

| # | タスク | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| W3-1 | オンボーディングサイト HTML 作成（Step 1〜7 のスクリーンショット枠付き手順 + セルフチェックリスト + FAQ） | working-designer | ✅ | W1・W2 の手順確定後 |
| W3-2 | GAS テンプレート GAS プロジェクト 3 つ（A/B/C）を龍偉の Google Drive 上に作成・共有リンク取得 | clasp 自動化（Sonnet） | ✅ | W2-5 完了後 |
| W3-3 | オンボーディングサイトに GAS テンプレートリンク（A/B/C）を埋め込む | working-designer | ✅ | W3-2 |
| W3-4 | [案 A 決定] GitHub Pages（main/docs）でデプロイ完了 | working-designer | ✅ | PM 裁定 |

### W4: ドキュメント再編

依存: W1 / W2 が完了してから着手（手順が変わるため）

| # | タスク | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| W4-1 | `docs/SETUP_GUIDE.md` の全体改訂（ローカル Python 廃止 → Run workflow 主フローへ書き換え・Step 番号再整理） | working-engineer | ✅ | W1・W2 完了後 |
| W4-2 | `docs/DISTRIBUTION.md` の「初期構築パターン A（自力）」の説明を v2 フロー（Run workflow）に更新 | working-engineer | ✅ | W4-1 |
| W4-3 | README.md に管理者ポータルのアクセス方法と「接続テスト」ボタンの説明を追記 | working-engineer | ✅ | W2 完了後 |

---

## 依存関係サマリー

```
W1-1 (setup-tournament.yml)
  ├→ W1-2 (heartbeat 改修)
  ├→ W1-3 (validate 改修)
  └→ W1-4 (冪等性テスト) ─────────────────────── W4-1 ─→ W4-2
                                                              ↑
W2-1 (GitHub接続テスト)                            W2-5 ─→ W2-6
  ├→ W2-3 (ポータル接続ボタン)
  ├→ W2-2 (PAT期限) ─→ W2-4 (PAT期限バッジ)
  └→ W2-5 (saveSetup 削除)

W1・W2完了 ─→ W3-1 (オンボーディングサイト)
W3-1 + W3-2 ─→ W3-3 ─→ W3-4 (配置・公開 / PM 確認後)
```

---

## 作業ログ

### 2026-06-12

- SPEC-onboarding-v2.md 起草完了
- 進捗管理表（本ファイル）作成
- W1〜W4 のタスク分解完了
- [PM 確認事項] オンボーディングサイト配置場所（案 A vs 案 B）を PM に投げた状態
- **W2 実装完了（W2-1〜W2-5）**
  - AdminPortal.gs: `portalTestGitHub()` 追加（401/404/403 の日本語エラー判別）
  - AdminPortal.gs: `portalGetPatExpiry()` 追加、`portalGetStatus()` に patExpiresAt/daysLeft/patStatus 追加
  - portal.html: 接続設定タブに「GitHub 接続テスト」ボタン + 結果バッジ + PAT 期限赤/黄バッジ追加
  - portal.html: 状態タブに PAT 期限行追加（赤≦14日 / 黄≦30日 / 緑 / 不明）
  - Code.gs: `saveSetup()` / `SETUP_DRIVE_FOLDER_ID` / `SETUP_GITHUB_TOKEN` グローバル定数廃止
  - Code.gs / AdminPortal.gs: 「コピーを作成」配布前提のコメントヘッダー追加（7行以内）
  - W2-6（SETUP_GUIDE.md 改訂）は W4 フェーズで実施
- **W2-7 完了（2026-06-12 working-engineer）** — 整合性ブロック解消
  - AdminPortal.gs: `portalInitialSetup()`（Drive サブフォルダ作成＋onTrigger 設定・冪等）新設
  - AdminPortal.gs: `portalStartTrigger()`（状態タブ「開始する」ボタン用）新設
  - portal.html: タブ4 に「初期セットアップ実行」カード（ボタン + 結果表示）追加
  - portal.html: 状態タブに「自動更新: 🟢稼働中 / 🔴停止中」バナー＋「開始する」ボタン追加
  - portal.html: モックデータに `portalInitialSetup` / `portalStartTrigger` 追加
  - SETUP_GUIDE.md: Step 7 を書き換え（GAS エディタ手動実行を全廃・ポータルボタン完結に統一・導入完了基準を「接続テスト OK ＋ 自動更新稼働中 = 全部緑」に改定）
  - SPEC-onboarding-v2.md: Step 7 完了基準にトリガー稼働を追加・案 A 採用確定を記述
  - 静的検証: portalInitialSetup / portalStartTrigger の google.script.run 呼び出しと .gs 関数名が一致・ブレース対称・{ok, data/error} 形式統一を確認
- **W3-1・W3-4 完了（2026-06-12 working-designer）**
  - docs/onboarding/index.html: 1941行・自己完結HTML・外部CSS/JS依存ゼロ
  - 7ステップ全カード（操作手順・疑似スクリーンモック・セルフチェック・Q&A）
  - Step 3: Actions 3段階モック（Actionsタブ→左サイドバー→Run workflow）
  - 失敗時ログ確認手順（赤バツ→クリック→日本語エラー）をQ&Aモックで明示
  - 総合チェックリスト9項目・進捗バー付き
  - GitHub Pages（main/docs）有効化 → URL: https://ryuiyamada.github.io/regatta-results-kit/onboarding/
  - QA静的チェック: 真のNG = 0（false positive 2件はHTMLサンプル値）
  - W3-2（GASテンプレートリンク）が完了次第 W3-3 でリンクを埋め込む

---

## 再開ガイド

**中断・コンパクト後はここから復元する**

1. 現在のステータス: `status: in_progress` / `progress_pct: 5`（SPEC 完成・実装未着手）
2. 最優先で着手すべきタスク: **W1-1**（`setup-tournament.yml` 新規作成）と **W2-1**（`portalTestGitHub()` 追加）は並列で着手できる
3. PM 確認が必要な事項: オンボーディングサイト配置場所（案 A: GitHub Pages 同梱 / 案 B: html-share 暫定）
4. SPEC の場所: `docs/SPEC-onboarding-v2.md`（全設計判断の正本）
5. 実コードの場所:
   - Actions: `.github/workflows/heartbeat-watchdog.yml` / `.github/workflows/validate.yml`
   - GAS: `gas/AdminPortal.gs` / `gas/Code.gs` / `gas/portal.html`
   - scaffold: `tools/scaffold.py`（存在確認してから実装）

**W1-1 実装着手時のチェックリスト**:
- [ ] `tools/scaffold.py` が `--config` 引数を受け取ることを Read で確認してから workflow を書く
- [ ] `tournament.config.json` のスキーマ（`start_date` / `end_date` のキー名）を scaffold.py から確認
- [ ] `site/data/results/` が scaffold の上書き対象外であることを scaffold.py で確認
