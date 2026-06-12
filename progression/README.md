# 進行モデルライブラリ

## 目的

各大会の管理者が「予選→準決→決勝」の組分けルール（進行モデル）を選択できるようにするライブラリ。
全日本選手権モデルを標準搭載し、龍偉が追加登録することで選択肢を拡充する。

**進行モデルの概念**: モデルは「クルー数ごとのパターンを統合した1バンドル」。大会は1モデルを選んで採用するだけでよく、種目ごとのクルー数に応じてどのパターンを使うかはエンジンの `selectPattern` が内部で自動判断する。管理者が「エントリー数 N クルーのときはパターン X を使う」と明示的に選ぶ必要はない。

v1 の範囲: モデルの登録・選択・保存・表示。**進行計算の自動実行は次フェーズ**（engine/README の作業リスト参照）。

---

## ディレクトリ構成

```
progression/
├── registry.json          モデル台帳（選択肢の正本）
├── templates/             モデル定義 JSON（ProgressionTemplate 形式）
│   ├── alljapan-a.json    全日本モデル A（順位上がり変更版）
│   ├── alljapan-b.json    全日本モデル B（標準版）
│   └── model-NNN.json     汎用モデル（/progression-add で自動採番）
├── engine/                進行計算エンジン（TypeScript・Vitest 27件 PASS）
│   ├── src/               エンジン本体（8ファイル）
│   ├── tests/             テストスイート
│   ├── docs/SPEC_engine.md  エンジン仕様書
│   └── package.json
├── tests/
│   └── test_cases.json    エンジン検証用テストケース（22件）
└── README.md              このファイル
```

---

## registry.json スキーマ

```jsonc
{
  "registry_version": 1,
  "models": [
    {
      "id": "alljapan-a",             // templates/<id>.json と一致
      "label": "全日本モデル A",        // ポータルの選択肢表示名
      "lanes": 6,
      "supported_entries": [1, 42],   // 対応クルー数（能力メタ情報。選択基準ではない）
                                      // templates/<id>.json の全 patterns の
                                      // entries_min 最小値〜entries_max 最大値を自動集約
      "description": "...",
      "explanation": "【ラウンド構成】\n...",   // ポータル解説文。\n で改行。advance_rules_text から整形
      "source": "JARA 全日本選手権 2026 要項",
      "added": "2026-06-12"
    }
  ]
}
```

**`supported_entries` について**: これはモデルが「内部でカバーできるクルー数の範囲」を示す能力メタ情報。大会側がモデルを選ぶ選択基準ではない。登録時にユーザーがこの値を手入力する必要はなく、`/progression-add` が templates/<id>.json の patterns から自動計算して設定する。

**`explanation` について**: 管理者ポータルの「このモデルの解説」に表示する説明文。`advance_rules_text` の要点を `\n` 区切りで整形して記述する。登録時に作成を強く推奨。

無名モデルの label は `/progression-add` が自動で `"汎用モデル NNN"` を付与する。

---

## 大会への適用方法

### 1. master.json への保存

管理者ポータルの「接続設定」タブで進行モデルを選択・保存すると、大会サイトの
`site/data/master.json` に以下が書き込まれる。

```json
{
  "progression": {
    "template_id": "alljapan-a"
  }
}
```

`progression` キーがない場合は進行計算なし（v1 ではモデル未選択と同義）。

### 2. tournament.config.json での指定

`init_tournament.py` の任意質問で `tournament.progression_template_id` を設定できる。
`scaffold.py` がこれを `master.json` の雛形に反映する。

### 3. ポータル選択肢の取得

管理者ポータルは GitHub API で本ライブラリの `progression/registry.json` を読み、
`models[]` の各エントリを選択肢として表示する（「使用しない」を先頭に追加）。

---

## 登録フロー（/progression-add）

新しいモデルを追加する場合は `.claude/commands/progression-add.md` に定義された
`/progression-add` コマンドを使う。

1. 龍偉が JSON 貼り付け・ファイルパス・口頭ルールのいずれかで定義を提供
2. Claude が `python3 tools/validate_progression.py <file>` で検証
3. 採番ルールに従い templates/ へ保存・registry.json へ追記
4. git commit & push

**検証 FAIL のまま登録しない**（validator が PASS してからコミット）。

詳細手順は `/progression-add` コマンドを参照。

---

## 進行計算の自動実行（次フェーズ）

エンジン本体（`engine/`）は TypeScript 実装済みで 27件テスト PASS。
ただし GAS アダプタ統合は次フェーズ作業。`engine/docs/SPEC_engine.md` の
「実装ロードマップ」セクションに 8 項目の作業リストがある。
