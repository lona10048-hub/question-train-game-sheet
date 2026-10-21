// 연습 모드: 선생님 구글 시트 대신 이 브라우저 안에서 같은 서버 코드(gas/Code.gs)를 그대로 돌린다.
// Apps Script의 PropertiesService, CacheService, LockService, SpreadsheetApp 등을
// 이 브라우저의 저장 공간(localStorage)으로 흉내 낸다. 같은 컴퓨터의 여러 창이 함께 쓴다.

const NS = 'qtg-practice:';
const SS_KEY = NS + 'spreadsheet';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw Object.assign(new Error('이 브라우저 저장 공간이 가득 찼어요. 연습 모드의 지난 게임을 지워 주세요.'), { code: 'STORAGE_FULL' });
  }
}

// ── PropertiesService ────────────────────────────────
const PROP = NS + 'prop:';
const scriptProperties = {
  getProperty(k) {
    const v = localStorage.getItem(PROP + k);
    return v === null ? null : v;
  },
  setProperty(k, v) {
    try {
      localStorage.setItem(PROP + k, String(v));
    } catch (e) {
      throw Object.assign(new Error('저장 공간이 가득 찼어요.'), { code: 'STORAGE_FULL' });
    }
    return scriptProperties;
  },
  deleteProperty(k) {
    localStorage.removeItem(PROP + k);
    return scriptProperties;
  },
  getProperties() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PROP)) out[key.slice(PROP.length)] = localStorage.getItem(key);
    }
    return out;
  },
  getKeys() {
    return Object.keys(scriptProperties.getProperties());
  },
};

// ── CacheService ─────────────────────────────────────
const CACHE = NS + 'cache:';
const scriptCache = {
  put(k, v, sec = 600) {
    write(CACHE + k, { v: String(v), exp: Date.now() + sec * 1000 });
  },
  get(k) {
    const e = read(CACHE + k, null);
    if (!e) return null;
    if (e.exp < Date.now()) {
      localStorage.removeItem(CACHE + k);
      return null;
    }
    return e.v;
  },
  getAll(keys) {
    const out = {};
    keys.forEach((k) => {
      const v = scriptCache.get(k);
      if (v !== null) out[k] = v;
    });
    return out;
  },
  remove(k) {
    localStorage.removeItem(CACHE + k);
  },
};

// ── LockService (바깥에서 navigator.locks로 한 번에 하나씩 처리하므로 여기서는 늘 성공) ──
const lock = { tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true };

// ── SpreadsheetApp ───────────────────────────────────
// 시트 내용: { sheets: { 이름: { rows: [[...]], hidden } }, order: [이름...] }
function loadBook() {
  return read(SS_KEY, { sheets: {}, order: [] });
}

function saveBook(b) {
  write(SS_KEY, b);
}

// 시트에 넣을 때처럼: '로 시작하면 글자 그대로, 숫자 모양이면 숫자로 바꾼다.
function toCell(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    if (v.startsWith("'")) return { t: v.slice(1) };
    if (/^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
    if (/^[=+]/.test(v)) return { t: '#ERROR!' };
  }
  return v === undefined ? '' : v;
}

function fromCell(v) {
  if (v && typeof v === 'object' && 't' in v) return v.t;
  return v === null || v === undefined ? '' : v;
}

// 서식 관련 함수는 연습 모드에서는 아무 일도 하지 않는다.
function chainable(target) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => chainable(obj);
    },
  });
}

function makeRange(name, row, col, nr = 1, nc = 1) {
  const range = {
    getValues() {
      const b = loadBook();
      const rows = (b.sheets[name] && b.sheets[name].rows) || [];
      const out = [];
      for (let r = 0; r < nr; r++) {
        const src = rows[row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < nc; c++) line.push(fromCell(src[col - 1 + c]));
        out.push(line);
      }
      return out;
    },
    getValue() {
      return range.getValues()[0][0];
    },
    setValues(values) {
      const b = loadBook();
      const sh = b.sheets[name];
      for (let r = 0; r < values.length; r++) {
        const idx = row - 1 + r;
        while (sh.rows.length <= idx) sh.rows.push([]);
        const line = sh.rows[idx];
        for (let c = 0; c < values[r].length; c++) {
          while (line.length < col - 1 + c) line.push('');
          line[col - 1 + c] = toCell(values[r][c]);
        }
      }
      saveBook(b);
      return chainable(range);
    },
    setValue(v) {
      return range.setValues([[v]]);
    },
  };
  return chainable(range);
}

function makeSheet(name) {
  const sheet = {
    getName: () => name,
    getLastRow() {
      const b = loadBook();
      const rows = (b.sheets[name] && b.sheets[name].rows) || [];
      let n = rows.length;
      while (n > 0 && (!rows[n - 1] || rows[n - 1].every((v) => v === '' || v === null))) n--;
      return n;
    },
    getRange: (row, col, nr, nc) => makeRange(name, row, col, nr, nc),
    appendRow(values) {
      const n = sheet.getLastRow();
      makeRange(name, n + 1, 1, 1, values.length).setValues([values]);
      return chainable(sheet);
    },
    deleteRows(start, count) {
      const b = loadBook();
      b.sheets[name].rows.splice(start - 1, count);
      saveBook(b);
    },
    deleteRow(r) {
      sheet.deleteRows(r, 1);
    },
    hideSheet() {
      const b = loadBook();
      b.sheets[name].hidden = true;
      saveBook(b);
      return chainable(sheet);
    },
  };
  return chainable(sheet);
}

const spreadsheet = {
  getSheetByName(name) {
    const b = loadBook();
    return b.sheets[name] ? makeSheet(name) : null;
  },
  insertSheet(name) {
    const b = loadBook();
    if (!b.sheets[name]) {
      b.sheets[name] = { rows: [], hidden: false };
      b.order.push(name);
      saveBook(b);
    }
    return makeSheet(name);
  },
  getUrl: () => '',
  getId: () => 'practice',
};

// 연습 모드에서 쌓인 질문 기록(시트 흉내)을 표로 돌려준다. (설정 화면에서 보기용)
export function practiceSheetRows(name = '질문 기록') {
  const b = loadBook();
  const sh = b.sheets[name];
  return sh ? sh.rows.map((r) => r.map(fromCell)) : [];
}

export function clearPractice() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

// ── 그 밖의 서비스 ────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, '0');
}

const Utilities = {
  getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)),
  formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },
};

const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(text) {
    const out = { getContent: () => text, setMimeType: () => out };
    return out;
  },
};

export const GAS_GLOBALS = {
  PropertiesService: { getScriptProperties: () => scriptProperties },
  CacheService: { getScriptCache: () => scriptCache },
  LockService: { getScriptLock: () => lock },
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  ContentService,
  Utilities,
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  Logger: { log: (...a) => console.log('[Apps Script]', ...a) },
};
