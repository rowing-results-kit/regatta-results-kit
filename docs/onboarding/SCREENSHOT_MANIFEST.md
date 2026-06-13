# スクリーンショット管理台帳 — オンボーディングガイド

> 自動撮影対象: ログイン不要の公開画面（CI/CD で週1回自動更新）
> 手動撮影対象: ログイン必須画面（認証情報をCIに置かないため自動化しない）
>
> **手動撮影の手順**: [`docs/onboarding/CAPTURE_GUIDE.md`](./CAPTURE_GUIDE.md) を参照（優先Top3 / 各画面の到達手順 / 黒塗り指示を掲載）

## 管理表

| ステップ | 必要画面 | ファイル名 | 分類 | 取得状況 | 優先度 | 撮影日 | URL |
|---|---|---|---|---|---|---|---|
| Step 1 | GitHub テンプレートリポジトリ（Use this template ボタン） | `gh-template-repo.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://github.com/rowing-results-kit/regatta-results-kit |
| Step 1 | GitHub ログイン画面（未ログイン時に遷移） | `gh-login.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://github.com/login |
| Step 2 | Cloudflare Pages 製品ページ（アカウント作成・Sign Up ボタン） | `cf-pages.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://pages.cloudflare.com/ |
| Step 2 | Cloudflare Pages 作成画面（Create application → Connect to Git） | `cf-pages-create.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md#step2-connect) |
| Step 2 | Cloudflare Pages ビルド設定（Build output directory = site） | `cf-pages-build-settings.png` | **手動撮影必須** | 未取得 | **高 Top2** | — | → [撮影手順](./CAPTURE_GUIDE.md#step2-build-settings) |
| Step 3 | GitHub Actions タブ（公開リポジトリの例） | `gh-actions-tab-example.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://github.com/rowing-results-kit/regatta-results-kit/actions |
| Step 3 | Actions 左サイドバー「大会初期構築」選択 | `gh-actions-setup-workflow.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 3 | Run workflow フォーム（大会名・日付・カラー入力） | `gh-actions-run-workflow.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 3 | Actions ジョブ失敗時のログ画面 | `gh-actions-error-log.png` | **手動撮影必須** | 未取得 | 低 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 4 | Google Drive フォルダ作成後（URL末尾のフォルダID確認） | `google-drive-folder-id.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 4 | Google Drive ログイン画面（未ログイン時） | `google-drive-login.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://accounts.google.com/ServiceLogin?service=wise&... |
| Step 5 | GAS ランディング（ログイン誘導） | `gas-landing.png` | 自動撮影可 | 取得済 | — | 2026-06-13 | https://script.google.com |
| Step 5 | GAS エディタ「ファイル → コピーを作成」 | `gas-editor-copy.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 5 | GAS スクリプトプロパティ設定画面（歯車 → スクリプトプロパティ） | `gas-script-properties.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 6 | GitHub PAT Fine-grained 作成フォーム | `gh-pat-create-form.png` | **手動撮影必須** | 未取得 | **高 Top1** | — | → [撮影手順](./CAPTURE_GUIDE.md#step6-pat-create) |
| Step 6 | GitHub PAT 生成後の表示（今すぐコピー） | `gh-pat-generated.png` | **手動撮影必須** | 未取得 | **高 Top1** | — | → [撮影手順](./CAPTURE_GUIDE.md#step6-pat-create) ⚠️トークン黒塗り必須 |
| Step 7 | GAS デプロイ ウェブアプリ設定画面 | `gas-deploy-webapp.png` | **手動撮影必須** | 未取得 | 中 | — | → [撮影手順](./CAPTURE_GUIDE.md) |
| Step 7 | 管理者ポータル 完了状態（全テスト緑） | `admin-portal-complete.png` | **手動撮影必須** | 未取得 | **高 Top3** | — | → [撮影手順](./CAPTURE_GUIDE.md#step7-admin-portal) |

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

**詳細手順 → [`CAPTURE_GUIDE.md`](./CAPTURE_GUIDE.md)（優先Top3・到達方法・黒塗り指示あり）**

以下 **12画面** は認証が必要なため手動撮影（優先度順）:

### 高優先（Top3 — まずここだけでOK）
1. `gh-pat-create-form.png` **[Top1]** — GitHub PAT Fine-grained 作成フォーム
2. `gh-pat-generated.png` **[Top1・⚠️トークン黒塗り必須]** — PAT 生成直後のコピー画面
3. `cf-pages-build-settings.png` **[Top2]** — Cloudflare ビルド設定（Build output directory = site）
4. `admin-portal-complete.png` **[Top3]** — 管理者ポータル完了状態

### 中優先
5. `cf-pages-create.png` — Cloudflare Pages 作成画面（Connect to Git）
6. `gh-actions-setup-workflow.png` — Actions 左サイドバー「大会初期構築」
7. `gh-actions-run-workflow.png` — Run workflow フォーム
8. `google-drive-folder-id.png` — Drive フォルダのURL（フォルダIDが見える状態）
9. `gas-editor-copy.png` — GAS「ファイル → コピーを作成」
10. `gas-script-properties.png` — GAS スクリプトプロパティ設定
11. `gas-deploy-webapp.png` — GAS デプロイ設定（ウェブアプリ）

### 低優先（参考画面）
12. `gh-actions-error-log.png` — Actions ジョブ失敗ログ（scaffold 実行）

手動撮影したファイルは `docs/assets/img/onboarding/` に置いてください。
「撮った」と伝えると自動で onboarding/index.html への埋め込みを実行します。

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
| 2026-06-13 | CAPTURE_GUIDE.md 作成。管理表に優先度列・CAPTURE_GUIDE参照リンクを追加 |
