# スクリーンショット管理台帳 — オンボーディングガイド

> 自動撮影対象: ログイン不要の公開画面（CI/CD で週1回自動更新）
> 手動撮影対象: ログイン必須画面（認証情報をCIに置かないため自動化しない）

## 管理表

| ステップ | 必要画面 | ファイル名 | 分類 | 取得状況 | 撮影日 | URL |
|---|---|---|---|---|---|---|
| Step 1 | GitHub テンプレートリポジトリ（Use this template ボタン） | `gh-template-repo.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://github.com/rowing-results-kit/regatta-results-kit |
| Step 1 | GitHub ログイン画面（未ログイン時に遷移） | `gh-login.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://github.com/login |
| Step 2 | Cloudflare Pages 製品ページ（アカウント作成・Sign Up ボタン） | `cf-pages.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://pages.cloudflare.com/ |
| Step 2 | Cloudflare Pages 作成画面（Create application → Connect to Git） | `cf-pages-create.png` | **手動撮影必須** | 未取得 | — | ログイン後: dash.cloudflare.com → Workers & Pages → Pages |
| Step 2 | Cloudflare Pages ビルド設定（Build output directory = site） | `cf-pages-build-settings.png` | **手動撮影必須** | 未取得 | — | ログイン後: Pages → Begin setup |
| Step 3 | GitHub Actions タブ（公開リポジトリの例） | `gh-actions-tab-example.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://github.com/rowing-results-kit/regatta-results-kit/actions |
| Step 3 | Actions 左サイドバー「大会初期構築」選択 | `gh-actions-setup-workflow.png` | **手動撮影必須** | 未取得 | — | ログイン後: 自分のリポジトリ → Actions |
| Step 3 | Run workflow フォーム（大会名・日付・カラー入力） | `gh-actions-run-workflow.png` | **手動撮影必須** | 未取得 | — | ログイン後: Actions → 大会初期構築 → Run workflow |
| Step 3 | Actions ジョブ失敗時のログ画面 | `gh-actions-error-log.png` | **手動撮影必須** | 未取得 | — | ログイン後: Actions → 赤バツジョブ → scaffold実行 |
| Step 4 | Google Drive フォルダ作成後（URL末尾のフォルダID確認） | `google-drive-folder-id.png` | **手動撮影必須** | 未取得 | — | ログイン後: drive.google.com → フォルダを開いた状態 |
| Step 4 | Google Drive ログイン画面（未ログイン時） | `google-drive-login.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://accounts.google.com/ServiceLogin?service=wise&... |
| Step 5 | GAS ランディング（ログイン誘導） | `gas-landing.png` | 自動撮影可 | 取得済 | 2026-06-13 | https://script.google.com |
| Step 5 | GAS エディタ「ファイル → コピーを作成」 | `gas-editor-copy.png` | **手動撮影必須** | 未取得 | — | ログイン後: GAS テンプレートを開いた状態 |
| Step 5 | GAS スクリプトプロパティ設定画面（歯車 → スクリプトプロパティ） | `gas-script-properties.png` | **手動撮影必須** | 未取得 | — | ログイン後: GAS プロジェクトの設定 |
| Step 6 | GitHub PAT Fine-grained 作成フォーム | `gh-pat-create-form.png` | **手動撮影必須** | 未取得 | — | ログイン後: github.com/settings/personal-access-tokens/new |
| Step 6 | GitHub PAT 生成後の表示（今すぐコピー） | `gh-pat-generated.png` | **手動撮影必須** | 未取得 | — | ログイン後: PAT 生成直後の画面 |
| Step 7 | GAS デプロイ ウェブアプリ設定画面 | `gas-deploy-webapp.png` | **手動撮影必須** | 未取得 | — | ログイン後: GAS → デプロイ → 新しいデプロイ |
| Step 7 | 管理者ポータル 完了状態（全テスト緑） | `admin-portal-complete.png` | **手動撮影必須** | 未取得 | — | ログイン後: GAS ウェブアプリURL → 状態タブ |

## 自動撮影対象まとめ（週次 CI で更新）

| ファイル名 | 撮影URL |
|---|---|
| `gh-template-repo.png` | https://github.com/rowing-results-kit/regatta-results-kit |
| `gh-login.png` | https://github.com/login |
| `cf-pages.png` | https://pages.cloudflare.com/ |
| `gh-actions-tab-example.png` | https://github.com/rowing-results-kit/regatta-results-kit/actions |
| `google-drive-login.png` | https://accounts.google.com/ServiceLogin?service=wise&passive=1209600&continue=https%3A%2F%2Fdrive.google.com%2F |
| `gas-landing.png` | https://script.google.com |

## 手動撮影が必要な画面（龍偉が対応）

以下 **9画面** は認証が必要なため手動撮影:

1. `cf-pages-create.png` — Cloudflare Pages 作成画面（Connect to Git）
2. `cf-pages-build-settings.png` — Cloudflare ビルド設定（Build output directory = site）
3. `gh-actions-setup-workflow.png` — Actions 左サイドバー「大会初期構築」
4. `gh-actions-run-workflow.png` — Run workflow フォーム
5. `gh-actions-error-log.png` — Actions ジョブ失敗ログ（scaffold 実行）
6. `google-drive-folder-id.png` — Drive フォルダのURL（フォルダIDが見える状態）
7. `gas-editor-copy.png` — GAS「ファイル → コピーを作成」
8. `gas-script-properties.png` — GAS スクリプトプロパティ設定
9. `gh-pat-create-form.png` — GitHub PAT Fine-grained 作成フォーム
10. `gh-pat-generated.png` — PAT 生成直後のコピー画面
11. `gas-deploy-webapp.png` — GAS デプロイ設定（ウェブアプリ）
12. `admin-portal-complete.png` — 管理者ポータル完了状態

手動撮影したファイルは `docs/assets/img/onboarding/` に置いてください。
このファイルの「取得状況」と「撮影日」を更新してください（MANIFEST 更新は CI が毎週自動でやります）。

## 次回手動確認推奨日

| 画面グループ | 次回確認推奨 | 理由 |
|---|---|---|
| GitHub UI（PAT作成・Actions） | 2026-09-13（3ヶ月後） | GitHub UI は比較的安定 |
| Cloudflare Pages 設定 | 2026-09-13（3ヶ月後） | 大きな変更は稀 |
| Google Drive / GAS | 2026-09-13（3ヶ月後） | Material Design 刷新時に変わりやすい |
| 管理者ポータル | 大会kit更新時 | kit 更新と同時に確認 |

## 更新履歴

| 日付 | 変更内容 |
|---|---|
| 2026-06-13 | 初版作成。自動撮影6画面取得済み。手動撮影必須12画面を特定 |
