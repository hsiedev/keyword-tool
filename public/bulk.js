// 대량 키워드 분석: 키워드 파일(txt·xlsx·csv)이나 붙여넣기 → 검색량·광고 효율·순위별 입찰가·블로그 발행량을 한 표로
(function () {
  const B = {
    files: [], paste: '',
    opt: { bids: true, blog: true },
    rows: new Map(), // keyword → 결과
    order: [],
    sort: { key: 'total', dir: -1 },
    f: { comp: '', hideEmpty: false, v: '' }, // 키워드 검색·숫자 범위는 B.fb(공통 필터 막대)
    page: 1,
    busy: false,
    info: null,
    sel: new Set(), // 체크한 키워드
    vbusy: false,
    vc: { topic: '', examples: '', extra: '', minVol: null, target: 'all' }, // AI 재검증 조건
  };
  B.f.v = '';
  try { B.ai = JSON.parse(localStorage.getItem('bulkAI') || 'null'); } catch { B.ai = null; } // 재검증에 쓸 AI (대량 분석 전용)

  // ---------------------------------------------------------------- 내역 탭 (왼쪽 사이드바)
  // 분석 한 번 = 탭 하나. data\bulk-history\에 회차별 진행 상태와 결과를 저장
  const H = { list: [], cur: null, cache: new Map(), err: '' };
  const defaultVC = () => ({ topic: '', examples: '', extra: '', minVol: RULES().verify?.defaultMinVol ?? 50, target: 'all' });
  const newSession = () => ({ id: 'b' + Date.now() + Math.floor(Math.random() * 1000), name: '새 분석', custom: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), rows: [], info: null, vc: defaultVC(), draft: true });
  function autoName(kws) {
    const f = B.files[0]?.name?.replace(/\.[^.]+$/, '');
    const n = kws.length;
    return f ? `${f}${B.files.length > 1 ? ` 외 ${B.files.length - 1}개 파일` : ''} (${n.toLocaleString('ko-KR')}개)` : `${kws[0]}${n > 1 ? ` 외 ${(n - 1).toLocaleString('ko-KR')}개` : ''}`;
  }
  function loadInto(s) {
    H.cur = s;
    if (!s.draft) H.cache.set(s.id, s);
    B.rows = new Map(); B.order = [];
    for (const r of s.rows || []) { if (r && r.keyword && !B.rows.has(r.keyword)) { B.rows.set(r.keyword, r); B.order.push(r.keyword); } }
    B.info = s.info || null;
    B.vc = { ...defaultVC(), ...(s.vc || {}) };
    B.sel = new Set(); B.page = 1;
    B.f = { comp: '', hideEmpty: false, v: '' };
    B.fb?.reset();
    B.sort = { key: 'total', dir: -1 };
  }
  const BATCH_SIZE = 1000; // /api/bulk-stream의 회차 상한과 맞춤
  let saveT = null;
  // touch=false: 조건 입력처럼 목록 순서를 바꾸지 않는 저장
  function persist(now, touch = true) {
    const s = H.cur;
    if (!s) return;
    s.rows = B.order.map((k) => B.rows.get(k)).filter(Boolean);
    s.info = B.info; s.vc = { ...B.vc };
    if (touch) s.updatedAt = Date.now();
    if (s.draft) return;
    clearTimeout(saveT);
    if (now) return saveSession(s); else saveT = setTimeout(() => saveSession(s), 600);
  }
  async function saveSession(s, metaOnly) {
    try {
      const body = JSON.stringify({ metaOnly: !!metaOnly, session: metaOnly ? { id: s.id, name: s.name, custom: s.custom, pinned: s.pinned, rows: [] } : s }, (k, v) => (k === 'draft' || k === 'pending' ? undefined : v));
      const r = await (await fetch('/api/bulk-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).json();
      if (!r.ok) throw new Error(r.error || '저장 실패');
      H.list = [r.meta, ...H.list.filter((m) => m.id !== s.id)];
      H.err = '';
    } catch (e) {
      H.err = '내역을 파일로 저장하지 못했어요. 분석기를 다시 시작해 주세요 (start.bat). ' + e.message;
    }
    drawSide();
    return !H.err;
  }
  async function initHistory() {
    try {
      const j = await (await fetch('/api/bulk-history')).json();
      if (!Array.isArray(j.list)) throw new Error(j.error || '목록 없음');
      H.list = j.list; H.dir = j.dir; H.err = '';
      // 예전 버전(브라우저에 마지막 결과 1개만 저장)에서 옮기기
      const old = JSON.parse(localStorage.getItem('bulkLast') || 'null');
      if (old?.rows?.length) {
        const s = newSession(); delete s.draft;
        s.rows = old.rows; s.info = old.info || null; s.name = autoName(old.rows.map((r) => r.keyword));
        try { s.vc = { ...defaultVC(), ...JSON.parse(localStorage.getItem('bulkVC') || '{}') }; } catch {}
        s.createdAt = s.updatedAt = old.info?.at || Date.now();
        await saveSession(s);
        if (!H.err) { localStorage.removeItem('bulkLast'); localStorage.removeItem('bulkVC'); }
      }
    } catch (e) {
      H.err = '내역 탭을 쓰려면 분석기를 다시 시작해 주세요 (start.bat). 지금은 결과가 저장되지 않아요.';
    }
    drawSide();
  }
  const isBusy = () => { if (B.busy || B.vbusy) { alert(B.busy ? '분석이 끝난 뒤(또는 [중지] 후)에 다른 탭으로 옮길 수 있어요.' : '재검증이 끝난 뒤(또는 [중지] 후)에 다른 탭으로 옮길 수 있어요.'); return true; } return false; };
  async function openSession(id) {
    if (H.cur?.id === id || isBusy()) return;
    clearTimeout(saveT); if (H.cur && !H.cur.draft) persist(true, false);
    let s = H.cache.get(id);
    if (!s) {
      try {
        const j = await (await fetch('/api/bulk-history?id=' + encodeURIComponent(id))).json();
        if (!j.session) throw new Error(j.error || '불러오기 실패');
        s = j.session; H.cache.set(id, s);
      } catch (e) { return alert('내역을 불러오지 못했어요: ' + e.message); }
    }
    loadInto(s); afterOpen();
    // 분석 전에 저장해 둔 탭: 넣어 둔 키워드를 입력 칸에 다시
    if (s.input && !(s.rows || []).length) { B.files = []; B.paste = s.input; $('#bPaste').value = s.input; drawInput(); }
  }
  function newTab() {
    if (isBusy()) return;
    clearTimeout(saveT); if (H.cur && !H.cur.draft) persist(true, false);
    loadInto(newSession());
    B.files = []; B.paste = ''; $('#bPaste').value = '';
    $('#bProg').classList.add('hidden'); $('#bMsg').textContent = '';
    drawInput(); afterOpen();
    $('#bPaste').focus();
  }
  function afterOpen() {
    $('#bvProg')?.classList.add('hidden'); if ($('#bvMsg')) $('#bvMsg').textContent = '';
    $('#bProg').classList.add('hidden'); $('#bMsg').textContent = '';
    updateResume(); fillVC(); drawResult(); drawSide();
    scrollTo({ top: 0 });
  }
  const PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a" style="flex:none"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';
  function drawSide() {
    const side = $('#bSide');
    if (!side) return;
    const fmtD = (t) => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : `${d.getMonth() + 1}.${d.getDate()}`; };
    const cur = H.cur;
    const metaOf = (m) => {
      if (cur && m.id === cur.id) {
        const n = B.order.length, c = B.order.filter((k) => (B.rows.get(k)?.checks || []).length).length;
        return B.busy ? `분석 중… ${n.toLocaleString('ko-KR')}개` : B.vbusy ? `재검증 중… ${n.toLocaleString('ko-KR')}개` : `키워드 ${n.toLocaleString('ko-KR')}개${c ? ' · 판정함' : ''} · ${fmtD(cur.updatedAt)}`;
      }
      return `키워드 ${(m.count || 0).toLocaleString('ko-KR')}개${m.checked ? ' · 판정함' : ''} · ${fmtD(m.updatedAt)}`;
    };
    const item = (m) => `<div class="sit ${cur?.id === m.id ? 'on' : ''}" data-bid="${esc(m.id)}" title="${esc(m.name)} (우클릭: 고정·이름 변경·삭제)">
        <div class="sn">${m.pinned ? PIN : ''}<span>${esc(m.name)}</span></div>
        <div class="sm">${m.draft && !B.busy ? '새 분석 · 키워드를 넣고 [분석 시작]' : metaOf(m)}</div></div>`;
    const list = H.list.map((m) => (cur && m.id === cur.id ? { ...m, name: cur.name, pinned: cur.pinned } : m));
    const top = cur && !list.some((m) => m.id === cur.id) ? item(cur) : '';
    const pinned = list.filter((m) => m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const recent = list.filter((m) => !m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    side.innerHTML = `<button class="btn pri newbtn" id="bSideNew">+ 새 분석</button>
      ${H.err ? `<div style="font-size:11px;color:#b45309;padding:4px 6px;line-height:1.5">${esc(H.err)}</div>` : ''}
      ${top}
      ${pinned.length ? `<div class="side-h">고정됨</div>${pinned.map(item).join('')}` : ''}
      <div class="side-h">내역</div>
      ${recent.map(item).join('') || '<div class="muted" style="padding:6px 10px;font-size:12px">분석할 때마다 여기 쌓여요</div>'}`;
    $('#bSideNew').onclick = newTab;
    window.__RESET_bulk = () => {
      if (isBusy()) return null;
      const s = H.cur, kws = inputKeywords();
      let msg = '초기화했어요 (지난 분석은 왼쪽 내역에 있어요)';
      if (s?.draft && kws.length) {
        delete s.draft; s.name = '작성 중 · ' + autoName(kws); s.input = kws.join('\n');
        persist(true);
        msg = `넣어 둔 키워드 ${kws.length.toLocaleString('ko-KR')}개를 '${s.name}' 탭으로 저장하고 초기화했어요`;
      }
      newTab(); scrollTo(0, 0);
      return msg;
    };
    $$('.sit', side).forEach((el) => {
      el.onclick = () => openSession(el.dataset.bid);
      el.oncontextmenu = (e) => { e.preventDefault(); const m = list.find((x) => x.id === el.dataset.bid); if (m) showCtx(e, m); };
    });
  }
  function showCtx(e, m) {
    const box = $('#bCtx');
    box.innerHTML = `<button data-a="pin">${m.pinned ? '고정 해제' : '상단에 고정'}</button><button data-a="rename">이름 변경</button><button data-a="del" class="danger">삭제</button>`;
    box.classList.remove('hidden');
    box.style.left = Math.min(e.clientX, innerWidth - 170) + 'px';
    box.style.top = Math.min(e.clientY, innerHeight - 130) + 'px';
    const isCur = H.cur?.id === m.id;
    const target = isCur ? H.cur : { ...m };
    $$('button', box).forEach((b) => (b.onclick = async () => {
      box.classList.add('hidden');
      if (b.dataset.a === 'pin') { target.pinned = !target.pinned; if (H.cache.get(m.id)) H.cache.get(m.id).pinned = target.pinned; await saveSession(target, true); }
      if (b.dataset.a === 'rename') rename(m.id, target);
      if (b.dataset.a === 'del') {
        if (isCur && isBusy()) return;
        if (!await uiConfirm(`'${m.name}' 내역을 삭제할까요? 분석 결과 ${(isCur ? B.order.length : m.count || 0).toLocaleString('ko-KR')}개와 판정 기록이 같이 지워져요.`)) return;
        if (!(isCur && H.cur.draft)) { try { await fetch('/api/bulk-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: m.id }) }); } catch {} }
        H.list = H.list.filter((x) => x.id !== m.id); H.cache.delete(m.id);
        if (isCur) { clearTimeout(saveT); loadInto(newSession()); afterOpen(); } else drawSide();
      }
    }));
  }
  function rename(id, target) {
    const el = $(`#bSide .sit[data-bid="${id}"] .sn span`);
    if (!el) return;
    const inp = document.createElement('input');
    inp.value = target.name;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = async (ok) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (ok && v && v !== target.name) {
        target.name = v.slice(0, 60); target.custom = true;
        if (H.cache.get(id)) Object.assign(H.cache.get(id), { name: target.name, custom: true });
        if (target.draft) drawSide(); else await saveSession(target, true);
      } else drawSide();
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    inp.onblur = () => finish(true);
    inp.onclick = (e) => e.stopPropagation();
  }

  // ---------------------------------------------------------------- 입력 (파일 · 붙여넣기)
  const colLetter = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function guess(rows) {
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
  function extract(f) {
    const rows = f.sheets[f.si].rows;
    const vals = (f.col === -1 ? rows.flatMap((r) => r || []) : rows.map((r) => (r || [])[f.col])).slice(f.header && f.col !== -1 ? 1 : 0);
    f.keywords = vals.map((v) => String(v ?? '').trim()).filter((v) => v && isNaN(Number(v)));
  }
  async function addFiles(files) {
    for (const file of files) {
      try {
        const sheets = (await XlsxLite.readFile(file)).filter((s) => s.rows.some((r) => r && r.some((v) => v)));
        if (!sheets.length) { alert(`${file.name}: 내용이 없어요`); continue; }
        const g = guess(sheets[0].rows);
        const f = { id: Date.now() + Math.random(), name: file.name, sheets, si: 0, col: g.col, header: g.header, keywords: [] };
        extract(f);
        B.files.push(f);
      } catch (e) { alert(`${file.name}: ${e.message}`); }
    }
    drawInput();
  }
  const splitList = (s) => String(s || '').split(/[\r\n,\t]+/).map((x) => x.trim()).filter(Boolean);
  function inputKeywords() {
    const seen = new Set(), out = [];
    for (const k0 of [...B.files.flatMap((f) => f.keywords), ...splitList(B.paste)]) {
      const k = k0.replace(/\s+/g, '');
      if (k && !seen.has(k.toUpperCase())) { seen.add(k.toUpperCase()); out.push(k); }
    }
    return out;
  }

  // ---------------------------------------------------------------- 화면
  function mount() {
    const v = document.createElement('div');
    v.id = 'bulkView';
    v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><aside class="side" id="bSide"></aside><main class="ai-main" style="max-width:1280px">
      <div class="sec"><h2>대량 키워드 분석 <span class="muted" style="font-size:13px;font-weight:500">키워드 목록을 넣으면 검색량·광고 효율·입찰가·발행량을 한 표로 정리해요</span></h2>
        <div class="grid g2">
          <div class="card"><h3>키워드 넣기 <span class="muted" id="bCount"></span></h3>
            <div class="drop" id="bDrop">txt · 엑셀(xlsx) · csv 파일을 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" id="bFile" accept=".xlsx,.xlsm,.csv,.txt,.tsv,.xls" multiple hidden></label>
              <div class="muted" style="margin-top:4px">여러 파일 가능 · 최대 1,000개 · 띄어쓰기는 붙여서 조회해요</div></div>
            <div id="bFiles"></div>
            <label class="muted" style="display:block;margin-top:10px">직접 붙여넣기 (줄바꿈·쉼표로 구분 · 엑셀 표를 복사해 붙여넣으면 '키워드' 열만 골라 넣어요)</label>
            <textarea id="bPaste" class="inp" rows="4" placeholder="운전자보험\n운전자보험추천\n암보험비교"></textarea>
          </div>
          <div class="card"><h3>조회 항목</h3>
            <div class="dopts">
              <label><input type="checkbox" checked disabled> 월간 검색량 (PC · 모바일), 월평균 클릭수 · 클릭률, 경쟁 정도, 노출 광고수 <span class="muted">검색광고 API</span></label>
              <label><input type="checkbox" id="bo_bids"> 순위별 평균 입찰가 (PC · 모바일 1~5위) <span class="muted">검색광고 API, 시간이 조금 더 걸려요</span></label>
              <label><input type="checkbox" id="bo_blog"> 블로그 누적 발행량 · 포화 지수 <span class="muted" id="bo_blog_note">검색 API 키 필요</span></label>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap">
              <button class="btn pri" id="bRun">분석 시작</button>
              <button class="btn pri hidden" id="bResume">이어하기</button>
              <button class="btn hidden" id="bStop">중지</button>
              <button class="btn" id="bClear">입력 비우기</button>
            </div>
            <div class="prog hidden" id="bProg"><div class="prog-top"><b id="bPhase" role="status">준비 중</b><span><span id="bPct">0%</span> · <span id="bTime" class="muted">0초</span></span></div><div class="bar"><div id="bBar"></div></div></div>
            <div class="muted" id="bMsg" role="status" style="margin-top:8px"></div>
          </div>
        </div>
      </div>
      <div class="sec hidden" id="bVSec"><div class="card">
        <h3>AI 조건 재검증 <span class="muted" style="font-size:13px;font-weight:500">결과 키워드가 아래 조건에 맞는지 AI가 판정해요. 누를 때마다 새로 판정하고 기록이 쌓여요</span></h3>
        <div class="grid g2" style="gap:10px">
          <div><label class="muted">주제</label><input id="bvTopic" class="inp" placeholder="예: 30~40대 운전자보험 가입 고민"></div>
          <div><label class="muted">예시 키워드 (이런 게 적합해요, 쉼표 구분)</label><input id="bvEx" class="inp" placeholder="운전자보험추천, 운전자보험비교"></div>
        </div>
        <label class="muted" style="display:block;margin-top:8px">요청 사항 (판정 기준을 자유롭게)</label>
        <textarea id="bvExtra" class="inp" rows="2" placeholder="예: 가입·비교 의도가 있는 키워드만. 보험사 이름이 들어간 키워드는 제외"></textarea>
        <div class="toolbar" style="margin-top:10px;flex-wrap:wrap">
          <label class="muted">최소 월간 검색량 <input id="bvMin" type="number" min="0" step="10" style="width:80px"></label>
          <label class="muted">대상 <select id="bvTarget"><option value="all">전체 키워드</option><option value="view">지금 표에 보이는 키워드 (필터 적용)</option><option value="sel">체크한 키워드</option></select></label>
          <label class="muted">조건 가져오기 <select id="bvFrom"></select></label>
          <label class="muted" title="재검증에 쓸 AI. AI 키워드 생성기의 선택과는 따로 기억해요">AI <select id="bvProv" class="hsel"></select></label>
          <label class="muted">모델 <select id="bvModel" class="hsel" style="max-width:240px"></select></label>
          <span style="flex:1"></span>
          <button class="btn pri" id="bvRun">조건 재검증</button>
          <button class="btn hidden" id="bvStop">중지</button>
          <button class="btn hidden" id="bvMix" title="AI 판정이 엇갈린 키워드를 적합/부적합/보류로 직접 정해요">엇갈림 정리</button>
          <button class="btn hidden" id="bvBad">부적합만 체크</button>
          <button class="btn" id="bvClear">판정 기록 지우기</button>
        </div>
        <div id="bvProgBox"></div>
        <div class="muted" id="bvMsg" style="margin-top:6px"></div>
        <div class="muted" style="font-size:12px;margin-top:6px;line-height:1.6">판정 기준 문장, '일관' 횟수, '&lt;10' 계산값은 설정 › 규칙·알고리즘 › 조건 재검증을 따라요. 최소 검색량 미만은 AI 판정과 상관없이 PC가 부적합으로 처리해요.</div>
      </div></div>
      <div class="sec hidden" id="bRes">
        <div id="bResHead"></div>
        <div class="card">
          <div id="bFbar"></div>
          <div class="toolbar" id="bTools"></div>
          <div class="tbl-wrap" style="max-height:680px" id="bTblWrap"></div>
          <div class="pager" id="bPager"></div>
          <div class="muted" style="margin-top:8px;line-height:1.7">입찰가는 파워링크 최근 4주 순위별 평균 입찰가(VAT 제외, 원)예요. 포화 지수 = 블로그 누적 발행량 ÷ 월간 검색량. 키워드를 누르면 상세 분석으로 넘어가요. 열 제목을 누르면 정렬돼요. 엑셀·CSV는 지금 필터에 맞는 키워드만 담아요.</div>
        </div>
      </div>
    </main></div><div class="ctx hidden" id="bCtx"></div>`;
    document.body.insertBefore(v, $('#modalBg'));

    $('#bFile').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    const dz = $('#bDrop');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
    $('#bPaste').oninput = (e) => { B.paste = e.target.value; drawCount(); };
    for (const k of ['bids', 'blog']) { const cb = $('#bo_' + k); cb.checked = B.opt[k]; cb.onchange = () => (B.opt[k] = cb.checked); }
    $('#bRun').onclick = () => start();
    $('#bResume').onclick = () => start(true);
    $('#bClear').onclick = () => { B.files = []; B.paste = ''; $('#bPaste').value = ''; drawInput(); };

    const btn = document.createElement('button');
    btn.className = 'ghost'; btn.id = 'bulkBtn'; btn.textContent = '대량 분석';
    btn.onclick = () => showBulk($('#bulkView').classList.contains('hidden'));
    $('.top-actions').prepend(btn);

    document.addEventListener('click', (e) => { if (!e.target.closest('#bCtx')) $('#bCtx').classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#bCtx').classList.add('hidden'); });
    window.addEventListener('scroll', () => $('#bCtx').classList.add('hidden'), true);
    B.fb = FilterBar($('#bFbar'), {
      ranges: [['total', '월간 검색량'], ['pc', 'PC 검색량'], ['mo', '모바일 검색량'], ['pcClk', 'PC 월 클릭'], ['moClk', '모바일 월 클릭'], ['pcCtr', 'PC 클릭률', '%'], ['moCtr', '모바일 클릭률', '%'], ['adDepth', '광고수'], ['pc1', 'PC 1위 입찰가', '원'], ['pc3', 'PC 3위 입찰가', '원'], ['mo1', 'MO 1위 입찰가', '원'], ['mo3', 'MO 3위 입찰가', '원'], ['blog', '블로그 누적'], ['sat', '포화 지수', '%'], ['len', '글자 수']],
      main: ['total'],
      onChange: () => { B.page = 1; drawTable(); },
    });
    loadInto(newSession());
    mountVerify();
    drawInput(); drawResult(); drawSide();
    initHistory();
    if (location.hash === '#bulk') showBulk(true);
  }

  async function refreshKeys() {
    try {
      const c = await (await fetch('/api/config')).json();
      B.hasAd = !!c.hasAd; B.hasOpen = !!c.hasOpen; B.hasAI = !!(c.hasAI ?? c.hasGemini);
      if (typeof applyCfg === 'function') { applyCfg(c); fillAI(); const bp = curAI().provider; if (AICFG.has[bp] && !MODEL_LISTS[bp]) loadModels(false, bp).then(fillAI).catch(() => {}); }
      $('#bo_blog_note').innerHTML = c.hasOpen ? '검색 API' : '<span style="color:#b45309">검색 API 키가 없어서 이번엔 건너뛰어요</span>';
      if (!c.hasAd) $('#bMsg').innerHTML = `<span style="color:#b45309">검색광고 API 키가 있어야 분석할 수 있어요.</span> <a class="ext" href="#" onclick="openSettings();return false">API 설정하기</a>`;
      else if (/검색광고 API 키가 있어야/.test($('#bMsg').textContent)) $('#bMsg').innerHTML = '';
    } catch {}
  }
  function showBulk(on) {
    if (on) {
      if (window.showAI && !$('#aiView')?.classList.contains('hidden')) window.showAI(false);
      window.__hideDup?.();
      refreshKeys(); fillFrom();
    }
    $('#bulkView').classList.toggle('hidden', !on);
    $('#main').classList.toggle('hidden', on);
    $('#banners').classList.toggle('hidden', on);
    $('#tabs').classList.toggle('hidden', on || !STATE);
    $('#bulkBtn').textContent = on ? '← 키워드 분석' : '대량 분석';
    history.replaceState(null, '', location.pathname + location.search + (on ? '#bulk' : ''));
  }
  window.showBulk = showBulk;
  window.__hideBulk = () => { if (!$('#bulkView').classList.contains('hidden')) { $('#bulkView').classList.add('hidden'); $('#bulkBtn').textContent = '대량 분석'; } };

  function drawCount() { const n = inputKeywords().length; $('#bCount').textContent = n ? `${n.toLocaleString('ko-KR')}개 (중복 제외)` : ''; }
  function drawInput() {
    const box = $('#bFiles');
    box.innerHTML = B.files.map((f) => {
      const rows = f.sheets[f.si].rows;
      const width = Math.max(...rows.slice(0, 50).map((r) => (r || []).length), 1);
      const isTxt = /\.txt$/i.test(f.name);
      return `<div class="dfile" data-id="${f.id}">
        <div class="dfile-top"><b>${esc(f.name)}</b><span class="muted">${f.keywords.length.toLocaleString('ko-KR')}개 <a href="#" class="ext" data-rm="1">빼기</a></span></div>
        ${isTxt ? '' : `<div class="dfile-opts">
          ${f.sheets.length > 1 ? `<select data-k="si">${f.sheets.map((s, i) => `<option value="${i}" ${i === f.si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
          <select data-k="col"><option value="-1" ${f.col === -1 ? 'selected' : ''}>모든 열</option>${Array.from({ length: width }, (_, c) => `<option value="${c}" ${c === f.col ? 'selected' : ''}>${colLetter(c)}열: ${esc(String((rows[0] || [])[c] ?? '').slice(0, 16))}</option>`).join('')}</select>
          <label class="muted"><input type="checkbox" data-k="header" ${f.header ? 'checked' : ''}> 첫 행은 제목</label></div>`}
        <div class="muted" style="font-size:11px">미리보기: ${esc(f.keywords.slice(0, 5).join(', '))}${f.keywords.length > 5 ? ' …' : ''}</div></div>`;
    }).join('');
    $$('.dfile', box).forEach((el) => {
      const f = B.files.find((x) => String(x.id) === el.dataset.id);
      el.querySelector('[data-rm]').onclick = (e) => { e.preventDefault(); B.files = B.files.filter((x) => x !== f); drawInput(); };
      el.querySelectorAll('[data-k]').forEach((c) => (c.onchange = () => {
        if (c.dataset.k === 'si') { f.si = +c.value; const g = guess(f.sheets[f.si].rows); f.col = g.col; f.header = g.header; }
        if (c.dataset.k === 'col') f.col = +c.value;
        if (c.dataset.k === 'header') f.header = c.checked;
        extract(f); drawInput();
      }));
    });
    drawCount();
  }

  // ---------------------------------------------------------------- 실행 (서버 스트림)
  function updateResume() {
    const left = B.info?.resume ? B.order.length - B.info.resume.next : 0;
    const btn = $('#bResume');
    btn.classList.toggle('hidden', B.busy || left <= 0);
    btn.textContent = `이어하기 (${left.toLocaleString('ko-KR')}개)`;
  }
  async function start(resume = false) {
    if (B.busy || B.vbusy) return;
    const kws = resume ? B.order : inputKeywords();
    if (!kws.length) return ($('#bMsg').textContent = '분석할 키워드를 넣어주세요');
    if (!resume) {
      if (B.order.length || !H.cur) { const vc = { ...B.vc }; clearTimeout(saveT); loadInto(newSession()); B.vc = vc; }
      B.rows = new Map(kws.map((k) => [k, { keyword: k, skipped: true }]));
      B.order = kws; B.page = 1; B.sel = new Set(); B.f.v = '';
      delete H.cur.draft; H.cur.createdAt = Date.now();
      if (!H.cur.custom) H.cur.name = autoName(kws);
      B.info = { at: Date.now(), partial: true, resume: { next: 0, opt: { ...B.opt }, summary: {} } };
    }
    const job = B.info?.resume;
    if (!job || job.next >= B.order.length) return;
    B.lastSavedCount = job.next;
    B.busy = true;
    updateResume();
    $('#bRun').disabled = true; $('#bStop').classList.remove('hidden');
    $('#bProg').classList.remove('hidden', 'fail');
    const t0 = Date.now();
    const timer = setInterval(() => ($('#bTime').textContent = Math.round((Date.now() - t0) / 1000) + '초'), 500);
    let steps = ['검색량'];
    const setP = (txt, p) => { $('#bPhase').textContent = txt; $('#bBar').style.width = p + '%'; $('#bPct').textContent = Math.round(p) + '%'; };
    setP('준비 중', 100 * job.next / B.order.length);
    $('#bMsg').textContent = `마지막 저장: ${job.next.toLocaleString('ko-KR')}개`;
    drawResult(); drawSide(); fillVC();
    const ctrl = new AbortController();
    let reader = null, stopped = false;
    $('#bStop').disabled = false;
    $('#bStop').onclick = () => { $('#bStop').disabled = true; $('#bPhase').textContent = '멈추는 중…'; stopped = true; ctrl.abort(); reader?.cancel().catch(() => {}); };
    let lastDraw = 0;
    const redraw = (force) => { if (force || Date.now() - lastDraw > 400) { lastDraw = Date.now(); drawResult(); } };
    const assertSaved = async () => {
      if (!await persist(true)) throw new Error('내역을 저장하지 못해 분석을 멈췄어요. 저장 상태를 확인한 뒤 이어하기를 누르세요.');
    };
    try {
      await assertSaved();
      while (job.next < B.order.length && !stopped) {
        const offset = job.next;
        const batch = B.order.slice(offset, offset + BATCH_SIZE);
        const label = `${Math.floor(offset / BATCH_SIZE) + 1}/${Math.ceil(B.order.length / BATCH_SIZE)}회차`;
        for (const k of batch) B.rows.set(k, { keyword: k, pending: true, checks: B.rows.get(k)?.checks });
        redraw(true);
        const res = await fetch('/api/bulk-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: batch, ...job.opt }), signal: ctrl.signal });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('event-stream')) { const j = await res.json(); throw new Error(j.error || '서버 오류'); }
        reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', done = null;
        while (!done) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n'); buf = parts.pop();
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const ev = JSON.parse(line.slice(5).trim());
            if (ev.type === 'error') throw new Error(ev.message);
            if (ev.type === 'start') steps = ev.steps;
            if (ev.type === 'rows') { for (const r of ev.rows) { const o = B.rows.get(r.keyword) || { keyword: r.keyword }; Object.assign(o, r); delete o.pending; B.rows.set(r.keyword, o); } redraw(); }
            if (ev.type === 'progress') {
              const si = steps.indexOf(ev.step);
              const p = (offset + batch.length * (si + ev.done / ev.total) / steps.length) / B.order.length * 100;
              if (!stopped) setP(`${label} · ${si + 1}/${steps.length}단계 · ${ev.step} 조회 중 ${ev.done.toLocaleString('ko-KR')} / ${ev.total.toLocaleString('ko-KR')}`, p);
            }
            if (ev.type === 'done') done = ev;
          }
        }
        if (!done || done.total !== batch.length) throw new Error('회차 결과를 모두 받지 못했어요');
        reader.releaseLock(); reader = null;
        const checkpoint = { ...B.info, resume: { ...job, summary: { ...job.summary } } };
        job.next += batch.length;
        for (const k of ['notFound', 'failed']) job.summary[k] = (job.summary[k] || 0) + (done[k] || 0);
        for (const k of ['bidErr', 'blogErr', 'blogSkipped']) if (done[k]) job.summary[k] = done[k];
        B.info = job.next < B.order.length
          ? { at: Date.now(), partial: true, resume: job }
          : { at: Date.now(), total: job.next, ...job.summary };
        try { await assertSaved(); B.lastSavedCount = job.next; if (!stopped) $('#bMsg').textContent = `마지막 저장: ${job.next.toLocaleString('ko-KR')}개`; } catch (e) { B.info = checkpoint; throw e; }
      }
      if (job.next < B.order.length) throw new DOMException('중지', 'AbortError');
      const done = B.info;
      setP(`완료 · ${done.total.toLocaleString('ko-KR')}개 · ${Math.round((Date.now() - t0) / 1000)}초`, 100);
      const notes = [];
      if (done.notFound) notes.push(`검색광고 데이터가 없는 키워드 ${done.notFound}개 (검색량이 거의 없거나 광고 불가 키워드)`);
      if (done.failed) notes.push(`조회 실패 ${done.failed}개`);
      if (done.bidErr) notes.push({ html: '입찰가 조회 오류: ' + (window.friendlyErr ? friendlyErr(done.bidErr) : esc(done.bidErr)) });
      if (done.blogErr) notes.push({ html: '블로그 발행량 조회 오류: ' + (window.friendlyErr ? friendlyErr(done.blogErr) : esc(done.blogErr)) });
      if (done.blogSkipped) notes.push('검색 API 키가 없어 블로그 발행량은 건너뛰었어요');
      $('#bMsg').innerHTML = notes.map((n) => (typeof n === 'string' ? esc(n) : n.html)).join('<br>');
    } catch (e) {
      const aborted = stopped || e.name === 'AbortError';
      $('#bPhase').textContent = aborted ? '중지했어요 (받은 데까지 표시)' : '실패';
      if (!aborted) { $('#bProg').classList.add('fail'); $('#bMsg').innerHTML = `<span style="color:#b91c1c">${esc(e.message)}</span>`; }
      if (B.info?.resume) $('#bPhase').textContent += ` · 저장 기준 ${B.info.resume.next.toLocaleString('ko-KR')}개`;
    } finally {
      clearInterval(timer);
      $('#bStop').classList.add('hidden');
      for (const k of B.order) { const o = B.rows.get(k); if (o?.pending) { delete o.pending; o.skipped = true; } }
      if (reader) await reader.cancel().catch(() => {});
      if (B.info?.resume && !await persist(true)) $('#bMsg').textContent = '내역 저장에 실패했어요. 새로고침 전에 저장 상태를 확인해 주세요.';
      B.busy = false; $('#bRun').disabled = false;
      updateResume(); drawResult(); drawSide();
    }
  }

  // ---------------------------------------------------------------- 결과 표
  const lb = (r) => (r.notFound || r.error || r.pending || r.skipped ? null : (r.pcLow ? 0 : r.pc || 0) + (r.moLow ? 0 : r.mo || 0));
  const bidAt = (r, dev, p) => r.bids?.[dev]?.find((x) => x.position === p)?.bid ?? null;
  const satCls = (s) => { const b = RULES().analysis?.satBands || [30, 100, 300, 500]; return s < b[0] ? 'l1' : s < b[1] ? 'l2' : s < b[2] ? 'l3' : s < b[3] ? 'l4' : 'l5'; };
  const sat = (r) => (r.blog != null && lb(r) ? Math.round((r.blog / lb(r)) * 100) : null);
  const vs = (r) => window.__AI?.vsum?.(r) || { n: 0, p: 0, label: '미검증', cls: 'none', group: '미검증' };
  const COLS = [
    ['keyword', '키워드', (r) => r.keyword],
    ['verify', 'AI 판정', (r) => { const v = vs(r); return v.n ? v.p / v.n + v.n / 1000 : -1; }],
    ['total', '월간 검색량', lb],
    ['pc', 'PC', (r) => (r.pcLow ? 0 : r.pc)],
    ['mo', 'Mobile', (r) => (r.moLow ? 0 : r.mo)],
    ['pcClk', 'PC 월 클릭', (r) => r.pcClk ?? null],
    ['moClk', '모바일 월 클릭', (r) => r.moClk ?? null],
    ['pcCtr', 'PC 클릭률', (r) => r.pcCtr ?? null],
    ['moCtr', '모바일 클릭률', (r) => r.moCtr ?? null],
    ['comp', '경쟁', (r) => ({ 높음: 3, 중간: 2, 낮음: 1 }[r.comp] ?? null)],
    ['adDepth', '광고수', (r) => r.adDepth ?? null],
    ['pc1', 'PC 1위', (r) => bidAt(r, 'pc', 1)],
    ['pc3', 'PC 3위', (r) => bidAt(r, 'pc', 3)],
    ['pc5', 'PC 5위', (r) => bidAt(r, 'pc', 5)],
    ['mo1', 'MO 1위', (r) => bidAt(r, 'mobile', 1)],
    ['mo3', 'MO 3위', (r) => bidAt(r, 'mobile', 3)],
    ['mo5', 'MO 5위', (r) => bidAt(r, 'mobile', 5)],
    ['blog', '블로그 누적', (r) => r.blog ?? null],
    ['sat', '포화 지수', sat],
  ];
  const getV = (key, r) => (COLS.find((c) => c[0] === key)?.[2] || (() => null))(r);
  const n0 = (v) => (v == null ? '<span class="muted">-</span>' : Math.round(v).toLocaleString('ko-KR'));
  function viewRows() {
    const f = B.f;
    let rows = B.order.map((k) => B.rows.get(k)).filter(Boolean);
    if (B.fb) rows = rows.filter((r) => B.fb.pass(r.keyword, (k) => (k === 'len' ? [...r.keyword.replace(/\s+/g, '')].length : r.pending || r.error || r.notFound || r.skipped ? null : getV(k, r) ?? null)));
    if (f.comp) rows = rows.filter((r) => r.comp === f.comp);
    if (f.hideEmpty) rows = rows.filter((r) => lb(r) != null);
    if (f.v) rows = rows.filter((r) => vs(r).group === f.v);
    const { key, dir } = B.sort;
    rows.sort((a, b) => {
      if (key === 'keyword') return a.keyword.localeCompare(b.keyword, 'ko') * dir;
      const x = getV(key, a), y = getV(key, b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; if (y == null) return -1;
      return (x - y) * dir;
    });
    return rows;
  }
  const PAGE = 100; const PG = () => UI().bulkPage || PAGE;
  function drawResult() {
    const sec = $('#bRes');
    if (!B.order.length) { sec.classList.add('hidden'); $('#bVSec').classList.add('hidden'); return; }
    sec.classList.remove('hidden'); $('#bVSec').classList.remove('hidden');
    const all = B.order.map((k) => B.rows.get(k)).filter(Boolean);
    const withVol = all.filter((r) => lb(r) != null);
    const sumVol = withVol.reduce((a, r) => a + lb(r), 0);
    const pc1 = all.map((r) => bidAt(r, 'pc', 1)).filter((v) => v != null);
    const mo1 = all.map((r) => bidAt(r, 'mobile', 1)).filter((v) => v != null);
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    $('#bResHead').innerHTML = `<h2>결과 <span class="muted" style="font-size:13px;font-weight:500">${B.info?.at ? new Date(B.info.at).toLocaleString('ko-KR') + ' 조회' : ''}${B.info?.partial ? ' · 일부만 조회됨' : ''}</span></h2>
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card"><div class="muted">키워드</div><div class="big">${all.length.toLocaleString('ko-KR')}</div><div class="muted">검색량 있음 ${withVol.length.toLocaleString('ko-KR')}개</div></div>
        <div class="card"><div class="muted">월간 검색량 합계</div><div class="big">${sumVol.toLocaleString('ko-KR')}</div><div class="muted">'&lt;10'은 0으로 계산</div></div>
        <div class="card"><div class="muted">PC 1위 평균 입찰가</div><div class="big">${avg(pc1) == null ? '-' : avg(pc1).toLocaleString('ko-KR') + '원'}</div></div>
        <div class="card"><div class="muted">모바일 1위 평균 입찰가</div><div class="big">${avg(mo1) == null ? '-' : avg(mo1).toLocaleString('ko-KR') + '원'}</div></div>
      </div>`;
    drawTable();
  }
  // 표·도구·페이지만 다시 그림 (필터 입력칸은 그대로 둠)
  function drawTable() {
    if (!B.order.length) return;
    const all = B.order.map((k) => B.rows.get(k)).filter(Boolean);
    const rows = viewRows();
    const pages = Math.max(1, Math.ceil(rows.length / PG()));
    B.page = Math.min(B.page, pages);
    const view = rows.slice((B.page - 1) * PG(), B.page * PG());
    const hasBids = all.some((r) => r.bids), hasBlog = all.some((r) => r.blog != null);
    const hasChecks = all.some((r) => (r.checks || []).length);
    if (!hasChecks && B.f.v) B.f.v = '';
    const cols = COLS.filter(([k]) => (hasBids || !/^(pc|mo)\d$/.test(k)) && (hasBlog || !['blog', 'sat'].includes(k)) && (hasChecks || k !== 'verify'));
    const { key, dir } = B.sort;
    const cell = (k, r) => {
      if (k === 'keyword') return `<td class="l kwc"><a href="#" data-go="${esc(r.keyword)}">${esc(r.keyword)}</a></td>`;
      if (k === 'verify') return `<td class="l" style="min-width:150px">${verdictCell(r)}</td>`;
      if (r.pending) return k === 'total' ? '<td><span class="muted">조회 중…</span></td>' : '<td></td>';
      if (r.notFound && k === 'total') return '<td><span class="muted" title="검색광고 키워드 도구에 데이터가 없어요">데이터 없음</span></td>';
      if (r.error && k === 'total') return `<td><span style="color:#b91c1c" title="${esc(r.error)}">오류</span></td>`;
      if (r.skipped && k === 'total') return '<td><span class="muted">중지됨</span></td>';
      switch (k) {
        case 'total': { const v = lb(r); if (v == null) return '<td></td>'; return `<td><b>${r.pcLow && r.moLow ? '&lt;20' : r.pcLow || r.moLow ? `${v.toLocaleString('ko-KR')}~${(v + 9).toLocaleString('ko-KR')}` : v.toLocaleString('ko-KR')}</b></td>`; }
        case 'pc': return `<td class="pc">${r.pc == null ? '' : r.pcLow ? '&lt;10' : n0(r.pc)}</td>`;
        case 'mo': return `<td class="mo">${r.mo == null ? '' : r.moLow ? '&lt;10' : n0(r.mo)}</td>`;
        case 'pcClk': return `<td class="pc">${r.pcClk == null ? '' : n0(r.pcClk)}</td>`;
        case 'moClk': return `<td class="mo">${r.moClk == null ? '' : n0(r.moClk)}</td>`;
        case 'pcCtr': return `<td class="pc">${r.pcCtr == null ? '' : r.pcCtr + '%'}</td>`;
        case 'moCtr': return `<td class="mo">${r.moCtr == null ? '' : r.moCtr + '%'}</td>`;
        case 'comp': return `<td>${r.comp ? `<span class="comp ${esc(r.comp)}">${esc(r.comp)}</span>` : ''}</td>`;
        case 'adDepth': return `<td>${r.adDepth ?? ''}</td>`;
        case 'blog': return `<td>${r.blogError ? '<span class="muted">오류</span>' : n0(r.blog)}</td>`;
        case 'sat': { const s = sat(r); return `<td>${s == null ? '<span class="muted">-</span>' : `<span class="lvl ${satCls(s)}">${s.toLocaleString('ko-KR')}%</span>`}</td>`; }
        default: { if (r.bidError) return '<td><span class="muted">-</span></td>'; const v = getV(k, r); return `<td>${v == null ? '<span class="muted">-</span>' : v.toLocaleString('ko-KR')}</td>`; }
      }
    };
    const exportRows = viewRows();
    const unavailable = exportRows.filter(r => r.pending || r.skipped || r.error || r.notFound).length;
    const tools = $('#bTools');
    tools.innerHTML = `
      <select id="bfComp"><option value="">경쟁 전체</option>${['높음', '중간', '낮음'].map((x) => `<option ${B.f.comp === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label class="muted" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="bfEmpty" ${B.f.hideEmpty ? 'checked' : ''}> 데이터 없는 키워드 숨기기</label>
      ${hasChecks ? `<select id="bfV">${['', '일관 적합', '적합 (1회)', '엇갈림', '부적합', '미검증'].map((x) => `<option value="${x}" ${B.f.v === x ? 'selected' : ''}>${x ? 'AI 판정: ' + x + ' (' + all.filter((r) => vs(r).group === x).length + ')' : 'AI 판정 전체'}</option>`).join('')}</select>` : ''}
      <span style="flex:1"></span>
      <span class="muted" id="bSelInfo"></span>
      ${hasChecks ? '<button class="btn" data-proxy="bvMix" title="AI 판정이 엇갈린 키워드를 적합/부적합/보류로 직접 정해요">엇갈림 정리</button><button class="btn danger-btn" data-proxy="bvBad">부적합만 체크</button>' : ''}
      <button class="btn ok-btn" id="bOkSel" title="체크한 키워드를 '적합 (직접)'으로 확정해요. 다음 재검증에서 빠지고, AI에게 예시로 전달돼요.">체크한 키워드 적합으로</button>
      <button class="btn" id="bDelSel">체크한 키워드 삭제</button>
      <span class="muted"><b>${rows.length.toLocaleString('ko-KR')}</b>개 표시${rows.length !== all.length ? ` / 전체 ${all.length.toLocaleString('ko-KR')}` : ''}</span>
      <span class="muted">다운로드: 필터 ${exportRows.length.toLocaleString('ko-KR')}개 / 전체 ${all.length.toLocaleString('ko-KR')}개${unavailable ? ` · 미조회·데이터 없음 ${unavailable}개 포함` : ''}</span>
      <button class="btn pri" id="bXlsx">엑셀 다운로드</button>
      <button class="btn" id="bCsv">CSV</button>
      <button class="btn" id="bTxt" title="지금 필터에 맞는 키워드만, 한 줄에 하나씩">TXT</button>`;
    tools.querySelectorAll('[data-proxy]').forEach((x) => (x.onclick = () => $('#' + x.dataset.proxy).click())); // 재검증 칸의 버튼을 표 바로 위에서
    const wrap = $('#bTblWrap');
    const keepScroll = wrap.scrollTop, keepLeft = wrap.scrollLeft;
    wrap.innerHTML = `<table class="rel" style="min-width:${hasBids ? 1700 : 1150}px">
      <thead><tr><th style="width:30px"><input type="checkbox" id="bSelAll" title="표에 보이는 키워드 전체 체크 (필터 적용, 모든 페이지) / 다시 누르면 전체 해제"></th><th style="width:44px">#</th>${cols.map(([k, n]) => `<th data-k="${k}" class="${k === 'keyword' ? 'l' : ''} ${key === k ? 'sorted' : ''}">${n}<span class="ar">${key === k ? (dir < 0 ? '▼' : '▲') : '↕'}</span></th>`).join('')}</tr></thead>
      <tbody>${view.map((r, i) => `<tr><td><input type="checkbox" data-sel="${esc(r.keyword)}" ${B.sel.has(r.keyword) ? 'checked' : ''}></td><td class="muted">${(B.page - 1) * PG() + i + 1}</td>${cols.map(([k]) => cell(k, r)).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="l muted" style="padding:20px">조건에 맞는 키워드가 없어요${B.fb?.active() ? ' · 필터를 확인해 주세요' : ''}</td></tr>`}</tbody>
    </table>`;
    wrap.scrollTop = keepScroll; wrap.scrollLeft = keepLeft;
    $('#bPager').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === B.page ? 'on' : ''}" data-p="${i + 1}">${i + 1}</button>`).join('') : '';
    const setF = (id, k) => ($('#' + id).onchange = (e) => { B.f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; B.page = 1; drawTable(); });
    setF('bfComp', 'comp'); setF('bfEmpty', 'hideEmpty'); if ($('#bfV')) setF('bfV', 'v');
    const syncAll = () => {
      const n = rows.filter((r) => B.sel.has(r.keyword)).length, cb = $('#bSelAll');
      cb.checked = !!rows.length && n === rows.length;
      cb.indeterminate = n > 0 && n < rows.length;
    };
    $$('[data-sel]', wrap).forEach((cb) => (cb.onchange = () => { cb.checked ? B.sel.add(cb.dataset.sel) : B.sel.delete(cb.dataset.sel); selInfo(); syncAll(); }));
    $('#bSelAll').onchange = () => { const on = !(rows.length && rows.every((r) => B.sel.has(r.keyword))); for (const r of rows) on ? B.sel.add(r.keyword) : B.sel.delete(r.keyword); drawTable(); };
    syncAll();
    $('#bDelSel').onclick = delSelected;
    $('#bOkSel').onclick = () => {
      const list = [...B.sel].map((k) => B.rows.get(k)).filter(Boolean);
      if (!list.length) return toast('적합으로 바꿀 키워드를 먼저 체크하세요.', 'warn');
      for (const r of list) r.decision = { pass: true, reason: '직접 적합', at: Date.now() };
      B.sel = new Set(); persist(); drawResult();
      toast(`${list.length}개를 '적합 (직접)'으로 바꿨어요`, 'ok');
    };
    selInfo();
    $$('th[data-k]', wrap).forEach((th) => (th.onclick = () => { const k = th.dataset.k; B.sort = { key: k, dir: B.sort.key === k ? -B.sort.dir : k === 'keyword' ? 1 : -1 }; drawTable(); }));
    $$('[data-p]', $('#bPager')).forEach((b) => (b.onclick = () => { B.page = +b.dataset.p; drawTable(); $('#bTblWrap').scrollTop = 0; }));
    $$('[data-undec]', wrap).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const r = B.rows.get(a.dataset.undec); if (r) { delete r.decision; persist(true); drawResult(); } }));
    $$('[data-mix1]', wrap).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const r = B.rows.get(a.dataset.mix1); if (r) openMixed(false, [r]); }));
    $$('[data-go]', wrap).forEach((a) => (a.onclick = (e) => { e.preventDefault(); showBulk(false); run(a.dataset.go); scrollTo({ top: 0 }); }));
    $('#bXlsx').onclick = () => download('xlsx');
    $('#bCsv').onclick = () => download('csv');
    $('#bTxt').onclick = () => download('txt');
  }

  function download(kind) {
    const rows = viewRows();
    if (kind === 'txt') {
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      return downloadTxt(rows.map((r) => r.keyword), `대량분석_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`);
    }
    const head = ['키워드', '월간 검색량(합계)', 'PC 검색량', '모바일 검색량', 'PC 월평균 클릭', '모바일 월평균 클릭', 'PC 클릭률(%)', '모바일 클릭률(%)', '경쟁 정도', '월평균 노출 광고수',
      'PC 1위', 'PC 2위', 'PC 3위', 'PC 4위', 'PC 5위', '모바일 1위', '모바일 2위', '모바일 3위', '모바일 4위', '모바일 5위', '블로그 누적 발행량', '포화 지수(%)', '비고'];
    const v = (x) => (x == null ? '' : x);
    const hasChecks = rows.some((r) => (r.checks || []).length);
    if (hasChecks) head.splice(1, 0, 'AI 판정', '적합/판정 횟수', '최근 판정 근거');
    const data = rows.map((r) => [
      r.keyword, r.pcLow && r.moLow ? '<20' : v(lb(r)), r.pcLow ? '<10' : v(r.pc), r.moLow ? '<10' : v(r.mo), v(r.pcClk), v(r.moClk), v(r.pcCtr), v(r.moCtr), v(r.comp), v(r.adDepth),
      ...[1, 2, 3, 4, 5].map((p) => v(bidAt(r, 'pc', p))), ...[1, 2, 3, 4, 5].map((p) => v(bidAt(r, 'mobile', p))),
      v(r.blog), v(sat(r)), r.notFound ? '검색광고 데이터 없음' : r.error ? '조회 실패' : r.skipped ? '중지로 미조회' : '',
    ]);
    if (hasChecks) data.forEach((row, i) => { const r = rows[i], s = vs(r), cs = r.checks || []; row.splice(1, 0, s.label, s.n ? `${s.p}/${s.n}` : '', cs.length ? cs[cs.length - 1].reason : ''); });
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = `대량분석_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
    let blob;
    if (kind === 'xlsx') {
      const num = data.map((row) => row.map((x) => (typeof x === 'string' && x !== '' && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)));
      blob = XlsxLite.writeXlsx([{ name: '대량 분석', rows: [head, ...num], widths: [26, ...(hasChecks ? [12, 10, 24] : []), 12, 10, 10, 10, 10, 9, 9, 8, 9, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 12, 10, 16] }]);
    } else {
      blob = new Blob(['\ufeff' + [head, ...data].map((l) => l.map((x) => `"${String(x).replace(/^([=+\-@\t\r])(?![\d.,]+$)/, "'$1").replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------------------------------------------------------------- AI 조건 재검증
  const vmsg = (t, err) => { $('#bvMsg').innerHTML = err ? `<span style="color:#b91c1c">${esc(t)}</span>` : esc(t); };
  const saveVC = () => persist(false, false);
  const lowAs = () => Math.max(0, Math.min(9, RULES().verify?.lowAs ?? 0));
  // 판정용 검색량: -1 = 네이버 데이터 없음, null = 모름, '<10'은 설정값(기본 0)으로 계산
  const volOf = (r) => (r.notFound ? -1 : r.error || r.pending || r.skipped || (r.pc == null && !r.pcLow) ? null : (r.pcLow ? lowAs() : r.pc || 0) + (r.moLow ? lowAs() : r.mo || 0));
  const volText = (r) => { const x = lb(r); return r.notFound ? '데이터 없음' : x == null ? '미조회' : r.pcLow && r.moLow ? 'PC·모바일 모두 10 미만' : r.pcLow || r.moLow ? `${x}~${x + 9}` : x.toLocaleString('ko-KR'); };
  function verdictCell(r) {
    const v = vs(r), cs = r.checks || [];
    if (!v.n) return '<span class="vb none">미검증</span>';
    const tip = cs.map((c, i) => `${i + 1}회: ${c.pass ? '적합' : '부적합'} - ${c.reason}`).join('\n');
    const dots = cs.slice(-10).map((c) => `<i class="${c.pass ? 'p' : 'f'}"></i>`).join('');
    return `<div title="${esc(tip)}"><span class="vb ${v.cls}">${v.label}</span> <span class="muted" style="font-size:11px">AI ${v.p}/${v.n}</span><span class="dots">${dots}</span></div>${v.manual ? `<div class="muted" style="font-size:11px">${r.decision.pass ? '' : esc(r.decision.reason) + ' · '}<a href="#" class="undec" data-undec="${esc(r.keyword)}">직접 판정 취소</a></div>` : `<div class="muted" style="font-size:11px;white-space:normal">${esc(cs[cs.length - 1].reason)}</div>`}${v.cls === 'mix' ? `<div><a href="#" class="undec" data-mix1="${esc(r.keyword)}">어느 쪽으로 할지 정하기</a></div>` : ''}`;
  }
  function openMixed(auto, items) {
    return MixedReview.open({
      items: items || B.order.map((k) => B.rows.get(k)), auto,
      volText: (r) => (lb(r) == null ? (r.notFound ? '데이터 없음' : '') : '월 ' + volText(r)),
      onApply: (n) => { persist(true); drawResult(); vmsg(n ? `${n}개를 직접 판정했어요. 부적합은 표 위의 [부적합만 체크] → [체크한 키워드 삭제]로 지울 수 있어요.${MixedReview.opt.teach ? ' 다음 재검증 때 이 결정을 AI에게 예시로 알려줘요.' : ''}` : '바꾼 판정이 없어요 (모두 보류).'); },
    });
  }
  function selInfo() {
    const n = B.order.filter((k) => B.sel.has(k)).length;
    if ($('#bSelInfo')) $('#bSelInfo').textContent = n ? `체크 ${n.toLocaleString('ko-KR')}개` : '';
    if ($('#bDelSel')) $('#bDelSel').disabled = !n;
    if ($('#bOkSel')) $('#bOkSel').disabled = !n;
  }
  async function delSelected() {
    const ks = B.order.filter((k) => B.sel.has(k));
    if (!ks.length) return;
    if (!await uiConfirm(`체크한 ${ks.length.toLocaleString('ko-KR')}개 키워드를 결과에서 지울까요?`)) return;
    const del = new Set(ks);
    B.order = B.order.filter((k) => !del.has(k)); ks.forEach((k) => B.rows.delete(k));
    B.sel = new Set(); if (B.f.v && !viewRows().length) B.f.v = ''; persist(); drawResult();
    vmsg(`${ks.length.toLocaleString('ko-KR')}개를 지웠어요. 남은 키워드 ${B.order.length.toLocaleString('ko-KR')}개`);
  }
  function fillFrom() {
    const A = window.__AI?.AI, sel = $('#bvFrom');
    if (!sel) return;
    const list = A ? [A.cur, ...(A.sessions || [])].filter((s, i, a) => s && a.indexOf(s) === i && (s.form?.topic || s.form?.examples || s.form?.extra)) : [];
    sel.innerHTML = `<option value="">AI 생성기 탭 선택…</option>` + list.map((s, i) => `<option value="${i}">${esc(s.name)}${s.form?.topic ? ' · ' + esc(s.form.topic.slice(0, 20)) : ''}</option>`).join('');
    sel.onchange = () => {
      const s = list[+sel.value]; if (!s) return;
      B.vc.topic = s.form.topic || ''; B.vc.examples = s.form.examples || ''; B.vc.extra = s.form.extra || '';
      if (s.form.minVol != null) B.vc.minVol = s.form.minVol;
      saveVC(); fillVC(); sel.value = '';
      vmsg(`"${s.name}" 탭의 주제·예시·요청 사항·최소 검색량을 가져왔어요.`);
    };
  }
  // 재검증 AI 선택 (대량 분석 전용, 브라우저에 기억)
  function fillAI() {
    const pSel = $('#bvProv'), mSel = $('#bvModel');
    if (!pSel || typeof PROV === 'undefined') return;
    const p = B.ai?.provider && PROV[B.ai.provider] ? B.ai.provider : AICFG.provider;
    const m = B.ai?.provider === p && B.ai.model ? B.ai.model : AICFG.models[p] || PROV[p].defaults[0];
    pSel.innerHTML = Object.entries(PROV).map(([k, v]) => `<option value="${k}" ${k === p ? 'selected' : ''}>${v.name}${provNeed(k)}</option>`).join('');
    fillModelSelect(mSel, m, p);
    pSel.onchange = () => {
      const np = pSel.value;
      B.ai = { provider: np, model: AICFG.models[np] || PROV[np].defaults[0] };
      saveAI(); fillAI();
      if (AICFG.has[np] && !MODEL_LISTS[np]) loadModels(false, np).then(fillAI).catch(() => {});
      if (!AICFG.has[np]) vmsg(provMissing(np), true);
    };
    mSel.onchange = () => { B.ai = { provider: p, model: mSel.value }; saveAI(); };
  }
  const saveAI = () => { try { localStorage.setItem('bulkAI', JSON.stringify(B.ai)); } catch {} };
  const curAI = () => ({ provider: $('#bvProv')?.value || AICFG.provider, model: $('#bvModel')?.value || '' });
  function fillVC() { $('#bvTopic').value = B.vc.topic; $('#bvEx').value = B.vc.examples; $('#bvExtra').value = B.vc.extra; $('#bvMin').value = B.vc.minVol; $('#bvTarget').value = B.vc.target; }
  function mountVerify() {
    $('#bvProgBox').innerHTML = window.__AI?.progHTML ? window.__AI.progHTML('bvProg') : '';
    fillVC(); fillFrom(); fillAI();
    const on = (id, k, f = (x) => x) => ($('#' + id).oninput = $('#' + id).onchange = (e) => { B.vc[k] = f(e.target.value); saveVC(); });
    on('bvTopic', 'topic'); on('bvEx', 'examples'); on('bvExtra', 'extra'); on('bvTarget', 'target'); on('bvMin', 'minVol', (x) => Math.max(0, Math.round(+x || 0)));
    $('#bvRun').onclick = verify;
    $('#bvMix').onclick = () => { if (!B.vbusy) openMixed(false); };
    $('#bvBad').onclick = () => {
      const bad = B.order.filter((k) => vs(B.rows.get(k)).group === '부적합');
      if (!bad.length) return vmsg(B.order.some((k) => (B.rows.get(k).checks || []).length) ? '부적합 키워드가 없어요.' : '아직 판정 기록이 없어요. 먼저 [조건 재검증]을 눌러주세요.', true);
      B.sel = new Set(bad); B.f.v = '부적합'; B.page = 1; B.fb.reset(); drawResult();
      vmsg(`부적합 ${bad.length.toLocaleString('ko-KR')}개를 체크했어요. 표 위의 [체크한 키워드 삭제]를 누르면 지워져요. (판정이 엇갈린 키워드는 빼고 체크했어요)`);
    };
    $('#bvClear').onclick = async () => {
      if (!await uiConfirm('모든 키워드의 AI 판정 기록과 직접 판정을 지울까요?')) return;
      B.order.forEach((k) => { delete B.rows.get(k).checks; delete B.rows.get(k).decision; }); B.f.v = ''; persist(); drawResult(); vmsg('판정 기록을 지웠어요.');
    };
  }
  async function verify() {
    if (B.vbusy) return;
    if (B.busy) return vmsg('분석이 끝난 뒤에 재검증할 수 있어요', true);
    const c = B.vc, examples = splitList(c.examples);
    if (!c.topic.trim() && !examples.length && !c.extra.trim()) return vmsg('주제·예시·요청 사항 중 하나는 넣어주세요. 판정 기준이 돼요.', true);
    const all = B.order.map((k) => B.rows.get(k)).filter(Boolean);
    // 직접 판정한 키워드는 빼고 (체크한 키워드 대상이면 포함)
    const targets = c.target === 'sel' ? all.filter((r) => B.sel.has(r.keyword)) : (c.target === 'view' ? viewRows() : all).filter((r) => !r.decision);
    if (!targets.length) return vmsg(c.target === 'sel' ? '체크한 키워드가 없어요' : '재검증할 키워드가 없어요 (직접 판정한 키워드는 빠져요. 다시 판정하려면 체크한 키워드 대상으로)', true);
    if (!window.__AI?.streamPost) return vmsg('AI 모듈을 불러오지 못했어요. 새로고침해 주세요.', true);
    const { streamPost, progress } = window.__AI;
    const ai = curAI();
    if (AICFG.has && AICFG.has[ai.provider] === false) return vmsg(provMissing(ai.provider) + ' 또는 다른 AI를 고르세요.', true);
    B.vbusy = true; $('#bvRun').disabled = true; $('#bvStop').classList.remove('hidden'); $('#bvProv').disabled = $('#bvModel').disabled = true; drawSide();
    const runNo = Math.max(0, ...targets.map((t) => (t.checks || []).length)) + 1;
    const minVol = Math.max(0, Math.round(+c.minVol || 0));
    vmsg(`${runNo}회차 재검증 중... (${targets.length.toLocaleString('ko-KR')}개)`);
    const P = progress($('#bvProg'), targets.length, `${runNo}회차 판정 중`);
    const ctrl = new AbortController(), holder = {};
    let stopped = false, pass = 0, fail = 0, missing = 0, lowVol = 0, model = '', done = 0;
    $('#bvStop').onclick = () => { stopped = true; ctrl.abort(); holder.reader?.cancel().catch(() => {}); };
    const conditions = { topic: c.topic, examples, extra: c.extra, judged: MixedReview.judged(all) };
    const nk = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    try {
      const SZ = 50, batches = Math.ceil(targets.length / SZ);
      for (let i = 0; i < targets.length; i += SZ) {
        if (stopped) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const part = targets.slice(i, i + SZ);
        P.setBase(done, batches > 1 ? `묶음 ${i / SZ + 1} / ${batches} (${part.length}개)` : '');
        const body = { conditions, minVol, provider: ai.provider, model: ai.model, keywords: part.map((r) => ({ keyword: r.keyword, volume: volOf(r), label: volOf(r) == null || r.notFound ? null : r.pcLow || r.moLow ? volText(r) : null })) };
        const j = await streamPost('/api/ai/verify-stream', body, (ev) => P.event(ev), ctrl.signal, holder);
        model = j.model || model;
        const byN = new Map((j.results || []).map((x) => [nk(x.keyword), x]));
        part.forEach((r, k) => {
          const x = byN.get(nk(r.keyword)) || (j.results?.length === part.length ? j.results[k] : null);
          if (!x) { missing++; return; }
          const v = volOf(r);
          const g = window.volGate(v, minVol, r.comp, x, volText(r));
          if (g.low) lowVol++;
          const ok = g.pass, reason = g.reason;
          (r.checks = r.checks || []).push({ pass: ok, reason, ai: x.pass, vol: v, minVol, comp: r.comp || null, at: Date.now(), model: j.model, ...(g.mix ? { mix: true } : {}) });
          ok ? pass++ : fail++;
        });
        done += part.length;
        persist(); drawResult();
      }
      const consistent = targets.filter((t) => vs(t).cls === 'ok').length;
      const noVol = minVol > 0 ? targets.filter((t) => volOf(t) === null).length : 0;
      P.finish(`${runNo}회차 완료 · 적합 ${pass} · 부적합 ${fail}`);
      vmsg(`${runNo}회차 검증 완료 (${targets.length.toLocaleString('ko-KR')}개): 적합 ${pass} · 부적합 ${fail}${lowVol ? ` (그중 검색량 ${minVol} 미만 ${lowVol}개)` : ''}${missing ? ` · 응답 누락 ${missing}` : ''} → 일관 적합 ${consistent}개${model ? ` · ${model}` : ''}${noVol ? ` · 검색량을 모르는 ${noVol}개는 검색량 기준 없이 판정` : ''}`);
    } catch (e) {
      const aborted = stopped || e.name === 'AbortError';
      P.finish(aborted ? `중지했어요 (${done}/${targets.length}개 반영)` : '실패', aborted ? 'stop' : 'fail');
      vmsg(aborted ? `중지했어요. 끝난 묶음(${done}개)까지만 판정이 반영됐어요.` : /키|key|설정/i.test(e.message) ? `${e.message} (설정 › API 설정 › AI 모델에서 키를 확인해 주세요)` : e.message, !aborted);
    } finally {
      B.vbusy = false; $('#bvRun').disabled = false; $('#bvStop').classList.add('hidden'); $('#bvProv').disabled = $('#bvModel').disabled = false;
      persist(true); drawResult(); drawSide();
    }
    if (!stopped && MixedReview.opt.auto && targets.some(MixedReview.isMixed)) openMixed(true, targets);
  }

  addEventListener('pagehide', () => {
    if (!H.cur || H.cur.draft) return;
    clearTimeout(saveT);
    try { fetch('/api/bulk-history', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vcOnly: true, session: { id: H.cur.id, vc: { ...B.vc } } }) }); } catch {}
  });
  // 다른 화면(중복 검사 등)에서 키워드를 넘겨받아 입력칸에 채움
  function setInput(list, note) {
    if (B.busy || B.vbusy) return alert('진행 중인 대량 작업을 끝낸 뒤 보내주세요.');
    if (B.order.length || !H.cur?.draft) newTab();
    B.files = []; B.paste = list.join('\n'); $('#bPaste').value = B.paste;
    drawInput(); showBulk(true);
    $('#bMsg').innerHTML = esc(note || `선택한 키워드 ${list.length.toLocaleString('ko-KR')}개를 초안에 넣었어요. 목록을 확인하고 [분석 시작]을 누르세요.`);
  }
  window.__BULK = { B, H, addFiles, start, showBulk, verify, openSession, newTab, setInput };
  mount();
})();
