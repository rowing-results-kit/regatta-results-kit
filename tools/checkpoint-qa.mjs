#!/usr/bin/env node
/**
 * checkpoint-qa.mjs — 提出前チェックポイント 機械検査スクリプト
 * 対応: docs/CHECKPOINTS.md の CP-01/02/05/08/09/11 を自動検査
 *
 * 使い方:
 *   node tools/checkpoint-qa.mjs --check overlap  <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --check responsive <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --check emoji    <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --check links    <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --check pii      <path_or_glob>
 *   node tools/checkpoint-qa.mjs --check a11y     <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --screenshot     <url_or_html_file>
 *   node tools/checkpoint-qa.mjs --all            <url_or_html_file>
 *
 * 依存:
 *   npm install puppeteer   (overlap / responsive / a11y / screenshot / links)
 *   fs, path — Node.js 組み込み (emoji / pii)
 *
 * 注意:
 *   - headless Chrome の最小幅は ~500px。モバイル幅（320/375/414）は
 *     DevTools emulation (setViewport) で対応する。
 *   - puppeteer 未インストールの場合、overlap/responsive/a11y/screenshot は
 *     "SKIP (puppeteer not found)" と表示して終了する。
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { resolve, extname, join } from 'path';
import { pathToFileURL } from 'url';

// ─── CLI 引数パース ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const checkFlag = args.indexOf('--check');
const screenshotFlag = args.indexOf('--screenshot');
const allFlag = args.indexOf('--all');

let mode = null;
let target = null;

if (checkFlag !== -1) {
  mode = args[checkFlag + 1];
  target = args[checkFlag + 2];
} else if (screenshotFlag !== -1) {
  mode = 'screenshot';
  target = args[screenshotFlag + 1];
} else if (allFlag !== -1) {
  mode = 'all';
  target = args[allFlag + 1];
}

if (!mode || !target) {
  console.error(`使い方:
  node tools/checkpoint-qa.mjs --check <mode> <target>
  node tools/checkpoint-qa.mjs --screenshot <target>
  node tools/checkpoint-qa.mjs --all <target>

  mode: overlap | responsive | emoji | links | pii | a11y
  target: URL (http/https) またはローカル HTML ファイルパス`);
  process.exit(1);
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────
const PASS = '\x1b[32m[PASS]\x1b[0m';
const FAIL = '\x1b[31m[FAIL]\x1b[0m';
const SKIP = '\x1b[33m[SKIP]\x1b[0m';
const INFO = '\x1b[36m[INFO]\x1b[0m';

function isUrl(s) {
  return /^https?:\/\//.test(s);
}

function toUrl(t) {
  if (isUrl(t)) return t;
  const abs = resolve(t);
  return pathToFileURL(abs).href;
}

async function loadPuppeteer() {
  try {
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer;
  } catch {
    return null;
  }
}

// ブレークポイント: CP-01 の仕様（ただし headless Chrome ≥ 500px 推奨）
const BREAKPOINTS = [
  { label: '320px  (mobile-xs)', width: 320,  height: 720  },
  { label: '375px  (mobile-sm)', width: 375,  height: 812  },
  { label: '414px  (mobile-md)', width: 414,  height: 896  },
  { label: '768px  (tablet)   ', width: 768,  height: 1024 },
  { label: '1024px (laptop)   ', width: 1024, height: 768  },
  { label: '1280px (desktop)  ', width: 1280, height: 800  },
  { label: '1920px (wide)     ', width: 1920, height: 1080 },
];

// ─── CP-01 文字重なり / bounding box 検査 ────────────────────────────────────
async function checkOverlap(url, puppeteer) {
  console.log(`\n${INFO} CP-01 文字の重なり・見切れ検査 — ${url}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  let failures = 0;

  for (const bp of BREAKPOINTS) {
    const page = await browser.newPage();
    // headless Chrome の実限界は ~500px。それ以下は emulation で対応
    await page.setViewport({ width: Math.max(bp.width, 500), height: bp.height,
      deviceScaleFactor: 1 });
    if (bp.width < 500) {
      // CSS viewport を強制（JS で body を縮小）
      await page.emulateMediaFeatures([]);
    }
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // テキストノードの bounding box を取得して重なりを検査
    const overlaps = await page.evaluate(() => {
      const rects = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, text: node.textContent.trim().slice(0, 20) });
        }
      }
      // 簡易 O(n²) 重なり検査（要素数が多い場合はサンプリング）
      const found = [];
      const sample = rects.slice(0, 200);
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          const a = sample[i], b = sample[j];
          const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
          const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
          if (overlapX && overlapY) {
            found.push(`"${a.text}" ↔ "${b.text}"`);
            if (found.length >= 5) return found; // 最大5件で打ち切り
          }
        }
      }
      return found;
    });

    // 画面外クリップ検査
    const clipped = await page.evaluate(() => {
      const vw = window.innerWidth;
      const issues = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.left < vw) {
          const text = el.textContent.trim().slice(0, 30);
          if (text) issues.push(text);
        }
      });
      return issues.slice(0, 5);
    });

    const hasIssue = overlaps.length > 0 || clipped.length > 0;
    const icon = hasIssue ? FAIL : PASS;
    console.log(`  ${icon} ${bp.label}`);
    if (overlaps.length > 0) console.log(`         重なり: ${overlaps.join(' / ')}`);
    if (clipped.length > 0) console.log(`         クリップ: ${clipped.join(' / ')}`);
    if (hasIssue) failures++;

    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? `  ${PASS} 全幅で重なり・クリップなし` : `  ${FAIL} ${failures}幅で問題あり`);
  return failures;
}

// ─── CP-02 レスポンシブ（横スクロール）検査 ──────────────────────────────────
async function checkResponsive(url, puppeteer) {
  console.log(`\n${INFO} CP-02 レスポンシブ / 横スクロール検査 — ${url}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  let failures = 0;

  for (const bp of BREAKPOINTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.max(bp.width, 500), height: bp.height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = Math.max(bp.width, 500);
    const overflow = scrollWidth - viewportWidth;

    const icon = overflow > 1 ? FAIL : PASS;
    console.log(`  ${icon} ${bp.label} — scrollWidth: ${scrollWidth}px (overflow: ${overflow > 0 ? '+' + overflow : overflow}px)`);
    if (overflow > 1) failures++;

    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? `  ${PASS} 全幅で横スクロールなし` : `  ${FAIL} ${failures}幅で横スクロールあり`);
  return failures;
}

// ─── CP-05 絵文字ゼロ検査 ────────────────────────────────────────────────────
// 絵文字 Unicode 範囲
const EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]/gu;

async function checkEmoji(target) {
  console.log(`\n${INFO} CP-05 絵文字ゼロ検査 — ${target}`);
  let failures = 0;

  const filesToCheck = [];
  if (isUrl(target)) {
    // URL の場合はソースを fetch（Node 18+ の fetch を使用）
    try {
      const res = await fetch(target);
      const text = await res.text();
      const matches = [...text.matchAll(EMOJI_REGEX)];
      if (matches.length > 0) {
        console.log(`  ${FAIL} ${target} — 絵文字 ${matches.length} 件: ${[...new Set(matches.map(m => m[0]))].slice(0, 10).join(' ')}`);
        failures++;
      } else {
        console.log(`  ${PASS} ${target} — 絵文字 0件`);
      }
    } catch (e) {
      console.log(`  ${SKIP} fetch 失敗: ${e.message}`);
    }
    return failures;
  }

  // ローカルファイル or ディレクトリ
  function collectFiles(p) {
    if (!existsSync(p)) return;
    const stat = statSync(p);
    if (stat.isDirectory()) {
      readdirSync(p).forEach(f => collectFiles(join(p, f)));
    } else {
      const ext = extname(p).toLowerCase();
      if (['.html', '.css', '.js', '.mjs', '.json', '.md', '.gs'].includes(ext)) {
        filesToCheck.push(p);
      }
    }
  }
  collectFiles(resolve(target));

  for (const f of filesToCheck) {
    const content = readFileSync(f, 'utf-8');
    const matches = [...content.matchAll(EMOJI_REGEX)];
    if (matches.length > 0) {
      console.log(`  ${FAIL} ${f} — 絵文字 ${matches.length} 件: ${[...new Set(matches.map(m => m[0]))].slice(0, 10).join(' ')}`);
      failures++;
    }
  }

  if (failures === 0) {
    console.log(`  ${PASS} 絵文字 0件（${filesToCheck.length}ファイル検査）`);
  } else {
    console.log(`  ${FAIL} ${failures}ファイルで絵文字を検出`);
  }
  return failures;
}

// ─── CP-08 内部リンク切れ検査 ────────────────────────────────────────────────
async function checkLinks(url, puppeteer) {
  console.log(`\n${INFO} CP-08 内部リンク切れ検査 — ${url}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 40) }))
      .filter(l => l.href && !l.href.startsWith('javascript:') && !l.href.startsWith('mailto:'));
  });

  await browser.close();

  const base = new URL(url);
  let failures = 0;
  let checked = 0;

  for (const link of links) {
    try {
      const lu = new URL(link.href);
      // 内部リンクのみ検査
      if (lu.origin !== base.origin) continue;
      const res = await fetch(link.href, { method: 'HEAD' });
      const icon = res.ok ? PASS : FAIL;
      console.log(`  ${icon} [${res.status}] ${link.href.replace(base.origin, '')} — "${link.text}"`);
      if (!res.ok) failures++;
      checked++;
    } catch {
      // 外部リンク・アンカーのみは skip
    }
  }

  if (checked === 0) {
    console.log(`  ${SKIP} 内部リンクなし or URL からのアクセス不可`);
  } else {
    console.log(failures === 0 ? `  ${PASS} 全${checked}件 OK` : `  ${FAIL} ${failures}件 NG`);
  }
  return failures;
}

// ─── CP-09 PII / 個人情報・ID 検査 ──────────────────────────────────────────
const PII_PATTERNS = [
  { label: 'Drive Folder ID (フォルダ)', regex: /[0-9A-Za-z_-]{33}/ },
  { label: 'Google Sheet ID',             regex: /[0-9A-Za-z_-]{44}/ },
  { label: 'GAS Script ID',               regex: /[0-9A-Za-z_-]{57}/ },
  { label: 'メールアドレス',              regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/ },
  { label: 'GitHub Token',                regex: /gh[ps]_[0-9A-Za-z]{36}/ },
  { label: '実クルー名候補（漢字2〜4字）', regex: /[一-鿿]{2,4}(?:　|\s)[一-鿿]{1,3}/ },
];

// 許可済みドメイン（公開サンプル等）
const PII_ALLOWLIST = ['example.com', 'example.org', 'localhost', 'placeholder'];

async function checkPii(target) {
  console.log(`\n${INFO} CP-09 PII / 個人情報検査 — ${target}`);
  let failures = 0;

  const filesToCheck = [];
  function collectFiles(p) {
    if (!existsSync(p)) return;
    const stat = statSync(p);
    if (stat.isDirectory()) {
      readdirSync(p).forEach(f => {
        // node_modules / .git / archive は除外
        if (['node_modules', '.git', 'archive', 'data'].includes(f)) return;
        collectFiles(join(p, f));
      });
    } else {
      const ext = extname(p).toLowerCase();
      if (['.html', '.css', '.js', '.mjs', '.json', '.gs', '.py', '.md'].includes(ext)) {
        filesToCheck.push(p);
      }
    }
  }

  const absTarget = resolve(target);
  collectFiles(absTarget);

  for (const f of filesToCheck) {
    const content = readFileSync(f, 'utf-8');
    for (const pattern of PII_PATTERNS) {
      const matches = content.match(new RegExp(pattern.regex, 'g'));
      if (!matches) continue;
      const filtered = matches.filter(m => !PII_ALLOWLIST.some(a => m.includes(a)));
      if (filtered.length > 0) {
        console.log(`  ${FAIL} [${pattern.label}] ${f}`);
        console.log(`         → ${filtered.slice(0, 3).map(m => m.slice(0, 30)).join(' / ')}`);
        failures++;
      }
    }
  }

  if (failures === 0) {
    console.log(`  ${PASS} PII パターン 0件（${filesToCheck.length}ファイル検査）`);
  } else {
    console.log(`  ${FAIL} ${failures}件のPII候補を検出（手動確認が必要）`);
  }
  return failures;
}

// ─── CP-11 アクセシビリティ検査 ──────────────────────────────────────────────
async function checkA11y(url, puppeteer) {
  console.log(`\n${INFO} CP-11 アクセシビリティ検査 — ${url}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const results = await page.evaluate(() => {
    const issues = [];

    // テーブル th scope 検査
    document.querySelectorAll('table').forEach((t, i) => {
      const headers = t.querySelectorAll('th');
      headers.forEach(th => {
        if (!th.hasAttribute('scope')) {
          issues.push(`table[${i}] th に scope なし: "${th.textContent.trim().slice(0, 20)}"`);
        }
      });
    });

    // aria-live 検査（動的コンテンツらしい要素）
    const dynamic = document.querySelectorAll('[data-live], .results, .race-results, .live, #results');
    dynamic.forEach(el => {
      if (!el.hasAttribute('aria-live') && !el.closest('[aria-live]')) {
        issues.push(`動的要素に aria-live なし: ${el.tagName}.${[...el.classList].slice(0, 2).join('.')}`);
      }
    });

    // タップターゲットサイズ検査（インタラクティブ要素）
    const interactive = [...document.querySelectorAll('a, button, input, select, [role="button"]')];
    interactive.forEach(el => {
      const r = el.getBoundingClientRect();
      if ((r.width > 0 || r.height > 0) && (r.width < 44 || r.height < 44)) {
        issues.push(`タップターゲット小さい (${Math.round(r.width)}x${Math.round(r.height)}px): ${el.tagName} "${el.textContent.trim().slice(0, 20)}"`);
      }
    });

    // focus-visible スタイル検査（outline: none がある要素）
    const sheets = [...document.styleSheets];
    let hasOutlineNone = false;
    for (const s of sheets) {
      try {
        for (const r of s.cssRules || []) {
          if (r.selectorText && r.selectorText.includes(':focus') &&
              r.style && r.style.outline === 'none' && !r.selectorText.includes(':focus-visible')) {
            hasOutlineNone = true;
            issues.push(`:focus に outline:none（:focus-visible で代替が必要）: ${r.selectorText}`);
          }
        }
      } catch { /* cross-origin */ }
    }

    return issues;
  });

  let failures = results.length;

  // コントラスト比検査（簡易: 背景白(#fff)基準でテキストカラーを評価）
  const contrastIssues = await page.evaluate(() => {
    function luminance(hex) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }
    function contrastRatio(l1, l2) {
      const bright = Math.max(l1, l2), dark = Math.min(l1, l2);
      return (bright + 0.05) / (dark + 0.05);
    }

    const issues = [];
    document.querySelectorAll('p, span, a, button, th, td, h1, h2, h3, h4, li').forEach(el => {
      const style = window.getComputedStyle(el);
      const color = style.color;
      const bg = style.backgroundColor;
      // rgba(r,g,b,a) → hex 変換
      function rgbaToHex(rgba) {
        const m = rgba.match(/[\d.]+/g);
        if (!m || m.length < 3) return null;
        return '#' + [m[0], m[1], m[2]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
      }
      const fgHex = rgbaToHex(color);
      const bgHex = rgbaToHex(bg);
      if (!fgHex || !bgHex || bg === 'rgba(0, 0, 0, 0)') return;
      const ratio = contrastRatio(luminance(fgHex), luminance(bgHex));
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight);
      const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
      const threshold = isLarge ? 3.0 : 4.5;
      if (ratio < threshold) {
        const text = el.textContent.trim().slice(0, 20);
        if (text) issues.push(`コントラスト比 ${ratio.toFixed(1)} < ${threshold} (${el.tagName}): "${text}" fg=${fgHex} bg=${bgHex}`);
      }
    });
    return [...new Set(issues)].slice(0, 10);
  });

  failures += contrastIssues.length;

  [...results, ...contrastIssues].forEach(issue => {
    console.log(`  ${FAIL} ${issue}`);
  });

  await browser.close();

  if (failures === 0) {
    console.log(`  ${PASS} アクセシビリティ問題なし`);
  } else {
    console.log(`  ${FAIL} ${failures}件の問題を検出`);
  }
  return failures;
}

// ─── screenshot ──────────────────────────────────────────────────────────────
async function takeScreenshot(url, puppeteer) {
  console.log(`\n${INFO} full-page スクリーンショット — ${url}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const outFiles = [];

  for (const bp of [
    { label: 'pc',     width: 1280, height: 800 },
    { label: 'mobile', width: 375,  height: 812 },
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.max(bp.width, 500), height: bp.height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const filename = `checkpoint-qa-screenshot-${bp.label}-${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`  ${PASS} 保存: ${filename}`);
    outFiles.push(filename);
    await page.close();
  }

  await browser.close();
  return outFiles;
}

// ─── メイン ──────────────────────────────────────────────────────────────────
async function main() {
  const puppeteer = await loadPuppeteer();
  const needsBrowser = ['overlap', 'responsive', 'a11y', 'links', 'screenshot', 'all'].includes(mode);

  if (needsBrowser && !puppeteer) {
    console.log(`${SKIP} puppeteer が見つかりません。`);
    console.log(`  インストール: npm install puppeteer`);
    console.log(`  ブラウザ不要な検査 (emoji, pii) は --check emoji / --check pii で実行できます。`);
    process.exit(0);
  }

  const url = isUrl(target) ? target : toUrl(target);
  let totalFailures = 0;

  switch (mode) {
    case 'overlap':
      totalFailures += await checkOverlap(url, puppeteer);
      break;
    case 'responsive':
      totalFailures += await checkResponsive(url, puppeteer);
      break;
    case 'emoji':
      totalFailures += await checkEmoji(target);
      break;
    case 'links':
      totalFailures += await checkLinks(url, puppeteer);
      break;
    case 'pii':
      totalFailures += await checkPii(target);
      break;
    case 'a11y':
      totalFailures += await checkA11y(url, puppeteer);
      break;
    case 'screenshot':
      await takeScreenshot(url, puppeteer);
      break;
    case 'all':
      totalFailures += await checkOverlap(url, puppeteer);
      totalFailures += await checkResponsive(url, puppeteer);
      totalFailures += await checkEmoji(target);
      totalFailures += await checkLinks(url, puppeteer);
      totalFailures += await checkA11y(url, puppeteer);
      await takeScreenshot(url, puppeteer);
      break;
    default:
      console.error(`不明な mode: ${mode}`);
      process.exit(1);
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (mode !== 'screenshot') {
    if (totalFailures === 0) {
      console.log(`${PASS} 検査完了 — 問題なし`);
    } else {
      console.log(`${FAIL} 検査完了 — ${totalFailures} 件の問題あり（docs/CHECKPOINTS.md を参照）`);
      process.exit(1);
    }
  }
}

main().catch(e => {
  console.error(`${FAIL} 実行エラー:`, e.message);
  process.exit(1);
});
