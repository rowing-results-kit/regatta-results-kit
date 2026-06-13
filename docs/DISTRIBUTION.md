# regatta-results-kit — 配布運用手順書（配布者向け）

> **対象読者**: このキットを協会に配布する龍偉（配布者）向けの運用手順書。
> 協会担当者向けの手順は `docs/SETUP_GUIDE.md`（またはオンボーディングサイト）を参照。

---

## 目次

1. [配布モデルの全体像](#1-配布モデルの全体像)
2. [配布方法（URL を渡すだけ）](#2-配布方法url-を渡すだけ)
3. [協会側の初期構築](#3-協会側の初期構築)
4. [協会担当ができる個別カスタマイズ](#4-協会担当ができる個別カスタマイズ)
5. [本体アップデートの配布ポリシー](#5-本体アップデートの配布ポリシー)
6. [サポート窓口の型](#6-サポート窓口の型)
7. [配布チェックリスト](#7-配布チェックリスト)
8. [付録: Collaborator 招待が必要な場合](#8-付録-collaborator-招待が必要な場合)

---

## 1. 配布モデルの全体像

```
[龍偉]
  オンボーディングサイトの URL を協会担当に送るだけ
  （https://rowing-results-kit.github.io/regatta-results-kit/onboarding/）
        │
        ▼
[協会担当]
  オンボーディングサイトの 7 ステップを自力で完結
  ↓ Step 1: "Use this template" で自団体リポジトリを作成
  ↓ Step 2〜7: Cloudflare 接続・Run workflow・Drive 作成・GAS・PAT・接続テスト
        │
        ▼
[協会の環境（完全独立）]
  ├── 協会の GitHub（速報サイトリポジトリ）
  ├── 協会の Cloudflare Pages（速報サイト配信）
  ├── 協会の Google Drive（CSV 投入・GAS 実行）
  └── 協会の GAS（自動処理・管理者ポータル）
```

**重要な原則**

- コピー作成後は本体との自動連携は一切ない。協会リポジトリは完全独立。
- 協会のデータ（Drive・GAS・Pages）は 100% 協会自身のアカウント上に存在する。龍偉のアカウントを共有・利用する箇所はない。
- 本体を改善しても協会リポジトリには自動で反映されない（§5 参照）。

---

## 2. 配布方法（URL を渡すだけ）

**配布者の作業はこれだけ**:

```
オンボーディングサイトの URL を協会担当に送信
https://rowing-results-kit.github.io/regatta-results-kit/onboarding/
```

協会担当はこのサイトにアクセスし、7 ステップを自力で完結できます。

### 案内文イメージ

> 速報サイトの導入手順はこちらのページに記載されています。ステップ 1〜7 を順番に進めてください。
> https://rowing-results-kit.github.io/regatta-results-kit/onboarding/
>
> 途中でつまずいた場合は、各ステップの「NGパターンと自己復旧」をご確認ください。

### オンボーディングサイトが利用できない場合の代替

リポジトリが private の期間（public 化前）は `docs/SETUP_GUIDE.md` のテキスト版を代替として渡す。

---

## 3. 協会側の初期構築

### 必要なもの（協会側で用意）

| 項目 | 費用 |
|---|---|
| GitHub アカウント | 無料 |
| Google アカウント | 無料 |
| Cloudflare アカウント | 無料 |
| インターネット接続 | — |

Python・ターミナル・git コマンドは不要です。

**所要時間**: 初めての担当者で 30〜60 分（7 ステップ合計）

### 容量・無料枠の目安

| リソース | 無料枠 | 1大会の実消費目安 |
|---|---|---|
| Google Drive 容量 | 15GB | 計測 CSV 全レース分 ≈ 0.1MB / 帳票・結果 PDF 一式 ≈ 10〜30MB → 1大会 50MB 未満 |
| GAS トリガー実行 | 90分/日 | 2分間隔×1回数秒。大会期間外はトリガーを停止（ポータル「状態」タブから）すれば消費ゼロ |
| GitHub / Cloudflare Pages | 無料プランで十分 | 結果データは数 MB・配信は静的のみ |

> 協会ごとにキット専用の Google アカウントを新規作成する運用を推奨（権限・PAT・Drive の所有が個人に紐づかない）。

---

## 4. 協会担当ができる個別カスタマイズ

コピー後、協会担当は以下の範囲を自由にカスタマイズできる。

| カスタマイズ項目 | ターミナル | 操作場所 |
|---|---|---|
| 大会の登録・追加・ステータス切替（開催予定→速報中→結果確定） | 不要 | 管理者ポータル「大会管理」タブ |
| 年度ハブの大会一覧管理 | 不要 | 管理者ポータル「大会管理」タブ（`hub/association.json` を自動更新） |
| ブランド色・フォントの変更 | 不要 | 管理者ポータル「デザイン」タブ → カラーピッカーで選択 → 「公開サイトに反映」で即反映 |
| Drive フォルダ接続・計測ポイント設定 | 不要 | 管理者ポータル「接続設定」タブ |
| 進行モデルの選択 | 不要 | 管理者ポータル「接続設定」タブ →「進行モデル」セクション |

---

## 5. 本体アップデートの配布ポリシー

**基本方針: 協会側のカスタマイズを保護するため、本体の改善を自動で配布しない。**

"Use this template" で作成したリポジトリは本体と切り離された完全独立コピーであり、自動追従の仕組みは存在しない。これは意図した設計であり、協会がポータルや設定ファイルに加えたカスタマイズを予期せず上書きするリスクを排除するためのもの。

### 改善版の渡し方（2案）

**軽微な改善（バグ修正・GAS の小修正等）**

本体での変更ファイルを特定し、各協会担当に「このファイルをコピーしてください」と案内する。

```
案内例:
  gas/AdminPortal.gs の XX 行目を以下に差し替えてください:
  （差分を貼り付け）
```

**大型アップデート（構造変更・新機能追加等）**

新しいテンプレートから Run workflow（ステップ 3）を再実行して新リポジトリを作成する。既存リポジトリの `site/data/` 配下の結果 JSON や `hub/association.json` のデータを新リポジトリに移行してから切り替える。

---

## 6. サポート窓口の型

### 自己解決フロー（協会担当向けに案内する順序）

```
1. オンボーディングサイトの FAQ セクションを確認
       ↓ 解決しない
2. docs/SETUP_GUIDE.md のトラブルシューティング表を確認
       ↓ 解決しない
3. 管理者ポータル「状態」タブ → エラーログとトリガー稼働状況を確認
       ↓ 解決しない
4. 龍偉に連絡（以下の型で報告してもらう）
```

### 協会からの問い合わせ受付型

問い合わせを受けた際、以下の情報を最初に確認する:

| 確認項目 | 理由 |
|---|---|
| エラーメッセージ（GAS 実行ログ全文） | 原因の 80% はここに出ている |
| スクリプトプロパティの設定状況 | 未設定・誤字が最多の原因 |
| PAT の有効期限 | 90日で失効する。期限切れは頻発 |
| Cloudflare Pages の Build output directory | `site` でなければサイトが表示されない |

### 進行モデル追加依頼の対応

1. 協会からモデル定義（組数・条件・タイム拾い上げルール等）を受け取る
2. 龍偉のリポジトリで `/progression-add` スラッシュコマンドを実行（詳細: `progression/README.md`）
3. 追加・検証・コミット・push が完了したら協会に案内し、ポータルの進行モデルセレクトから選択してもらう

---

## 7. 配布チェックリスト

### 配布前（本体リポジトリの状態確認）

- [ ] GitHub リポジトリが **Template repository** 設定になっている
  - Settings → General → "Template repository" にチェックが入っている
- [ ] `main` ブランチの最新コミットが CI（`.github/workflows/validate.yml`）をパスしている
- [ ] オンボーディングサイトの URL が有効か確認（`https://rowing-results-kit.github.io/regatta-results-kit/onboarding/`）
- [ ] 実名・実際の ID が本体リポジトリに混入していないか確認

  ```bash
  grep -rn "RYUIYAMADA" gas/ site/ tools/ template/ --include="*.json" --include="*.gs" --include="*.py" --include="*.js"
  # 出力がゼロ件であること（docs/ の例示用記述は除く）
  ```

- [ ] `template/tournament.config.example.json` のデータがフィクションのみであること

### 協会ごとの記録（配布後に記録する）

| 協会名 | 担当者 GitHub | 招待日 | 承諾確認 | リポジトリ URL | 備考 |
|---|---|---|---|---|---|
| 例: 石川県ボート協会 | `ishikawa-rowing` | 2026-07-01 | ✅ | `ishikawa-rowing/regatta-2027` | — |

このテーブルをコピーして `references/` 配下の協会管理ファイルに記録する。

---

## 8. 付録: Collaborator 招待が必要な場合

リポジトリが private の間は、協会担当が "Use this template" を使うために事前に Collaborator（Read 権限）として招待する必要がある。リポジトリが public になれば招待は不要。

### 個別招待（gh CLI）

```bash
gh api repos/rowing-results-kit/regatta-results-kit/collaborators/<github-username> \
  --method PUT \
  --field permission=read
```

### 個別招待（GitHub 画面操作）

1. `https://github.com/rowing-results-kit/regatta-results-kit/settings/access` を開く
2. **"Invite a collaborator"** をクリック
3. 協会担当者の GitHub ユーザー名またはメールアドレスを入力
4. **Permission: Read** を選択して **"Add \<username\> to this repository"** をクリック
5. 招待メールが届いた旨を担当者に連絡し、承諾してもらう

### 一括招待（20協会対応）

`accounts.txt` に GitHub アカウント名を1行1件で列挙し、以下を実行する。

```bash
while IFS= read -r username; do
  echo "Inviting: $username"
  gh api repos/rowing-results-kit/regatta-results-kit/collaborators/"$username" \
    --method PUT \
    --field permission=read
done < accounts.txt
```

招待後の承諾ステータス確認:

```bash
gh api repos/rowing-results-kit/regatta-results-kit/collaborators --paginate \
  | jq '.[].login'
```
