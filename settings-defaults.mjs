// 설정 기본값: 화면(ui)과 규칙(rules). 사용자가 바꾼 값은 data\settings.json에 저장되고 이 기본값 위에 덮어써져요.
export const DEFAULT_SETTINGS = {
  ui: {
    brand: '키워드 분석기',
    accent: '#16a34a',
    zoom: 100, // 화면 배율(%)
    density: 'normal', // compact | normal | roomy
    startView: 'analyze', // analyze | ai | dup | bulk
    numberStyle: 'short', // short(12.5만) | full(125,000)
    relPage: 50, // 연관 키워드 표 한 페이지 행 수
    bulkPage: 100, // 대량 분석 표 한 페이지 행 수
    hideButtons: [], // 숨길 상단 버튼: ai | dup | bulk | hist
  },
  rules: {
    analysis: {
      satBands: [30, 100, 300, 500], // 포화 지수(%) 경계: 매우 낮음 < 30 ≤ 낮음 < 100 ≤ 보통 < 300 ≤ 높음 < 500 ≤ 매우 높음
      gradeMinVol: 100, // 이 검색량 미만이면 D등급
      gradeBands: [1, 3, 10, 50], // 블로그 발행량 ÷ 검색량 경계: S < 1 ≤ A < 3 ≤ B < 10 ≤ C < 50 ≤ D
      issueBands: [20, 40, 60, 80], // 이슈성 점수 경계
      commercialWords: '가격, 비용, 요금, 보험료, 견적, 추천, 비교, 순위, 가입, 신청, 구매, 구입, 할인, 혜택, 이벤트, 쿠폰, 최저가, 판매, 렌탈, 대출, 발급, 상담, 업체, 쇼핑, 몰, 리뷰, 후기, 가성비, 저렴',
      infoWords: '뜻, 의미, 방법, 하는법, 이유, 원인, 증상, 차이, 종류, 조건, 기준, 정리, 계산, 나이, 기간, 효과, 부작용, 란, 역사, 정의, 서류, 절차, 규정, 청구',
      commercialBonus: 25,
      infoPenalty: 20,
      commercialBands: [30, 50, 70], // 정보성 우세 < 30 ≤ 혼합 < 50 ≤ 상업성 우세 < 70 ≤ 상업성 강함
    },
    generate: {
      system: '너는 한국 네이버 검색 마케팅 키워드 리서처다. 실제 사용자가 네이버 검색창에 입력할 만한 검색어만 제안한다. 생각(추론) 과정도 한국어로 작성하고, 최종 답은 설명 없이 JSON만 출력한다.',
      rules: [
        '- 브리프의 목적·타깃·조건에 맞춰 다양한 각도로 발굴: 정보 탐색, 비교, 가입·구매, 후기, 대상·상황 세분화, 롱테일',
        '- 제안한 키워드끼리 중복 금지. 대소문자·기호·어순·조사만 다른 변형도 중복으로 본다 (예: "KB자동차보험" = "kb자동차보험", "보험료비교" = "비교보험료")',
        '- 참고 키워드와 아래 제외 목록에 있는 것, 그리고 그것들과 의미가 사실상 같은 것은 제안하지 않는다',
        '- 문장형은 피하고 단어 1~5개를 붙여 쓴 검색어 형태',
      ].join('\n'),
      noSpace: true,
      temperature: 0.9,
    },
    verify: {
      criteria: [
        '1) 브리프(주제)와 직접 관련이 있다',
        '2) 브리프에 적힌 조건과 의도를 지킨다 (대상, 상황, 검색 단계, 제외 단어 등)',
        '3) 실제 사용자가 네이버에 검색할 만한 자연스러운 검색어다 (어색한 조합, 문장형, 잘못된 사실 포함 시 부적합)',
      ].join('\n'),
      useVolume: true, // AI에게 월간 검색량을 같이 보여줌
      consistN: 2, // 이 횟수 이상 모두 적합이면 "일관 적합"
      lowAs: 0, // 네이버 "<10"을 몇으로 계산할지 (0~9)
      defaultMinVol: 50, // 새 탭의 최소 월간 검색량
      temperature: 0.7,
    },
    copy: {
      caution: '', // 사용자 주의어: 카피에 쓰면 표시 (쉼표·줄바꿈 구분, 빈 목록에서 시작)
      superCheck: true, // 네이버 공통 규정: 근거 없는 최상급 (타이틀은 불가, 설명은 근거·출처 필요)
      superWords: '완벽, 초일류, 가장 좋은, 초특급, 최초, 최고, 최상, 최적, 최저, 가장, 제일, 1위, 유일, 넘버원, No.1, 100%',
      perAngle: 3, // 각도마다 몇 개
      temperature: 0.9,
      system: '', // 비우면 기본 지시문
    },
    dedup: {
      ignoreCase: true,
      ignoreChars: "-_.,·/()[]{}'\"!?~:;+|#*", // 띄어쓰기와 함께 무시할 기호
      order: true, // 단어 순서만 다른 것도 중복으로
      typoMinLen: 4, // 1글자 차이를 "유사"로 보는 최소 글자 수
      typoDigits: true, // 숫자가 다르면(20대 vs 50대) 1글자 차이여도 다른 키워드로
      containMinLen: 2, // 포함 관계를 "유사"로 보는 최소 글자 수
      simThreshold: 0.25, // 의미 중복 검사 때 AI에 보낼 '글자가 비슷한' 후보 기준 (0~1)
      synonyms: '', // 같은 말로 볼 표현: 한 줄에 "싼=저렴한=저가"
    },
  },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// 기본값 위에 저장값을 덮어씀 (타입이 다른 값은 무시)
export function mergeSettings(def, val) {
  if (!isObj(def)) {
    if (Array.isArray(def)) return Array.isArray(val) && val.length === def.length && val.every((x) => typeof x === typeof def[0]) ? val : def;
    if (typeof def === 'number') return typeof val === 'number' && isFinite(val) ? val : def;
    return typeof val === typeof def ? val : def;
  }
  const out = {};
  for (const k of Object.keys(def)) out[k] = mergeSettings(def[k], isObj(val) ? val[k] : undefined);
  return out;
}
// hideButtons처럼 길이가 정해지지 않은 배열은 따로 처리
export function normalizeSettings(val) {
  const s = mergeSettings(DEFAULT_SETTINGS, val || {});
  const hb = val?.ui?.hideButtons;
  s.ui.hideButtons = Array.isArray(hb) ? hb.filter((x) => ['ai', 'dup', 'bulk', 'hist'].includes(x)) : [];
  return s;
}
