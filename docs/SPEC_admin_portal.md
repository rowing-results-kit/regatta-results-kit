# SPEC: 管理者ポータル v1（2026-06-12 龍偉要件）

要件: 大会の登録・管理・年度管理・Drive 接続のチューニング・公開サイトのデザイン確認/反映を、**ターミナル・git に一切触れず** Google Drive とブラウザのダッシュボードだけで完結させる。

## 1. アーキテクチャ（確定）

- 実装 = **GAS Web アプリ**。メイン GAS（gas/Code.gs の CSV→JSON Push プロジェクト）に同居させる
  - 理由: ①同一プロジェクトなので Script Properties（Drive ID 等）を直接読み書きできる ②GitHub コミット用ヘルパーと PAT を再利用できる ③Web アプリのアクセス設定で Google アカウント認証がかかる（隠しパス不要の本物の認証）
- ファイル: `gas/AdminPortal.gs`（doGet + サーバー関数）+ `gas/portal.html`（HTMLService UI・自己完結）
- セキュリティ: デプロイ設定「次のユーザーとして実行: 自分 / アクセスできるユーザー: 自分のみ（または指定ユーザー）」。**PAT・フォルダ ID はサーバー側のみ。クライアント HTML に秘密値を埋め込まない**（表示はマスク値）
- クライアント↔サーバーは `google.script.run` のみ。外部 fetch なし

## 2. 機能（4タブ）

### タブ1: 大会管理（年度管理を内包）
- GitHub 上の `hub/association.json` を読み込み、**年ごとにグループ表示**
- 追加・編集（name/year/dates/venue/status/url/id 自動提案）・削除・status ワンクリック切替（開催予定→速報中→結果確定）
- 保存 = GAS が GitHub API で association.json をコミット（コミットメッセージ自動）

### タブ2: 接続設定（Drive チューニング）
- 本プロジェクトの Script Properties を UI で編集: `DRIVE_ROOT_FOLDER_ID` / `MEASUREMENT_POINTS` / `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_TOKEN`（入力時のみ・表示は先頭4文字マスク）
- 「Drive 接続テスト」ボタン: フォルダ名の取得で疎通確認し結果表示
- Drive リンク（URL）を貼るとフォルダ ID を自動抽出して保存
- pdf_publisher / judge_form_publisher 用には setupFromConfig 貼り付け用 JSON を生成表示（コピー1回で済む）

### タブ3: デザイン
- ブランド色（primary / accent）のカラーピッカー + フォント選択
- **ライブプレビュー**: ポータル内に公開サイトの主要 UI（ヘッダー・種目カード・順位行・バッジ・ハブカード）をミニ再現し、選択値を即時反映して確認
- 「公開サイトに反映」= `site/data/theme.json` を GitHub にコミット
- 「公開サイトを開く」リンク（反映後の実物確認）

### タブ4: 状態
- 最終 heartbeat・結果 JSON 数・トリガー稼働状況・直近エラーの表示（既存 props/ログから）

## 3. theme.json（デザイン反映の仕組み）

- パス: `site/data/theme.json`（無ければサイトは既定色のまま = 後方互換）
- スキーマ: `{ "primary_color": "#2D4F2C", "accent_color": "#C9A227", "font_family": "Noto Sans JP" }`
- 適用: `site/js/shared.js` に `applyTheme()` を追加 — 起動時に theme.json を fetch し、document の CSS 変数 `--color-primary` / `--color-accent` を上書き（色形式は `#RRGGBB` のみ受理・それ以外は無視 = インジェクション防止）
- hub: `association.json` に任意の `brand` セクション（同スキーマ）。hub/index.html が同様に適用
- _headers: `/data/theme.json` は no-cache 対象（既存 data/* ルールに包含されることを確認）

## 4. ドキュメント反映

- SETUP_GUIDE: 「ステップ8.5 — 管理者ポータルの公開（Web アプリとしてデプロイ）」を追加（デプロイ→アクセス設定→URL をブックマーク）
- README / ARCHITECTURE / LP: 管理者ポータルを機能として記載（LP は「できること」に1項目 + FAQ 1問）
- 運用像: **初期構築後、管理者が触るのは「Google Drive（CSV 投入）」と「ポータル（登録・設定・色）」の2つだけ**

## 5. 受入条件

- portal.html を `google.script.run` スタブ付きで静的に開いた状態の表示が崩れない（スクショ確認）
- theme.json を置いたローカルサイトで色が変わる/無い場合は既定色（両方スクショ確認）
- 秘密値（PAT 全文・フォルダ ID 全文）がクライアント HTML・ログに出ない（grep 確認）
- 全ドキュメントの記述がプロパティ実名・実関数名と一致（創作禁止）
