import { brandHtml, ICON, toast, copyText, esc, confirmBox } from './ui.js';
import {
  GasApi,
  normalizeUrl,
  isDevUrl,
  trialUrl,
  hasTrial,
  templateCopyUrl,
  getStoredUrl,
  getTeacherPw,
  saveUrl,
  saveTeacherPw,
  clearConnection,
  explainError,
} from './api.js';
import { clearPractice } from './gas-stub.js';
import { TRIAL_RULES } from './config.js';

const $ = (id) => document.getElementById(id);

$('brand').innerHTML = brandHtml('선생님 설정 · 구글 시트 버전');
$('back-ico').innerHTML = ICON.back;
$('copy-ico').innerHTML = ICON.copy;
$('dl-ico').innerHTML = ICON.download;
$('copy-sheet-ico').innerHTML = ICON.sheet;

const params = new URLSearchParams(location.search);
if (params.get('from') === 'teacher') {
  const a = $('back-link');
  a.href = 'teacher.html';
  a.lastChild.textContent = '선생님 화면으로';
}

// 사본 만들기 링크
const copyUrl = templateCopyUrl();
if (copyUrl) $('copy-link').href = copyUrl;
else {
  $('copy-ready').hidden = true;
  $('copy-missing').hidden = false;
  $('manual').open = true;
}

// 체험 서버 안내
if (hasTrial()) {
  $('trial-card').hidden = false;
  $('trial-desc').innerHTML = `개발진이 준비한 체험 서버로 <b>아무 설정 없이</b> 게임을 만들어 볼 수 있어요. 여러 학교가 함께 쓰는 서버라 질문 기록은 <b>${TRIAL_RULES.keepHours}시간 뒤</b> 지워지고, 이름은 실명 대신 번호나 별명으로 써요. 마음에 들면 아래 순서로 내 구글 시트를 연결해 주세요.`;
}

// 직접 만들기용 코드
let codeText = '';
fetch('gas/Code.gs')
  .then((r) => r.text())
  .then((t) => {
    codeText = t;
    $('code').textContent = t;
    $('code-size').textContent = `${t.split('\n').length}줄`;
  })
  .catch(() => {
    $('code').textContent = '코드 파일을 불러오지 못했어요. gas/Code.gs 파일을 열어 복사해 주세요.';
  });

$('copy-code').addEventListener('click', async () => {
  if (!codeText) return;
  const ok = await copyText(codeText);
  toast(ok ? '코드를 복사했어요. Apps Script 편집기에 붙여 넣어 주세요.' : '복사하지 못했어요. 코드 내용을 펼쳐 직접 복사해 주세요.', ok ? 'good' : 'warn');
});

const urlEl = $('url');
const pwEl = $('pw');

function showResult(html, kind = '') {
  $('result').innerHTML = `<div class="notice ${kind}"><div>${html}</div></div>`;
}

function sheetLink(url) {
  return url ? `<div class="row" style="margin-top:10px"><a class="btn btn-cream btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${ICON.sheet}내 구글 시트 열기</a><a class="btn btn-primary btn-sm" href="teacher.html">게임 만들러 가기</a></div>` : '';
}

async function renderStatus() {
  const box = $('status');
  const url = getStoredUrl();
  const pw = getTeacherPw();
  if (url && !urlEl.value) urlEl.value = url;
  if (!url || !pw) {
    box.innerHTML = `<div class="notice"><div><strong>아직 연결되지 않았어요</strong>아래 1~3단계를 따라 하면 모둠 태블릿으로 우리 반 수업을 할 수 있어요.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="notice"><div><strong>연결을 확인하는 중이에요…</strong></div></div>`;
  try {
    const res = await new GasApi(url, pw).call('claim', { pw });
    box.innerHTML = `<div class="notice green"><div><strong>내 구글 시트에 연결되어 있어요</strong>이 브라우저에서 '내 구글 시트'로 만드는 게임은 모둠 태블릿이 들어올 수 있어요.${sheetLink(res.sheetUrl)}</div></div>`;
  } catch (e) {
    box.innerHTML = `<div class="notice apricot"><div><strong>저장된 연결을 확인하지 못했어요</strong>${esc(explainError(e))}</div></div>`;
  }
}
renderStatus();

$('save').addEventListener('click', async () => {
  const raw = urlEl.value.trim();
  const pw = pwEl.value;
  if (isDevUrl(raw)) {
    showResult('<strong>테스트 주소(…/dev)예요</strong>학생 태블릿은 이 주소로 들어올 수 없어요. <b>배포 → 새 배포</b>(또는 배포 관리)에 나온 <b>/exec</b>로 끝나는 주소를 붙여 넣어 주세요.', 'apricot');
    return;
  }
  const url = normalizeUrl(raw);
  if (!url) {
    showResult('<strong>웹 앱 주소를 다시 확인해 주세요</strong>https://script.google.com/macros/s/…/exec 모양이어야 해요. 시트 주소(docs.google.com)가 아니라 배포할 때 나온 웹 앱 URL이에요.', 'apricot');
    return;
  }
  if (url === trialUrl()) {
    showResult('<strong>이 주소는 개발진의 체험 서버예요</strong>내 드라이브에 복사한 시트에서 배포한 웹 앱 주소를 넣어 주세요.', 'apricot');
    return;
  }
  if (pw.length < 4) {
    showResult('<strong>선생님 비밀번호를 4글자 이상 써 주세요</strong>', 'apricot');
    return;
  }
  const btn = $('save');
  btn.disabled = true;
  btn.textContent = '확인하는 중…';
  showResult('구글 시트 서버에 연결하고 있어요… (처음에는 10초쯤 걸릴 수 있어요)');
  try {
    const api = new GasApi(url, pw);
    const hello = await api.call('hello');
    if (hello.shared) {
      const err = new Error('SHARED_SERVER');
      err.code = 'SHARED_SERVER';
      throw err;
    }
    const res = await api.call('claim', { pw });
    saveUrl(url);
    saveTeacherPw(pw);
    // 연결했으니 선생님 화면의 수업 방식을 '내 구글 시트'로 바꿔 둔다
    try {
      const FORM_KEY = 'qtg-sheet-teacher-form';
      const form = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
      form.mode = 'sheet';
      localStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch (e) {}
    renderStatus();
    showResult(
      `<strong>${res.created ? '연결 완료! 선생님 비밀번호를 새로 정했어요' : '연결 완료!'}</strong>선생님 화면의 수업 방식에서 <b>내 구글 시트</b>를 고르면 돼요.${sheetLink(res.sheetUrl)}`,
      'green'
    );
    toast('내 구글 시트 연결을 저장했어요.', 'good');
  } catch (e) {
    console.error(e);
    showResult(`<strong>연결하지 못했어요</strong>${esc(explainError(e))}`, 'apricot');
  } finally {
    btn.disabled = false;
    btn.textContent = '저장하고 연결 확인';
  }
});

$('clear').addEventListener('click', async () => {
  const ok = await confirmBox({
    title: '이 컴퓨터의 연결을 지울까요?',
    body: '이 브라우저에 저장된 웹 앱 주소와 비밀번호만 지워져요. 구글 시트와 질문 기록은 그대로예요.',
    ok: '지우기',
    danger: true,
  });
  if (!ok) return;
  clearConnection();
  urlEl.value = '';
  pwEl.value = '';
  renderStatus();
  $('result').innerHTML = '';
  toast('연결을 지웠어요.');
});

$('clear-practice').addEventListener('click', async () => {
  const ok = await confirmBox({
    title: '연습 모드 기록을 지울까요?',
    body: '이 브라우저에서 연습 모드로 만든 게임과 질문이 모두 지워져요. 구글 시트에는 영향이 없어요.',
    ok: '지우기',
    danger: true,
  });
  if (!ok) return;
  clearPractice();
  toast('연습 모드 기록을 지웠어요.', 'good');
});
