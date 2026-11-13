// 자동 테스트: node tests/run.mjs  (또는 test.bat 더블클릭)
// - 실제 폴더의 config.json · cache.json · data\ 는 절대 건드리지 않아요.
//   코드만 임시 폴더로 복사해서 그 안에서 서버를 띄우고, 바깥 인터넷 요청은 전부 가짜 응답으로 바꿔요.
// - 하위 프로세스를 띄우지 않고 한 프로세스 안에서 돌아요.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-test-'));
let pass = 0, fail = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); pass++; results.push('  ✓ ' + name); }
  catch (e) { fail++; results.push('  ✗ ' + name + '\n      → ' + (e && e.message || e)); }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || '조건이 거짓'); };

// ---------------------------------------------------------------- 코드만 임시 폴더로 복사
for (const f of fs.readdirSync(ROOT)) if (/\.mjs$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f));
fs.cpSync(path.join(ROOT, 'public'), path.join(TMP, 'public'), { recursive: true });

// ---------------------------------------------------------------- 1. 설정 기본값
const { normalizeSettings, DEFAULT_SETTINGS } = await import(pathToFileURL(path.join(TMP, 'settings-defaults.mjs')).href);
await test('설정: 빈 값이면 기본값으로 채움', () => {
  const s = normalizeSettings({});
  eq(s.rules.verify.consistN, DEFAULT_SETTINGS.rules.verify.consistN);
  eq(s.ui.zoom, DEFAULT_SETTINGS.ui.zoom);
});
await test('설정: 잘못된 형식 값은 무시', () => {
  const s = normalizeSettings({ ui: { zoom: 'big', hideButtons: ['ai', 'bogus'] } });
  eq(s.ui.zoom, DEFAULT_SETTINGS.ui.zoom);
  eq(s.ui.hideButtons, ['ai']);
});

// ---------------------------------------------------------------- 2. GitHub 백업: 비밀 파일은 절대 올리지 않음
const { createGitSync } = await import(pathToFileURL(path.join(TMP, 'github-sync.mjs')).href);
await test('GitHub 백업: 키·토큰·캐시·개인 데이터 제외, 코드·화면·테스트 포함', () => {
  const P = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-sync-'));
  const w = (rel, s = 'x') => { fs.mkdirSync(path.dirname(path.join(P, rel)), { recursive: true }); fs.writeFileSync(path.join(P, rel), s); };
  ['config.json', 'cache.json', 'data/github.json', 'data/github-state.json', 'data/next-commit.txt', 'data/existing-keywords.json', 'data/bulk-history/a.json', 'backup/old/index.html', 'x.tmp',
    'server.mjs', 'README.md', 'start.bat', '.gitignore', 'public/index.html', 'public/logo.png', 'data/settings.json', 'tests/run.mjs'].forEach((f) => w(f));
  const files = createGitSync(P).listFiles(false);
  for (const bad of ['config.json', 'cache.json', 'data/github.json', 'data/github-state.json', 'data/next-commit.txt', 'data/existing-keywords.json', 'data/bulk-history/a.json', 'backup/old/index.html', 'x.tmp']) ok(!files.includes(bad), bad + ' 이(가) 올라가면 안 돼요');
  for (const good of ['server.mjs', 'README.md', 'start.bat', '.gitignore', 'public/index.html', 'public/logo.png', 'data/settings.json', 'tests/run.mjs']) ok(files.includes(good), good + ' 이(가) 빠졌어요');
  const withData = createGitSync(P).listFiles(true);
  ok(withData.includes('data/existing-keywords.json') && withData.includes('data/bulk-history/a.json'), '옵션을 켜면 개인 데이터도 포함');
  ok(!withData.includes('data/github.json'), '옵션을 켜도 토큰은 제외');
  fs.rmSync(P, { recursive: true, force: true });
});

// ---------------------------------------------------------------- 3. 섹션 분석 파서
const { parseSections } = await import(pathToFileURL(path.join(TMP, 'sections.mjs')).href);
await test('섹션 분석: 빈 HTML에도 오류 없이 빈 결과', () => {
  const r = parseSections('<html><body></body></html>', 'pc');
  ok(Array.isArray(r.order), 'order 배열');
});

await test('섹션 분석: 제목 안 주제 칩은 빼고 섹션 이름만 ("숏텐츠 | 증권" → 숏텐츠)', () => {
  const html = '<div data-meta-ssuid="shortents"><h2><span>숏텐츠</span><a>증권</a></h2></div><div data-meta-ssuid="foo"><h2><b>새 섹션</b><i>탭</i></h2></div>';
  eq(parseSections(html, 'pc').order.map((o) => o.name), ['숏텐츠', '새 섹션']);
});
await test('섹션 분석: 웹문서 계열이라도 맨 앞 제목이 있으면 그 이름 (브랜드 콘텐츠)', () => {
  const html = '<div data-meta-ssuid="review"><h2>비즈니스·경제 관련 브랜드 콘텐츠</h2><a href="https://a.com/x">a</a></div><div data-meta-ssuid="web"><a href="https://b.com/y">b</a></div><div data-meta-ssuid="web"></div>';
  eq(parseSections(html, 'pc').order.map((o) => o.name + o.count), ['비즈니스·경제 관련 브랜드 콘텐츠1', '웹사이트2']);
});
// ---------------------------------------------------------------- 3-1. 카피 규격 검사 · 경쟁 광고 읽기 · AI 요청문
const CORE = await import(pathToFileURL(path.join(TMP, 'copy-core.mjs')).href);
const CS = CORE.CopySpec;
const msgs = (r) => r.issues.map((i) => i.level + ':' + i.msg);
await test('카피 검사: 글자 수 초과·부족은 오류 (띄어쓰기 포함으로 셈)', () => {
  const r = CS.check('pl_ad', { title: '가나다라마바사아자차카타파하 가나', desc: '짧은 설명' }, {});
  ok(msgs(r).some((m) => m.startsWith('err:제목 17자')), msgs(r).join(' / '));
  ok(msgs(r).some((m) => m.startsWith('err:설명 5자 (최소 20자)')), msgs(r).join(' / '));
});
await test('카피 검사: 브랜드검색 타이틀 최상급은 오류, 설명은 근거 필요 경고', () => {
  const r = CS.check('bs_pc_basic', { title: '업계 최고 운전자보험', desc1: '가입자 1위 다이렉트', desc2: '지금 확인하세요' }, {});
  ok(msgs(r).some((m) => m.startsWith('err:타이틀에 최상급 불가: 최고')), msgs(r).join(' / '));
  ok(msgs(r).some((m) => m.startsWith('warn:최상급은 근거·출처 필요: 1위')), msgs(r).join(' / '));
});
await test('카피 검사: 14자를 다 쓰면 띄어쓰기 1회 필수 (모바일 메인타이틀)', () => {
  const r = CS.check('bs_mo_basic', { sub: '서브', main: '가나다라마바사아자차카타파하', desc1: '설명', desc2: '설명' }, {});
  ok(msgs(r).some((m) => m.includes('띄어쓰기 1회 필수')), msgs(r).join(' / '));
});
await test('카피 검사: 브랜드 정보에 없는 숫자 · 주의어 · 다른 광고주 · 장식 특수문자 · 업체 이름', () => {
  const r = CS.check('pl_ad', { title: '운전자보험 비교★', desc: '월 9,000원부터 상품권 5만원, 무료 가입 다른보험보다 좋아요' }, { brandNames: ['테스트화재'], facts: '월 9,000원 이상 가입 시 상품권 3만원', caution: ['무료'], rivals: ['다른보험'] });
  const m = msgs(r).join(' / ');
  ok(m.includes('브랜드 정보에 없는 숫자: 5만원') && !m.includes('9,000원'), m);
  ok(m.includes('주의어: 무료') && m.includes('다른 광고주 언급: 다른보험') && m.includes('장식용 특수문자') && m.includes('업체·사이트 이름이 없어요'), m);
});
await test('카피 검사: 슬로건에 할인·이벤트는 오류, 주의어 목록은 비어서 시작', () => {
  const r = CS.check('bs_slogan', { pc: '11월 할인 이벤트', mo: '홈페이지' }, {});
  ok(msgs(r).some((m) => m.startsWith('err:슬로건에 이벤트·할인')), msgs(r).join(' / '));
  eq(DEFAULT_SETTINGS.rules.copy.caution, '');
});
const PL_HTML = `<div class="nad_area" id="power_link_body"><ul class="lst_type">
<li class="lst js-hover-item type_img ext_desc" num=""><div class="inner"><div class="url_area"><span class="site">테스트화재</span><a class="lnk_url">direct.test.com</a></div><a class="lnk_head"><span class="lnk_tit">테스트화재 다이렉트 <strong class='hl'>운전자보험</strong></span> <span class="lnk_tit">월 9,000원부터</span></a><div class="desc_area"><a class="link_desc">형사합의금 &amp; 변호사비 <strong class='hl'>보장</strong></a></div><a class="link_ext_desc ext_sale"><span class="prefix_ext">할인</span><span class="title_ext">자동차 고객 5% 할인</span></a><ul class="lst_link"><li class="item"><a class="link">보험료계산</a></li><li class="item"><a class="link">가입하기</a></li></ul></div></li>
<li class="lst js-hover-item type_subtitle" num=""><div class="inner"><span class="site">다른보험</span><a class="lnk_url">other.com</a><a class="lnk_head"><span class="lnk_tit">다른보험 공식</span></a><div class="desc_area"><a class="link_desc">설명 문구</a></div></div></li>
</ul></div><section class="next"></section>`;
await test('경쟁 광고 읽기: 사이트 이름 · 제목 여러 개 · 설명 · 홍보문구(말머리) · 서브링크', () => {
  const ads = CORE.parsePowerlinks(PL_HTML);
  eq(ads.length, 2);
  eq(ads[0].site, '테스트화재'); eq(ads[0].url, 'direct.test.com');
  eq(ads[0].titles, ['테스트화재 다이렉트 운전자보험', '월 9,000원부터']);
  eq(ads[0].desc, '형사합의금 & 변호사비 보장');
  eq(ads[0].promo, { prefix: '할인', text: '자동차 고객 5% 할인' });
  eq(ads[0].sublinks, ['보험료계산', '가입하기']);
  eq(ads[1].promo, null);
  eq(CORE.parsePowerlinks('<html>광고 없음</html>'), []);
});
await test('AI 요청문: 규격·규칙·경쟁 광고·제외 카피가 들어가고, 다시 쓰기는 id 유지', () => {
  const q = CORE.copyGenerateRequest({ format: 'bs_mo_basic', angles: ['질문형', '가격·혜택'], perAngle: 2, competitors: CORE.parsePowerlinks(PL_HTML), rejected: ['뺀 카피'], caution: ['무료'], brand: { name: '테스트화재', facts: '상품권 3만원' } });
  eq(q.total, 4); eq(q.countKey, 'desc2');
  for (const s of ['메인타이틀', '1~14자', '테스트화재 다이렉트 운전자보험', '뺀 카피', '사용자 주의어): 무료', '상품권 3만원', '질문형']) ok(q.prompt.includes(s), '빠짐: ' + s);
  const r = CORE.copyGenerateRequest({ format: 'pl_ad', rewrite: { instruction: '더 짧게', items: [{ id: 'x1', angle: '질문형', fields: { title: 'a', desc: 'b' } }] } });
  ok(r.prompt.includes('id=x1') && r.prompt.includes('더 짧게') && r.schema.items.required.includes('id'), r.prompt.slice(-300));
  eq(CORE.cleanCopyItems([{ angle: '질문형', title: ' 제목  하나 ', desc: '설명', extra: 1 }, { angle: 'x' }], 'pl_ad'), [{ id: undefined, angle: '질문형', why: '', f: { title: '제목 하나', desc: '설명' } }]);
});// ---------------------------------------------------------------- 3-2. 구글 모드 (무료 방식): 키워드 플래너 CSV · 트렌드 · 유튜브
const GC = await import(pathToFileURL(path.join(TMP, 'google-core.mjs')).href);
const KP_KO = '키워드 통계 2026-11-13 at 12_00_00\n2025년 11월 1일 - 2026년 10월 31일\n키워드\t통화\t월간 평균 검색량\t3개월 동안의 변화\t전년 대비 변화\t경쟁\t경쟁 색인\t페이지 상단 입찰가(낮은 범위)\t페이지 상단 입찰가(높은 범위)\t검색: 2025년 11월\t검색: 2025년 12월\n운전자보험\tKRW\t1만~10만\t0%\t0%\t높음\t100\t1,234\t5,678\t1만~10만\t1만~10만\n운전자보험 비교\tKRW\t1천~1만\t0%\t+900%\t중간\t56\t800\t2,500\t1천~1만\t1천~1만\n';
const KP_EN = 'Keyword Stats 2026-11-13 at 12_00_00\nNov 1, 2025 - Oct 31, 2026\nKeyword\tCurrency\tAvg. monthly searches\tThree month change\tYoY change\tCompetition\tCompetition (indexed value)\tTop of page bid (low range)\tTop of page bid (high range)\tSearches: Nov 2025\tSearches: Dec 2025\ncar insurance\tUSD\t100K – 1M\t0%\t0%\tHigh\t100\t12.5\t45.1\t110000\t90500\n';
await test('키워드 플래너 CSV: 한국어 화면 파일 (범위 검색량 · 입찰가 · 월별 · 경쟁)', () => {
  const p = GC.parsePlannerCsv(KP_KO);
  eq(p.rows.length, 2); eq(p.ranged, 2); eq(p.months, ['2025-11', '2025-12']);
  const r = p.rows[0];
  eq([r.keyword, r.avg, r.comp, r.compIdx, r.bidLow, r.bidHigh, r.currency], ['운전자보험', { lo: 10000, hi: 100000 }, '높음', 100, 1234, 5678, 'KRW']);
  eq(r.months[0], { ym: '2025-11', v: { lo: 10000, hi: 100000 } });
});
await test('키워드 플래너 CSV: 영어 화면 파일 (100K – 1M, 정확한 월별 값)', () => {
  const r = GC.parsePlannerCsv(KP_EN).rows[0];
  eq([r.avg, r.comp, r.bidLow, r.months[1]], [{ lo: 100000, hi: 1000000 }, '높음', 12.5, { ym: '2025-12', v: { lo: 90500, hi: 90500 } }]);
  let bad = ''; try { GC.parsePlannerCsv('그냥,파일\n1,2'); } catch (e) { bad = e.message; }
  ok(/키워드 플래너 파일이 아닌/.test(bad), bad);
});
await test('구글 트렌드: 응답 · 내보내기 CSV(추이 · 관련 검색어 · 지역) 읽기', () => {
  eq(GC.parseTrendsTimeline({ default: { timelineData: [{ time: '1762646400', formattedAxisTime: '2025. 11. 9.', value: [51] }] } }), [{ t: 1762646400000, label: '2025. 11. 9.', v: 51, partial: false }]);
  eq(GC.parseTrendsRelated({ default: { rankedList: [{ rankedKeyword: [{ query: '보람상조', formattedValue: '100' }] }, { rankedKeyword: [{ query: '상조 폐업', formattedValue: '급등' }] }] } }), { top: [{ query: '보람상조', value: '100' }], rising: [{ query: '상조 폐업', value: '급등' }] });
  const a = GC.parseTrendsCsv('카테고리: 모든 카테고리\n\n주,상조회사: (대한민국)\n2025-11-09,51\n2025-11-16,<1\n');
  eq([a.keyword, a.timeline.map((x) => x.v)], ['상조회사', [51, 1]]);
  const b = GC.parseTrendsCsv('카테고리: 모든 카테고리\n\n인기\n보람상조,100\n상조회사 순위,45\n\n급상승\n상조회사 폐업,급등\n');
  eq([b.related.top.length, b.related.rising[0].query], [2, '상조회사 폐업']);
  eq(GC.parseTrendsCsv('지역,상조회사: (2025. 11. 13. - 2026. 11. 13.)\n서울특별시,100\n제주특별자치도,0\n').regions, [{ name: '서울특별시', v: 100 }]);
});
await test('구글 트렌드 받기: 쿠키 → 429면 다시 시도 → 추이·지역 성공, 관련 검색어만 막히면 그 부분만 오류', async () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-g-'));
  const seen = [];
  let exploreCalls = 0;
  const fake = async (u, o = {}) => {
    seen.push([String(u), o.headers?.Cookie || '']);
    if (String(u).includes('/trends/?')) return new Response('', { headers: { 'set-cookie': 'NID=abc; path=/' } });
    if (u.includes('/explore')) { if (++exploreCalls === 1) return new Response('busy', { status: 429 }); return new Response(")]}'\n" + JSON.stringify({ widgets: [{ id: 'TIMESERIES', token: 't1', request: {} }, { id: 'RELATED_QUERIES', token: 't2', request: {} }, { id: 'GEO_MAP', token: 't3', request: {} }] })); }
    if (u.includes('/multiline')) return new Response(")]}',\n" + JSON.stringify({ default: { timelineData: [{ time: '1', value: [10] }, { time: '2', value: [100] }] } }));
    if (u.includes('/relatedsearches')) return new Response('busy', { status: 429 });
    if (u.includes('/comparedgeo')) return new Response(")]}',\n" + JSON.stringify({ default: { geoMapData: [{ geoName: '서울특별시', value: [100], hasData: [true] }] } }));
    throw new Error('예상 못 한 주소 ' + u);
  };
  const G = GC.createGoogle({ dataDir: D, cached: (k, t, fn) => fn(), getConfig: () => ({}), fetchFn: fake, wait: async () => {} });
  const r = await G.trends('상조회사');
  eq([r.timeline.map((x) => x.v), r.regions[0].name], [[10, 100], '서울특별시']);
  ok(r.errors.length === 1 && /관련 검색어/.test(r.errors[0]) && /429/.test(r.errors[0]), JSON.stringify(r.errors));
  ok(exploreCalls === 2 && seen.some(([u, c]) => u.includes('/explore') && c.includes('NID=abc')), '쿠키를 붙여 다시 시도');
  // CSV를 넣으면 막힌 관련 검색어를 채움
  G.importTrendsCsv('상조회사', '인기\n보람상조,100\n');
  const r2 = await G.trends('상조회사');
  eq([r2.related.top[0].query, r2.relatedFrom], ['보람상조', 'csv']);
  fs.rmSync(D, { recursive: true, force: true });
});
await test('유튜브: 키가 없으면 미표시, 있으면 상위 영상 조회수', async () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-g-'));
  const none = GC.createGoogle({ dataDir: D, cached: (k, t, fn) => fn(), getConfig: () => ({}) });
  eq(await none.youtube('상조'), { missing: true });
  const fake = async (u) => u.includes('/search?')
    ? new Response(JSON.stringify({ pageInfo: { totalResults: 12345 }, items: [{ id: { videoId: 'v1' }, snippet: { title: '상조 비교', channelTitle: '채널', publishedAt: '2026-10-01T00:00:00Z' } }] }))
    : new Response(JSON.stringify({ items: [{ id: 'v1', statistics: { viewCount: '9876' }, contentDetails: { duration: 'PT5M' } }] }));
  const G = GC.createGoogle({ dataDir: D, cached: (k, t, fn) => fn(), getConfig: () => ({ youtubeKey: 'k' }), fetchFn: fake });
  const r = await G.youtube('상조');
  eq([r.total, r.videos[0].views, r.videos[0].title], [12345, 9876, '상조 비교']);
  fs.rmSync(D, { recursive: true, force: true });
});// ---------------------------------------------------------------- 4. 서버 (가짜 인터넷 응답)
const realFetch = globalThis.fetch;
// 가짜 Gemini: 요청문에 '[다시 쓰기]'가 있으면 id를 돌려주고, '판정 기준'이면 판정을 돌려줌
const GEMINI_SSE = (o) => {
  const body = JSON.parse(o.body || '{}');
  const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
  let items;
  if (prompt.includes('[판정 기준]')) items = [{ id: 'k1', pass: true, reason: '규격과 근거 모두 맞음', risks: [] }];
  else if (prompt.includes('[다시 쓰기]')) items = [{ id: 'k1', angle: '질문형', title: '테스트 짧게', desc: '다시 쓴 설명 문구는 스무 자를 넘겨야 해요', why: '짧게' }];
  else items = [{ angle: '질문형', title: '테스트화재 운전자보험?', desc: '형사합의금 걱정이라면 보장 내용을 1분 만에 확인해 보세요', why: '궁금증' }, { angle: '질문형', title: '', desc: '' }];
  return 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] }, finishReason: 'STOP' }] }) + '\n\n';
};
const PORT = 18000 + Math.floor(Math.random() * 2000);
globalThis.fetch = async (u, o = {}) => {
  const s = String(u);
  if (s.startsWith('http://127.0.0.1:' + PORT)) return realFetch(u, o);
  if (s.includes('ac.search.naver.com')) return new Response(JSON.stringify({ items: [[['운전자보험비교', '0'], ['운전자 보험', '0'], ['운전자보험이란', '0']]] }));
  if (s.includes('suggestqueries.google.com')) return new Response(JSON.stringify(['q', ['운전자보험 가격', '운전자보험비교']]));
  if (s.includes('search.naver.com/search.naver') && s.includes('pltest')) return new Response(PL_HTML);
  if (s.includes('generativelanguage.googleapis.com')) return new Response(GEMINI_SSE(o));
  if (s.includes('search.naver.com/search.naver')) return new Response('<html>"apiURL":"https://s.search.naver.com/p/qra/1/search.naver?query=x\\u0026a=1"</html>');
  if (s.includes('s.search.naver.com/p/qra')) return new Response(JSON.stringify({ result: { contents: [{ query: '운전자보험 필요성', badge: { text: '많이 찾는' } }] } }));
  throw new Error('테스트 중 바깥 인터넷 요청 차단: ' + s);
};
process.env.PORT = String(PORT);
const log = console.log; console.log = () => {}; // 서버 시작 문구 숨김
await import(pathToFileURL(path.join(TMP, 'server.mjs')).href);
await new Promise((r) => setTimeout(r, 300));
console.log = log;
const B = 'http://127.0.0.1:' + PORT;
const get = (p) => realFetch(B + p);
const post = (p, body, h = {}) => realFetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const raw = (p, headers) => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: PORT, path: p, headers }, (rs) => { rs.resume(); res(rs.statusCode); }); rq.on('error', () => res(0)); rq.end(); });

await test('서버: 화면(index.html) 열림', async () => eq((await get('/')).status, 200));
await test('서버: 버전 확인 (/api/version)', async () => { const v = await (await get('/api/version')).json(); ok(v.boot && v.now && v.stale === false, JSON.stringify(v)); });
await test('보안: 다른 사이트에서 온 설정 변경 차단', async () => eq((await post('/api/config', { cliPaths: { agy: 'C:/evil.exe' } }, { Origin: 'https://evil.example' })).status, 403));
await test('보안: 다른 사이트 폼(text/plain) 요청 차단', async () => eq((await realFetch(B + '/api/settings', { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' }, body: '{}' })).status, 403));
await test('보안: cross-site 표시된 요청 차단', async () => eq((await post('/api/github', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403));
await test('보안: 다른 도메인 이름(Host)으로 들어온 요청 차단', async () => eq(await raw('/api/config', { Host: 'evil.example:' + PORT }), 403));
await test('보안: 분석기 화면(localhost)에서 온 요청은 허용', async () => eq((await post('/api/settings', { settings: {} }, { Origin: 'http://localhost:' + PORT })).status, 200));
await test('보안: 폴더 밖 파일 읽기 차단 (../config.json)', async () => { const st = await raw('/..%2fconfig.json'); ok(st === 404 || st === 400, '상태 ' + st); });
await test('서버: 25MB 넘는 요청은 413', async () => eq((await post('/api/settings', '{"a":"' + 'x'.repeat(26 * 1024 * 1024) + '"}')).status, 413));
await test('서버: JSON이 아닌 요청은 400', async () => eq((await post('/api/settings', '{bad')).status, 400));
await test('서버: start.bat 루프 없이 다시 시작 요청하면 안내만', async () => { const j = await (await post('/api/restart', {})).json(); eq(j.ok, false); });
await test('자동완성: 네이버 관련·자동완성·구글을 합치고 띄어쓰기만 다른 것·원래 키워드는 하나로', async () => {
  const j = await (await get('/api/suggest?keyword=' + encodeURIComponent('운전자보험'))).json();
  eq(j.related.map((x) => x.keyword), ['운전자보험 필요성']);
  const all = j.all.map((x) => x.keyword);
  eq(all, ['운전자보험 필요성', '운전자보험비교', '운전자보험이란', '운전자보험 가격']);
  eq(j.all.find((x) => x.keyword === '운전자보험비교').src, ['네이버 자동완성', '구글 자동완성']);
});
await test('설정 저장·읽기 (임시 폴더 안에서만)', async () => {
  const s = (await (await get('/api/settings')).json()).settings;
  s.ui.zoom = 110;
  eq((await post('/api/settings', { settings: s })).status, 200);
  eq((await (await get('/api/settings')).json()).settings.ui.zoom, 110);
  ok(fs.existsSync(path.join(TMP, 'data', 'settings.json')), '임시 폴더에 저장');
});

await test('경쟁 광고: /api/copy/competitors 가 검색 결과의 파워링크를 돌려줌', async () => {
  const j = await (await get('/api/copy/competitors?keyword=pltest')).json();
  eq(j.ads.map((a) => a.site), ['테스트화재', '다른보험']);
});
await test('카피 탭 저장소: 저장·목록·불러오기·이름만 바꾸기·삭제 (임시 폴더 안에서만)', async () => {
  const H = { Origin: 'http://localhost:' + PORT };
  eq((await post('/api/copy-projects', { doc: { id: 'ct1', name: '테스트', form: { format: 'pl_ad' }, items: [{ id: 'i1', status: 'pick' }, { id: 'i2', status: 'cand' }] } }, H)).status, 200);
  const list = (await (await get('/api/copy-projects')).json()).list;
  eq([list[0].id, list[0].count, list[0].picked, list[0].format], ['ct1', 2, 1, 'pl_ad']);
  eq((await (await get('/api/copy-projects?id=ct1')).json()).doc.items.length, 2);
  const m = (await (await post('/api/copy-projects', { doc: { id: 'ct1', name: '새 이름', pinned: true }, metaOnly: true }, H)).json()).meta;
  eq([m.name, m.pinned, m.count], ['새 이름', true, 2]);
  eq((await get('/api/copy-projects?id=..%2Fconfig')).status, 400);
  eq((await post('/api/copy-projects', { delete: 'ct1' }, H)).status, 200);
  eq((await get('/api/copy-projects?id=ct1')).status, 404);
  ok(fs.existsSync(path.join(TMP, 'data', 'copy-projects')), '임시 폴더에 저장');
});
await test('광고 목업 저장소: 저장 · 다른 사이트에서 온 저장은 차단', async () => {
  const j = await (await post('/api/ad-mock', { doc: { id: 'mt1', name: 'PL', type: 'pl', groups: [{ id: 'g1' }, { id: 'g2' }] } }, { Origin: 'http://localhost:' + PORT })).json();
  eq([j.meta.type, j.meta.groups], ['pl', 2]);
  eq((await post('/api/ad-mock', { doc: { id: 'mt1' } }, { Origin: 'https://evil.example' })).status, 403);
});
const sse = async (p, body) => { const t = await (await post(p, body, { Origin: 'http://localhost:' + PORT })).text(); return t.split('\n\n').filter(Boolean).map((x) => JSON.parse(x.slice(5))); };
await test('카피 생성 스트림: 가짜 Gemini 응답 → 형식 필드만 정리, 빈 항목은 뺌, 진행률 표시', async () => {
  eq((await post('/api/config', { geminiKey: 'test-key' }, { Origin: 'http://localhost:' + PORT })).status, 200);
  const ev = await sse('/api/copy/generate-stream', { format: 'pl_ad', angles: ['질문형'], perAngle: 2, brand: { name: '테스트화재' } });
  const done = ev.at(-1);
  eq(done.type, 'done', JSON.stringify(done).slice(0, 200));
  eq(done.items.map((x) => x.f.title), ['테스트화재 운전자보험?']);
  ok(ev.some((e) => e.type === 'progress' && e.count >= 1), '진행률 이벤트');
});
await test('카피 다시 쓰기 · AI 재검증 스트림', async () => {
  const r = (await sse('/api/copy/generate-stream', { format: 'pl_ad', rewrite: { instruction: '더 짧게', items: [{ id: 'k1', angle: '질문형', fields: { title: '긴 제목', desc: '설명' } }] } })).at(-1);
  eq([r.items[0].id, r.items[0].f.title], ['k1', '테스트 짧게']);
  const v = (await sse('/api/copy/verify-stream', { format: 'pl_ad', items: [{ id: 'k1', fields: { title: 'a', desc: 'b' } }] })).at(-1);
  eq(v.results, [{ id: 'k1', pass: true, reason: '규격과 근거 모두 맞음', risks: [] }]);
});
await test('구글 모드 서버: 플래너 CSV 가져오기 · 키워드 찾기(포함된 키워드) · 자동완성(구글+유튜브) · 유튜브 미표시', async () => {
  const H = { Origin: 'http://localhost:' + PORT };
  const j = await (await post('/api/google/planner', { text: KP_KO, name: 'kp.csv' }, H)).json();
  eq([j.count, j.added, j.ranged, j.total], [2, 2, 2, 2]);
  const l = await (await get('/api/google/planner?keyword=' + encodeURIComponent('운전자보험'))).json();
  eq([l.hit.avg, l.related.map((r) => r.keyword), l.files[0].name], [{ lo: 10000, hi: 100000 }, ['운전자보험 비교'], 'kp.csv']);
  ok(fs.existsSync(path.join(TMP, 'data', 'google', 'planner.json')), '임시 폴더에 저장');
  const s = await (await get('/api/google/suggest?keyword=' + encodeURIComponent('운전자보험'))).json();
  eq(s.all, [{ keyword: '운전자보험 가격', src: ['구글', '유튜브'] }, { keyword: '운전자보험비교', src: ['구글', '유튜브'] }]);
  eq(await (await get('/api/google/youtube?keyword=x')).json(), { missing: true });
  eq((await get('/api/google/suggest')).status, 400);
  eq((await post('/api/google/planner', { clear: true }, { Origin: 'https://evil.example' })).status, 403);
});
// ---------------------------------------------------------------- 결과
console.log('\n키워드 분석기 자동 테스트\n' + results.join('\n'));
console.log(`\n통과 ${pass} · 실패 ${fail}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
