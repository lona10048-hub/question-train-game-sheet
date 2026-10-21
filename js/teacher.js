// 선생님 화면 (구글 시트 버전): 게임 만들기 → 대기실 → 진행(터널) → 도착 → 순위 발표 → 결과

import {
  $,
  esc,
  toast,
  openModal,
  confirmBox,
  showPhoto,
  qrSvg,
  copyText,
  downloadText,
  csvCell,
  compressImage,
  watchConnection,
  brandHtml,
  catSvg,
  locoSvg,
  portalSvg,
  treeSvg,
  drumSvg,
  ICON,
} from './ui.js';
import { PHOTOS, photoById, groupColor, formatClock, ranking, TIME_OPTIONS, MIN_GROUPS, MAX_GROUPS } from './game.js';
import { createTimerFx, isSoundOn, setSoundOn, SOUND_ICON, drumroll, fanfare, bell, beep, flashBanner } from './effects.js';
import { TRIAL_RULES } from './config.js';
import { getLocalApi, getSheetApi, getTrialApi, hasTrial, isConnected, encodeUrl, explainError, deriveState, remainingOf, pollMs } from './api.js';

const app = document.getElementById('app');
const FORM_KEY = 'qtg-sheet-teacher-form';
const SEEN_FRESH_MS = 12000;

const S = {
  api: null,
  mode: null,
  code: null,
  game: null,
  seen: {},
  imageData: null,
  results: null,
  resultsSig: '',
  subsSig: '',
  view: 'home',
  built: null,
  form: loadForm(),
  loop: null,
  pollTimer: null,
  polling: false,
  stopConn: null,
  fx: createTimerFx('teacher'),
  ending: false,
  revealing: false,
  readySec: null,
  lastGoAt: null,
  sheetUrl: '',
};

function loadForm() {
  const base = {
    mode: defaultMode(),
    photo: { kind: 'sample', id: PHOTOS[0].id },
    imageData: null,
    minutes: 7,
    groups: 6,
    dupMode: 'same',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
    if (saved.minutes) base.minutes = saved.minutes;
    if (saved.groups) base.groups = saved.groups;
    if (saved.dupMode) base.dupMode = saved.dupMode;
    if (saved.photoId && photoById(saved.photoId)) base.photo = { kind: 'sample', id: saved.photoId };
    if (modeAvailable(saved.mode)) base.mode = saved.mode;
  } catch (e) {}
  return base;
}

// 수업 방식: 'sheet'(내 구글 시트) · 'trial'(체험 서버) · 'local'(연습 모드)
function modeAvailable(m) {
  return m === 'local' || (m === 'sheet' && isConnected()) || (m === 'trial' && hasTrial());
}

function defaultMode() {
  return isConnected() ? 'sheet' : hasTrial() ? 'trial' : 'local';
}

const MODE_LABEL = { sheet: '내 구글 시트', trial: '체험 서버', local: '연습 모드' };

function saveForm() {
  const f = S.form;
  try {
    localStorage.setItem(
      FORM_KEY,
      JSON.stringify({ minutes: f.minutes, groups: f.groups, dupMode: f.dupMode, photoId: f.photo.kind === 'sample' ? f.photo.id : null, mode: f.mode })
    );
  } catch (e) {}
}

async function getApi(mode) {
  if (mode === 'local') return getLocalApi();
  if (mode === 'trial') {
    const t = getTrialApi();
    if (!t) {
      const err = new Error('NO_TRIAL');
      err.code = 'NO_TRIAL';
      throw err;
    }
    return t;
  }
  const api = getSheetApi();
  if (!api || !api.pw) {
    const err = new Error('NOT_CONNECTED');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return api;
}

function explain(e) {
  if (e && e.code === 'NOT_CONNECTED') return '구글 시트가 아직 연결되지 않았어요. 선생님 설정에서 연결해 주세요.';
  return explainError(e, 'teacher');
}

function topbar(right = '') {
  return `<header class="topbar">${brandHtml('선생님용 · 구글 시트 버전')}<div class="spacer"></div>${right}</header>`;
}

function setLayout(mode) {
  app.classList.toggle('wide', mode === 'board');
  app.classList.toggle('board-mode', mode === 'board');
}

const now = () => (S.api ? S.api.serverNow() : Date.now());
const st = () => deriveState(S.game, now());
const joinedGroups = () =>
  Object.keys((S.game && S.game.groups) || {})
    .map(Number)
    .sort((a, b) => a - b);
const namesOf = (g) => ((S.game && S.game.groups[g] && S.game.groups[g].names) || []).slice();
const isFresh = (g) => S.seen[g] && now() - S.seen[g] < SEEN_FRESH_MS;
const arrived = (g) => {
  const s = S.game && S.game.subs && S.game.subs[g];
  return !!(s && Number(s.round) === Number(S.game.round));
};

// ════════════════════════════════════════════════
// 1. 게임 만들기 (처음 화면)
// ════════════════════════════════════════════════

function showHome() {
  closeGame();
  S.view = 'home';
  S.built = null;
  history.replaceState(null, '', 'teacher.html');
  renderHome();
  loadGameList();
}

function renderHome() {
  setLayout('normal');
  const f = S.form;
  const connected = isConnected();
  const trial = hasTrial();
  const connectBtn = `<div style="margin-top:10px"><a class="btn btn-cream btn-sm" href="setup.html?from=teacher">${ICON.sheet}내 구글 시트 연결하기</a></div>`;
  let notice;
  if (connected) notice = `<div class="notice green"><div><strong>내 구글 시트 연결 완료</strong>모둠 태블릿이 게임 코드로 들어올 수 있어요. 학생 질문은 선생님 구글 시트의 '질문 기록' 탭에 쌓여요.</div></div>`;
  else if (trial)
    notice = `<div class="notice"><div><strong>설정 없이 체험 서버로 바로 해 볼 수 있어요</strong>체험 서버는 여러 학교가 함께 쓰는 서버라 질문 기록이 ${TRIAL_RULES.keepHours}시간 뒤 지워지고, 가끔 느릴 수 있어요. 우리 반 정식 수업은 내 구글 시트를 연결해 주세요. (10분이면 돼요)${connectBtn}</div></div>`;
  else notice = `<div class="notice"><div><strong>수업을 하려면 내 구글 시트 연결이 필요해요</strong>지금은 연습 모드(이 컴퓨터의 여러 창)로만 만들 수 있어요.${connectBtn}</div></div>`;
  const modeNote =
    f.mode === 'trial'
      ? `<p class="mode-note">체험 서버: 게임은 ${TRIAL_RULES.gamesPerTeacher}개까지 만들 수 있고, 질문 기록은 ${TRIAL_RULES.keepHours}시간 뒤 지워져요. 모둠 친구 이름은 실명 대신 번호나 별명으로 쓰도록 안내돼요. 이 브라우저에서 만든 게임만 관리할 수 있어요.</p>`
      : '';

  const photoOpts = PHOTOS.map(
    (p) => `<button type="button" class="photo-opt" data-act="photo" data-id="${p.id}" aria-pressed="${f.photo.kind === 'sample' && f.photo.id === p.id}">
        <img src="${p.thumb}" alt="" loading="lazy">
        <span class="check">${ICON.check}</span>
        <div class="pt">${esc(p.title)}</div>
        <div class="ph">${esc(p.hint)}</div>
      </button>`
  ).join('');
  const uploaded = f.photo.kind === 'upload' && f.imageData;
  const uploadOpt = `<button type="button" class="photo-opt" data-act="upload" aria-pressed="${f.photo.kind === 'upload'}">
      ${uploaded ? `<img src="${f.imageData}" alt="">` : `<span class="upload-face">${ICON.upload}<span>내 사진 올리기</span></span>`}
      <span class="check">${ICON.check}</span>
      <div class="pt">${uploaded ? '내가 올린 사진' : '직접 올리기'}</div>
      <div class="ph">${uploaded ? '다른 사진으로 바꾸려면 한 번 더 눌러요' : 'JPG·PNG 사진을 골라요'}</div>
    </button>`;

  app.innerHTML = `
    ${topbar(`<a class="btn btn-cream btn-sm" href="index.html">${ICON.back}처음으로</a><a class="btn btn-ghost btn-sm" href="setup.html?from=teacher">${ICON.gear}선생님 설정</a>`)}
    <section class="card pad-lg" aria-labelledby="h">
      <span class="deco green" style="width:260px;height:260px;right:-90px;top:-110px"></span>
      <div class="eyebrow">선생님용 · 게임 준비</div>
      <h1 id="h" style="font-size:clamp(32px,4vw,46px);margin:10px 0 6px">질문 기차 게임 만들기</h1>
      <p class="section-desc" style="font-size:19px;margin-bottom:20px">사진과 시간, 모둠 수를 정하면 모둠 태블릿이 들어올 게임 코드가 만들어져요.</p>
      ${notice}
      <div class="setup-grid" style="margin-top:28px">
        <div class="full field">
          <div class="field-label"><span class="form-num">1</span>수업 방식</div>
          <div class="mode-pick ${trial ? 'three' : ''}">
            <button type="button" data-act="mode" data-mode="sheet" aria-pressed="${f.mode === 'sheet'}" ${connected ? '' : 'disabled'}>
              <div class="t">내 구글 시트</div>
              <div class="d">${connected ? '우리 반 정식 수업 · 질문이 내 시트에 남아요' : '선생님 설정에서 연결하면 쓸 수 있어요'}</div>
            </button>
            ${
              trial
                ? `<button type="button" data-act="mode" data-mode="trial" aria-pressed="${f.mode === 'trial'}">
              <div class="t">체험 서버</div>
              <div class="d">설정 없이 바로 · 기록은 ${TRIAL_RULES.keepHours}시간 뒤 지워져요</div>
            </button>`
                : ''
            }
            <button type="button" data-act="mode" data-mode="local" aria-pressed="${f.mode === 'local'}">
              <div class="t">연습 모드</div>
              <div class="d">이 컴퓨터의 여러 창에서만 동작해요 (미리 해 보기용)</div>
            </button>
          </div>
          ${modeNote}
        </div>
        <div class="full field">
          <div class="field-label"><span class="form-num">2</span>학생들에게 보여 줄 사진</div>
          <div class="photo-grid">${photoOpts}${uploadOpt}</div>
          <input type="file" id="file" accept="image/*" class="hidden">
        </div>
        <div class="field">
          <div class="field-label"><span class="form-num">3</span>제한 시간</div>
          <div class="seg" role="group" aria-label="제한 시간">
            ${TIME_OPTIONS.map((m) => `<button type="button" data-act="minutes" data-v="${m}" aria-pressed="${f.minutes === m}">${m}분</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <div class="field-label"><span class="form-num">4</span>모둠 수</div>
          <div class="stepper">
            <button type="button" class="btn btn-cream btn-icon" data-act="groups-dec" aria-label="모둠 하나 줄이기" ${f.groups <= MIN_GROUPS ? 'disabled' : ''}>−</button>
            <span class="value" aria-live="polite">${f.groups}</span>
            <button type="button" class="btn btn-cream btn-icon" data-act="groups-inc" aria-label="모둠 하나 늘리기" ${f.groups >= MAX_GROUPS ? 'disabled' : ''}>+</button>
            <span style="color:var(--ink-3);font-size:17px">모둠 (${MIN_GROUPS}~${MAX_GROUPS}) · 모둠마다 태블릿 1대</span>
          </div>
        </div>
        <div class="full field">
          <div class="field-label"><span class="form-num">5</span>겹치는 질문 판정</div>
          <div class="mode-pick">
            <button type="button" data-act="dup" data-v="same" aria-pressed="${f.dupMode === 'same'}">
              <div class="t">똑같은 질문만 막기</div>
              <div class="d">비슷한 질문은 "그래도 붙일까요?" 하고 한 번 물어봐요 (추천)</div>
            </button>
            <button type="button" data-act="dup" data-v="similar" aria-pressed="${f.dupMode === 'similar'}">
              <div class="t">비슷한 질문도 막기</div>
              <div class="d">말만 살짝 바꾼 질문도 붙일 수 없어요</div>
            </button>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:34px;justify-content:flex-end">
        <span style="color:var(--ink-3);font-size:17px" id="create-sum">${esc(summary())}</span>
        <button type="button" class="btn btn-primary btn-lg" data-act="create" id="create-btn">게임 코드 만들기</button>
      </div>
    </section>
    <section class="card pad" style="margin-top:22px" aria-labelledby="rl">
      <div class="row">
        <div>
          <h2 class="section-title" id="rl">지난 게임 이어서 하기</h2>
          <p class="section-desc">${
            f.mode === 'sheet'
              ? '연결된 구글 시트에서 만든 게임이에요. 7일이 지나면 진행 정보가 정리돼요. (질문 기록은 시트에 남아요)'
              : f.mode === 'trial'
              ? `이 브라우저에서 체험 서버로 만든 게임이에요. ${TRIAL_RULES.keepHours}시간이 지나면 질문 기록까지 모두 지워져요.`
              : '연습 모드에서 만든 게임이에요. 7일이 지나면 진행 정보가 정리돼요.'
          }</p>
        </div>
        <div class="spacer"></div>
        <span id="sheet-link"></span>
      </div>
      <div class="room-list" id="room-list" style="margin-top:14px"><div class="empty-state" style="padding:16px">불러오는 중…</div></div>
    </section>`;

  $('#file').addEventListener('change', onFile);
}

function summary() {
  const f = S.form;
  const p = f.photo.kind === 'sample' ? photoById(f.photo.id).title : '내 사진';
  return `${MODE_LABEL[f.mode]} · ${p} · ${f.minutes}분 · ${f.groups}모둠`;
}

async function onFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    toast('사진을 줄이는 중이에요…');
    // 시트에 나눠 담기 좋도록 조금 더 작게 줄인다
    const data = await compressImage(file, 1200, 320000);
    S.form.photo = { kind: 'upload' };
    S.form.imageData = data;
    renderHome();
    loadGameList();
  } catch (err) {
    toast(err.message, 'warn');
  }
}

function statusLabel(g) {
  if (g.status === 'lobby') return ['대기 중', 'cream'];
  if (g.status === 'ended') return g.revealed ? ['발표 끝', 'cream'] : ['도착, 발표 전', 'butter'];
  return ['진행 중', 'butter'];
}

async function loadGameList() {
  const box = $('#room-list');
  if (!box) return;
  try {
    const api = await getApi(S.form.mode);
    api.teacher('cleanup').catch(() => {});
    const res = await api.teacher('listGames');
    if (!$('#room-list')) return;
    S.sheetUrl = res.sheetUrl || '';
    const link = $('#sheet-link');
    if (link && S.sheetUrl && S.form.mode === 'sheet') link.innerHTML = `<a class="btn btn-cream btn-sm" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">${ICON.sheet}구글 시트 열기</a>`;
    const games = res.games || [];
    if (!games.length) {
      box.innerHTML = `<div class="empty-state" style="padding:14px">아직 만든 게임이 없어요.</div>`;
      return;
    }
    box.innerHTML = games
      .slice(0, 10)
      .map((g) => {
        const [label, tone] = statusLabel(g);
        const when = g.createdAt ? new Date(g.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        return `<div class="room-item">
          <span class="rc">${esc(g.code)}</span>
          <span class="chip ${tone}">${label}</span>
          <span style="color:var(--ink-3)">${esc(when)}${g.round > 1 ? ` · ${g.round}번째 판` : ''} · 태블릿 ${g.joined}/${g.groupCount}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-primary btn-sm" data-act="open-room" data-code="${esc(g.code)}">이어서 열기</button>
          <button type="button" class="btn btn-danger btn-sm" data-act="del-room" data-code="${esc(g.code)}">${ICON.trash}지우기</button>
        </div>`;
      })
      .join('');
  } catch (e) {
    if ($('#room-list')) box.innerHTML = `<div class="notice apricot"><div>${esc(explain(e))}</div></div>`;
  }
}

async function createGame() {
  const f = S.form;
  if (f.photo.kind === 'upload' && !f.imageData) return toast('사진을 먼저 올려 주세요.', 'warn');
  const btn = $('#create-btn');
  btn.disabled = true;
  btn.textContent = '만드는 중…';
  try {
    const api = await getApi(f.mode);
    const res = await api.teacher('createGame', {
      settings: {
        groupCount: f.groups,
        durationSec: f.minutes * 60,
        dupMode: f.dupMode,
        photo: f.photo,
        photoTitle: f.photo.kind === 'sample' ? photoById(f.photo.id).title : '선생님이 올린 사진',
      },
      imageData: f.photo.kind === 'upload' ? f.imageData : null,
    });
    saveForm();
    await openGame(f.mode, res.code, { game: res.game, imageData: f.photo.kind === 'upload' ? f.imageData : null });
  } catch (e) {
    console.error(e);
    toast('게임을 만들지 못했어요. ' + explain(e), 'warn');
    btn.disabled = false;
    btn.textContent = '게임 코드 만들기';
  }
}

// ════════════════════════════════════════════════
// 게임 열기 · 상태 받아오기
// ════════════════════════════════════════════════

function closeGame() {
  clearInterval(S.loop);
  clearTimeout(S.pollTimer);
  if (S.stopConn) S.stopConn();
  Object.assign(S, {
    loop: null,
    pollTimer: null,
    stopConn: null,
    code: null,
    game: null,
    seen: {},
    imageData: null,
    results: null,
    resultsSig: '',
    subsSig: '',
    built: null,
    readySec: null,
    lastGoAt: null,
  });
}

async function openGame(mode, code, preset = {}) {
  closeGame();
  app.innerHTML = `<div class="empty-state">게임을 여는 중이에요…</div>`;
  const api = await getApi(mode);
  const first = preset.game ? { game: preset.game, seen: {} } : await api.teacher('teacherView', { code });
  Object.assign(S, { api, mode, code, game: first.game, seen: first.seen || {}, imageData: preset.imageData || null });
  history.replaceState(null, '', `teacher.html?room=${code}&mode=${mode}`);
  S.stopConn = watchConnection(api);
  if (S.game.photo && S.game.photo.kind === 'upload' && !S.imageData) {
    api.call('photo', { code }).then((r) => {
      S.imageData = r.data;
      if (S.view === 'lobby' || S.view === 'board') S.built = null;
      render();
    });
  }
  if (S.game.revealedAt) await loadResults().catch(() => {});
  S.loop = setInterval(tick, 250);
  render();
  poll();
}

async function poll() {
  clearTimeout(S.pollTimer);
  if (!S.code) return;
  const code = S.code;
  try {
    const res = await S.api.teacher('teacherView', { code });
    if (S.code !== code) return;
    S.game = res.game;
    S.seen = res.seen || {};
    const sig = JSON.stringify([S.game.round, S.game.subs, S.game.revealedAt]);
    if (S.game.revealedAt && (sig !== S.subsSig || !S.results)) {
      S.subsSig = sig;
      await loadResults();
    }
    render();
  } catch (e) {
    if (e.code === 'NO_GAME') {
      toast('게임이 정리되었어요.');
      return showHome();
    }
    if (e.code === 'NOT_OWNER') {
      toast(explain(e), 'warn');
      return showHome();
    }
    if (e.code === 'WRONG_PASSWORD') {
      toast('선생님 비밀번호가 바뀌었어요. 선생님 설정에서 다시 연결해 주세요.', 'warn');
      return;
    }
  } finally {
    if (S.code === code) S.pollTimer = setTimeout(poll, pollMs(S.api, document.hidden ? 'hidden' : 'teacher'));
  }
}

async function loadResults() {
  const res = await S.api.teacher('results', { code: S.code });
  S.game = res.game;
  S.results = res.results || {};
  S.subsSig = JSON.stringify([S.game.round, S.game.subs, S.game.revealedAt]);
}

function viewFor(s) {
  if (!s) return 'lobby';
  if (s.status === 'lobby') return 'lobby';
  if (s.status === 'ended') return S.game.revealedAt ? 'results' : 'arrive';
  return 'board';
}

function render() {
  if (!S.code || !S.game) return;
  const view = viewFor(st());
  if (view !== S.view) {
    S.view = view;
    S.built = null;
    window.scrollTo(0, 0);
  }
  if (view === 'lobby') renderLobby();
  else if (view === 'board') renderBoard();
  else if (view === 'arrive') renderArrive();
  else renderResults();
}

const photoSrc = () => {
  const p = S.game && S.game.photo;
  if (!p) return null;
  if (p.kind === 'sample') return (photoById(p.id) || PHOTOS[0]).src;
  return S.imageData || null;
};

function joinUrl() {
  const u = new URL('student.html', location.href);
  u.search = '';
  u.searchParams.set('code', S.code);
  if (S.mode !== 'local') {
    const enc = encodeUrl(S.api.url);
    Object.entries(enc).forEach(([k, v]) => u.searchParams.set(k, v));
  } else u.searchParams.set('mode', 'local');
  return u.toString();
}

function shortJoin() {
  const u = new URL('student.html', location.href);
  return u.host + u.pathname;
}

// ════════════════════════════════════════════════
// 2. 대기실
// ════════════════════════════════════════════════

function settingChips() {
  const g = S.game;
  const p = g.photo.kind === 'sample' ? (photoById(g.photo.id) || {}).title : '내가 올린 사진';
  const modeChip = S.mode === 'trial' ? '<span class="chip apricot">체험 서버</span>' : S.mode === 'local' ? '<span class="chip apricot">연습 모드</span>' : '';
  return `${modeChip}<span class="chip cream">${Math.round(g.durationSec / 60)}분</span><span class="chip cream">${g.groupCount}모둠</span><span class="chip cream">${esc(p || '')}</span>${
    g.round > 1 ? `<span class="chip butter">${g.round}번째 판</span>` : ''
  }`;
}

function joinCardHtml() {
  const tiles = S.code
    .split('')
    .map((d) => `<span>${esc(d)}</span>`)
    .join('');
  const share =
    S.mode !== 'local'
      ? `<div class="qr-box" aria-label="모둠 태블릿 입장 QR 코드">${qrSvg(joinUrl())}</div>
         <p class="join-url">모둠 태블릿으로 QR을 찍거나<br><b>${esc(shortJoin())}</b> 에서 코드를 입력해요</p>
         <div class="row" style="justify-content:center"><button type="button" class="btn btn-cream btn-sm" data-act="copy-link">${ICON.copy}입장 링크 복사</button></div>`
      : `<div class="notice" style="text-align:left"><div><strong>연습 모드예요</strong>이 컴퓨터에서 모둠 태블릿 창을 여러 개 열어 미리 해 볼 수 있어요. 다른 기기에서는 들어올 수 없어요.</div></div>
         <div class="row" style="justify-content:center"><button type="button" class="btn btn-apricot btn-sm" data-act="open-student">모둠 태블릿 창 열기</button></div>`;
  return `<div class="eyebrow" style="text-align:center">게임 코드</div>
    <div class="code-tiles" style="margin:14px 0 20px" aria-label="게임 코드 ${esc(S.code.split('').join(' '))}">${tiles}</div>
    <div class="stack" style="gap:14px">${share}</div>`;
}

function renderLobby() {
  if (S.built !== 'lobby') {
    S.built = 'lobby';
    setLayout('normal');
    app.innerHTML = `
      ${topbar(`${settingChips()}<button type="button" class="btn btn-cream btn-sm" data-act="home">${ICON.back}게임 목록</button>`)}
      <div class="lobby">
        <section class="card pad" aria-label="입장 안내">
          <span class="deco butter" style="width:180px;height:180px;left:-70px;top:-80px"></span>
          ${joinCardHtml()}
          <button type="button" class="photo-frame" data-act="photo" style="margin-top:22px" aria-label="제시 사진 크게 보기">
            <img id="lobby-photo" src="${esc(photoSrc() || '')}" alt="학생들에게 보여 줄 사진">
          </button>
        </section>
        <section class="stack" style="gap:18px">
          <div class="card pad" style="padding:24px 28px">
            <span class="deco green" style="width:200px;height:200px;right:-70px;top:-90px"></span>
            <div class="row">
              <div>
                <h1 class="section-title" style="font-size:30px">모둠 대기실</h1>
                <p class="section-desc" id="lobby-desc">모둠 태블릿이 들어와 친구 이름을 쓰면 여기에 보여요.</p>
              </div>
              <div class="spacer"></div>
              <span class="chip" id="count">0모둠</span>
              <button type="button" class="btn btn-apricot btn-lg" data-act="start" id="start-btn">${ICON.play}게임 시작!</button>
            </div>
          </div>
          <div class="notice" style="font-size:17px"><div><strong>모둠 태블릿 돌려쓰기</strong>모둠마다 태블릿 한 대를 두고, 칸을 붙일 때마다 다음 친구에게 넘겨요. 모둠 친구 이름과 차례는 태블릿에서 정해요.</div></div>
          <div class="groups-grid" id="groups"></div>
        </section>
      </div>`;
  }
  const img = $('#lobby-photo');
  if (img && photoSrc() && img.getAttribute('src') !== photoSrc()) img.src = photoSrc();
  const joined = joinedGroups();
  $('#count').textContent = `태블릿 ${joined.length}/${S.game.groupCount}모둠`;
  $('#start-btn').disabled = joined.length === 0;
  $('#lobby-desc').textContent = joined.length ? '모둠 카드를 누르면 태블릿 연결을 풀 수 있어요.' : '모둠 태블릿이 들어와 친구 이름을 쓰면 여기에 보여요.';

  let html = '';
  for (let g = 1; g <= S.game.groupCount; g++) {
    const c = groupColor(g);
    const names = namesOf(g);
    const has = names.length > 0;
    const fresh = isFresh(g);
    html += `<${has ? 'button type="button" data-act="group-menu" data-g="' + g + '"' : 'div'} class="group-card ${has ? 'clickable' : ''}" aria-label="${g}모둠${has ? ' 태블릿 관리' : ''}">
      <div class="gh" style="background:${c.soft};color:${c.ink}">
        <span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>${g}모둠
        <span class="spacer"></span>
        ${has ? `<span class="conn ${fresh ? '' : 'off'}"><span class="dot ${fresh ? '' : 'off'}"></span>${fresh ? '태블릿 연결됨' : '연결 확인 중'}</span>` : ''}
      </div>
      <div class="gb">${
        has
          ? names.map((n, i) => `<span class="pchip" style="cursor:inherit"><span class="ord">${i + 1}</span>${esc(n)}</span>`).join('')
          : '<span class="empty">아직 태블릿이 들어오지 않았어요</span>'
      }</div>
    </${has ? 'button' : 'div'}>`;
  }
  $('#groups').innerHTML = html;
}

function groupMenu(g) {
  const names = namesOf(g);
  const m = openModal(`<h2>${g}모둠 태블릿</h2>
    <p>차례: ${names.map(esc).join(' → ') || '없음'}</p>
    <p style="font-size:16px;color:var(--ink-3)">다른 모둠이 잘못 들어왔거나 태블릿을 바꿔야 할 때 연결을 풀어요. 연결을 풀면 그 태블릿은 모둠 고르기 화면으로 돌아가요.</p>
    <div class="actions">
      <button type="button" class="btn btn-danger" data-release>연결 풀기</button>
      <button type="button" class="btn btn-cream" data-close>닫기</button>
    </div>`);
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-release]')) {
      m.close();
      try {
        const res = await S.api.teacher('releaseGroup', { code: S.code, group: g });
        S.game = res.game;
        render();
        toast(`${g}모둠 태블릿 연결을 풀었어요.`, 'good');
      } catch (err) {
        toast(explain(err), 'warn');
      }
    } else if (e.target.closest('[data-close]')) m.close();
  });
}

async function startGame() {
  const joined = joinedGroups();
  if (!joined.length) return toast('들어온 모둠 태블릿이 아직 없어요.', 'warn');
  const empty = [];
  for (let g = 1; g <= S.game.groupCount; g++) if (!joined.includes(g)) empty.push(g);
  if (empty.length) {
    const ok = await confirmBox({
      title: '게임을 시작할까요?',
      body: esc(`${empty.join(', ')}모둠은 아직 태블릿이 들어오지 않았어요. 게임 중에 들어오면 남은 시간 동안 함께할 수 있어요.`),
      ok: '시작하기',
    });
    if (!ok) return;
  }
  const btn = $('#start-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '출발 신호 보내는 중…';
  }
  try {
    const res = await S.api.teacher('start', { code: S.code });
    S.game = res.game;
    render();
  } catch (e) {
    toast('시작하지 못했어요. ' + explain(e), 'warn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${ICON.play}게임 시작!`;
    }
  }
}

// ════════════════════════════════════════════════
// 3. 진행 (전자칠판): 기차는 터널 속을 달려요
// ════════════════════════════════════════════════

function boardShell(inner, foot) {
  return `
    <header class="topbar">${brandHtml('1차시 · 질문 기차역')}<div class="spacer"></div>
      <span class="chip cream" style="font-size:18px">게임 코드 <b style="letter-spacing:.12em;margin-left:4px">${esc(S.code)}</b></span>
      <button type="button" class="btn btn-ghost btn-sm" data-act="sound" id="sound-btn"></button>
      <button type="button" class="btn btn-cream btn-sm" data-act="join-info">태블릿 입장 안내</button>
    </header>
    ${inner}
    <div class="board-foot">${foot}</div>
    <div id="cover"></div>`;
}

function renderBoard() {
  if (S.built !== 'board') {
    S.built = 'board';
    setLayout('board');
    app.innerHTML = boardShell(
      `<div class="board-head">
        <button type="button" class="photo-frame" data-act="photo" aria-label="제시 사진 크게 보기"><img id="board-photo" src="${esc(photoSrc() || '')}" alt="제시 사진"></button>
        <div class="card rules">
          <span class="chip">태블릿을 차례대로 넘기며 한 칸씩</span>
          <span class="chip butter">앞에 나온 질문과 겹치면 안 돼요</span>
          <span class="chip apricot">기차 길이는 시간이 끝나면 공개!</span>
        </div>
        <div class="card timer-card">
          <div class="lbl" id="timer-lbl">남은 시간</div>
          <div class="timer" id="timer" aria-live="off">--:--</div>
          <div class="progress" aria-hidden="true"><i id="prog" style="width:100%"></i></div>
        </div>
      </div>
      <div class="lanes tunnel-lanes" id="lanes" aria-label="모둠별 기차"></div>`,
      `<div class="cheer">${catSvg(64)}<span class="bubble" id="cheer">곧 출발해요!</span></div>
        <div class="spacer"></div>
        <button type="button" class="btn btn-cream" data-act="pause" id="pause-btn"></button>
        <button type="button" class="btn btn-apricot" data-act="end">${ICON.flag}게임 끝!</button>`
    );
    S._lanesSig = null;
    tick();
  }
  const img = $('#board-photo');
  if (img && photoSrc() && img.getAttribute('src') !== photoSrc()) img.src = photoSrc();
  renderLanes();
  updateSoundBtn();
  updateBoardState();
}

function updateBoardState() {
  const s = st();
  const paused = s.status === 'paused';
  const ready = s.status === 'ready';
  const pb = $('#pause-btn');
  if (pb) {
    pb.innerHTML = paused ? `${ICON.play}다시 출발` : `${ICON.pause}잠깐 멈춤`;
    pb.disabled = ready;
  }
  const lanes = $('#lanes');
  if (lanes) lanes.classList.toggle('moving', s.status === 'playing');
  const cover = $('#cover');
  if (!cover) return;
  let html = '';
  if (paused)
    html = `<div class="pause-cover" role="dialog" aria-label="잠깐 멈춤">${catSvg(120)}<div>잠깐 멈췄어요</div>
        <div style="font-size:20px;font-weight:400;color:var(--ink-2)">남은 시간 ${formatClock(s.remainingMs || 0)}</div>
        <button type="button" class="btn btn-primary btn-lg" data-act="pause">${ICON.play}다시 출발</button></div>`;
  else if (ready) {
    const sec = Math.max(1, Math.ceil((Number(s.goAt) - now()) / 1000));
    const again = Number(s.goAt) !== Number(s.startedAt);
    html = `<div class="pause-cover ready-cover" role="status">${catSvg(110)}
        <div>${again ? '곧 다시 출발해요!' : '곧 출발해요!'}</div>
        <div class="ready-num">${sec}</div>
        <div style="font-size:20px;font-weight:400;color:var(--ink-2)">${again ? '태블릿을 받은 친구부터 이어서 써요' : '태블릿은 첫 번째 친구가 들고 있어요'}</div></div>`;
  }
  const key = paused ? 'p' + s.remainingMs : ready ? 'r' + html.length + Math.ceil((Number(s.goAt) - now()) / 1000) : '';
  if (cover.dataset.key !== key) {
    cover.dataset.key = key;
    cover.innerHTML = html;
  }
}

function updateSoundBtn() {
  const b = $('#sound-btn');
  if (!b) return;
  const on = isSoundOn('teacher');
  b.innerHTML = `${on ? SOUND_ICON.on : SOUND_ICON.off}${on ? '소리 켜짐' : '소리 꺼짐'}`;
  b.setAttribute('aria-pressed', String(on));
}

// 진행 화면에 보이는 모둠: 태블릿이 들어온 모둠
function boardGroups() {
  const set = new Set(joinedGroups());
  Object.keys((S.game && S.game.subs) || {}).forEach((g) => {
    if (arrived(g)) set.add(Number(g));
  });
  return [...set].sort((a, b) => a - b);
}

function renderLanes() {
  const lanesEl = $('#lanes');
  if (!lanesEl) return;
  const groups = boardGroups();
  const sig = JSON.stringify([groups, groups.map((g) => [namesOf(g), isFresh(g)]), lanesEl.clientWidth, lanesEl.clientHeight, window.innerWidth]);
  if (sig === S._lanesSig) return;
  S._lanesSig = sig;
  if (!groups.length) {
    lanesEl.innerHTML = `<div class="card empty-state">아직 들어온 모둠 태블릿이 없어요. 태블릿이 들어오면 기차가 나타나요.</div>`;
    return;
  }
  const compact = groups.length > 5;
  lanesEl.classList.toggle('compact', compact);
  const laneGap = compact ? 8 : 12;
  const stacked = window.innerWidth <= 900;
  const boxH = lanesEl.clientHeight || 600;
  const laneH = Math.max(stacked ? 104 : 76, Math.min(stacked ? 170 : 128, Math.floor((boxH - laneGap * (groups.length - 1)) / groups.length)));
  const trackH = laneH - (stacked ? 52 : 22);
  lanesEl.style.setProperty('--lane-h', laneH + 'px');
  lanesEl.style.setProperty('--track-h', trackH + 'px');
  const locoH = Math.max(34, Math.min(66, trackH - 18));
  const locoW = Math.round((locoH * 86) / 64);
  const carW = Math.max(26, Math.min(54, Math.floor((trackH - 26) / 0.86)));
  // 기관차와 두 칸 반만 보이고, 나머지는 긴 터널 언덕 속에 숨어 있다
  const hillLeft = locoW + 2 + Math.round(2.45 * (carW + 6));
  const hillH = Math.max(40, trackH - 2);

  lanesEl.innerHTML = groups
    .map((g) => {
      const c = groupColor(g);
      const names = namesOf(g);
      const fresh = isFresh(g);
      let cars = '';
      for (let i = 0; i < 4; i++) cars += `<span class="car" style="--w:${carW}px;--car-bg:${c.soft}">?</span>`;
      return `<div class="lane tunnel-lane" aria-label="${g}모둠 기차가 터널 속을 달리는 중">
        <div class="who">
          <div class="gname"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>모둠</div>
          <div class="turn-now">${names.length ? esc(names.join(' · ')) : '태블릿 연결이 풀렸어요'}</div>
        </div>
        <div class="track">
          <div class="train" style="--gap:6px">${locoSvg(c.main, String(g), locoH)}${cars}</div>
          <div class="hill" style="left:${hillLeft}px;height:${hillH}px;--hill-h:${hillH}px">${portalSvg(Math.round(hillH * 0.92))}
            <span class="hill-text">몇 칸일까요?</span>${treeSvg(Math.round(hillH * 0.42))}</div>
        </div>
        <div class="lane-status ${fresh ? '' : 'off'}"><span class="dot ${fresh ? '' : 'off'}"></span>${fresh ? '달리는 중' : '연결 확인 중'}</div>
      </div>`;
    })
    .join('');
}

const CHEERS = [
  '터널 속 기차는 몇 칸일까요? 시간이 끝나면 공개돼요!',
  '칸을 붙였으면 태블릿을 다음 친구에게 넘겨요',
  '엉뚱한 질문도 좋아요. 궁금한 건 무엇이든!',
  '앞 친구 질문을 잘 읽고 겹치지 않게 이어 가요',
];

function updateCheer(s, rem) {
  const el = $('#cheer');
  if (!el) return;
  let msg;
  if (s.status === 'ready') msg = '곧 출발해요! 첫 번째 친구가 태블릿을 들어요';
  else if (s.status === 'paused') msg = '잠깐 쉬어 가요';
  else if (rem < 60000) msg = '1분도 안 남았어요! 마지막까지 질문을 이어 가요';
  else msg = CHEERS[Math.floor((now() / 15000) % CHEERS.length)];
  if (el.textContent !== msg) el.textContent = msg;
}

function tick() {
  if (!S.code || !S.game) return;
  const t = now();
  const s = st();
  S.fx.update(s, t);
  // 다시 출발하는 순간 (잠깐 멈춤 뒤)
  if (s.status === 'playing' && s.goAt && Number(s.goAt) !== Number(s.startedAt) && S.lastGoAt !== s.goAt && t - Number(s.goAt) < 3000) {
    S.lastGoAt = s.goAt;
    if (isSoundOn('teacher')) bell({ strikes: 1, base: 880 });
    flashBanner('다시 출발!', '', 1400);
  }
  const view = viewFor(s);
  if (view !== S.view) return render();
  if (view === 'board') {
    const rem = remainingOf(s, t, S.game.durationSec);
    const timer = $('#timer');
    if (timer) {
      timer.textContent = formatClock(rem);
      timer.classList.toggle('low', s.status === 'playing' && rem < 30000);
      $('#prog').style.width = `${Math.max(0, Math.min(100, (rem / (S.game.durationSec * 1000)) * 100))}%`;
      $('#timer-lbl').textContent = s.status === 'paused' ? '멈춤' : s.status === 'ready' ? '출발 준비' : '남은 시간';
    }
    updateCheer(s, rem);
    updateBoardState();
  }
  // 마감 시각이 지나면 서버에도 끝났다고 적어 둔다 (목록 표시용)
  if (s.status === 'ended' && S.game.status !== 'ended' && !S.ending) {
    S.ending = true;
    S.api
      .teacher('end', { code: S.code })
      .then((r) => {
        S.game = r.game;
      })
      .catch(() => {})
      .finally(() => (S.ending = false));
  }
}

async function togglePause() {
  const s = st();
  try {
    let res;
    if (s.status === 'playing') res = await S.api.teacher('pause', { code: S.code });
    else if (s.status === 'paused') res = await S.api.teacher('resume', { code: S.code });
    else return;
    S.game = res.game;
    render();
  } catch (e) {
    toast('바꾸지 못했어요. 다시 눌러 주세요.', 'warn');
  }
}

async function endNow() {
  const ok = await confirmBox({
    title: '게임을 끝낼까요?',
    body: '남은 시간과 상관없이 바로 끝나요. 모둠 태블릿이 기차를 보내면 순위를 발표할 수 있어요.',
    ok: '끝내기',
  });
  if (!ok) return;
  try {
    const res = await S.api.teacher('end', { code: S.code });
    S.game = res.game;
    render();
  } catch (e) {
    toast('끝내지 못했어요. ' + explain(e), 'warn');
  }
}

function joinInfo() {
  const m = openModal(`<div style="text-align:center">${joinCardHtml()}</div>
    <div class="actions" style="margin-top:18px"><button type="button" class="btn btn-cream" data-close>닫기</button></div>`);
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) m.close();
    else if (e.target.closest('[data-act="copy-link"]')) copyLink();
    else if (e.target.closest('[data-act="open-student"]')) openStudentWindow();
  });
}

async function copyLink() {
  const ok = await copyText(joinUrl());
  toast(ok ? '입장 링크를 복사했어요. 클래스룸이나 패들렛에 붙여 넣어 주세요.' : '복사하지 못했어요.', ok ? 'good' : 'warn');
}

function openStudentWindow() {
  window.open(joinUrl(), '_blank', 'noopener');
}

// ════════════════════════════════════════════════
// 4. 도착 → 두구두구 순위 발표
// ════════════════════════════════════════════════

function renderArrive() {
  if (S.built !== 'arrive') {
    S.built = 'arrive';
    setLayout('board');
    app.innerHTML = boardShell(
      `<section class="card pad arrive-card">
        <span class="deco butter" style="width:280px;height:280px;right:-90px;top:-120px"></span>
        <div class="mascot-row">${catSvg(96)}<div class="bubble" id="arrive-bubble">땡! 기차들이 역으로 들어오고 있어요.<br>모든 기차가 도착하면 순위를 발표해요.</div></div>
        <h1 class="display arrive-title">기차가 역에 도착하는 중</h1>
        <div class="arrive-grid" id="arrive-grid"></div>
      </section>`,
      `<div class="cheer"><span class="bubble" id="arrive-count"></span></div>
        <div class="spacer"></div>
        <button type="button" class="btn btn-primary btn-lg reveal-btn" data-act="reveal" id="reveal-btn">${ICON.star}두구두구 순위 발표!</button>`
    );
  }
  updateSoundBtn();
  const groups = boardGroups();
  const got = groups.filter((g) => arrived(g));
  $('#arrive-grid').innerHTML = groups
    .map((g) => {
      const c = groupColor(g);
      const ok = arrived(g);
      return `<div class="arrive-item ${ok ? 'ok' : ''}" style="--soft:${c.soft};--main:${c.main}">
        ${locoSvg(c.main, String(g), 54)}
        <div><div class="gn">${g}모둠</div><div class="as">${ok ? `${ICON.check}도착!` : '<span class="dots"><i></i><i></i><i></i></span>들어오는 중'}</div></div>
      </div>`;
    })
    .join('');
  $('#arrive-count').textContent = groups.length ? `도착한 기차 ${got.length} / ${groups.length}` : '들어온 모둠이 없어요';
  $('#reveal-btn').disabled = S.revealing || got.length === 0;
}

async function reveal() {
  if (S.revealing) return;
  const groups = boardGroups();
  const missing = groups.filter((g) => !arrived(g));
  if (missing.length) {
    const ok = await confirmBox({
      title: '지금 순위를 발표할까요?',
      body: esc(`${missing.join(', ')}모둠 기차가 아직 도착하지 않았어요. 태블릿이 연결되면 결과에 나중에 더해져요.`),
      ok: '발표하기',
    });
    if (!ok) return;
  }
  S.revealing = true;
  const btn = $('#reveal-btn');
  if (btn) btn.disabled = true;
  try {
    const sound = isSoundOn('teacher');
    const layer = drumLayer();
    const wait = (sound ? drumroll({ dur: 2.2 }) : 1.6) * 1000;
    const [res] = await Promise.all([S.api.teacher('reveal', { code: S.code }), new Promise((r) => setTimeout(r, wait))]);
    S.game = res.game;
    S.results = res.results || {};
    S.subsSig = JSON.stringify([S.game.round, S.game.subs, S.game.revealedAt]);
    layer.remove();
    if (sound) {
      fanfare();
      setTimeout(() => bell({ strikes: 1, base: 988 }), 520);
    }
    render();
  } catch (e) {
    document.querySelectorAll('.drum-layer').forEach((x) => x.remove());
    toast('발표하지 못했어요. ' + explain(e), 'warn');
    if (btn) btn.disabled = false;
  } finally {
    S.revealing = false;
  }
}

function drumLayer() {
  const el = document.createElement('div');
  el.className = 'drum-layer';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="drum-card"><div class="drum">${drumSvg(130)}</div><div class="fx-title">두구두구…</div><div class="fx-sub">가장 긴 질문 기차는?</div></div>`;
  document.body.appendChild(el);
  return el;
}

// ════════════════════════════════════════════════
// 5. 결과
// ════════════════════════════════════════════════

function resultGroups() {
  const r = S.results || {};
  const all = new Set([...Object.keys(r), ...joinedGroups().map(String)]);
  const out = [];
  [...all]
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((g) => {
      const x = r[g] || { names: namesOf(g), cars: [] };
      out.push({ g, names: x.names && x.names.length ? x.names : namesOf(g), cars: x.cars || [], arrived: arrived(g) });
    });
  return out;
}

function renderResults() {
  const sig = JSON.stringify([S.results, S.game.subs, S.game.groups]);
  if (S.built === 'results' && S.resultsSig === sig) return;
  const first = S.built !== 'results';
  S.resultsSig = sig;
  S.built = 'results';
  setLayout('normal');
  const all = resultGroups();
  const shown = all.filter((x) => x.arrived || x.cars.length);
  const missing = all.filter((x) => !x.arrived && !x.cars.length);
  const lens = {};
  shown.forEach((x) => (lens[x.g] = x.cars.length));
  const ranks = ranking(lens);
  const top = ranks.filter((r) => r.rank === 1 && r.len > 0).map((r) => r.g);
  const total = Object.values(lens).reduce((a, b) => a + b, 0);
  const headline = top.length === 0 ? '모든 기차가 역에 도착했어요!' : top.length === 1 ? `가장 긴 기차는 ${top[0]}모둠!` : `${top.join(', ')}모둠이 공동 1등!`;

  // 꼴찌부터 차례로 나타나고 1등이 마지막에 나온다
  const podium = ranks
    .map((r, i) => {
      const c = groupColor(r.g);
      const delay = first ? (ranks.length - 1 - i) * 0.35 : 0;
      return `<div class="rank-card ${r.rank === 1 && r.len > 0 ? 'first' : ''} ${first ? 'pop-in' : ''}" style="animation-delay:${delay}s">
        <div class="rk" style="color:${c.ink}">${r.rank}</div>
        <div><div class="gn">${r.g}모둠</div><div class="ln">${r.len}칸</div></div>
        <span class="spacer"></span>${locoSvg(c.main, String(r.g), 40)}
      </div>`;
    })
    .join('');

  const sections = ranks
    .map((r) => {
      const x = shown.find((y) => y.g === r.g);
      const c = groupColor(r.g);
      const cars = x.cars.length
        ? x.cars
            .map(
              (car) => `<div class="qcar" style="background:${c.soft}">
            <div class="meta"><span>${car.no}칸 · ${esc(car.name || '')}</span></div>
            <div class="q">${esc(car.text)}</div>
            <button type="button" class="del" data-act="del-car" data-g="${r.g}" data-no="${car.no}" aria-label="이 칸 지우기">지우기</button>
          </div>`
            )
            .join('')
        : '<div class="empty-state" style="padding:10px">붙인 칸이 없어요.</div>';
      return `<section class="card result-group" aria-label="${r.g}모둠 질문">
        <div class="rh"><span class="badge" style="background:${c.main};color:#3b2a1a">${r.g}</span><span class="gn">${r.g}모둠</span>
          <span class="chip" style="background:${c.soft};color:${c.ink}">${x.cars.length}칸</span>
          <span style="color:var(--ink-3)">${esc(x.names.join(', '))}</span></div>
        <div class="qcars wrap">${cars}</div>
      </section>`;
    })
    .join('');

  const missingNote = missing.length
    ? `<div class="notice apricot" style="margin-top:16px"><div><strong>${missing.map((x) => x.g).join(', ')}모둠 기차가 아직 도착하지 않았어요</strong>그 모둠 태블릿의 인터넷 연결을 확인해 주세요. 도착하면 이 화면에 저절로 더해져요.</div></div>`
    : '';

  const trialNote =
    S.mode === 'trial'
      ? `<div class="notice" style="margin-top:16px"><div><strong>체험 서버 기록은 ${TRIAL_RULES.keepHours}시간 뒤 지워져요</strong>질문을 남겨 두려면 위쪽 <b>질문 내려받기</b>로 CSV 파일을 저장해 두세요.</div></div>`
      : '';
  const sheetBtn =
    S.mode === 'sheet' && S.sheetUrl
      ? `<a class="btn btn-cream btn-sm" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">${ICON.sheet}구글 시트 열기</a>`
      : '';

  app.innerHTML = `
    ${topbar(`<button type="button" class="btn btn-cream btn-sm" data-act="csv">${ICON.download}질문 내려받기</button>
      ${sheetBtn}
      <button type="button" class="btn btn-cream btn-sm" data-act="again">같은 모둠으로 한 판 더</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="home">새 게임 만들기</button>`)}
    <section class="card pad-lg">
      <span class="deco butter" style="width:300px;height:300px;right:-100px;top:-120px"></span>
      <span class="deco green" style="width:200px;height:200px;left:-70px;bottom:-100px"></span>
      <div class="mascot-row" style="margin-bottom:6px">${catSvg(96)}<div class="bubble">도착! 모든 기차가 역에 들어왔어요.<br>우리 반이 만든 질문은 모두 <b>${total}개</b>예요.</div></div>
      <h1 class="display ${first ? 'pop-in' : ''}" style="font-size:clamp(36px,5vw,62px);margin:18px 0 22px;animation-delay:${first ? ranks.length * 0.35 : 0}s">${esc(headline)}</h1>
      <div class="podium">${podium}</div>
      ${missingNote}
      ${trialNote}
    </section>
    <section class="card pad" style="margin-top:20px;background:var(--green-softer)">
      <div class="row"><span class="chip">함께 생각해요</span></div>
      <p style="font-size:clamp(22px,2.6vw,30px);font-weight:700;margin:12px 0 4px">오늘 질문 중에 진짜 알아보고 싶은 질문이 있었나요?</p>
      <p class="section-desc">다른 모둠 기차를 둘러보며 "이건 정말 궁금해!" 하는 질문을 찾아보세요.</p>
    </section>
    <div class="stack" style="margin-top:20px;gap:18px">${sections}</div>
    <div class="row" style="margin-top:28px;justify-content:center">
      <button type="button" class="btn btn-danger" data-act="delete-room">${ICON.trash}게임 정리하기</button>
    </div>`;
  if (!S.sheetUrl && S.mode === 'sheet') {
    S.api
      .teacher('listGames')
      .then((r) => {
        if (r.sheetUrl) {
          S.sheetUrl = r.sheetUrl;
          S.built = null;
          render();
        }
      })
      .catch(() => {});
  }
}

function exportCsv() {
  const rows = [['모둠', '칸 번호', '이름', '질문', '시각']];
  resultGroups().forEach((x) => {
    x.cars.forEach((c) => rows.push([`${x.g}모둠`, c.no, c.name || '', c.text, String(c.time || '').slice(11)]));
  });
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  downloadText(`질문기차게임_${S.code}_${S.game.round > 1 ? S.game.round + '판_' : ''}${stamp}.csv`, csv);
  toast('질문을 내려받았어요. 엑셀에서 열 수 있어요.', 'good');
}

async function playAgain() {
  const ok = await confirmBox({
    title: '같은 모둠으로 한 판 더 할까요?',
    body: '모둠 태블릿과 친구 이름은 그대로 대기실로 돌아가요. 이번 판 질문은 구글 시트에 그대로 남아 있어요.',
    ok: '한 판 더 하기',
  });
  if (!ok) return;
  try {
    const res = await S.api.teacher('playAgain', { code: S.code });
    S.game = res.game;
    S.results = null;
    render();
  } catch (e) {
    toast('바꾸지 못했어요. ' + explain(e), 'warn');
  }
}

// 게임 정리: 진행 정보만 지우거나, 시트의 질문 기록까지 지운다.
function askDelete(code) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(
      `<h2>${esc(code)} 게임을 정리할까요?</h2>
       <p>게임 코드와 모둠 태블릿 연결, 올린 사진이 지워져요.<br>구글 시트의 질문 기록은 남겨 둘 수도 있어요.</p>
       <div class="actions" style="flex-wrap:wrap">
         <button type="button" class="btn btn-cream" data-v="cancel">취소</button>
         <button type="button" class="btn btn-primary" data-v="keep">질문 기록은 남기고 정리</button>
         <button type="button" class="btn btn-danger" data-v="all">질문 기록까지 모두 지우기</button>
       </div>`,
      {
        onClose: () => {
          if (!done) resolve(null);
        },
      }
    );
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      done = true;
      resolve(b.dataset.v === 'cancel' ? null : { rows: b.dataset.v === 'all' });
      m.close();
    });
  });
}

async function deleteGame(code, api) {
  let choice;
  if (api.kind === 'trial' || api.kind === 'local') {
    const ok = await confirmBox({
      title: `${code} 게임을 지울까요?`,
      body: api.kind === 'trial' ? '체험 서버에 있는 이 게임의 질문 기록까지 모두 지워져요. 지운 뒤에는 되돌릴 수 없어요.' : '이 게임과 질문 기록이 모두 지워져요.',
      ok: '모두 지우기',
      danger: true,
    });
    choice = ok ? { rows: true } : null;
  } else choice = await askDelete(code);
  if (!choice) return false;
  try {
    await api.teacher('deleteGame', { code, rows: choice.rows });
    toast(choice.rows ? '게임과 질문 기록을 모두 지웠어요.' : '게임을 정리했어요. 질문 기록은 시트에 남아 있어요.', 'good');
    return true;
  } catch (e) {
    toast('지우지 못했어요. ' + explain(e), 'warn');
    return false;
  }
}

// ════════════════════════════════════════════════
// 클릭 처리
// ════════════════════════════════════════════════

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const f = S.form;
  switch (act) {
    case 'mode':
      f.mode = el.dataset.mode;
      renderHome();
      loadGameList();
      break;
    case 'photo':
      if (S.view === 'home') {
        f.photo = { kind: 'sample', id: el.dataset.id };
        renderHome();
        loadGameList();
      } else if (photoSrc()) showPhoto(photoSrc());
      break;
    case 'upload':
      $('#file').click();
      break;
    case 'minutes':
      f.minutes = Number(el.dataset.v);
      renderHome();
      loadGameList();
      break;
    case 'groups-dec':
      f.groups = Math.max(MIN_GROUPS, f.groups - 1);
      renderHome();
      loadGameList();
      break;
    case 'groups-inc':
      f.groups = Math.min(MAX_GROUPS, f.groups + 1);
      renderHome();
      loadGameList();
      break;
    case 'dup':
      f.dupMode = el.dataset.v;
      renderHome();
      loadGameList();
      break;
    case 'create':
      createGame();
      break;
    case 'open-room':
      openGame(f.mode, el.dataset.code).catch((err) => {
        toast(explain(err), 'warn');
        showHome();
      });
      break;
    case 'del-room': {
      const api = await getApi(f.mode).catch(() => null);
      if (api && (await deleteGame(el.dataset.code, api))) loadGameList();
      break;
    }
    case 'home':
      showHome();
      break;
    case 'copy-link':
      copyLink();
      break;
    case 'open-student':
      openStudentWindow();
      break;
    case 'group-menu':
      groupMenu(Number(el.dataset.g));
      break;
    case 'start':
      startGame();
      break;
    case 'pause':
      togglePause();
      break;
    case 'end':
      endNow();
      break;
    case 'reveal':
      reveal();
      break;
    case 'join-info':
      joinInfo();
      break;
    case 'sound':
      setSoundOn('teacher', !isSoundOn('teacher'));
      updateSoundBtn();
      if (isSoundOn('teacher')) beep({ freq: 880, dur: 0.12, vol: 0.3 });
      toast(isSoundOn('teacher') ? '효과음을 켰어요.' : '효과음을 껐어요.');
      break;
    case 'csv':
      exportCsv();
      break;
    case 'again':
      playAgain();
      break;
    case 'delete-room': {
      const { api, code } = S;
      if (await deleteGame(code, api)) showHome();
      break;
    }
    case 'del-car': {
      const ok = await confirmBox({ title: '이 칸을 지울까요?', body: '부적절한 질문일 때만 지워 주세요. 구글 시트에서도 지워지고 칸 번호가 다시 매겨져요.', ok: '지우기', danger: true });
      if (!ok) return;
      try {
        const res = await S.api.teacher('deleteCar', { code: S.code, group: el.dataset.g, round: S.game.round, no: Number(el.dataset.no) });
        S.game = res.game;
        S.results = res.results;
        S.subsSig = JSON.stringify([S.game.round, S.game.subs, S.game.revealedAt]);
        render();
      } catch (err) {
        toast('지우지 못했어요. ' + explain(err), 'warn');
      }
      break;
    }
  }
});

window.addEventListener('resize', () => {
  if (S.view === 'board') renderLanes();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.code) poll();
});

// ════════════════════════════════════════════════
// 시작
// ════════════════════════════════════════════════

(async function boot() {
  const p = new URLSearchParams(location.search);
  const room = p.get('room');
  if (room) {
    const m = p.get('mode');
    const mode = m === 'local' || m === 'trial' ? m : 'sheet';
    try {
      await openGame(mode, room);
      return;
    } catch (e) {
      console.warn(e);
      toast(explain(e), 'warn');
    }
  }
  showHome();
})();
