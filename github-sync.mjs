// GitHub 자동 백업: 이 폴더의 코드를 비공개 저장소에 올림 (git 설치 없이 GitHub API로)
// - 설정: data\github.json { owner, repo, branch, token, includeData }  ← 이 파일은 올리지 않음
// - 서버가 켜질 때 + 파일이 바뀌면 30초 뒤 자동으로 올림. 바뀐 게 없으면 아무것도 안 함
// - 커밋 메시지: data\next-commit.txt 가 있으면 그 내용(올린 뒤 지움), 없으면 "자동 백업: 바뀐 파일 목록"
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createGitSync(root) {
  const CFG = path.join(root, 'data', 'github.json');
  const STATE = path.join(root, 'data', 'github-state.json');
  const MSG = path.join(root, 'data', 'next-commit.txt');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  let running = null, timer = null;
  const saveState = (s) => { state = { ...state, ...s }; try { fs.writeFileSync(STATE, JSON.stringify(state, null, 2)); } catch {} };
  const cfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return null; } };

  // 올릴 파일: 코드·문서·화면 + 화면/규칙 설정. 키(config.json)·캐시·내 데이터·백업은 제외
  function listFiles(includeData) {
    const out = [];
    const add = (rel) => { const abs = path.join(root, rel); try { if (fs.statSync(abs).isFile()) out.push(rel.split(path.sep).join('/')); } catch {} };
    for (const f of fs.readdirSync(root)) {
      if (/^(config\.json|cache\.json)$/i.test(f) || /\.tmp$/i.test(f)) continue;
      if (/\.(mjs|js|bat|cmd|ps1|md|txt|json)$/i.test(f) || f === '.gitignore') add(f);
    }
    const walk = (dir) => { for (const f of fs.readdirSync(path.join(root, dir))) { const rel = path.join(dir, f); const st = fs.statSync(path.join(root, rel)); if (st.isDirectory()) walk(rel); else if (!/\.tmp$/i.test(f)) add(rel); } };
    try { walk('public'); } catch {}
    add(path.join('data', 'settings.json'));
    if (includeData) {
      add(path.join('data', 'existing-keywords.json'));
      try { walk(path.join('data', 'bulk-history')); } catch {}
    }
    return [...new Set(out)].sort();
  }
  const blobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

  async function api(c, method, p, body) {
    const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${p}`, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'keyword-tool', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = { message: t }; }
    if (!r.ok) {
      const e = new Error(r.status === 401 ? 'GitHub 토큰이 만료됐거나 잘못됐어요 (설정 › API 설정 › GitHub에서 새 토큰을 넣어주세요)' : r.status === 403 || r.status === 404 ? `저장소에 쓸 권한이 없어요 (${r.status}). 토큰의 저장소·권한(Contents 읽기·쓰기)을 확인해 주세요` : `GitHub 오류 ${r.status}: ${String(j.message || '').slice(0, 160)}`);
      e.status = r.status; throw e;
    }
    return j;
  }

  // 로컬과 저장소를 비교해 바뀐 파일만 한 커밋으로 올림
  async function sync(reason = '') {
    if (running) return running;
    running = (async () => {
      const c = cfg();
      if (!c?.token || !c.owner || !c.repo) return { ok: false, skipped: '설정 없음' };
      const branch = c.branch || 'main';
      try {
        const ref = await api(c, 'GET', `/git/ref/heads/${branch}`);
        const head = ref.object.sha;
        const commit = await api(c, 'GET', `/git/commits/${head}`);
        const tree = await api(c, 'GET', `/git/trees/${commit.tree.sha}?recursive=1`);
        const remote = new Map(tree.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]));
        const files = listFiles(!!c.includeData);
        const local = files.map((p) => { const buf = fs.readFileSync(path.join(root, p)); return { p, buf, sha: blobSha(buf) }; });
        const changed = local.filter((f) => remote.get(f.p) !== f.sha);
        const removed = [...remote.keys()].filter((p) => !files.includes(p));
        if (!changed.length && !removed.length) { saveState({ lastCheck: Date.now(), error: '', pending: 0 }); return { ok: true, changed: 0 }; }
        for (const f of changed) {
          const b = await api(c, 'POST', '/git/blobs', { content: f.buf.toString('base64'), encoding: 'base64' });
          f.sha = b.sha;
        }
        const t = await api(c, 'POST', '/git/trees', { tree: local.map((f) => ({ path: f.p, mode: /\.(bat|cmd)$/i.test(f.p) ? '100644' : '100644', type: 'blob', sha: f.sha })) });
        let message = '';
        try { message = fs.readFileSync(MSG, 'utf8').trim(); } catch {}
        const list = [...changed.map((f) => f.p), ...removed.map((p) => p + ' (삭제)')];
        if (!message) message = `자동 백업: ${list.slice(0, 6).join(', ')}${list.length > 6 ? ` 외 ${list.length - 6}개` : ''}`;
        message += `\n\n바뀐 파일 (${list.length}):\n${list.map((x) => '- ' + x).join('\n')}`;
        const nc = await api(c, 'POST', '/git/commits', { message, tree: t.sha, parents: [head] });
        await api(c, 'PATCH', `/git/refs/heads/${branch}`, { sha: nc.sha });
        try { fs.unlinkSync(MSG); } catch {}
        saveState({ lastSync: Date.now(), lastCheck: Date.now(), lastCommit: nc.sha, lastMessage: message.split('\n')[0], lastFiles: list, error: '', pending: 0 });
        console.log(`  GitHub 백업: ${list.length}개 파일 올림 (${nc.sha.slice(0, 7)})${reason ? ' · ' + reason : ''}`);
        return { ok: true, changed: list.length, commit: nc.sha, files: list };
      } catch (e) {
        saveState({ lastCheck: Date.now(), error: e.message });
        console.log('  GitHub 백업 실패: ' + e.message);
        return { ok: false, error: e.message };
      }
    })();
    try { return await running; } finally { running = null; }
  }

  // 파일이 바뀌면 30초 뒤 올림 (연달아 고치면 마지막 수정 30초 뒤 한 번)
  function schedule(why) {
    clearTimeout(timer);
    saveState({ pending: (state.pending || 0) + 1 });
    timer = setTimeout(() => sync(why), 30000);
  }
  function watch() {
    const skip = /^(config\.json|cache\.json|github-state\.json|github\.json)$|\.tmp$/i;
    const w = (dir, filter) => { try { fs.watch(path.join(root, dir), { recursive: dir === 'public' }, (ev, f) => { if (f && !skip.test(path.basename(String(f))) && (!filter || filter(String(f)))) schedule(path.join(dir, String(f))); }); } catch {} };
    w('.', (f) => /\.(mjs|js|bat|cmd|ps1|md|txt|json)$/i.test(f) || f === '.gitignore');
    w('public');
    w('data', (f) => f === 'settings.json' || f === 'next-commit.txt' || (cfg()?.includeData && /^(existing-keywords\.json|bulk-history)/.test(f)));
  }
  function start() {
    if (!cfg()?.token) return;
    setTimeout(() => sync('서버 시작'), 5000);
    watch();
  }
  function status() {
    const c = cfg();
    return {
      configured: !!c?.token, owner: c?.owner || '', repo: c?.repo || '', branch: c?.branch || 'main', includeData: !!c?.includeData,
      tokenHint: c?.token ? c.token.slice(0, 11) + '••••' : '', expires: c?.expires || '',
      url: c?.owner ? `https://github.com/${c.owner}/${c.repo}` : '', ...state, running: !!running,
    };
  }
  function setConfig(b) {
    const c = cfg() || { branch: 'main' };
    for (const k of ['owner', 'repo', 'branch', 'expires']) if (typeof b[k] === 'string' && b[k].trim()) c[k] = b[k].trim();
    if (typeof b.token === 'string' && b.token.trim() && !b.token.includes('••••')) c.token = b.token.trim();
    if (typeof b.includeData === 'boolean') c.includeData = b.includeData;
    fs.mkdirSync(path.dirname(CFG), { recursive: true });
    fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
    return status();
  }
  return { sync, start, status, setConfig, listFiles };
}
