# /regatta-setup — 新大会セットアップウィザード

このコマンドを使うと、このテンプレートから新しい大会の速報サイトを作成できます。
コードの知識は不要です。質問に答えるだけでセットアップが完了します。

---

## STEP 1: 大会情報を確認する

以下の質問に答えてください。わからない項目は「後で」と答えてもOKです（後から `tournament.config.json` を直接編集できます）。

```
Q1. 大会ID（英数字・ハイフンのみ）
    例: 2027-tohoku-masters
    → GitHub リポジトリ名や URL に使われます

Q2. 大会の正式名称
    例: 第18回全日本マスターズレガッタ

Q3. 会場名（コース名を含む）
    例: 石川県津幡漕艇競技場

Q4. 開催日（YYYY-MM-DD 形式・複数日はカンマ区切り）
    例: 2027-05-22,2027-05-23

Q5. メインカラー（HEX、#RRGGBB 形式）
    例: #2D4F2C（深緑）

Q6. アクセントカラー（HEX、#RRGGBB 形式）
    例: #C9A227（金色）

Q7. GitHub リポジトリ名（owner/repo 形式）
    例: myname/tohoku-masters-2027
    → まだ作っていない場合は「後で」

Q8. 本番サイトの URL（Cloudflare Pages の URL）
    例: https://tohoku-masters-2027.pages.dev
    → まだわからない場合は「後で」
```

回答を受け取ったら STEP 2 に進んでください。

---

## STEP 2: tournament.config.json を生成する

以下のコマンドを実行して `tournament.config.json` を作成します。

```bash
python3 tools/init_tournament.py
```

対話式のウィザードが起動します。STEP 1 の回答を入力してください。
Enter キーのみで次の項目に進みます。GAS（Google Apps Script）関連の項目はすべて空欄のままでOKです。

**非対話モード（デフォルト値で生成してから後で編集する場合）:**
```bash
python3 tools/init_tournament.py --non-interactive
```

生成後、`tournament.config.json` をテキストエディタで開いて値を確認・修正してください。

---

## STEP 3: scaffold.py を実行する

```bash
python3 tools/scaffold.py --config tournament.config.json
```

実行すると以下が自動的に行われます:

- `site/admin/` 配下に管理者専用のランダムURLが生成されます
- `staff/` 配下のスタッフ向けドキュメントに大会名・会場・日程が書き込まれます
- `site/data/master.json`（レース結果の入れ物）が作られます
- `docs/SETUP_GUIDE.generated.md`（次の設定手順書）が出力されます

✅ 最後に「scaffold completed.」と表示されれば成功です。

---

## STEP 4: SETUP_GUIDE を確認する

```bash
open -e docs/SETUP_GUIDE.generated.md
```

このファイルに以下の手順が書かれています:

1. **GitHub にプッシュする**（コマンドはガイドに記載）
2. **Cloudflare Pages に接続する**（GitHub リポジトリを指定）
3. **GAS（Google Apps Script）の設定をする**
   - `script.google.com` でスクリプトプロパティを設定
   - トリガーを有効化する
4. **GitHub Repository Variables を設定する**（大会開始・終了日）

---

## STEP 5: 動作確認する

ローカルで速報サイトが正しく表示されるか確認します。

```bash
# site/ フォルダでローカルサーバーを起動
cd site && python3 -m http.server 8921
```

ブラウザで `http://localhost:8921/` を開いてください。

**確認チェックリスト:**
- [ ] 大会名・会場・日程が正しく表示されている
- [ ] エラーメッセージが出ていない（レース0件の場合は空一覧でOK）
- [ ] デザインカラーが正しく適用されている

確認が終わったらサーバーを停止（Ctrl + C）してください。

---

## うまくいかないときは

| 症状 | 原因と対処 |
|---|---|
| `Config validation failed` | tournament.config.json の必須項目が空 → ファイルを開いて修正 |
| `Placeholder check FAILED` | テンプレートの置換漏れ → scaffold を最初からやり直す（re-run）|
| `No module named 'common'` | `tools/` フォルダにいない可能性 → リポジトリルートで実行する |
| ブラウザでエラー表示 | master.json が正しく生成されているか確認: `cat site/data/master.json` |

問題が解決しない場合は、このリポジトリの `docs/SETUP_GUIDE.md` を参照するか、担当者に `docs/SETUP_GUIDE.generated.md` を共有してください。
