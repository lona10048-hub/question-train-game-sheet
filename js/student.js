// 모둠 태블릿 화면 (구글 시트 버전)
// 코드 입력 → 모둠 고르기 → 친구 이름·차례 정하기 → 대기 → 게임(태블릿 돌려쓰기) → 도착 → 결과
// 차례 넘기기와 겹치는 질문 검사는 이 태블릿 안에서 바로 처리하고,
// 서버(구글 시트)와는 입장할 때, 상태를 확인할 때, 시간이 끝나 기차를 보낼 때만 이야기한다.

import { $, esc, toast, confirmBox, showPhoto, watchConnection, brandHtml, catSvg, locoSvg, tunnelSvg, ICON, isComposingEnter } from './ui.js';
import { PHOTOS, photoById, groupColor, cleanQuestion, cleanName, findOverlap, normalizeQuestion, formatClock, ranking, MAX_TEXT, NAME_MAX } from './game.js';
import { createTimerFx, isSoundOn, setSoundOn, SOUND_ICON, bell, beep, flashBanner } from './effects.js';
import { getLocalApi, getServerApi, getTabletUrl, saveTabletUrl, trialUrl, decodeUrlParams, explainError, deriveState, remainingOf, pollMs } from './api.js';

const app = document.getElementById('app');
const SESSION_KEY = 'qtg-sheet-tablet';
const MAX_MEMBERS = 8;

const T = {
  api: null,
  mode: null,
  code: null,
  game: null,
  group: null,
  token: null,
  names: [],
  round: null,
  cars: [],
  turn: 0,
  sub: { state: 'idle', round: null, count: 0 },
  results: null,
  resultsSig: '',
  view: 'join',
  built: null,
  draftNames: null,
  pending: null,
  imageData: null,
  loop: null,
  pollTimer: null,
  submitTimer: null,
  stopConn: null,
  fx: createTimerFx('student'),
  lastGoAt: null,
  resultTab: null,
};

// 연습 모드는 창마다 다른 태블릿이라 sessionStorage, 실제 태블릿은 껐다 켜도 이어지도록 localStorage
const store = () => (T.mode === 'local' ? sessionStorage : localStorage);

function saveSession() {
  if (!T.code) return;
  try {
    store().setItem(
      SESSION_KEY,
      JSON.stringify({
        mode: T.mode,
        url: T.api && T.api.url ? T.api.url : null,
        code: T.code,
        group: T.group,
        token: T.token,
        names: T.names,
        round: T.round,
        cars: T.cars,
        turn: T.turn,
        sub: T.sub.state === 'done' ? { state: 'done', round: T.sub.round, count: T.sub.count } : null,
      })
    );
  } catch (e) {}
}

function loadSession(mode) {
  try {
    const raw = (mode === 'local' ? sessionStorage : localStorage).getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

const now = () => (T.api ? T.api.serverNow() : Date.now());
const isTrial = () => !!((T.game && T.game.shared) || (T.api && T.api.kind === 'trial'));
const st = () => deriveState(T.game, now());

function topbar(right = '') {
  const sub = T.group ? `${T.group}모둠 태블릿` : '모둠 태블릿용 · 질문 기차역';
  return `<header class="topbar">${brandHtml(sub)}<div class="spacer"></div>${right}</header>`;
}

function soundBtn() {
  const on = isSoundOn('student');
  return `<button type="button" class="btn btn-ghost btn-sm" data-act="sound" id="sound-btn" aria-pressed="${on}">${on ? SOUND_ICON.on : SOUND_ICON.off}${on ? '소리 켜짐' : '소리 꺼짐'}</button>`;
}

const photoSrc = () => {
  const p = T.game && T.game.photo;
  if (!p) return null;
  if (p.kind === 'sample') return (photoById(p.id) || PHOTOS[0]).src;
  return T.imageData || null;
};

// ════════════════════════════════════════════════
// 1. 게임 코드 입력
// ════════════════════════════════════════════════

function renderJoin(prefill = '', error = '') {
  stopLoops();
  T.view = 'join';
  T.built = null;
  app.innerHTML = `
    ${topbar(`<a class="btn btn-cream btn-sm" href="index.html">${ICON.back}처음으로</a>`)}
    <section class="card pad-lg center-card" aria-labelledby="h">
      <span class="deco butter" style="width:220px;height:220px;right:-80px;top:-90px"></span>
      <span class="deco green" style="width:160px;height:160px;left:-60px;bottom:-70px"></span>
      <div class="mascot-row" style="margin-bottom:18px">${catSvg(92)}<div class="bubble">우리 모둠 태블릿이에요!<br>선생님이 알려 준 <b>게임 코드</b>를 입력해 봐요.</div></div>
      <h1 id="h" class="sr-only">질문 기차 게임 입장</h1>
      <form id="join-form" class="stack" style="gap:20px" novalidate>
        <div class="field">
          <label for="code">게임 코드</label>
          <input class="input code" id="code" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*" placeholder="0000" value="${esc(prefill)}">
        </div>
        <div id="join-err" aria-live="assertive">${error ? `<div class="notice apricot"><div>${esc(error)}</div></div>` : ''}</div>
        <button type="submit" class="btn btn-apricot btn-lg" id="join-btn">들어가기 ${ICON.arrow}</button>
      </form>
    </section>`;
  const codeEl = $('#code');
  codeEl.addEventListener('input', () => {
    codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 4);
  });
  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    findGame($('#code').value.trim());
  });
  setTimeout(() => {
    if (T.view === 'join' && $('#code')) $('#code').focus();
  }, 50);
}

function joinError(msg) {
  const box = $('#join-err');
  if (box) box.innerHTML = `<div class="notice apricot"><div>${esc(msg)}</div></div>`;
  const btn = $('#join-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `들어가기 ${ICON.arrow}`;
  }
}

// 어느 서버에 있는 게임인지 찾는다: 이 태블릿이 기억하는 서버(QR 링크) → 체험 서버 → 연습 모드
function serverCandidates() {
  if (urlMode === 'local') return ['local'];
  const out = [];
  const remembered = getTabletUrl();
  if (remembered) out.push(remembered);
  const trial = trialUrl();
  if (trial && trial !== remembered) out.push(trial);
  out.push('local');
  return out;
}

async function apiFor(target) {
  return target === 'local' ? getLocalApi() : getServerApi(target);
}

async function findGame(code) {
  if (!/^\d{4}$/.test(code)) return joinError('게임 코드 4자리를 입력해 주세요.');
  const btn = $('#join-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '찾는 중…';
  }
  let lastErr = null;
  const tries = serverCandidates();
  for (const target of tries) {
    try {
      const api = await apiFor(target);
      const res = await api.call('info', { code });
      if (target !== 'local') saveTabletUrl(target);
      // 이 태블릿이 같은 게임에 들어가 있었다면 붙인 칸과 차례를 이어서 쓴다
      const sess = savedSessionFor(code, target);
      if (sess) return restore(sess, api, res.game);
      setApi(api, target === 'local' ? 'local' : 'sheet');
      T.code = code;
      T.game = res.game;
      T.round = res.game.round;
      loadPhoto();
      startLoops();
      go();
      return;
    } catch (e) {
      lastErr = e;
      if (e.code !== 'NO_GAME') break;
    }
  }
  if (tries.length === 1 && tries[0] === 'local' && urlMode !== 'local')
    return joinError('이 태블릿에서 처음 들어왔다면 선생님 화면의 QR 코드를 찍거나, 선생님이 보내 준 링크로 들어와 주세요.');
  joinError(explainError(lastErr, 'student'));
}

function savedSessionFor(code, target) {
  const sess = target === 'local' ? loadSession('local') : loadSession('sheet');
  if (!sess || sess.code !== code) return null;
  if (target === 'local' ? sess.mode !== 'local' : sess.url !== target) return null;
  return sess;
}

function restore(sess, api, game) {
  setApi(api, sess.mode === 'local' ? 'local' : 'sheet');
  Object.assign(T, {
    code: sess.code,
    group: sess.group,
    token: sess.token,
    names: sess.names || [],
    round: sess.round,
    cars: sess.cars || [],
    turn: sess.turn || 0,
    sub: sess.sub && sess.sub.state === 'done' ? sess.sub : { state: 'idle', round: null, count: 0 },
  });
  applyGame(game);
  loadPhoto();
  startLoops();
  render();
}

function setApi(api, mode) {
  T.api = api;
  T.mode = mode;
  if (T.stopConn) T.stopConn();
  T.stopConn = watchConnection(api);
}

function loadPhoto() {
  if (T.game && T.game.photo && T.game.photo.kind === 'upload' && !T.imageData) {
    T.api
      .call('photo', { code: T.code })
      .then((r) => {
        T.imageData = r.data;
        const img = $('#play-photo');
        if (img && r.data) img.src = r.data;
      })
      .catch(() => setTimeout(loadPhoto, 4000));
  }
}

// ════════════════════════════════════════════════
// 상태 확인 (주기적으로 서버에 물어보기)
// ════════════════════════════════════════════════

function stopLoops() {
  clearInterval(T.loop);
  clearTimeout(T.pollTimer);
  clearTimeout(T.submitTimer);
  T.loop = null;
  T.pollTimer = null;
  T.submitTimer = null;
}

function startLoops() {
  stopLoops();
  T.loop = setInterval(tick, 250);
  poll();
}

function pollDelay() {
  const P = (name) => pollMs(T.api, name);
  if (document.hidden) return P('hidden');
  const s = st();
  if (!s) return P('tabletLobby');
  if (s.status === 'playing' || s.status === 'paused' || s.status === 'ready') return P('tabletPlay');
  if (s.status === 'ended') return T.game.revealedAt ? P('tabletDone') : P('tabletWaitReveal');
  return P('tabletLobby');
}

async function poll() {
  clearTimeout(T.pollTimer);
  if (!T.code || !T.api) return;
  const code = T.code;
  try {
    const res = await T.api.call('poll', { code, group: T.group || '', token: T.token || '' });
    if (T.code !== code) return;
    if (res.gone) return gone('선생님이 게임을 정리했어요. 새 게임 코드를 입력해 주세요.');
    applyGame(res.game);
    if (T.group && T.token && res.mine === false) {
      toast('선생님이 이 태블릿의 모둠 연결을 풀었어요. 모둠을 다시 골라 주세요.', 'warn');
      T.group = null;
      T.token = null;
      T.cars = [];
      T.turn = 0;
      saveSession();
    }
    if (T.game.revealedAt && T.group) await loadResults();
    render();
  } catch (e) {
    if (e.code === 'NO_GAME') return gone('선생님이 게임을 정리했어요. 새 게임 코드를 입력해 주세요.');
  } finally {
    if (T.code === code) T.pollTimer = setTimeout(poll, pollDelay());
  }
}

function applyGame(game) {
  T.game = game;
  // 선생님이 "한 판 더"를 누르면 새 판: 이 태블릿의 기차를 비운다
  if (T.round !== game.round) {
    T.round = game.round;
    T.cars = [];
    T.turn = 0;
    T.sub = { state: 'idle', round: null, count: 0 };
    T.results = null;
    T.resultsSig = '';
    T.resultTab = null;
    T.pending = null;
    saveSession();
  }
}

function gone(msg) {
  const code = T.code;
  stopLoops();
  clearSession();
  Object.assign(T, { code: null, game: null, group: null, token: null, names: [], cars: [], turn: 0, results: null });
  renderJoin('', msg);
  void code;
}

async function loadResults() {
  const sig = JSON.stringify([T.game.round, T.game.subs, T.game.revealedAt]);
  if (T.results && sig === T.resultsSig) return;
  try {
    const res = await T.api.call('results', { code: T.code });
    T.results = res.results || {};
    T.resultsSig = sig;
  } catch (e) {}
}

// ════════════════════════════════════════════════
// 화면 고르기
// ════════════════════════════════════════════════

function viewFor() {
  const s = st();
  if (!T.game || !s) return 'join';
  if (!T.group || !T.token) return T.draftNames ? 'names' : 'pick';
  if (T.draftNames) return 'names';
  if (s.status === 'lobby') return 'wait';
  if (s.status === 'ended') return T.game.revealedAt && T.results ? 'done' : 'arrived';
  return 'play';
}

function go() {
  render();
}

function render() {
  if (!T.game) return;
  const view = viewFor();
  if (view !== T.view) {
    T.view = view;
    T.built = null;
    window.scrollTo(0, 0);
  }
  if (view === 'pick') renderPick();
  else if (view === 'names') renderNames();
  else if (view === 'wait') renderWait();
  else if (view === 'play') renderPlay();
  else if (view === 'arrived') renderArrived();
  else if (view === 'done') renderDone();
}

function leaveBtn() {
  return `<button type="button" class="btn btn-ghost btn-sm" data-act="exit">나가기</button>`;
}

// ════════════════════════════════════════════════
// 2. 모둠 고르기
// ════════════════════════════════════════════════

function renderPick() {
  const sig = JSON.stringify([T.game.groups, T.game.status]);
  if (T.built === 'pick' && T._pickSig === sig) return;
  T._pickSig = sig;
  T.built = 'pick';
  const s = st();
  let cards = '';
  for (let g = 1; g <= T.game.groupCount; g++) {
    const c = groupColor(g);
    const taken = T.game.groups[g];
    cards += `<button type="button" class="group-pick ${taken ? 'taken' : ''}" data-act="pick" data-g="${g}" ${taken ? 'aria-disabled="true"' : ''} style="background:${c.soft};border-color:${c.main}">
      <span class="gt"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>${g}모둠</span>
      <span class="gm">${taken ? esc(taken.names.join(', ')) : '비어 있어요'}</span>
      <span class="gm" style="margin-top:auto"><b>${taken ? '다른 태블릿이 쓰는 중' : '이 모둠으로 들어가기'}</b></span>
    </button>`;
  }
  app.innerHTML = `
    ${topbar(`<span class="chip cream">게임 코드 ${esc(T.code)}</span>${leaveBtn()}`)}
    <section class="card pad" aria-labelledby="h">
      <span class="deco green" style="width:200px;height:200px;right:-70px;top:-80px"></span>
      <div class="mascot-row" style="margin-bottom:16px">${catSvg(80)}<div class="bubble">이 태블릿은 어느 모둠 기차일까요?<br>우리 모둠 번호를 눌러요.</div></div>
      <h1 id="h" class="section-title" style="font-size:30px">모둠 고르기</h1>
      ${
        s.status !== 'lobby' && s.status !== 'ended'
          ? '<div class="notice" style="margin:12px 0"><div><strong>게임이 이미 시작됐어요</strong>모둠을 고르고 이름을 쓰면 남은 시간 동안 함께해요.</div></div>'
          : '<p class="section-desc" style="margin-bottom:16px">선생님이 정해 준 모둠을 눌러요. 한 모둠에 태블릿 한 대예요.</p>'
      }
      <div class="group-picks">${cards}</div>
    </section>`;
}

function pickGroup(g) {
  if (T.game.groups[g]) {
    toast('이 모둠은 이미 다른 태블릿이 쓰고 있어요. 잘못 들어갔다면 선생님께 알려 주세요.', 'warn');
    return;
  }
  T.pickedGroup = String(g);
  T.draftNames = ['', '', '', ''];
  render();
}

// ════════════════════════════════════════════════
// 3. 친구 이름과 차례 정하기
// ════════════════════════════════════════════════

function renderNames() {
  const g = T.group || T.pickedGroup;
  const c = groupColor(g);
  const editing = !!T.group;
  if (T.built !== 'names') {
    T.built = 'names';
    app.innerHTML = `
      ${topbar(`<span class="chip cream">게임 코드 ${esc(T.code)}</span>`)}
      <section class="card pad-lg center-card names-card" style="max-width:820px" aria-labelledby="h">
        <span class="deco butter" style="width:220px;height:220px;right:-80px;top:-100px"></span>
        <div class="row" style="margin-bottom:6px">
          <span style="display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:22px;background:${c.soft};color:${c.ink}">${locoSvg(c.main, String(g), 44)}<b style="font-size:24px">${g}모둠</b></span>
        </div>
        <h1 id="h" class="section-title" style="font-size:30px;margin-top:14px">모둠 친구 이름을 차례대로 써요</h1>
        <p class="section-desc" style="margin-bottom:18px">위에서부터 차례가 돌아가요. 칸을 붙이면 태블릿을 다음 친구에게 넘겨요. (${NAME_MAX}글자까지, ${MAX_MEMBERS}명까지)</p>
        ${
          isTrial()
            ? `<div class="notice apricot trial-hint"><div><strong>체험 서버예요: 실명 대신 번호나 별명을 써요</strong>예: 1번, 2번 또는 별빛, 구름처럼 써 주세요. 여러 학교가 함께 쓰는 서버라 진짜 이름은 쓰지 않아요.</div></div>`
            : ''
        }
        <div id="name-list" class="name-list"></div>
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn btn-cream btn-sm" data-act="name-add" id="name-add">${ICON.plus}친구 더하기</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="name-shuffle">${ICON.shuffle}차례 섞기</button>
        </div>
        <div id="names-err" aria-live="assertive" style="margin-top:14px"></div>
        <div class="row" style="margin-top:22px">
          <button type="button" class="btn btn-cream" data-act="names-cancel">${editing ? '고치지 않고 돌아가기' : '다른 모둠 고르기'}</button>
          <div class="spacer"></div>
          <button type="button" class="btn btn-apricot btn-lg" data-act="names-save" id="names-save">${editing ? '고친 내용 저장' : '준비 완료!'}</button>
        </div>
      </section>`;
    drawNameRows(true);
  }
}

function drawNameRows(focusFirst = false) {
  const list = $('#name-list');
  if (!list) return;
  const names = T.draftNames;
  list.innerHTML = names
    .map(
      (n, i) => `<div class="name-row">
        <span class="ord">${i + 1}</span>
        <label class="sr-only" for="nm-${i}">${i + 1}번째 친구 이름</label>
        <input class="input" id="nm-${i}" data-i="${i}" maxlength="${NAME_MAX}" autocomplete="off" placeholder="${isTrial() ? `예: ${i + 1}번 또는 별명` : `${i + 1}번째 친구 이름`}" value="${esc(n)}">
        <button type="button" class="btn btn-ghost btn-icon" data-act="name-up" data-i="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button type="button" class="btn btn-ghost btn-icon" data-act="name-down" data-i="${i}" aria-label="아래로" ${i === names.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button type="button" class="btn btn-ghost btn-icon" data-act="name-del" data-i="${i}" aria-label="지우기" ${names.length <= 1 ? 'disabled' : ''}>${ICON.x}</button>
      </div>`
    )
    .join('');
  list.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('input', () => {
      T.draftNames[Number(inp.dataset.i)] = inp.value;
    })
  );
  list.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isComposingEnter(e)) {
        e.preventDefault();
        const next = $(`#nm-${Number(inp.dataset.i) + 1}`);
        if (next) next.focus();
        else saveNames();
      }
    })
  );
  const add = $('#name-add');
  if (add) add.disabled = names.length >= MAX_MEMBERS;
  if (focusFirst) setTimeout(() => $('#nm-0') && $('#nm-0').focus(), 60);
}

function namesError(msg) {
  const box = $('#names-err');
  if (box) box.innerHTML = msg ? `<div class="notice apricot"><div>${esc(msg)}</div></div>` : '';
}

async function saveNames() {
  const raw = T.draftNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (!raw.length) return namesError('모둠 친구 이름을 한 명 이상 써 주세요.');
  const names = [];
  for (const n of raw) {
    const r = cleanName(n);
    if (!r.ok) return namesError(`"${n}": ${r.message}`);
    names.push(r.name);
  }
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return namesError(`"${dup}" 이름이 두 번 있어요. 성이나 별명을 붙여 구별해 주세요.`);
  const g = T.group || T.pickedGroup;
  const btn = $('#names-save');
  btn.disabled = true;
  btn.textContent = '저장하는 중…';
  try {
    const res = await T.api.call('join', { code: T.code, group: g, names, token: T.token || '' });
    const changedGroup = T.group !== res.group;
    T.group = res.group;
    T.token = res.token;
    T.names = names;
    if (changedGroup) {
      T.cars = [];
      T.turn = 0;
    } else if (T.turn >= names.length) T.turn = 0;
    T.draftNames = null;
    T.pickedGroup = null;
    applyGame(res.game);
    saveSession();
    toast(`${g}모둠 기차에 탔어요!`, 'good');
    render();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = T.group ? '고친 내용 저장' : '준비 완료!';
    if (e.code === 'GROUP_TAKEN') {
      namesError(explainError(e, 'student'));
      setTimeout(() => {
        T.draftNames = null;
        T.pickedGroup = null;
        poll();
      }, 2200);
    } else namesError(explainError(e, 'student'));
  }
}

// ════════════════════════════════════════════════
// 4. 대기
// ════════════════════════════════════════════════

function renderWait() {
  const sig = JSON.stringify([T.names, T.group]);
  if (T.built === 'wait' && T._waitSig === sig) return;
  T._waitSig = sig;
  T.built = 'wait';
  const g = T.group;
  const c = groupColor(g);
  const list = T.names.map((n, i) => `<span class="pchip" style="cursor:default"><span class="ord">${i + 1}</span>${esc(n)}</span>`).join('<span class="arrow">›</span>');
  app.innerHTML = `
    ${topbar(`${soundBtn()}${leaveBtn()}`)}
    <section class="card pad-lg center-card" style="max-width:780px;text-align:center" aria-live="polite">
      <span class="deco butter" style="width:240px;height:240px;right:-90px;top:-100px"></span>
      <div style="display:flex;justify-content:center">${catSvg(130)}</div>
      <h1 style="font-size:clamp(28px,4vw,40px);margin:10px 0 6px">선생님이 출발 신호를 주면 시작해요!</h1>
      <p class="section-desc" style="font-size:19px">사진은 게임이 시작되면 보여요. 첫 번째 친구가 태블릿을 들고 기다려요.</p>
      <div style="margin:26px auto 6px;display:inline-flex;align-items:center;gap:14px;padding:14px 22px;border-radius:24px;background:${c.soft};color:${c.ink}">
        ${locoSvg(c.main, String(g), 50)}<span style="font-size:28px;font-weight:700">우리는 ${g}모둠</span>
      </div>
      <div style="margin-top:20px">
        <div class="field-label" style="margin-bottom:10px">우리 모둠 차례 순서</div>
        <div class="row turn-list" style="justify-content:center">${list}</div>
      </div>
      <div class="row" style="margin-top:26px;justify-content:center">
        <button type="button" class="btn btn-cream btn-sm" data-act="edit-names">이름·차례 고치기</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="change-group">모둠 바꾸기</button>
      </div>
    </section>`;
}

// ════════════════════════════════════════════════
// 5. 게임 (태블릿 돌려쓰기)
// ════════════════════════════════════════════════

const curName = () => T.names[T.turn % Math.max(1, T.names.length)] || '';
const nextName = () => T.names[(T.turn + 1) % Math.max(1, T.names.length)] || '';

function renderPlay() {
  const g = T.group;
  const c = groupColor(g);
  if (T.built !== 'play') {
    T.built = 'play';
    T._trainSig = null;
    app.innerHTML = `
      <header class="topbar play-top">${brandHtml(`${g}모둠 태블릿`)}<div class="spacer"></div>
        <span class="chip butter" style="font-size:20px" id="timer-chip">남은 시간 <b id="timer" style="margin-left:4px;font-variant-numeric:tabular-nums">--:--</b></span>
        ${soundBtn()}
      </header>
      <div class="play">
        <button type="button" class="photo-frame p-photo" data-act="photo" aria-label="사진 크게 보기"><img id="play-photo" src="${esc(photoSrc() || '')}" alt="질문을 만들 사진"></button>
        <div class="turnbar p-turn" id="turnbar" aria-label="우리 모둠 차례 순서"></div>
        <section class="card compose p-compose my-turn" id="compose" aria-live="polite">
          <div class="ask" id="ask"></div>
          <div class="sub" id="sub"></div>
          <label for="q" class="sr-only">질문 쓰기</label>
          <input class="input" id="q" maxlength="${MAX_TEXT + 2}" autocomplete="off" placeholder="질문을 적어주세요.">
          <div class="count-hint"><span id="len">0</span>/${MAX_TEXT}</div>
          <div id="overlap"></div>
          <div class="row" style="margin-top:14px">
            <button type="button" class="btn btn-ghost btn-sm" data-act="pass" id="pass-btn">패스</button>
            <div class="spacer"></div>
            <button type="button" class="btn btn-apricot btn-lg" data-act="add" id="add-btn">칸 붙이기</button>
          </div>
        </section>
        <aside class="card side-card p-lens tunnel-card" aria-labelledby="tn-h">
          <div class="section-title" id="tn-h" style="font-size:21px">다른 모둠 기차는?</div>
          <div class="tunnel-art">${tunnelSvg(96)}</div>
          <p class="tunnel-text">모두 <b>터널 속</b>을 달리는 중이에요!<br>몇 칸인지는 시간이 끝나면 선생님 화면에서 공개돼요.</p>
        </aside>
        <section class="card my-train p-train" aria-labelledby="mt-h">
          <div class="head">
            ${locoSvg(c.main, String(g), 46)}
            <div class="section-title" id="mt-h" style="font-size:22px;margin:0">우리 모둠 질문 기차</div>
            <span class="chip" style="background:${c.soft};color:${c.ink}" id="my-len">0칸</span>
          </div>
          <div class="qcars" id="mytrain"></div>
        </section>
      </div>
      <div id="handoff" aria-live="polite"></div>
      <div id="cover"></div>`;
    const q = $('#q');
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isComposingEnter(e)) {
        e.preventDefault();
        addCar();
      }
    });
    q.addEventListener('input', () => {
      $('#len').textContent = q.value.length;
      // 다시 쓰기 시작하면 앞의 안내(겹침 등)를 지운다
      if (!T.pending || q.value !== T.pending.raw) {
        T.pending = null;
        if ($('#overlap') && $('#overlap').innerHTML) showOverlap('');
      }
    });
  }
  updatePlay();
}

function updatePlay() {
  if (T.view !== 'play') return;
  const g = T.group;
  const c = groupColor(g);
  const s = st();
  const playing = s.status === 'playing';
  const img = $('#play-photo');
  if (img && photoSrc() && img.getAttribute('src') !== photoSrc()) img.src = photoSrc();

  $('#turnbar').innerHTML =
    `<span style="color:var(--ink-3);margin-right:4px">차례</span>` +
    T.names
      .map((n, i, arr) => `<span class="pchip ${i === T.turn % arr.length ? 'turn' : ''}" style="cursor:default">${esc(n)}</span>${i < arr.length - 1 ? '<span class="arrow">›</span>' : ''}`)
      .join('');

  $('#ask').innerHTML = `지금은 <b>${esc(curName())}</b> 차례! 떠오른 질문을 써 봐요`;
  $('#sub').textContent = T.names.length > 1 ? `칸을 붙이면 다음 친구 ${nextName()}에게 태블릿을 넘겨요.` : '사진을 보고 궁금한 것을 무엇이든 질문으로 만들어요. 엉뚱한 질문도 좋아요.';
  $('#add-btn').disabled = !playing;
  $('#pass-btn').classList.toggle('hidden', !playing || T.names.length < 2);
  $('#q').disabled = !playing;

  $('#my-len').textContent = `${T.cars.length}칸`;
  const sig = JSON.stringify(T.cars.map((x) => [x.no, x.text]));
  if (sig !== T._trainSig) {
    const prev = T._trainLen === undefined || T._trainSig === null ? T.cars.length : T._trainLen;
    T._trainSig = sig;
    T._trainLen = T.cars.length;
    const train = $('#mytrain');
    train.innerHTML =
      T.cars
        .map(
          (car, i) => `<div class="qcar ${i >= prev ? 'new' : ''}" style="background:${c.soft}">
            <div class="meta"><span>${car.no}칸</span><span>${esc(car.name || '')}</span></div>
            <div class="q">${esc(car.text)}</div></div>`
        )
        .join('') + `<div class="qcar next">다음 칸</div>`;
    train.scrollLeft = train.scrollWidth;
  }
  updateCover(s);
}

function updateCover(s) {
  const cover = $('#cover');
  if (!cover) return;
  let html = '';
  let key = '';
  if (s.status === 'paused') {
    key = 'p';
    html = `<div class="pause-cover" role="dialog" aria-label="잠깐 멈춤">${catSvg(110)}<div>잠깐 멈췄어요</div><div style="font-size:19px;font-weight:400;color:var(--ink-2)">선생님이 다시 출발하면 이어서 해요.</div></div>`;
  } else if (s.status === 'ready') {
    const sec = Math.max(1, Math.ceil((Number(s.goAt) - now()) / 1000));
    const again = Number(s.goAt) !== Number(s.startedAt);
    key = 'r' + sec;
    html = `<div class="pause-cover ready-cover" role="status">${catSvg(100)}<div>${again ? '곧 다시 출발해요!' : '곧 출발해요!'}</div><div class="ready-num">${sec}</div>
      <div style="font-size:19px;font-weight:400;color:var(--ink-2)">${again ? `${esc(curName())} 차례부터 이어서 해요` : `첫 번째는 <b>${esc(curName())}</b>! 태블릿을 들어요`}</div></div>`;
  }
  if (cover.dataset.key !== key) {
    cover.dataset.key = key;
    cover.innerHTML = html;
  }
}

function showOverlap(html) {
  const el = $('#overlap');
  if (el) el.innerHTML = html ? `<div class="overlap">${html}</div>` : '';
}

function addCar(force = false) {
  const s = st();
  if (s.status !== 'playing') return;
  const q = $('#q');
  const raw = q.value;
  const cq = cleanQuestion(raw);
  if (!cq.ok) {
    showOverlap(esc(cq.message));
    q.focus();
    return;
  }
  const ov = findOverlap(cq.text, T.cars);
  if (ov && ov.type === 'same') {
    showOverlap(`앞에 나온 <b>"${esc(ov.car.text)}"</b>와 같은 질문이에요.<br>다른 질문을 떠올려 볼까요?`);
    q.focus();
    return;
  }
  if (ov && ov.type === 'similar' && !force) {
    if (T.game.dupMode === 'similar') {
      showOverlap(`<b>"${esc(ov.car.text)}"</b>와 많이 비슷해요.<br>다른 점을 궁금해해 볼까요?`);
      q.focus();
      return;
    }
    T.pending = { raw };
    showOverlap(`앞에 나온 <b>"${esc(ov.car.text)}"</b>와 비슷해요. 그래도 붙일까요?
      <div class="acts"><button type="button" class="btn btn-apricot btn-sm" data-act="force">그래도 붙이기</button>
      <button type="button" class="btn btn-cream btn-sm" data-act="rewrite">다시 쓰기</button></div>`);
    return;
  }
  const who = curName();
  T.cars.push({ no: T.cars.length + 1, text: cq.text, norm: normalizeQuestion(cq.text), name: who, at: now() });
  T.turn = (T.turn + 1) % Math.max(1, T.names.length);
  T.pending = null;
  saveSession();
  q.value = '';
  $('#len').textContent = '0';
  showOverlap('');
  if (isSoundOn('student')) beep({ freq: 1318, dur: 0.09, vol: 0.25 });
  handoff(`${T.cars.length}번째 칸 완성!${cq.addedMark ? ' (물음표를 붙였어요)' : ''}`, T.names.length > 1 ? `다음은 <b>${esc(curName())}</b> 차례! 태블릿을 넘겨 주세요` : '다음 질문도 떠올려 봐요!');
  updatePlay();
}

function handoff(title, sub) {
  const el = $('#handoff');
  if (!el) return;
  el.innerHTML = `<div class="handoff"><div class="handoff-card"><div class="ht">${esc(title)}</div><div class="hs">${sub}</div></div></div>`;
  clearTimeout(handoff._t);
  handoff._t = setTimeout(() => {
    if ($('#handoff')) $('#handoff').innerHTML = '';
  }, 1700);
}

async function pass() {
  const ok = await confirmBox({
    title: `${curName()}, 이번 차례를 넘길까요?`,
    body: '생각이 잘 안 나면 넘겨도 괜찮아요. 다음 차례에 다시 도전해요!',
    ok: '넘기기',
    cancel: '조금 더 생각할래요',
  });
  if (!ok || st().status !== 'playing') return;
  T.turn = (T.turn + 1) % Math.max(1, T.names.length);
  saveSession();
  handoff('차례를 넘겼어요', `다음은 <b>${esc(curName())}</b> 차례! 태블릿을 넘겨 주세요`);
  updatePlay();
}

function tick() {
  if (!T.game) return;
  const s = st();
  const t = now();
  if (T.group && T.token) T.fx.update(s, t);
  if (s.status === 'playing' && s.goAt && Number(s.goAt) !== Number(s.startedAt) && T.lastGoAt !== s.goAt && t - Number(s.goAt) < 3000 && T.view === 'play') {
    T.lastGoAt = s.goAt;
    if (isSoundOn('student')) bell({ strikes: 1, base: 880 });
    flashBanner('다시 출발!', '', 1400);
  }
  const view = viewFor();
  if (view !== T.view) return render();
  if (view === 'play') {
    const rem = remainingOf(s, t, T.game.durationSec);
    const el = $('#timer');
    if (el) el.textContent = formatClock(rem);
    const chip = $('#timer-chip');
    if (chip) chip.classList.toggle('apricot', s.status === 'playing' && rem < 30000);
    const playing = s.status === 'playing';
    const btn = $('#add-btn');
    if (btn && btn.disabled === playing) updatePlay();
    else updateCover(s);
  }
}

// ════════════════════════════════════════════════
// 6. 도착: 시간이 끝나면 기차를 서버(구글 시트)로 보낸다
// ════════════════════════════════════════════════

function needsSubmit() {
  return T.group && T.token && !(T.sub.state === 'done' && T.sub.round === T.round);
}

async function submitTrain() {
  clearTimeout(T.submitTimer);
  if (!needsSubmit() || T.sub.state === 'sending') return;
  T.sub.state = 'sending';
  drawArriveStatus();
  const round = T.round;
  try {
    await T.api.call('submit', {
      code: T.code,
      group: T.group,
      token: T.token,
      round,
      cars: T.cars.map((c) => ({ no: c.no, text: c.text, name: c.name, at: c.at })),
    });
    if (T.round !== round) return;
    T.sub = { state: 'done', round, count: T.cars.length };
    saveSession();
    poll();
  } catch (e) {
    if (e.code === 'OLD_ROUND') {
      T.sub = { state: 'done', round, count: 0 };
      return;
    }
    if (e.code === 'NOT_MINE') {
      T.sub = { state: 'error', round, count: 0, fatal: true };
      drawArriveStatus();
      return;
    }
    T.sub = { state: 'error', round, count: 0 };
    T.submitTimer = setTimeout(submitTrain, 3000);
  }
  drawArriveStatus();
}

function renderArrived() {
  const g = T.group;
  const c = groupColor(g);
  if (T.built !== 'arrived') {
    T.built = 'arrived';
    app.innerHTML = `
      ${topbar(soundBtn())}
      <section class="card pad-lg" style="text-align:center">
        <span class="deco butter" style="width:260px;height:260px;right:-90px;top:-110px"></span>
        <div style="display:flex;justify-content:center">${catSvg(110)}</div>
        <h1 style="font-size:clamp(30px,4.6vw,48px);margin:10px 0 6px">땡! 우리 기차가 역에 들어가요</h1>
        <p style="font-size:22px;margin:0">우리 ${esc(g)}모둠 기차는 <b>${T.cars.length}칸</b>이에요. 수고했어요!</p>
        <div id="arrive-status" style="margin-top:18px"></div>
      </section>
      <section class="card pad" style="margin-top:20px">
        <div class="row"><b style="font-size:21px">우리 모둠이 만든 질문</b><span class="chip" style="background:${c.soft};color:${c.ink}">${T.cars.length}칸</span></div>
        <div class="qcars wrap" style="margin-top:14px">${
          T.cars.length
            ? T.cars.map((car) => `<div class="qcar" style="background:${c.soft}"><div class="meta"><span>${car.no}칸</span><span>${esc(car.name || '')}</span></div><div class="q">${esc(car.text)}</div></div>`).join('')
            : '<div class="empty-state">붙인 칸이 없어요.</div>'
        }</div>
      </section>`;
  }
  if (needsSubmit() && T.sub.state !== 'sending' && T.sub.state !== 'error') submitTrain();
  drawArriveStatus();
}

function drawArriveStatus() {
  const box = $('#arrive-status');
  if (!box) return;
  let html;
  if (T.sub.state === 'done' && T.sub.round === T.round)
    html = `<div class="notice green" style="display:inline-flex;text-align:left"><div><strong>도착 완료!</strong>선생님 화면에서 두구두구 순위 발표를 기다려요.</div></div>`;
  else if (T.sub.fatal)
    html = `<div class="notice apricot" style="display:inline-flex;text-align:left"><div><strong>기차를 보내지 못했어요</strong>선생님이 이 태블릿의 모둠 연결을 풀었어요. 선생님께 알려 주세요.</div></div>`;
  else if (T.sub.state === 'error')
    html = `<div class="notice apricot" style="display:inline-flex;text-align:left"><div><strong>인터넷 연결을 확인하는 중이에요</strong>잠시 뒤 다시 보내요. 태블릿을 끄지 말고 기다려 주세요.</div></div>`;
  else html = `<div class="notice" style="display:inline-flex;text-align:left"><div><strong>기차를 역으로 보내는 중…</strong>잠깐만 기다려요.</div></div>`;
  if (box.innerHTML !== html) box.innerHTML = html;
}

// ════════════════════════════════════════════════
// 7. 결과 (선생님이 순위를 발표한 뒤)
// ════════════════════════════════════════════════

function renderDone() {
  const sig = JSON.stringify([T.results, T.resultTab]);
  if (T.built === 'done' && T._doneSig === sig) return;
  T._doneSig = sig;
  T.built = 'done';
  const mine = String(T.group);
  const r = T.results || {};
  const lens = {};
  const groupsWith = [];
  Object.keys(r)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((g) => {
      const arrived = T.game.subs && T.game.subs[g] && Number(T.game.subs[g].round) === Number(T.game.round);
      if (arrived || (r[g].cars && r[g].cars.length)) {
        lens[g] = r[g].cars.length;
        groupsWith.push(g);
      }
    });
  const ranks = ranking(lens);
  const myRank = ranks.find((x) => String(x.g) === mine);
  if (!T.resultTab || !groupsWith.map(String).includes(T.resultTab)) T.resultTab = groupsWith.map(String).includes(mine) ? mine : String(groupsWith[0] || mine);
  const tab = T.resultTab;
  const tc = groupColor(tab);
  const cars = (r[tab] && r[tab].cars) || [];
  app.innerHTML = `
    ${topbar(`<span class="chip cream">${esc(mine)}모둠</span>${leaveBtn()}`)}
    <section class="card pad-lg" style="text-align:center">
      <span class="deco butter" style="width:260px;height:260px;right:-90px;top:-110px"></span>
      <div style="display:flex;justify-content:center">${catSvg(110)}</div>
      <h1 style="font-size:clamp(30px,4.6vw,48px);margin:10px 0 6px">순위 발표!</h1>
      ${
        myRank
          ? `<p style="font-size:22px;margin:0">우리 ${esc(mine)}모둠 기차는 <b>${myRank.len}칸</b>, <b>${myRank.rank}등</b>이에요!</p>`
          : '<p style="font-size:22px;margin:0">모든 모둠의 질문을 둘러봐요.</p>'
      }
      <div class="podium" style="margin-top:22px;text-align:left">
        ${ranks
          .map((x) => {
            const c = groupColor(x.g);
            return `<div class="rank-card ${x.rank === 1 && x.len > 0 ? 'first' : ''}"><div class="rk" style="color:${c.ink}">${x.rank}</div>
              <div><div class="gn">${x.g}모둠${String(x.g) === mine ? ' (우리)' : ''}</div><div class="ln">${x.len}칸</div></div></div>`;
          })
          .join('')}
      </div>
    </section>
    <section class="card pad" style="margin-top:20px;background:var(--green-softer)">
      <p style="font-size:clamp(20px,2.6vw,26px);font-weight:700;margin:0 0 4px">진짜 알아보고 싶은 질문이 있었나요?</p>
      <p class="section-desc">친구들 기차를 둘러보며 정말 궁금한 질문을 찾아봐요. 선생님이 한 판 더 하면 저절로 대기실로 가요.</p>
    </section>
    <section class="card pad" style="margin-top:20px">
      <div class="tabs" role="tablist" aria-label="모둠 고르기">
        ${groupsWith.map((g) => `<button type="button" role="tab" aria-selected="${String(g) === tab}" data-act="tab" data-g="${g}">${g}모둠${String(g) === mine ? ' (우리)' : ''}</button>`).join('')}
      </div>
      <div class="qcars wrap" style="margin-top:16px">
        ${
          cars.length
            ? cars.map((car) => `<div class="qcar" style="background:${tc.soft}"><div class="meta"><span>${car.no}칸</span><span>${esc(car.name || '')}</span></div><div class="q">${esc(car.text)}</div></div>`).join('')
            : '<div class="empty-state">붙인 칸이 없어요.</div>'
        }
      </div>
    </section>`;
}

// ════════════════════════════════════════════════
// 클릭 처리
// ════════════════════════════════════════════════

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const i = Number(el.dataset.i);
  switch (el.dataset.act) {
    case 'pick':
      pickGroup(el.dataset.g);
      break;
    case 'name-add':
      if (T.draftNames.length < MAX_MEMBERS) {
        T.draftNames.push('');
        drawNameRows();
        const last = $(`#nm-${T.draftNames.length - 1}`);
        if (last) last.focus();
      }
      break;
    case 'name-del':
      T.draftNames.splice(i, 1);
      drawNameRows();
      break;
    case 'name-up':
      if (i > 0) [T.draftNames[i - 1], T.draftNames[i]] = [T.draftNames[i], T.draftNames[i - 1]];
      drawNameRows();
      break;
    case 'name-down':
      if (i < T.draftNames.length - 1) [T.draftNames[i + 1], T.draftNames[i]] = [T.draftNames[i], T.draftNames[i + 1]];
      drawNameRows();
      break;
    case 'name-shuffle': {
      const filled = T.draftNames.filter((n) => String(n).trim());
      for (let k = filled.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [filled[k], filled[j]] = [filled[j], filled[k]];
      }
      T.draftNames = filled.length ? filled : T.draftNames;
      drawNameRows();
      break;
    }
    case 'names-save':
      saveNames();
      break;
    case 'names-cancel':
      T.draftNames = null;
      T.pickedGroup = null;
      render();
      break;
    case 'edit-names':
      T.draftNames = T.names.slice();
      render();
      break;
    case 'change-group': {
      const ok = await confirmBox({ title: '모둠을 바꿀까요?', body: '이 태블릿이 지금 모둠에서 빠지고, 모둠 고르기 화면으로 가요.', ok: '모둠 바꾸기' });
      if (!ok) return;
      try {
        const res = await T.api.call('leave', { code: T.code, group: T.group, token: T.token });
        applyGame(res.game);
      } catch (err) {}
      T.group = null;
      T.cars = [];
      T.turn = 0;
      saveSession();
      render();
      break;
    }
    case 'photo':
      if (photoSrc()) showPhoto(photoSrc());
      break;
    case 'add':
      addCar();
      break;
    case 'force':
      addCar(true);
      break;
    case 'rewrite':
      T.pending = null;
      showOverlap('');
      if ($('#q')) $('#q').select();
      break;
    case 'pass':
      pass();
      break;
    case 'sound':
      setSoundOn('student', !isSoundOn('student'));
      document.querySelectorAll('#sound-btn').forEach((b) => (b.outerHTML = soundBtn()));
      if (isSoundOn('student')) beep({ freq: 880, dur: 0.12, vol: 0.3 });
      toast(isSoundOn('student') ? '이 태블릿에서도 효과음이 나요.' : '이 태블릿의 효과음을 껐어요.');
      break;
    case 'tab':
      T.resultTab = el.dataset.g;
      renderDone();
      break;
    case 'exit': {
      const s = st();
      const playing = s && (s.status === 'playing' || s.status === 'paused' || s.status === 'ready');
      const ok = await confirmBox({
        title: '게임에서 나갈까요?',
        body: playing ? '게임이 진행 중이에요. 나가면 이 태블릿의 기차가 역에 도착하지 못할 수 있어요.' : '나가면 처음 화면으로 돌아가요.',
        ok: '나가기',
        danger: true,
      });
      if (!ok) return;
      if (T.group && T.token && s && s.status === 'lobby') T.api.call('leave', { code: T.code, group: T.group, token: T.token }).catch(() => {});
      stopLoops();
      clearSession();
      location.href = 'index.html';
      break;
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && T.code) poll();
});

// ════════════════════════════════════════════════
// 시작
// ════════════════════════════════════════════════

const params = new URLSearchParams(location.search);
const urlCode = (params.get('code') || '').replace(/\D/g, '').slice(0, 4);
const urlMode = params.get('mode') === 'local' ? 'local' : null;
const linkUrl = decodeUrlParams(params);
if (linkUrl) {
  if (getTabletUrl() !== linkUrl) saveTabletUrl(linkUrl);
  const keep = new URLSearchParams();
  if (urlCode) keep.set('code', urlCode);
  history.replaceState(null, '', 'student.html' + (keep.toString() ? '?' + keep : ''));
}

(async function boot() {
  // 연습 모드 창은 창마다(sessionStorage), 실제 태블릿은 기기마다(localStorage) 이어서 하기
  const sess = urlMode === 'local' ? loadSession('local') : loadSession('sheet') || loadSession('local');
  const sessUrl = sess && (sess.mode === 'local' ? 'local' : sess.url || getTabletUrl());
  if (sess && sess.code && sessUrl && (!urlCode || urlCode === sess.code) && (!linkUrl || sessUrl === linkUrl)) {
    try {
      const api = await apiFor(sessUrl);
      if (!api) throw new Error('NO_API');
      const res = await api.call('info', { code: sess.code });
      restore({ ...sess, url: sessUrl === 'local' ? null : sessUrl }, api, res.game);
      return;
    } catch (e) {
      if (e.code === 'NO_GAME' || e.code === 'EXPIRED') clearSession();
      else if (sess.code) {
        renderJoin(sess.code, explainError(e, 'student'));
        return;
      }
    }
  }
  renderJoin(urlCode);
  if (urlCode && (linkUrl || urlMode)) findGame(urlCode);
})();
