// AI 키워드 생성기: 주제별 탭(왼쪽 사이드바) + 생성 + 중복 검사 + 조건 재검증
// index.html의 전역 도우미($, $$, esc, fmt, run, openSettings, fillModelSelect, setModel, loadModels, MODEL_LIST)를 사용합니다.
(function () {
  const AI = {
    sessions: [], // 저장된 탭: { id, name, custom, pinned, createdAt, updatedAt, form, items }
    cur: null, // 지금 보고 있는 탭 (새 탭은 draft: true)
    sources: [], // 기존 키워드 목록 (모든 탭 공통)
    filter: '전체',
    vfilter: '전체',
    sort: { key: '', dir: 1 },
    pending: null,
    busy: '',
  };
  Object.defineProperty(AI, 'items', { get: () => AI.cur.items, set: (v) => (AI.cur.items = v) });

  // ---------------------------------------------------------------- 저장 (브라우저 localStorage)
  const DEFAULT_FORM = { topic: '', examples: '', count: '50', extra: '', refMode: 'ref', pos: '', neg: '', minLen: 2, maxLen: 30, minVol: 50 };
  const newDraft = () => ({ id: 's' + Date.now() + Math.floor(Math.random() * 1000), name: '새 탭', custom: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), form: { ...DEFAULT_FORM, minVol: RULES().verify?.defaultMinVol ?? DEFAULT_FORM.minVol }, items: [], rejected: [], draft: true });
  function load() {
    try { AI.sessions = JSON.parse(localStorage.getItem('aiSessions') || '[]'); } catch { AI.sessions = []; }
    for (const s of AI.sessions) {
      s.rejected = s.rejected || [];
      // 키워드는 띄어쓰기 없이 쓰기로 함 → 예전에 띄어 쓴 키워드도 붙이고, 붙이면서 같아진 것은 하나만 남김
      if ((s.items || []).some((it) => /\s/.test(it.keyword))) {
        const seen = new Set();
        s.items = s.items.filter((it) => { it.keyword = it.keyword.replace(/\s+/g, ''); const n = it.keyword.toLowerCase(); if (seen.has(n)) return false; seen.add(n); return true; });
      }
      s.rejected.forEach((r) => (r.keyword = String(r.keyword).replace(/\s+/g, '')));
      // 예전 기본값(10)은 '<10 / <10' 키워드까지 통과시켜서 새 기본값으로 올림
      if (s.form && (s.form.minVol === undefined || s.form.minVol === 10)) s.form.minVol = DEFAULT_FORM.minVol;
      // 주제 + 요청 사항 → 브리프 한 칸으로 합침
      if (s.form && String(s.form.extra || '').trim()) { s.form.topic = [s.form.topic, s.form.extra].map((x) => String(x || '').trim()).filter(Boolean).join('\n'); s.form.extra = ''; }
    }
    AI.sources = []; // 기존 키워드는 loadSources()가 폴더 파일에서 읽음
    // 예전 버전(탭 없음) 데이터 옮기기
    try {
      const old = JSON.parse(localStorage.getItem('aiState') || 'null');
      if (old) {
        if (old.items?.length) {
          const s = newDraft();
          delete s.draft;
          s.items = old.items; s.form = { ...DEFAULT_FORM, ...(old.form || {}) };
          s.name = autoName(s);
          AI.sessions.unshift(s);
        }
        if (old.sources?.length && !AI.sources.length) AI.sources = old.sources;
        localStorage.removeItem('aiState');
        persist();
      }
    } catch {}
  }
  let warned = false;
  function persist() {
    const strip = (k, v) => (k === '_sel' ? undefined : v);
    try {
      localStorage.setItem('aiSessions', JSON.stringify(AI.sessions, strip));
    } catch {
      if (!warned) { warned = true; alert('브라우저 저장 공간이 가득 찼어요. 왼쪽에서 오래된 탭을 우클릭해서 삭제해 주세요.'); }
    }
  }
  const autoName = (s) => (s.form.topic || '').trim().split('\n')[0].slice(0, 30) || splitList(s.form.examples)[0] || (s.form.extra || '').trim().replace(/\s+/g, ' ').slice(0, 24) || '새 탭';
  // 새 탭은 어느 칸이든 내용을 적으면 바로 기록에 올라가요
  const hasContent = (c) => c.items.length || ['topic', 'examples', 'extra'].some((k) => String(c.form[k] || '').trim());
  function save() {
    const c = AI.cur;
    if (!c) return;
    c.form = readForm();
    if (!c.custom) c.name = autoName(c);
    c.updatedAt = Date.now();
    if (c.draft && hasContent(c)) { delete c.draft; AI.sessions.unshift(c); }
    if (!c.draft) persist();
    drawSide();
  }

  // ---------------------------------------------------------------- 중복 검사 엔진 (전부 PC 안에서 처리)
  // 정규화 규칙은 설정 > 규칙·알고리즘 > 중복 검사에서 바꿀 수 있어요
  const DD = () => RULES().dedup || {};
  let normCache = { key: null };
  function normPrep() {
    const d = DD();
    const key = JSON.stringify([d.ignoreChars, d.ignoreCase, d.synonyms]);
    if (normCache.key === key) return normCache;
    const chars = (d.ignoreChars ?? "-_.,·/()[]{}'\"!?~:;+|#*").replace(/[\\\]\[^-]/g, '\\$&');
    const re = new RegExp('[\\s' + chars + ']+', 'g');
    const syn = [];
    for (const line of String(d.synonyms || '').split(/\r?\n/)) {
      const parts = line.split('=').map((x) => x.replace(/\s+/g, '')).filter(Boolean);
      if (parts.length < 2) continue;
      const to = d.ignoreCase !== false ? parts[0].toLowerCase() : parts[0];
      for (const f of parts.slice(1)) syn.push([d.ignoreCase !== false ? f.toLowerCase() : f, to]);
    }
    syn.sort((a, b) => b[0].length - a[0].length);
    normCache = { key, re, syn, lower: d.ignoreCase !== false };
    return normCache;
  }
  const norm = (s) => {
    const c = normPrep();
    let x = String(s ?? '');
    if (c.lower) x = x.toLowerCase();
    x = x.replace(c.re, '');
    for (const [f, to] of c.syn) if (x.includes(f)) x = x.split(f).join(to);
    return x;
  };
  const sortKey = (n) => [...n].sort().join('');
  const tokensKey = (s) => String(s).toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
  const bigrams = (n) => { const s = new Set(); for (let i = 0; i + 2 <= n.length; i++) s.add(n.slice(i, i + 2)); if (n.length === 1) s.add(n); return s; };
  const charLen = (k) => String(k).replace(/\s+/g, '').length;
  // 네이버는 10 미만을 '<10'으로만 알려줌 → 기준 판단은 0으로 보수적으로 계산(하한값)
  const lowAs = () => Math.max(0, Math.min(9, RULES().verify?.lowAs ?? 0));
  const volLB = (v) => (!v || v.error || v.notFound ? 0 : (v.pcLow ? lowAs() : v.pc || 0) + (v.moLow ? lowAs() : v.mo || 0));
  function volLabel(v, plain) {
    if (!v || v.error) return '미조회';
    if (v.notFound) return '데이터 없음';
    const lb = (v.pcLow ? 0 : v.pc || 0) + (v.moLow ? 0 : v.mo || 0);
    if (v.pcLow && v.moLow) return plain ? 'PC·모바일 모두 10 미만' : '<20';
    if (v.pcLow || v.moLow) return `${lb.toLocaleString('ko-KR')}~${(lb + 9).toLocaleString('ko-KR')}`;
    return lb.toLocaleString('ko-KR');
  }
  const isBad = (it) => vsum(it).group === '부적합';
  // 부적합 판정 키워드를 탭의 제외 목록에 저장 (다음 생성 때 Gemini에 알려주고, PC에서도 걸러냄)
  // 수동 제외: 체크한 키워드를 판정과 상관없이 제외 목록에 넣고 결과에서 뺌
  async function rejectChecked() {
    const sel = AI.items.filter((it) => it._sel);
    if (!sel.length) return alert('제외할 키워드를 먼저 체크하세요.');
    if (!await uiConfirm(`체크한 키워드 ${sel.length}개를 제외 목록에 넣고 결과에서 빼까요?\n이 탭에서는 다음 생성부터 다시 나오지 않아요.`)) return;
    const s = AI.cur;
    s.rejected = s.rejected || [];
    const have = new Set(s.rejected.map((r) => norm(r.keyword)));
    for (const it of sel) {
      if (have.has(norm(it.keyword))) continue;
      const last = (it.checks || []).slice(-1)[0];
      s.rejected.push({ keyword: it.keyword, reason: isBad(it) && last ? last.reason : '직접 제외', at: Date.now(), manual: !isBad(it) });
      have.add(norm(it.keyword));
    }
    AI.items = AI.items.filter((it) => !it._sel);
    if (AI.vfilter !== '전체' && !viewRows().length) AI.vfilter = '전체';
    save(); draw();
    vmsg(`${sel.length}개를 제외 목록에 넣었어요. 결과 표 아래 제외 목록에서 확인하거나 해제할 수 있어요.`);
  }
  function rejectItems(list) {
    const s = AI.cur;
    s.rejected = s.rejected || [];
    const have = new Set(s.rejected.map((r) => norm(r.keyword)));
    for (const it of list) {
      if (!isBad(it) || have.has(norm(it.keyword))) continue;
      const last = (it.checks || []).slice(-1)[0];
      s.rejected.push({ keyword: it.keyword, reason: last?.reason || '부적합', at: Date.now() });
      have.add(norm(it.keyword));
    }
  }
  // 제외 목록과 같거나 어순만 다른 키워드인지
  function isRejected(k, rejIdx) {
    const n = norm(k);
    if (rejIdx.exact.has(n)) return true;
    for (const i of rejIdx.sorted.get(sortKey(n)) || []) { const e = rejIdx.arr[i]; if ((e.n + e.n).includes(n)) return true; }
    return false;
  }
  function lev1(a, b) {
    if (Math.abs(a.length - b.length) > 1 || a === b) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function buildIndex(list) {
    const idx = { exact: new Map(), sorted: new Map(), bg: new Map(), arr: [] };
    for (const k of list) {
      const n = norm(k);
      if (!n || idx.exact.has(n)) continue;
      idx.exact.set(n, k);
      const i = idx.arr.length;
      const bgs = bigrams(n);
      idx.arr.push({ k, n, size: bgs.size });
      const sk = sortKey(n);
      if (!idx.sorted.has(sk)) idx.sorted.set(sk, []);
      idx.sorted.get(sk).push(i);
      for (const b of bgs) { if (!idx.bg.has(b)) idx.bg.set(b, []); idx.bg.get(b).push(i); }
    }
    return idx;
  }
  function checkOne(k, idx) {
    const n = norm(k);
    if (!n) return { status: '중복', kind: '빈 값', match: '', sim: [] };
    if (idx.exact.has(n)) return { status: '중복', kind: '동일 (띄어쓰기·대소문자 무시)', match: idx.exact.get(n), sim: [] };
    for (const i of DD().order === false ? [] : idx.sorted.get(sortKey(n)) || []) {
      const e = idx.arr[i];
      if ((e.n + e.n).includes(n) || tokensKey(e.k) === tokensKey(k)) return { status: '중복', kind: '어순만 다름', match: e.k, sim: [] };
    }
    const bgs = bigrams(n);
    const cnt = new Map();
    for (const b of bgs) {
      const l = idx.bg.get(b);
      if (!l || l.length > 8000) continue;
      for (const i of l) cnt.set(i, (cnt.get(i) || 0) + 1);
    }
    let typo = null, inside = null, extend = null;
    const scored = [];
    for (const [i, c] of cnt) {
      const e = idx.arr[i];
      scored.push([c / (bgs.size + e.size - c), e.k]);
      // 숫자가 다르면(20대 vs 50대) 오타가 아니라 다른 대상으로 봄
      const d = DD(), tMin = d.typoMinLen ?? 4, cMin = d.containMinLen ?? 2;
      if (tMin > 0 && n.length >= tMin && (d.typoDigits === false || n.replace(/\D/g, '') === e.n.replace(/\D/g, '')) && lev1(n, e.n)) typo = typo || e.k;
      else if (cMin > 0 && n.length >= cMin && e.n.includes(n)) { if (!inside || e.n.length < norm(inside).length) inside = e.k; }
      else if (cMin > 0 && e.n.length >= cMin && n.includes(e.n)) { if (!extend || e.n.length > norm(extend).length) extend = e.k; }
    }
    scored.sort((a, b) => b[0] - a[0]);
    const sim = scored.filter(([j]) => j >= (DD().simThreshold ?? 0.25)).slice(0, 5).map(([, k2]) => k2);
    if (typo) return { status: '유사', kind: '철자 1글자 차이', match: typo, sim };
    if (inside) return { status: '유사', kind: '기존 키워드에 포함됨', match: inside, sim };
    if (extend) return { status: '유사', kind: '기존 키워드를 확장', match: extend, sim };
    return { status: '신규', kind: '', match: '', sim };
  }
  // 이 탭에서 켜 둔 목록만 중복 검사에 사용 (srcNone: 아예 사용 안 함, srcOff: 꺼 둔 목록 id)
  const srcOn = (s) => !AI.cur?.srcNone && !(AI.cur?.srcOff || []).includes(String(s.id));
  const activeSources = () => AI.sources.filter(srcOn);
  const existingList = () => activeSources().flatMap((s) => s.keywords);

  // Gemini에 보낼 기존 키워드: 띄어쓰기·대소문자 기준 중복을 빼고, 너무 많으면 주제·예시와 글자가 많이 겹치는 것부터
  function pickExisting(topic, examples, max) {
    const idx = buildIndex(existingList());
    const all = idx.arr.map((e) => e.k);
    if (all.length <= max) return all;
    const q = bigrams(norm([topic, ...examples].join('')));
    return idx.arr
      .map((e) => { let c = 0; for (const b of bigrams(e.n)) if (q.has(b)) c++; return [c / Math.max(1, e.size), e.k]; })
      .sort((a, b) => b[0] - a[0])
      .slice(0, max)
      .map(([, k]) => k);
  }

  // ---------------------------------------------------------------- 기존 키워드 파일 저장 (분석기 폴더 data\existing-keywords.json)
  let srcFile = '';
  async function loadSources() {
    try {
      const j = await (await fetch('/api/sources')).json();
      AI.sources = (j.sources || []).map((s) => ({ ...s, id: String(s.id) }));
      srcFile = j.file || '';
      // 예전 버전이 브라우저에 저장해 둔 목록을 파일로 옮김
      const old = JSON.parse(localStorage.getItem('aiSources') || '[]');
      if (old.length) {
        const have = new Set(AI.sources.map((s) => s.name + '|' + s.keywords.length));
        for (const s of old) if (!have.has(s.name + '|' + s.keywords.length)) AI.sources.push({ ...s, id: String(s.id), addedAt: s.addedAt || Date.now() });
        if (await saveSources()) localStorage.removeItem('aiSources');
      }
    } catch (e) {
      $('#aiSources').innerHTML = `<div style="color:#b91c1c">기존 키워드 파일을 읽지 못했어요: ${esc(e.message)}</div>`;
      return;
    }
    recheckAll(); drawSources(); draw();
  }
  window.addEventListener('sources-changed', (e) => { if (e.detail !== 'ai') loadSources(); });
  async function saveSources() {
    try {
      const r = await (await fetch('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: AI.sources }) })).json();
      if (r.error) throw new Error(r.error);
      window.dispatchEvent(new CustomEvent('sources-changed', { detail: 'ai' })); // 중복 검사 화면 등에 알림
      return true;
    } catch (e) { alert('기존 키워드를 파일에 저장하지 못했어요: ' + e.message); return false; }
  }
  let IDX = buildIndex([]);
  function recheckAll() {
    IDX = buildIndex(existingList());
    for (const it of AI.items) {
      const r = checkOne(it.keyword, IDX);
      Object.assign(it, r);
      if (it.sem?.dup && r.status !== '중복') { it.status = '의미 중복'; it.kind = 'AI 판단: ' + (it.sem.reason || '의미가 같음'); it.match = it.sem.dup; }
    }
  }

  // ---------------------------------------------------------------- 조건 재검증 결과 요약
  function vsum(it) {
    const cs = it.checks || [];
    const n = cs.length, p = cs.filter((c) => c.pass).length;
    // 엇갈림을 사용자가 직접 정한 경우 그 결정이 최종
    if (it.decision) return it.decision.pass ? { n, p, label: '적합 (직접)', cls: 'ok man', group: '일관 적합', manual: true } : { n, p, label: '부적합 (직접)', cls: 'bad man', group: '부적합', manual: true };
    if (!n) return { n, p, label: '미검증', cls: 'none', group: '미검증' };
    if (cs[n - 1].mix) return { n, p, label: '판정 엇갈림', cls: 'mix', group: '엇갈림' }; // 검색량은 낮은데 경쟁 중간 → 사람이 정하기
    const cN = Math.max(1, RULES().verify?.consistN ?? 2);
    if (p === n) return n >= cN ? { n, p, label: `일관 적합`, cls: 'ok', group: '일관 적합' } : { n, p, label: '적합', cls: 'ok1', group: '적합 (1회)' };
    if (p === 0) return n >= cN ? { n, p, label: '일관 부적합', cls: 'bad', group: '부적합' } : { n, p, label: '부적합', cls: 'bad1', group: '부적합' };
    return { n, p, label: '판정 엇갈림', cls: 'mix', group: '엇갈림' };
  }
  const VGROUPS = ['전체', '일관 적합', '적합 (1회)', '엇갈림', '부적합', '미검증'];

  // ---------------------------------------------------------------- 화면
  const STATUS = ['전체', '신규', '유사', '중복', '의미 중복'];
  const progHTML = (id) => `<div class="prog hidden" id="${id}">
      <div class="prog-top"><b class="p-phase">준비 중</b><span><span class="p-pct">0%</span> · <span class="p-time muted">0초</span></span></div>
      <div class="bar"><div class="p-bar"></div></div>
      <div class="muted p-model" style="font-size:11px;margin-top:4px"></div></div>`;
  const PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a" style="flex:none"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';
  function mount() {
    const view = document.createElement('div');
    view.id = 'aiView';
    view.className = 'hidden';
    view.innerHTML = `
     <div class="ai-wrap">
      <aside class="side" id="aiSide"></aside>
      <main class="ai-main">
        <div class="sec"><h2>AI 키워드 생성기</h2>
          <div class="grid g2">
            <div class="card"><h3>① 브리프 <span class="muted" id="aiTabName"></span></h3>
              <label class="muted">무엇을, 누구에게, 왜 찾는지, 빼고 싶은 것까지 자유롭게 써 주세요. AI가 읽고 탐색 계획을 세운 뒤 네이버 실제 검색 데이터에서 찾아요.</label>
              <textarea id="aiTopic" class="inp" rows="5" placeholder="예: 카카오페이 카드 발급 이벤트 검색광고 키워드. 2030 직장인이 카드 발급 직전에 찾을 만한 표현 위주로. 혜택·발급 절차·실물카드 관련은 좋고, 다른 카드사 이름은 빼 줘."></textarea>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">
                <label class="muted">참고 키워드 (선택, 쉼표나 줄바꿈으로 구분)</label>
                <select id="aiRefMode" class="hsel" title="참고만 하기: 방향만 참고하고 전혀 다른 단어로도 찾아요 · 이 결로 확장하기: 참고 키워드와 같은 결로 넓혀요"><option value="ref">참고만 하기</option><option value="expand">이 결로 확장하기</option></select>
              </div>
              <textarea id="aiExamples" class="inp" rows="2" placeholder="예: 카카오페이카드발급, 카카오페이신용카드 (잘 되던 키워드 등)"></textarea>
              <div class="grid g2 pn-grid" style="gap:10px;margin-top:10px">
                <div><label class="muted pn-l pos">포함할 것 · Positive <span class="muted">(선택)</span></label>
                  <textarea id="aiPos" class="inp" rows="3" placeholder="꼭 다뤄야 할 방향·단어·대상 (쉼표나 줄바꿈)&#10;예: 발급 혜택, 캐시백, 실물카드, 사회초년생"></textarea></div>
                <div><label class="muted pn-l neg">제외할 것 · Negative <span class="muted">(선택)</span></label>
                  <textarea id="aiNeg" class="inp" rows="3" placeholder="빼야 할 단어·방향 (쉼표나 줄바꿈)&#10;예: 해지, 분실, 삼성카드, 고객센터, 기존 회원 대상"></textarea></div>
              </div>
              <div class="muted" style="font-size:11px;margin-top:4px">Negative에 쓴 짧은 단어(띄어쓰기 없는 15자 이하)는 AI 판단과 상관없이 결과에서 바로 빼요. 문장으로 쓴 것은 AI가 판단해요.</div>
              <div class="ban-row" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:12.5px">
                <span class="muted">금지 키워드 자동 제외</span>
                <label class="inl"><input type="checkbox" class="sw" id="aiBanN"> 네이버 <span class="muted" id="aiBanNc"></span></label>
                <label class="inl"><input type="checkbox" class="sw" id="aiBanG"> 구글 <span class="muted" id="aiBanGc"></span></label>
                <a href="#" class="ext" id="aiBanEdit">목록 편집 (설정)</a>
              </div>
              <div style="display:flex;gap:10px;margin-top:10px;align-items:end;flex-wrap:wrap">
                <div><label class="muted">개수</label><br><select id="aiCount" class="inp" style="width:110px">${[30, 50, 80, 100, 150].map((n) => `<option>${n}</option>`).join('')}</select></div>
              </div>
              <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;align-items:baseline"><label class="muted">키워드 길이 (띄어쓰기 제외)</label><b id="aiLenTxt" style="font-size:13px"></b></div>
                <div class="dual" id="aiLen">
                  <div class="track"></div><div class="fill" id="aiLenFill"></div>
                  <input type="range" id="aiLenMin" min="2" max="30" step="1" value="2" aria-label="최소 글자 수">
                  <input type="range" id="aiLenMax" min="2" max="30" step="1" value="30" aria-label="최대 글자 수">
                </div>
                <div class="gscale"><span>2자</span><span>30자</span></div>
              </div>
              <label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="aiSendExisting"> 기존 키워드도 AI에 보내 처음부터 피하게 하기 (②에서 켜 둔 목록, 최대 2,000개)</label>
              <div class="av-row"><label class="muted" style="display:flex;gap:6px;align-items:center" title="생성이 끝나면 새로 들어온 키워드를 바로 이 탭의 주제·예시·요청 사항과 최소 월간 검색량으로 한 번 판정해요 (AI를 한 번 더 써요)"><input type="checkbox" id="aiAutoVerify"> 생성하면서 조건 재검증까지 하기 (진행은 막대 하나로)</label><label class="av-mv muted" title="이 값보다 월간 검색량(PC+Mobile)이 적으면 부적합으로 처리해요. 0이면 검색량 기준 없이 AI 판단만 써요. 아래 결과의 '최소 월간 검색량'과 같은 값이에요.">최소 월간 검색량 <input type="number" id="aiMinVol2" min="0" step="10"></label></div>
              <label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:6px" title="AI가 브리프에서 뽑은 씨앗 단어마다 네이버 키워드 도구·자동완성·관련 검색어를 조회해 실제 검색 데이터를 모으고, AI가 그 안에서 고르고 빈 각도를 채워요"><input type="checkbox" id="aiSeed"> 네이버 실제 검색 데이터로 서칭하기 (키워드 도구 · 자동완성 · 관련 검색어)</label>
              <label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:6px" title="웹 검색이 되는 로그인형 AI(Claude 또는 GPT)가 브리프 주제를 먼저 조사해요: 공식 페이지·이벤트 조건, 후기·커뮤니티 표현, 경쟁 광고 문구. 그 결과로 씨앗 단어를 정해요. 1~3분 더 걸리고 구독 사용량을 더 써요"><input type="checkbox" id="aiWeb"> AI가 웹을 먼저 조사하기 (1~3분 더)<span id="aiWebWho" style="font-size:12px"></span></label>
              <div id="aiModel" class="ai-model-row"></div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn pri" id="aiGen">키워드 생성</button>
                <button class="btn" id="aiMore">이어서 더 생성</button>
                <button class="btn hidden" id="aiStop">중지</button>
                <span class="muted" id="aiMsg" style="align-self:center"></span>
              </div>
              ${progHTML('aiProg')}
              <details class="ai-plan hidden" id="aiPlan" open><summary>AI 탐색 계획</summary><div id="aiPlanBody"></div></details>
            </div>
            <div class="card"><h3>② 기존 키워드 (중복 검사용) <span class="muted" id="exCount"></span></h3>
              <div class="drop" id="aiDrop">엑셀(xlsx), CSV, 메모장(txt) 파일을 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" id="aiFile" accept=".xlsx,.xlsm,.csv,.txt,.tsv,.xls" multiple hidden></label><div class="muted" style="margin-top:4px">파일은 이 PC 안에서만 읽어요</div></div>
              <div id="aiPick"></div>
              <div style="margin-top:10px">
                <label class="muted" style="font-size:12px">직접 붙여넣기</label>
                <textarea id="aiPaste" class="inp" rows="3" placeholder="키워드를 줄바꿈이나 쉼표로 구분해서 붙여넣기" style="margin-top:4px"></textarea>
                <div style="display:flex;gap:6px;margin-top:6px">
                  <input id="aiPasteName" class="inp" placeholder="목록 이름 (비우면 '붙여넣기 + 시각')" maxlength="80" style="flex:1">
                  <button class="btn" id="aiPasteAdd">목록에 추가</button>
                </div>
              </div>
              <div id="aiSources" style="margin-top:10px"></div>
            </div>
          </div>
        </div>
        <div class="sec"><h2>결과 <span class="muted" style="font-size:13px;font-weight:500" id="aiSummary"></span></h2>
          <div class="card">
            <div class="verify-bar vb-first">
              <button class="btn pri" id="aiVerify">조건 재검증 (AI)</button>
              <button class="btn hidden" id="aiVStop">중지</button>
              <label class="mv" title="이 값보다 월간 검색량(PC+Mobile)이 적으면 부적합으로 처리해요. 0이면 검색량 기준 없이 AI 판단만 써요.">최소 월간 검색량 <input type="number" id="aiMinVol" min="0" step="10"></label>
              <button class="btn" id="aiVReset">검증 기록 지우기</button>
              <span class="muted" id="aiVMsg" style="flex-basis:100%">체크한 키워드만, 체크가 없으면 전체를 이 탭의 주제·예시·요청 사항과 월간 검색량으로 다시 판정해요. 여러 번 눌러 판정이 계속 같으면 "일관 적합"이 돼요.</span>
              <div style="flex-basis:100%">${progHTML('aiVProg')}</div>
            </div>
            <div class="frow"><span class="flabel">중복 검사</span><div class="chips" id="aiFilters"></div></div>
            <div class="frow"><span class="flabel">조건 검증</span><div class="chips" id="aiVFilters"></div></div>
              <div id="aiFbar" style="margin-top:8px"></div>
            <div class="toolbar" style="margin-top:10px">
              <input id="aiManual" placeholder="후보 직접 추가 (쉼표로 구분)" style="flex:1;min-width:180px">
              <button class="btn" id="aiManualAdd">추가</button>
              <span style="flex:1"></span>
              <button class="btn hidden" id="aiDel">선택 삭제</button>
              <button class="btn" id="aiClear">결과 비우기</button>
              <button class="btn pri" id="aiXlsx">엑셀 다운로드</button>
              <button class="btn" id="aiTxt" title="지금 필터에 맞는 키워드만, 한 줄에 하나씩">TXT</button>
            </div>
            <div class="tbl-wrap" style="max-height:680px"><table class="rel" id="aiTbl"></table></div>
            <div class="act-bar" id="aiActBar">
              <span class="act-cnt" id="aiActCnt">체크한 키워드 없음</span>
              <button class="btn act-ic" id="aiFp" type="button" title="집중 피킹 (↑↓ 이동 · Space 체크/해제 · Esc 끝내기)" aria-label="집중 피킹"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"/></svg></button>
              <span class="act-sep"></span>
              <button class="btn" id="aiMixBtn" title="AI 판정이 엇갈린 키워드를 적합/부적합/보류로 직접 정해요">엇갈림 정리</button>
              <button class="btn act-bad" id="aiSelBad" title="한 번도 적합 판정을 못 받은 키워드를 모두 체크해요">부적합 선택</button>
              <span class="act-sep"></span>
              <button class="btn act-ok" id="aiOkSel" title="체크한 키워드를 '적합 (직접)'으로 확정해요. 다음 재검증에서 빠지고, AI에게 예시로 전달돼요.">체크한 키워드 적합으로</button>
              <button class="btn" id="aiRejSel" title="체크한 키워드를 결과에서 빼고 이 탭의 제외 목록에 넣어요. 다음 생성부터 다시 나오지 않아요.">체크한 키워드 제외</button>
              <button class="btn act-del" id="aiDel2">체크한 키워드 삭제</button>
            </div>
            <details class="rej" id="aiRejBox"><summary id="aiRejSum"></summary><div id="aiRej"></div></details>
            <div class="muted" style="margin-top:8px;line-height:1.7">
              <b>중복</b>: 띄어쓰기·대소문자·기호만 다르거나 어순만 다른 경우 &nbsp;|&nbsp; <b>유사</b>: 기존 키워드를 포함하거나, 포함되거나, 1글자만 다른 경우 &nbsp;|&nbsp;
              <b>의미 중복</b>: AI가 검색 의도가 같다고 판단한 경우 &nbsp;|&nbsp; <b>조건 검증</b>: 점 하나가 재검증 1회 (초록 적합, 빨강 부적합). 글자 수 범위는 PC에서 따로 확인해요. 키워드를 누르면 분석기에서 바로 분석해요.
            </div>
          </div>
        </div>
      </main>
     </div>
     <div class="ctx hidden" id="aiCtx"></div>`;
    document.body.insertBefore(view, $('#modalBg'));

    $('#aiLenMin').oninput = () => lenUI('min');
    $('#aiLenMax').oninput = () => lenUI('max');
    $('#aiLenMin').onchange = $('#aiLenMax').onchange = () => save();
    // 적는 즉시 저장 (입력을 멈추고 0.5초 뒤) + 칸을 벗어날 때 + 창을 닫거나 새로고침할 때
    let typeT = null;
    const saveSoon = () => { clearTimeout(typeT); typeT = setTimeout(save, 500); };
    const saveNow = () => { clearTimeout(typeT); save(); };
    ['aiTopic', 'aiExamples', 'aiCount', 'aiRefMode', 'aiPos', 'aiNeg', 'aiMinVol', 'aiBanN', 'aiBanG'].forEach((id) => { $('#' + id).addEventListener('input', saveSoon); $('#' + id).onchange = saveNow; });
    addEventListener('pagehide', saveNow);
    addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    $('#aiGen').onclick = () => generate(false);
    $('#aiMore').onclick = () => generate(true);
    $('#aiFile').onchange = (e) => handleFiles([...e.target.files]);
    const drop = $('#aiDrop');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); };
    $('#aiPasteAdd').onclick = () => {
      const ks = splitList($('#aiPaste').value);
      if (!ks.length) return;
      const nm = $('#aiPasteName').value.trim().slice(0, 80);
      addSource(nm || '붙여넣기 ' + new Date().toLocaleTimeString('ko-KR'), ks);
      $('#aiPaste').value = ''; $('#aiPasteName').value = '';
      toast(`'${nm || '붙여넣기'}' 목록에 ${ks.length.toLocaleString('ko-KR')}개를 추가했어요`, 'ok');
    };
    $('#aiManualAdd').onclick = async () => {
      const ks = splitList($('#aiManual').value);
      const r = addItems(ks.map((k) => ({ keyword: k, intent: '', reason: '', source: '직접' })));
      $('#aiManual').value = '';
      msg(`${r.added}개 추가${r.dropped ? `, 결과 안에서 겹친 ${r.dropped}개 제외` : ''}`);
      if (AI.hasAd && r.keys.length) await attachVolumes(r.keys);
    };
    $('#aiVerify').onclick = verify;
    $('#aiVReset').onclick = async () => { if (await uiConfirm('이 탭의 재검증 기록과 직접 판정을 모두 지울까요?')) { AI.items.forEach((it) => { delete it.checks; delete it.decision; }); save(); draw(); } };
    $('#aiMixBtn').onclick = () => openMixed(false);
    $('#aiDel').onclick = async () => {
      const selItems = AI.items.filter((it) => it._sel);
      const n = selItems.length;
      if (!n) return alert('삭제할 키워드를 먼저 체크하세요.');
      const nBad = selItems.filter(isBad).length;
      if (!await uiConfirm(`체크한 키워드 ${n}개를 삭제할까요?${nBad ? `\n그중 부적합 ${nBad}개는 이 탭의 제외 목록에 저장돼서 다시 생성되지 않아요.` : ''}`)) return;
      rejectItems(selItems);
      AI.items = AI.items.filter((it) => !it._sel);
      if (AI.vfilter !== '전체' && !viewRows().length) AI.vfilter = '전체';
      save(); draw();
      vmsg(`${n}개를 삭제했어요.${nBad ? ` 부적합 ${nBad}개는 제외 목록에 저장했어요.` : ''}`);
    };
    $('#aiSelBad').onclick = selectBad;
    $('#aiOkSel').onclick = () => {
      const sel = AI.items.filter((it) => it._sel);
      if (!sel.length) return toast('적합으로 바꿀 키워드를 먼저 체크하세요.', 'warn');
      for (const it of sel) { it.decision = { pass: true, reason: '직접 적합', at: Date.now() }; it._sel = false; }
      save(); draw();
      toast(`${sel.length}개를 '적합 (직접)'으로 바꿨어요`, 'ok');
    };
    $('#aiFp').onclick = () => { const FP = window.FocusPick; if (!FP) return; if (FP.on) FP.stop(); else FP.start($('#aiTbl')); };
    $('#aiDel2').onclick = () => $('#aiDel').click();
    $('#aiRejSel').onclick = rejectChecked;
    $('#aiMinVol').addEventListener('change', () => save());
    // 위(생성하면서 재검증) · 아래(결과의 조건 재검증) 최소 월간 검색량 연동
    const mvA = $('#aiMinVol'), mvB = $('#aiMinVol2');
    mvB.addEventListener('input', () => { mvA.value = mvB.value; mvA.dispatchEvent(new Event('input', { bubbles: true })); });
    mvB.addEventListener('change', () => { mvA.value = mvB.value; mvA.dispatchEvent(new Event('change', { bubbles: true })); });
    mvA.addEventListener('input', () => { mvB.value = mvA.value; });
    mvA.addEventListener('change', () => { mvB.value = mvA.value; });
    const avDim = () => mvB.closest('.av-mv').classList.toggle('off', !$('#aiAutoVerify').checked);
    $('#aiAutoVerify').addEventListener('change', avDim); setTimeout(avDim);
    // 기존 키워드를 Gemini에 보내기: 기본 켜짐, 마지막 선택을 기억
    AI.fb = FilterBar($('#aiFbar'), { ranges: [['total', '월간 검색량'], ['pc', 'PC 검색량'], ['mo', '모바일 검색량'], ['len', '글자 수']], main: ['total', 'len'], onChange: () => draw() });
    const se = $('#aiSendExisting');
    se.checked = localStorage.getItem('aiSendExisting') !== '0';
    se.onchange = () => localStorage.setItem('aiSendExisting', se.checked ? '1' : '0');
    $('#aiClear').onclick = async () => {
      const nBad = AI.items.filter(isBad).length;
      if (!await uiConfirm(`이 탭의 결과를 모두 지울까요? (기존 키워드 목록은 그대로)${nBad ? `\n부적합 ${nBad}개는 제외 목록에 남아서 다시 생성되지 않아요.` : ''}`)) return;
      rejectItems(AI.items);
      AI.items = []; save(); draw();
    };
    // 키워드 도구로 시작: 기본 켜짐, 결과에 넣을 연관 키워드 수 기본 30개 (마지막 선택 기억)
    $('#aiSeed').checked = localStorage.getItem('aiSeed') !== '0';
    $('#aiSeed').onchange = (e) => localStorage.setItem('aiSeed', e.target.checked ? '1' : '0');
    $('#aiWeb').checked = localStorage.getItem('aiWeb') !== '0';
    $('#aiWeb').onchange = (e) => localStorage.setItem('aiWeb', e.target.checked ? '1' : '0');
    // 웹 조사 AI: 자동 (지금 고른 AI가 Claude·GPT면 그것, 아니면 Claude → GPT)
    const fillWebProv = () => fetch('/api/ai/web-info').then((x) => x.json()).then((j) => {
      const w = $('#aiWebWho'); if (w) w.textContent = j.name ? ` · 조사: ${j.name}` : ' · 웹 조사 되는 AI(Claude·GPT 로그인형) 없음';
      if (!j.name) { $('#aiWeb').checked = false; $('#aiWeb').disabled = true; }
    }).catch(() => {});
    fillWebProv();
    window.__fillWebProv = fillWebProv; // AI를 바꾸면 '자동'이 누구인지 다시 표시 (refreshModel에서 부름)
    // 생성하면서 조건 재검증까지: 기본 켜짐, 마지막 선택을 기억
    $('#aiAutoVerify').checked = localStorage.getItem('aiAutoVerify') !== '0';
    $('#aiAutoVerify').onchange = (e) => localStorage.setItem('aiAutoVerify', e.target.checked ? '1' : '0');
    $('#aiXlsx').onclick = exportXlsx;
    $('#aiTxt').onclick = () => {
      if (!AI.items.length) return alert('내보낼 결과가 없어요');
      const name = (AI.cur.name || 'AI키워드').replace(/[\\/:*?"<>|]/g, '').slice(0, 30);
      const tag = [AI.filter, AI.vfilter].filter((x) => x !== '전체').join('_');
      downloadTxt(viewRows().map((it) => it.keyword), `${name}_${tag ? tag + '_' : ''}${new Date().toISOString().slice(0, 10)}`);
    };

    // 우클릭 메뉴 닫기
    document.addEventListener('click', (e) => { if (!e.target.closest('#aiCtx')) $('#aiCtx').classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#aiCtx').classList.add('hidden'); });
    window.addEventListener('scroll', () => $('#aiCtx').classList.add('hidden'), true);

    // 헤더 버튼
    const btn = document.createElement('button');
    btn.className = 'ghost'; btn.id = 'aiBtn'; btn.textContent = 'AI 키워드 생성기';
    btn.onclick = () => showAI($('#aiView').classList.contains('hidden'));
    $('.top-actions').prepend(btn);

    load();
    openTab(newDraft()); // 들어올 때는 항상 새 탭
    drawSources();
    loadSources();
    refreshModel();
    if (location.hash === '#ai') showAI(true);
  }

  function lenUI(moved) {
    let a = +$('#aiLenMin').value, b = +$('#aiLenMax').value;
    if (a > b) { if (moved === 'min') $('#aiLenMax').value = b = a; else $('#aiLenMin').value = a = b; }
    const pct = (v) => ((v - 2) / 28) * 100;
    $('#aiLenFill').style.left = pct(a) + '%';
    $('#aiLenFill').style.width = pct(b) - pct(a) + '%';
    $('#aiLenTxt').textContent = a === 2 && b === 30 ? '제한 없음 (2~30자)' : a === b ? `${a}자만` : `${a} ~ ${b}자`;
    $('#aiLenMin').style.zIndex = a >= 29 ? 3 : 2;
  }

  function fillForm(f) {
    f = { ...DEFAULT_FORM, ...f };
    $('#aiTopic').value = f.topic;
    $('#aiExamples').value = f.examples;
    $('#aiCount').value = String(f.count);
    $('#aiRefMode').value = f.refMode === 'expand' ? 'expand' : 'ref';
    $('#aiPos').value = f.pos || '';
    $('#aiNeg').value = f.neg || '';
    { const B = window.SETTINGS?.rules?.banned || {}; $('#aiBanN').checked = f.banN ?? B.naverOn !== false; $('#aiBanG').checked = f.banG ?? B.googleOn !== false; banCount(); }
    $('#aiLenMin').value = f.minLen;
    $('#aiLenMax').value = f.maxLen;
    $('#aiMinVol').value = f.minVol; $('#aiMinVol2').value = f.minVol;
    lenUI();
  }
  // 설정의 금지 키워드 (켠 것만)
  function bannedList(f) {
    const B = window.SETTINGS?.rules?.banned || {};
    const on = (v, d) => (v ?? d !== false);
    return [...new Set([...(on(f?.banN, B.naverOn) ? splitList(B.naver || '') : []), ...(on(f?.banG, B.googleOn) ? splitList(B.google || '') : [])].map((x) => x.trim()).filter(Boolean))];
  }
  const isQuoted = (w) => /^["“”'‘’].+["“”'‘’]$/.test(w);
  const unQ = (w) => (isQuoted(w) ? w.slice(1, -1).trim() : w);
  // AI에 보내는 Negative = 직접 쓴 것 + 금지 키워드 (AI 지시가 너무 길어지지 않게 금지 키워드는 300개까지)
  const negAll = (f) => [...splitList(f.neg), ...bannedList(f).map(unQ).slice(0, 300)];
  function banCount() {
    const B = window.SETTINGS?.rules?.banned || {};
    const c = (t) => splitList(t || '').length;
    const n = c(B.naver), g = c(B.google);
    $('#aiBanNc').textContent = n ? n.toLocaleString('ko-KR') + '개' : '(비어 있음)';
    $('#aiBanGc').textContent = g ? g.toLocaleString('ko-KR') + '개' : '(비어 있음)';
  }
  window.__AI_banCount = () => { try { banCount(); } catch {} };
  function readForm() {
    return { topic: $('#aiTopic').value, examples: $('#aiExamples').value, count: $('#aiCount').value, extra: '', refMode: $('#aiRefMode').value, pos: $('#aiPos').value, neg: $('#aiNeg').value, banN: $('#aiBanN').checked, banG: $('#aiBanG').checked, minLen: +$('#aiLenMin').value, maxLen: +$('#aiLenMax').value, minVol: Math.max(0, Math.round(+$('#aiMinVol').value || 0)) };
  }

  // ---------------------------------------------------------------- 탭 (왼쪽 사이드바)
  function openTab(s) {
    AI.cur = s;
    AI.filter = '전체'; AI.vfilter = '전체'; AI.sort = { key: '', dir: 1 }; AI.fb?.reset();
    fillForm(s.form);
    drawPlan();
    $('#aiMsg').textContent = '';
    $('#aiProg').classList.add('hidden');
    $('#aiVProg').classList.add('hidden');
    recheckAll();
    draw();
    drawSide();
    if ($('#aiSources')) drawSources();
  }
  function guardBusy() {
    if (AI.busy) { alert(`${AI.busy} 중에는 탭을 바꿀 수 없어요. 끝나거나 중지한 뒤에 바꿔 주세요.`); return true; }
    return false;
  }
  function drawSide() {
    const side = $('#aiSide');
    if (!side) return;
    const fmtD = (t) => { const d = new Date(t); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : `${d.getMonth() + 1}.${d.getDate()}`; };
    const item = (s) => `<div class="sit ${AI.cur === s ? 'on' : ''}" data-sid="${s.id}" title="${esc(s.name)} (우클릭: 고정·이름 변경·삭제)">
        <div class="sn">${s.pinned ? PIN : ''}<span>${esc(s.name)}</span></div>
        <div class="sm">${s.draft ? '작성 중' : `키워드 ${s.items.length}개 · ${fmtD(s.updatedAt)}`}</div></div>`;
    const pinned = AI.sessions.filter((s) => s.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const recent = AI.sessions.filter((s) => !s.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    side.innerHTML = `<button class="btn pri newbtn" id="sideNew">+ 새 탭</button>
      ${AI.cur?.draft ? item(AI.cur) : ''}
      ${pinned.length ? `<div class="side-h">고정됨</div>${pinned.map(item).join('')}` : ''}
      <div class="side-h">기록</div>
      ${recent.map(item).join('') || '<div class="muted" style="padding:6px 10px;font-size:12px">키워드를 생성하면 주제별로 여기 쌓여요</div>'}`;
    $('#sideNew').onclick = () => { if (guardBusy()) return; openTab(newDraft()); $('#aiTopic').focus(); };
    // 초기화: 작성하던 게 있으면 탭으로 저장하고 빈 새 탭
    window.__RESET_ai = () => {
      if (guardBusy()) return null;
      const c = AI.cur;
      save(); // 입력 칸 내용을 탭에 반영 (작성 중이면 기록으로 올라감)
      const f = c?.form || {}, had = !!c && (hasContent(c) || [f.topic, f.examples, f.pos, f.neg].some((x) => String(x || '').trim()));
      openTab(newDraft()); scrollTo(0, 0);
      return had ? `작성하던 내용은 '${c.name}' 탭에 저장해 두고 초기화했어요 (왼쪽 기록)` : '초기화했어요';
    };
    $$('.sit', side).forEach((el) => {
      const s = el.dataset.sid === AI.cur?.id ? AI.cur : AI.sessions.find((x) => x.id === el.dataset.sid);
      el.onclick = () => { if (s === AI.cur || guardBusy()) return; openTab(s); };
      el.oncontextmenu = (e) => { e.preventDefault(); if (!s.draft) showCtx(e, s); };
    });
  }
  function showCtx(e, s) {
    const m = $('#aiCtx');
    m.innerHTML = `<button data-a="pin">${s.pinned ? '고정 해제' : '상단에 고정'}</button><button data-a="rename">이름 변경</button><button data-a="del" class="danger">삭제</button>`;
    m.classList.remove('hidden');
    m.style.left = Math.min(e.clientX, innerWidth - 170) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - 130) + 'px';
    $$('button', m).forEach((b) => (b.onclick = async () => {
      m.classList.add('hidden');
      if (b.dataset.a === 'pin') { s.pinned = !s.pinned; persist(); drawSide(); }
      if (b.dataset.a === 'rename') rename(s);
      if (b.dataset.a === 'del') {
        if (!await uiConfirm(`'${s.name}' 탭을 삭제할까요? 생성된 키워드 ${s.items.length}개도 같이 지워져요.`)) return;
        if (s === AI.cur && guardBusy()) return;
        AI.sessions = AI.sessions.filter((x) => x !== s);
        persist();
        if (s === AI.cur) openTab(newDraft()); else drawSide();
      }
    }));
  }
  function rename(s) {
    const el = $(`.sit[data-sid="${s.id}"] .sn span`);
    if (!el) return;
    const inp = document.createElement('input');
    inp.value = s.name;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (ok && v) { s.name = v.slice(0, 40); s.custom = true; persist(); }
      drawSide();
      if (s === AI.cur) $('#aiTabName').textContent = '';
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    inp.onblur = () => finish(true);
    inp.onclick = (e) => e.stopPropagation();
  }

  function showAI(on) {
    if (on) { window.__hideDup?.(); window.__hideBulk?.(); }
    $('#aiView').classList.toggle('hidden', !on);
    $('#main').classList.toggle('hidden', on);
    $('#banners').classList.toggle('hidden', on);
    $('#tabs').classList.toggle('hidden', on || !STATE);
    $('#aiBtn').textContent = on ? '← 키워드 분석' : 'AI 키워드 생성기';
    if (on) { history.replaceState(null, '', location.pathname + location.search + '#ai'); refreshModel(); }
    else history.replaceState(null, '', location.pathname + location.search);
  }
  window.showAI = showAI;

  async function refreshModel() {
    try {
      const c = await (await fetch('/api/config')).json();
      applyCfg(c);
      const p = AICFG.provider;
      AI.aiName = PROV[p].name;
      $('#aiModel').innerHTML = `AI <select id="aiProvSel" class="prov-sel hsel"></select> 모델 <select id="aiModelSel" class="model-sel hsel"></select>
        <label class="pin-tg" title="켜면 선택한 모델로만 돌려요. 바쁘면 약 70초 동안 5번 재시도하고, 그래도 안 되면 멈춰요. 끄면(기본) 바쁜 동안 같은 AI의 다른 모델로 자동 전환해요."><input type="checkbox" class="pin-cb" id="aiPin" ${c.geminiPin ? 'checked' : ''}> <span>모델 고정</span></label>
        <span id="aiModelOk" class="muted"></span>
        ${c.hasAI ? '' : `<span style="color:#b45309">${PROV[p].name} ${PROV[p].cli ? '설치·로그인 필요' : 'API 키 미설정'}</span> <a class="ext" href="#" onclick="openSettings('ai');return false">설정하기</a>`}${PROV[p].cli ? '<span class="muted" style="font-size:12px"> · 로그인형은 한 번에 20초~3분 걸려요 (모델에 따라 다름)</span>' : ''}`;
      fillProviderSelect($('#aiProvSel'));
      const sel = $('#aiModelSel');
      fillModelSelect(sel, AICFG.models[p]);
      $('#aiProvSel').onchange = (e) => setProvider(e.target.value);
      window.__fillWebProv?.();
      sel.onchange = async () => { await setModel(sel.value); $('#aiModelOk').textContent = '적용됨'; setTimeout(() => ($('#aiModelOk').textContent = ''), 1500); };
      $('#aiPin').onchange = async (e) => { await setPin(e.target.checked); $('#aiModelOk').textContent = e.target.checked ? '선택한 모델로만 돌려요' : '바쁘면 다른 모델로 자동 전환해요'; setTimeout(() => ($('#aiModelOk').textContent = ''), 2500); };
      if (c.hasAI && !MODEL_LISTS[p]) loadModels(false, p).then(() => fillModelSelect(sel, AICFG.models[p])).catch(() => {});
      $$('.ai-name').forEach((el) => (el.textContent = AI.aiName));
      AI.hasAd = !!c.hasAd;
      draw();
    } catch {}
  }

  const splitList = (s) => [...new Set(String(s || '').split(/[\n,\t]+/).map((x) => x.trim()).filter(Boolean))];
  const msg = (t, err) => { $('#aiMsg').innerHTML = err ? `<span style="color:#b91c1c">${esc(t)}</span>` : esc(t); };
  const vmsg = (t, err) => { $('#aiVMsg').innerHTML = err ? `<span style="color:#b91c1c">${esc(t)}</span>` : esc(t); };

  // ---------------------------------------------------------------- 생성
  function addItems(list) {
    const have = new Map(AI.items.map((it) => [norm(it.keyword), it]));
    const haveSorted = new Set(AI.items.map((it) => sortKey(norm(it.keyword))));
    let added = 0, dropped = 0;
    const keys = [];
    for (const x0 of list) {
      const x = { ...x0, keyword: RULES().generate?.noSpace === false ? String(x0.keyword || '').trim().replace(/\s+/g, ' ') : String(x0.keyword || '').replace(/\s+/g, '') }; // 설정에 따라 붙여서
      const n = norm(x.keyword);
      if (!n || have.has(n)) { dropped++; continue; }
      const sk = sortKey(n);
      if (haveSorted.has(sk) && AI.items.some((it) => { const m = norm(it.keyword); return m.length === n.length && (m + m).includes(n); })) { dropped++; continue; }
      const it = { ...x, ...checkOne(x.keyword, IDX), vol: x.vol || null, sem: null, checks: [] }; // 키워드 도구에서 온 것은 검색량을 이미 가짐
      AI.items.push(it);
      have.set(n, it); haveSorted.add(sk);
      keys.push(it.keyword);
      added++;
    }
    save(); draw();
    return { added, dropped, keys };
  }

  // 서버의 SSE 스트림을 읽어 이벤트마다 onEvent 호출, 'done' 이벤트를 반환
  async function streamPost(url, body, onEvent, signal, holder) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('event-stream')) { const j = await res.json(); if (j.error) throw new Error(j.error); return j; }
    const reader = res.body.getReader();
    if (holder) holder.reader = reader;
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === 'error') throw new Error(ev.message);
        if (ev.type === 'done') return ev;
        onEvent(ev);
      }
    }
    throw new Error('서버 연결이 끊겼어요');
  }

  const postJson = async (url, body, signal) => { const j = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })).json(); if (j.error) throw new Error(j.error); return j; };
  function drawPlan() {
    const p = AI.cur?.plan, box = $('#aiPlan');
    if (!box) return;
    box.classList.toggle('hidden', !p);
    if (!p) return;
    $('#aiPlanBody').innerHTML = `<div><b>검색 의도</b> ${esc(p.intent || '-')}</div>${p.audience ? `<div><b>타깃</b> ${esc(p.audience)}</div>` : ''}
      <div><b>각도</b> ${(p.angles || []).map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')}</div>
      <div><b>씨앗 단어</b> ${(p.seeds || []).map(esc).join(', ')}</div>${(p.avoid || []).length ? `<div><b>피할 것</b> ${p.avoid.map(esc).join(', ')}</div>` : ''}
      ${(p.webFindings || []).length ? `<div><b>웹 조사</b> <span class="muted">${esc(p.webBy || '')}</span><ul style="margin:4px 0 0 18px;padding:0">${p.webFindings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${(p.webSources || []).length ? `<div class="muted" style="font-size:12px">출처: ${p.webSources.map((u, i) => `<a class="ext" target="_blank" rel="noopener" href="${esc(u)}">${i + 1}</a>`).join(' ')}</div>` : ''}</div>` : ''}
      ${p.data ? `<div class="muted">실제 검색 데이터: 키워드 도구 ${p.data.kt.toLocaleString('ko-KR')}개 · 자동완성·관련 검색어 ${p.data.sug.toLocaleString('ko-KR')}개를 모아 AI에 보여줌</div>` : ''}`;
  }
  // 생성: ① AI가 브리프 해석(탐색 계획·씨앗 단어) → ② 분석기가 씨앗으로 네이버 실제 검색 데이터 서칭 → ③ AI가 그 안에서 고르고 빈 각도 채움 → 검색량 → 재검증
  async function generate(more) {
    const form = readForm();
    const refs = splitList(form.examples);
    const refMode = form.refMode === 'expand' ? 'expand' : 'ref';
    if (!form.topic.trim() && !refs.length) return msg('브리프를 넣어주세요', true);
    if (!more && AI.items.length && !await uiConfirm('이 탭의 결과를 지우고 새로 생성할까요? (이어서 받으려면 "이어서 더 생성", 다른 주제면 왼쪽 "+ 새 탭")')) return;
    if (!more) { rejectItems(AI.items); AI.items = []; }
    const avoid = [...refs, ...AI.items.map((it) => it.keyword)];
    const rejected = (AI.cur.rejected || []).slice(-150);
    const existing = $('#aiSendExisting').checked ? pickExisting(form.topic, refs, 2000) : [];
    const b1 = $('#aiGen'), b2 = $('#aiMore'), stop = $('#aiStop');
    b1.disabled = b2.disabled = true;
    stop.classList.remove('hidden');
    msg('');
    AI.busy = '키워드 생성';
    save();
    const auto = $('#aiAutoVerify').checked;
    const useData = $('#aiSeed').checked;
    const useWeb = $('#aiWeb').checked && !$('#aiWeb').disabled;
    const P = progress($('#aiProg'), Number(form.count), '키워드 작성 중');
    const ctrl = new AbortController();
    const holder = {};
    let stopped = false;
    stop.onclick = () => { stopped = true; ctrl.abort(); holder.reader?.cancel().catch(() => {}); };
    const isAbort = (e) => stopped || e.name === 'AbortError';
    try {
      // ① 브리프 해석 ("이어서 더 생성"은 이미 세운 계획을 다시 씀)
      let plan = more && AI.cur.plan ? AI.cur.plan : null, planFail = '', web = null, webFail = '';
      // ⓪ 웹 조사 (선택)
      if (!plan && useWeb) {
        P.stage(0, 16, 1, '웹 조사');
        P.phase('AI가 웹에서 브리프 주제를 조사하는 중 (1~3분)', 20);
        try { web = await postJson('/api/ai/web-research', { brief: form.topic, refs, pos: splitList(form.pos), neg: negAll(form), webProvider: '' }, ctrl.signal); }
        catch (e) { if (isAbort(e)) throw e; webFail = e.message; }
      }
      if (!plan) {
        P.stage(useWeb ? 16 : 0, useWeb ? 22 : 10, 1, '브리프 해석');
        P.phase('AI가 브리프를 읽고 탐색 계획을 세우는 중', 30);
        try {
          plan = await postJson('/api/ai/plan', { brief: form.topic, refs, refMode, pos: splitList(form.pos), neg: negAll(form), web: web ? { findings: web.findings, terms: web.terms } : null }, ctrl.signal);
          if (web) Object.assign(plan, { webFindings: web.findings, webSources: web.sources, webBy: web.by, webTerms: web.terms });
          AI.cur.plan = plan; save(); drawPlan();
        } catch (e) { if (isAbort(e)) throw e; planFail = e.message; }
      }
      // ② 실제 검색 데이터 서칭
      let data = null, dataFail = '';
      if (useData) {
        P.stage(useWeb ? 22 : 10, useWeb ? 32 : 22, 1, '서칭');
        P.phase('씨앗 단어로 네이버 실제 검색 데이터 모으는 중 (키워드 도구 · 자동완성 · 관련 검색어)', 30);
        const words = plan?.seeds?.length ? [...new Set([...plan.seeds, ...(plan.webTerms || []).slice(0, 5)])].slice(0, 25) : [...new Set([...form.topic.split(/[\s,./]+/).filter((w) => w.length >= 2), ...refs])].slice(0, 15);
        try { data = await postJson('/api/ai/research', { seeds: words, refs }, ctrl.signal); if (plan) { plan.data = { kt: data.list.length, sug: data.suggest.length }; drawPlan(); } }
        catch (e) { if (isAbort(e)) throw e; dataFail = e.message; }
      }
      // ③ 발굴
      P.stage(useData ? (useWeb ? 32 : 22) : (useWeb ? 22 : 10), auto ? 60 : 100, Number(form.count), '키워드 작성 중');
      const j = await streamPost('/api/ai/generate-stream', { topic: form.topic, examples: refs, refMode, pos: splitList(form.pos), neg: negAll(form), plan: plan ? { intent: plan.intent, audience: plan.audience, angles: plan.angles, avoid: plan.avoid, web: plan.webFindings || [] } : null, count: Number(form.count), avoid, existing, rejected, minLen: form.minLen, maxLen: form.maxLen, seeds: (data?.list || []).slice(0, 300).map((x) => ({ keyword: x.keyword, total: x.total })), suggest: (data?.suggest || []).slice(0, 200).map((x) => ({ keyword: x.keyword, total: x.total })) }, (ev) => P.event(ev), ctrl.signal, holder);
      const exN = new Set(refs.map(norm));
      const inLen = j.items.filter((x) => { const L = charLen(x.keyword); return L >= form.minLen && L <= form.maxLen; });
      const outLen = j.items.length - inLen.length;
      const rejIdx = buildIndex((AI.cur.rejected || []).map((r) => r.keyword));
      const notRej = inLen.filter((x) => !isRejected(x.keyword, rejIdx));
      const rejN = inLen.length - notRej.length;
      // 기존 키워드(②)와 띄어쓰기·대소문자·기호만 다른 동일 키워드는 결과에 넣지 않음
      const notSame = notRej.filter((x) => !IDX.exact.has(norm(x.keyword)));
      const sameN = notRej.length - notSame.length;
      const negW = [...splitList(form.neg).map(norm).filter((w) => w && w.length <= 15 && !/\s/.test(w)), ...bannedList(form).filter((w) => !isQuoted(w)).map(norm).filter(Boolean)];
      const banExact = new Set(bannedList(form).filter(isQuoted).map((w) => norm(unQ(w))).filter(Boolean)); // "따옴표" = 정확히 같을 때만
      const notNeg = notSame.filter((x) => !banExact.has(norm(x.keyword)) && !negW.some((w) => norm(x.keyword).includes(w)));
      const negN = notSame.length - notNeg.length;
      const got = notNeg.filter((x) => !exN.has(norm(x.keyword)));
      // 실제 검색 데이터에 있던 키워드는 출처를 표시하고 검색량을 바로 붙임
      const dmap = new Map((data?.list || []).map((x) => [norm(x.keyword), x]));
      const smap = new Map((data?.suggest || []).map((x) => [norm(x.keyword), x]));
      const r = addItems(got.map((x) => { const dd = dmap.get(norm(x.keyword)); return dd ? { ...x, source: '검색데이터', vol: { pc: dd.pc, mo: dd.mo, total: dd.total, comp: dd.comp, pcLow: dd.pcLow, moLow: dd.moLow } } : smap.has(norm(x.keyword)) ? (() => { const sx = smap.get(norm(x.keyword)); return { ...x, source: '자동완성', vol: sx.total != null ? (sx.notFound ? { pc: 0, mo: 0, total: 0, comp: '-', notFound: true } : { pc: sx.pc, mo: sx.mo, total: sx.total, comp: sx.comp, pcLow: sx.pcLow, moLow: sx.moLow }) : null }; })() : { ...x, source: 'AI' }; }));
      const dupEx = notNeg.length - got.length + r.dropped;
      const fresh = new Set(r.keys);
      const nData = AI.items.filter((it) => fresh.has(it.keyword) && it.source === '검색데이터').length;
      const nSug = AI.items.filter((it) => fresh.has(it.keyword) && it.source === '자동완성').length;
      if (!auto) stop.classList.add('hidden');
      // 검색량: 아직 없는 것만
      let volFail = '';
      const needVol = AI.items.filter((it) => fresh.has(it.keyword) && !it.vol).map((it) => it.keyword);
      if (auto) P.stage(60, 72, needVol.length, '검색량 조회');
      if (AI.hasAd && needVol.length && !stopped) volFail = await attachVolumes(needVol, P);
      // 조건 재검증 (새로 들어온 키워드만)
      let vr = null;
      if (auto && r.keys.length && !stopped) {
        P.stage(72, 100, r.keys.length, '조건 재검증');
        AI.busy = '조건 재검증';
        vr = await verify({ items: AI.items.filter((it) => fresh.has(it.keyword)), P, stop });
      }
      P.finish(vr?.stopped ? '중지했어요' : `완료 · ${r.added}개 추가 (실제 검색 데이터 ${nData + nSug} · AI 새 표현 ${r.added - nData - nSug})${vr && !vr.error ? ` · 재검증 적합 ${vr.pass} · 부적합 ${vr.fail}` : ''}`, vr?.stopped ? 'stop' : undefined);
      const head = [webFail ? `웹 조사 실패(${webFail}) → 웹 없이 진행` : web ? `${web.by}가 웹 조사 (사실 ${web.findings.length}개 · 표현 ${web.terms.length}개)` : '', planFail ? `브리프 해석 실패(${planFail}) → 브리프 단어로 진행` : '', useData ? (dataFail ? `서칭 실패(${dataFail}) → AI만으로 생성` : data ? `씨앗 ${data.seeds.length}개로 실제 검색 데이터 ${(data.list.length + data.suggest.length).toLocaleString('ko-KR')}개를 모아 AI에 보여줌` : '') : ''].filter(Boolean).join(' · ');
      msg(`${head ? head + ' · ' : ''}AI ${j.items.length}개 받음 → ${r.added}개 추가 (실제 검색 데이터에 있던 것 ${nData + nSug}개)${outLen ? `, 글자 수 범위 밖 ${outLen}개 제외` : ''}${rejN ? `, 제외 목록과 같은 ${rejN}개 제외` : ''}${sameN ? `, 기존 키워드와 동일한 ${sameN}개 제외` : ''}${negN ? `, Negative 단어가 들어간 ${negN}개 제외` : ''}${dupEx ? `, 참고 키워드·결과와 겹친 ${dupEx}개 제외` : ''}${existing.length ? ` · 기존 키워드 ${existing.length.toLocaleString('ko-KR')}개를 AI에 알려줌` : ''}${j.fallback ? ` (선택한 모델이 바빠서 ${j.model}(으)로 대신 생성)` : ''}${volFail ? ` · 검색량 조회 실패: ${volFail}` : ''}${!AI.hasAd ? ' · 검색량은 검색광고 API 키를 넣으면 자동으로 붙어요' : ''}${vr ? (vr.error ? ` · 조건 재검증 실패: ${vr.error}` : vr.stopped ? ' · 조건 재검증은 중지했어요' : ` · 조건 재검증: 적합 ${vr.pass} · 부적합 ${vr.fail}`) : ''}`);
    } catch (e) {
      const aborted = isAbort(e);
      P.finish(aborted ? '중지했어요' : '실패', aborted ? 'stop' : 'fail');
      if (!aborted) msg(e.message, true);
    } finally { AI.busy = ''; b1.disabled = b2.disabled = false; stop.classList.add('hidden'); save(); }
  }

  // 진행률 막대 (생성 / 재검증 공용, 생각 과정 글은 표시하지 않음)
  function progress(root, total, label) {
    const q = (c) => root.querySelector(c);
    const bar = q('.p-bar');
    root.classList.remove('hidden', 'fail');
    let pct = 3, base = 0;
    let lo = 0, hi = 100; // 여러 단계를 막대 하나로: 이 단계가 막대의 lo~hi% 구간을 씀
    const t0 = Date.now();
    const set = (p, phase, indet) => {
      pct = Math.max(pct, p);
      const shown = lo + ((hi - lo) * pct) / 100;
      bar.style.width = shown + '%';
      bar.parentElement.classList.toggle('indet', !!indet);
      q('.p-pct').textContent = Math.round(shown) + '%';
      if (phase) q('.p-phase').textContent = phase;
    };
    const timer = setInterval(() => (q('.p-time').textContent = Math.round((Date.now() - t0) / 1000) + '초'), 500);
    q('.p-time').textContent = '0초';
    q('.p-model').textContent = '';
    set(3, '준비 중', true);
    return {
      // 다음 단계로: 막대의 lo~hi% 구간에서 다시 0부터 (생성 → 검색량 → 재검증을 막대 하나로)
      stage(l, h, t, lab) { lo = l; hi = h; pct = 0; base = 0; if (t) total = t; if (lab) label = lab; set(0); },
      setBase(b) { base = b; },
      event(ev) {
        if (ev.type === 'status') {
          const head = base ? `${base}/${total}개 완료 · ` : '';
          if (ev.phase === 'thinking') set(base ? pct : 10, head + ev.text, !base);
          else if (ev.phase === 'writing') set(base ? pct : 15, head + ev.text, false);
          else set(base ? pct : 5, head + ev.text, !base);
          q('.p-model').textContent = ev.model ? `사용 중: ${ev.model}` : '';
        }
        if (ev.type === 'thought' && !base) set(Math.min(14, pct + 0.5), null, true); // 생각 과정 글은 보여주지 않고 막대만 조금씩
        if (ev.type === 'progress') {
          const c = Math.min(total, base + ev.count);
          set(15 + 80 * (c / total), `${label} ${c} / ${total}개`, false);
        }
      },
      phase(text, p) { set(p ?? pct, text, false); },
      finish(text, mode) {
        clearInterval(timer);
        if (!mode) { lo = 0; hi = 100; pct = 0; set(100, `${text} · ${Math.round((Date.now() - t0) / 1000)}초`, false); }
        else { q('.p-phase').textContent = text; bar.parentElement.classList.remove('indet'); if (mode === 'fail') root.classList.add('fail'); }
      },
    };
  }

  // ---------------------------------------------------------------- 조건 재검증
  async function verify(opts = {}) {
    if (opts instanceof Event) opts = {}; // 버튼 클릭으로 불릴 때
    const inGen = !!opts.items; // 키워드 생성에 이어서 부른 경우
    if (!AI.items.length) return vmsg('검증할 키워드가 없어요', true);
    const sel = inGen ? [] : AI.items.filter((it) => it._sel);
    const targets = inGen ? opts.items : sel.length ? sel : AI.items.filter((it) => !it.decision);
    if (!targets.length) return vmsg('직접 판정한 키워드만 남았어요. 다시 판정하려면 체크해서 누르세요.', true);
    const form = readForm();
    const conditions = { topic: form.topic, examples: form.refMode === 'expand' ? splitList(form.examples) : [], extra: '', brief: true, pos: splitList(form.pos), neg: negAll(form), judged: MixedReview.judged(AI.items) };
    if (!conditions.topic.trim() && !conditions.examples.length && !conditions.extra.trim()) { vmsg('이 탭에 주제·예시·요청 사항이 없어서 판정 기준이 없어요', true); return { error: '판정 기준 없음' }; }
    const btn = $('#aiVerify'), stop = opts.stop || $('#aiVStop');
    btn.disabled = true;
    stop.classList.remove('hidden');
    AI.busy = '조건 재검증';
    const runNo = Math.max(0, ...targets.map((t) => (t.checks || []).length)) + 1;
    vmsg(`${runNo}회차 재검증 중... (${targets.length}개${sel.length ? ', 체크한 것만' : ''})`);
    const P = opts.P || progress($('#aiVProg'), targets.length, `${runNo}회차 판정 중`);
    if (opts.P) P.stage(72, 100, targets.length, `${runNo}회차 판정 중`);
    const ctrl = new AbortController();
    const holder = {};
    let stopped = false;
    stop.onclick = () => { stopped = true; ctrl.abort(); holder.reader?.cancel().catch(() => {}); };
    let pass = 0, fail = 0, missing = 0, lowVol = 0, model = '', done = 0;
    const minVol = form.minVol;
    // 검색량 하한값: -1 = 네이버 데이터 없음, null = 모름, '<10'은 0으로 셈
    const volOf = (t) => (!t.vol || t.vol.error ? null : t.vol.notFound ? -1 : volLB(t.vol));
    try {
      // 검색량이 없는 키워드는 판정 전에 먼저 조회
      const need = targets.filter((t) => !t.vol || t.vol.error).map((t) => t.keyword);
      if (AI.hasAd && need.length) { P.phase(`판정 전에 검색량 조회 중 0/${need.length}`, 3); await attachVolumes(need, { phase: (txt) => P.phase('판정 전에 ' + txt, 4) }); }
      if (stopped) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const B = 50;
      const batches = Math.ceil(targets.length / B);
      for (let i = 0; i < targets.length; i += B) {
        const part = targets.slice(i, i + B);
        P.setBase(done, batches > 1 ? `묶음 ${i / B + 1} / ${batches} (${part.length}개)` : '');
        const j = await streamPost('/api/ai/verify-stream', { conditions, minVol, keywords: part.map((t) => ({ keyword: t.keyword, volume: volOf(t), comp: t.vol?.comp || null, label: t.vol && !t.vol.error ? volLabel(t.vol, true) : null })) }, (ev) => P.event(ev), ctrl.signal, holder);
        model = j.model || model;
        const byN = new Map(j.results.map((r) => [norm(r.keyword), r]));
        part.forEach((it, k) => {
          const r = byN.get(norm(it.keyword)) || (j.results.length === part.length ? j.results[k] : null);
          if (!r) { missing++; return; }
          // 최소 검색량 기준은 PC에서 정확히 적용 (Gemini 판정과 합쳐서 최종 판정)
          const v = volOf(it);
          const g = window.volGate(v, minVol, it.vol?.comp, r, volLabel(it.vol, true));
          if (g.low) lowVol++;
          const ok = g.pass, reason = g.reason;
          (it.checks = it.checks || []).push({ pass: ok, reason, ai: r.pass, vol: v, minVol, comp: it.vol?.comp || null, at: Date.now(), model: j.model, ...(g.mix ? { mix: true } : {}) });
          ok ? pass++ : fail++;
        });
        done += part.length;
        draw();
      }
      const consistent = targets.filter((t) => vsum(t).cls === 'ok').length;
      if (!inGen) P.finish(`${runNo}회차 완료 · 적합 ${pass} · 부적합 ${fail}`);
      const noVol = minVol > 0 ? targets.filter((t) => volOf(t) === null).length : 0;
      vmsg(`${runNo}회차 검증 완료 (${targets.length}개${sel.length ? ', 체크한 것만' : ''}): 이번 판정 적합 ${pass} · 부적합 ${fail}${lowVol ? ` (그중 검색량 ${minVol} 미만 ${lowVol}개)` : ''}${missing ? ` · 응답 누락 ${missing}` : ''} → 일관 적합 ${consistent}개${model ? ` · ${model}` : ''}${noVol ? ` · 검색량을 모르는 ${noVol}개는 검색량 기준 없이 판정${AI.hasAd ? '' : ' (검색광고 API 키 필요)'}` : ''}`);
    } catch (e) {
      const aborted = stopped || e.name === 'AbortError';
      if (!inGen) P.finish(aborted ? `중지했어요 (${done}/${targets.length}개 반영)` : '실패', aborted ? 'stop' : 'fail');
      vmsg(aborted ? `중지했어요. 끝난 묶음(${done}개)까지만 판정이 반영됐어요.` : e.message, !aborted);
      if (inGen) return aborted ? { stopped: true } : { error: e.message };
    } finally {
      AI.busy = inGen ? AI.busy : ''; btn.disabled = false; stop.classList.add('hidden');
      save(); draw();
    }
    if (!stopped && MixedReview.opt.auto && targets.some(MixedReview.isMixed)) openMixed(true, targets);
    return { pass, fail };
  }

  // 판정 엇갈림 → 사용자에게 물어서 확정
  function openMixed(auto, items) {
    return MixedReview.open({
      items: items || AI.items, auto,
      volText: (it) => (it.vol && !it.vol.error ? '월 ' + volLabel(it.vol) : ''),
      onApply: (n) => { save(); draw(); vmsg(n ? `${n}개를 직접 판정했어요. 부적합은 [부적합 선택]으로 지울 수 있어요.${MixedReview.opt.teach ? ' 다음 재검증 때 이 결정을 AI에게 예시로 알려줘요.' : ''}` : '바꾼 판정이 없어요 (모두 보류).'); },
    });
  }
  // 부적합(한 번이라도 적합 판정이 없는 것)만 체크하고 목록을 부적합으로 거름
  function selectBad() {
    const bad = AI.items.filter((it) => vsum(it).group === '부적합');
    if (!bad.length) return vmsg(AI.items.some((it) => (it.checks || []).length) ? '부적합 키워드가 없어요.' : '아직 검증 기록이 없어요. 먼저 [조건 재검증]을 눌러주세요.', true);
    AI.items.forEach((it) => (it._sel = vsum(it).group === '부적합'));
    AI.vfilter = '부적합';
    draw();
    vmsg(`부적합 ${bad.length}개를 체크했어요. [체크한 키워드 삭제]를 누르면 지워져요. (판정이 엇갈린 키워드는 포함하지 않았어요)`);
  }

  // ---------------------------------------------------------------- 기존 키워드 파일
  async function handleFiles(files) {
    for (const file of files) {
      try {
        const sheets = await XlsxLite.readFile(file);
        const usable = sheets.filter((s) => s.rows.some((r) => r && r.some((v) => v)));
        if (!usable.length) { alert(`${file.name}: 내용이 없어요`); continue; }
        AI.pending = { file: file.name, sheets: usable };
        drawPicker();
        await new Promise((res) => (AI.pending.done = res));
      } catch (e) {
        alert(`${file.name}: ${e.message}`);
      }
    }
    $('#aiFile').value = '';
  }
  function guessColumn(rows) {
    const head = rows[0] || [];
    const hi = head.findIndex((h) => /키워드|keyword|검색어/i.test(h || ''));
    if (hi >= 0) return { col: hi, header: true };
    const width = Math.max(...rows.slice(0, 50).map((r) => (r || []).length), 1);
    let best = 0, bestN = -1;
    for (let c = 0; c < width; c++) {
      const n = rows.slice(0, 200).filter((r) => r && r[c] && isNaN(Number(r[c]))).length;
      if (n > bestN) { bestN = n; best = c; }
    }
    return { col: best, header: false };
  }
  const colLetter = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function drawPicker() {
    const p = AI.pending;
    if (!p) { $('#aiPick').innerHTML = ''; return; }
    p.si = p.si ?? 0;
    const rows = p.sheets[p.si].rows;
    if (p.col == null) { const g = guessColumn(rows); p.col = g.col; p.header = g.header; }
    const width = Math.max(...rows.slice(0, 50).map((r) => (r || []).length), 1);
    const values = (p.col === -1 ? rows.flatMap((r) => r || []) : rows.map((r) => (r || [])[p.col])).slice(p.header && p.col !== -1 ? 1 : 0);
    const kws = [...new Set(values.map((v) => String(v ?? '').trim()).filter((v) => v && isNaN(Number(v))))];
    p.keywords = kws;
    $('#aiPick').innerHTML = `<div class="pick">
      <b>${esc(p.file)}</b>
      <div class="toolbar" style="margin:8px 0 6px">
        ${p.sheets.length > 1 ? `<select id="pkSheet">${p.sheets.map((s, i) => `<option value="${i}" ${i === p.si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
        <select id="pkCol"><option value="-1" ${p.col === -1 ? 'selected' : ''}>모든 열</option>${Array.from({ length: width }, (_, c) => `<option value="${c}" ${c === p.col ? 'selected' : ''}>${colLetter(c)}열: ${esc(String((rows[0] || [])[c] ?? '').slice(0, 20))}</option>`).join('')}</select>
        <label class="muted"><input type="checkbox" id="pkHead" ${p.header ? 'checked' : ''}> 첫 행은 제목</label>
      </div>
      <div class="muted">키워드 ${kws.length.toLocaleString('ko-KR')}개 · 미리보기: ${esc(kws.slice(0, 6).join(', '))}${kws.length > 6 ? ' …' : ''}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><input id="pkName" class="inp" maxlength="80" style="flex:1" placeholder="목록 이름" value="${esc(p.nameOverride ?? (p.file + (p.sheets.length > 1 ? ` (${p.sheets[p.si].name})` : '')))}"><button class="btn pri" id="pkAdd">목록에 추가</button><button class="btn" id="pkCancel">취소</button></div></div>`;
    if ($('#pkSheet')) $('#pkSheet').onchange = (e) => { p.si = +e.target.value; p.col = null; drawPicker(); };
    $('#pkCol').onchange = (e) => { p.col = +e.target.value; drawPicker(); };
    $('#pkHead').onchange = (e) => { p.header = e.target.checked; drawPicker(); };
    $('#pkAdd').onclick = () => { const name = ($('#pkName')?.value.trim() || p.file + (p.sheets.length > 1 ? ` (${p.sheets[p.si].name})` : '')).slice(0, 80); addSource(name, p.keywords); const d = p.done; AI.pending = null; drawPicker(); d && d(); };
    $('#pkName').oninput = (e) => (p.nameOverride = e.target.value);
    $('#pkCancel').onclick = () => { const d = p.done; AI.pending = null; drawPicker(); d && d(); };
  }
  async function addSource(name, keywords) {
    AI.sources.push({ id: String(Date.now()) + Math.floor(Math.random() * 1000), name, keywords, addedAt: Date.now() });
    await saveSources();
    recheckAll(); drawSources(); draw();
  }
  function srcChanged() { recheckAll(); save(); drawSources(); draw(); }
  function drawSources() {
    const c = AI.cur;
    const total = buildIndex(existingList()).arr.length;
    const onN = activeSources().length;
    $('#exCount').textContent = c?.srcNone ? '사용 안 함' : total ? `사용 중 ${onN}개 목록 · 중복 제외 ${total.toLocaleString('ko-KR')}개` : '';
    const fd = (t) => (t ? new Date(t).toLocaleDateString('ko-KR') : '');
    $('#aiSources').innerHTML = AI.sources.length
      ? `<div class="src-master"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0"><input type="checkbox" id="srcUse" ${c?.srcNone ? '' : 'checked'}> <b>기존 키워드 목록</b> <span class="muted">${c?.srcNone ? '(꺼짐: 생성 결과끼리만 중복을 걸러요)' : ''}</span></label>${AI.sources.length > 1 && !c?.srcNone ? '<span class="src-all"><a href="#" class="ext" id="srcAll">모두 켜기</a><a href="#" class="ext" id="srcNoneAll">모두 끄기</a></span>' : ''}</div>
        <div class="src-list ${c?.srcNone ? 'off' : ''}">
        ${AI.sources.map((s) => `<div class="src-row"><label><input type="checkbox" data-src="${esc(s.id)}" ${(c?.srcOff || []).includes(String(s.id)) ? '' : 'checked'} ${c?.srcNone ? 'disabled' : ''}> <span class="sn2">${esc(s.name)}</span></label><span class="muted src-acts">${s.keywords.length.toLocaleString('ko-KR')}개${s.addedAt ? ' · ' + fd(s.addedAt) : ''} <a href="#" class="ext" data-rn="${esc(s.id)}">이름 변경</a><a href="#" class="ext" data-dl="${esc(s.id)}" data-fmt="txt" title="한 줄에 키워드 하나">TXT</a><a href="#" class="ext" data-dl="${esc(s.id)}" data-fmt="xlsx">엑셀</a><a href="#" class="ext" data-rm="${esc(s.id)}">삭제</a></span></div>`).join('')}
        </div>
        <div class="muted" style="font-size:11px;margin-top:6px">목록은 분석기 폴더에 저장돼 모든 탭이 같이 써요. 켜고 끄기는 탭마다 따로 기억해요.${srcFile ? `<br>${esc(srcFile)}` : ''}</div>`
      : '<div class="muted">아직 불러온 기존 키워드가 없어요. 없어도 생성 결과끼리는 중복을 걸러요.</div>';
    const box = $('#aiSources');
    if ($('#srcUse')) $('#srcUse').onchange = (e) => { c.srcNone = !e.target.checked; srcChanged(); };
    $$('[data-src]', box).forEach((cb) => (cb.onchange = () => {
      const id = cb.dataset.src;
      c.srcOff = (c.srcOff || []).filter((x) => x !== id);
      if (!cb.checked) c.srcOff.push(id);
      srcChanged();
    }));
    if ($('#srcAll')) $('#srcAll').onclick = (e) => { e.preventDefault(); c.srcOff = []; srcChanged(); };
    if ($('#srcNoneAll')) $('#srcNoneAll').onclick = (e) => { e.preventDefault(); c.srcOff = AI.sources.map((s) => String(s.id)); srcChanged(); };
    // 이름 바꾸기: 파일에 저장돼 모든 탭 · 중복 검사 화면에 같이 반영
    const rename = async (id) => {
      const s = AI.sources.find((x) => String(x.id) === id);
      if (!s) return;
      const v = await uiPrompt('기존 키워드 목록 이름', { value: s.name, max: 80 });
      if (!v || v === s.name) return;
      const old = s.name;
      s.name = v.slice(0, 80);
      if (await saveSources() === false) { s.name = old; return; }
      drawSources();
      toast('이름을 바꿨어요', 'ok');
    };
    $$('[data-rn]', box).forEach((a) => (a.onclick = (e) => { e.preventDefault(); rename(a.dataset.rn); }));
    // 내려받기: TXT(한 줄에 하나) · 엑셀
    $$('[data-dl]', box).forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const s = AI.sources.find((x) => String(x.id) === a.dataset.dl);
      if (!s) return;
      const base = String(s.name).replace(/\.(txt|csv|xlsx?|xlsm|tsv)(?=\s*(\([^)]*\))?\s*$)/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || '기존 키워드';
      const blob = a.dataset.fmt === 'xlsx'
        ? window.XlsxLite.writeXlsx([{ name: '기존 키워드', rows: [['키워드'], ...s.keywords.map((k) => [k])], widths: [40] }])
        : new Blob(['\ufeff' + s.keywords.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = base + (a.dataset.fmt === 'xlsx' ? '.xlsx' : '.txt');
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 3000);
    }));
    $$('[data-rm]', box).forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      const s = AI.sources.find((x) => String(x.id) === a.dataset.rm);
      if (!await uiConfirm(`'${s?.name}' 목록(${s?.keywords.length}개)을 파일에서 삭제할까요? 모든 탭에서 사라져요.\n잠깐 안 쓰려면 삭제 대신 체크를 끄세요.`)) return;
      AI.sources = AI.sources.filter((x) => String(x.id) !== a.dataset.rm);
      await saveSources();
      recheckAll(); drawSources(); draw();
    }));
  }

  // ---------------------------------------------------------------- 검색량 / 의미 중복
  // keys를 주면 그 키워드만(생성 직후 자동 조회), 없으면 검색량이 없는 것 전부. P는 진행 표시 객체(선택)
  async function attachVolumes(keys, P) {
    if (!AI.hasAd) { if (!keys) alert('검색량은 API 설정에서 검색광고 API 키를 넣으면 볼 수 있어요.'); return; }
    const todo = keys || AI.items.filter((it) => !it.vol || it.vol.error).map((it) => it.keyword);
    if (!todo.length) { if (!keys) msg('모든 키워드에 검색량이 붙어 있어요'); return; }
    const btn = $('#aiVol') || {}; btn.disabled = true;
    const sess = AI.cur;
    const prevBusy = AI.busy;
    AI.busy = AI.busy || '검색량 조회';
    let fail = '';
    try {
      for (let i = 0; i < todo.length; i += 25) {
        const label = `검색량 조회 중 ${i}/${todo.length}`;
        btn.textContent = label;
        P?.phase(label, 95 + (4 * i) / todo.length);
        const j = await (await fetch('/api/volumes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: todo.slice(i, i + 25) }) })).json();
        if (j.error) throw new Error(j.error);
        for (const it of sess.items) if (j.volumes[it.keyword]) it.vol = j.volumes[it.keyword];
        if (sess === AI.cur) draw();
      }
    } catch (e) {
      fail = e.message;
      if (!P) alert('검색량 조회 실패: ' + e.message);
    } finally {
      AI.busy = prevBusy;
      btn.disabled = false; btn.textContent = '검색량 붙이기';
      if (sess === AI.cur) save(); else persist();
    }
    return fail;
  }

  async function semanticCheck() {
    if (!activeSources().length) return alert('이 탭에서 켜 둔 ② 기존 키워드 목록이 없어요. 목록을 불러오거나 체크를 켜 주세요.');
    const pool = AI.items.filter((it) => it.status === '신규' || it.status === '유사');
    if (!pool.length) return alert('검사할 후보(신규·유사)가 없어요.');
    const btn = $('#aiSem'); btn.disabled = true;
    // 1) 임베딩(Gemini API 키가 있을 때): 글자가 달라도 뜻이 가까운 기존 키워드를 후보마다 최대 5개 찾음 (유사도 0.82 이상)
    let embInfo = '';
    btn.textContent = '뜻이 가까운 기존 키워드 찾는 중...';
    try {
      const ej = await (await fetch('/api/ai/embed-near', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidates: pool.map((t) => t.keyword), existing: existingList() }) })).json();
      if (ej.error) throw new Error(ej.error);
      let added = 0;
      for (const it of pool) { const nr = (ej.near?.[it.keyword] || []).map((x) => x[0]); const extra = nr.filter((k) => !(it.sim || []).some((s) => norm(s) === norm(k))); added += extra.length; it.semNear = nr; }
      embInfo = ` (임베딩으로 뜻이 가까운 기존 키워드 ${added}개를 더 찾음${ej.pending ? ` · 한도 때문에 ${ej.pending}개는 아직 못 비교, 다시 누르면 이어서` : '}${ej.note ? ` · ${ej.note}` : '})`;
    } catch (e) { embInfo = ` (임베딩 못 씀: ${e.message} → 글자가 비슷한 것만 비교)`; pool.forEach((it) => (it.semNear = [])); }
    const listOf = (it) => [...new Set([...(it.semNear || []), ...(it.sim || [])])];
    const targets = pool.filter((it) => listOf(it).length);
    if (!targets.length) { btn.disabled = false; btn.textContent = '의미 중복 검사'; return alert('비교할 만큼 가까운 기존 키워드가 있는 후보가 없어요.' + embInfo); }
    const sent = new Set(targets.flatMap((t) => listOf(t).slice(0, 5)));
    if (!await uiConfirm(`후보 ${targets.length}개와, 각 후보와 가까운 기존 키워드 ${sent.size}개만 AI로 보내 의미가 같은지 판단해요${embInfo}. 진행할까요?`, { ok: '진행', danger: false })) { btn.disabled = false; btn.textContent = '의미 중복 검사'; return; }
    try {
      for (let i = 0; i < targets.length; i += 100) {
        btn.textContent = `AI 판단 중 ${i}/${targets.length}`;
        const part = targets.slice(i, i + 100);
        const j = await (await fetch('/api/ai/semantic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: part.map((t) => ({ candidate: t.keyword, existing: listOf(t).slice(0, 5) })) }) })).json();
        if (j.error) throw new Error(j.error);
        for (const r of j.results) {
          const it = part.find((t) => norm(t.keyword) === norm(r.candidate));
          if (!it) continue;
          const dup = r.duplicateOf && listOf(it).find((s) => norm(s) === norm(r.duplicateOf));
          it.sem = { checked: true, dup: dup || '', reason: r.reason };
          if (dup) { it.status = '의미 중복'; it.kind = 'AI 판단: ' + (r.reason || '의미가 같음'); it.match = dup; }
        }
        draw();
      }
      save();
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.textContent = '의미 중복 검사'; }
  }

  // 광고그룹 묶기: 체크한 것(없으면 표에 보이는 것) → AI → it.adGroup
  async function groupKeywords() {
    const sel = AI.items.filter((it) => it._sel);
    const targets = sel.length ? sel : viewRows();
    if (targets.length < 2) return vmsg('묶을 키워드가 2개 이상 있어야 해요', true);
    if (targets.length > 400) return vmsg('한 번에 400개까지 묶을 수 있어요. 체크해서 나눠 주세요', true);
    const size = await window.uiChoice?.('광고그룹 크기를 골라 주세요', [['small', '작게 (2~10개)'], ['mid', '보통 (3~20개)'], ['large', '크게 (5~40개)']], 'mid');
    if (!size) return;
    const btn = $('#aiGroup'); btn.disabled = true; btn.textContent = `묶는 중... (${targets.length}개)`;
    try {
      const j = await (await fetch('/api/ai/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: readForm().topic, size, keywords: targets.map((it) => ({ keyword: it.keyword, total: it.vol && !it.vol.error ? volLB(it.vol) : 0 })) }) })).json();
      if (j.error) throw new Error(j.error);
      const by = new Map(); j.groups.forEach((g) => g.keywords.forEach((k) => by.set(norm(k), g.group)));
      targets.forEach((it) => { const g = by.get(norm(it.keyword)); if (g) it.adGroup = g; });
      AI.sort = { key: 'adGroup', dir: 1 };
      save(); draw();
      vmsg(`${targets.length}개를 광고그룹 ${j.groups.length}개로 묶었어요${j.missing ? ` (AI가 빠뜨린 ${j.missing}개는 "기타")` : ''} · ${j.model || ''}. 표의 '광고그룹' 열로 정렬해 뒀고, 엑셀에도 들어가요.`);
    } catch (e) { vmsg('광고그룹 묶기 실패: ' + e.message, true); }
    finally { btn.disabled = false; btn.textContent = '광고그룹 묶기'; }
  }

  function actCount() {
    const el = $('#aiActCnt'); if (!el) return;
    const n = AI.items.filter((it) => it._sel).length;
    el.textContent = n ? `${n.toLocaleString('ko-KR')}개 체크됨` : '체크한 키워드 없음';
    $('#aiActBar').classList.toggle('has-sel', n > 0);
    $('#aiActBar').classList.toggle('hidden', !AI.items.length);
  }
  document.addEventListener('change', (e) => { if (e.target.closest?.('#aiTbl')) setTimeout(actCount, 0); });
  // ---------------------------------------------------------------- 표
  const COLS = [['keyword', '키워드', 'l'], ['status', '중복 상태', 'l'], ['verify', '조건 검증', 'l'], ['match', '겹치는 기존 키워드', 'l'], ['intent', '의도', 'l'], ['reason', '이유', 'l'], ['total', '월간 검색량'], ['pc', 'PC'], ['mo', 'Mobile'], ['comp', '경쟁']];
  const val = (it, k) => {
    if (k === 'total') return it.vol && !it.vol.error ? (it.vol.notFound ? -0.5 : volLB(it.vol)) : undefined;
    if (k === 'comp') return ({ 높음: 3, 중간: 2, 낮음: 1 })[it.vol?.comp]; // 가나다가 아니라 정도 순
    if (['pc', 'mo'].includes(k)) return it.vol?.[k];
    if (k === 'verify') { const v = vsum(it); return v.n ? v.p / v.n + v.n / 1000 : -1; }
    return it[k];
  };
  function verifyCell(it, form) {
    const v = vsum(it);
    const L = charLen(it.keyword);
    const lenBad = L < form.minLen || L > form.maxLen;
    const cs = it.checks || [];
    const tip = cs.map((c, i) => `${i + 1}회: ${c.pass ? '적합' : '부적합'} - ${c.reason}`).join('\n');
    const dots = cs.slice(-10).map((c) => `<i class="${c.pass ? 'p' : 'f'}"></i>`).join('');
    const last = cs[cs.length - 1];
    return `<div title="${esc(tip)}"><span class="vb ${v.cls}">${v.label}</span>${v.n ? ` <span class="muted" style="font-size:11px">AI ${v.p}/${v.n}</span><span class="dots">${dots}</span>` : ''}</div>
      ${v.manual ? `<div class="muted" style="font-size:11px">${it.decision.pass ? '' : esc(it.decision.reason) + ' · '}<a href="#" class="undec" data-undec="${esc(it.keyword)}">직접 판정 취소</a></div>` : last ? `<div class="muted" style="font-size:11px;white-space:normal">${esc(last.reason)}</div>` : ''}${v.cls === 'mix' ? `<div><a href="#" class="undec" data-mix1="${esc(it.keyword)}">어느 쪽으로 할지 정하기</a></div>` : ''}
      ${lenBad ? `<div style="font-size:11px;color:#b91c1c">글자 수 범위 밖 (${L}자)</div>` : ''}`;
  }
  function draw() {
    const form = readForm();
    $('#aiTabName').textContent = AI.cur && !AI.cur.draft ? `· ${AI.cur.name}` : '';
    const counts = Object.fromEntries(STATUS.map((s) => [s, s === '전체' ? AI.items.length : AI.items.filter((it) => it.status === s).length]));
    $('#aiFilters').innerHTML = STATUS.map((s) => `<span class="chip click ${AI.filter === s ? 'on' : ''}" data-f="${s}">${s} (${counts[s]})</span>`).join('');
    $$('#aiFilters [data-f]').forEach((c) => (c.onclick = () => { AI.filter = c.dataset.f; draw(); }));
    const vcounts = Object.fromEntries(VGROUPS.map((g) => [g, g === '전체' ? AI.items.length : AI.items.filter((it) => vsum(it).group === g).length]));
    $('#aiVFilters').innerHTML = VGROUPS.map((g) => `<span class="chip click ${AI.vfilter === g ? 'on' : ''}" data-v="${g}">${g} (${vcounts[g]})</span>`).join('');
    $$('#aiVFilters [data-v]').forEach((c) => (c.onclick = () => { AI.vfilter = c.dataset.v; draw(); }));
    $('#aiSummary').textContent = AI.items.length ? `후보 ${AI.items.length}개 · 신규 ${counts['신규']}개 · 일관 적합 ${vcounts['일관 적합']}개` : '';
    let rows = viewRows();
    const { key, dir } = AI.sort;
    if (key) rows.sort((a, b) => { const x = val(a, key), y = val(b, key); return typeof x === 'number' || typeof y === 'number' ? ((x ?? -1) - (y ?? -1)) * dir : String(x ?? '').localeCompare(String(y ?? ''), 'ko') * dir; });
    const vcell = (it, k) => {
      if (!it.vol) return AI.hasAd === false ? (k === 'total' ? '<span class="muted" title="API 설정에서 검색광고 키를 넣으면 자동으로 표시돼요">키 필요</span>' : '') : '<span class="muted" title="[검색량 붙이기]를 누르면 조회해요">-</span>';
      if (it.vol.error) return '<span class="muted" title="' + esc(it.vol.error) + '">오류</span>';
      if (it.vol.notFound) return k === 'total' ? '<span class="muted">데이터 없음</span>' : '';
      if (k === 'comp') return `<span class="comp ${esc(it.vol.comp)}">${esc(it.vol.comp)}</span>`;
      if (k === 'pc' && it.vol.pcLow) return '&lt;10';
      if (k === 'mo' && it.vol.moLow) return '&lt;10';
      if (k === 'total') { const lab = volLabel(it.vol); return it.vol.pcLow && it.vol.moLow ? `<span class="muted" title="PC·모바일 모두 10 미만 (거의 검색 안 됨)">${lab}</span>` : `<b>${lab}</b>`; }
      return fmt(it.vol[k]);
    };
    $('#aiTbl').innerHTML = `<thead><tr><th class="l" style="width:30px"><input type="checkbox" id="aiAll" title="표에 보이는 키워드 전체 체크 / 다시 누르면 전체 해제"></th>${COLS.map(([k, n, c]) => `<th data-k="${k}" class="${c || ''} ${key === k ? 'sorted' : ''}">${n}<span class="ar">${key === k ? (dir < 0 ? '▼' : '▲') : '↕'}</span></th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((it) => `<tr>
        <td class="l"><input type="checkbox" data-sel="${esc(it.keyword)}" ${it._sel ? 'checked' : ''}></td>
        <td class="l kwc"><a href="#" data-go="${esc(it.keyword)}">${esc(it.keyword)}</a>${it.source && it.source !== 'AI' ? ` <span class="muted" title="${it.source === '검색데이터' ? '네이버 키워드 도구에 실제로 있는 키워드' : it.source === '자동완성' ? '네이버·구글 자동완성/관련 검색어에 실제로 나온 키워드' : ''}">(${esc(it.source)})</span>` : ''}</td>
        <td class="l"><span class="st" data-s="${esc(it.status)}">${esc(it.status)}</span>${it.kind ? `<div class="muted" style="font-size:11px">${esc(it.kind)}</div>` : ''}</td>
        <td class="l" style="min-width:150px">${verifyCell(it, form)}</td>
        <td class="l">${esc(it.match || '')}</td>
        <td class="l">${esc(it.intent || '')}</td>
        <td class="l muted" style="white-space:normal;min-width:110px">${esc(it.reason || '')}</td>
        <td>${vcell(it, 'total')}</td><td class="pc">${vcell(it, 'pc')}</td><td class="mo">${vcell(it, 'mo')}</td><td>${vcell(it, 'comp')}</td>
        <td><a href="#" class="muted" data-x="${esc(it.keyword)}" title="삭제" style="text-decoration:none">✕</a></td></tr>`).join('') ||
        `<tr><td colspan="12" class="l muted" style="padding:24px">${AI.items.length ? '이 조건에 맞는 키워드가 없어요' : '① 에서 주제와 예시를 넣고 "키워드 생성"을 누르세요. 다른 주제는 왼쪽 "+ 새 탭"에서 시작하면 주제별로 따로 저장돼요.'}</td></tr>`}</tbody>`;
    $$('#aiTbl th[data-k]').forEach((th) => (th.onclick = () => { const k = th.dataset.k; AI.sort = { key: k, dir: AI.sort.key === k ? -AI.sort.dir : ['total', 'pc', 'mo', 'verify', 'comp'].includes(k) ? -1 : 1 }; draw(); }));
    const syncAll = () => {
      const n = rows.filter((it) => it._sel).length, cb = $('#aiAll');
      cb.checked = !!rows.length && n === rows.length;
      cb.indeterminate = n > 0 && n < rows.length;
      actCount();
    };
    $$('#aiTbl [data-sel]').forEach((c) => (c.onchange = () => { const it = AI.items.find((x) => x.keyword === c.dataset.sel); if (it) it._sel = c.checked; syncAll(); }));
    $('#aiAll').onchange = () => { const on = !(rows.length && rows.every((it) => it._sel)); rows.forEach((it) => (it._sel = on)); draw(); };
    syncAll();
    $$('#aiTbl [data-x]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); rejectItems(AI.items.filter((x) => x.keyword === a.dataset.x)); AI.items = AI.items.filter((x) => x.keyword !== a.dataset.x); save(); draw(); }));
    $$('#aiTbl [data-undec]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const it = AI.items.find((x) => x.keyword === a.dataset.undec); if (it) { delete it.decision; save(); draw(); } }));
    $$('#aiTbl [data-mix1]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openMixed(false, AI.items.filter((x) => x.keyword === a.dataset.mix1)); }));
    $$('#aiTbl [data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); showAI(false); run(a.dataset.go); scrollTo({ top: 0 }); }));
    drawRejected();
  }

  // 제외 목록(부적합 판정 후 지운 키워드): 다음 생성에서 빠짐
  function drawRejected() {
    const rej = AI.cur.rejected || [];
    $('#aiRejBox').classList.toggle('hidden', !rej.length);
    $('#aiRejSum').innerHTML = `제외 목록 ${rej.length}개 <span class="muted" style="font-weight:500">· 부적합으로 지웠거나 직접 제외한 키워드로, 이 탭에서는 다시 생성되지 않아요</span>`;
    if (!rej.length) { $('#aiRej').innerHTML = ''; return; }
    const fd = (t) => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`; };
    $('#aiRej').innerHTML = `<div style="display:flex;justify-content:flex-end;margin:6px 0"><button class="btn" id="aiRejClear">제외 목록 비우기</button></div>
      <div class="tbl-wrap" style="max-height:260px"><table class="mini"><tr><th>키워드</th><th style="text-align:left">제외 사유</th><th>제외한 때</th><th></th></tr>
      ${rej.slice().reverse().map((r) => `<tr><td>${esc(r.keyword)}</td><td style="text-align:left" class="muted">${esc(r.reason)}</td><td class="muted">${fd(r.at)}</td><td><a href="#" class="ext" data-unrej="${esc(r.keyword)}">제외 해제</a></td></tr>`).join('')}</table></div>`;
    $('#aiRejClear').onclick = async () => { if (await uiConfirm(`제외 목록 ${rej.length}개를 모두 비울까요? 비우면 다음 생성에서 다시 나올 수 있어요.`)) { AI.cur.rejected = []; save(); draw(); } };
    $$('[data-unrej]', $('#aiRej')).forEach((a) => (a.onclick = (e) => { e.preventDefault(); AI.cur.rejected = rej.filter((r) => r.keyword !== a.dataset.unrej); save(); draw(); $('#aiRejBox').open = true; }));
  }
  const fval = (it, k) => {
    if (k === 'len') return charLen(it.keyword);
    const v = it.vol;
    if (!v || v.error || v.notFound) return null;
    if (k === 'total') return (v.pcLow ? 0 : v.pc || 0) + (v.moLow ? 0 : v.mo || 0);
    if (k === 'pc') return v.pcLow ? 0 : v.pc ?? null;
    if (k === 'mo') return v.moLow ? 0 : v.mo ?? null;
    return null;
  };
  const viewRows = () => AI.items.filter((it) => (AI.filter === '전체' || it.status === AI.filter) && (AI.vfilter === '전체' || vsum(it).group === AI.vfilter) && (!AI.fb || AI.fb.pass(it.keyword, (k) => fval(it, k))));

  function exportXlsx() {
    if (!AI.items.length) return alert('내보낼 결과가 없어요');
    const rows = viewRows();
    const head = ['키워드', '글자 수', '중복 상태', '구분', '겹치는 기존 키워드', '조건 검증', '적합 횟수', '검증 횟수', '마지막 판정 사유', '의도', '이유', '출처', '월간 검색량', 'PC', 'Mobile', '경쟁 정도'];
    const num = (it, k) => (it.vol && !it.vol.error && !it.vol.notFound ? ((k === 'pc' && it.vol.pcLow) || (k === 'mo' && it.vol.moLow) ? '<10' : it.vol[k]) : '');
    const data = [head, ...rows.map((it) => {
      const v = vsum(it), cs = it.checks || [];
      return [it.keyword, charLen(it.keyword), it.status, it.kind || '', it.match || '', v.label, v.p, v.n, cs.length ? cs[cs.length - 1].reason : '', it.intent || '', it.reason || '', it.source || '', num(it, 'total'), num(it, 'pc'), num(it, 'mo'), it.vol?.comp && !it.vol.notFound ? it.vol.comp : ''];
    })];
    const blob = XlsxLite.writeXlsx([{ name: 'AI 키워드', rows: data, widths: [28, 8, 10, 22, 22, 12, 9, 9, 22, 10, 22, 8, 12, 10, 10, 10] }]);
    const a = document.createElement('a');
    const name = (AI.cur.name || 'AI키워드').replace(/[\\/:*?"<>|]/g, '').slice(0, 30);
    const tag = [AI.filter, AI.vfilter].filter((x) => x !== '전체').join('_');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${tag ? tag + '_' : ''}${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
  }

  window.__AI = { AI, norm, checkOne, buildIndex, recheckAll, addItems, draw, refreshModel, handleFiles, vsum, openTab, newDraft, streamPost, progress, progHTML };
  mount();
})();

// 금지 키워드: 설정 열기 링크 · 설정 저장 후 개수 갱신
document.addEventListener('click', (e) => {
  if (e.target?.id !== 'aiBanEdit') return;
  e.preventDefault();
  Promise.resolve(window.openSettings?.('rules')).then(() => setTimeout(() => document.querySelector('[data-sec="banned"]')?.scrollIntoView({ block: 'start' }), 150));
});
