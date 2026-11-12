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
// ---------------------------------------------------------------- 4. 서버 (가짜 인터넷 응답)
const realFetch = globalThis.fetch;
const PORT = 18000 + Math.floor(Math.random() * 2000);
globalThis.fetch = async (u, o = {}) => {
  const s = String(u);
  if (s.startsWith('http://127.0.0.1:' + PORT)) return realFetch(u, o);
  if (s.includes('ac.search.naver.com')) return new Response(JSON.stringify({ items: [[['운전자보험비교', '0'], ['운전자 보험', '0'], ['운전자보험이란', '0']]] }));
  if (s.includes('suggestqueries.google.com')) return new Response(JSON.stringify(['q', ['운전자보험 가격', '운전자보험비교']]));
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

// ---------------------------------------------------------------- 결과
console.log('\n키워드 분석기 자동 테스트\n' + results.join('\n'));
console.log(`\n통과 ${pass} · 실패 ${fail}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
