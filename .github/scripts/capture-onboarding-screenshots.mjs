/**
 * オンボーディングガイド用スクリーンショット自動撮影スクリプト
 *
 * 対象: ログイン不要の公開画面のみ
 * 実行環境: GitHub Actions (ubuntu-latest) + Playwright chromium
 * ローカル実行: node .github/scripts/capture-onboarding-screenshots.mjs
 *
 * IMPORTANT: 認証が必要な画面は撮影しない
 *   - 認証情報をCIに置くのは危険
 *   - 2FAで自動化が壊れる
 *   → ログイン必須画面は SCREENSHOT_MANIFEST.md を参照して手動撮影
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/assets/img/onboarding');

// ログイン不要の公開画面のみ
const SHOTS = [
  {
    id: 'gh-template-repo',
    url: 'https://github.com/RYUIYAMADA/regatta-results-kit',
    waitFor: 'networkidle',
    desc: 'GitHub テンプレートリポジトリ（Use this template ボタン）',
  },
  {
    id: 'gh-login',
    url: 'https://github.com/login',
    waitFor: 'networkidle',
    desc: 'GitHub ログイン画面',
  },
  {
    id: 'cf-login',
    url: 'https://dash.cloudflare.com/login',
    waitFor: 'load',
    waitTimeout: 12000,
    desc: 'Cloudflare ログイン画面（Turnstile含む）',
  },
  {
    id: 'gh-actions-tab-example',
    url: 'https://github.com/RYUIYAMADA/regatta-results-kit/actions',
    waitFor: 'networkidle',
    desc: 'GitHub Actions タブ（公開リポジトリ）',
  },
  {
    id: 'google-drive-login',
    url: 'https://accounts.google.com/ServiceLogin?service=wise&passive=1209600&continue=https%3A%2F%2Fdrive.google.com%2F&followup=https%3A%2F%2Fdrive.google.com%2F',
    waitFor: 'networkidle',
    waitTimeout: 12000,
    desc: 'Google Drive ログイン誘導画面',
  },
  {
    id: 'gas-landing',
    url: 'https://script.google.com',
    waitFor: 'load',
    waitTimeout: 10000,
    desc: 'Google Apps Script ランディング',
  },
];

async function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUT_DIR}`);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];

  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      // No auth cookies — login-free pages only
    });
    const page = await ctx.newPage();

    console.log(`Capturing: ${shot.id}`);
    console.log(`  URL: ${shot.url}`);

    try {
      await page.goto(shot.url, {
        waitUntil: shot.waitFor,
        timeout: shot.waitTimeout || 15000,
      });
    } catch (e) {
      const msg = e.message.split('\n')[0];
      console.warn(`  warn (timeout/nav): ${msg}`);
      // Continue — partial load is usually fine for static pages
    }

    // Extra stabilization wait
    await page.waitForTimeout(1500);

    const outPath = path.join(OUT_DIR, `${shot.id}.png`);
    await page.screenshot({ path: outPath, fullPage: false });

    const { size } = await import('fs').then(m => ({ size: m.statSync(outPath).size }));
    const kb = Math.round(size / 1024);
    console.log(`  -> saved: ${outPath} (${kb}KB)`);

    if (kb > 400) {
      console.warn(`  WARNING: file exceeds 400KB target (${kb}KB)`);
    }

    results.push({ id: shot.id, path: outPath, kb });
    await ctx.close();
  }

  await browser.close();

  console.log('\n=== Capture Summary ===');
  console.log(`Total: ${results.length} screenshots`);
  results.forEach(r => console.log(`  [OK] ${r.id} (${r.kb}KB)`));
  if (errors.length > 0) {
    console.error(`Errors: ${errors.length}`);
    errors.forEach(e => console.error(`  [ERR] ${e}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
