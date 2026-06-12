# SPEC: 進行モデルライブラリ v1（2026-06-12 龍偉要件）

要件: ①各大会の管理者が進行モデル（予選→準決→決勝の組分けルール）を選べる。全日本モデルを選択肢に含む ②龍偉がモデルケースを今後も追加登録して拡充できる ③登録は Claude Code から行う（大会運営者から預かった定義も龍偉がここから登録）④全日本以外のモデルは無名でよく、公開ライブラリとして蓄積される。

## 1. ディレクトリ構成（kit 内・公開）

```
progression/
├ registry.json          ← モデル台帳（このファイルが選択肢の正本）
├ templates/             ← モデル定義 JSON（progression-engine の ProgressionTemplate 形式）
│   ├ alljapan-a.json    ← 全日本モデル A（名称付き）
│   ├ alljapan-b.json    ← 全日本モデル B（名称付き）
│   └ model-001.json …   ← 無名モデル（自動採番）
├ engine/                ← 進行計算エンジン本体（TypeScript・masters の progression-engine を移植）
│   ├ src/ tests/ package.json README.md
└ README.md              ← ライブラリの使い方・登録フロー
```

## 2. registry.json スキーマ

```jsonc
{
  "registry_version": 1,
  "models": [
    { "id": "alljapan-a",            // templates/<id>.json と一致
      "label": "全日本モデル A",       // ポータルの選択肢表示名（無名モデルは "汎用モデル 001" を自動付与）
      "lanes": 6,
      "entries_range": [7, 18],       // 対応エントリー数（テンプレの min/max を集約）
      "description": "予選→準決→決勝。タイム拾い上げあり",
      "source": "JARA 全日本選手権 2026 要項",   // 任意。無名モデルは "運営者提供" 等
      "added": "2026-06-12" }
  ]
}
```

## 3. 大会への適用（選択）

- 保存場所: 大会サイトの `site/data/master.json` に `"progression": { "template_id": "<id>" }`（未選択は省略 = 進行計算なし）
- 選択 UI: **管理者ポータル「接続設定」タブに「進行モデル」セレクト**を追加。選択肢 = 自リポジトリの `progression/registry.json` を GitHub API で読んで生成（「使用しない」含む）。保存 = master.json の progression フィールドのみを GET→PUT（他フィールドは触らない）
- config: `tournament.progression_template_id`（任意・空可）。scaffold は master.json 雛形に反映。init_tournament ウィザードに任意質問を追加
- **v1 の範囲**: ライブラリ・選択・保存・表示まで。**進行計算の自動実行（GAS アダプタ）は次フェーズ**（engine/README の作業リスト 8 項目が前提）。registry/engine はその将来実行の正本となる

## 4. 登録フロー（龍偉 / Claude Code）

- `.claude/commands/progression-add.md` を新設。`/progression-add` で起動し Claude が以下を実行:
  1. 龍偉から定義を受領（JSON 貼り付け / ファイルパス / 口頭ルールから Claude が ProgressionTemplate を起こす、の3方式）
  2. `python3 tools/validate_progression.py <file>` で検証（JSON 妥当性・必須キー・entries_min/max の重複なし・lane_assignment の識別子が `N.M.R` / `N.RT` 文法に合致・レーン数整合）
  3. 命名: 全日本など特別な場合のみ label 指定。**無名は `model-NNN`（registry の最大番号+1）を自動採番し label「汎用モデル NNN」**
  4. templates/ へ保存 + registry.json へ追記 + コミット & push（kit リポジトリ）
- 大会運営者から定義を預かった場合も同フローで龍偉が登録（source に提供元をメモ）

## 5. エンジン同梱

- masters の `progression-engine/`（src 9ファイル + Vitest 22ケース + SPEC）を `progression/engine/` に移植（フィクションデータのみ・履歴なしコピー）
- masters の `docs/progression/templates/` の全日本 A/B テンプレを §2 形式で templates/ に登録（初期収載モデル）
- 移植時に `npm install && npm test` を実行し 22 ケース PASS を確認（kit 同梱物として動作保証）

## 6. 受入条件

- ポータルで進行モデルを選択→保存すると master.json に progression.template_id が入る（モック検証 + コード照合）
- `validate_progression.py` が正常テンプレを PASS・壊れたテンプレ（範囲重複/識別子不正）を FAIL にする
- engine テスト 22/22 PASS / registry.json と templates/ の id が1対1 / 既存 make test 16/16 維持
- README・ARCHITECTURE・LP に進行モデル機能を反映（LP は「できること」1項目）
