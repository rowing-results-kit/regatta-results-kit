/**
 * AdminPortal.gs — 管理者ポータル（GAS Web アプリ）
 * SPEC: docs/SPEC_admin_portal.md / docs/SPEC-onboarding-v2.md（W2）
 *
 * 配布方法: このファイルは「コピーを作成」方式で配布する GAS テンプレートの一部です。
 * コードを直接コピー&ペーストする必要はありません。オンボーディングサイトの
 * GAS-A テンプレートリンクから「コピーを作成」してください。
 * 初期設定: プロジェクト設定 → スクリプトプロパティ に以下を追加してください:
 *   DRIVE_ROOT_FOLDER_ID / GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN / MEASUREMENT_POINTS
 *
 * 方針:
 * - Code.gs の CONFIG（github.owner/repo/branch/apiBase/masterPath, props.*）を再利用する
 * - GitHub の contents API（GET sha → PUT）を本ファイル内で自前実装し、association.json /
 *   theme.json のように Code.gs に専用ヘルパーが無いパスにも対応する
 * - 全サーバー関数は try/catch で {ok:true, data|error} の形に統一して返す
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

/**
 * ポータルの所有者メールアドレスを返す。
 * Script Property PORTAL_OWNER_EMAIL が優先。未設定ならスクリプト実行ユーザー
 * （「自分として実行」デプロイではスクリプト所有者本人）を採用する。
 * @return {string}
 */
function portalOwnerEmail_() {
  var configured = PropertiesService.getScriptProperties().getProperty('PORTAL_OWNER_EMAIL');
  if (configured) return String(configured).trim().toLowerCase();
  try {
    return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

/**
 * アクセス者がポータル所有者本人かを判定する（多層防御）。
 *
 * 本来は GAS のデプロイ設定（アクセスできるユーザー = 自分のみ）で守るが、
 * 設定を誤って「全員」にしてしまうとポータルが誰でも操作できてしまう。
 * サーバー側でも所有者照合を行い、設定ミス単独では破られないようにする。
 *
 * 判定:
 *  - アクセス者が特定できて所有者と一致 → 許可
 *  - アクセス者が特定できて所有者と不一致 → 拒否
 *  - アクセス者が特定できない（匿名アクセス = 「全員」公開デプロイ）→ 拒否（fail-closed）
 *
 * @return {{allowed: boolean, reason: string}}
 */
function portalCheckAccess_() {
  var owner = portalOwnerEmail_();
  if (!owner) {
    // 所有者が判定できない状態で開放するのは危険なので拒否する
    return { allowed: false, reason: '所有者アカウントを特定できませんでした。' };
  }

  var active = '';
  try {
    active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    active = '';
  }

  if (!active) {
    return {
      allowed: false,
      reason: 'アクセスしているアカウントを特定できませんでした。ウェブアプリのデプロイ設定が「全員」になっている可能性があります。',
    };
  }
  if (active !== owner) {
    return { allowed: false, reason: 'このポータルは所有者のみが利用できます。' };
  }
  return { allowed: true, reason: '' };
}

/**
 * 所有者本人でなければ例外を投げる。
 *
 * ★ doGet だけの照合では不十分: google.script.run が呼べるのは
 *   「クライアントに配信された HTML」に限らない。Web アプリの URL を知る第三者は
 *   doGet の画面を経由せずサーバー関数を直接叩ける（公開デプロイ時）。
 *   そのため公開サーバー関数（portal* のうち末尾 _ でないもの）は、
 *   すべて冒頭で本関数を呼び、認可を各関数の入口で強制する。
 * @throws {Error} 所有者でない場合
 */
function portalAssertAccess_() {
  var access = portalCheckAccess_();
  if (!access.allowed) {
    Logger.log('[portalAssertAccess_] 認可拒否: ' + access.reason);
    throw new Error('権限がありません。' + access.reason);
  }
}

/**
 * アクセス拒否画面を返す（操作 UI は一切描画しない）
 * @param {string} reason
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function portalDenyPage_(reason) {
  var html =
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>アクセスできません</title></head>' +
    '<body style="margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Yu Gothic\',sans-serif;color:#1F2937;">' +
    '<div style="max-width:640px;margin:0 auto;">' +
    '<h1 style="margin:0 0 16px;font-size:28px;color:#0A1628;">このページは表示できません</h1>' +
    '<p style="margin:0 0 16px;line-height:1.8;">' + portalEscapeHtml_(reason) + '</p>' +
    '<p style="margin:0;line-height:1.8;color:#6B7280;">' +
    '管理者の方へ: GAS エディタの「デプロイ」→「デプロイを管理」で、' +
    '「次のユーザーとして実行」を<strong>自分</strong>、「アクセスできるユーザー」を<strong>自分のみ</strong>に設定してください。' +
    '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('アクセスできません');
}

/** HTML エスケープ（拒否画面用） */
function portalEscapeHtml_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function doGet() {
  // 多層防御: デプロイ設定に加えてサーバー側でも所有者照合する
  var access = portalCheckAccess_();
  if (!access.allowed) {
    Logger.log('[doGet] アクセス拒否: ' + access.reason);
    return portalDenyPage_(access.reason);
  }

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

/**
 * GitHub リポジトリ URL から {owner, repo} を抽出する。
 * 入力: "https://github.com/<owner>/<repo>" またはowner/repo形式（後方互換）
 * 戻り値: {owner:string, repo:string} または null（不正URL時）
 */
function extractOwnerRepoFromUrl(input) {
  if (!input) return null;
  var s = String(input).trim();
  // https://github.com/<owner>/<repo>[.git][/...]
  var m = s.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[?#].*)?$/);
  if (m) return { owner: m[1], repo: m[2] };
  // owner/repo 形式（後方互換）
  var m2 = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (m2) return { owner: m2[1], repo: m2[2] };
  return null;
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    // GitHub URL 一括入力（主動線）
    if (Object.prototype.hasOwnProperty.call(obj, 'githubRepoUrl')) {
      var rawUrl = obj.githubRepoUrl;
      if (rawUrl !== null && rawUrl !== undefined && String(rawUrl).trim() !== '') {
        var parsed = extractOwnerRepoFromUrl(String(rawUrl).trim());
        if (!parsed) {
          throw new Error('GitHub URL の形式が正しくありません。「https://github.com/アカウント名/リポジトリ名」の形で貼り付けてください。');
        }
        props.setProperty('GITHUB_OWNER', parsed.owner);
        props.setProperty('GITHUB_REPO', parsed.repo);
        saved.push('GITHUB_OWNER');
        saved.push('GITHUB_REPO');
      }
    }
    // 個別入力（後方互換）— githubRepoUrl が未指定の場合のみ適用
    if (Object.prototype.hasOwnProperty.call(obj, 'githubOwner') &&
        !Object.prototype.hasOwnProperty.call(obj, 'githubRepoUrl')) {
      var ow = obj.githubOwner;
      if (ow !== null && ow !== undefined && String(ow).trim() !== '') {
        props.setProperty('GITHUB_OWNER', String(ow).trim());
        saved.push('GITHUB_OWNER');
      }
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'githubRepo') &&
        !Object.prototype.hasOwnProperty.call(obj, 'githubRepoUrl')) {
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

// ============================================================
// GitHub 接続テスト（SPEC-onboarding-v2 W2）
// ============================================================

/**
 * GitHub 接続テスト。
 * リポジトリメタデータを GET して認証・到達性を確認する。
 * 戻り値: {ok:true, data:{repo, private, patExpiresAt}} / {ok:false, error:<日本語説明>}
 *
 * エラー判別:
 *   401 → PAT が無効または期限切れ
 *   404 → GITHUB_OWNER / GITHUB_REPO が誤り
 *   その他 → HTTP ステータスをそのまま表示
 */
function portalTestGitHub() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
    var ctx = portalGithubCtx_();
    var url = ctx.apiBase + '/repos/' + ctx.owner + '/' + ctx.repo;
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: 'token ' + ctx.token,
        Accept: 'application/vnd.github.v3+json',
      },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();

    // PAT 期限をレスポンスヘッダーから取得してキャッシュ
    var patExpiresAt = '';
    try {
      var expHeader = res.getHeaders()['github-authentication-token-expiration'] || '';
      if (expHeader) {
        patExpiresAt = expHeader;
        portalProps_().setProperty('PAT_EXPIRES_AT', patExpiresAt);
      }
    } catch (hErr) {
      // ヘッダー取得失敗は無視
    }

    if (code === 200) {
      var body = JSON.parse(res.getContentText());
      return {
        ok: true,
        data: {
          repo: body.full_name,
          private: body.private,
          patExpiresAt: patExpiresAt,
        },
      };
    }
    if (code === 401) {
      return {
        ok: false,
        error: 'GITHUB_TOKEN が無効または期限切れです。\n' +
          '【直し方】GitHub → Settings → Developer settings → Personal access tokens で' +
          '新しいトークンを生成し、スクリプトプロパティの GITHUB_TOKEN に貼り直してください。',
      };
    }
    if (code === 404) {
      return {
        ok: false,
        error: 'リポジトリが見つかりません（HTTP 404）。\n' +
          '【直し方】スクリプトプロパティの GITHUB_OWNER と GITHUB_REPO を確認してください。' +
          '大文字小文字・スペルを GitHub リポジトリ URL と一文字ずつ照合してください。',
      };
    }
    if (code === 403) {
      return {
        ok: false,
        error: 'アクセス権限がありません（HTTP 403）。\n' +
          '【直し方】PAT に Repository permissions → Contents: Read and Write が付いているか確認してください。',
      };
    }
    return { ok: false, error: 'GitHub から予期しないエラーが返りました（HTTP ' + code + '）。しばらく待ってから再試行してください。' };
  } catch (e) {
    return { ok: false, error: '通信エラー: ' + String(e && e.message ? e.message : e) };
  }
}

/**
 * PAT 期限情報を取得。キャッシュ（PAT_EXPIRES_AT プロパティ）を優先し、
 * 空の場合は /user エンドポイントで確認してキャッシュする。
 * 戻り値: {ok:true, data:{patExpiresAt, daysLeft, status}}
 *   status: 'ok' | 'warn' (≤30日) | 'danger' (≤14日) | 'unknown'
 */
function portalGetPatExpiry() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
    var props = portalProps_();
    var cached = props.getProperty('PAT_EXPIRES_AT') || '';
    var patExpiresAt = cached;

    if (!patExpiresAt) {
      // キャッシュ未設定の場合は /user で疎通しつつヘッダーを拾う
      try {
        var token = props.getProperty(CONFIG.props.githubToken) || '';
        if (token) {
          var res = UrlFetchApp.fetch(CONFIG.github.apiBase + '/user', {
            method: 'GET',
            headers: {
              Authorization: 'token ' + token,
              Accept: 'application/vnd.github.v3+json',
            },
            muteHttpExceptions: true,
          });
          if (res.getResponseCode() === 200) {
            var expHeader = res.getHeaders()['github-authentication-token-expiration'] || '';
            if (expHeader) {
              patExpiresAt = expHeader;
              props.setProperty('PAT_EXPIRES_AT', patExpiresAt);
            }
          }
        }
      } catch (inner) {
        // 取得失敗は unknown 扱い
      }
    }

    if (!patExpiresAt) {
      return { ok: true, data: { patExpiresAt: '', daysLeft: null, status: 'unknown' } };
    }

    var expDate = new Date(patExpiresAt);
    var now = new Date();
    var daysLeft = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    var status = daysLeft <= 14 ? 'danger' : (daysLeft <= 30 ? 'warn' : 'ok');
    return { ok: true, data: { patExpiresAt: patExpiresAt, daysLeft: daysLeft, status: status } };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** Drive 疎通テスト: フォルダ名を返す（ID 全文は返さない） */
function portalTestDrive() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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

/**
 * GitHub contents API: ディレクトリ配下のファイル一覧を返す。
 * ファイルではなくディレクトリを指すため、portalGithubGet_（base64 デコード前提）とは別実装。
 * @return {Array} contents API のエントリ配列（404 の場合は空配列）
 */
function portalGithubListDir_(ctx, path) {
  var url = portalContentsUrl_(ctx, path) + '?ref=' + encodeURIComponent(ctx.branch);
  var res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: { Authorization: 'token ' + ctx.token, Accept: 'application/vnd.github.v3+json' },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 404) return [];
  if (code !== 200) throw new Error('GitHub GET 失敗: HTTP ' + code + ' (' + path + ')');
  var body = JSON.parse(res.getContentText());
  if (!Array.isArray(body)) throw new Error('ディレクトリではありません: ' + path);
  return body;
}

/**
 * 公開済みレース結果 JSON の件数を GitHub から取得する。
 * master.json には results フィールドが存在しないため、
 * site/data/results/ の race_NNN.json を実際に数える。
 * @return {number} 件数
 */
function portalCountResultJson_(ctx) {
  var entries = portalGithubListDir_(ctx, CONFIG.github.resultsPath);
  return entries.filter(function(entry) {
    return entry && entry.type === 'file' && /^race_\d+\.json$/i.test(entry.name || '');
  }).length;
}

/** 稼働状態を返す: heartbeat / トリガー有無 / レート制限 */
function portalGetStatus() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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

    // 最終成功時刻（onTrigger 正常完了で更新）— 直近エラーが「今も継続中」か
    // 「復旧済みの古いエラー」かを画面で区別するために使う
    var lastSuccessAt = props.getProperty(CONFIG.props.lastSuccessAt) || '';

    // 直近エラー履歴（新しい順・最大 CONFIG.errorHistorySize 件）
    var errorHistory = [];
    try {
      var rawHistory = props.getProperty(CONFIG.props.errorHistory);
      if (rawHistory) {
        var parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) errorHistory = parsed;
      }
    } catch (histErr) {
      errorHistory = [];
    }

    // 最終 heartbeat（master.json の last_trigger_at を GitHub から取得）
    var lastTrigger = '';
    var resultCount = null;
    try {
      var ctx = portalGithubCtx_();
      var got = portalGithubGet_(ctx, CONFIG.github.masterPath);
      if (got.text !== null) {
        var master = JSON.parse(got.text);
        lastTrigger = master.last_trigger_at || '';
      }
      // 結果 JSON 数は master.json ではなく site/data/results/ の実ファイル数を数える
      // （master.results は存在しないフィールドで、常に「—」表示になっていた）
      try {
        resultCount = portalCountResultJson_(ctx);
      } catch (countErr) {
        resultCount = null; // 画面では「取得不可」と表示する
        Logger.log('[portalGetStatus] 結果JSON数の取得に失敗: ' + countErr.message);
      }
    } catch (inner) {
      // GitHub 未設定でもトリガー状態だけは返したいので握りつぶす
      lastError = lastError || ('master.json 取得不可: ' + inner.message);
    }

    // PAT 期限（キャッシュ優先）
    var patExpiresAt = props.getProperty('PAT_EXPIRES_AT') || '';
    var patDaysLeft = null;
    var patStatus = 'unknown';
    if (patExpiresAt) {
      var expDate = new Date(patExpiresAt);
      var now = new Date();
      patDaysLeft = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      patStatus = patDaysLeft <= 14 ? 'danger' : (patDaysLeft <= 30 ? 'warn' : 'ok');
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
        lastSuccessAt: lastSuccessAt,
        errorHistory: errorHistory,
        resultCount: resultCount,
        patExpiresAt: patExpiresAt,
        patDaysLeft: patDaysLeft,
        patStatus: patStatus,
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
 * 初期セットアップを実行する（冪等）。
 * ① Drive サブフォルダ作成（createDriveFolderStructure_ 相当）
 * ② onTrigger の 2分タイマートリガー設定（既存があれば作成しない）
 *
 * 実行コンテキスト: doGet → HtmlService 経由。
 * デプロイ設定「次のユーザーとして実行: 自分」が前提。
 * ScriptApp.newTrigger はオーナーとして実行されるため権限が付与される。
 *
 * 戻り値: { ok, data: { folderResult, triggerResult } }
 *   folderResult: '✅ フォルダ作成済み（既存）' | '✅ フォルダを新規作成しました'
 *   triggerResult: '✅ 自動更新 稼働開始' | '✅ 自動更新 すでに稼働中'
 */
function portalInitialSetup() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
    var props = PropertiesService.getScriptProperties();
    var results = {};

    // ① Drive サブフォルダ作成
    var rootFolderId = props.getProperty(CONFIG.props.driveFolderId);
    if (!rootFolderId) {
      return { ok: false, error: 'DRIVE_ROOT_FOLDER_ID が未設定です。先に「接続設定」タブで Drive フォルダを設定してください。' };
    }
    try {
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var measurementPointsStr = props.getProperty(CONFIG.props.measurementPoints) || '500m,1000m';
      var points = measurementPointsStr.split(',').map(function(p) { return p.trim(); });

      var subFolders = ['master', 'race_csv', 'processed'];
      var createdAny = false;

      subFolders.forEach(function(name) {
        var iter = rootFolder.getFoldersByName(name);
        var folder;
        if (iter.hasNext()) {
          folder = iter.next();
        } else {
          folder = rootFolder.createFolder(name);
          createdAny = true;
        }
        // race_csv / processed 配下に計測ポイントサブフォルダ
        if (name === 'race_csv' || name === 'processed') {
          points.forEach(function(pt) {
            var ptIter = folder.getFoldersByName(pt);
            if (!ptIter.hasNext()) {
              folder.createFolder(pt);
              createdAny = true;
            }
          });
        }
      });

      results.folderResult = createdAny
        ? '✅ Drive サブフォルダを作成しました'
        : '✅ Drive サブフォルダ作成済み（既存）';
    } catch (driveErr) {
      return { ok: false, error: 'Drive フォルダ作成中にエラー: ' + String(driveErr.message) };
    }

    // ② onTrigger の 2分タイマートリガー設定（冪等）
    var triggers = ScriptApp.getProjectTriggers();
    var hasTrigger = triggers.some(function(t) {
      return t.getHandlerFunction() === 'onTrigger';
    });

    if (hasTrigger) {
      results.triggerResult = '✅ 自動更新 すでに稼働中';
    } else {
      ScriptApp.newTrigger('onTrigger')
        .timeBased()
        .everyMinutes(2)
        .create();
      results.triggerResult = '✅ 自動更新 稼働開始（2分ごと）';
    }

    return { ok: true, data: results };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * onTrigger の 2分タイマートリガーを設定する（冪等）。
 * 「状態」タブの「開始する」ボタン用。
 */
function portalStartTrigger() {
  try {
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
    var triggers = ScriptApp.getProjectTriggers();
    var hasTrigger = triggers.some(function(t) {
      return t.getHandlerFunction() === 'onTrigger';
    });
    if (hasTrigger) {
      return { ok: true, data: { message: '✅ 自動更新 すでに稼働中' } };
    }
    ScriptApp.newTrigger('onTrigger')
      .timeBased()
      .everyMinutes(2)
      .create();
    return { ok: true, data: { message: '✅ 自動更新 稼働開始（2分ごと）' } };
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
    portalAssertAccess_(); // 認可: 所有者以外は google.script.run 直接呼び出しでも実行させない
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
