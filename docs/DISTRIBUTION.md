# regatta-results-kit — 配布運用手順書（配布者向け）

> **対象読者**: このキットを協会に配布する龍偉（配布者）向けの運用手順書。
> 協会の技術担当者向けの構築手順は `docs/SETUP_GUIDE.md` を参照。

---

## 目次

1. [配布モデルの全体像](#1-配布モデルの全体像)
2. [招待手順](#2-招待手順)
3. [協会側の初期構築](#3-協会側の初期構築)
4. [協会担当ができる個別カスタマイズ](#4-協会担当ができる個別カスタマイズ)
5. [本体アップデートの配布ポリシー](#5-本体アップデートの配布ポリシー)
6. [サポート窓口の型](#6-サポート窓口の型)
7. [配布チェックリスト](#7-配布チェックリスト)

---

## 1. 配布モデルの全体像

```
[龍偉の GitHub]
  regatta-results-kit（private・Template Repository 設定済み）
        │
        │ 協会担当を Collaborator（Read）招待
        │ ↓ 協会担当が "Use this template" でコピー作成
        ▼
[協会の GitHub]
  <association-regatta-YYYY>（完全独立コピー）
        │
        ├── 協会の Google Drive（CSV 投入・GAS 実行）
        ├── 協会の Cloudflare Pages（速報サイト配信）
        └── 協会の GAS（自動処理・管理者ポータル）
```

**重要な原則:**

- コピー作成後は本体との自動連携は一切ない。協会リポジトリは完全独立。
- 協会のデータ（Drive・GAS・Pages）は 100% 協会自身のアカウント上に存在する。龍偉のアカウントを共有・利用する箇所はない。
- 本体を改善しても協会リポジトリには自動で反映されない（[§5](#5-本体アップデートの配布ポリシー) 参照）。

---

## 2. 招待手順

協会の担当者が "Use this template" を使うためには、事前に Collaborator（Read 権限）として招待する必要がある。

### 2-1 個別招待（gh CLI）

```bash
gh api repos/RYUIYAMADA/regatta-results-kit/collaborators/<github-username> \
  --method PUT \
  --field permission=read
```

> `<github-username>` は招待する協会担当者の GitHub アカウント名。

### 2-2 個別招待（GitHub 画面操作）

1. `https://github.com/RYUIYAMADA/regatta-results-kit/settings/access` を開く
2. **"Invite a collaborator"** をクリック
3. 協会担当者の GitHub ユーザー名またはメールアドレスを入力
4. **Permission: Read** を選択して **"Add \<username\> to this repository"** をクリック
5. 招待メールが届いた旨を担当者に連絡し、承諾してもらう

### 2-3 20協会を一括招待する場合（ループ）

`accounts.txt` に GitHub アカウント名を1行1件で列挙し、以下を実行する。

```bash
# accounts.txt の例:
# ishikawa-rowing
# akita-rowing-assoc
# tohoku-masters

while IFS= read -r username; do
  echo "Inviting: $username"
  gh api repos/RYUIYAMADA/regatta-results-kit/collaborators/"$username" \
    --method PUT \
    --field permission=read
done < accounts.txt
```

招待後に承諾ステータスを確認する場合:

```bash
gh api repos/RYUIYAMADA/regatta-results-kit/collaborators --paginate \
  | jq '.[].login'
```

### 2-4 協会担当者への案内文イメージ

招待後、協会担当者に以下を伝える:

> GitHub に招待メールを送りました。承諾後、`https://github.com/RYUIYAMADA/regatta-results-kit` を開き、右上の **"Use this template"** → **"Create a new repository"** でご自身の GitHub アカウントにリポジトリを作成してください。その後の構築手順は同リポジトリ内の `docs/SETUP_GUIDE.md` をご覧ください。

---

## 3. 協会側の初期構築

### 必要なもの（協会側で用意）

| 項目 | 費用 |
|---|---|
| GitHub アカウント | 無料 |
| Google アカウント | 無料 |
| Cloudflare アカウント | 無料 |
| PC（macOS / Windows / Linux） | — |
| Python 3.8 以上 | 無料 |
| インターネット接続 | — |

所要時間: **約1時間**（慣れた担当者で 30〜45 分、初めての担当者で 60〜90 分）

### 容量・無料枠の目安（協会専用の無料 Google アカウントで十分）

協会ごとに**キット専用の Google アカウント**を新規作成する運用を推奨する（権限・PAT・Drive の所有が個人に紐づかない）。無料枠で足りる根拠:

| リソース | 無料枠 | 1大会の実消費目安 |
|---|---|---|
| Google Drive 容量 | 15GB | 計測CSV 全レース分 ≈ 0.1MB / 帳票・結果PDF一式 ≈ 10〜30MB → **1大会 50MB 未満**（毎年数大会でも数十年分入る） |
| GAS トリガー実行 | 90分/日 | 2分間隔×1回数秒。2026年大会の本番2日間を無料同等クォータで完走した実績あり。**大会期間外はトリガーを停止**（SETUP_GUIDE ステップ10）すれば消費ゼロ |
| GitHub / Cloudflare Pages | 無料プランで十分 | 結果データは数MB・配信は静的のみ |

注意: 無料 Google アカウントは長期間（2年）未使用だと削除対象になりうるため、年1回はログインする運用を協会に案内すること。

### 初期構築の3パターン

| パターン | 担当 | 概要 | 向いているケース |
|---|---|---|---|
| **A. 自力構築** | 協会の技術担当 | `docs/SETUP_GUIDE.md` を読んで全ステップを自力で実施 | 技術担当が常駐している大きな協会 |
| **B. ウィザード構築** | 協会担当（Claude Code あり） | リポジトリを clone して Claude Code を起動し `/regatta-setup` ウィザードを実行。対話形式でconfigファイル生成→scaffold→手順書出力まで誘導される | Claude Code を導入済みの担当者 |
| **C. 龍偉代行構築** | 龍偉が scaffold まで実施 | 龍偉が `tournament.config.json` 記入→scaffold 実行→GitHub push まで行い、協会担当には「Script Properties 投入」と「Cloudflare Pages 接続」だけ残して引き渡す | 技術担当がいない小規模協会・急ぎの場合 |

**パターン C の引き渡し内容:**

龍偉が行う作業:
1. 協会にヒアリングして `tournament.config.json` を記入
2. `python3 tools/scaffold.py --config tournament.config.json` を実行
3. 協会の GitHub アカウントにリポジトリを作成（または代行作成）して push
4. 生成された `docs/SETUP_GUIDE.generated.md` を協会担当に渡す

協会担当が行う残り作業:
- GAS のスクリプトプロパティ投入（`SETUP_GUIDE.generated.md` の Step 6 参照）
- Cloudflare Pages の接続設定（`SETUP_GUIDE.generated.md` の Step 2 参照）

---

## 4. 協会担当ができる個別カスタマイズ

コピー後、協会担当は以下の範囲を自由にカスタマイズできる。

| カスタマイズ項目 | ターミナル | 操作場所 |
|---|---|---|
| 大会の登録・追加・ステータス切替（開催予定→速報中→結果確定） | ○ 不要 | 管理者ポータル「大会管理」タブ |
| 年度ハブの大会一覧管理 | ○ 不要 | 管理者ポータル「大会管理」タブ（`hub/association.json` を自動更新） |
| ブランド色・フォントの変更 | ○ 不要 | 管理者ポータル「デザイン」タブ → カラーピッカーで選択 → 「公開サイトに反映」で即反映 |
| Drive フォルダ接続・計測ポイント設定 | ○ 不要 | 管理者ポータル「接続設定」タブ |
| 進行モデルの選択 | ○ 不要 | 管理者ポータル「接続設定」タブ →「進行モデル」セクション |
| 大会名・会場等の設定変更（作り直し） | ● 必要 | `tournament.config.json` を編集 → `python3 tools/scaffold.py --config tournament.config.json` を再実行 |
| スタッフ向け文書の文言調整 | ● 必要 | `staff/__STAFF_PATH__/` 配下の HTML を直接編集、またはscaffold 再実行でテンプレから再生成 |

> ○ = ターミナル不要（ブラウザだけで完結） / ● = ターミナル必要

---

## 5. 本体アップデートの配布ポリシー

**基本方針: 協会側のカスタマイズを保護するため、本体の改善を自動で配布しない。**

"Use this template" で作成したリポジトリは本体と切り離された完全独立コピーであり、自動追従の仕組みは存在しない。これは意図した設計であり、協会がポータルや設定ファイルに加えたカスタマイズを予期せず上書きするリスクを排除するためのもの。

### 改善版の渡し方（2案）

**軽微な改善（バグ修正・GAS の小修正・スクリプト改善等）:**

本体での変更ファイルを特定し、各協会担当に「このファイルをコピーしてください」と案内する。協会担当はポータルの「接続設定」タブから直接変更するか、ファイルを手動で差し替えてコミットする。

```
案内例:
  gas/Code.gs の XX 行目を以下に差し替えてください:
  （差分を貼り付け）
```

**大型アップデート（構造変更・新機能追加等）:**

新しいテンプレートから `python3 tools/scaffold.py` を実行し直して新リポジトリを作成する。既存リポジトリの `site/data/` 配下の結果 JSON や `hub/association.json` のデータを新リポジトリに移行してから切り替える。

---

## 6. サポート窓口の型

### 自己解決フロー（協会担当向けに案内する順序）

```
1. LP のよくある質問セクションを確認
       ↓ 解決しない
2. docs/SETUP_GUIDE.md または docs/SETUP_GUIDE.generated.md を確認
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

協会から「このルールを進行モデルに追加してほしい」という依頼が来た場合:

1. 協会からモデル定義（組数・条件・タイム拾い上げルール等）を受け取る
2. 龍偉のリポジトリで `/progression-add` スラッシュコマンドを実行（詳細: `progression/README.md`）
3. 追加・検証・コミット・push が完了したら協会に案内し、ポータルの進行モデルセレクトから選択してもらう

---

## 7. 配布チェックリスト

### 配布前（本体リポジトリの状態確認）

- [ ] GitHub リポジトリが **Template repository** 設定になっている
  - Settings → General → "Template repository" にチェックが入っている
- [ ] `main` ブランチの最新コミットが CI（`.github/workflows/validate.yml`）をパスしている
- [ ] 実名・実際の ID が本体リポジトリに混入していないか確認

  ```bash
  # リポジトリルートで実行
  grep -rn "RYUIYAMADA" gas/ site/ tools/ template/ --include="*.json" --include="*.gs" --include="*.py" --include="*.js"
  # 出力がゼロ件であること（docs/SETUP_GUIDE.md の例示用記述は除く）
  ```

- [ ] `template/tournament.config.example.json` のデータがフィクションのみであること

### 協会ごとの記録（配布後に記録する）

| 協会名 | 担当者 GitHub | 招待日 | 承諾確認 | リポジトリ URL | 初期構築パターン | 備考 |
|---|---|---|---|---|---|---|
| 例: 石川県ボート協会 | `ishikawa-rowing` | 2026-07-01 | ✅ | `ishikawa-rowing/regatta-2027` | A（自力） | — |

このテーブルをコピーして `references/` 配下の協会管理ファイルに記録する。
