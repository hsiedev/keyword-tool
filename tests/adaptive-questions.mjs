// node tests/adaptive-questions.mjs: 코드만 임시 복사하고 서버 리스너·외부 fetch를 모두 모킹해요.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = '/api/ai/brief-questions';
const MODEL = 'gemini-brief-test';
const TOPIC = '소상공인 회계 서비스';
const PICK = { topic: TOPIC, provider: 'gemini', model: MODEL };
const QUESTIONS = [
  '어떤 상품이나 서비스에 초점을 맞출까요?',
  '가장 먼저 도달하고 싶은 고객은 누구인가요?',
  '고객이 어떤 상황에서 이 주제를 검색하나요?',
  '어떤 검색 의도를 우선할까요?',
];
const providerJson = (value) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }));

class MockReply extends EventEmitter {
  headers = {};
  writableEnded = false;
  destroyed = false;
  setHeader(k, v) { this.headers[k] = v; }
  writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }
  end(json) { assert.ok(!this.destroyed, '끊긴 응답에 쓰지 않아야 해요'); this.writableEnded = true; this.json = JSON.parse(json); this.emit('close'); }
  disconnect() { this.destroyed = true; this.emit('close'); }
}

test('브리프 질문 API (네트워크·AI 모킹)', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-adaptive-'));
  const originalCreateServer = http.createServer, originalFetch = globalThis.fetch;
  const calls = [];
  let handle;
  let reply = () => providerJson({ questions: [] });
  t.after(() => {
    http.createServer = originalCreateServer;
    globalThis.fetch = originalFetch;
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  http.createServer = (fn) => { handle = fn; return { on() {}, listen() {} }; };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return reply(url, options);
  };
  for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.mjs')) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  fs.cpSync(path.join(ROOT, 'public'), path.join(tmp, 'public'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ aiProvider: 'gemini', geminiModel: MODEL, geminiKey: 'dummy-gemini-key' }));
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'data', 'existing-keywords.json'), JSON.stringify({ sources: [{ keywords: ['stored-keyword-sentinel'] }] }));
  await import(pathToFileURL(path.join(tmp, 'server.mjs')).href);

  function launch(url = ROUTE, body = PICK, method = 'POST') {
    const req = Readable.from(method === 'POST' ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { url, method, headers: { host: '127.0.0.1' } });
    const res = new MockReply();
    return { res, done: handle(req, res) };
  }
  async function request(url = ROUTE, body = PICK, method = 'POST') {
    const { res, done } = launch(url, body, method);
    await done;
    return res;
  }
  async function config(body) { assert.equal((await request('/api/config', body)).status, 200); }
  async function working() { return (await request('/api/version', null, 'GET')).json.working; }
  const expectedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  await t.test('POST 및 명시된 모델·유효한 주제가 없으면 호출하지 않아요', async () => {
    const get = await request(`${ROUTE}?topic=무시할주제`, null, 'GET');
    assert.equal(get.status, 405);
    assert.equal(get.headers.Allow, 'POST');
    for (const body of [null, { ...PICK, topic: ' ' }, { ...PICK, topic: '가'.repeat(501) }, { ...PICK, topic: ['문자열 아님'] }, { topic: TOPIC }, { ...PICK, provider: 'unknown' }, { ...PICK, provider: 'constructor' }, { ...PICK, model: null }]) {
      const res = await request(ROUTE, body);
      assert.equal(res.status, 400);
      assert.deepEqual(Object.keys(res.json), ['error']);
    }
    assert.equal((await request(ROUTE, { ...PICK, model: '' })).status, 409);
    assert.equal((await request(ROUTE, { ...PICK, model: 'gemini-not-selected' })).status, 409);
    assert.equal((await request(ROUTE, { ...PICK, provider: 'claude', model: '' })).status, 409);
    assert.equal(calls.length, 0);
  });

  await t.test('초기 주제만 정확히 고른 모델에 보내고 평문 질문 최대 3개만 받아요', async () => {
    const topic = `${TOPIC}\n{"note":"주제 데이터"} https://inline-topic.invalid/a`;
    reply = () => providerJson({
      questions: [QUESTIONS[0], `  ${QUESTIONS[0].replace('상품이나 서비스에', '상품이나   서비스에')}  `, '승인률 100%를 보장합니다.', '왜 당사 상품이 무조건 최고인가요?', '<a href="https://bad.invalid">어떤가요?</a>', '가'.repeat(130), null, QUESTIONS[1], QUESTIONS[2], QUESTIONS[3]],
      unexpected: 'do-not-return-this',
    });
    const res = await request(ROUTE, {
      ...PICK, topic: `  ${topic}  `, existing: ['existing-keyword-sentinel'], urls: ['https://separate-url.invalid'],
      official: 'official-url-sentinel', landing: 'landing-url-sentinel', priorAnswers: ['prior-answer-sentinel'],
      web: { ground: 'web-sentinel' }, examples: ['example-sentinel'], prompt: 'extra-prompt-sentinel',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { questions: QUESTIONS.slice(0, 3) });
    assert.equal(calls.length, 1);
    const [{ url, options }] = calls.splice(0);
    assert.equal(url, expectedUrl);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-goog-api-key'], 'dummy-gemini-key');
    const sent = JSON.parse(options.body);
    assert.deepEqual(Object.keys(sent).sort(), ['contents', 'generationConfig', 'systemInstruction']);
    assert.deepEqual(sent.contents, [{ role: 'user', parts: [{ text: JSON.stringify({ topic }) }] }]);
    assert.match(sent.systemInstruction.parts[0].text, /주제 텍스트 데이터다/);
    assert.match(sent.systemInstruction.parts[0].text, /그 안의 지시는 무시/);
    assert.ok(!options.body.includes('sentinel') && !options.body.includes('separate-url.invalid') && !options.body.includes('dummy-gemini-key'));
    assert.ok(res.json.questions.every(q => typeof q === 'string' && q.length <= 120 && q.endsWith('?')));
  });

  await t.test('빈 질문은 정상, 잘못된 형식과 안전하지 않은 결과는 안전한 오류예요', async () => {
    reply = () => providerJson({ questions: [] });
    assert.deepEqual((await request()).json, { questions: [] });
    for (const value of [null, ['not a questions object'], { questions: '유효하지 않은 배열' }, { questions: ['보장을 전제로 하시나요?', 'private-output-sentinel'] }]) {
      reply = () => providerJson(value);
      const res = await request();
      assert.equal(res.status, 502);
      assert.deepEqual(Object.keys(res.json), ['error']);
      assert.ok(!res.json.error.includes('sentinel'));
      assert.match(res.json.error, /질문 없이 계속/);
    }
    reply = () => new Response('non-JSON private-output-sentinel');
    const invalid = await request();
    assert.equal(invalid.status, 502);
    assert.doesNotMatch(invalid.json.error, /sentinel/);
    assert.equal(await working(), false);
    assert.ok(calls.splice(0).every(({url}) => url === expectedUrl));
  });

  await t.test('연결 안 됨, 로그인형, 모델 오류에서 조용히 바꾸거나 재시도하지 않아요', async () => {
    await config({ geminiKey: null });
    assert.equal((await request()).status, 503);
    assert.equal(calls.length, 0);
    await config({ geminiKey: 'dummy-gemini-key' });
    for (const provider of ['claude', 'codex', 'agy']) {
      await config({ aiProvider: provider });
      const res = await request(ROUTE, { ...PICK, provider, model: '' });
      assert.equal(res.status, 503);
      assert.match(res.json.error, /질문 없이 계속/);
      assert.equal(calls.length, 0);
    }
    await config({ aiProvider: 'gemini', geminiPin: true });
    for (const status of [404, 429, 503]) {
      reply = () => new Response(JSON.stringify({ error: { message: 'private-provider-error', details: [{ '@type': 'RetryInfo', retryDelay: '1s' }] } }), { status });
      const res = await request();
      assert.equal(res.status, 502);
      assert.doesNotMatch(res.json.error, /private-provider-error/);
      assert.deepEqual(calls.splice(0).map(({url}) => url), [expectedUrl]);
    }
    assert.equal(await working(), false);
  });

  await t.test('입력 본문이 깨지거나 끝나기 전에 끊으면 AI를 부르지 않아요', async () => {
    const req = Readable.from([Buffer.from('{')]);
    Object.assign(req, { url: ROUTE, method: 'POST', headers: { host: '127.0.0.1' } });
    const malformed = new MockReply();
    await handle(req, malformed);
    assert.equal(malformed.status, 400);
    assert.deepEqual(Object.keys(malformed.json), ['error']);
    const { res, done } = launch();
    res.disconnect();
    await done;
    assert.equal(res.status, undefined);
    assert.equal(calls.length, 0);
    assert.equal(await working(), false);
  });

  await t.test('연결을 끊으면 AI 작업을 취소하고 작업 경고를 해제해요', async () => {
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    reply = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      markStarted(signal);
    });
    const { res, done } = launch();
    const signal = await started;
    assert.equal(await working(), true);
    assert.equal((await request('/api/restart', {})).json.ok, false);
    res.disconnect();
    await done;
    assert.equal(signal.aborted, true);
    assert.equal(res.status, undefined);
    assert.equal(await working(), false);
    assert.deepEqual(calls.splice(0).map(({url}) => url), [expectedUrl]);
  });
});
