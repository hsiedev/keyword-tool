// 네이버 검색광고 API 안전장치
// 분석기는 광고 계정을 "읽기만" 한다. 아래 목록에 없는 호출은 네이버로 보내기 전에 막는다.
// - 캠페인·광고그룹·키워드를 켜고 끄기, 입찰가·예산 변경, 등록·삭제(POST/PUT/DELETE)는 전부 차단
// - POST는 '예상치 계산'(/estimate/...)만 허용: 계정에 아무것도 저장하지 않는 조회용 API
const ALLOW = [
  ['GET', /^\/keywordstool$/], // 키워드 도구 (연관 키워드·검색량)
  ['GET', /^\/ncc\/campaigns$/], // 캠페인 목록
  ['GET', /^\/ncc\/adgroups$/], // 광고그룹 목록 (?nccCampaignId=)
  ['GET', /^\/ncc\/keywords$/], // 키워드 목록 (?nccAdgroupId=)
  ['GET', /^\/stats$/], // 성과 (노출·클릭·비용 등)
  ['POST', /^\/estimate\/(average-position-bid|median-bid|exposure-minimum-bid)\/keyword$/], // 입찰가 예상
  ['POST', /^\/estimate\/performance\/keyword$/], // 입찰가별 예상 실적
  ['POST', /^\/estimate\/performance-bulk$/],
];

export function adAllowed(method, uri) {
  const m = String(method || '').toUpperCase();
  const path = String(uri || '').split('?')[0];
  if (path.includes('..') || /[^\w\-/]/.test(path)) return false;
  return ALLOW.some(([am, re]) => am === m && re.test(path));
}

export function assertAdAllowed(method, uri) {
  if (!adAllowed(method, uri)) {
    const e = new Error(`안전장치: 광고 계정을 바꿀 수 있는 호출(${String(method).toUpperCase()} ${uri})은 분석기에서 막혀 있어요. 분석기는 광고 계정을 읽기만 해요.`);
    e.blocked = true;
    throw e;
  }
}
