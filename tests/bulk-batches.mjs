import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../public/bulk.js', import.meta.url), 'utf8');
const nodes = new Map();
const $ = id => {
  if (!nodes.has(id)) nodes.set(id, { style: {}, classList: { toggle(){}, add(){}, remove(){} }, textContent: '' });
  return nodes.get(id);
};
const calls = [];
let saved, interrupt = false, failSave = false;
async function fetch(url, opts) {
  if (!opts && url.startsWith('/api/bulk-history?id=')) return Response.json({ session: saved });
  const body = JSON.parse(opts.body);
  if (url === '/api/bulk-history') {
    if (failSave && body.session.info.total) { failSave = false; return Response.json({ error: 'disk' }); }
    saved = body.session;
    return Response.json({ ok: true, meta: { id: saved.id } });
  }
  assert.equal(url, '/api/bulk-stream');
  calls.push(body.keywords);
  if (interrupt && body.keywords[0] === 'kw1000') {
    $('#bStop').onclick();
    throw new DOMException('stopped', 'AbortError');
  }
  const events = [{ type: 'start', steps: ['검색량'] }, { type: 'rows', rows: body.keywords.map(keyword => ({ keyword, total: 20 })) }, { type: 'done', total: body.keywords.length }];
  return new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
}
function boot() {
  const ctx = { window: { addEventListener() {} }, localStorage: { getItem: () => null }, fetch, $, RULES: () => ({}), esc: String, setInterval, clearInterval, clearTimeout, AbortController, DOMException, TextDecoder, scrollTo() {} };
  const fixture = src.replace(/  mount\(\);\r?\n\}\)\(\);/, '  drawResult = drawSide = fillVC = () => {};\n})();');
  assert.notEqual(fixture, src);
  vm.runInNewContext(fixture, ctx);
  return ctx.window.__BULK;
}
const paste = Array.from({ length: 2500 }, (_, i) => 'kw' + i).join('\n');
let app = boot(); app.B.paste = paste;
await app.start();
assert.deepEqual(calls.map(a => a.length), [1000, 1000, 500]);
assert.equal(new Set(calls.flat()).size, 2500);
assert.equal(saved.rows.length, 2500);
assert.equal(saved.info.total, 2500);

calls.length = 0; interrupt = true;
app = boot(); app.B.paste = paste;
await app.start();
assert.equal(saved.info.resume.next, 1000);
assert.equal(saved.rows.length, 2500);
const id = saved.id;
interrupt = false; calls.length = 0;
app = boot(); await app.openSession(id);
assert.match($('#bResume').textContent, /1,500/);
await app.start(true);
assert.deepEqual(calls.map(a => a.length), [1000, 500]);
assert.equal(calls[0][0], 'kw1000');
assert.equal(saved.info.total, 2500);

failSave = true; calls.length = 0;
app = boot(); app.B.paste = '단일'; await app.start();
assert.equal(saved.info.resume.next, 0);
await app.start(true);
assert.equal(saved.info.total, 1);
console.log('대량 분석 회차 테스트 통과: 자동 분할, 중지 후 재열기·재개, 저장 실패 후 재개');
