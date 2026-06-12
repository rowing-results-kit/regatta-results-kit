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
      "supported_entries": [1, 42],  // 対応クルー数（能力メタ情報。選択基準ではない）
                                     // テンプレート全 patterns の entries_min 最小値〜entries_max 最大値を集約
      "description": "予選→準決→決勝。タイム拾い上げあり",
      "explanation": "【ラウンド構成】\nクルー数に応じて自動的にパターンが選ばれます...",
                                     // 任意。ポータルの「このモデルの解説」に表示。\n で改行。
                                     // advance_rules_text の要点を整形したもの。
                                     // 無名モデルは "テンプレート定義参照" でも可。
      "source": "JARA 全日本選手権 2026 要項",   // 任意。無名モデルは "運営者提供" 等
      "added": "2026-06-12" }
  ]
}
```

**キー説明**:
- `supported_entries`: そのモデルが内部で対応可能なクルー数の最小〜最大。大会側が「このクルー数なら使えるか」を判断するためのメタ情報であり、**大会がモデルを選ぶ基準ではない**（選択は管理者ポータルで任意に行う）。
- `explanation`: ポータルの「このモデルの解説」に表示するモデル説明文。`\n` で改行可。`advance_rules_text` の要点を整形したもの。任意キーだが登録時に作成を強く推奨（無名モデルは `"テンプレート定義参照"` でも可）。
- モデルが実際にどのクルー数範囲をカバーするかは templates/<id>.json の patterns を確認。validate_progression.py がギャップを警告する。

## 3. 大会への適用（選択）

**概念（必読）**: 進行モデルは「クルー数ごとのパターンを統合した1バンドル」。大会は1モデルを選んで採用するだけでよく、種目ごとのクルー数に応じてどのパターンを使うかはエンジンの `selectPattern` が内部で自動判断する。管理者が「エントリー数 N クルーのときはパターン X を使う」と明示的に選ぶ必要はない。

- 保存場所: 大会サイトの `site/data/master.json` に `"progression": { "template_id": "<id>" }`（未選択は省略 = 進行計算なし）
- 選択 UI: **管理者ポータル「接続設定」タブに「進行モデル」セレクト**を追加。選択肢 = 自リポジトリの `progression/registry.json` を GitHub API で読んで生成（「使用しない」含む）。保存 = master.json の progression フィールドのみを GET→PUT（他フィールドは触らない）
- config: `tournament.progression_template_id`（任意・空可）。scaffold は master.json 雛形に反映。init_tournament ウィザードに任意質問を追加
- **v1 の範囲**: ライブラリ・選択・保存・表示まで。**進行計算の自動実行（GAS アダプタ）は次フェーズ**（engine/README の作業リスト 8 項目が前提）。registry/engine はその将来実行の正本となる

## 4. 登録フロー（龍偉 / Claude Code）

- `.claude/commands/progression-add.md` を新設。`/progression-add` で起動し Claude が以下を実行:
  1. 龍偉から定義を受領（JSON 貼り付け / ファイルパス / 口頭ルールから Claude が ProgressionTemplate を起こす、の3方式）
  2. `python3 tools/validate_progression.py <file>` で検証（JSON 妥当性・必須キー・entries_min/max の重複なし・lane_assignment の識別子が `N.M.R` / `N.RT` 文法に合致・レーン数整合）
  3. **カバレッジ確認**: モデルは想定される全クルー数に対応していること。validate がパターンのギャップ（1〜60 の範囲で未カバーのクルー数）を WARNING 列挙する。WARNING がある場合は龍偉に報告し、意図的なギャップか確認してから登録を判断する。
  4. 命名: 全日本など特別な場合のみ label 指定。**無名は `model-NNN`（registry の最大番号+1）を自動採番し label「汎用モデル NNN」**
     - **ユーザーに entries_range（対応クルー数の範囲）を選ばせない**: `supported_entries` はテンプレートの patterns から自動計算する。手動入力不要。
  5. templates/ へ保存 + registry.json へ追記 + コミット & push（kit リポジトリ）
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
