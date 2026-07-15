# Sprint 1〜3 実装トラッカー（2026-07-15 起動 / 2026-07-16 完了）

正本レビュー: `docs/reviews/service-review-20260715.md`（龍偉承認スコープ=選択肢3）

## 🎯 ゴール（完了定義 DoD）— 全項目達成
- [x] G1: DNS/DNF/DQ艇の進出除外・fixture分岐削除・SPEC準拠テスト（engine 65件PASS。追加でレーン規則一般化・finish_rank優先・非推移比較器も修正）
- [x] G2: `make watch` 出力先を `site/data/results/` に統一（e2e 20/20 PASS）
- [x] G3: cp932 CSV: Pythonはフォールバック＋日本語案内、GASはU+FFFD検知でrecordError＋Push中断（vmテストで実証）
- [x] G4: age_group 3箇所 h() 化・scaffold HTMLエスケープ（悪性入力テストで無害化確認）
- [x] G5: refresh-onboarding-screenshots.yml に issues:write 付与
- [x] G6: watchdog schedule復活＋大会日程ガード（前日〜翌日のみ稼働・SETUP_GUIDE追記）
- [x] G7: pdf_publisher / judge_form_publisher に doGet Webアプリ新設（ブラウザだけで帳票生成・ガイド追記）※龍偉のGAS再デプロイが必要
- [x] G8: moveToProcessed記録・ERROR_HISTORY直近5件＋LAST_SUCCESS_AT・レート文言15分統一・resultCount実数・フォルダ作成ロック＋IDキャッシュ・エラーメール通知（30分抑制/OFF可）
- [x] G9: 対象12ページ checkpoint-qa CP-01/02/05 全PASS・絵文字0件・グラデ/backdrop-filter 0件・th scope 132箇所・font-weight 600ゼロ
- [x] G10: onboarding「重なり」は検査ツールの誤検知と判明→ツール自体を修正（500pxクランプ撤廃・rgba合成対応）。実P1（site 320px横あふれ・PC幅891px固定・badge未定義等）は視覚QA×3で検出し修正
- [x] G11: DESIGN.md §14「カラートークンの主従関係」追記・#2D4F2C孤立ハードコード統一
- [x] G12: e2e 20/20・engine 65/65・tsc緑・Codex監査1回（Critical2/Major2/Minor1→全修正）・視覚QA独立3チェック→指摘全修正・コミット/push完了

## レビュー実績（T6）
- Codex監査（--audit相当・龍偉指示）: Critical 2（GAS認可の関数単位強制漏れ×2）・Major 2（lastSuccessAt部分失敗・二重記録）・Minor 1（空文字status）→ **全件修正・回帰テスト付き**
- 視覚QA独立3チェック: block級P1 5件（site 320px横あふれ / PC幅固定 / update-bar残骸 / badge-req未定義 / OK/NG列初期非表示）＋検査ツールの偽陽性クランプ → **全件修正・再検証PASS**
- GAS vmスタブテスト: 92 PASS（認可15関数×2条件・文字化けPush 0件・watchdogガード5シナリオ等）

## 👤 龍偉タスク（残・運用側）
1. GAS-A/B/C の貼り替え＆再デプロイ（B/Cは WebApp.gs + webapp HTML 新規追加あり。手順=各セットアップガイド.html）
2. ポータル/帳票ページを1回開き拒否画面が出ないこと確認（保険プロパティ: PORTAL_OWNER_EMAIL / WEBAPP_OWNER_EMAIL）
3. 3艇決勝のレーンが {2,3,4}（SPEC準拠）で正しいか大会要項と現物照合（3/4/5が正なら1定数変更で対応可）
4. メール通知不要なら Script Property `ERROR_EMAIL_ENABLED=false`

## 次スプリント候補（今回スコープ外・レビュー正本P2/P3から）
- 柱④年間集約（横断検索・通算・アーカイブ）= 新規SPEC起票（spec-kit）
- README v0.1.0 vs VERSION 0.9.2 整合・CHANGELOG新設・SPEC-hub-v1等のstale解消
- hub/association.json のCI検証・publisher 2本のrecordError実装・staffインラインHEX残存・portal残余コントラスト7件
- engine既知残: assignLanes中央寄せ不一致・ProgressionError未実装・masters-regatta-2026側の同系バグ
- pipeline既知残（要設計判断・eng-tools 3巡目報告）: 失敗再試行キーがCSV単位mtime／複数行引用フィールドで行番号ズレ／`--serve`+`--output`時のプレビューが本番JSON表示／test_dnfが実大会master.jsonと結合しCIが赤くなりうる／全艇DNFレースはGAS=公開・Python=スキップの乖離
- site/admin ページの japanese-typesetting（line-break:strict・palt）未適用（内部ページ・低優先）
