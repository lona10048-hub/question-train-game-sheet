// 화면 공통 도우미: 그림(SVG), 알림, 확인창, QR, 파일 내려받기, 이미지 압축

import qrcode from '../vendor/qrcode.mjs';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 그림 ───────────────────────────────────────────

export function trainIcon(size = 40) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 48 48">
    <g stroke="#7a5c3e" stroke-width="2.2" stroke-linejoin="round">
      <rect x="5" y="17" width="24" height="15" rx="4" fill="#ee9a73"/>
      <rect x="18" y="9" width="11" height="10" rx="2.5" fill="#ee9a73"/>
      <rect x="8" y="10" width="5" height="8" rx="1.5" fill="#8a6a4a"/>
      <rect x="31" y="20" width="13" height="12" rx="3.5" fill="#fffdf6"/>
      <circle cx="12" cy="35" r="4" fill="#ffe3bf"/><circle cx="24" cy="35" r="4" fill="#ffe3bf"/>
      <circle cx="37.5" cy="35" r="3.4" fill="#ffe3bf"/>
    </g>
    <path d="M29 26h2" stroke="#7a5c3e" stroke-width="2.2"/>
    <text x="37.5" y="30" text-anchor="middle" font-size="9" font-weight="700" fill="#7a5c3e" font-family="Dunggeunmiso, sans-serif">?</text>
    <path d="M3 41h42" stroke="#c7a676" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

// 안내 고양이 '궁금이'
export function catSvg(size = 120, label = '') {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg ${a11y} width="${size}" height="${size}" viewBox="0 0 120 120">
    <path d="M84 96 C108 96 112 70 98 60 C88 53 76 60 80 70" fill="none" stroke="#7a5c3e" stroke-width="13" stroke-linecap="round"/>
    <path d="M84 96 C108 96 112 70 98 60 C88 53 76 60 80 70" fill="none" stroke="#f2a65a" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="58" cy="94" rx="27" ry="20" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3"/>
    <path d="M30 46 L34 20 L52 36 Z" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3" stroke-linejoin="round"/>
    <path d="M86 46 L82 20 L64 36 Z" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 40 L37 28 L46 36 Z" fill="#f7b7a3"/><path d="M80 40 L79 28 L70 36 Z" fill="#f7b7a3"/>
    <ellipse cx="58" cy="58" rx="33" ry="27" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3"/>
    <path d="M50 33 L52 41 M58 31 L58 40 M66 33 L64 41" stroke="#f2a65a" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="46" cy="60" rx="3.6" ry="4.6" fill="#4a3222"/><ellipse cx="70" cy="60" rx="3.6" ry="4.6" fill="#4a3222"/>
    <circle cx="47.2" cy="58.4" r="1.3" fill="#fff"/><circle cx="71.2" cy="58.4" r="1.3" fill="#fff"/>
    <ellipse cx="37" cy="69" rx="6" ry="3.6" fill="#f7a8a0" opacity="0.7"/><ellipse cx="79" cy="69" rx="6" ry="3.6" fill="#f7a8a0" opacity="0.7"/>
    <path d="M55.5 64 L60.5 64 L58 67 Z" fill="#e98c86"/>
    <path d="M52 69 Q55 72 58 69 Q61 72 64 69" fill="none" stroke="#7a5c3e" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="46" cy="110" rx="9" ry="6" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3"/>
    <ellipse cx="70" cy="110" rx="9" ry="6" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3"/>
  </svg>`;
}

export function locoSvg(color = '#ee9a73', label = '', h = 62) {
  const w = Math.round((h * 86) / 64);
  return `<svg class="loco" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 86 64">
    <path d="M14 6 q-6 -6 0 -6" fill="none"/>
    <g stroke="#7a5c3e" stroke-width="3" stroke-linejoin="round">
      <rect x="4" y="20" width="70" height="32" rx="9" fill="${color}"/>
      <rect x="44" y="4" width="28" height="20" rx="5" fill="${color}"/>
      <rect x="12" y="8" width="11" height="14" rx="3" fill="#8a6a4a"/>
      <rect x="50" y="9" width="16" height="10" rx="3" fill="#fffdf6"/>
      <circle cx="22" cy="54" r="8" fill="#ffe3bf"/><circle cx="56" cy="54" r="8" fill="#ffe3bf"/>
    </g>
    <path d="M74 40h8" stroke="#7a5c3e" stroke-width="3" stroke-linecap="round"/>
    <text x="36" y="43" text-anchor="middle" font-size="19" font-weight="700" fill="#4a3424" font-family="Dunggeunmiso, sans-serif">${esc(label)}</text>
  </svg>`;
}

// 기차가 들어가 있는 터널 언덕 (칸 수를 감추는 그림)
export function tunnelSvg(h = 80) {
  const w = Math.round(h * 2.2);
  return `<svg class="tunnel" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 220 100" preserveAspectRatio="xMaxYMax meet">
    <path d="M4 100 C4 50 30 12 86 9 C146 6 198 32 218 100 Z" fill="#bcd99d" stroke="#7a5c3e" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 34 q8 -6 16 0 M112 22 q8 -6 16 0 M168 44 q7 -5 14 0" fill="none" stroke="#8fb872" stroke-width="3" stroke-linecap="round"/>
    <path d="M12 100 V72 C12 50 28 36 50 36 C72 36 88 50 88 72 V100" fill="#d9c39b" stroke="#7a5c3e" stroke-width="3" stroke-linejoin="round"/>
    <path d="M23 100 V74 C23 58 35 47 50 47 C65 47 77 58 77 74 V100 Z" fill="#4a3a2c"/>
    <path d="M26 58 h8 M44 44 v6 M66 58 h8" stroke="#b39a72" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="150" cy="52" r="17" fill="#fffdf6" stroke="#7a5c3e" stroke-width="3"/>
    <text x="150" y="60" text-anchor="middle" font-size="22" font-weight="700" fill="#7a5c3e" font-family="Dunggeunmiso, sans-serif">?</text>
    <g stroke="#7a5c3e" stroke-width="2.5"><rect x="192" y="52" width="6" height="16" fill="#c49564"/><circle cx="195" cy="46" r="10" fill="#9cc877"/></g>
  </svg>`;
}

// 언덕 왼쪽의 터널 입구
export function portalSvg(h = 80) {
  const w = Math.round(h * 0.8);
  return `<svg class="portal" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 80 100">
    <path d="M4 100 V52 C4 26 20 12 40 12 C60 12 76 26 76 52 V100" fill="#d9c39b" stroke="#7a5c3e" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M15 100 V54 C15 35 26 24 40 24 C54 24 65 35 65 54 V100 Z" fill="#4a3a2c"/>
    <path d="M8 42 h7 M36 15 v7 M65 42 h7" stroke="#b39a72" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

export function treeSvg(h = 40) {
  return `<svg class="tree" aria-hidden="true" width="${Math.round(h * 0.7)}" height="${h}" viewBox="0 0 28 40">
    <g stroke="#7a5c3e" stroke-width="2.5"><rect x="11" y="24" width="6" height="15" fill="#c49564"/><circle cx="14" cy="16" r="12" fill="#9cc877"/></g>
  </svg>`;
}

export function drumSvg(size = 110) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 120 120">
    <path d="M30 30 L8 6 M90 30 L112 6" stroke="#7a5c3e" stroke-width="6" stroke-linecap="round"/>
    <circle cx="8" cy="6" r="6" fill="#f4d57a" stroke="#7a5c3e" stroke-width="3"/><circle cx="112" cy="6" r="6" fill="#f4d57a" stroke="#7a5c3e" stroke-width="3"/>
    <path d="M18 46 V88 C18 100 102 100 102 88 V46" fill="#e98d64" stroke="#7a5c3e" stroke-width="4" stroke-linejoin="round"/>
    <path d="M18 60 L40 92 L60 60 L80 92 L102 60" fill="none" stroke="#fff3c9" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="60" cy="46" rx="42" ry="14" fill="#fffdf6" stroke="#7a5c3e" stroke-width="4"/>
  </svg>`;
}

export function heroArt() {
  return `<svg role="img" aria-label="고양이 궁금이가 질문 기차를 운전하는 그림" viewBox="0 0 460 330">
    <path d="M0 330 V262 Q90 214 200 246 Q300 274 380 236 Q430 214 460 230 V330 Z" fill="#e6efd8"/>
    <path d="M0 330 V292 Q120 270 240 292 Q350 312 460 286 V330 Z" fill="#d9e8c9"/>
    <g fill="#fffdf6" opacity="0.95">
      <circle cx="78" cy="58" r="16"/><circle cx="100" cy="50" r="22"/><circle cx="124" cy="60" r="15"/>
      <circle cx="356" cy="40" r="13"/><circle cx="376" cy="34" r="18"/><circle cx="396" cy="42" r="12"/>
    </g>
    <g stroke="#7a5c3e" stroke-width="3">
      <rect x="436" y="188" width="9" height="40" fill="#c49564"/><circle cx="440" cy="176" r="18" fill="#a9cf84"/>
      <rect x="16" y="196" width="9" height="34" fill="#c49564"/><circle cx="20" cy="184" r="16" fill="#9cc877"/>
    </g>
    <path d="M10 262 H450" stroke="#c7a676" stroke-width="5" stroke-linecap="round"/>
    <path d="M10 274 H450" stroke="#c7a676" stroke-width="5" stroke-linecap="round"/>
    <g stroke="#a98656" stroke-width="5" stroke-linecap="round">
      <path d="M30 262v12M62 262v12M94 262v12M126 262v12M158 262v12M190 262v12M222 262v12M254 262v12M286 262v12M318 262v12M350 262v12M382 262v12M414 262v12"/>
    </g>
    <g fill="#ffffff" stroke="#e9dcc2" stroke-width="2">
      <circle cx="330" cy="116" r="12"/><circle cx="352" cy="98" r="17"/><circle cx="380" cy="86" r="22"/>
    </g>
    <g stroke="#7a5c3e" stroke-width="3.5" stroke-linejoin="round">
      <rect x="40" y="200" width="78" height="48" rx="12" fill="#fffdf6"/>
      <rect x="128" y="200" width="78" height="48" rx="12" fill="#fff3c9"/>
      <rect x="216" y="200" width="78" height="48" rx="12" fill="#fce4d7"/>
      <rect x="300" y="168" width="120" height="80" rx="16" fill="#ee9a73"/>
      <rect x="300" y="128" width="62" height="56" rx="10" fill="#ee9a73"/>
      <rect x="372" y="132" width="22" height="40" rx="5" fill="#8a6a4a"/>
      <rect x="310" y="138" width="42" height="34" rx="8" fill="#fffdf6"/>
    </g>
    <g fill="#ffe3bf" stroke="#7a5c3e" stroke-width="3.5">
      <circle cx="60" cy="254" r="10"/><circle cx="98" cy="254" r="10"/>
      <circle cx="148" cy="254" r="10"/><circle cx="186" cy="254" r="10"/>
      <circle cx="236" cy="254" r="10"/><circle cx="274" cy="254" r="10"/>
      <circle cx="326" cy="252" r="14"/><circle cx="392" cy="252" r="14"/>
    </g>
    <path d="M118 226h10M206 226h10M294 226h6" stroke="#7a5c3e" stroke-width="3.5"/>
    <g font-family="Dunggeunmiso, sans-serif" font-weight="700" font-size="30" fill="#7a5c3e" text-anchor="middle">
      <text x="79" y="235">?</text><text x="167" y="235">?</text><text x="255" y="235">?</text>
    </g>
    <g transform="translate(305 118) scale(0.44)">
      <path d="M30 46 L34 20 L52 36 Z" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="7" stroke-linejoin="round"/>
      <path d="M86 46 L82 20 L64 36 Z" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="7" stroke-linejoin="round"/>
      <ellipse cx="58" cy="62" rx="33" ry="27" fill="#ffe3bf" stroke="#7a5c3e" stroke-width="7"/>
      <path d="M50 37 L52 45 M58 35 L58 44 M66 37 L64 45" stroke="#f2a65a" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="46" cy="64" rx="5" ry="6" fill="#4a3222"/><ellipse cx="70" cy="64" rx="5" ry="6" fill="#4a3222"/>
      <ellipse cx="37" cy="73" rx="7" ry="4" fill="#f7a8a0"/><ellipse cx="79" cy="73" rx="7" ry="4" fill="#f7a8a0"/>
      <path d="M52 74 Q55 78 58 74 Q61 78 64 74" fill="none" stroke="#7a5c3e" stroke-width="4" stroke-linecap="round"/>
      <path d="M22 34 Q58 6 94 34 Z" fill="#5b8751" stroke="#7a5c3e" stroke-width="6" stroke-linejoin="round"/>
      <rect x="18" y="30" width="80" height="10" rx="5" fill="#426639" stroke="#7a5c3e" stroke-width="5"/>
    </g>
  </svg>`;
}

export function teacherArt() {
  return `<svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64">
    <rect x="8" y="10" width="48" height="34" rx="6" fill="#fffdf6" stroke="#426639" stroke-width="3"/>
    <path d="M24 54l8-10 8 10" fill="none" stroke="#426639" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="32" y="36" text-anchor="middle" font-size="22" font-weight="700" fill="#5b8751" font-family="Dunggeunmiso, sans-serif">?</text>
    <path d="M16 18h8M40 18h8" stroke="#a9c995" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

export function studentArt() {
  return `<svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64">
    <circle cx="32" cy="24" r="12" fill="#ffe3bf" stroke="#9a5a3a" stroke-width="3"/>
    <path d="M12 56c2-11 10-17 20-17s18 6 20 17" fill="#ee9a73" stroke="#9a5a3a" stroke-width="3" stroke-linejoin="round"/>
    <path d="M48 10v14" stroke="#9a5a3a" stroke-width="3" stroke-linecap="round"/>
    <circle cx="48" cy="8" r="4" fill="#f4d57a" stroke="#9a5a3a" stroke-width="2.5"/>
    <circle cx="27.5" cy="24" r="1.8" fill="#4a3222"/><circle cx="36.5" cy="24" r="1.8" fill="#4a3222"/>
  </svg>`;
}

export const ICON = {
  arrow: `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  back: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  check: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  upload: `<svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>`,
  gear: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>`,
  copy: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`,
  pause: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`,
  play: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
  flag: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`,
  download: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`,
  trash: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  shuffle: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>`,
  skip: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l9 7-9 7V5zM19 5v14"/></svg>`,
  star: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#e7b43b" stroke="#a87b14" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`,
};

ICON.sheet = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M4 9h16M4 15h16M10 9v12"/></svg>`;
ICON.up = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>`;
ICON.down = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
ICON.x = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
ICON.plus = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
ICON.refresh = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>`;

export function brandHtml(sub = '질문하는 힘 기르기 · 1차시', href = 'index.html') {
  return `<a class="brand" href="${href}" aria-label="질문 기차 게임 처음 화면">
    <span class="brand-tile">${trainIcon(42)}</span>
    <span><span class="brand-name">질문 기차 게임</span><br><span class="brand-sub">${esc(sub)}</span></span>
  </a>`;
}

// ── 알림 · 확인창 ──────────────────────────────────

export function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

export function openModal(html, { wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const first = back.querySelector('button, input, [tabindex]');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: back.firstElementChild, close };
}

export function confirmBox({ title, body = '', ok = '확인', cancel = '취소', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(
      `<h2>${esc(title)}</h2>${body ? `<p>${body}</p>` : ''}
       <div class="actions">
         <button type="button" class="btn btn-cream" data-act="cancel">${esc(cancel)}</button>
         <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(ok)}</button>
       </div>`,
      {
        onClose: () => {
          if (!done) resolve(false);
        },
      }
    );
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      done = true;
      resolve(b.dataset.act === 'ok');
      m.close();
    });
  });
}

export function showPhoto(src, alt = '제시 사진') {
  openModal(
    `<img src="${esc(src)}" alt="${esc(alt)}" style="width:100%;border-radius:20px">
     <div class="actions" style="margin-top:14px"><button type="button" class="btn btn-cream" data-close>닫기</button></div>`,
    { wide: true }
  ).el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) e.currentTarget.closest('.modal-back').click();
  });
}

// ── QR · 복사 · 내려받기 ────────────────────────────

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: '학생 입장 QR 코드' });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e2) {}
    ta.remove();
    return ok;
  }
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function csvCell(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 사진을 가로 1280px 이하 JPEG로 줄여 문자열(data URL)로 만든다.
export function compressImage(file, maxW = 1280, maxBytes = 420000) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('사진 파일을 골라 주세요.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, maxW / w);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let q = 0.82;
      let data = canvas.toDataURL('image/jpeg', q);
      while (data.length > maxBytes * 1.37 && q > 0.4) {
        q -= 0.08;
        data = canvas.toDataURL('image/jpeg', q);
      }
      if (data.length > maxBytes * 1.37 * 1.3) return reject(new Error('사진이 너무 커요. 더 작은 사진을 골라 주세요.'));
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 열지 못했어요.'));
    };
    img.src = url;
  });
}

// 인터넷 연결이 끊기면 아래쪽에 알림 띠를 띄운다.
export function watchConnection(be) {
  let bar = null;
  let timer = null;
  return be.onConnection((ok) => {
    clearTimeout(timer);
    if (ok) {
      if (bar) bar.remove();
      bar = null;
      return;
    }
    timer = setTimeout(() => {
      if (bar) return;
      bar = document.createElement('div');
      bar.className = 'offline-bar';
      bar.setAttribute('role', 'alert');
      bar.textContent = '인터넷 연결을 확인하는 중이에요. 다시 연결되면 자동으로 이어져요.';
      document.body.appendChild(bar);
    }, 2500);
  });
}

// 한글 입력 중(조합 중)에는 Enter를 무시한다.
export function isComposingEnter(e) {
  return e.isComposing || e.keyCode === 229;
}

export function photoSrcFor(meta, imageData, photoById) {
  if (!meta || !meta.photo) return null;
  if (meta.photo.kind === 'sample') {
    const p = photoById(meta.photo.id);
    return p ? p.src : null;
  }
  return imageData || null;
}
