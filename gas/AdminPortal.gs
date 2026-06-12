/**
 * AdminPortal.gs — 管理者ポータル（GAS Web アプリ）
 * SPEC: docs/SPEC_admin_portal.md
 *
 * 方針:
 * - Code.gs の CONFIG（github.owner/repo/branch/apiBase/masterPath, props.*）を再利用する
 * - GitHub の contents API（GET sha → PUT）を本ファイル内で自前実装し、association.json /
 *   theme.json のように Code.gs に専用ヘルパーが無いパスにも対応する
 * - 全サーバー関数は try/catch で {ok:true, data} / {ok:false, error} の形に統一して返す
 * - 秘密値（GITHUB_TOKEN 全文・フォルダ ID 全文）はクライアントへ返さない（マスク or 有無のみ）
 *
 * Code.gs から再利用しているもの:
 * - グローバル定数 CONFIG（github 設定・props キー）
 * - PropertiesService / DriveApp / UrlFetchApp / Utilities / ScriptApp（GAS 標準）
 *   ※ Code.gs の pushToGitHub は固定コミットメッセージ・戻り値なしのため、
 *     本ポータルでは read が必要・カスタムメッセージが必要なので自前 GET/PUT を使う。
 */

// ============================================================
// doGet — Web アプリのエントリポイント
// ============================================================
function doGet() {
  return HtmlService.createTemplateFromFile('portal')
    .evaluate()
    .setTitle('レガッタ速報キット 管理者ポータル')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ============================================================
// 内部ヘルパー（クライアントへ公開しない: 末尾 _）
// ============================================================

/** Script Properties を取得 */
function portalProps_() {
  return PropertiesService.getScriptProperties();
}

/** 値を先頭 N 文字 + *** にマスク（無ければ空文字） */
function portalMask_(value, head) {
  if (!value) return '';
  var n = head || 4;
  if (value.length <= n) return value.charAt(0) + '***';
  return value.substring(0, n) + '***';
}

/** GitHub の owner/repo/token を Script Properties から取得（CONFIG.props を再利用） */
function portalGithubCtx_() {
  var props = portalProps_();
  var owner = props.getProperty('GITHUB_OWNER') || '';
  var repo = props.getProperty('GITHUB_REPO') || '';
  var token = props.getProperty(CONFIG.props.githubToken) || '';
  if (!owner || !repo) throw new Error('GITHUB_OWNER / GITHUB_REPO が未設定です');
  if (!token) throw new Error('GITHUB_TOKEN が未設定です');
  return {
    owner: owner,
    repo: repo,
    token: token,
    branch: CONFIG.github.branch,
    apiBase: CONFIG.github.apiBase,
  };
}

/** contents API の URL を組み立てる */
function portalContentsUrl_(ctx, path) {
  return ctx.apiBase + '/repos/' + ctx.owner + '/' + ctx.repo + '/contents/' + path;
}

/**
 * GitHub contents API: ファイルを取得して {text, sha} を返す。
 * 404 の場合は {text:null, sha:null}（新規作成扱い）。
 */
function portalGithubGet_(ctx, path) {
  var url = portalContentsUrl_(ctx, path) + '?ref=' + encodeURIComponent(ctx.branch);
  var res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: { Authorization: 'token ' + ctx.token, Accept: 'application/vnd.github.v3+json' },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 404) return { text: null, sha: null };
  if (code !== 200) throw new Error('GitHub GET 失敗: HTTP ' + code + ' (' + path + ')');
  var body = JSON.parse(res.getContentText());
  var text = Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, '')))
    .getDataAsString('UTF-8');
  return { text: text, sha: body.sha };
}

/**
 * GitHub contents API: ファイルを PUT（作成 or 更新）する。
 * sha が null なら新規作成。
 */
function portalGithubPut_(ctx, path, contentText, message, sha) {
  var url = portalContentsUrl_(ctx, path);
  var payload = {
    message: message,
    content: Utilities.base64Encode(contentText, Utilities.Charset.UTF_8),
    branch: ctx.branch,
  };
  if (sha) payload.sha = sha;
  var res = UrlFetchApp.fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: 'token ' + ctx.token,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub PUT 失敗: HTTP ' + code + ' (' + path + ')');
  }
  return true;
}

/** Drive 共有 URL からフォルダ ID を抽出。ID 直書きならそのまま返す。 */
function portalExtractFolderId_(input) {
  if (!input) return '';
  var s = String(input).trim();
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  // ?id=... 形式も拾う
  var m2 = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  // すでに ID のみ
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return s;
}

var PORTAL_HEX_RE_ = /^#[0-9A-Fa-f]{6}$/;

// ============================================================
// サーバー関数（全て {ok, data|error} を返す）
// ============================================================

/** 接続設定の現在値をマスク済みで返す（GITHUB_TOKEN は有無のみ） */
function portalGetSettings() {
  try {
    var props = portalProps_();
    var driveId = props.getProperty(CONFIG.props.driveFolderId) || '';
    var points = props.getProperty(CONFIG.props.measurementPoints) || '';
    var owner = props.getProperty('GITHUB_OWNER') || '';
    var repo = props.getProperty('GITHUB_REPO') || '';
    var token = props.getProperty(CONFIG.props.githubToken) || '';
    return {
      ok: true,
      data: {
        driveRootFolderId: { masked: portalMask_(driveId), set: !!driveId },
        // 計測ポイントは秘密ではないので素の値を返す（編集に必要）
        measurementPoints: { value: points, set: !!points },
        githubOwner: { masked: portalMask_(owner), set: !!owner },
        githubRepo: { masked: portalMask_(repo), set: !!repo },
        githubToken: { set: !!token },
      },
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * 接続設定を保存。渡されたキーのみ更新。
 * obj: { driveRootFolderId, measurementPoints, githubOwner, githubRepo, githubToken }
 * - driveRootFolderId は URL が貼られたら ID 抽出
 * - githubToken は空文字なら変更しない
 */
function portalSaveSettings(obj) {
  try {
    if (!obj || typeof obj !== 'object') throw new Error('入力が不正です');
    var props = portalProps_();
    var saved = [];

    if (Object.prototype.hasOwnProperty.call(obj, 'driveRootFolderId')) {
      var raw = obj.driveRootFolderId;
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        var id = portalExtractFolderId_(raw);
        props.setProperty(CONFIG.props.driveFolderId, id);
        saved.push('DRIVE_ROOT_FOLDER_ID');
      }
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'measurementPoints')) {
      var mp = obj.measurementPoints;
      if (mp !== null && mp !== undefined && String(mp).trim() !== '') {
        var mpStr = String(mp).trim();
        /* 許可トークン: 500m / 1000m / 1500m / 2000m のカンマ結合のみ受理 */
        var ALLOWED_MP_ = { '500m': 1, '1000m': 1, '1500m': 1, '2000m': 1 };
        var mpTokens = mpStr.split(',').map(function(s) { return s.trim(); });
        for (var mi = 0; mi < mpTokens.length; mi++) {
          if (!ALLOWED_MP_[mpTokens[mi]]) {
            throw new Error('MEASUREMENT_POINTS に不正な値が含まれています: ' + mpTokens[mi]);
          }
        }
        props.setProperty(CONFIG.props.measurementPoints, mpStr);
        saved.push('MEASUREMENT_POINTS');
      }
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'githubOwner')) {
      var ow = obj.githubOwner;
      if (ow !== null && ow !== undefined && String(ow).trim() !== '') {
        props.setProperty('GITHUB_OWNER', String(ow).trim());
        saved.push('GITHUB_OWNER');
      }
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'githubRepo')) {
      var rp = obj.githubRepo;
      if (rp !== null && rp !== undefined && String(rp).trim() !== '') {
        props.setProperty('GITHUB_REPO', String(rp).trim());
        saved.push('GITHUB_REPO');
      }
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'githubToken')) {
      var tk = obj.githubToken;
      // 空なら変更しない（既存トークンを保持）
      if (tk !== null && tk !== undefined && String(tk).trim() !== '') {
        props.setProperty(CONFIG.props.githubToken, String(tk).trim());
        saved.push('GITHUB_TOKEN');
      }
    }
    return { ok: true, data: { saved: saved } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** Drive 疎通テスト: フォルダ名を返す（ID 全文は返さない） */
function portalTestDrive() {
  try {
    var id = portalProps_().getProperty(CONFIG.props.driveFolderId) || '';
    if (!id) throw new Error('DRIVE_ROOT_FOLDER_ID が未設定です');
    var name = DriveApp.getFolderById(id).getName();
    return { ok: true, data: { folderName: name } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** hub/association.json を取得して返す */
function portalGetAssociation() {
  try {
    var ctx = portalGithubCtx_();
    var got = portalGithubGet_(ctx, 'hub/association.json');
    if (got.text === null) {
      return { ok: true, data: { association_name: '', tournaments: [] } };
    }
    var json = JSON.parse(got.text);
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * association.json を保存。
 * json: 文字列 or オブジェクト。tournaments[].id/name/year/status 必須。
 */
function portalSaveAssociation(json) {
  try {
    var obj = (typeof json === 'string') ? JSON.parse(json) : json;
    if (!obj || typeof obj !== 'object') throw new Error('JSON が不正です');
    if (!Array.isArray(obj.tournaments)) throw new Error('tournaments 配列がありません');
    var allowed = { upcoming: 1, live: 1, final: 1 };
    for (var i = 0; i < obj.tournaments.length; i++) {
      var t = obj.tournaments[i];
      if (!t || typeof t !== 'object') throw new Error('tournaments[' + i + '] が不正です');
      if (!t.id || !String(t.id).trim()) throw new Error('tournaments[' + i + '].id が必須です');
      if (!t.name || !String(t.name).trim()) throw new Error('tournaments[' + i + '].name が必須です');
      if (t.year === null || t.year === undefined || String(t.year).trim() === '') {
        throw new Error('tournaments[' + i + '].year が必須です');
      }
      if (!t.status || !allowed[t.status]) {
        throw new Error('tournaments[' + i + '].status は upcoming/live/final のいずれか');
      }
    }
    var ctx = portalGithubCtx_();
    var current = portalGithubGet_(ctx, 'hub/association.json');
    var content = JSON.stringify(obj, null, 2);
    portalGithubPut_(ctx, 'hub/association.json', content,
      '大会情報を更新 [admin portal]', current.sha);
    return { ok: true, data: { count: obj.tournaments.length } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** site/data/theme.json を取得（無ければ既定値） */
function portalGetTheme() {
  try {
    var ctx = portalGithubCtx_();
    var got = portalGithubGet_(ctx, 'site/data/theme.json');
    if (got.text === null) {
      return {
        ok: true,
        data: { primary_color: '#2D4F2C', accent_color: '#C9A227', font_family: 'Noto Sans JP', exists: false },
      };
    }
    var json = JSON.parse(got.text);
    json.exists = true;
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** theme.json を保存。色は #RRGGBB のみ受理。 */
function portalSaveTheme(theme) {
  try {
    var obj = (typeof theme === 'string') ? JSON.parse(theme) : theme;
    if (!obj || typeof obj !== 'object') throw new Error('テーマが不正です');
    if (!PORTAL_HEX_RE_.test(obj.primary_color || '')) {
      throw new Error('primary_color は #RRGGBB 形式で指定してください');
    }
    if (!PORTAL_HEX_RE_.test(obj.accent_color || '')) {
      throw new Error('accent_color は #RRGGBB 形式で指定してください');
    }
    var font = (obj.font_family && String(obj.font_family).trim()) || 'Noto Sans JP';
    var clean = {
      primary_color: obj.primary_color,
      accent_color: obj.accent_color,
      font_family: font,
    };
    var ctx = portalGithubCtx_();
    var current = portalGithubGet_(ctx, 'site/data/theme.json');
    portalGithubPut_(ctx, 'site/data/theme.json', JSON.stringify(clean, null, 2),
      'デザインテーマを更新 [admin portal]', current.sha);
    return { ok: true, data: clean };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** 稼働状態を返す: heartbeat / トリガー有無 / レート制限 */
function portalGetStatus() {
  try {
    var props = portalProps_();
    // トリガー有無（onTrigger ハンドラの存在）
    var triggers = ScriptApp.getProjectTriggers();
    var hasTrigger = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'onTrigger') { hasTrigger = true; break; }
    }
    // レート制限
    var rateLimited = props.getProperty(CONFIG.props.apiRateLimited) === 'true';
    var rateLimitedAt = props.getProperty('API_RATE_LIMITED_AT') || '';
    var lastError = props.getProperty(CONFIG.props.lastError) || '';

    // 最終 heartbeat（master.json の last_trigger_at を GitHub から取得）
    var lastTrigger = '';
    var resultCount = null;
    try {
      var ctx = portalGithubCtx_();
      var got = portalGithubGet_(ctx, CONFIG.github.masterPath);
      if (got.text !== null) {
        var master = JSON.parse(got.text);
        lastTrigger = master.last_trigger_at || '';
        if (master.results && typeof master.results === 'object') {
          resultCount = Array.isArray(master.results)
            ? master.results.length
            : Object.keys(master.results).length;
        }
      }
    } catch (inner) {
      // GitHub 未設定でもトリガー状態だけは返したいので握りつぶす
      lastError = lastError || ('master.json 取得不可: ' + inner.message);
    }

    return {
      ok: true,
      data: {
        lastTriggerAt: lastTrigger,
        hasTrigger: hasTrigger,
        triggerCount: triggers.length,
        rateLimited: rateLimited,
        rateLimitedAt: rateLimitedAt,
        lastError: lastError,
        resultCount: resultCount,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * 進行モデルライブラリを取得し、現在の大会の選択状態も返す。
 * ①自リポジトリの progression/registry.json を GET し models を返す。
 * ②site/data/master.json の現在の progression.template_id を返す。
 * registry が無い場合は models:[] で正常応答。
 */
function portalGetProgression() {
  try {
    var ctx = portalGithubCtx_();

    // ① registry.json を取得
    var registryGot = portalGithubGet_(ctx, 'progression/registry.json');
    var models = [];
    if (registryGot.text !== null) {
      var registry = JSON.parse(registryGot.text);
      if (Array.isArray(registry.models)) {
        models = registry.models.map(function(m) {
          return {
            id:            m.id          || '',
            label:         m.label       || '',
            lanes:         m.lanes       || null,
            entries_range: m.entries_range || null,
            description:   m.description || '',
            explanation:   m.explanation  || '',
          };
        });
      }
    }

    // ② master.json の progression.template_id を取得
    var currentTemplateId = '';
    var masterGot = portalGithubGet_(ctx, CONFIG.github.masterPath);
    if (masterGot.text !== null) {
      var master = JSON.parse(masterGot.text);
      if (master.progression && master.progression.template_id) {
        currentTemplateId = master.progression.template_id;
      }
    }

    return { ok: true, data: { models: models, current_template_id: currentTemplateId } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * master.json の progression フィールドだけを更新する。
 * templateId が空文字または null なら progression フィールドを削除。
 * 他フィールドは絶対に変更しない（JSON を丸ごと parse → 該当キーのみ変更 → stringify）。
 */
function portalSaveProgression(templateId) {
  try {
    var ctx = portalGithubCtx_();

    // master.json を GET
    var got = portalGithubGet_(ctx, CONFIG.github.masterPath);
    var master;
    if (got.text === null) {
      throw new Error('master.json が見つかりません。scaffold を先に実行してください。');
    }
    master = JSON.parse(got.text);

    // progression フィールドのみ変更（他フィールドは一切触らない）
    var tid = (typeof templateId === 'string') ? templateId.trim() : '';
    if (tid) {
      master.progression = { template_id: tid };
    } else {
      delete master.progression;
    }

    var content = JSON.stringify(master, null, 2);
    var msg = tid
      ? ('進行モデルを設定: ' + tid + ' [admin portal]')
      : ('進行モデルを解除 [admin portal]');
    portalGithubPut_(ctx, CONFIG.github.masterPath, content, msg, got.sha);

    return { ok: true, data: { template_id: tid } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * pdf_publisher / judge_form_publisher 用 setupFromConfig 貼り付け JSON 雛形。
 * 値は空文字（実プロパティ値は埋めない）。
 */
function portalConfigJson() {
  try {
    var tmpl = {
      GITHUB_OWNER: '',
      GITHUB_REPO: '',
      GITHUB_TOKEN: '',
      DRIVE_ROOT_FOLDER_ID: '',
      MEASUREMENT_POINTS: '',
    };
    return { ok: true, data: { json: JSON.stringify(tmpl, null, 2) } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
