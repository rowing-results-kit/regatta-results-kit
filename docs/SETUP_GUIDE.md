# regatta-results-kit — セットアップ手順書（一般版）

> **scaffold 実行後に生成される `docs/SETUP_GUIDE.generated.md` は、
> この手順書に大会固有の値（フォルダ ID・リポジトリ名等）を自動で埋め込んだものです。**
> 通常は生成版を使い、何らかの理由で生成版が手元にない場合にこの一般版を参照してください。

---

## 対象読者

初めてこのキットを使う協会・大会の技術担当者。
全ての設定は **自団体のアカウント** で完結します。キット提供者のアカウントを共有・借用する箇所は一切ありません。

---

## 前提

- **Google アカウント**（無料アカウント可）
- **GitHub アカウント**（無料アカウント可）
- **Cloudflare アカウント**（無料アカウント可）
- scaffold 実行後のリポジトリが手元にある（`site/` フォルダが生成済み）
- インターネット接続がある

以下 4 つのサービスはすべて **自団体自身のアカウント上に新規作成** してください。
キット提供者の Google Drive・GitHub・Cloudflare を共有・利用する仕組みは一切ありません。

---

## ステップ 1 — GitHub リポジトリの準備

### 1-1 テンプレートから自団体のリポジトリを作成

1. `https://github.com/RYUIYAMADA/regatta-results-kit` を開く
2. ページ右上の **"Use this template"** → **"Create a new repository"** をクリック
3. **Owner** を自団体の GitHub アカウントに変更
4. **Repository name** を入力（例: `sample-regatta-2027`）
5. **Private** を選択（大会終了後に公開するかは自団体の判断）
6. **"Create repository"** をクリック

### 1-2 ローカルに clone して scaffold を実行

```bash
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>

# 大会設定ファイルを作成
cp template/tournament.config.example.json tournament.config.json
# tournament.config.json を開いて大会名・日程・会場などを記入する

# 一発生成（site/ フォルダを生成する）
python3 tools/scaffold.py --config tournament.config.json

# 生成結果を確認
ls site/data/
# → master.json が生成されていれば OK
```

scaffold 実行後、`docs/SETUP_GUIDE.generated.md` が生成されます。
以降の手順はその生成版に記載された大会固有値（フォルダ ID 等）を使って進めてください。

---

## ステップ 2 — Cloudflare Pages の接続

Cloudflare Pages は **Build output directory = `site`** で設定します。これを誤ると速報サイトが表示されません。

### 2-1 Cloudflare にログインしてプロジェクトを作成

1. `https://dash.cloudflare.com` を開き、自団体の Cloudflare アカウントでログイン
2. 左メニューから **Workers & Pages** → **Pages** を開く
3. **"Create application"** をクリック
4. **"Connect to Git"** タブをクリック

### 2-2 GitHub との連携

1. **"Connect GitHub"** をクリック → GitHub 認可画面で **"Authorize Cloudflare Pages"**
2. リポジトリ一覧から自団体のリポジトリ（例: `sample-regatta-2027`）を選択
3. **"Begin setup"** をクリック

### 2-3 ビルド設定（必須）

| 項目 | 設定値 | 備考 |
|---|---|---|
| **Project name** | 任意（例: `sample-regatta-2027`） | URL の一部になる |
| **Framework preset** | `None` | — |
| **Build command** | （空欄のまま） | ビルド不要 |
| **Build output directory** | **`site`** | **← これが最重要。必ず `site` と入力** |
| **Root directory** | （空欄のまま） | — |
| **Production branch** | `main` | — |

4. **"Save and Deploy"** をクリック
5. 初回デプロイが完了するまで 2〜5 分待つ

デプロイ完了後、`https://<project-name>.pages.dev` でサイトが表示されれば OK です。

---

## ステップ 3 — Google Drive フォルダの作成

### 3-1 フォルダ構成を作る

Google Drive（自団体のアカウント）で **ルートフォルダを 1 つ**作成してください。
内部の `race_csv/`・`master/`・`processed/` は GAS の `setupAll()` が自動生成します。

```
<大会名>/                ← ルートフォルダ（このフォルダの ID を控える）
├── master/              ← setupAll() が自動生成。schedule.csv・entries.csv を置く
├── race_csv/
│   ├── 500m/            ← setupAll() が自動生成。500m 計測 CSV を置く（GAS が監視）
│   └── 1000m/           ← setupAll() が自動生成。1000m 計測 CSV を置く（GAS が監視）
└── processed/           ← setupAll() が自動生成。処理済 CSV の移動先
    ├── 500m/
    └── 1000m/
```

> **計測ポイントについて**: デフォルトは `500m,1000m` の 2 点です。
> 大会コースが 1 点計測のみ（例: `1000m` ゴールのみ）の場合は
> スクリプトプロパティ `MEASUREMENT_POINTS` を `1000m` に変更してから `setupAll()` を実行してください。

### 3-2 ルートフォルダ ID を控える

ルートフォルダ（`<大会名>/`）を開いたときのブラウザ URL の末尾がフォルダ ID です。

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStU
                                        ^^^^^^^^^^^^^^^^^^^^^^^^ ← これがフォルダ ID
```

後の手順（ステップ 6）で `DRIVE_ROOT_FOLDER_ID` に設定します。

| フォルダ | 対応するスクリプトプロパティ |
|---|---|
| `<大会名>/`（ルート） | `DRIVE_ROOT_FOLDER_ID` |

---

## ステップ 4 — スプレッドシートテンプレの準備

PDF の自動生成に使う雛形 Spreadsheet を作成します。
PDF Publisher GAS と判定員帳票 GAS が使う Spreadsheet は別々に用意してください。

### 4-1 競漕記録テンプレ（PDF Publisher 用）

1. Google スプレッドシートで新規作成
2. `template/` フォルダ内のサンプルを参考にシート構成を作る（scaffold が具体的な手順を生成版に記載）
3. Spreadsheet ID を控える（URL の `/d/` と `/edit` の間の文字列）

### 4-2 判定員帳票テンプレ（判定員帳票 GAS 用）

同様に別の Spreadsheet を作成し、ID を控える。

---

## ステップ 5 — GAS 3プロジェクトの作成とコード貼り付け

GAS は以下の 3 プロジェクトを作成します。それぞれ独立した GAS プロジェクトです。

| プロジェクト名（任意） | コードのソース |
|---|---|
| A. CSV→JSON Push | `gas/Code.gs` |
| B. PDF Publisher | `gas/pdf_publisher/Code.gs` + `gas/pdf_publisher/Setup.gs` |
| C. 判定員帳票 | `gas/judge_form_publisher/Code.gs` + `gas/judge_form_publisher/Setup.gs` |

### 5-1 GAS プロジェクトの作成手順（A の例・B・C も同様）

1. `https://script.google.com` を開く
2. **"新しいプロジェクト"** をクリック
3. プロジェクト名を入力（例: `<大会名>-csv-push`）
4. デフォルトで作られている `コード.gs` を開き、中身を全て削除
5. `gas/Code.gs` の内容をコピーして貼り付ける
6. **保存**（Ctrl+S / Cmd+S）

### 5-2 clasp を使う場合（任意・上級者向け）

clasp（GAS の CLI）を使うと、エディタで編集→ push でコードを反映できます。

```bash
npm install -g @google/clasp
clasp login
clasp create --title "<大会名>-csv-push" --rootDir gas/
clasp push
```

---

## ステップ 6 — Script Properties の投入

GAS スクリプトプロパティにキーと値を設定します。これが GAS の唯一の設定箇所です。

### 6-1 setupFromConfig を使う方法（推奨）

scaffold が生成した `docs/SETUP_GUIDE.generated.md` に、`tournament.config.json` の `gas` セクションの JSON が記載されています。
その JSON を GAS エディタの `setupFromConfig()` に貼り付けて実行すると、必要なプロパティが一括で投入されます。

1. GAS エディタで `setupFromConfig` 関数を選択
2. **「実行」** ボタンをクリック
3. 権限確認ダイアログが出たら **"許可"** を選択
4. ログに「Script Properties を設定しました」と出れば完了

### 6-2 手動で投入する方法

GAS エディタ左側の **歯車アイコン（プロジェクトの設定）** → **"スクリプト プロパティ"** → **"スクリプト プロパティを追加"** で1つずつ入力します。

#### A. CSV→JSON Push GAS（`gas/Code.gs`）に必要なプロパティ

`saveSetup()` を実行すると以下の 3 つが自動保存されます。残り 2 つは手動で追加してください。

| プロパティ名 | 設定方法 | 値の説明 | 例 |
|---|---|---|---|
| `DRIVE_ROOT_FOLDER_ID` | `saveSetup()` で自動保存 | Drive ルートフォルダ（`<大会名>/`）の ID | `1AbCdEfGh...` |
| `GITHUB_TOKEN` | `saveSetup()` で自動保存 | GitHub PAT（fine-grained。後述のステップ 7 で取得） | `github_pat_XXXX...` |
| `MEASUREMENT_POINTS` | `saveSetup()` で自動保存（デフォルト `500m,1000m`） | 計測ポイント（カンマ区切り） | `500m,1000m` |
| `GITHUB_OWNER` | 手動追加（必須） | GitHub オーナー名（ユーザー名または Organization 名） | `your-org` |
| `GITHUB_REPO` | 手動追加（必須） | リポジトリ名のみ（オーナー名を**含まない**） | `sample-regatta-2027` |

> **`saveSetup()` の実行方法**: コード先頭の `SETUP_DRIVE_FOLDER_ID` と `SETUP_GITHUB_TOKEN` に値を貼り付けてから、関数選択で `saveSetup` を選んで実行してください。実行後は両変数を空文字に戻してコードを保存してください。

#### B. PDF Publisher GAS（`gas/pdf_publisher/`）に必要なプロパティ

`setupFromConfig()` で一括投入できます（推奨）。`GITHUB_TOKEN` のみ手動設定が必要です。

| プロパティ名 | 値の説明 |
|---|---|
| `GITHUB_TOKEN` | 手動設定必須。A の GAS と同じ PAT |
| `GITHUB_REPO` | `setupFromConfig()` で設定。A の GAS と同じリポジトリ名 |
| `GITHUB_BRANCH` | `saveSetup()` デフォルト `main` |
| `TEMPLATE_SHEET_ID` | 競漕記録テンプレの Spreadsheet ID |
| `PDF_OUTPUT_FOLDER_ID` | PDF 出力先フォルダの ID |
| `PDF_ARCHIVE_FOLDER_ID` | 削除済 PDF のアーカイブ先フォルダの ID |
| `PRE_RACE_BOOKLET_FOLDER_ID` | レース前準備資料 PDF の出力先フォルダの ID |
| `BOOKLET_TEMPLATE_GID` | 結果ブックレット用テンプレートシートの GID |

#### C. 判定員帳票 GAS（`gas/judge_form_publisher/`）に必要なプロパティ

`setupFromConfig()` で一括投入できます（推奨）。`GITHUB_TOKEN` のみ手動設定が必要です。

| プロパティ名 | 値の説明 |
|---|---|
| `GITHUB_TOKEN` | 手動設定必須。A の GAS と同じ PAT |
| `GITHUB_REPO` | `setupFromConfig()` で設定。A の GAS と同じリポジトリ名 |
| `GITHUB_BRANCH` | `saveSetup()` デフォルト `main` |
| `TEMPLATE_SHEET_ID` | 判定員帳票テンプレの Spreadsheet ID |
| `OUTPUT_FOLDER_ID` | 判定員帳票 PDF の出力先フォルダの ID |

---

## ステップ 7 — GitHub PAT の作成

GAS が GitHub にデータを書き込むための Personal Access Token（PAT）を作成します。

### 7-1 PAT の作成手順

1. GitHub にログイン → 右上アバター → **Settings**
2. 左メニュー最下部 **"Developer settings"** → **"Personal access tokens"** → **"Fine-grained tokens"**
3. **"Generate new token"** をクリック
4. 以下のとおり設定する

| 項目 | 設定値 |
|---|---|
| **Token name** | 任意（例: `regatta-2027-gas`） |
| **Expiration** | **90 days**（期限を設ける。無期限は推奨しない） |
| **Resource owner** | 速報サイトのリポジトリが属する Organization または個人アカウント |
| **Repository access** | **Only select repositories** → 速報サイトのリポジトリのみを選択 |
| **Repository permissions → Contents** | **Read and Write** |
| それ以外の権限 | **No access** のまま変更しない |

5. **"Generate token"** をクリック
6. 表示されたトークン文字列を**今すぐコピー**（再表示できないため必ずこの場でコピー）

コピーしたトークンをステップ 6 の `GITHUB_TOKEN` に入力します。

---

## ステップ 8 — トリガーの設定

CSV→JSON Push GAS の `onTrigger` 関数を 2 分間隔で自動実行するよう設定します。

### 8-1 setupTrigger を実行する（推奨）

1. CSV→JSON Push GAS のエディタを開く
2. 関数選択リストから **`setupTrigger`** を選択
3. **「実行」** をクリック
4. ログに「トリガーを設定しました: onTrigger (2分間隔)」と出れば完了

### 8-2 手動でトリガーを設定する場合

GAS エディタ左側の **時計アイコン（トリガー）** → **「+ トリガーを追加」** をクリックし、以下のとおり設定します。

| 項目 | 設定値 |
|---|---|
| 実行する関数を選択 | `onTrigger` |
| イベントのソース | **時間ベースのトリガー** |
| 時間ベースのトリガーのタイプ | **分ベースのタイマー** |
| 分の間隔を選択 | **2分おき** |

**「保存」** をクリック → 権限確認が出たら **「許可」** を選択。

---

## ステップ 8.5 — 管理者ポータルの公開

大会の登録・年度管理・Drive 接続設定・デザイン変更はすべてブラウザ上の管理者ポータルで完結できます。
ポータルは CSV→JSON Push GAS（A. gas/Code.gs のプロジェクト）内に同居している GAS Web アプリです。

### 8.5-1 Web アプリとしてデプロイする

1. CSV→JSON Push GAS のエディタ（`https://script.google.com`）を開く
2. 右上の **「デプロイ」** → **「新しいデプロイ」** をクリック
3. 種類の選択（歯車アイコン）→ **「ウェブアプリ」** を選択
4. 以下のとおり設定する

| 項目 | 設定値 |
|---|---|
| **次のユーザーとして実行** | **自分**（自身の Google アカウント） |
| **アクセスできるユーザー** | **自分のみ**（他の運営者も使う場合は「特定のユーザー」で追加） |

5. **「デプロイ」** をクリック → 権限確認が出たら **「許可」** を選択
6. 表示された **ウェブアプリ URL** をコピーしてブックマーク

> **セキュリティ**: 「自分のみ」設定では、Google アカウントでログインしていないとアクセスできません。URL を知っていても未ログイン状態では開けません。

### 8.5-2 ポータルで設定を完了する

ポータルには 4 つのタブがあります。

| タブ | 操作内容 |
|---|---|
| **大会管理** | 大会の追加・編集・削除・ステータス切替（開催予定→速報中→結果確定）。保存すると hub/association.json が GitHub に自動コミットされる |
| **接続設定** | Drive フォルダ ID / 計測ポイント / GitHub トークンなどの Script Properties を UI で設定。Drive 接続テストも可能 |
| **デザイン** | ブランド色（プライマリ・アクセント）とフォントをカラーピッカーで選択。ライブプレビューで確認してから「公開サイトに反映」をクリックすると site/data/theme.json が GitHub にコミットされ、速報サイトに反映される |
| **状態** | 直近 heartbeat・結果 JSON 数・トリガー稼働状況・エラーログを確認 |

初期構築が完了したあとは、**「Google Drive（CSV 投入）」と「ポータル（登録・設定・色）」の 2 つだけ**触れば日常運用が完結します。

---

## ステップ 9 — 疎通テスト

設定が正しく動いているかを確認します。

### 9-1 master.json の Push テスト

1. CSV→JSON Push GAS エディタで **`runImportMaster`** を実行
2. ログに「master.json を Push しました」と出ることを確認
3. GitHub リポジトリの `site/data/master.json` が更新されていることをブラウザで確認
4. 数分後、速報サイト（Cloudflare Pages の URL）でスケジュールが表示されることを確認

### 9-2 結果 CSV の Push テスト

1. `template/` フォルダ内のサンプル CSV（`R001_500m.csv` 等）を Google Drive の `race_csv/500m/` にアップロード
2. 2 分以内に GAS が自動実行される
3. GAS エディタの **実行ログ** を開き「processPendingCSVs: R001 処理完了」等のログを確認
4. GitHub の `site/data/results/race_001.json` が作成されていることを確認
5. 速報サイトで R001 の結果が表示されることを確認

反映所要は **最短 2〜3 分・通常 3〜5 分**（GAS の実行タイミング + Cloudflare のデプロイ約 1 分）。

---

## ステップ 10 — 大会終了後の停止手順

大会終了後は GAS トリガーを停止して不要な実行を防いでください。

### 10-1 トリガーを停止する

1. CSV→JSON Push GAS エディタを開く
2. 関数選択リストから **`deleteTriggers`** を選択して実行
3. ログに「すべてのトリガーを削除しました」と出れば完了

### 10-2 Cloudflare Pages の自動デプロイを停止する（任意）

サイトを読み取り専用アーカイブとして残す場合は CI を停止しておくと安心です。

1. Cloudflare Dashboard → Pages → 該当プロジェクト → Settings
2. **Builds & deployments** → **"Pause deployments"** をクリック

速報サイト自体は停止しなくてよいです。結果がそのまま残り、いつでも参照できます。

---

## トラブルシューティング

| 症状 | 確認箇所 | 対処 |
|---|---|---|
| サイトが表示されない | Cloudflare Pages の Build output directory | **`site`** に設定されているか確認。`/` やルートのままだと失敗する |
| スケジュールが出ない | GitHub の `site/data/master.json` | `runImportMaster` を手動実行して Push し直す |
| 結果が反映されない（5分以上） | GAS トリガー / CSV のフォルダ / ファイル名 | トリガーが有効か確認 → `onTrigger()` を手動実行 → ファイル名の形式を確認（`R001_500m.csv` 形式が必須） |
| GAS が GitHub に Push できない | スクリプトプロパティ `GITHUB_TOKEN` | PAT の有効期限と Contents RW 権限を確認 |
| 「Script Properties 未設定」エラー | スクリプトプロパティ | 必須プロパティが全て設定されているか確認 |

---

## 補足 — scaffold が生成する SETUP_GUIDE.generated.md との関係

```
docs/SETUP_GUIDE.md              ← このファイル（一般手順書・大会非依存）
docs/SETUP_GUIDE.generated.md   ← scaffold 実行後に自動生成（大会固有値入り）
```

`SETUP_GUIDE.generated.md` には：
- Drive フォルダ ID の記入欄に実際の値が入っている
- `setupFromConfig` に渡す JSON がすでに書き込まれている
- GitHub リポジトリ名・PAT のガイドが大会名を含んだ状態で出力されている

通常の大会セットアップでは `SETUP_GUIDE.generated.md` のみ使えば完結します。
この `SETUP_GUIDE.md` は、生成版を紛失した場合や、新しい大会でやり直す際の参照用です。
