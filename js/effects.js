// 효과음과 화면 효과: 게임 시작 종소리, 마지막 5초 "삐" 소리와 숫자, 시간이 끝나면 종소리
// 소리는 파일 없이 브라우저(Web Audio)로 직접 만든다.

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  return ctx;
}

// 브라우저는 사용자가 한 번 누르거나 키를 쳐야 소리를 낼 수 있게 해 준다.
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));

const SOUND_KEY = (role) => `qtg-sound-${role}`;

// 선생님 화면은 기본으로 소리를 켜고, 학생 기기는 교실이 시끄럽지 않도록 기본으로 끈다.
export function isSoundOn(role) {
  try {
    const v = localStorage.getItem(SOUND_KEY(role));
    if (v === null) return role === 'teacher';
    return v === '1';
  } catch (e) {
    return role === 'teacher';
  }
}

export function setSoundOn(role, on) {
  try {
    localStorage.setItem(SOUND_KEY(role), on ? '1' : '0');
  } catch (e) {}
  if (on) unlockAudio();
}

// "삐" 소리
export function beep({ freq = 988, dur = 0.18, vol = 0.45 } = {}) {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

// 종소리: 금속 종처럼 여러 배음을 겹쳐 길게 울린다. strikes번 친다.
export function bell({ strikes = 1, gap = 0.6, base = 740, vol = 0.42 } = {}) {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const partials = [
    [1, 1],
    [2.0, 0.55],
    [2.76, 0.42],
    [4.07, 0.22],
    [5.4, 0.16],
    [8.93, 0.08],
  ];
  for (let s = 0; s < strikes; s++) {
    const t = c.currentTime + 0.02 + s * gap;
    for (const [ratio, amp] of partials) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * ratio, t);
      const dur = 2.6 / Math.sqrt(ratio);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

let noiseBuf = null;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// "두구두구" 북소리: 점점 빨라지고 커지다가 심벌로 끝난다. 걸리는 시간(초)을 돌려준다.
export function drumroll({ dur = 2.2, vol = 0.55 } = {}) {
  const c = audio();
  if (!c) return dur;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t0 = c.currentTime + 0.03;
  let t = t0;
  while (t < t0 + dur) {
    const p = (t - t0) / dur;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 500;
    bp.Q.value = 0.8;
    const g = c.createGain();
    const v = vol * (0.2 + 0.8 * p);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 0.6, 0.11);
    t += 0.075 - 0.04 * p;
  }
  // 마지막 '쿵! 챙!'
  const end = t0 + dur;
  const thump = c.createOscillator();
  const tg = c.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, end);
  thump.frequency.exponentialRampToValueAtTime(45, end + 0.35);
  tg.gain.setValueAtTime(0.0001, end);
  tg.gain.exponentialRampToValueAtTime(vol * 1.4, end + 0.01);
  tg.gain.exponentialRampToValueAtTime(0.0001, end + 0.4);
  thump.connect(tg).connect(master);
  thump.start(end);
  thump.stop(end + 0.45);
  const crash = c.createBufferSource();
  crash.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.0001, end);
  cg.gain.exponentialRampToValueAtTime(vol * 0.7, end + 0.01);
  cg.gain.exponentialRampToValueAtTime(0.0001, end + 1.3);
  crash.connect(hp).connect(cg).connect(master);
  crash.start(end, 0, 1.0);
  return dur;
}

// 순위 발표 팡파르 (도-미-솔-도)
export function fanfare({ vol = 0.28 } = {}) {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = c.currentTime + 0.03 + i * 0.13;
    const len = i === notes.length - 1 ? 0.8 : 0.16;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.05);
  });
}

// ── 화면 효과 ──────────────────────────────────────

const BELL_ICON = `<svg aria-hidden="true" width="56" height="56" viewBox="0 0 64 64">
  <path d="M32 8c-10 0-17 8-17 19v10l-5 8h44l-5-8V27C49 16 42 8 32 8z" fill="#f4d57a" stroke="#7a5c3e" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="32" cy="51" r="5.5" fill="#e98d64" stroke="#7a5c3e" stroke-width="3"/>
  <path d="M28 8a4 4 0 0 1 8 0" fill="none" stroke="#7a5c3e" stroke-width="3.5"/>
  <path d="M8 22c1-5 3-8 6-11M56 22c-1-5-3-8-6-11" fill="none" stroke="#e98d64" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

function layer() {
  let el = document.getElementById('fx-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fx-layer';
    el.setAttribute('aria-live', 'assertive');
    document.body.appendChild(el);
  }
  return el;
}

export function flashCount(n) {
  const el = layer();
  el.innerHTML = `<div class="fx-count" role="status"><span>${n}</span></div>`;
  clearTimeout(flashCount._t);
  flashCount._t = setTimeout(() => {
    if (el.firstElementChild && el.firstElementChild.classList.contains('fx-count')) el.innerHTML = '';
  }, 950);
}

export function flashBanner(title, sub = '', ms = 2600) {
  const el = layer();
  el.innerHTML = `<div class="fx-banner" role="status"><div class="fx-card">${BELL_ICON}<div class="fx-title">${title}</div>${sub ? `<div class="fx-sub">${sub}</div>` : ''}</div></div>`;
  clearTimeout(flashBanner._t);
  flashBanner._t = setTimeout(() => (el.innerHTML = ''), ms);
}

// 게임 상태를 보고 알맞은 때에 소리와 효과를 낸다. role: 'teacher' | 'student'
export function createTimerFx(role) {
  let startedFor = null;
  let endedFor = null;
  let lastSec = null;
  return {
    update(st, now) {
      if (!st || !st.startedAt) return;
      const key = String(st.startedAt);
      const sound = isSoundOn(role);
      // 시작 종 (방금 시작된 경우에만: 새로고침했을 때 다시 울리지 않게)
      if ((st.status === 'playing' || st.status === 'paused') && startedFor !== key) {
        startedFor = key;
        if (now - Number(st.startedAt) < 5000) {
          if (sound) bell({ strikes: 2, gap: 0.45, base: 880 });
          flashBanner('출발!', '질문 기차가 출발해요', 1800);
        }
      }
      if (st.status === 'playing') {
        const rem = Number(st.endsAt) - now;
        const sec = Math.ceil(rem / 1000);
        if (rem > 0 && sec >= 1 && sec <= 5 && lastSec !== `${key}:${sec}`) {
          lastSec = `${key}:${sec}`;
          if (sound) beep();
          flashCount(sec);
        }
        if (rem <= 0 && endedFor !== key) {
          endedFor = key;
          if (sound) bell({ strikes: 3 });
          flashBanner('땡! 시간 끝', '모든 기차가 역에 도착했어요');
        }
      }
      if (st.status === 'ended' && endedFor !== key) {
        endedFor = key;
        if (now - Number(st.endedAt || now) < 6000) {
          // 마감 시각에 끝났으면 "시간 끝", 선생님이 먼저 끝냈으면 "게임 끝"
          const natural = st.endsAt && Math.abs(Number(st.endedAt) - Number(st.endsAt)) < 1500;
          if (sound) bell({ strikes: 3 });
          flashBanner(natural ? '땡! 시간 끝' : '땡! 게임 끝', '모든 기차가 역으로 들어와요');
        }
      }
    },
  };
}

export const SOUND_ICON = {
  on: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  off: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
};
