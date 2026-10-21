// 서버와 이야기하는 곳
//  - 체험 서버: 개발진이 배포한 Apps Script 웹 앱 (여러 선생님이 함께 씀, 선생님 열쇠로 구별)
//  - 내 구글 시트: 선생님이 사본 시트에서 배포한 Apps Script 웹 앱 (선생님 비밀번호로 지킴)
//  - 연습 모드: 같은 서버 코드(gas/Code.gs)를 이 브라우저 안에서 돌린다.
// 세 방식 모두 call(action, params) 하나로 쓴다.

import { GAS_GLOBALS } from './gas-stub.js';
import { TRIAL_GAS_URL, TEMPLATE_COPY_URL, POLL } from './config.js';

const URL_KEY = 'qtg-gas-url'; // 선생님: 내 구글 시트 웹 앱 주소
const PW_KEY = 'qtg-gas-pw'; // 선생님: 내 구글 시트 비밀번호
const TABLET_KEY = 'qtg-tablet-server'; // 모둠 태블릿: 마지막으로 들어간 서버 주소
const TEACHER_KEY = 'qtg-teacher-key'; // 체험 서버에서 이 브라우저의 선생님을 알아보는 열쇠
const PRACTICE_PW = 'practice-0000';
const TIMEOUT_MS = 25000;

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}

function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}

function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
}

// ── 주소 다루기 ────────────────────────────────────────

export function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  // 배포 주소(…/exec)만 받는다. 테스트 주소(…/dev)는 선생님 계정으로만 열려서 학생 태블릿이 쓸 수 없다.
  const m = s.match(/https:\/\/script\.google\.com\/(?:a\/macros\/[^/\s]+|macros)\/s\/([A-Za-z0-9_-]{20,})\/exec/);
  return m ? m[0] : null;
}

export function isDevUrl(raw) {
  return /script\.google\.com\/.*\/s\/[A-Za-z0-9_-]+\/dev/.test(String(raw || ''));
}

export function trialUrl() {
  return normalizeUrl(TRIAL_GAS_URL || '');
}

export function hasTrial() {
  return !!trialUrl();
}

// 사본 만들기 주소: …/spreadsheets/d/<ID>/어떤주소 → …/spreadsheets/d/<ID>/copy
export function templateCopyUrl() {
  const m = String(TEMPLATE_COPY_URL || '').match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  return m ? `https://docs.google.com/spreadsheets/d/${m[1]}/copy` : null;
}

export function getStoredUrl() {
  return lsGet(URL_KEY) || null;
}

export function saveUrl(url) {
  lsSet(URL_KEY, url);
}

export function getTeacherPw() {
  return lsGet(PW_KEY) || '';
}

export function saveTeacherPw(pw) {
  lsSet(PW_KEY, pw);
}

export function clearConnection() {
  lsDel(URL_KEY);
  lsDel(PW_KEY);
}

export function getTabletUrl() {
  return lsGet(TABLET_KEY) || null;
}

export function saveTabletUrl(url) {
  lsSet(TABLET_KEY, url);
}

export function getTeacherKey() {
  let k = lsGet(TEACHER_KEY);
  if (!k || !/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
    const a = new Uint8Array(18);
    crypto.getRandomValues(a);
    k = btoa(String.fromCharCode(...a))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    lsSet(TEACHER_KEY, k);
  }
  return k;
}

// 모둠 태블릿 입장 링크에 넣을 짧은 값: 보통 주소는 배포 ID만, 학교 계정 주소는 통째로
export function encodeUrl(url) {
  const m = String(url).match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
  if (m) return { s: m[1] };
  const b64 = btoa(unescape(encodeURIComponent(url)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { u: b64 };
}

export function decodeUrlParams(params) {
  const s = params.get('s');
  if (s && /^[A-Za-z0-9_-]{20,}$/.test(s)) return `https://script.google.com/macros/s/${s}/exec`;
  const u = params.get('u');
  if (u) {
    try {
      const txt = decodeURIComponent(escape(atob(u.replace(/-/g, '+').replace(/_/g, '/'))));
      return normalizeUrl(txt);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// ── 공통: 시계 맞추기와 연결 상태 ───────────────────────

class BaseApi {
  constructor() {
    this.offset = 0;
    this.bestRtt = Infinity;
    this.listeners = new Set();
    this.online = true;
    this.fails = 0;
    this.pw = '';
    this.tk = getTeacherKey();
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  // 왕복 시간이 가장 짧았던 응답으로 서버 시계와의 차이를 잡는다.
  syncClock(serverNow, t0, t1) {
    if (!serverNow) return;
    const rtt = t1 - t0;
    if (rtt <= this.bestRtt * 1.5 || this.bestRtt === Infinity) {
      if (rtt < this.bestRtt) this.bestRtt = rtt;
      this.offset = serverNow - (t0 + t1) / 2;
    }
  }

  onConnection(cb) {
    this.listeners.add(cb);
    cb(this.online);
    return () => this.listeners.delete(cb);
  }

  setOnline(ok) {
    if (ok) this.fails = 0;
    else this.fails++;
    const now = ok || this.fails < 2;
    if (now !== this.online) {
      this.online = now;
      this.listeners.forEach((cb) => cb(now));
    }
  }

  async call(action, params = {}, retry = 1) {
    const t0 = Date.now();
    let data;
    try {
      data = await this.send({ ...params, action });
    } catch (e) {
      this.setOnline(false);
      // 요청이 몰려 서버가 받지 못했을 때는 잠깐 쉬었다가 한 번 더 보낸다
      if (e.code === 'BUSY' && retry > 0) {
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
        return this.call(action, params, retry - 1);
      }
      throw e;
    }
    const t1 = Date.now();
    this.setOnline(true);
    this.syncClock(data && data.now, t0, t1);
    if (!data || !data.ok) {
      const err = new Error((data && (data.message || data.error)) || 'SERVER_ERROR');
      err.code = (data && data.error) || 'SERVER_ERROR';
      if (err.code === 'BUSY' && retry > 0) {
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
        return this.call(action, params, retry - 1);
      }
      throw err;
    }
    return data;
  }

  // 선생님 기능에는 비밀번호(내 구글 시트)와 열쇠(체험 서버)를 붙인다
  teacher(action, params = {}) {
    return this.call(action, { ...params, pw: this.pw, tk: this.tk });
  }
}

// ── 구글 시트 서버 (체험 서버 · 내 구글 시트) ─────────────────

export class GasApi extends BaseApi {
  constructor(url, pw = '', kind = 'sheet') {
    super();
    this.kind = kind; // 'trial' | 'sheet'
    this.url = url;
    this.pw = pw;
  }

  async send(payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // text/plain으로 보내야 브라우저가 사전 확인(preflight) 없이 Apps Script에 바로 보낸다.
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        const err = new Error('NOT_JSON');
        if (res.status === 429 || /too many|simultaneous|quota|할당량|너무 많/i.test(text)) err.code = 'BUSY';
        else if (this.kind === 'trial') err.code = 'TRIAL_DOWN';
        else err.code = /<html|<!DOCTYPE/i.test(text) ? 'NOT_WEBAPP' : 'NOT_JSON';
        throw err;
      }
    } catch (e) {
      if (e.code) throw e;
      const err = new Error(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
      err.code = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── 연습 모드 ─────────────────────────────────────────

let serverPromise = null;

async function loadPracticeServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const res = await fetch(new URL('../gas/Code.gs', import.meta.url));
      if (!res.ok) throw new Error('gas/Code.gs 파일을 불러오지 못했어요.');
      const code = await res.text();
      const names = Object.keys(GAS_GLOBALS);
      // eslint-disable-next-line no-new-func
      const factory = new Function(...names, `${code}\n;return { doPost: doPost, handle: handle };`);
      return factory(...names.map((n) => GAS_GLOBALS[n]));
    })();
  }
  return serverPromise;
}

export class LocalApi extends BaseApi {
  constructor() {
    super();
    this.kind = 'local';
    this.pw = PRACTICE_PW;
  }

  async send(payload) {
    const server = await loadPracticeServer();
    // 실제 인터넷처럼 조금 늦게 답한다 (여러 창이 동시에 보내도 하나씩 처리)
    // 시험용: localStorage 'qtg-practice-latency'에 밀리초를 넣으면 Apps Script처럼 느리게 답한다.
    const extra = Number(lsGet('qtg-practice-latency')) || 0;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 + extra * (0.6 + Math.random() * 0.8)));
    const run = () => JSON.parse(server.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('qtg-practice-server', run);
    return run();
  }

  // 연습 모드는 처음 쓸 때 비밀번호를 알아서 정한다.
  async ready() {
    if (!this._ready) {
      this._ready = this.call('claim', { pw: this.pw }).catch((e) => {
        this._ready = null;
        throw e;
      });
    }
    return this._ready;
  }
}

let localApi = null;
export async function getLocalApi() {
  if (!localApi) localApi = new LocalApi();
  await localApi.ready();
  return localApi;
}

let sheetApi = null;
export function getSheetApi(url = getStoredUrl(), pw = getTeacherPw()) {
  if (!url) return null;
  if (!sheetApi || sheetApi.url !== url) sheetApi = new GasApi(url, pw, 'sheet');
  sheetApi.pw = pw;
  return sheetApi;
}

let trialApi = null;
export function getTrialApi() {
  const url = trialUrl();
  if (!url) return null;
  if (!trialApi) trialApi = new GasApi(url, '', 'trial');
  return trialApi;
}

// 모둠 태블릿용: 주소만 알면 된다 (선생님 비밀번호 없이)
const serverApis = new Map();
export function getServerApi(url) {
  if (!url) return null;
  if (!serverApis.has(url)) serverApis.set(url, new GasApi(url, '', url === trialUrl() ? 'trial' : 'sheet'));
  return serverApis.get(url);
}

export function isConnected() {
  return !!(getStoredUrl() && getTeacherPw());
}

export function pollMs(api, name) {
  const table = api && api.kind === 'trial' ? POLL.trial : POLL.own;
  return table[name] || 3000;
}

// ── 오류 안내 ────────────────────────────────────────

export function explainError(e, who = 'teacher') {
  const c = (e && e.code) || '';
  const T = who === 'teacher';
  switch (c) {
    case 'NETWORK':
      return T
        ? '구글 시트 서버에 닿지 못했어요. 인터넷 연결과 웹 앱 주소를 확인하고, 배포할 때 액세스 권한을 "모든 사용자"로 했는지 확인해 주세요.'
        : '인터넷 연결을 확인해 주세요.';
    case 'TIMEOUT':
      return '서버가 답하는 데 너무 오래 걸려요. 잠시 뒤 다시 해 주세요.';
    case 'NOT_WEBAPP':
    case 'NOT_JSON':
      return T
        ? '웹 앱 주소가 맞지 않거나, 배포 설정이 달라요. "웹 앱"으로 배포했는지, 액세스 권한이 "모든 사용자"인지 확인해 주세요.'
        : '선생님 서버 주소가 바뀐 것 같아요. 선생님 화면의 QR 코드로 다시 들어와 주세요.';
    case 'TRIAL_DOWN':
      return T ? '체험 서버에 연결하지 못했어요. 잠시 뒤 다시 해 보거나, 내 구글 시트를 연결해 주세요.' : '서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.';
    case 'NO_TRIAL':
      return '체험 서버가 아직 준비되지 않았어요. 내 구글 시트를 연결하거나 연습 모드를 써 주세요.';
    case 'SHARED_SERVER':
      return '이 주소는 개발진의 체험 서버예요. 내 구글 시트(사본)에서 배포한 웹 앱 주소를 넣어 주세요.';
    case 'NOT_OWNER':
      return '이 브라우저에서 만든 게임이 아니에요. 체험 서버 게임은 만든 브라우저에서만 관리할 수 있어요.';
    case 'NO_KEY':
      return '이 브라우저의 선생님 열쇠를 만들지 못했어요. 브라우저 저장 공간(쿠키·사이트 데이터)이 막혀 있는지 확인해 주세요.';
    case 'TOO_MANY_GAMES':
      return '체험 서버에서는 게임을 6개까지 만들 수 있어요. 지난 게임 목록에서 필요 없는 게임을 지워 주세요.';
    case 'SERVER_FULL':
      return '지금 체험 서버를 쓰는 반이 너무 많아요. 잠시 뒤 다시 해 보거나, 내 구글 시트를 연결해 주세요.';
    case 'WRONG_PASSWORD':
      return '선생님 비밀번호가 맞지 않아요.';
    case 'BAD_PASSWORD':
      return '비밀번호는 4글자 이상으로 정해 주세요.';
    case 'NO_GAME':
      return T ? '없거나 정리된 게임이에요.' : '게임 코드를 다시 확인해 주세요.';
    case 'BAD_CODE':
      return '게임 코드 4자리를 입력해 주세요.';
    case 'EXPIRED':
      return '끝난 지 오래된 게임이에요. 코드를 다시 확인해 주세요.';
    case 'GROUP_TAKEN':
      return '이 모둠은 이미 다른 태블릿이 쓰고 있어요. 모둠 번호를 확인하거나 선생님께 알려 주세요.';
    case 'BAD_NAMES':
      return '모둠 친구 이름을 한 명 이상 써 주세요.';
    case 'NOT_MINE':
      return '선생님이 이 태블릿의 모둠 연결을 풀었어요. 모둠을 다시 골라 주세요.';
    case 'OLD_ROUND':
      return '새 판이 시작됐어요.';
    case 'NO_GROUPS':
      return '아직 들어온 모둠 태블릿이 없어요.';
    case 'NOT_ENDED':
      return '게임이 끝난 뒤에 순위를 발표할 수 있어요.';
    case 'NOT_REVEALED':
      return '선생님이 아직 순위를 발표하지 않았어요.';
    case 'BUSY':
      return '요청이 한꺼번에 몰렸어요. 잠시 뒤 다시 눌러 주세요.';
    case 'PHOTO_TOO_BIG':
      return '사진이 너무 커요. 더 작은 사진을 골라 주세요.';
    case 'STORAGE_FULL':
      return '이 브라우저 저장 공간이 가득 찼어요. 연습 모드의 지난 게임을 지워 주세요.';
    case 'UNKNOWN_ACTION':
      return 'Apps Script 코드가 예전 버전이에요. 새 코드를 붙여 넣고 새 버전으로 배포해 주세요.';
    default:
      return (T ? '문제가 생겼어요: ' : '문제가 생겼어요. 선생님께 알려 주세요. ') + String((e && e.message) || c).slice(0, 80);
  }
}

// 서버 게임 정보 → 화면에서 쓰는 진행 상태
//  lobby(대기) · ready(곧 출발) · playing · paused · ended
export function deriveState(game, now) {
  if (!game) return null;
  let status = game.status;
  let endedAt = game.endedAt;
  if (status === 'playing' && game.endsAt && now >= game.endsAt) {
    status = 'ended';
    endedAt = game.endsAt;
  }
  if (status === 'playing' && game.goAt && now < game.goAt) status = 'ready';
  return {
    status,
    startedAt: game.startedAt,
    goAt: game.goAt,
    endsAt: game.endsAt,
    remainingMs: game.remainingMs,
    endedAt,
    revealedAt: game.revealedAt,
    round: game.round,
  };
}

export function remainingOf(st, now, durationSec) {
  if (!st) return 0;
  if (st.status === 'lobby') return durationSec * 1000;
  if (st.status === 'ready') return Math.max(0, Number(st.endsAt) - Number(st.goAt));
  if (st.status === 'playing') return Math.max(0, Number(st.endsAt) - now);
  if (st.status === 'paused') return Math.max(0, Number(st.remainingMs) || 0);
  return 0;
}
