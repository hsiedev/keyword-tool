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
export async function runCli(p, prompt, { model = '', signal, config = {}, timeoutMs } = {}) {
  const file = cliPath(p, config);
  if (!file) throw new Error(`${CLI[p].name}: ${CLI[p].tool}가 설치되지 않았어요. 설정 > API 설정 > AI 모델에서 [설치]를 눌러주세요.`);
  fs.mkdirSync(WORK, { recursive: true });
  if (p === 'claude') {
    // 프롬프트는 표준 입력으로 (길이 제한 없음). 파일·명령 도구는 막음
    const args = ['-p', '--output-format', 'json', '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task'];
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
    if (model) args.push('-m', model);
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
    // 짧은 프롬프트는 그대로, 길면(명령줄 길이 제한) 작업 폴더의 파일로 넘기고 읽게 함
    let arg = prompt, promptFile = null;
    if (prompt.length > 20000 || /\.(cmd|bat)$/i.test(file)) {
      promptFile = path.join(WORK, `prompt-${process.pid}-${Date.now()}.txt`);
      fs.writeFileSync(promptFile, prompt, 'utf8');
      arg = `이 폴더의 ${path.basename(promptFile)} 파일을 읽고, 그 안의 지시를 그대로 수행해서 결과만 출력해. 파일을 만들거나 고치거나 명령을 실행하지 마.`;
    }
    const args = ['-p', arg];
    if (model) args.push('--model', model);
    try {
      const r = await run(file, args, { signal, timeoutMs });
      if (r.code !== 0 && !r.out.trim()) throw friendly(p, r.code, r.out, r.err);
      if (/authentication required/i.test(r.out + r.err) && !/[[{]/.test(r.out)) throw friendly(p, 1, r.out, 'authentication required');
      return r.out;
    } finally { if (promptFile) try { fs.unlinkSync(promptFile); } catch {} }
  }
  throw new Error('알 수 없는 AI: ' + p);
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
  const note = action === 'login' ? c.loginHelp : '설치가 끝나면 이 창을 닫고 분석기 설정에서 [다시 확인]을 누르세요.';
  // 새 창: 안내 문구 → 명령 실행 → 창 유지
  const clean = (s) => s.replace(/["&|<>^%]/g, ' ');
  const script = `title ${clean(title)} & echo. & echo ${clean(note)} & echo. & ${line}`;
  // cmd /k "..." : 앞뒤 따옴표만 벗겨지고 안쪽 명령(경로 따옴표 포함)은 그대로 실행됨
  fs.mkdirSync(WORK, { recursive: true });
  const child = spawn('cmd.exe', ['/d', '/c', `start "" cmd.exe /k "${script}"`], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true, env: childEnv(), cwd: action === 'login' ? WORK : HOME });
  child.unref();
  found.delete(p);
  return { opened: true, command: line };
}
