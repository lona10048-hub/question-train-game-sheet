// 질문 기차 게임의 규칙과 계산 (화면·저장소와 무관한 순수 함수)

export const GROUP_COLORS = [
  null,
  { main: '#F2A07B', soft: '#FCE3D6', ink: '#7A3E22', name: '살구' },
  { main: '#F2CC5B', soft: '#FBF0C8', ink: '#6E5410', name: '해바라기' },
  { main: '#8FBF73', soft: '#E3F0D8', ink: '#355A26', name: '잎새' },
  { main: '#86BEDC', soft: '#DCEEF6', ink: '#1F5470', name: '하늘' },
  { main: '#EEA8BE', soft: '#FBE2EA', ink: '#7A2E48', name: '분홍' },
  { main: '#B6A3E2', soft: '#ECE6F8', ink: '#4A3A7A', name: '보라' },
  { main: '#84CDB6', soft: '#DDF3EC', ink: '#1F5E4B', name: '민트' },
  { main: '#D4A985', soft: '#F4E7DA', ink: '#5E3F24', name: '도토리' },
];

export const MAX_GROUPS = 8;
export const MIN_GROUPS = 2;
export const TIME_OPTIONS = [3, 5, 7, 10];
export const MAX_TEXT = 80;
export const MIN_TEXT = 2;
export const NAME_MAX = 8;
export const SIMILAR_THRESHOLD = 0.75;
export const OFFLINE_SKIP_MS = 5000;
export const STALL_MS = 45000;

export const PHOTOS = [
  {
    id: 'bus-stop',
    title: '잎사귀 우산 정류장',
    hint: '비 오는 날, 혼자 커다란 잎을 쓴 아이',
    src: 'assets/photos/bus-stop.jpg',
    thumb: 'assets/photos/bus-stop-thumb.jpg',
  },
  {
    id: 'sunflower',
    title: '창밖의 거대한 해바라기',
    hint: '어떤 아이들만 창밖을 보고 있는 교실',
    src: 'assets/photos/sunflower.jpg',
    thumb: 'assets/photos/sunflower-thumb.jpg',
  },
  {
    id: 'suitcase',
    title: '놀이터의 여행 가방',
    hint: '아무도 없는 놀이터에 놓인 오래된 가방',
    src: 'assets/photos/suitcase.jpg',
    thumb: 'assets/photos/suitcase-thumb.jpg',
  },
];

export function photoById(id) {
  return PHOTOS.find((p) => p.id === id) || null;
}

export function groupName(g) {
  return `${g}모둠`;
}

export function groupColor(g) {
  return GROUP_COLORS[Number(g)] || GROUP_COLORS[1];
}

export function toArray(x) {
  if (Array.isArray(x)) return x.filter((v) => v !== null && v !== undefined);
  if (x && typeof x === 'object') {
    return Object.keys(x)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => x[k])
      .filter((v) => v !== null && v !== undefined);
  }
  return [];
}

export function carsList(group) {
  const cars = group && group.cars ? Object.entries(group.cars) : [];
  return cars
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.no || 0) - (b.no || 0) || (a.at || 0) - (b.at || 0));
}

// ── 질문 다듬기 ─────────────────────────────────────────

// 아이들이 쓰는 심한 말만 걸러내는 최소한의 목록 (필요하면 추가)
const BANNED = [
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새끼', '좆', '존나', 'ㅈㄴ', '지랄', 'ㅈㄹ',
  '닥쳐', '미친놈', '미친년', '느금', '니애미', '엿먹어',
];

export function hasBannedWord(text) {
  const t = String(text || '').replace(/[\s.,!?~·*_\-]/g, '');
  return BANNED.some((w) => t.includes(w));
}

// 입력한 질문을 정리한다. 물음표가 없으면 붙인다.
export function cleanQuestion(raw) {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty', message: '질문을 먼저 써 주세요.' };
  const core = text.replace(/[?？!.~\s]+$/g, '');
  if (core.replace(/\s/g, '').length < MIN_TEXT)
    return { ok: false, reason: 'short', message: '조금 더 길게 써 볼까요? (두 글자 이상)' };
  if (hasBannedWord(text))
    return { ok: false, reason: 'banned', message: '친구가 들어도 기분 좋은 말로 바꿔 볼까요?' };
  let addedMark = false;
  if (!/[?？]$/.test(text)) {
    text = core + '?';
    addedMark = true;
  }
  if (text.length > MAX_TEXT) return { ok: false, reason: 'long', message: `${MAX_TEXT}글자 안으로 줄여 볼까요?` };
  return { ok: true, text, addedMark };
}

// 겹침 판정을 위한 정규화: 띄어쓰기·문장부호를 없애고, 끝말 차이를 줄인다.
const ENDINGS = [
  [/(일까요|일까|인가요|인가|인지|이니|이야|이에요|예요|이지)$/, '이다'],
  [/(할까요|할까|하나요|하니|하지|해요|해)$/, '하다'],
  [/(을까요|을까|나요|니|까요|까|지|요)$/, ''],
];

export function normalizeQuestion(text) {
  let t = String(text || '')
    .toLowerCase()
    .replace(/[\s?？!.,~·…'"“”‘’()\[\]{}:;\-_/\\]/g, '');
  for (const [re, rep] of ENDINGS) {
    if (re.test(t)) {
      t = t.replace(re, rep);
      break;
    }
  }
  return t;
}

function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// 두 질문이 얼마나 비슷한지 (0~1, 글자 두 개씩 묶어 비교)
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  const counts = new Map();
  for (const x of A) counts.set(x, (counts.get(x) || 0) + 1);
  let inter = 0;
  for (const x of B) {
    const n = counts.get(x) || 0;
    if (n > 0) {
      inter++;
      counts.set(x, n - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

// 낱말 단위 비교: 조사(은/는/이/가…)와 끝말을 떼고 같은 낱말이 얼마나 겹치는지 (어순이 바뀐 질문을 잡기 위해)
const PARTICLES = /(에서|에게|한테|으로|은|는|이|가|을|를|에|의|도|로|와|과)$/;
function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[?？!.,~·…'"“”‘’()\[\]{}:;\-_/\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length >= 2 ? w.replace(PARTICLES, '') : w))
    .map((w) => normalizeQuestion(w) || w);
}

function wordSimilarity(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function questionSimilarity(aText, bText) {
  return Math.max(similarity(normalizeQuestion(aText), normalizeQuestion(bText)), wordSimilarity(aText, bText));
}

// 같은 모둠 기차 안에서 겹치는 질문 찾기
export function findOverlap(text, cars) {
  const norm = normalizeQuestion(text);
  let best = null;
  for (const c of cars) {
    const n = c.norm || normalizeQuestion(c.text);
    if (n === norm) return { type: 'same', car: c, score: 1 };
    const s = questionSimilarity(text, c.text);
    if (s >= SIMILAR_THRESHOLD && (!best || s > best.score)) best = { type: 'similar', car: c, score: s };
  }
  return best;
}

// ── 차례 ───────────────────────────────────────────────

// from 다음 순서부터 접속 중인 사람을 찾는다. 아무도 없으면 바로 다음 사람.
export function nextIndex(order, from, isOnline) {
  const n = order.length;
  if (!n) return -1;
  for (let step = 1; step <= n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (isOnline(order[i])) return i;
  }
  return (((from + 1) % n) + n) % n;
}

export function firstIndex(order, isOnline) {
  if (!order.length) return -1;
  const i = order.findIndex((u) => isOnline(u));
  return i >= 0 ? i : 0;
}

export function makeTurn(order, index, now) {
  if (index < 0 || !order.length) return null;
  return { index, uid: order[index], since: now };
}

// 차례 순서에서 한 명을 뺄 때 차례를 바르게 고친다.
export function removeFromGroup(group, uid, isOnline, now) {
  const order = toArray(group.order);
  const idx = order.indexOf(uid);
  if (idx < 0) return group;
  order.splice(idx, 1);
  group.order = order;
  const t = group.turn;
  if (!order.length) {
    group.turn = null;
    return group;
  }
  if (t && t.uid === uid) {
    // 빠진 사람 자리에 온 다음 사람부터 찾는다
    const start = idx % order.length;
    const i = isOnline(order[start]) ? start : nextIndex(order, start, isOnline);
    group.turn = makeTurn(order, i, now);
  } else if (t) {
    const i = order.indexOf(t.uid);
    group.turn = i >= 0 ? { ...t, index: i } : makeTurn(order, 0, now);
  }
  return group;
}

// ── 시간 · 순위 ────────────────────────────────────────

export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function remainingMs(state, now) {
  if (!state) return 0;
  if (state.status === 'playing') return Math.max(0, Number(state.endsAt || 0) - now);
  if (state.status === 'paused') return Math.max(0, Number(state.remainingMs || 0));
  return 0;
}

// groups: { [g]: {len} } → [{g, len, rank}] (칸 수가 같으면 같은 순위)
export function ranking(lengths) {
  const arr = Object.entries(lengths)
    .map(([g, len]) => ({ g: Number(g), len: Number(len) || 0 }))
    .sort((a, b) => b.len - a.len || a.g - b.g);
  let rank = 0;
  let prev = null;
  arr.forEach((x, i) => {
    if (x.len !== prev) {
      rank = i + 1;
      prev = x.len;
    }
    x.rank = rank;
  });
  return arr;
}

export function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, message: '이름을 써 주세요.' };
  if (name.length > NAME_MAX) return { ok: false, message: `이름은 ${NAME_MAX}글자까지 쓸 수 있어요.` };
  if (hasBannedWord(name)) return { ok: false, message: '다른 이름으로 바꿔 볼까요?' };
  return { ok: true, name };
}
