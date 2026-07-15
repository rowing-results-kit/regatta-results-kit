/**
 * ============================================================
 *  マスターズ判定員帳票生成 — 帳票生成ウェブアプリ (WebApp.gs)
 *
 *  目的:
 *    判定員用帳票の生成を、GAS エディタを開かずにブラウザのボタンから
 *    実行できるようにする。
 *    （従来はスクリプトエディタで関数を手動実行する必要があった）
 *
 *  使い方:
 *    「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」でデプロイし、
 *    表示された URL を開く。詳細は セットアップガイド.html を参照。
 *
 *  安全性:
 *    デプロイ設定に加え、サーバー側でも所有者本人かを照合する（多層防御）。
 * ============================================================
 */

// ============================================================
//  アクセス制御（多層防御）
// ============================================================

/**
 * このアプリの所有者メールアドレスを返す。
 * Script Property WEBAPP_OWNER_EMAIL が優先。未設定なら「自分として実行」時の
 * 実行ユーザー（＝スクリプト所有者）を採用する。
 * @return {string}
 */
function webappOwnerEmail_() {
  var configured = PropertiesService.getScriptProperties().getProperty('WEBAPP_OWNER_EMAIL');
  if (configured) return String(configured).trim().toLowerCase();
  try {
    return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

/**
 * アクセス者が所有者本人かを判定する。
 * アクセス者を特定できない場合（＝「全員」公開デプロイ）は拒否する（fail-closed）。
 * @return {{allowed: boolean, reason: string}}
 */
function webappCheckAccess_() {
  var owner = webappOwnerEmail_();
  if (!owner) return { allowed: false, reason: '所有者アカウントを特定できませんでした。' };

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
  if (active !== owner) return { allowed: false, reason: 'このページは所有者のみが利用できます。' };
  return { allowed: true, reason: '' };
}

/** HTML エスケープ（拒否画面用） */
function webappEscapeHtml_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 所有者本人でなければ例外を投げる。
 *
 * ★ doGet だけの照合では不十分: Web アプリの URL を知る第三者は、doGet の画面を
 *   経由せず google.script.run 相当でサーバー関数を直接呼べる（公開デプロイ時）。
 *   帳票生成は Drive への書き込みを伴うため、各公開関数の入口で認可を強制する。
 * @throws {Error} 所有者でない場合
 */
function webappAssertAccess_() {
  var access = webappCheckAccess_();
  if (!access.allowed) {
    Logger.log('[webappAssertAccess_] 認可拒否: ' + access.reason);
    throw new Error('権限がありません。' + access.reason);
  }
}

/** アクセス拒否画面 */
function webappDenyPage_(reason) {
  var html =
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>アクセスできません</title></head>' +
    '<body style="margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Yu Gothic\',sans-serif;color:#1F2937;">' +
    '<div style="max-width:640px;margin:0 auto;">' +
    '<h1 style="margin:0 0 16px;font-size:28px;color:#0A1628;">このページは表示できません</h1>' +
    '<p style="margin:0 0 16px;line-height:1.8;">' + webappEscapeHtml_(reason) + '</p>' +
    '<p style="margin:0;line-height:1.8;color:#6B7280;">' +
    '管理者の方へ: GAS エディタの「デプロイ」→「デプロイを管理」で、' +
    '「次のユーザーとして実行」を<strong>自分</strong>、「アクセスできるユーザー」を<strong>自分のみ</strong>に設定してください。' +
    '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('アクセスできません');
}

// ============================================================
//  エントリポイント
// ============================================================

function doGet() {
  var access = webappCheckAccess_();
  if (!access.allowed) {
    Logger.log('[doGet] アクセス拒否: ' + access.reason);
    return webappDenyPage_(access.reason);
  }
  return HtmlService.createHtmlOutputFromFile('webapp')
    .setTitle('マスターズ判定員帳票生成')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ============================================================
//  クライアントから呼ばれるサーバー関数
//  （必ず {ok, message} 形式で返す。例外は投げない）
// ============================================================

/**
 * 大会日程の一覧を返す（日付選択プルダウン用）。
 * @return {{ok: boolean, dates: string[], message: string}}
 */
function webappGetDates() {
  try {
    webappAssertAccess_(); // 認可: 所有者以外はサーバー関数の直接呼び出しでも実行させない
    var config = getConfig_();
    var masterData = fetchMasterData_(config);
    var dates = getTournamentDates_(masterData);
    return { ok: true, dates: dates, message: '' };
  } catch (e) {
    return { ok: false, dates: [], message: String(e && e.message ? e.message : e) };
  }
}

/**
 * 判定員帳票の生成を実行する。
 * @param {string} action - 'allDays' | 'oneDay'
 * @param {string} dateStr - 'oneDay' のみ使用（'YYYY/MM/DD'）
 * @return {{ok: boolean, message: string}}
 */
function webappRunAction(action, dateStr) {
  try {
    webappAssertAccess_(); // 認可: 所有者以外はサーバー関数の直接呼び出しでも実行させない
    switch (action) {
      case 'allDays':
        generateAllJudgeForms();
        return { ok: true, message: '全日程の判定員帳票を作成しました。Drive の出力フォルダを確認してください。' };

      case 'oneDay':
        if (!dateStr) return { ok: false, message: '日付を選んでください。' };
        generateJudgeFormForDate(dateStr);
        return { ok: true, message: dateStr + ' の判定員帳票を作成しました。Drive の出力フォルダを確認してください。' };

      default:
        return { ok: false, message: '不明な操作です: ' + action };
    }
  } catch (e) {
    return { ok: false, message: 'エラー: ' + String(e && e.message ? e.message : e) };
  }
}
