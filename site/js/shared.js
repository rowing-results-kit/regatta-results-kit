/**
 * RegattaShared — フロント共通定数・共通関数の正本
 *
 * 読み込み順: このファイルを app.js・インラインJSより必ず先に読み込むこと。
 * 参照方法: window.RegattaShared.h() / RegattaShared.ROUND_NAMES / etc.
 * キャッシュ: /js/* は max-age=86400 のため、変更時は ?v=YYYYMMDDX クエリ必須。
 *
 * v20260612a
 */

(function(global) {
  'use strict';

  // ========= XSSエスケープ =========
  // app.js:26 / admin:788 の重複 h() を一本化。
  /**
   * HTMLエスケープ（XSS対策）
   * @param {*} str
   * @returns {string}
   */
  function h(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ========= ラウンド表示名 =========
  // app.js CONFIG.ROUND_NAMES / admin:763 の重複を一本化。
  const ROUND_NAMES = {
    FA: '決勝A', FB: '決勝B', SF: '準決勝',
    H: '予選', RK: '順位決定', R: '敗者復活'
  };

  // ========= localStorageキー定数 =========
  // v3キー（SPEC §4）。v2キー削除は master.json fetch成功後のみ実施（オフライン保護）。
  const LS_MASTER_KEY    = 'regatta_master_v3';
  const LS_RESULT_PREFIX = 'regatta_result_v3_';
  // v2旧キー（削除用参照のみ。fetch成功後に app.js 側で削除）
  const LS_MASTER_KEY_V2    = 'regatta_master_v2';
  const LS_RESULT_PREFIX_V2 = 'regatta_result_v2_';

  // ========= データパス解決 =========
  /**
   * basePath から master.json / results/ のパスオブジェクトを返す。
   *   index.html  → basePath = ''
   *   admin/__ADMIN_PATH__/ → basePath = '../../'
   *
   * @param {string} basePath - 末尾スラッシュあり or '' を許容
   * @returns {{ master: string, resultDir: string, result: (no: number) => string }}
   */
  function paths(basePath) {
    const trimmed = (basePath || '').replace(/\/?$/, '');
    const base = trimmed === '' ? '' : trimmed + '/';
    const master    = base + 'data/master.json';
    const resultDir = base + 'data/results/';
    const result    = (no) => resultDir + 'race_' + String(no).padStart(3, '0') + '.json';
    return { master, resultDir, result };
  }

  // ========= fetchJSON =========
  /**
   * JSONをfetchしてパースする。
   * cacheMode: 初回ロードは 'default'（ブラウザキャッシュ利用）、強制更新は 'no-cache'
   *
   * @param {string} path
   * @param {number} timeoutMs
   * @param {string} cacheMode
   * @returns {Promise<any>}
   */
  function fetchJSON(path, timeoutMs, cacheMode) {
    timeoutMs = timeoutMs !== undefined ? timeoutMs : 25000;
    cacheMode = cacheMode !== undefined ? cacheMode : 'no-cache';
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
    return fetch(path, { signal: controller.signal, cache: cacheMode })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + path);
        return res.text();
      })
      .then(function(text) {
        clearTimeout(timer);
        return JSON.parse(text);
      })
      .catch(function(e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('タイムアウト: ' + path);
        throw e;
      });
  }

  // ========= fetchJSONWithRetry =========
  /**
   * リトライ付きfetch（最大maxRetries回、失敗時は再試行）
   * app.js の fetchJSONWithRetry 相当を shared.js に移して両者で使う（R3）。
   *
   * @param {string} path
   * @param {number} maxRetries
   * @param {number} timeoutMs
   * @returns {Promise<any>}
   */
  function fetchJSONWithRetry(path, maxRetries, timeoutMs) {
    maxRetries = maxRetries !== undefined ? maxRetries : 3;
    timeoutMs  = timeoutMs  !== undefined ? timeoutMs  : 25000;

    function attempt(n) {
      return fetchJSON(path, timeoutMs, 'no-cache').catch(function(e) {
        if ((e.message || '').indexOf('HTTP 404') !== -1) throw e;
        if (n < maxRetries) {
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(attempt(n + 1)); }, 1000 * n);
          });
        }
        throw e;
      });
    }
    return attempt(1);
  }

  // ========= hex カラー操作ヘルパー =========
  // NOTE: portal.html のデザインタブプレビューに同一実装をコピーしている。
  //       変更時は両方を必ず更新すること（shared.js ↔ portal.html applyPreview）。

  /**
   * "#RRGGBB" → {r, g, b}
   * @param {string} hex
   * @returns {{r:number, g:number, b:number}|null}
   */
  function hexToRgb(hex) {
    var m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  /**
   * {r, g, b} → "#RRGGBB"
   * @param {{r:number, g:number, b:number}} rgb
   * @returns {string}
   */
  function toHex(rgb) {
    function c(n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2); }
    return '#' + c(rgb.r) + c(rgb.g) + c(rgb.b);
  }

  /**
   * 2色を ratio で線形補間（ratio=0 → colorA, ratio=1 → colorB）
   * @param {string} colorA  "#RRGGBB"
   * @param {string} colorB  "#RRGGBB"
   * @param {number} ratio   0.0 〜 1.0
   * @returns {string} "#RRGGBB"
   */
  function mix(colorA, colorB, ratio) {
    var a = hexToRgb(colorA), b = hexToRgb(colorB);
    if (!a || !b) return colorA;
    return toHex({
      r: a.r + (b.r - a.r) * ratio,
      g: a.g + (b.g - a.g) * ratio,
      b: a.b + (b.b - a.b) * ratio
    });
  }

  // ヘッダー帯はグラデーション禁止（design-rules.json: no-generic-gradient）のため、
  // primary_color をそのまま単色で使う。
  // 旧 buildHeaderGradient() は linear-gradient(160deg, ...) を組み立てて --header-bg に
  // 注入しており、CSS 側の単色化（style.css の背景指定）を実行時に上書きしていた。
  // 濃淡計算が不要になったため関数ごと削除し、applyTheme から primary を直接設定する。

  // ========= theme.json 適用 =========
  /**
   * basePath 配下の data/theme.json を fetch し、CSS 変数 / font_family を適用する。
   *
   * - タイムアウト 5 秒。失敗（ネットワーク・404・タイムアウト等）は黙って無視し既定色を維持。
   * - 色値は ^#[0-9A-Fa-f]{6}$ のみ受理（それ以外は無視 = インジェクション防止）。
   * - font_family は [\w\s,'\-]+ のみ受理。
   * - theme.json が存在しない（404）場合は何も変更しない（既定維持）。
   *
   * primary_color 指定時は以下の CSS 変数をまとめて上書きする:
   *   --color-primary  … ブランドプライマリ色
   *   --header-bg      … ヘッダー帯の背景（primary の単色。グラデーション禁止のため濃淡計算なし）
   *   --accent-light   … primary を 12% ライトニング
   *   --accent-bg      … primary と #FFFFFF の 88% ミックス
   *
   * index.html 側から呼び出す（shared.js 内の自動実行は禁止 — admin テンプレにも効くため）:
   *   RegattaShared.applyTheme('')          // 速報サイト (basePath = '')
   *   RegattaShared.applyTheme('../../')    // admin テンプレページ
   *
   * @param {string} basePath
   * @returns {Promise<void>}
   */
  function applyTheme(basePath) {
    var trimmed = (basePath || '').replace(/\/?$/, '');
    var base = trimmed === '' ? '' : trimmed + '/';
    var url = base + 'data/theme.json';

    var COLOR_RE  = /^#[0-9A-Fa-f]{6}$/;
    var FONT_RE   = /^[\w\s,'\-]+$/;

    return fetchJSON(url, 5000, 'no-cache')
      .then(function(theme) {
        if (!theme || typeof theme !== 'object') return;
        var root = document.documentElement;
        if (COLOR_RE.test(theme.primary_color)) {
          var p = theme.primary_color;
          root.style.setProperty('--color-primary', p);
          // グラデーション禁止のため primary をそのまま単色で適用する
          root.style.setProperty('--header-bg', p);
          root.style.setProperty('--accent-light', mix(p, '#FFFFFF', 0.12));
          root.style.setProperty('--accent-bg',    mix(p, '#FFFFFF', 0.88));
        }
        if (COLOR_RE.test(theme.accent_color)) {
          root.style.setProperty('--color-accent', theme.accent_color);
        }
        if (theme.font_family && FONT_RE.test(theme.font_family)) {
          document.body.style.fontFamily = theme.font_family + ', sans-serif';
        }
      })
      .catch(function() {
        // 失敗は黙って無視 — 既定色を維持
      });
  }

  // ========= 公開 =========
  global.RegattaShared = {
    h: h,
    ROUND_NAMES: ROUND_NAMES,
    LS_MASTER_KEY: LS_MASTER_KEY,
    LS_RESULT_PREFIX: LS_RESULT_PREFIX,
    LS_MASTER_KEY_V2: LS_MASTER_KEY_V2,
    LS_RESULT_PREFIX_V2: LS_RESULT_PREFIX_V2,
    paths: paths,
    fetchJSON: fetchJSON,
    fetchJSONWithRetry: fetchJSONWithRetry,
    applyTheme: applyTheme,
  };

})(window);
