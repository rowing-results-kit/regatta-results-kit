# regatta-results-kit

組成中。Phase 5-B/C で完成予定。

## リポジトリ構成

```
regatta-results-kit/
├ site/                  配信テンプレ（index.html/js/css/404/_headers/_redirects）
│   └ admin/__ADMIN_PATH__/index.html
├ staff/__STAFF_PATH__/  スタッフ向けHTMLテンプレ（6本+shared.css）
├ gas/                   GASプロジェクト（クリーン版）+ shared/
├ template/              CSVテンプレ・サンプル + tournament.config.example.json
├ tools/                 Python CLIツール群（generate_master/simulate等）
├ test/                  e2e_test.py + フィクションfixture
├ docs/                  ARCHITECTURE.md / SETUP_GUIDE.md / SPEC_phase3_config.md
├ .github/workflows/     validate.yml / heartbeat-watchdog.yml
├ Makefile / VERSION / LICENSE / .gitignore
```

## 注意事項

- このリポジトリはGitHubテンプレートリポジトリです。scaffold実行前は `__ADMIN_PATH__` / `__STAFF_PATH__` はプレースホルダーのままです
- 選手名など個人情報の掲載は必ず本人の同意を得てから行ってください
- `tournament.config.json` および `.clasp.json` はgitignore対象です（秘匿情報を含むため）
