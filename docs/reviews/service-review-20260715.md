# regatta-results-kit 全域サービスレビュー（2026-07-15）

- 実施: Fable 5（本体・裁定）＋ 独立レビュアー6（パイプライン / 進行エンジン / セキュリティ / GAS / デザイン / プロダクト網羅性）
- 対象: リポジトリ全体（v0.9.2 時点、main c21509f）
- 前提: 公開中ホームページの案内情報はセキュリティ承認済み。取り下げ系の指摘は対象外。

---

## 総合判定: **block（このままの大会投入・公開拡大は不可）**

| レビュー軸 | 判定 | 一言 |
|---|---|---|
| 進行エンジン | **block** | DNS/DNF/DQ艇が次ラウンドに出走枠を得て、正当な完漕艇が消えるバグ（テストが追認済み） |
| デザイン/UX | **block** | オンボーディングの文字重なり・絵文字大量残存（退行）・DS禁止則違反が広範囲 |
| パイプライン/CLI | concern | 「実運用で確実に踏む」P1が4件 |
| GAS/当日運用 | concern | サイレント失敗の穴＋監視（watchdog）が現在停止中 |
| セキュリティ | concern | stored XSS 2系統（攻撃者は関係者に限定）＋CSPが防御を無効化 |
| プロダクト網羅性 | concern | 柱①②が「ブラウザだけで完結」の約束に届いていない。柱④の年間集約はゼロ実装 |

E2Eテスト 16/16 PASS・エンジンテスト 27/27 PASS だが、**テストが通ること自体が品質の証明になっていない**（後述 P1-1）。

---

## P1（最優先・確実に事故る）— 本体検証済み

### P1-1 進行エンジン: 失格・棄権艇が進出し、正当な完漕艇が無言で消える 【裁定=事実確認済み】
- `progression/engine/src/advance.ts:130-167` — DNS/DNF/DQ の status を進出判定から除外していない（SPEC §5.1/§6 違反）。失格艇が次ラウンドの実レースにレーンを得る。
- `progression/engine/src/advance.ts:169-186` — `applyPatternTwoStatusFixtureOrdering` はテスト1件の形状に合わせたハードコード分岐が**本番コードに残存**。A版7〜12クルー予選で status 異常が絡むと必ず発火し、`splice(2,1)` で取り出した完漕艇を再挿入せず消滅させる。テスト期待値がこのバグを「正解」として固定しているため 27/27 PASS でも検出不能。
- 影響: 競技結果の正当性に直結。修正＋テスト期待値を要項PDFと突合して再作成が必須。

### P1-2 `make watch` の結果が公開サイトに一切反映されない 【裁定=事実確認済み】
- `tools/watch.py:50` — 出力先が `data/results/`（正: `site/data/results/`）。site・check_status・simulate_pipeline はすべて `site/data/` を見ており watch.py だけ食い違う。成功ログが出るのに反映されない最悪パターン。

### P1-3 Excel保存CSV（Shift_JIS）への無防備
- Pythonツール群（`generate_master.py:71` ほか）: UTF-8固定＋try/exceptなし → 生スタックトレースでクラッシュ。
- GAS側（`gas/Code.gs:499-537`）: UTF-8固定で読み、**文字化けした選手名をエラーなく公開サイトへPush**。日本語版Excelの既定保存はSJISのため、非エンジニア運用で再現率が高い。

### P1-4 監視（heartbeat-watchdog）が現在停止中
- `.github/workflows/heartbeat-watchdog.yml:4-6` — schedule がコメントアウト（2026大会終了で停止）。次大会で復活忘れをすると、GASが死んでも誰にも通知されない。復活手順がどのチェックリストにも載っていない。

### P1-5 スクショ更新workflowのリマインダーIssueが常に403 【裁定=事実確認済み】
- `refresh-onboarding-screenshots.yml:15-16` — `permissions: contents: write` のみで `issues: write` 欠落。最終ステップ `github.rest.issues.create` は毎回失敗する。

### P1-6 柱①②の運用断絶: 「ブラウザだけで完結」に届いていない
- 審判帳票（`generateAllJudgeForms`）・結果ブックレット・結果一覧PDF・準備資料の生成トリガーが**GASスクリプトエディタでの関数手動実行のみ**。ポータルにボタンなし、SETUP_GUIDE/day-manual に手順なし。非エンジニアの協会担当者は審判資料・掲出PDFに到達できない。

### P1-7 デザイン: 公開品質を割る違反群（checkpoint-qa 実測）
- `docs/onboarding/index.html`: 全7幅で文字重なり FAIL（非エンジニアの主要導線が最も崩れている）＋タップターゲット44px未満 70件超。
- 絵文字残存: `gas/portal.html` 56件・`staff/*` 多数・`docs/system-map.html` 51件 — 「絵文字ゼロ化」コミット後の**退行**。
- `staff/schedule_input_guide.html`・`db_structure.html`・`spec.html`: モバイル幅で横スクロール +52〜151px（テーブルにoverflowラッパーなし）。
- グラデーション（`docs/index.html` ヒーロー他）・`backdrop-filter: blur`（`docs/guide/index.html:126`）— design-rules.json / 組織DS禁止則に直接違反。
- staff系全テーブル `th scope` 欠如 60件超。

---

## P2（条件付きで誤動作・要修正）

**セキュリティ**（攻撃者は Drive/リポジトリ書込権限を持つ関係者に限定されるため P2 裁定）
- stored XSS: `site/js/app.js:508,841,984` — `race.age_group` のみ `h()` 未適用（同ファイル内でエスケープ済み箇所とムラ）。schedule.csv 経由で公開サイト閲覧者全員に発火可能。
- テンプレ注入: `tools/scaffold.py:419-442` — 大会名を無エスケープで `<title>`/`<meta>` へ置換。
- `site/_headers` CSP が `unsafe-inline` で上記の最後の防壁を無効化。
- `AdminPortal.gs doGet` にサーバー側認可ゼロ（GASデプロイ設定に100%依存）。多層防御としてオーナー照合ガード推奨。
- ~~workflow 3本で `workflow_dispatch` 入力を `git commit -m "…"` に直接展開（`$()` 展開面）~~ → **誤検知確定（2026-07-16 PM裁定）**: 3本とも env 経由で、ダブルクォート内のシェル変数展開は `$()` を再評価しない。本表の「誤検知になりやすい点」の除外と整合。

**GAS/運用**
- `moveToProcessed` 失敗を無視 → 同一レースを2分毎に永久再Push（`gas/Code.gs:481-484,805-823`）。
- `LAST_ERROR` がクリアされず古いエラーを大会中表示し続ける → アラート疲れ（`Code.gs:1472-1481`）。
- レート制限の実装15分 vs 表示「1時間」の矛盾（`Code.gs:150-162,792`）。
- ポータル「結果 JSON 数」が恒久 `—`（存在しない `master.results` を参照、`AdminPortal.gs:519-537`）。
- フォルダ作成のTOCTOU（onTrigger×ポータル同時実行で重複フォルダ→CSV検知不能、`Code.gs:1327-1337`）。
- pdf_publisher / judge_form_publisher にはエラー記録・状態表示の仕組み自体がない（Code.gs専用機能）。
- ポータル状態は手動リロードのみ・プッシュ通知（メール/Slack）経路なし。

**パイプライン/ツール**
- simulate_pipeline / watch.py の DNF 処理が GAS 本番と乖離（DNF艇がDNS表示になる・status未付与）。e2eの `result_required` に `status` がなく検知不能。
- 死んだツール: `generate_race_pdf.py` / `generate_race_xlsx.py` / `generate_judge_form.py` — 実在しない `data/master.json` を参照し必ず失敗。judge_form は `{{GITHUB_REPO}}` 未置換で二重に壊れている。
- `schedule.csv` の race_no 重複を未検証（静かに誤ったレースを出力しうる）。
- judge_form の category 参照先が entries に存在せず帳票カテゴリー欄が常に空。

**プロダクト/文書**
- `README.md:1` v0.1.0 vs `VERSION` 0.9.2（18リリース分乖離）。CHANGELOG不在。
- `docs/SPEC-hub-v1.md` が実装済み機能を「❌未実装」のまま記載（stale）。SPEC_admin_portal「4タブ」vs 実装5タブ。
- `hub/association.json` が CI 検証対象外（Web UI直接編集でノーチェック本番反映）。
- Shared.gs の3プロジェクト同期が手動 `make build-gas` 頼み（CIで一致検証なし）。
- 色トークン3系統乖離（style.css `#24602A` / tokens.json `#0E4D5C` / portal・staff `#2D4F2C`）— 大会別ブランド可変の設計がDESIGN.md未記載で「バグか仕様か」判定不能。
- コントラスト不足: 金銀銅バッジ・ポータルのステータスバッジが 3.3〜4.2（AA未達）。font-weight 600 多用（許可値は500/700）。

**本体裁定で降格・除外したもの**
- 「fs-btn コントラスト1.0で不可視」（rev-design報告のP1）→ **測定アーティファクト**。実体は濃緑ヘッダー上の白文字で可読。ただし rgba半透明＋radius 20px のDS違反自体は事実（P2に降格）。
- dataset代入・daysLeft埋め込み・CSV formatted列・workflow `${{ inputs }}` env経由 → セキュリティレビュアーが検証の上、誤検知として除外済み。

---

## P3（改善提案・抜粋）

- `advance.ts` の3艇中央寄せヒューリスティックのテンプレート駆動化 / snake シード未実装（SPEC乖離の明記）/ `warnings` フィールド未実装。
- テストの部分一致比較（トートロジー構造）→ 1系統は完全一致＋一次資料（要項PDF）突合へ。
- `Code.gs` テスト関数の二重定義 / ROUND_LABELS等の重複 / 死んだコメント行除去ロジック。
- 日付表記ゆれ（`2026-06-12` vs `2026/5/23`）。checkout@v4/v5混在。`make push-test TOKEN=` のshell history残留。
- hub手動ステータスとsite自動アーカイブ判定の非連動。

---

## 4本柱の充足度（プロダクト網羅性レビュー）

| 柱 | 充足 | 状態 |
|---|---|---|
| ① 審判への情報提供 | 約60% | 帳票ロジックは実装済みだが起動導線がGASエディタのみ（P1-6）。審判向け文書・導線は設計上存在しない（帳票を受け取る前提）— この設計判断自体は妥当だが未文書化 |
| ② 結果掲出 | 約75% | 速報・個別PDF は全自動で堅牢。ブックレット・一覧PDFは手動GAS依存 |
| ③ HP出力 | 約90% | scaffold・hub連携・ポータルとも実装/文書化済み。最も健全 |
| ④ 年間・協会まとめ | 約55% | 年度ハブのCRUD/ステータス管理はSPECより先行して健全。**横断検索・選手/クルー通算・年間アーカイブはゼロ実装**（SPECで明示的にスコープ外＝意図的未着手） |

接続が切れている箇所: ①確定判定の二重管理（site自動 vs hub手動）②確定→PDF/帳票生成の導線断絶（最大ボトルネック）③協会横断の集約経路が設計上存在しない ④hub JSON直接編集がCIをバイパス。

---

## 改築ロードマップ（提案）

- **Sprint 1〈正確性〉**: P1-1（エンジン2件＋テスト再作成）/ P1-2 / P1-3 / P1-5 / XSS 3箇所＋scaffoldエスケープ＋CSP整理
- **Sprint 2〈当日運用〉**: P1-4（watchdog再有効化の仕組み化）/ P1-6（ポータルに帳票・PDF生成ボタン）/ moveToProcessed・LAST_ERROR・レート表示・resultCount・TOCTOU / エラーのメール/Slack通知経路
- **Sprint 3〈公開品質〉**: P1-7一式（onboarding重なり・絵文字ゼロ化・グラデ/glass撤去・staffテーブルラッパー・scope・コントラスト）＋トークン一本化とDESIGN.md追記
- **Sprint 4〈サービス完成〉**: 柱④の年間集約（横断検索・通算・アーカイブ）を新規SPECで設計（spec-kit必須）/ SPEC類・README/VERSION・CHANGELOG整備 / 死んだツールの廃止or修理 / hub CI検証

強み（維持すべき点): scaffold の冪等性設計と置換漏れ自己検査 / validate.yml の最小権限 / tie_group 監査出力 / hub のCRUD実装がSPECより先行 / site/index.html 本体は7幅レイアウト全PASS。
