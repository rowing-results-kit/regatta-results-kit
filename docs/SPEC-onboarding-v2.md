# SPEC: オンボーディング v2 — 配布者が URL を渡すだけで協会が自力導入完了できる仕組み

作成: 2026-06-12 Fable 5（PM）。Gate1 確定済み。**本 SPEC に記載の設計判断は変更禁止**。
「PM 確認事項」マークが付いた箇所のみ PM への確認を経て決定する。

---

## 1. 背景と優先順位

### 現状の課題

現在の初期構築フローは「ローカルで `python3 tools/scaffold.py` を実行」を協会担当者に求めている。
Python 環境・ターミナル操作・git 操作を前提とするため、技術担当が不在の協会（新卒スタッフ・事務担当）が自力で完結できない。

### ゴール（確定）

> **配布者（龍偉）はオンボーディングサイトの URL を渡すだけ。**
> 協会担当者（新卒非エンジニア・Claude Code なし・個別サポートなし）が自力で導入完了できる。

### 優先順位（変更禁止）

1. **渡すだけ** — 配布者の作業を「URL 送信 1 回」に限定する
2. **低スキル対応** — ターミナル・Python・git コマンド操作を協会側フローから全廃する
3. **3アカウント以上増やさない** — GitHub + Google + Cloudflare の 3 つのみ（PAT は 1 回貼る運用を維持）

---

## 2. 協会担当者ジャーニー（7ステップ完全定義）

前提: 協会担当者がオンボーディングサイトの URL を受け取った状態からスタート。

---

### Step 1 — テンプレートリポジトリのコピー

**操作**

1. オンボーディングサイトに記載の URL（`https://github.com/rowing-results-kit/regatta-results-kit`）を開く
2. 右上の **"Use this template"** → **"Create a new repository"** をクリック
3. Owner を自団体の GitHub アカウントに変更
4. Repository name を入力（例: `association-regatta-2027`）
5. Visibility = **Private** を選択（推奨）
6. **"Create repository"** をクリック

**所要時間**: 3〜5分

**セルフチェック**
- `https://github.com/<あなたのアカウント>/<リポジトリ名>` でページが開ける → OK
- `.github/workflows/` フォルダが存在する → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| "Use this template" ボタンが無い | 招待未承諾またはリポジトリが Private のまま | 配布者から届いた招待メールを承諾してから再試行 |
| Owner に自分のアカウントが出ない | ログインアカウントが違う | 右上アバターを確認してから再試行 |

---

### Step 2 — Cloudflare Pages の接続

**操作**

1. `https://dash.cloudflare.com` を開き、Cloudflare アカウントでログイン（なければ無料で新規作成）
2. 左メニュー → **Workers & Pages** → **Pages** → **"Create application"** → **"Connect to Git"**
3. **"Connect GitHub"** で GitHub 認可 → Step 1 のリポジトリを選択 → **"Begin setup"**
4. ビルド設定を以下の通り入力:

| 項目 | 設定値 |
|---|---|
| Framework preset | `None` |
| Build command | （空欄） |
| **Build output directory** | **`site`** ← 最重要。必ずこの通り |
| Root directory | （空欄） |
| Production branch | `main` |

5. **"Save and Deploy"** → 2〜5分待つ

**所要時間**: 10〜15分

**セルフチェック**
- Cloudflare Pages の Deployments 画面でステータスが **"Success"** になる → OK
- `https://<project-name>.pages.dev` でページが表示される（初回はデフォルト画面でよい） → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| サイトが 404 または空白 | Build output directory が `site` 以外 | Cloudflare Pages の Settings → Builds & deployments → Build output directory を `site` に修正して再デプロイ |
| Deployments が "Failed" | Build command に値が入っている | Build command を空欄にして再デプロイ |

---

### Step 3 — GitHub Actions で大会初期構築（Run workflow）

ターミナル・Python・git 操作は不要。GitHub 画面だけで操作する。

**操作**

1. Step 1 で作成したリポジトリを GitHub で開く
2. 上部タブ **"Actions"** をクリック
3. 左サイドバーの **"大会初期構築"**（`setup-tournament`）をクリック
4. 右側の **"Run workflow"** ボタンをクリック
5. 以下の入力フォームを埋める:

| 入力項目 | 例 | 説明 |
|---|---|---|
| 大会名 | `第01回○○マスターズレガッタ` | 速報サイトのヘッダーに表示 |
| 会場 | `○○漕艇競技場` | 同上 |
| 開始日 | `2027-06-14` | YYYY-MM-DD 形式 |
| 終了日 | `2027-06-15` | YYYY-MM-DD 形式 |
| メインカラー | `#1a3a5c` | 速報サイトの主色（#RRGGBB 形式） |

6. **"Run workflow"** をクリック

**所要時間**: 2〜5分（workflow 実行完了まで）

**セルフチェック**
- Actions タブでジョブが緑チェック（✅）になる → OK
- リポジトリに `site/data/master.json` が作成されている → OK（Actions → 該当ジョブ → Files changed から確認）
- Cloudflare Pages が自動デプロイされ、速報サイトに大会名が表示される → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| Actions タブに "大会初期構築" が無い | テンプレートのコピーが古い | リポジトリ作成をやり直す（Step 1 から） |
| ジョブが赤バツ（❌） | 入力値の形式エラーが多い | ジョブログを確認 → 日付は YYYY-MM-DD 形式か、カラーは `#` から始まる 7 文字かを確認してやり直す |
| `site/data/master.json` が作成されない | workflow の permissions エラー | リポジトリ Settings → Actions → General → Workflow permissions を "Read and write permissions" に変更して再実行 |

---

### Step 4 — Google Drive フォルダの作成

**操作**

1. Google Drive（自団体アカウント）を開く
2. **ルートフォルダを 1 つ作成**（名前は大会名など任意。例: `○○レガッタ2027`）
3. 作成したフォルダを開いたときのブラウザ URL 末尾の文字列をコピー（これがフォルダ ID）

```
例: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStU
                                            ^^^^^^^^^^^^^^^^^^^^^^^^ ← これをコピー
```

4. サブフォルダは GAS の初回実行時に自動作成されるため不要

**所要時間**: 5分

**セルフチェック**
- URL 末尾の文字列（英数字 20〜30 文字）をコピーできた → OK

---

### Step 5 — GAS の「コピーを作成」とプロパティ入力

コードの貼り付けは不要。Google ドライブ上のテンプレートを「コピーを作成」するだけ。

**操作（GAS-A: CSV→JSON Push + 管理者ポータル）**

1. オンボーディングサイトに記載のリンク（GAS-A テンプレート）を開く
2. メニュー **"ファイル"** → **"コピーを作成"** → 名前を入力（例: `○○レガッタ2027-csv-push`）→ **"コピーを作成"**
3. コピーされた GAS プロジェクトが開く
4. 左側の歯車アイコン（プロジェクトの設定）→ **"スクリプト プロパティ"** → **"スクリプト プロパティを追加"** で以下を入力:

| プロパティ名 | 値 |
|---|---|
| `DRIVE_ROOT_FOLDER_ID` | Step 4 でコピーしたフォルダ ID |
| `GITHUB_OWNER` | 自分の GitHub アカウント名（例: `your-org`） |
| `GITHUB_REPO` | Step 1 で作成したリポジトリ名（例: `association-regatta-2027`） |
| `MEASUREMENT_POINTS` | `500m,1000m`（変更不要） |

5. GITHUB_TOKEN は Step 6 の後で設定する（後述）

**操作（GAS-B: PDF Publisher）**（PDF 帳票が必要な場合のみ）

1. オンボーディングサイトに記載のリンク（GAS-B テンプレート）を開く
2. **"コピーを作成"** → 名前を入力
3. スクリプトプロパティに以下を入力:

| プロパティ名 | 値 |
|---|---|
| `GITHUB_REPO` | Step 1 のリポジトリ名 |
| `TEMPLATE_SHEET_ID` | PDF テンプレートの Spreadsheet ID |
| `PDF_OUTPUT_FOLDER_ID` | PDF 出力先 Drive フォルダ ID |
| その他 | オンボーディングサイトの表を参照 |

**操作（GAS-C: 判定員帳票）**（帳票が必要な場合のみ）GAS-B と同様の手順。

**所要時間**: GAS-A のみなら 10分、B・C も含めると 20〜30分

**セルフチェック**
- GAS エディタのスクリプトプロパティ一覧に設定した全キーが表示される → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| "コピーを作成" が見当たらない | Google アカウントにログインしていない | Google アカウントでログインしてから再試行 |
| プロパティが保存されない | プロパティ名を誤入力 | 入力欄のキー名を SPEC の表と一文字ずつ照合 |

---

### Step 6 — GitHub PAT の作成と設定

**操作**

1. GitHub にログイン → 右上アバター → **Settings** → 左メニュー最下部 **"Developer settings"** → **"Personal access tokens"** → **"Fine-grained tokens"** → **"Generate new token"**
2. 以下のとおり設定:

| 項目 | 設定値 |
|---|---|
| Token name | 任意（例: `regatta-2027-gas`） |
| Expiration | **90 days** |
| Resource owner | Step 1 のリポジトリが属するアカウント |
| Repository access | **Only select repositories** → Step 1 のリポジトリのみ選択 |
| Repository permissions → Contents | **Read and Write** |
| それ以外 | No access のまま |

3. **"Generate token"** → 表示されたトークン（`github_pat_...` から始まる文字列）を**今すぐコピー**（再表示不可）
4. GAS-A のスクリプトプロパティ → `GITHUB_TOKEN` に貼り付けて保存
5. GAS-B / GAS-C を使う場合も同じトークンをそれぞれの `GITHUB_TOKEN` に設定

**所要時間**: 10分

**セルフチェック**
- GAS エディタのスクリプトプロパティに `GITHUB_TOKEN` が設定されている（値は先頭6文字 + `***` で表示） → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| トークンを閉じてしまった | 再表示不可 | 同じ手順でトークンを新たに生成してプロパティに上書き |
| 後で PAT 期限切れ赤バッジが管理ポータルに出る | 90日経過 | 同手順でトークン再生成 → `GITHUB_TOKEN` を上書き |

---

### Step 7 — 管理者ポータルの公開と接続テスト

**操作**

1. GAS-A エディタを開く → 右上 **"デプロイ"** → **"新しいデプロイ"**
2. 種類（歯車アイコン）→ **"ウェブアプリ"** を選択
3. 設定:

| 項目 | 設定値 |
|---|---|
| 次のユーザーとして実行 | **自分** |
| アクセスできるユーザー | **自分のみ** |

4. **"デプロイ"** → 権限確認 → **"許可"**
5. 表示された **ウェブアプリ URL** をブックマーク
6. URL を開く → 管理者ポータルが表示される
7. **"接続設定"** タブ → **"GitHub 接続テスト"** ボタンをクリック → 緑バッジ表示 → OK
8. **"Drive 接続テスト"** ボタンをクリック → フォルダ名が表示される → OK

**所要時間**: 10分

**セルフチェック（導入完了基準）**
- 管理者ポータルが開ける → OK
- Drive 接続テストがフォルダ名表示 → OK
- GitHub 接続テストが緑バッジ → OK
- 「状態」タブ「初期セットアップ実行」ボタンを押し → 「✅ Drive サブフォルダ作成済み」「✅ 自動更新 稼働開始」表示 → OK
- 「状態」タブ「自動更新: 🟢 稼働中」表示 → OK
- `https://<project>.pages.dev` で速報サイトに大会名・会場・日程が表示される → OK

> **導入完了 = 接続テスト（Drive・GitHub）OK ＋ 自動更新が稼働中 ＝ 状態が全部緑**

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| GitHub 接続テストが赤バッジ | `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` のどれかが誤り | "接続設定" タブで値を確認・修正 → 再テスト |
| Drive テストが "DRIVE_ROOT_FOLDER_ID が未設定" | Step 5 のプロパティ未入力 | "接続設定" タブ → フォルダ URL または ID を入力して保存 → 再テスト |
| ポータルが "You need permission" | デプロイ設定で "自分のみ" にしたが別アカウントでアクセスした | 正しい Google アカウントでアクセスする |

---

## 3. 成果物一覧と技術詳細

### 3-1 `.github/workflows/setup-tournament.yml`（新規作成）

**目的**: `workflow_dispatch` による GUI 起動でテンプレリポジトリに `site/` フォルダを生成し self-commit する。ターミナル・Python 環境を協会側フローから全廃する。

**`workflow_dispatch` 入力スキーマ**:

```yaml
on:
  workflow_dispatch:
    inputs:
      tournament_name:
        description: '大会名（例: 第01回○○マスターズレガッタ）'
        required: true
        type: string
      venue:
        description: '会場（例: ○○漕艇競技場）'
        required: true
        type: string
      start_date:
        description: '開始日（YYYY-MM-DD）'
        required: true
        type: string
      end_date:
        description: '終了日（YYYY-MM-DD）'
        required: true
        type: string
      primary_color:
        description: 'メインカラー（例: #1a3a5c）'
        required: false
        default: '#2D4F2C'
        type: string
```

**入力バリデーション**（workflow 内 step で実施）:
- `start_date` / `end_date`: `YYYY-MM-DD` 正規表現でチェック。不正なら `exit 1` でジョブ失敗（ログにエラー理由を明記）
- `primary_color`: `^#[0-9A-Fa-f]{6}$` チェック。不正はデフォルト値 `#2D4F2C` にフォールバック（失敗扱いにしない）

**permissions**:

```yaml
permissions:
  contents: write  # self-commit のため
```

**scaffold 呼び出し**:

```yaml
- name: scaffold 実行
  run: python3 tools/scaffold.py --config /tmp/tournament.config.json
```

`tournament.config.json` は workflow 内で `inputs` の値から `echo` コマンドで生成する（ファイルコミット不要）。

**self-commit 手順**:

```yaml
- name: 生成ファイルをコミット
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add site/
    git diff --cached --quiet || git commit -m "scaffold: 大会初期構築 [${{ inputs.tournament_name }}]"
    git push
  env:
    GITHUB_TOKEN: ${{ github.token }}
```

GITHUB_TOKEN は `secrets.GITHUB_TOKEN` ではなく `github.token` を使用（PAT 不要。`permissions: contents: write` で自動付与される）。

**冪等性（2回実行時の挙動）**:
- `git diff --cached --quiet` で差分なしを検知 → commit をスキップして正常終了
- 既存 `site/` が存在する場合、scaffold は上書き生成する（既存データは消えない。`site/data/results/` は scaffold の対象外とすること）

**validate.yml との関係**:
- validate.yml は `site/data/results/**.json` および `site/data/master.json` の変更をトリガーに実行
- 初回 scaffold 実行時に生成される `master.json` は雛形（`schedule: []` の空配列）のため、validate.yml の E2E テストが fail しないよう `test/e2e_test.py --skip-pipeline` は雛形状態で exit 0 を返すことを保証する（詳細は 3-3 を参照）

---

### 3-2 `heartbeat-watchdog.yml` の変数廃止改修

**現状の問題**: `vars.TOURNAMENT_START` / `vars.TOURNAMENT_END`（GitHub リポジトリ変数）を参照しており、協会担当者がリポジトリ変数を設定する作業が必要。

**改修方針**: `tournament.config.json` から日付を読み取る方式に変更。

**変更後の実装方針**:

```bash
# heartbeat-watchdog.yml の Check ステップ内
# vars.TOURNAMENT_START / TOURNAMENT_END を廃止し以下で読む:
CONFIG_FILE="tournament.config.json"
if [ -f "$CONFIG_FILE" ]; then
  TOURNAMENT_START=$(python3 -c "import json,sys; c=json.load(open('$CONFIG_FILE')); print(c.get('start_date',''))")
  TOURNAMENT_END=$(python3 -c "import json,sys; c=json.load(open('$CONFIG_FILE')); print(c.get('end_date',''))")
fi
```

`tournament.config.json` が存在しない場合（テンプレート直後状態）は、既存と同じく「未設定のためスキップ」で exit 0 する（現行コード 56〜59 行目の分岐を流用）。

`vars.TOURNAMENT_START` / `vars.TOURNAMENT_END` の参照コードは削除し、協会担当者がリポジトリ変数を設定する作業を撤廃する。

---

### 3-3 `validate.yml` — テンプレート直後状態での fail 防止

**現状**: `test/e2e_test.py --skip-pipeline` は `site/data/master.json` を読んで検証する。scaffold が生成する雛形 master.json（`schedule: []`・`results: []`）で検証が走ると、必須フィールド欠如で fail する可能性がある。

**保証方法**:
- `test/e2e_test.py` に「`master.json` の `schedule` が空配列の場合は "初期テンプレート状態" とみなして skip 扱いで exit 0」を追加する
- または validate.yml の paths トリガーに `setup-tournament.yml` のコミットを除外するコメントを追加し、scaffold ジョブのコミットメッセージが `scaffold:` で始まる場合はスキップする（`if: ${{ !startsWith(github.event.head_commit.message, 'scaffold:') }}`）

実装着手時にどちらを採用するかは working-engineer が判断してよい（両方実装するとテストの網羅性が上がる）。

---

### 3-4 GAS 改修詳細

#### GAS の配布方法変更: コード貼り付け廃止 → 「コピーを作成」方式

**現状**: `gas/Code.gs` 等のコードを協会担当者が GAS エディタに手動貼り付け。
**改修後**: 龍偉が管理するテンプレート GAS プロジェクト（Google Drive 上）を協会担当者が「コピーを作成」するだけ。コードの貼り付けは不要。

配布するテンプレート GAS プロジェクトは 3 つ（現行の gas/ ディレクトリ構成に対応）:

| テンプレート | ソースファイル | 備考 |
|---|---|---|
| GAS-A: CSV→JSON Push + 管理者ポータル | `gas/Code.gs` + `gas/AdminPortal.gs` + `gas/portal.html` | メイン。必須 |
| GAS-B: PDF Publisher | `gas/pdf_publisher/Code.gs` + `gas/pdf_publisher/Setup.gs` + `gas/pdf_publisher/Shared.gs` | 任意 |
| GAS-C: 判定員帳票 | `gas/judge_form_publisher/Code.gs` + `gas/judge_form_publisher/Setup.gs` + `gas/judge_form_publisher/Shared.gs` | 任意 |

テンプレート GAS プロジェクトの共有リンク（閲覧者: 全員）をオンボーディングサイトに掲載する。

#### `setupFromConfig` 入力削減（GAS-A: `gas/Code.gs`）

現状の `saveSetup()` はコード上部のグローバル定数（`SETUP_DRIVE_FOLDER_ID` / `SETUP_GITHUB_TOKEN`）に値を書き込む方式。`GITHUB_OWNER` / `GITHUB_REPO` は手動設定が必要。

**改修後**: スクリプトプロパティ画面から全 5 プロパティを直接入力することを主フローとする（「スクリプトプロパティを追加」ボタンで UI 入力）。`saveSetup()` / `SETUP_DRIVE_FOLDER_ID` / `SETUP_GITHUB_TOKEN` のグローバル定数方式は廃止（コードから削除）。

管理者ポータルの「接続設定」タブから設定する方式（`portalSaveSettings()` 経由）でも同等の操作ができるため、初回設定後はポータルで完結する。

#### 「GitHub 接続テスト」ボタン（`gas/AdminPortal.gs` + `gas/portal.html`）

**追加実装箇所**: `AdminPortal.gs` に `portalTestGitHub()` 関数を追加。

```javascript
function portalTestGitHub() {
  try {
    var ctx = portalGithubCtx_();
    // リポジトリメタデータ取得で疎通確認
    var url = ctx.apiBase + '/repos/' + ctx.owner + '/' + ctx.repo;
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { Authorization: 'token ' + ctx.token, Accept: 'application/vnd.github.v3+json' },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code === 200) {
      var body = JSON.parse(res.getContentText());
      return { ok: true, data: { repo: body.full_name, private: body.private } };
    }
    if (code === 401) return { ok: false, error: 'GITHUB_TOKEN が無効または期限切れ' };
    if (code === 404) return { ok: false, error: 'リポジトリが見つからない。GITHUB_OWNER / GITHUB_REPO を確認' };
    return { ok: false, error: 'HTTP ' + code };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}
```

`portal.html` の「接続設定」タブに「GitHub 接続テスト」ボタンを追加し `google.script.run.withSuccessHandler(...)portalTestGitHub()` を呼ぶ。結果を緑（OK）/ 赤（NG）バッジで表示する。

#### PAT 期限切れ赤バッジ（`gas/AdminPortal.gs` + `gas/portal.html`）

**実装箇所**: `portalGetStatus()` の戻り値に `patExpiresAt` フィールドを追加。

実装方針: GitHub API の `/user` エンドポイントにリクエストし、レスポンスヘッダー `github-authentication-token-expiration` から PAT 期限を取得してスクリプトプロパティ `PAT_EXPIRES_AT` にキャッシュする（毎回 API を叩かない）。

```javascript
// portalGetStatus() 内に追加
var patExpiresAt = props.getProperty('PAT_EXPIRES_AT') || '';
// キャッシュが空または 1 日経過した場合のみ再取得
// ...（実装詳細は working-engineer が決定）
```

`portal.html` の「状態」タブおよび「接続設定」タブの GitHub 接続テスト結果に期限日を表示。期限まで 14 日以内なら赤バッジ、30 日以内なら黄バッジで警告する。

---

### 3-5 オンボーディングサイト

#### 配置場所 — **案 A（GitHub Pages docs/onboarding）採用・PM 裁定済み（2026-06-12）**

**採用: 案 A — `regatta-results-kit` リポジトリの GitHub Pages として同梱**
- 配置: `docs/onboarding/index.html`（GitHub Pages の `docs/` フォルダ公開設定）
- URL（確定・固定）: `https://rowing-results-kit.github.io/regatta-results-kit/onboarding/`
- 実装済み（2026-06-12 working-designer）: GitHub Pages（main/docs）有効化済み

理由: オンボーディングサイトの内容（手順・スクリーンショット・GAS テンプレートリンク）はリポジトリのバージョンと密結合しており、kit の public 化 GO と同時にリリースするのが自然。

廃案: 案 B（html-share 暫定）は不採用。リポジトリ更新との同期が手動になりメンテナンスコストが増大するため。

#### オンボーディングサイトのコンテンツ要件

- 上部に「Use this template」ボタン（`regatta-results-kit` へのリンク）
- Step 1〜7 の手順を各ステップのスクリーンショット枠付きで掲載（画像は後から差し替え可の `<img>` タグで placeholder）
- 各ステップにセルフチェックリスト（チェックボックス形式・状態はページ内 JS で管理・保存不要）
- GAS テンプレートのリンク（GAS-A / GAS-B / GAS-C の「コピーを作成」リンク）
- よくある質問（FAQ）セクション: 上記 NGパターンを Q&A 形式で掲載

---

## 4. 受入条件チェックリスト（E2E・協会担当者視点）

以下は「GitHub アカウントのみ持っている状態」から「速報サイトが表示され管理ポータルの接続テストが全グリーンになるまで」を機械的に検証する条件一覧。

- [ ] オンボーディングサイトの URL のみ渡された状態から、Step 1〜7 の手順書だけで完了できる
- [ ] Step 3（Run workflow）で `site/data/master.json` が自動コミットされ、Cloudflare Pages に自動デプロイされる
- [ ] `site/data/master.json` に `tournament_name` / `venue` / `start_date` / `end_date` / `primary_color` が workflow inputs の値で正しく反映されている
- [ ] `https://<project>.pages.dev` で速報サイトが表示される（大会名がヘッダーに出る）
- [ ] 管理者ポータルの「GitHub 接続テスト」が緑バッジを返す
- [ ] 管理者ポータルの「Drive 接続テスト」がフォルダ名を返す
- [ ] `heartbeat-watchdog.yml` を `workflow_dispatch` で手動実行したとき、`tournament.config.json` が存在すれば大会期間判定を実施し、存在しなければ「スキップ」で exit 0 になる
- [ ] `validate.yml` が scaffold 直後の雛形 `master.json`（`schedule: []`）で fail しない
- [ ] workflow を 2 回実行したとき（冪等性）、2 回目はコミットが発生せず正常終了する

---

## 5. テスト戦略

### Actions テンプレートコピー後の初回実行

- テスト用 GitHub Organization に private リポジトリを作成し `setup-tournament.yml` を `workflow_dispatch` で実行
- 入力: 大会名「テスト大会」/ 会場「テスト会場」/ 開始日 `2027-01-01` / 終了日 `2027-01-02` / カラー `#1a3a5c`
- 確認: ジョブ緑・`site/data/master.json` 生成・`site/` 配下のファイル群が正しく生成される

### PAT 無効時の挙動

- `GITHUB_TOKEN` に無効なトークンを設定した状態で管理ポータルの「GitHub 接続テスト」を実行
- 期待: `{ ok: false, error: 'GITHUB_TOKEN が無効または期限切れ' }` が返り、赤バッジが表示される
- GAS の `onTrigger()` 内 `pushToGitHub()` が `checkRateLimit()` で HTTP 401 を検知し `API_RATE_LIMITED` フラグを立てる

### 冪等性テスト

- `setup-tournament.yml` を同じ inputs で 2 回実行
- 1 回目: コミット生成 → 2 回目: `git diff --cached --quiet` が 0 差分を検知してコミットをスキップし正常終了
- Actions のログに "変更なし、コミットをスキップ" が出力されること

---

## 6. スコープ外（明記）

以下は本 SPEC の対象外。実装禁止。

- **PAT 完全排除（GitHub App 化）**: GAS から GitHub API を呼ぶ際の認証に GitHub App を使う構成。現在の PAT 1 回貼る運用の改善は別フェーズ（Phase N）で検討
- **GitHub Pages 移行**: ホスティングを Cloudflare Pages から GitHub Pages に変更すること。理由: キャッシュ制御ヘッダー（`Cache-Control: no-cache`）が GitHub Pages では設定できず速報用途に不適。`_headers` ファイルによる Cloudflare 独自ルールが機能しなくなる
- **自動進行実行**: 進行モデルライブラリの自動実行。現フェーズでは管理者が手動で実行するフローを維持
- **ローカル Python / git 操作の復活**: 協会担当者のフローにターミナル操作を再導入すること

---

## 7. 付録: 実装上の参照先（実コードとの対応）

| 本 SPEC の成果物 | 実装参照先 |
|---|---|
| `setup-tournament.yml` | 新規作成（`tools/scaffold.py` の呼び出し方は `DISTRIBUTION.md` の「パターン C」を参照） |
| heartbeat 変数廃止 | `.github/workflows/heartbeat-watchdog.yml` 53〜63 行目（`vars.TOURNAMENT_START` / `TOURNAMENT_END` 参照箇所） |
| validate 雛形対応 | `.github/workflows/validate.yml`・`test/e2e_test.py`（`--skip-pipeline` オプション） |
| `portalTestGitHub()` | `gas/AdminPortal.gs`（既存の `portalTestDrive()` と同パターンで実装） |
| PAT 期限バッジ | `gas/AdminPortal.gs` の `portalGetStatus()` + `gas/portal.html` の「状態」タブ |
| GAS コード貼り付け廃止 | `docs/SETUP_GUIDE.md` ステップ 5（「コピーを作成」方式に書き換え） |
| スクリプトプロパティ直接入力主フロー | `gas/Code.gs` のグローバル定数 `SETUP_DRIVE_FOLDER_ID` / `SETUP_GITHUB_TOKEN`（削除対象） |
