// ════════════════════════════════════════════════
// 개발진이 채우는 곳 (GitHub에서 이 파일의 연필 버튼을 눌러 고쳐요)
// ════════════════════════════════════════════════

// ① 체험 서버: 개발진이 setupTrialServer를 실행하고 웹 앱으로 배포한 주소 (…/exec)
//    채우면 선생님들이 아무 설정 없이 '체험 서버'로 바로 게임을 만들 수 있어요.
//    예: export const TRIAL_GAS_URL = 'https://script.google.com/macros/s/AKfy...../exec';
export const TRIAL_GAS_URL = 'https://script.google.com/macros/s/AKfycbwlVqa1SSRVUI8_ln2JALdkP43dXl74scI_Eet1gYwGSUfjBNAYJh05j2nZYFzeifv_/exec';

// ② 사본용 원본 시트의 '사본 만들기' 주소
//    원본 시트를 '링크가 있는 모든 사용자 · 뷰어'로 공유하고, 주소 끝을 /copy 로 바꿔 넣어요.
//    예: export const TEMPLATE_COPY_URL = 'https://docs.google.com/spreadsheets/d/1AbC...../copy';
export const TEMPLATE_COPY_URL = 'https://docs.google.com/spreadsheets/d/1wz7X40ukwKIQiFCJqTII4wr-05UitvskRl-6t6JggDE/copy';

// ════════════════════════════════════════════════

export const APP_NAME = '질문 기차 게임';
export const VARIANT_LABEL = '구글 시트 버전';

// 체험 서버 규칙 (서버 코드 gas/Code.gs의 TRIAL_TTL_MS, TRIAL_LIMIT과 같게 맞춰 두세요)
export const TRIAL_RULES = { keepHours: 24, gamesPerTeacher: 6 };

// 서버에 상태를 물어보는 간격 (밀리초)
// 체험 서버는 여러 반이 함께 쓰니 조금 덜 자주 물어봐서 무료 한도를 아껴요.
export const POLL = {
  own: { teacher: 2000, tabletLobby: 2000, tabletPlay: 2500, tabletWaitReveal: 2500, tabletDone: 8000, hidden: 10000 },
  trial: { teacher: 3000, tabletLobby: 2500, tabletPlay: 4000, tabletWaitReveal: 3000, tabletDone: 12000, hidden: 15000 },
};
