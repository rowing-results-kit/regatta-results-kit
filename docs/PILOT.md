# パイロット運用メモ

## 概要

1協会に試してもらい、導入フローの課題を洗い出す。フィードバックをもとにキットを改善し、
次の協会へ広げていく。

---

## パイロットの進め方

1. **配布**: 案内メッセージ（下記テンプレ）を協会担当者にメール・LINE等で送る
2. **導入**: 担当者がLP（導入ガイド）にしたがって7ステップを進める
3. **相談**: 詰まったら
   - AIチャット（導入ガイド内のAI相談ボタン）に質問
   - または [フィードバックIssue](https://github.com/rowing-results-kit/regatta-results-kit/issues/new?template=feedback.yml) で報告
4. **改善**: 龍偉がフィードバックを確認 → キット・ガイドを修正 → 次の協会へ

---

## 配布時に送る案内メッセージ（コピペ用）

```
件名: ボート大会の速報サイト、無料で作れるツールのご案内

〇〇連盟 ご担当者様

はじめまして。山田と申します。

ボート大会の記録を当日にリアルタイムで公開できる無料ツールを作りました。
Googleスプレッドシートに記録を入力すると、そのまま速報サイトに自動反映されます。

導入ガイドはこちらです:
https://rowing-results-kit.github.io/regatta-results-kit/

7ステップで完結します。PCが普通に使える方なら1〜2時間で設定できます。
途中で分からないことがあれば、ガイドページのAI相談ボタンに聞くと解決できます。

試していただけた場合、感想を下記フォームで教えていただけますと大変助かります:
https://github.com/rowing-results-kit/regatta-results-kit/issues/new?template=feedback.yml

どうぞよろしくお願いいたします。
山田龍偉
```

---

## 観察ポイント

| 項目 | 確認方法 |
|------|---------|
| 所要時間 | フィードバックIssueの「導入にかかった時間」欄 |
| 離脱ステップ | フィードバックIssueの「詰まったステップ」欄 |
| 問い合わせ内容 | GitHubのIssue一覧（`feedback` ラベルでフィルタ）|
| 完了率 | Issue提出数 ÷ 案内送付数 |

---

## 改善サイクル

1. Issueを受け取ったら24時間以内に返信（感謝・確認）
2. 修正対象を判断 → ガイド・キット・GASのいずれかを更新
3. 修正内容をIssueにコメントして閉じる
4. 次のパイロット候補に案内を送る前に修正を反映済みであることを確認

---

## 配布URL一覧

| ページ | URL |
|--------|-----|
| LP（概要・導入開始） | https://rowing-results-kit.github.io/regatta-results-kit/ |
| 導入ガイド（7ステップ） | https://rowing-results-kit.github.io/regatta-results-kit/onboarding/ |
| 運用ガイド（大会当日） | https://rowing-results-kit.github.io/regatta-results-kit/guide/ |
| フィードバック提出 | https://github.com/rowing-results-kit/regatta-results-kit/issues/new?template=feedback.yml |
