# regatta-results-kit — セットアップ手順書（7ステップ）

> **協会担当者の方へ**: オンボーディングサイト（https://ryuiyamada.github.io/regatta-results-kit/onboarding/）に
> スクリーンショット付きの手順が掲載されています。まずそちらをご確認ください。
>
> このファイルはオンボーディングサイトと同内容のテキスト版です。

---

## 対象読者

初めてこのキットを使う協会・大会の担当者。
ターミナル・Python・git コマンドの操作は不要です。すべてブラウザだけで完結します。

---

## 前提

- **GitHub アカウント**（無料アカウント可）
- **Google アカウント**（無料アカウント可）
- **Cloudflare アカウント**（無料アカウント可）
- インターネット接続がある

以下 3 つのサービスはすべて **自団体自身のアカウント上に新規作成** します。
キット提供者の Google Drive・GitHub・Cloudflare を共有・利用する仕組みは一切ありません。

---

## ステップ 1 — テンプレートリポジトリのコピー

1. `https://github.com/RYUIYAMADA/regatta-results-kit` を開く
2. 右上の **"Use this template"** → **"Create a new repository"** をクリック
3. **Owner** を自団体の GitHub アカウントに変更
4. **Repository name** を入力（例: `association-regatta-2027`）
5. **Private** を選択（推奨）
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

## ステップ 2 — Cloudflare Pages の接続

**Build output directory = `site`** に設定します。これを誤ると速報サイトが表示されません。

1. `https://dash.cloudflare.com` を開き、Cloudflare アカウントでログイン（なければ無料で新規作成）
2. 左メニュー → **Workers & Pages** → **Pages** → **"Create application"** → **"Connect to Git"**
3. **"Connect GitHub"** で GitHub 認可 → ステップ 1 のリポジトリを選択 → **"Begin setup"**
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

## ステップ 3 — GitHub Actions で大会初期構築（Run workflow）

ターミナル・Python・git 操作は不要。GitHub 画面だけで操作します。

1. ステップ 1 で作成したリポジトリを GitHub で開く
2. 上部タブ **"Actions"** をクリック
3. 左サイドバーの **"大会初期構築"** をクリック
4. 右側の **"Run workflow"** ボタンをクリック
5. 以下の入力フォームを埋める:

| 入力項目 | 例 | 説明 |
|---|---|---|
| 大会名 | `第01回○○マスターズレガッタ` | 速報サイトのヘッダーに表示 |
| 会場 | `○○漕艇競技場` | 同上 |
| 開始日 | `2027/06/14` | スラッシュ区切り推奨（ハイフン 2027-06-14 も可） |
| 終了日 | `2027/06/15` | スラッシュ区切り推奨（ハイフン 2027-06-15 も可） |
| メインカラー | `#1a3a5c` | 速報サイトの主色（#RRGGBB 形式） |

6. **"Run workflow"** をクリック

**所要時間**: 2〜5分（workflow 実行完了まで）

**セルフチェック**

- Actions タブでジョブが緑チェック（✅）になる → OK
- リポジトリに `site/data/master.json` が作成されている → OK
- Cloudflare Pages が自動デプロイされ、速報サイトに大会名が表示される → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| Actions タブに "大会初期構築" が無い | テンプレートのコピーが古い | リポジトリ作成をやり直す（ステップ 1 から） |
| ジョブが赤バツ（❌） | 入力値の形式エラー | ジョブログを確認 → 日付は `2027/06/14` 形式か（ハイフン `2027-06-14` も可）、カラーは `#` から始まる 7 文字かを確認してやり直す |
| `site/data/master.json` が作成されない | workflow の permissions エラー | リポジトリ Settings → Actions → General → Workflow permissions を "Read and write permissions" に変更して再実行 |

---

## ステップ 4 — Google Drive フォルダの作成

1. Google Drive（自団体アカウント）を開く
2. **ルートフォルダを 1 つ作成**（名前は大会名など任意。例: `○○レガッタ2027`）
3. 作成したフォルダを開いたときのブラウザ URL 末尾の文字列をコピー（これがフォルダ ID）

```
例: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStU
                                            ^^^^^^^^^^^^^^^^^^^^^^^^ ← これをコピー
```

内部のサブフォルダ（`race_csv/`・`master/`・`processed/` 等）は GAS の `setupAll()` 実行時に自動作成されます。手動で作る必要はありません。

**所要時間**: 5分

**セルフチェック**

- URL 末尾の文字列（英数字 20〜30 文字）をコピーできた → OK

---

## ステップ 5 — GAS の「コピーを作成」とプロパティ入力

コードの貼り付けは不要。オンボーディングサイトに記載のリンクからテンプレート GAS プロジェクトを「コピーを作成」するだけです。

### GAS-A（CSV→JSON Push + 管理者ポータル）— 必須

1. オンボーディングサイトに記載のリンク（GAS-A テンプレート）を開く
2. メニュー **"ファイル"** → **"コピーを作成"** → 名前を入力（例: `○○レガッタ2027-csv-push`）→ **"コピーを作成"**
3. コピーされた GAS プロジェクトが開く
4. 左側の歯車アイコン（プロジェクトの設定）→ **"スクリプト プロパティ"** → **"スクリプト プロパティを追加"** で以下を入力:

| プロパティ名 | 値 |
|---|---|
| `DRIVE_ROOT_FOLDER_ID` | ステップ 4 でコピーしたフォルダ ID |
| `GITHUB_OWNER` | 自分の GitHub アカウント名（例: `your-org`） |
| `GITHUB_REPO` | ステップ 1 で作成したリポジトリ名（例: `association-regatta-2027`） |
| `MEASUREMENT_POINTS` | `500m,1000m`（変更不要） |

> `GITHUB_TOKEN` はステップ 6 の後に設定します。

### GAS-B（PDF Publisher）— 任意

1. オンボーディングサイトに記載のリンク（GAS-B テンプレート）を開く
2. **"コピーを作成"** → 名前を入力
3. スクリプトプロパティに以下を入力:

| プロパティ名 | 値 |
|---|---|
| `GITHUB_REPO` | ステップ 1 のリポジトリ名 |
| `TEMPLATE_SHEET_ID` | PDF テンプレートの Spreadsheet ID |
| `PDF_OUTPUT_FOLDER_ID` | PDF 出力先 Drive フォルダ ID |
| その他 | オンボーディングサイトの表を参照 |

### GAS-C（判定員帳票）— 任意

GAS-B と同様の手順。

**所要時間**: GAS-A のみなら 10分、B・C も含めると 20〜30分

**セルフチェック**

- GAS エディタのスクリプトプロパティ一覧に設定した全キーが表示される → OK

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| "コピーを作成" が見当たらない | Google アカウントにログインしていない | Google アカウントでログインしてから再試行 |
| プロパティが保存されない | プロパティ名を誤入力 | 入力欄のキー名をこの表と一文字ずつ照合 |

---

## ステップ 6 — GitHub PAT の作成と設定

GAS が GitHub にデータを書き込むための Personal Access Token（PAT）を作成します。

1. GitHub にログイン → 右上アバター → **Settings** → 左メニュー最下部 **"Developer settings"** → **"Personal access tokens"** → **"Fine-grained tokens"** → **"Generate new token"**
2. 以下のとおり設定:

| 項目 | 設定値 |
|---|---|
| Token name | 任意（例: `regatta-2027-gas`） |
| Expiration | **90 days** |
| Resource owner | ステップ 1 のリポジトリが属するアカウント |
| Repository access | **Only select repositories** → ステップ 1 のリポジトリのみ選択 |
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

## ステップ 7 — 管理者ポータルの公開・接続テスト・初期セットアップ

1. GAS-A エディタを開く → 右上 **"デプロイ"** → **"新しいデプロイ"**
2. 種類（歯車アイコン）→ **"ウェブアプリ"** を選択
3. 設定:

| 項目 | 設定値 |
|---|---|
| 次のユーザーとして実行 | **自分** ← 必須。これ以外ではトリガー設定が機能しません |
| アクセスできるユーザー | **自分のみ** |

4. **"デプロイ"** → 権限確認ダイアログが表示されたら **"許可"**
5. 表示された **ウェブアプリ URL** をブックマーク
6. URL を開く → 管理者ポータルが表示される
7. **"接続設定"** タブ → **"Drive 接続テスト"** ボタンをクリック → フォルダ名が表示される → OK
8. **"接続設定"** タブ → **"GitHub 接続テスト"** ボタンをクリック → 緑バッジ表示 → OK
9. **"状態"** タブ → **「初期セットアップ実行」ボタン** をクリック
   - Google の権限承認ダイアログが表示された場合は「許可」を選択
   - 「✅ Drive サブフォルダ作成済み」「✅ 自動更新 稼働開始」と表示される → OK
10. **"状態"** タブの「自動更新: 🟢 稼働中」表示を確認 → OK

**所要時間**: 10〜15分

**導入完了基準（全て緑で完了）**

- 管理者ポータルが開ける → OK
- Drive 接続テストがフォルダ名表示 → OK
- GitHub 接続テストが緑バッジ → OK
- 「状態」タブ「自動更新: 🟢 稼働中」表示 → OK
- `https://<project>.pages.dev` で速報サイトに大会名・会場・日程が表示される → OK

> **導入完了 = 接続テスト（Drive・GitHub）OK ＋ 自動更新が稼働中 ＝ 状態が全部緑**

**NGパターンと自己復旧**

| NG | 原因 | 復旧 |
|---|---|---|
| GitHub 接続テストが赤バッジ | `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` のどれかが誤り | "接続設定" タブで値を確認・修正 → 再テスト |
| Drive テストが "DRIVE_ROOT_FOLDER_ID が未設定" | ステップ 5 のプロパティ未入力 | "接続設定" タブ → フォルダ URL または ID を入力して保存 → 再テスト |
| 「初期セットアップ実行」でエラー | スクリプトプロパティ未設定または Drive フォルダ ID 誤り | エラーメッセージを確認 → 「接続設定」タブで設定を修正 → 再実行 |
| 「初期セットアップ実行」後も「自動更新: 🔴 停止中」 | 権限承認が完了していない | ポータルを一度閉じて再度開き → 「状態」タブ → 「開始する」ボタンをクリック |
| ポータルが "You need permission" | デプロイ設定で "自分のみ" にしたが別アカウントでアクセスした | 正しい Google アカウントでアクセスする |

---

## 導入完了後の日常運用

導入完了後は **「Google Drive（CSV 投入）」と「管理者ポータル（登録・設定・デザイン）」の 2 つだけ** を使えば日常運用が完結します。

| 作業 | 操作場所 |
|---|---|
| 結果 CSV を速報サイトに反映 | Google Drive の `race_csv/` 配下に CSV を置くだけ（GAS が自動処理） |
| 大会の登録・ステータス切替 | 管理者ポータル「大会管理」タブ |
| ブランド色・フォントの変更 | 管理者ポータル「デザイン」タブ |
| Drive フォルダ / PAT の再設定 | 管理者ポータル「接続設定」タブ |

---

## トラブルシューティング

| 症状 | 確認箇所 | 対処 |
|---|---|---|
| 速報サイトが表示されない | Cloudflare Pages の Build output directory | **`site`** に設定されているか確認。`/` やルートのままだと失敗する |
| スケジュールが出ない | GitHub の `site/data/master.json` | ステップ 3（Run workflow）をやり直す |
| 結果が反映されない（5分以上） | GAS トリガー / CSV のフォルダ / ファイル名 | ポータル「状態」タブで「自動更新: 🔴 停止中」なら「開始する」ボタンをクリック。または「初期セットアップ実行」を再押し → ファイル名の形式を確認（`R001_500m.csv` 形式が必須） |
| GAS が GitHub に Push できない | スクリプトプロパティ `GITHUB_TOKEN` | PAT の有効期限と Contents RW 権限を確認 |
| "Script Properties 未設定" エラー | スクリプトプロパティ | 必須プロパティが全て設定されているか確認 |
