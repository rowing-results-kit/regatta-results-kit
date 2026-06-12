# /progression-add — 進行モデル登録コマンド

## 目的

新しい進行モデル（ProgressionTemplate JSON）を `progression/` ライブラリへ登録する。
龍偉が実行し、Claude が全手順を自動で実行する。

**前提**: regatta-results-kit リポジトリのルートで実行すること。

---

## STEP 1: 定義の受領（3方式）

以下のいずれかで定義を受け取る。

**方式 A — JSON 貼り付け**
龍偉がチャットに ProgressionTemplate JSON を直接貼り付ける。
→ 一時ファイル `/tmp/progression_candidate.json` に保存して STEP 2 へ。

**方式 B — ファイルパス指定**
龍偉が `~/Downloads/template.json` などのパスを渡す。
→ そのパスを `/tmp/progression_candidate.json` にコピーして STEP 2 へ。

**方式 C — 口頭ルール**
龍偉がレース数・進出枠・レーン数などを口頭で説明する。
→ Claude が ProgressionTemplate 形式の JSON を起こし、
  龍偉に確認を取ってから `/tmp/progression_candidate.json` に保存して STEP 2 へ。

---

## STEP 2: バリデーション（必須・FAIL なら登録中止）

```bash
python3 tools/validate_progression.py /tmp/progression_candidate.json
```

- **PASS** → STEP 3 へ進む
- **FAIL** → エラー内容を龍偉に報告し、**登録を中止**する。
  方式 C の場合は Claude が JSON を修正して再度 STEP 2 を実行する。

検証 FAIL のまま登録してはならない。

---

## STEP 3: 採番・命名

**全日本など特別な場合**: 龍偉が `label` と `id` を明示的に指定する（例: `alljapan-a`）。

**無名モデル（それ以外）**:
```bash
# registry.json の最大 model-NNN 番号を確認
python3 -c "
import json, re
with open('progression/registry.json') as f:
    reg = json.load(f)
nums = [int(m) for entry in reg['models'] for m in re.findall(r'^model-(\d+)$', entry['id'])]
next_n = max(nums, default=0) + 1
print(f'model-{next_n:03d}')
"
```

- `id`: `model-NNN`（NNN は 3桁ゼロ埋め、registry の最大番号 + 1）
- `label`: `"汎用モデル NNN"`
- source（提供元情報）: 龍偉が運営者名などを口頭で伝えた場合は記録。不明なら `"運営者提供"`

---

## STEP 4: テンプレート JSON の id 書き換えと保存

```python
# 採番した id で template の id フィールドを上書きして保存
import json
with open('/tmp/progression_candidate.json') as f:
    t = json.load(f)
t['id'] = '<採番した id>'  # 例: "model-001" or "alljapan-a"
dest = f"progression/templates/{t['id']}.json"
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(t, f, ensure_ascii=False, indent=2)
```

---

## STEP 5: registry.json への追記

`progression/registry.json` の `models` 配列末尾に以下を追加する。

```jsonc
{
  "id": "<採番した id>",
  "label": "<label>",
  "lanes": <lanes>,
  "entries_range": [<min>, <max>],   // templates の patterns から実際に集約
  "description": "<説明>",
  "source": "<提供元>",
  "added": "<YYYY-MM-DD>"
}
```

`entries_range` は `python3 -c` でテンプレートの全 patterns を読み min/max を計算する。

---

## STEP 6: 整合性チェック

```bash
# registry と templates の id が 1対1 か確認
python3 -c "
import json, os
with open('progression/registry.json') as f:
    reg = json.load(f)
reg_ids = {m['id'] for m in reg['models']}
tmpl_ids = {os.path.splitext(f)[0] for f in os.listdir('progression/templates') if f.endswith('.json')}
missing_tmpl = reg_ids - tmpl_ids
missing_reg  = tmpl_ids - reg_ids
if missing_tmpl: print('WARN: in registry but no template file:', missing_tmpl)
if missing_reg:  print('WARN: template file but not in registry:', missing_reg)
if not missing_tmpl and not missing_reg: print('OK: registry and templates are 1-to-1')
"
```

---

## STEP 7: コミット & push

```bash
git add progression/templates/<id>.json progression/registry.json
git commit -m "feat(progression): add model <id> - <label>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

---

## 禁止事項

- バリデーション FAIL のまま登録・コミットしない
- registry に id が重複するエントリを追加しない
- templates/ に対応する registry エントリなしでファイルを置かない
