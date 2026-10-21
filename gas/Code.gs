/**
 * 질문 기차 게임 · 구글 시트 버전 — 서버 코드 (Google Apps Script)
 *
 * 이 코드 하나로 두 가지 서버를 만들 수 있어요.
 *  ■ 내 구글 시트 (기본): 선생님 한 명이 자기 반 수업에 써요. 선생님 비밀번호로 지켜요.
 *      질문 기록은 선생님이 지우기 전까지 '질문 기록' 탭에 남아요.
 *  ■ 체험 서버: 개발진이 한 번 배포해 두고, 여러 선생님이 아무 설정 없이 써 봐요.
 *      편집기에서 setupTrialServer 함수를 한 번 실행하면 체험 서버가 돼요.
 *      선생님마다 브라우저에 자동으로 생기는 열쇠로 자기 게임만 다루고, 기록은 하루 뒤 지워져요.
 *
 * 내 구글 시트 만들기 (사본 만들기 링크를 쓰지 않을 때)
 *  1. 구글 시트를 새로 만들고 [확장 프로그램 → Apps Script]를 열어요.
 *  2. 원래 내용을 모두 지우고 이 파일 내용을 붙여 넣은 뒤 저장해요.
 *  3. [배포 → 새 배포 → 웹 앱] (실행: 나 / 액세스 권한: 모든 사용자) → [액세스 승인]
 *  4. 웹 앱 URL(…/exec)을 게임 사이트의 '선생님 설정' 화면에 붙여 넣어요.
 *
 * 편집기에서 직접 실행하는 함수
 *  - setup               : 시트 탭을 만들어요. (사본 시트에는 이미 있어서 안 해도 돼요)
 *  - setupTemplate       : [개발진] 선생님들이 복사해 갈 '사본용 원본 시트'를 준비해요. 이 시트는 배포하지 마세요.
 *  - setupTrialServer    : [개발진] 이 시트를 '체험 서버'로 바꿔요. 사본용 원본 시트에서는 실행하지 마세요.
 *  - resetTeacherPassword: 선생님 비밀번호를 잊었을 때 지워요.
 *
 * 이 스크립트는 연결된 이 시트 한 개에만 접근해요.
 * @OnlyCurrentDoc
 */

var APP_VERSION = '1.1.0';
var Q_SHEET = '질문 기록';
var P_SHEET = '사진 저장소';
var G_SHEET = '처음 안내';
var Q_HEAD = ['게임 코드', '판', '모둠', '칸', '질문', '쓴 사람', '붙인 시각', '사진', '저장 시각'];
var P_HEAD = ['게임 코드', '조각', '내용'];
var GAME_TTL_MS = 7 * 24 * 3600 * 1000; // 내 구글 시트: 게임 진행 정보는 7일 뒤 정리 (질문 기록은 남김)
var TRIAL_TTL_MS = 24 * 3600 * 1000; // 체험 서버: 게임과 질문 기록 모두 하루 뒤 지움
var TRIAL_LIMIT = { gamesPerTeacher: 6, gamesTotal: 150 };
var START_LEAD_MS = 5000; // 시작 버튼을 누르고 실제로 출발하기까지 (모든 태블릿이 같은 순간에 출발하도록)
var RESUME_LEAD_MS = 4500; // 잠깐 멈춤 뒤 다시 출발하기까지
var CHUNK_SIZE = 45000; // 시트 칸 하나에 넣을 사진 조각 크기 (칸 하나는 5만 글자까지)
var MAX_PHOTO_CHARS = 1400000;
var CACHE_SEC = 21600; // 캐시는 6시간까지
var CLEANUP_EVERY_MS = 15 * 60 * 1000;
var TIME_ZONE = 'Asia/Seoul'; // 시트에 적는 시각의 기준 (한국 시간)
var LIMIT = { groupsMin: 2, groupsMax: 8, members: 8, name: 8, text: 100, cars: 200 };

// ════════════════════════════════════════════════
// 편집기에서 직접 실행하는 함수
// ════════════════════════════════════════════════

/** 시트 탭('질문 기록', '사진 저장소')을 만들어요. */
function setup() {
  ensureSheets();
  Logger.log('준비 완료! 이제 [배포 → 새 배포 → 웹 앱]으로 배포해 주세요.');
}

/** [개발진] 선생님들이 '사본 만들기'로 복사해 갈 원본 시트를 준비해요. */
function setupTemplate() {
  if (isShared()) {
    Logger.log('이 시트는 체험 서버예요. 사본용 원본은 새 구글 시트를 하나 더 만들어 준비해 주세요. (체험 서버를 복사하면 다른 학교 기록까지 복사돼요)');
    return;
  }
  // 사본에 따라가지 않도록 원본에 남은 비밀번호와 게임 정보를 비운다 (사본용 원본에서만 실행하세요)
  var p = props();
  p.deleteProperty('teacherPw');
  cacheDel('teacherPw');
  p.getKeys().forEach(function (k) {
    if (k.indexOf('game:') === 0) {
      p.deleteProperty(k);
      cacheDel(k);
    }
  });
  ensureSheets();
  ensureGuideSheet();
  Logger.log(
    '사본용 원본 준비 완료! 이 시트는 배포하지 마세요.\n' +
      '[공유 → 일반 액세스: 링크가 있는 모든 사용자 · 뷰어]로 바꾸고, 시트 주소의 /edit 뒤를 지우고 /copy 로 바꾼 주소를 ' +
      '게임 사이트 js/config.js의 TEMPLATE_COPY_URL에 넣어 주세요.'
  );
}

/** [개발진] 이 시트를 여러 선생님이 함께 쓰는 '체험 서버'로 바꿔요. */
function setupTrialServer() {
  props().setProperty('serverMode', 'shared');
  cachePut('serverMode', 'shared');
  ensureSheets();
  Logger.log(
    '체험 서버로 바꿨어요.\n' +
      '이제 [배포 → 새 배포 → 웹 앱] (실행: 나 / 액세스 권한: 모든 사용자)으로 배포하고, ' +
      '웹 앱 URL을 게임 사이트 js/config.js의 TRIAL_GAS_URL에 넣어 주세요.'
  );
}

/** 선생님 비밀번호를 잊었을 때 실행: 비밀번호를 지우면 선생님 설정 화면에서 새로 정할 수 있어요. */
function resetTeacherPassword() {
  props().deleteProperty('teacherPw');
  cacheDel('teacherPw');
  Logger.log('선생님 비밀번호를 지웠어요. 게임 사이트의 선생님 설정에서 새 비밀번호를 정해 주세요.');
}

// ════════════════════════════════════════════════
// 웹 앱 입구
// ════════════════════════════════════════════════

function doGet(e) {
  return respond({
    ok: true,
    app: 'question-train-game',
    version: APP_VERSION,
    shared: isShared(),
    now: Date.now(),
    message: isShared()
      ? '질문 기차 게임 체험 서버가 잘 동작하고 있어요.'
      : '질문 기차 게임 서버가 잘 동작하고 있어요. 이 주소를 게임 사이트의 선생님 설정 화면에 붙여 넣어 주세요.',
  });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return respond({ ok: false, error: 'BAD_REQUEST', now: Date.now() });
  }
  return respond(handle(body));
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 이름: [처리 함수, 선생님 확인 필요 여부, 한 번에 하나씩 처리(잠금) 필요 여부]
var ACTIONS = {
  hello: [act_hello, false, false],
  claim: [act_claim, false, true],
  createGame: [act_createGame, true, true],
  listGames: [act_listGames, true, false],
  teacherView: [act_teacherView, true, false],
  start: [act_start, true, true],
  pause: [act_pause, true, true],
  resume: [act_resume, true, true],
  end: [act_end, true, true],
  reveal: [act_reveal, true, true],
  playAgain: [act_playAgain, true, true],
  releaseGroup: [act_releaseGroup, true, true],
  deleteCar: [act_deleteCar, true, true],
  deleteGame: [act_deleteGame, true, true],
  cleanup: [act_cleanup, true, true],
  info: [act_info, false, false],
  photo: [act_photo, false, false],
  join: [act_join, false, true],
  leave: [act_leave, false, true],
  poll: [act_poll, false, false],
  submit: [act_submit, false, true],
  results: [act_results, false, false],
};

function handle(body) {
  var name = String((body && body.action) || '');
  var entry = ACTIONS.hasOwnProperty(name) ? ACTIONS[name] : null;
  if (!entry) return { ok: false, error: 'UNKNOWN_ACTION', now: Date.now() };
  try {
    if (entry[1]) authTeacher(body);
    var res = entry[2] ? withLock(function () { return entry[0](body); }) : entry[0](body);
    res = res || {};
    if (res.ok === undefined) res.ok = true;
    res.now = Date.now();
    return res;
  } catch (err) {
    var msg = String((err && err.message) || err);
    var code = (err && err.code) || (/too many times|simultaneous|quota|한도|너무 많/i.test(msg) ? 'BUSY' : 'SERVER_ERROR');
    return { ok: false, error: code, message: msg, now: Date.now() };
  }
}

function fail(code, message) {
  var e = new Error(message || code);
  e.code = code;
  throw e;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail('BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════
// 저장 도우미
// ════════════════════════════════════════════════

function props() {
  return PropertiesService.getScriptProperties();
}

// 캐시: 자주 읽는 게임 정보를 빠르게 꺼내고, 스크립트 속성 읽기 한도(하루 5만 번)를 아낀다.
function cache() {
  return CacheService.getScriptCache();
}

function cacheGet(k) {
  try {
    return cache().get(k);
  } catch (e) {
    return null;
  }
}

function cachePut(k, v, sec) {
  try {
    cache().put(k, v, sec || CACHE_SEC);
    return true;
  } catch (e) {
    cacheDel(k);
    return false;
  }
}

function cacheDel(k) {
  try {
    cache().remove(k);
  } catch (e) {}
}

// 이 서버가 체험 서버인지 (setupTrialServer를 실행했는지)
function isShared() {
  var c = cacheGet('serverMode');
  if (c) return c === 'shared';
  var v = props().getProperty('serverMode') || 'own';
  cachePut('serverMode', v);
  return v === 'shared';
}

function teacherPw() {
  var c = cacheGet('teacherPw');
  if (c) return c === '-' ? '' : c;
  var v = props().getProperty('teacherPw') || '';
  cachePut('teacherPw', v || '-');
  return v;
}

function checkTeacher(pw) {
  var saved = teacherPw();
  return !!saved && String(pw || '') === saved;
}

// 체험 서버에서 선생님을 알아보는 열쇠 (브라우저마다 자동으로 만들어짐)
function keyOf(b) {
  var k = String((b && b.tk) || '');
  return /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : '';
}

function authTeacher(b) {
  if (isShared()) {
    if (!keyOf(b)) fail('NO_KEY');
    return;
  }
  if (!checkTeacher(b.pw)) fail('WRONG_PASSWORD');
}

function isTeacherFor(b, g) {
  if (isShared()) return !!keyOf(b) && g.owner === keyOf(b);
  return checkTeacher(b.pw);
}

// 선생님 기능: 체험 서버에서는 자기가 만든 게임만 다룰 수 있다.
function teacherGame(b, fresh) {
  var g = mustGame(b.code, fresh);
  if (isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  return g;
}

function cleanCode(c) {
  c = String(c || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(c)) fail('BAD_CODE');
  return c;
}

// fresh: 잠금 안에서 바꾸기 전에는 캐시가 아닌 원본(스크립트 속성)을 읽는다.
function loadGame(code, fresh) {
  var key = 'game:' + code;
  var s = fresh ? null : cacheGet(key);
  if (!s) {
    s = props().getProperty(key);
    if (s) cachePut(key, s);
  }
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function mustGame(code, fresh) {
  var g = loadGame(cleanCode(code), fresh);
  if (!g) fail('NO_GAME');
  return g;
}

function saveGame(g) {
  var s = JSON.stringify(g);
  props().setProperty('game:' + g.code, s);
  cachePut('game:' + g.code, s);
}

function allGames() {
  var all = props().getProperties();
  var out = [];
  for (var k in all) {
    if (!all.hasOwnProperty(k) || k.indexOf('game:') !== 0) continue;
    try {
      out.push(JSON.parse(all[k]));
    } catch (e) {
      out.push({ code: k.slice(5), broken: true });
    }
  }
  return out;
}

// 질문 기록에 이미 쓰인 코드는 다시 쓰지 않는다 (예전 기록이 새 게임 결과에 섞이지 않도록)
function usedCodes() {
  var used = {};
  var sh = qSheet();
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1)
      .getValues()
      .forEach(function (r) {
        used[String(r[0])] = true;
      });
  }
  return used;
}

function newCode() {
  var p = props();
  var used = usedCodes();
  for (var i = 0; i < 120; i++) {
    var c = String(1000 + Math.floor(Math.random() * 9000));
    if (!used[c] && !p.getProperty('game:' + c)) return c;
  }
  fail('NO_CODE');
}

function clampInt(v, min, max, dflt) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function cleanGroup(v, g) {
  var n = Math.round(Number(v));
  if (!isFinite(n) || n < 1 || n > g.groupCount) fail('BAD_GROUP');
  return String(n);
}

function cleanText(s, max) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNames(list) {
  if (!Array.isArray(list)) fail('BAD_NAMES');
  var out = [];
  for (var i = 0; i < list.length && out.length < LIMIT.members; i++) {
    var n = cleanText(list[i], LIMIT.name);
    if (n) out.push(n);
  }
  if (!out.length) fail('BAD_NAMES');
  return out;
}

function cleanCars(list) {
  if (!Array.isArray(list)) fail('BAD_CARS');
  var out = [];
  for (var i = 0; i < list.length && out.length < LIMIT.cars; i++) {
    var c = list[i] || {};
    var text = cleanText(c.text, LIMIT.text);
    if (!text) continue;
    out.push({ no: out.length + 1, text: text, name: cleanText(c.name, LIMIT.name + 4), at: Number(c.at) || Date.now() });
  }
  return out;
}

// 시트가 글자를 수식·날짜·숫자로 바꾸지 않도록 앞에 '를 붙인다. (시트에는 '가 보이지 않아요)
function asText(s) {
  return "'" + String(s === null || s === undefined ? '' : s);
}

function fmtTime(ms) {
  return Utilities.formatDate(new Date(ms), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
}

// 진행 중인데 마감 시각이 지났으면 끝난 것으로 본다.
function effective(g, now) {
  if (g.status === 'playing' && g.endsAt && now >= g.endsAt) return { status: 'ended', endedAt: g.endsAt };
  return { status: g.status, endedAt: g.endedAt || null };
}

function publicGame(g, now) {
  var e = effective(g, now);
  var groups = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) groups[k] = { names: g.groups[k].names, joinedAt: g.groups[k].joinedAt };
  }
  return {
    code: g.code,
    groupCount: g.groupCount,
    durationSec: g.durationSec,
    dupMode: g.dupMode,
    photo: g.photo,
    photoTitle: g.photoTitle || '',
    round: g.round,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    status: e.status,
    startedAt: g.startedAt || null,
    goAt: g.goAt || null,
    endsAt: g.endsAt || null,
    remainingMs: g.remainingMs === null || g.remainingMs === undefined ? null : g.remainingMs,
    endedAt: e.endedAt,
    revealedAt: g.revealedAt || null,
    updatedAt: g.updatedAt,
    groups: groups,
    subs: g.subs || {},
    shared: isShared(),
  };
}

// ── 시트 ─────────────────────────────────────────────

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheetUrl() {
  if (isShared()) return ''; // 체험 서버 시트 주소는 알려 주지 않는다
  try {
    return ss().getUrl();
  } catch (e) {
    return '';
  }
}

function ensureSheets() {
  var book = ss();
  var q = book.getSheetByName(Q_SHEET);
  if (!q) {
    q = book.insertSheet(Q_SHEET);
    q.getRange(1, 1, 1, Q_HEAD.length).setValues([Q_HEAD]).setFontWeight('bold').setBackground('#fcf1cc');
    q.setFrozenRows(1);
    q.setColumnWidth(5, 380);
    q.setColumnWidth(7, 150);
    q.setColumnWidth(8, 160);
    q.setColumnWidth(9, 150);
  }
  var p = book.getSheetByName(P_SHEET);
  if (!p) {
    p = book.insertSheet(P_SHEET);
    p.getRange(1, 1, 1, P_HEAD.length).setValues([P_HEAD]).setFontWeight('bold');
    p.setFrozenRows(1);
    p.hideSheet();
  }
  return { q: q, p: p };
}

// 사본을 만든 선생님이 시트를 열면 가장 먼저 보는 안내 탭
function ensureGuideSheet() {
  var book = ss();
  var g = book.getSheetByName(G_SHEET) || book.insertSheet(G_SHEET, 0);
  var rows = [
    ['질문 기차 게임 · 내 구글 시트', ''],
    ['', ''],
    ['이 시트가 우리 반 질문 기차 게임의 서버예요. 처음 한 번만 아래 순서대로 해 주세요.', ''],
    ['1', '위쪽 메뉴에서 [확장 프로그램 → Apps Script]를 눌러요. 새 창에 코드 편집기가 열려요. (코드는 이미 들어 있어요)'],
    ['2', '오른쪽 위 [배포 → 새 배포]를 누르고, "유형 선택" 옆 톱니바퀴에서 [웹 앱]을 골라요.'],
    ['3', '다음 사용자 인증 정보로 실행: 나 / 액세스 권한이 있는 사용자: 모든 사용자 로 정하고 [배포]를 눌러요.'],
    ['4', '[액세스 승인] → 내 계정 → "Google에서 확인하지 않은 앱"이 나오면 [고급] → [질문 기차 서버(으)로 이동] → [허용]을 눌러요.'],
    ['5', '화면에 나온 웹 앱 URL(…/exec로 끝나요)을 복사해서 게임 사이트 [선생님 설정]에 붙여 넣고 비밀번호를 정해요.'],
    ['', ''],
    ['알아 두세요', ''],
    ['•', '「질문 기록」 탭에 학생 질문이 쌓여요. 탭 이름과 열 순서는 바꾸지 마세요. 필요 없는 줄은 지워도 괜찮아요.'],
    ['•', '「사진 저장소」 탭은 숨겨져 있어요. 선생님이 올린 사진이 들어가고, 게임을 정리하면 지워져요.'],
    ['•', '코드를 새 버전으로 바꿀 때는 [배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포]를 눌러요. 주소가 바뀌지 않아요.'],
    ['•', '경고 화면은 직접 만든 코드라서 나오는 거예요. 이 코드는 이 시트 하나에만 접근해요.'],
  ];
  g.getRange(1, 1, rows.length, 2).setValues(rows);
  g.getRange(1, 1).setFontSize(18).setFontWeight('bold');
  g.getRange(10, 1).setFontWeight('bold');
  g.setColumnWidth(1, 60);
  g.setColumnWidth(2, 900);
  return g;
}

function qSheet() {
  return ss().getSheetByName(Q_SHEET) || ensureSheets().q;
}

function pSheet() {
  return ss().getSheetByName(P_SHEET) || ensureSheets().p;
}

function readQRows(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, Q_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    out.push({
      row: i + 2,
      code: String(v[0]),
      round: Number(v[1]),
      group: String(Number(v[2])),
      no: Number(v[3]),
      text: String(v[4]),
      name: String(v[5]),
      time: v[6] instanceof Date ? fmtTime(v[6].getTime()) : String(v[6]),
    });
  }
  return out;
}

// 이어진 줄 묶음을 아래쪽부터 지운다.
function deleteRowList(sh, rows) {
  rows = rows.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < rows.length) {
    var end = rows[i];
    var start = end;
    while (i + 1 < rows.length && rows[i + 1] === start - 1) {
      i++;
      start = rows[i];
    }
    sh.deleteRows(start, end - start + 1);
    i++;
  }
}

// replace: 같은 모둠이 같은 판에 다시 보낸 경우에만 예전 줄을 찾아 지운다 (처음 보낼 때는 시트를 읽지 않음)
function writeCars(g, round, group, cars, now, replace) {
  var sh = qSheet();
  if (replace) {
    var old = readQRows(sh)
      .filter(function (r) { return r.code === g.code && r.round === round && r.group === group; })
      .map(function (r) { return r.row; });
    if (old.length) deleteRowList(sh, old);
  }
  if (!cars.length) return;
  var stamp = asText(fmtTime(now));
  var photo = asText(g.photoTitle || (g.photo && g.photo.kind === 'upload' ? '선생님이 올린 사진' : ''));
  var rows = cars.map(function (c) {
    return [Number(g.code), round, Number(group), c.no, asText(c.text), asText(c.name), asText(fmtTime(c.at)), photo, stamp];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, Q_HEAD.length).setValues(rows);
}

function resKey(g) {
  return 'res:' + g.code + ':' + g.round;
}

function forgetResults(g) {
  cacheDel(resKey(g));
}

// 결과: 시트를 매번 읽지 않도록 캐시에 담아 둔다 (기차가 도착하거나 칸을 지우면 새로 만든다)
function collectResults(g) {
  var hit = cacheGet(resKey(g));
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  var rows = readQRows(qSheet()).filter(function (r) { return r.code === g.code && r.round === g.round; });
  var out = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) out[k] = { names: g.groups[k].names, cars: [] };
  }
  rows.forEach(function (r) {
    if (!out[r.group]) out[r.group] = { names: [], cars: [] };
    out[r.group].cars.push({ no: r.no, text: r.text, name: r.name, time: r.time });
  });
  for (var key in out) {
    if (out.hasOwnProperty(key)) out[key].cars.sort(function (a, b) { return a.no - b.no; });
  }
  cachePut(resKey(g), JSON.stringify(out), 1800);
  return out;
}

function deleteQuestionRows(codes) {
  var set = {};
  (Array.isArray(codes) ? codes : [codes]).forEach(function (c) { set[String(c)] = true; });
  var sh = qSheet();
  var rows = readQRows(sh).filter(function (r) { return set[r.code]; }).map(function (r) { return r.row; });
  if (rows.length) deleteRowList(sh, rows);
}

// ── 사진 ─────────────────────────────────────────────

function savePhoto(code, data) {
  var sh = pSheet();
  var rows = [];
  for (var i = 0, part = 0; i < data.length; i += CHUNK_SIZE, part++) {
    // 조각 앞에 b를 붙여 시트가 + 나 / 로 시작하는 글을 수식으로 읽지 않게 한다.
    rows.push([Number(code), part, 'b' + data.slice(i, i + CHUNK_SIZE)]);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, P_HEAD.length).setValues(rows);
}

function photoRows(code) {
  var sh = pSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, P_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === code) out.push({ row: i + 2, part: Number(vals[i][1]), data: String(vals[i][2]) });
  }
  return out;
}

function loadPhoto(code) {
  var parts = photoRows(code).sort(function (a, b) { return a.part - b.part; });
  return parts.map(function (p) { return p.data.charAt(0) === 'b' ? p.data.slice(1) : p.data; }).join('');
}

function deletePhoto(code) {
  var rows = photoRows(code).map(function (r) { return r.row; });
  if (rows.length) deleteRowList(pSheet(), rows);
}

// 게임 하나를 지운다 (진행 정보, 캐시, 사진)
function removeGame(code, g) {
  props().deleteProperty('game:' + code);
  cacheDel('game:' + code);
  for (var r = 1; g && r <= (Number(g.round) || 1); r++) cacheDel('res:' + code + ':' + r);
  if (!g || !g.photo || g.photo.kind === 'upload') deletePhoto(code);
}

// ── 태블릿 연결 표시 (캐시: 6시간 뒤 저절로 사라짐) ───────

function touchSeen(code, group, now) {
  cachePut('seen:' + code + ':' + group, String(now), CACHE_SEC);
}

function seenMap(g) {
  var keys = [];
  for (var i = 1; i <= g.groupCount; i++) keys.push('seen:' + g.code + ':' + i);
  var out = {};
  try {
    var got = cache().getAll(keys) || {};
    for (var j = 1; j <= g.groupCount; j++) {
      var v = got['seen:' + g.code + ':' + j];
      if (v) out[j] = Number(v);
    }
  } catch (e) {}
  return out;
}

// ── 정리 ─────────────────────────────────────────────

// 기한이 지난 게임을 지운다.
//  - 내 구글 시트: 진행 정보와 사진만 지우고 질문 기록은 남긴다.
//  - 체험 서버: 질문 기록까지 모두 지운다. (주인 없는 질문 기록도 함께 지움)
function cleanupExpired(now) {
  var shared = isShared();
  var removed = [];
  var alive = {};
  allGames().forEach(function (g) {
    if (g.broken || (g.expiresAt && now > g.expiresAt)) {
      removeGame(g.code, g.broken ? null : g);
      removed.push(g.code);
    } else alive[g.code] = true;
  });
  if (shared) {
    var sh = qSheet();
    var orphan = readQRows(sh)
      .filter(function (r) { return !alive[r.code]; })
      .map(function (r) { return r.row; });
    if (orphan.length) deleteRowList(sh, orphan);
  }
  cachePut('cleanupAt', String(now), CACHE_SEC);
  return removed;
}

function maybeCleanup(now) {
  var last = Number(cacheGet('cleanupAt') || 0);
  if (now - last < CLEANUP_EVERY_MS) return [];
  return cleanupExpired(now);
}

// ════════════════════════════════════════════════
// 선생님 기능
// ════════════════════════════════════════════════

function act_hello() {
  var shared = isShared();
  return { claimed: shared ? false : !!teacherPw(), shared: shared, version: APP_VERSION };
}

// 처음 연결할 때 선생님 비밀번호를 정하고, 다른 컴퓨터에서는 같은 비밀번호로 연결한다.
function act_claim(b) {
  if (isShared()) fail('SHARED_SERVER');
  var pw = String(b.pw || '');
  var saved = props().getProperty('teacherPw');
  if (!saved) {
    if (pw.length < 4 || pw.length > 30) fail('BAD_PASSWORD');
    props().setProperty('teacherPw', pw);
    cachePut('teacherPw', pw);
    ensureSheets();
    return { created: true, sheetUrl: sheetUrl(), version: APP_VERSION };
  }
  if (saved !== pw) fail('WRONG_PASSWORD');
  ensureSheets();
  return { created: false, sheetUrl: sheetUrl(), version: APP_VERSION };
}

function act_createGame(b) {
  var s = b.settings || {};
  var now = Date.now();
  var shared = isShared();
  if (shared) {
    maybeCleanup(now);
    var mine = 0;
    var games = allGames();
    games.forEach(function (g) {
      if (g.owner === keyOf(b) && !(g.expiresAt && now > g.expiresAt)) mine++;
    });
    if (mine >= TRIAL_LIMIT.gamesPerTeacher) fail('TOO_MANY_GAMES');
    if (games.length >= TRIAL_LIMIT.gamesTotal) fail('SERVER_FULL');
  }
  var photo = s.photo && s.photo.kind === 'upload' ? { kind: 'upload' } : { kind: 'sample', id: cleanText((s.photo && s.photo.id) || 'bus-stop', 40) };
  if (photo.kind === 'upload') {
    var data = String(b.imageData || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) fail('BAD_PHOTO');
    if (data.length > MAX_PHOTO_CHARS) fail('PHOTO_TOO_BIG');
  }
  var code = newCode();
  var game = {
    code: code,
    owner: keyOf(b),
    groupCount: clampInt(s.groupCount, LIMIT.groupsMin, LIMIT.groupsMax, 6),
    durationSec: clampInt(s.durationSec, 60, 1800, 420),
    dupMode: s.dupMode === 'similar' ? 'similar' : 'same',
    photo: photo,
    photoTitle: cleanText(s.photoTitle, 40),
    createdAt: now,
    expiresAt: now + (shared ? TRIAL_TTL_MS : GAME_TTL_MS),
    round: 1,
    status: 'lobby',
    startedAt: null,
    goAt: null,
    endsAt: null,
    remainingMs: null,
    endedAt: null,
    revealedAt: null,
    updatedAt: now,
    groups: {},
    subs: {},
  };
  if (photo.kind === 'upload') savePhoto(code, String(b.imageData));
  saveGame(game);
  return { code: code, game: publicGame(game, now) };
}

function act_listGames(b) {
  var now = Date.now();
  var shared = isShared();
  var out = [];
  allGames().forEach(function (g) {
    if (g.broken) return;
    if (shared && g.owner !== keyOf(b)) return;
    if (shared && g.expiresAt && now > g.expiresAt) return;
    out.push({
      code: g.code,
      status: effective(g, now).status,
      revealed: !!g.revealedAt,
      round: g.round,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      groupCount: g.groupCount,
      joined: Object.keys(g.groups || {}).length,
      photoTitle: g.photoTitle || '',
    });
  });
  out.sort(function (a, b2) { return b2.createdAt - a.createdAt; });
  return { games: out, sheetUrl: sheetUrl(), shared: shared };
}

function act_teacherView(b) {
  var g = teacherGame(b);
  return { game: publicGame(g, Date.now()), seen: seenMap(g) };
}

function act_start(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'lobby') {
    if (!Object.keys(g.groups || {}).length) fail('NO_GROUPS');
    g.status = 'playing';
    g.goAt = now + START_LEAD_MS;
    g.startedAt = g.goAt;
    g.endsAt = g.goAt + g.durationSec * 1000;
    g.remainingMs = null;
    g.endedAt = null;
    g.revealedAt = null;
    g.subs = {};
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_pause(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (effective(g, now).status === 'playing') {
    g.status = 'paused';
    g.remainingMs = Math.max(0, g.endsAt - Math.max(now, g.goAt || now));
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_resume(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'paused') {
    g.status = 'playing';
    g.goAt = now + RESUME_LEAD_MS;
    g.endsAt = g.goAt + Math.max(1000, Number(g.remainingMs) || 0);
    g.remainingMs = null;
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_end(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'playing' || g.status === 'paused') {
    var e = effective(g, now);
    g.status = 'ended';
    g.endedAt = e.status === 'ended' ? e.endedAt : now;
    g.remainingMs = null;
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_reveal(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  var e = effective(g, now);
  if (e.status !== 'ended') fail('NOT_ENDED');
  g.status = 'ended';
  g.endedAt = e.endedAt || now;
  if (!g.revealedAt) g.revealedAt = now;
  g.updatedAt = now;
  saveGame(g);
  return { game: publicGame(g, now), results: collectResults(g) };
}

function act_playAgain(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (effective(g, now).status === 'ended') {
    g.round = (Number(g.round) || 1) + 1;
    g.status = 'lobby';
    g.startedAt = null;
    g.goAt = null;
    g.endsAt = null;
    g.remainingMs = null;
    g.endedAt = null;
    g.revealedAt = null;
    g.subs = {};
    g.expiresAt = isShared() ? Math.max(g.expiresAt || 0, now + 6 * 3600 * 1000) : Math.max(g.expiresAt || 0, now + GAME_TTL_MS);
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_releaseGroup(b) {
  var g = teacherGame(b, true);
  var k = cleanGroup(b.group, g);
  delete g.groups[k];
  g.updatedAt = Date.now();
  saveGame(g);
  forgetResults(g);
  return { game: publicGame(g, g.updatedAt) };
}

function act_deleteCar(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  var k = cleanGroup(b.group, g);
  var round = Number(b.round) || g.round;
  var no = Number(b.no);
  var sh = qSheet();
  var mine = readQRows(sh).filter(function (r) { return r.code === g.code && r.round === round && r.group === k; });
  var target = null;
  for (var i = 0; i < mine.length; i++) if (mine[i].no === no) target = mine[i];
  if (!target) fail('NO_CAR');
  sh.deleteRow(target.row);
  // 뒤 칸 번호를 하나씩 당긴다
  mine.forEach(function (r) {
    if (r.no > no) sh.getRange(r.row > target.row ? r.row - 1 : r.row, 4).setValue(r.no - 1);
  });
  if (g.subs[k] && g.subs[k].round === round) {
    g.subs[k].count = Math.max(0, (Number(g.subs[k].count) || 1) - 1);
    g.subs[k].editedAt = now;
  }
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  return { game: publicGame(g, now), results: collectResults(g) };
}

function act_deleteGame(b) {
  var code = cleanCode(b.code);
  var g = loadGame(code, true);
  if (g && isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  removeGame(code, g);
  if (b.rows || isShared()) deleteQuestionRows(code);
  return { deleted: code };
}

function act_cleanup() {
  var now = Date.now();
  return { removed: isShared() ? maybeCleanup(now) : cleanupExpired(now) };
}

// ════════════════════════════════════════════════
// 모둠 태블릿 기능
// ════════════════════════════════════════════════

function act_info(b) {
  var g = mustGame(b.code);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  return { game: publicGame(g, now) };
}

function act_photo(b) {
  var g = mustGame(b.code);
  if (!g.photo || g.photo.kind !== 'upload') return { data: null };
  return { data: loadPhoto(g.code) || null };
}

function act_join(b) {
  var g = mustGame(b.code, true);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  var k = cleanGroup(b.group, g);
  var names = cleanNames(b.names);
  var token = String(b.token || '').slice(0, 64);
  var cur = g.groups[k];
  if (cur && cur.token !== token) fail('GROUP_TAKEN');
  if (!cur) {
    if (!token) token = Utilities.getUuid();
    // 한 태블릿은 한 모둠만: 다른 모둠에 들어가 있었다면 그 자리를 비운다
    for (var other in g.groups) {
      if (g.groups.hasOwnProperty(other) && g.groups[other].token === token) delete g.groups[other];
    }
  }
  g.groups[k] = { token: token, names: names, joinedAt: cur ? cur.joinedAt : now, updatedAt: now };
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  touchSeen(g.code, k, now);
  return { token: token, group: k, game: publicGame(g, now) };
}

function act_leave(b) {
  var g = mustGame(b.code, true);
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (cur && cur.token === String(b.token || '')) {
    delete g.groups[k];
    g.updatedAt = Date.now();
    saveGame(g);
    forgetResults(g);
  }
  return { game: publicGame(g, Date.now()) };
}

function act_poll(b) {
  var g = loadGame(cleanCode(b.code));
  var now = Date.now();
  if (!g) return { gone: true };
  var out = { game: publicGame(g, now) };
  if (b.group) {
    var k = String(b.group);
    var cur = g.groups[k];
    out.mine = !!(cur && cur.token === String(b.token || ''));
    if (out.mine) touchSeen(g.code, k, now);
  }
  return out;
}

function act_submit(b) {
  var g = mustGame(b.code, true);
  var now = Date.now();
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (!cur || cur.token !== String(b.token || '')) fail('NOT_MINE');
  var round = Number(b.round);
  if (round !== g.round) fail('OLD_ROUND');
  var cars = cleanCars(b.cars);
  var again = !!(g.subs[k] && Number(g.subs[k].round) === round);
  writeCars(g, round, k, cars, now, again);
  g.subs[k] = { round: round, count: cars.length, at: now };
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  touchSeen(g.code, k, now);
  return { saved: cars.length, game: publicGame(g, now) };
}

function act_results(b) {
  var g = mustGame(b.code);
  if (!g.revealedAt && !isTeacherFor(b, g)) fail('NOT_REVEALED');
  return { game: publicGame(g, Date.now()), results: collectResults(g) };
}
