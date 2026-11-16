// 로그인형 AI: 각 회사의 공식 CLI를 이 PC에서 실행해 구독 계정(로그인)으로 AI를 씀 (API 요금 없음, 구독 사용 한도 적용)
//  - Gemini : Antigravity CLI (agy)  - 개인 구글 계정 로그인 (무료 등급 / Google AI Pro·Ultra)
//  - Claude : Claude Code (claude)   - Claude Pro·Max 등 구독 로그인
//  - GPT    : Codex CLI (codex)      - ChatGPT Plus·Pro 등 계정 로그인
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const WIN = process.platform === 'win32';
export const CLI = {
  agy: { name: 'Gemini (구글 로그인)', bin: 'agy', tool: 'Antigravity CLI', loginCmd: (p) => q(p), statusArgs: null,
    install: WIN ? { shell: 'powershell', cmd: 'irm https://antigravity.google/cli/install.ps1 | iex' } : { shell: 'sh', cmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' },
    loginHelp: '처음 실행이면 색 테마 등은 Enter로 넘기고, 폴더 신뢰(trust)는 Yes. 로그인 방법은 Google OAuth를 고르고 브라우저에서 구글 계정으로 로그인하세요. 입력창이 보이면 /exit 로 닫으면 돼요.' },
  claude: { name: 'Claude (로그인)', bin: 'claude', tool: 'Claude Code', loginCmd: (p) => `${q(p)} auth login`, statusArgs: ['auth', 'status'],
    install: WIN ? { shell: 'powershell', cmd: 'irm https://claude.ai/install.ps1 | iex' } : { shell: 'sh', cmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
    loginHelp: '브라우저가 열리면 Claude 구독 계정(Pro·Max)으로 로그인하세요. "Anthropic Console(API)"이 아니라 구독 계정을 고르세요.' },
  codex: { name: 'GPT (ChatGPT 로그인)', bin: 'codex', tool: 'Codex CLI', loginCmd: (p) => `${q(p)} login`, statusArgs: ['login', 'status'],
    install: { shell: 'npm', cmd: 'install -g @openai/codex' },
    loginHelp: '브라우저가 열리면 "Sign in with ChatGPT"로 ChatGPT 계정(Plus·Pro 등)에 로그인하세요. API 키 로그인은 고르지 마세요(요금 발생).' },
};
// 모델 제안 (비워두면 각 CLI의 기본 모델)
export const CLI_MODELS = { agy: [], claude: ['sonnet', 'opus', 'haiku'], codex: [] };

const q = (s) => `"${String(s).replace(/"/g, '')}"`;
const NODE_DIR = path.dirname(process.execPath);
const HOME = os.homedir();
const WORK = path.join(os.tmpdir(), 'keyword-tool-ai'); // 빈 작업 폴더 (CLI가 다른 파일을 건드리지 않게)

// ---------------------------------------------------------------- 실행 파일 찾기
const found = new Map(); // name → { path, at }
let regPath = { at: 0, value: '' };
function freshPath() {
  if (!WIN) return process.env.PATH || '';
  if (Date.now() - regPath.at < 15000) return regPath.value;
  const read = (key) => { try { const out = execFileSync('reg.exe', ['query', key, '/v', 'Path'], { encoding: 'utf8', timeout: 4000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); const m = /Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i.exec(out); return m ? m[1].trim() : ''; } catch { return ''; } };
  const expand = (s) => s.replace(/%([^%]+)%/g, (x, k) => process.env[k] ?? x);
  const parts = [process.env.PATH || '', expand(read('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')), expand(read('HKCU\\Environment'))].join(';').split(';').map((s) => s.trim()).filter(Boolean);
  regPath = { at: Date.now(), value: [...new Set(parts)].join(';') };
  return regPath.value;
}
function candidates(name) {
  const L = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
  const A = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
  if (!WIN) return [path.join(HOME, '.local', 'bin', name), path.join(NODE_DIR, name), `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`, path.join(HOME, '.claude', 'local', name)];
  const PF = process.env.ProgramFiles || 'C:\\Program Files';
  const fnmDirs = [];
  for (const base of [path.join(A, 'fnm', 'node-versions'), path.join(L, 'fnm', 'node-versions')]) {
    try { for (const v of fs.readdirSync(base)) fnmDirs.push(path.join(base, v, 'installation')); } catch {}
  }
  return [
    // Antigravity CLI 공식 Windows 위치: %LOCALAPPDATA%\agy\bin
    path.join(L, 'agy', 'bin', name + '.exe'),
    path.join(PF, 'Google', 'antigravity-cli', name + '.exe'),
    path.join(HOME, '.local', 'bin', name + '.exe'),
    ...fnmDirs.flatMap((d) => [path.join(d, name + '.cmd'), path.join(d, name + '.exe')]),
    path.join(NODE_DIR, name + '.cmd'), path.join(NODE_DIR, name + '.exe'),
    path.join(A, 'npm', name + '.cmd'),
    path.join(L, 'Programs', name, name + '.exe'),
    path.join(L, 'Programs', 'antigravity-cli', name + '.exe'),
    path.join(L, 'Programs', 'Antigravity', 'bin', name + '.exe'),
    path.join(L, 'antigravity', 'bin', name + '.exe'),
    path.join(HOME, '.antigravity', 'bin', name + '.exe'),
    path.join(HOME, '.claude', 'local', name + '.exe'),
    path.join(L, 'Microsoft', 'WinGet', 'Links', name + '.exe'),
  ];
}
export function cliPath(p, config = {}, fresh = false) {
  const custom = config.cliPaths?.[p];
  if (custom && fs.existsSync(custom)) return custom;
  const hit = found.get(p);
  if (!fresh && hit && Date.now() - hit.at < 60000) return hit.path;
  const name = CLI[p].bin;
  let out = null;
  try {
    const r = execFileSync(WIN ? 'where.exe' : 'which', [name], { encoding: 'utf8', timeout: 4000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, PATH: freshPath() } });
    const lines = r.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    out = lines.find((l) => /\.exe$/i.test(l)) || lines.find((l) => /\.(cmd|bat)$/i.test(l)) || (WIN ? null : lines[0]) || null;
  } catch {}
  if (!out) out = candidates(name).find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
  found.set(p, { path: out, at: Date.now() });
  return out;
}

// ---------------------------------------------------------------- 실행
const childEnv = () => {
  const e = { ...process.env };
  // 키가 환경 변수에 있으면 CLI가 API(유료)로 붙을 수 있어서 지움 → 항상 로그인 계정 사용
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI']) delete e[k];
  e.NO_COLOR = '1';
  e.PATH = freshPath(); // 설치 후 바뀐 PATH 반영 (CLI가 다른 프로그램을 찾을 수 있게)
  return e;
};
function launch(file, args, opts) {
  // .cmd/.bat(npm 설치)은 cmd.exe로, .exe는 바로 실행
  // cmd /s /c "..." : 바깥 따옴표 한 쌍만 벗겨지므로 전체를 한 번 더 감쌈
  if (WIN && /\.(cmd|bat)$/i.test(file)) return spawn('cmd.exe', ['/d', '/s', '/c', '"' + [q(file), ...args.map(q)].join(' ') + '"'], { ...opts, windowsVerbatimArguments: true });
  return spawn(file, args, opts);
}
// 테스트용: 실제 프로그램 대신 가짜 실행기를 끼울 수 있게
let LAUNCH = launch;
export function __setLauncher(f) { LAUNCH = f || launch; }
function killTree(child) {
  if (!child || child.exitCode != null) return;
  if (WIN) { try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch {} }
  else { try { child.kill('SIGTERM'); } catch {} }
}
function run(file, args, { input = null, signal, timeoutMs = 300000, cwd = WORK } = {}) {
  fs.mkdirSync(cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const child = LAUNCH(file, args, { cwd, env: childEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); fn(); };
    const onAbort = () => { killTree(child); finish(() => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); };
    const timer = setTimeout(() => { killTree(child); finish(() => reject(new Error(`응답이 ${Math.round(timeoutMs / 1000)}초 넘게 없어서 멈췄어요`))); }, timeoutMs);
    signal?.addEventListener?.('abort', onAbort);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => finish(() => reject(new Error(`실행하지 못했어요: ${e.message}`))));
    child.on('close', (code) => finish(() => resolve({ code, out, err })));
    if (input != null) { child.stdin.on('error', () => {}); child.stdin.end(input, 'utf8'); } else child.stdin.end();
  });
}
const tail = (s, n = 300) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-n);
function friendly(p, code, out, err) {
  const msg = tail(err) || tail(out);
  const name = CLI[p].name;
  if (/log ?in|logged out|not logged|sign ?in|auth|unauthori[sz]ed|401|credential|expired/i.test(msg)) return new Error(`${name}: 로그인이 필요해요. 설정 > API 설정 > AI 모델에서 [로그인]을 눌러주세요. (${msg.slice(-160)})`);
  if (/usage limit|rate limit|quota|limit reached|too many|429|exhausted/i.test(msg)) return new Error(`${name}: 구독 사용 한도에 걸렸어요. 한도가 풀린 뒤 다시 하거나 다른 AI를 고르세요. (${msg.slice(-160)})`);
  return new Error(`${name} 실행 오류 (종료 코드 ${code}): ${msg || '출력 없음'}`);
}

// prompt를 보내고 답 텍스트를 받음
export async function runCli(p, prompt, { model = '', signal, config = {}, timeoutMs, web = false } = {}) {
  const file = cliPath(p, config);
  if (!file) throw new Error(`${CLI[p].name}: ${CLI[p].tool}가 설치되지 않았어요. 설정 > API 설정 > AI 모델에서 [설치]를 눌러주세요.`);
  fs.mkdirSync(WORK, { recursive: true });
  if (p === 'claude') {
    // 프롬프트는 표준 입력으로 (길이 제한 없음). 파일·명령 도구는 막음
    // web: 웹 검색·페이지 읽기만 허용 (--allowedTools는 -p 앞에 둬야 프롬프트를 먹지 않음)
    const args = web
      ? ['--allowedTools', 'WebSearch,WebFetch', '-p', '--output-format', 'json', '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit,Task']
      : ['-p', '--output-format', 'json', '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task'];
    if (model) args.push('--model', model);
    const r = await run(file, args, { input: prompt, signal, timeoutMs });
    let j = null;
    try { j = JSON.parse(r.out.trim().split(/\r?\n/).filter(Boolean).pop()); } catch {}
    if (j && (j.is_error || /error/i.test(j.subtype || ''))) throw friendly(p, r.code, j.result || r.out, r.err);
    if (r.code !== 0 && !j?.result) throw friendly(p, r.code, r.out, r.err);
    return j?.result ?? r.out;
  }
  if (p === 'codex') {
    const outFile = path.join(WORK, `codex-${process.pid}-${Date.now()}.txt`);
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '-o', outFile];
    if (web) args.push('-c', 'web_search=live'); // 실시간 웹 검색 (exec에서는 --search 대신 이 설정)
    if (model) { const [slug, effort] = String(model).split(':'); args.push('-m', slug); if (effort) args.push('-c', `model_reasoning_effort="${effort}"`); }
    args.push('-'); // 프롬프트는 표준 입력으로
    try {
      const r = await run(file, args, { input: prompt, signal, timeoutMs });
      let text = '';
      try { text = fs.readFileSync(outFile, 'utf8'); } catch {}
      if (!text.trim()) { if (r.code !== 0) throw friendly(p, r.code, r.out, r.err); text = r.out; }
      return text;
    } finally { try { fs.unlinkSync(outFile); } catch {} }
  }
  if (p === 'agy') {
    // 질문은 표준 입력으로 넘김 (stream-json): 길이 제한이 없고, Gemini에게 파일을 읽히지 않아도 됨
    const args = ['--input-format', 'stream-json', '--output-format', 'stream-json'];
    if (model) args.push('--model', model);
    const line = JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n';
    const r = await run(file, args, { input: line, signal, timeoutMs });
    let res = null, text = '';
    for (const ln of r.out.split(/\r?\n/)) {
      if (!ln.trim().startsWith('{')) continue;
      let ev; try { ev = JSON.parse(ln); } catch { continue; }
      if (ev.event === 'result') res = ev.result || {};
      else if (ev.event === 'step_update' && ev.step_update?.step_type === 'agent_response' && ev.step_update.text_delta) text += ev.step_update.text_delta;
    }
    if (res && res.status && res.status !== 'SUCCESS') throw friendly(p, r.code || 1, res.error || r.out, res.error || r.err);
    if (/authentication required/i.test(r.out + r.err) && !res?.response) throw friendly(p, 1, r.out, 'authentication required');
    const out = res?.response || text;
    if (!out.trim()) throw friendly(p, r.code, r.out, r.err || '응답이 비어 있어요');
    return out;
  }
  throw new Error('알 수 없는 AI: ' + p);
}

// 로그인형 모델 목록: Gemini(agy)는 'agy models'로 읽음 (계정마다 다름, 10분 캐시)
const modelCache = {};
export async function cliModels(p, config = {}) {
  if (p === 'codex') {
    const cc = modelCache[p];
    if (cc && Date.now() - cc.at < 600000) return cc.list;
    const file = cliPath(p, config);
    if (!file) return [];
    try {
      const r = await run(file, ['debug', 'models'], { timeoutMs: 30000 });
      const t = String(r.out || '');
      const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      const list = [];
      for (const m of j.models || []) {
        if (!m.slug || (m.visibility && m.visibility !== 'list')) continue;
        list.push({ id: m.slug, label: m.display_name || m.slug, def: m.default_reasoning_level || '' });
        for (const lv of (m.supported_reasoning_levels || []).map((x) => x.effort || x).filter((x) => ['low', 'medium', 'high'].includes(x))) list.push({ id: `${m.slug}:${lv}`, label: `${m.display_name || m.slug} · 생각 ${lv}` });
      }
      cliModels.raw = { n: list.length };
      if (list.length) modelCache[p] = { at: Date.now(), list };
      return list;
    } catch (e) { cliModels.raw = { error: e.message }; return []; }
  }
  if (p !== 'agy') return CLI_MODELS[p] || [];
  const c = modelCache[p];
  if (c && Date.now() - c.at < 600000) return c.list;
  const file = cliPath(p, config);
  if (!file) return [];
  try {
    const r = await run(file, ['models'], { timeoutMs: 30000 });
    cliModels.raw = { code: r.code, out: tail(r.out, 1500), err: tail(r.err, 600) };
    const list = [];
    for (const ln of String(r.out + '\n' + r.err).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
      const m = ln.trim().match(/^([a-z0-9][a-z0-9.\-]+)(?:\t+|\s{2,})(.+)$/i); // 'slug<탭>이름'
      if (m) list.push({ id: m[1], label: m[2].trim() });
    }
    if (list.length) modelCache[p] = { at: Date.now(), list };
    return list;
  } catch (e) { cliModels.raw = { error: e.message }; return []; }
}

// ---------------------------------------------------------------- 상태 확인 · 테스트
export async function cliStatus(p, config = {}) {
  const file = cliPath(p, config, true);
  const st = { id: p, name: CLI[p].name, tool: CLI[p].tool, path: file, installed: !!file, version: '', login: null, loginText: '' };
  if (!file) return st;
  try { const r = await run(file, ['--version'], { timeoutMs: 15000 }); st.version = tail(r.out || r.err, 80).split(/\r?\n/)[0]; } catch (e) { st.version = '확인 실패: ' + e.message.slice(0, 80); }
  if (CLI[p].statusArgs) {
    try {
      const r = await run(file, CLI[p].statusArgs, { timeoutMs: 15000 });
      const t = tail(r.out + '\n' + r.err, 400);
      st.loginText = t.slice(0, 200);
      if (p === 'claude') { try { const j = JSON.parse(r.out); st.login = !!(j.loggedIn ?? j.logged_in ?? j.authenticated); } catch { st.login = /logged in|authenticated/i.test(t) && !/not logged|logged out/i.test(t); } }
      else st.login = r.code === 0 && /logged in/i.test(t) && !/not logged/i.test(t);
    } catch (e) { st.loginText = e.message.slice(0, 120); }
  }
  return st;
}
export async function cliTest(p, config = {}, model = '') {
  const t0 = Date.now();
  const text = await runCli(p, '연결 테스트다. 설명 없이 정확히 {"items":["OK"]} 만 출력해.', { model, config, timeoutMs: 180000 });
  return { ok: /OK/.test(text), ms: Date.now() - t0, text: tail(text, 120) };
}

// ---------------------------------------------------------------- 로그인·설치 창 열기 (Windows: 새 명령 창)
// 열린 설치·로그인 창 추적: { [p]: { action, running, startedAt, endedAt } }
const jobs = {};
export const cliJobs = () => jobs;
export function openConsole(p, action, config = {}) {
  const c = CLI[p];
  const file = cliPath(p, config, true);
  let line;
  if (action === 'login') {
    if (!file) throw new Error(`${c.tool}가 아직 설치되지 않았어요. 먼저 [설치]를 눌러주세요.`);
    line = c.loginCmd(file);
  } else if (action === 'install') {
    if (c.install.shell === 'npm') {
      const npm = WIN ? path.join(NODE_DIR, 'npm.cmd') : path.join(NODE_DIR, 'npm');
      line = `${fs.existsSync(npm) ? q(npm) : 'npm'} ${c.install.cmd}`;
    } else if (c.install.shell === 'powershell') {
      // 따옴표·파이프(|) 문제를 피하려고 PowerShell 명령은 인코딩해서 넘김
      line = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(c.install.cmd, 'utf16le').toString('base64')}`;
    } else line = c.install.cmd;
  } else throw new Error('알 수 없는 동작');
  if (!WIN) return { opened: false, command: line };
  const title = `키워드 분석기 - ${c.tool} ${action === 'login' ? '로그인' : '설치'}`;
  if (jobs[p]?.running) return { opened: true, already: true, command: line, job: jobs[p] };
  const note = action === 'login' ? c.loginHelp : '설치 중이에요. 끝나면 이 창은 자동으로 닫히고, 분석기가 알아서 확인한 뒤 로그인으로 이어가요.';
  const clean = (s) => s.replace(/["&|<>^%()]/g, ' ');
  // 설치: 성공하면 4초 뒤 자동으로 닫힘, 실패하면 내용을 볼 수 있게 멈춤
  // 로그인: 로그인 프로그램이 끝나면(Antigravity는 /exit) 3초 뒤 닫힘
  const tail = action === 'install'
    ? ` && (echo. & echo 설치 명령이 끝났어요. 4초 뒤 창이 닫혀요. & timeout /t 4 >nul) || (echo. & echo 설치 중 오류가 났어요. 위 내용을 확인한 뒤 아무 키나 누르면 창이 닫혀요. & pause >nul)`
    : ` & echo. & echo 로그인 창을 닫아요. 분석기가 자동으로 테스트해요. & timeout /t 3 >nul`;
  const script = `title ${clean(title)} & echo. & echo ${clean(note)} & echo. & ${line}${tail}`;
  fs.mkdirSync(WORK, { recursive: true });
  // start /wait : 새 창이 닫힐 때까지 기다림 → 닫히면 'close' 이벤트로 끝난 것을 앎
  // cmd /c "..." : 앞뒤 따옴표만 벗겨지고 안쪽 명령(경로 따옴표 포함)은 그대로 실행됨
  const child = spawn('cmd.exe', ['/d', '/c', `start "" /wait cmd.exe /c "${script}"`], { stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true, env: childEnv(), cwd: action === 'login' ? WORK : HOME });
  const job = (jobs[p] = { action, running: true, startedAt: Date.now(), endedAt: 0 });
  const end = () => { if (!job.running) return; job.running = false; job.endedAt = Date.now(); found.delete(p); regPath.at = 0; };
  child.on('close', end); child.on('error', end);
  setTimeout(end, 30 * 60 * 1000); // 30분 넘게 열려 있으면 끝난 것으로 봄
  found.delete(p);
  return { opened: true, command: line, job };
}
