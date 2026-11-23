// 파워링크 분석기: 내 파워링크가 네이버 PC·모바일에서 몇 위인지 실제 검색 화면으로 확인하고 캡처 (AI 안 씀)
// - 서버(powerlink-core.mjs)가 로그아웃 상태 네이버를 여러 번(설정, 기본 4회) 검색해 평균 순위를 내고, 화면 없는 Edge로 캡처
// - 키워드는 네이버 광고관리 '키워드 다운로드' 엑셀을 그대로 넣으면 키워드·입찰가·상태를 알아서 읽음 (붙여넣기도 가능)
// - n위 입찰가 = 네이버 검색광고 API 순위별 평균 입찰가(최근 4주), n위 예상 = 그 입찰가로 냈을 때 네이버 예상 실적(월)
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const e2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => (v == null || v === '' ? '' : Math.round(+v).toLocaleString('ko-KR'));
  const DEVN = { pc: 'PC', mo: '모바일' };
  const MAXN = { pc: 10, mo: 5 };
  const S = {
    jobs: [], running: null, job: null, cur: null, // cur = 열린 작업 id (null = 새 분석)
    draft: { rows: [], file: '', paste: '', reports: [], period: {} },
    urls: localStorage.getItem('plUrls') || '',
    devices: JSON.parse(localStorage.getItem('plDevs') || '["pc","mo"]'),
    nPc: +localStorage.getItem('plNPc') || 3, nMo: +localStorage.getItem('plNMo') || 3,
    dev: localStorage.getItem('plDev') === 'mo' ? 'mo' : 'pc',
    thread: [], prev: null, band: 0,
    q: '', onlyMiss: false, sort: { key: 'i', dir: 1 }, page: 1, timer: 0, perfBusy: false,
  };
  const PG = 100;
  const BANDS = { pc: [['', '전체'], ['1-3', '1~3위'], ['4-10', '4~10위'], ['11-', '11위~']], mo: [['', '전체'], ['1-3', '1~3위'], ['4-5', '4~5위'], ['6-', '6위~']] };
  const inBand = (x, band) => { if (!band) return true; if (!x?.seen) return false; const v = Math.round(x.avg), [a, b] = band.split('-').map((n) => (n === '' ? Infinity : +n)); return v >= a && v <= b; };
  const runs = () => window.SETTINGS?.rules?.powerlink?.runs || 4;
  const gapS = () => (window.SETTINGS?.rules?.powerlink?.gapMs || 1200) / 1000;

  // ---------------------------------------------------------------- 키워드 읽기 (네이버 광고관리 엑셀 · CSV · 붙여넣기)
  const numOf = (v) => { const s = String(v ?? '').replace(/[^\d.]/g, ''); return s === '' ? null : Number(s); };
  function fromSheet(rows) {
    const hi = rows.findIndex((r) => (r || []).some((c) => /^(키워드|키워드명|keyword)$/i.test(String(c).trim())));
    if (hi < 0) {
      const k = window.XlsxLite?.pickKeywords ? window.XlsxLite.pickKeywords(rows) : null;
      const ci = k && typeof k.col === 'string' && /번째 열$/.test(k.col) ? parseInt(k.col) - 1 : 0;
      return rows.map((r) => (r || []).map((c) => String(c).trim())).filter((r) => r[ci] && !/^[\d,.]+$/.test(r[ci])).map((r) => ({ kw: r[ci], bid: numOf(r.find((c, i) => i !== ci && /^[\d,]+원?$/.test(c))), state: '', on: true }));
    }
    const h = rows[hi].map((c) => String(c).replace(/\s+/g, ''));
    const at = (name) => h.findIndex((c) => c === name);
    const iK = h.findIndex(c => /^(키워드|키워드명|keyword)$/i.test(c)), iB = at('입찰가'), iS = at('상태'), iP = h.findIndex((c) => /^PC통검평균노출순위/.test(c)), iM = h.findIndex((c) => /^모바일통검평균노출순위/.test(c));
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const kw = String(r?.[iK] ?? '').trim();
      if (!kw || /^(합계|총계|소계|전체|총합계|전체합계|TOTALS?|키워드[\d,]+개결과)$/i.test(kw.replace(/\s+/g, ''))) continue; // 맨 위 합계 줄
      const state = iS >= 0 ? String(r[iS] ?? '').trim() : '';
      out.push({ kw, bid: iB >= 0 ? numOf(r[iB]) : null, state, acctPc: iP >= 0 ? numOf(r[iP]) : null, acctMo: iM >= 0 ? numOf(r[iM]) : null, on: !state || state === '노출가능' });
    }
    return out;
  }
  function fromPaste(t) {
    return String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [kw, bid] = l.split(/\t|,/); return { kw: kw.trim(), bid: numOf(bid), state: '', on: true }; });
  }
  function mergeRows(list) {
    const seen = new Map(S.draft.rows.map((r) => [r.kw.replace(/\s+/g, '').toUpperCase(), r]));
    for (const r of list) { const k = r.kw.replace(/\s+/g, '').toUpperCase(); if (k && !seen.has(k)) { seen.set(k, r); S.draft.rows.push(r); } }
  }
  const periodFields = (p = {}) => `<label>실적 시작일 <input class="inp" style="width:auto" type="date" data-period="start" value="${e2(p.start || '')}"></label> <label>종료일 <input class="inp" style="width:auto" type="date" data-period="end" value="${e2(p.end || '')}"></label>`;
  const getPeriod = box => Object.fromEntries($$('[data-period]', box).map(x => [x.dataset.period, x.value]));
  async function readReport(file) {
    if (file.size > 12 * 1024 * 1024) throw new Error('파일이 12MB를 넘어요. 필요한 보고서로 나눠 주세요.');
    const buffer = await file.arrayBuffer();
    const sheets = await window.XlsxLite.readFile(file, { raw: true, buffer });
    if (!sheets.length) throw new Error('읽을 수 있는 시트가 없어요.');
    const a = new Uint8Array(buffer), parts = [];
    for (let i = 0; i < a.length; i += 24576) parts.push(btoa(String.fromCharCode(...a.subarray(i, i + 24576))));
    return { name: file.name, sheets, original: parts.join('') };
  }
  const inputRows = sheets => {
    const all = sheets.filter(s => s.rows.some(r => r.some(c => /^(키워드|키워드명|keyword)$/i.test(String(c).trim()))));
    return all.length ? all.flatMap(s => fromSheet(s.rows)) : fromSheet(sheets[0]?.rows || []);
  };
  async function addFiles(files) {
    for (const f of files) {
      try {
        const raw = await readReport(f);
        const rows = inputRows(raw.sheets);
        mergeRows(rows);
        S.draft.reports.push(raw);
        S.draft.file = f.name;
        toast(`${f.name}: 키워드 ${rows.length.toLocaleString('ko-KR')}개 (노출가능 ${rows.filter((r) => r.on).length.toLocaleString('ko-KR')}개 체크)`, 'ok');
      } catch (e) { toast(`${f.name}: ${e.message}`, 'warn'); }
    }
    draw();
  }

  // ---------------------------------------------------------------- 서버
  const api = async (p, body) => {
    const r = await fetch(p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || '서버 오류 ' + r.status);
    return j;
  };
  async function loadJobs() { try { const j = await api('/api/pl/jobs'); S.jobs = j.jobs; S.running = j.running; } catch {} drawSide(); }
  async function openJob(id) {
    try { const j = await api('/api/pl/job?id=' + encodeURIComponent(id)); S.job = j.job; S.cur = id; S.thread = j.thread || []; S.prev = j.prev || null; S.running = j.running ? { id, ...j.running } : (S.running?.id === id ? null : S.running); }
    catch (e) { toast(e.message, 'warn'); S.cur = null; S.job = null; }
    localStorage.setItem('plCur', S.cur || '');
    S.page = 1;
    draw(); poll();
    ensurePerf(); // 지금 고른 n위의 예상 실적이 아직 없으면 (예: 재분석은 첫 분석 때의 n위로만 받아 둠)
  }
  function poll() {
    clearTimeout(S.timer);
    if (!S.job || (S.job.status !== 'running' && !S.thread.some((m) => m.status === 'running'))) return;
    S.timer = setTimeout(async () => {
      if (!$('#plView') || $('#plView').classList.contains('hidden')) { S.timer = setTimeout(poll, 3000); return; }
      await openJob(S.cur);
      loadJobs(); // 왼쪽 목록의 진행 개수도
      if (S.job?.status !== 'running' && !S.thread.some((m) => m.status === 'running')) { loadJobs(); if (S.job?.status === 'done') toast(`'${S.job.name}' 분석이 끝났어요`, 'ok'); }
    }, 2500);
  }
  async function start() {
    const urls = S.urls.split(/[\s,]+/).filter(Boolean);
    const rows = S.draft.rows;
    if (!urls.length) return toast('내 파워링크 URL을 넣어주세요', 'warn');
    if (!rows.some((r) => r.on)) return toast('검사할 키워드를 체크하세요', 'warn');
    if (!S.devices.length) return toast('PC나 모바일 중 하나는 골라주세요', 'warn');
    try {
      const j = await api('/api/pl/start', { urls, rows, devices: S.devices, nPc: S.nPc, nMo: S.nMo, name: $('#plName')?.value || '', reports: S.draft.reports, period: S.draft.period });
      S.draft = { rows: [], file: '', paste: '', reports: [], period: {} };
      await loadJobs(); await openJob(j.id);
    } catch (e) { toast(e.message, 'warn'); }
  }

  // ---------------------------------------------------------------- 화면
  function mount() {
    const v = document.createElement('div');
    v.id = 'plView'; v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><aside class="side" id="pSide"></aside><main class="ai-main" style="max-width:1400px"><div id="plBody"></div></main></div>`;
    $('#main').after(v);
    const cx = document.createElement('div'); cx.className = 'ctx hidden'; cx.id = 'pCtx'; document.body.appendChild(cx);
    document.addEventListener('click', (e) => { if (!e.target.closest('#pCtx')) cx.classList.add('hidden'); });
    window.addEventListener('scroll', () => cx.classList.add('hidden'), true);
    const im = document.createElement('div');
    im.id = 'plImg'; im.className = 'pl-img hidden';
    im.innerHTML = '<div class="pl-img-in"><div class="pl-img-top"><b id="plImgT"></b><a class="ext" id="plImgO" target="_blank">새 창으로</a><button class="btn" id="plImgX">닫기</button></div><img id="plImgI" alt="캡처"></div>';
    document.body.appendChild(im);
    im.onclick = (e) => { if (e.target === im || e.target.id === 'plImgX') im.classList.add('hidden'); };
    addEventListener('keydown', (e) => { if (e.key === 'Escape') { im.classList.add('hidden'); cx.classList.add('hidden'); } });
  }
  function showImg(src, title) { $('#plImgI').src = src; $('#plImgO').href = src; $('#plImgT').textContent = title; $('#plImg').classList.remove('hidden'); }

  const fmtD = (t) => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : `${d.getMonth() + 1}.${d.getDate()}`; };
  const ST = { running: '진행 중', done: '완료', stopped: '중지됨', error: '오류', ready: '대기' };
  const PIN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="flex:none;opacity:.7"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';
  const subName = (m) => (m.custom ? m.name : `재분석 ${m.thread || ''}`.trim());
  function drawSide() {
    const side = $('#pSide');
    if (!side) return;
    const roots = S.jobs.filter((m) => !m.parentId || !S.jobs.some((x) => x.id === m.parentId));
    const kids = (r) => S.jobs.filter((m) => m.parentId === r.id).sort((x, y) => x.createdAt - y.createdAt);
    const meta = (m) => `${ST[m.status] || ''} · ${m.done.toLocaleString('ko-KR')}/${m.total.toLocaleString('ko-KR')}개 · ${fmtD(m.createdAt)}`;
    const item = (m, sub, nk = 0, openT = false) => `<div class="sit ${sub ? 'pl-sub' : ''} ${S.cur === m.id ? 'on' : ''}" data-pid="${e2(m.id)}" title="${e2(m.name)} (우클릭: ${sub ? '' : '고정·'}재분석·이름 변경·삭제)">
        <div class="sn">${sub ? '<span class="pl-br">↳</span>' : m.pinned ? PIN : ''}<span>${e2(sub ? subName(m) : m.name)}</span></div>
        <div class="sm">${meta(m)}${nk ? ` · <span class="pl-nk">${openT ? '▾' : '▸'} 재분석 ${nk}</span>` : ''}</div></div>`;
    const curRoot = (() => { const c = S.jobs.find((m) => m.id === S.cur); return c ? c.parentId || c.id : null; })();
    const group = (r) => { const ks = kids(r), openT = r.id === curRoot; return item(r, false, ks.length, openT) + (openT ? ks.map((k) => item(k, true)).join('') : ''); };
    const last = (r) => Math.max(r.createdAt, ...kids(r).map((k) => k.createdAt));
    const pinned = roots.filter((r) => r.pinned).sort((x, y) => last(y) - last(x)), rest = roots.filter((r) => !r.pinned).sort((x, y) => last(y) - last(x));
    side.innerHTML = `<button class="btn pri newbtn" id="pSideNew">+ 새 분석</button>
      ${pinned.length ? `<div class="side-h">고정됨</div>${pinned.map(group).join('')}` : ''}
      <div class="side-h">내역</div>
      ${rest.map(group).join('') || '<div class="muted" style="padding:6px 10px;font-size:12px">분석할 때마다 여기 쌓여요</div>'}
      <div class="pl-usage" id="plUsage">${usageHTML()}</div>`;
    bindUsage();
    $('#pSideNew').onclick = () => { clearTimeout(S.timer); S.cur = null; S.job = null; S.thread = []; S.prev = null; localStorage.setItem('plCur', ''); draw(); };
    $$('[data-pid]', side).forEach((el) => {
      el.onclick = () => openJob(el.dataset.pid);
      el.oncontextmenu = (e) => { e.preventDefault(); const m = S.jobs.find((x) => x.id === el.dataset.pid); if (m) showCtx(e, m); };
    });
  }
  // 저장 공간 (캡처 · 캡처용 브라우저 캐시)
  const MB = (b) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + 'GB' : Math.max(0.1, b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0) + 'MB');
  function usageHTML() {
    const U = S.usage;
    if (!U) return '<span class="muted">저장 공간 계산 중…</span>';
    const caps = Object.values(U.jobs).reduce((a, x) => a + x.caps, 0);
    return `<div><b>저장 공간 ${MB(U.total)}</b></div><div class="muted">분석 결과 ${MB(U.jobsTotal)} (그중 캡처 ${MB(caps)}) · 캡처용 브라우저 ${MB(U.browser)}</div>
      <div class="pl-usage-btns"><button type="button" class="ext" id="plCleanB" title="캡처용 브라우저의 캐시를 지워요. 분석 결과는 그대로예요">브라우저 캐시 비우기</button><span class="muted">· 캡처만 지우기는 내역 우클릭</span></div>`;
  }
  let usageAt = 0;
  async function loadUsage(force) {
    if (!force && Date.now() - usageAt < 60000) return;
    usageAt = Date.now();
    try { S.usage = await api('/api/pl/usage', {}); } catch { return; }
    const el = $('#plUsage'); if (el) { el.innerHTML = usageHTML(); bindUsage(); }
  }
  function bindUsage() {
    loadUsage();
    const b = $('#plCleanB');
    if (b) b.onclick = async () => {
      try { const r = await api('/api/pl/clean-browser', {}); toast(`브라우저 캐시 ${MB(r.freed)}를 비웠어요`, 'ok'); loadUsage(true); } catch (e) { toast(e.message, 'warn'); }
    };
  }
  function showCtx(e, m) {
    const box = $('#pCtx'), sub = !!m.parentId;
    box.innerHTML = `${sub ? '' : `<button data-a="pin">${m.pinned ? '고정 해제' : '상단에 고정'}</button>`}<button data-a="rerun">같은 키워드로 재분석</button><button data-a="rename">이름 변경</button>${m.purged ? '' : `<button data-a="purge">캡처만 지우기${S.usage?.jobs?.[m.id] ? ` (${MB(S.usage.jobs[m.id].caps)})` : ''}</button>`}<button data-a="del" class="danger">삭제</button>`;
    box.classList.remove('hidden');
    box.style.left = Math.min(e.clientX, innerWidth - 190) + 'px';
    box.style.top = Math.min(e.clientY, innerHeight - 160) + 'px';
    $$('button', box).forEach((b) => (b.onclick = async () => {
      box.classList.add('hidden');
      const a = b.dataset.a;
      try {
        if (a === 'pin') { await api('/api/pl/pin', { id: m.id, pinned: !m.pinned }); await loadJobs(); }
        if (a === 'rerun') await rerun(m.id);
        if (a === 'rename') rename(m);
        if (a === 'purge') {
          if (!await uiConfirm(`'${sub ? subName(m) : m.name}'의 캡처 그림만 지울까요?\n순위 · 입찰가 · 예상 실적 결과는 그대로 남아요. 지운 캡처는 되돌릴 수 없어요.`, { ok: '캡처 지우기' })) return;
          const r = await api('/api/pl/purge', { id: m.id });
          toast(`캡처 ${MB(r.freed)}를 지웠어요`, 'ok');
          if (S.job?.id === m.id) S.job.purged = Date.now();
          await loadJobs(); loadUsage(true); if (S.job?.id === m.id) draw();
        }
        if (a === 'del') {
          const kidsN = sub ? 0 : S.jobs.filter((x) => x.parentId === m.id).length;
          if (!await uiConfirm(`'${sub ? subName(m) : m.name}' 분석을 삭제할까요? 순위 결과와 캡처가 같이 지워져요.${kidsN ? `\n이 분석의 재분석 ${kidsN}개도 함께 지워져요.` : ''}`)) return;
          const r = await api('/api/pl/delete', { id: m.id });
          const gone = S.cur === m.id || (!sub && S.jobs.some((x) => x.parentId === m.id && x.id === S.cur));
          if (gone) { clearTimeout(S.timer); S.cur = null; S.job = null; localStorage.setItem('plCur', ''); }
          await loadJobs(); draw();
          toast(r.deleted > 1 ? `${r.deleted}개(재분석 포함)를 지웠어요` : '지웠어요', 'ok');
        }
      } catch (x) { toast(x.message, 'warn'); }
    }));
  }
  // 이름 변경: 다른 분석기처럼 목록에서 바로 고쳐 쓰기 (Enter 저장 · Esc 취소)
  function rename(m) {
    const el = $(`#pSide .sit[data-pid="${m.id}"] .sn span:last-child`);
    if (!el) return;
    const inp = document.createElement('input');
    inp.value = m.parentId ? subName(m) : m.name;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    let fin = false;
    const finish = async (ok) => {
      if (fin) return; fin = true;
      const v = inp.value.trim();
      if (ok && v && v !== m.name) { try { await api('/api/pl/rename', { id: m.id, name: v }); if (S.job?.id === m.id) S.job.name = v; } catch (x) { toast(x.message, 'warn'); } await loadJobs(); if (S.job) draw(); }
      else drawSide();
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    inp.onblur = () => finish(true);
    inp.onclick = (e) => e.stopPropagation();
  }
  // 재분석: 새 엑셀(입찰가 바꾼 뒤 다시 받은 파일)을 넣으면 그 입찰가로, 안 넣으면 이전 값 그대로
  async function rerun(id) {
    let src = S.job?.id === id ? S.job : null;
    if (!src) { try { src = (await api('/api/pl/job?id=' + encodeURIComponent(id))).job; } catch (e) { return toast(e.message, 'warn'); } }
    const on = src.rows.filter((r) => r.on !== false);
    const bg = document.createElement('div');
    bg.className = 'cfm-bg';
    bg.innerHTML = `<div class="cfm pl-rr" role="dialog" aria-modal="true">
      <div class="cfm-msg"><b>같은 키워드로 재분석</b> <span class="muted">키워드 ${on.length.toLocaleString('ko-KR')}개 · ${src.devices.map((d) => DEVN[d]).join('·')}</span></div>
      <div class="muted" style="font-size:12.5px;line-height:1.6;margin-top:6px">입찰가를 바꿨다면 광고관리에서 <b>키워드 다운로드 엑셀을 새로 받아</b> 넣어 주세요. 같은 키워드의 입찰가 · 상태 · 평균노출순위만 새 값으로 바뀌고, 키워드 목록과 체크는 그대로예요. 안 넣으면 이전 입찰가로 재분석하되 이전 기간의 실적은 복사하지 않아요.</div>
      <div class="drop" id="rrDrop" style="margin-top:10px;padding:14px">새 엑셀을 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" id="rrFile" accept=".xlsx,.xlsm,.csv,.txt" hidden></label></div>
      <textarea id="rrPaste" class="inp" rows="2" style="margin-top:8px" placeholder="또는 엑셀에서 머리글 줄부터 복사해서 여기에 Ctrl+V"></textarea>
      <div class="pl-bar" style="margin-top:8px">${periodFields()}</div>
      <div id="rrInfo" class="muted" style="font-size:12.5px;margin-top:8px;min-height:18px"></div>
      <div class="cfm-btns"><button type="button" class="btn" data-v="x">취소</button><button type="button" class="btn" data-v="old">이전 입찰가로 재분석</button><button type="button" class="btn pri" data-v="new" disabled>새 입찰가로 재분석</button></div></div>`;
    document.body.appendChild(bg);
    let got = null, fname = '', raw = null;
    const info = bg.querySelector('#rrInfo'), btnNew = bg.querySelector('[data-v="new"]');
    const take = (rows, name) => {
      if (!rows.length) { got = null; btnNew.disabled = true; info.innerHTML = '<span style="color:#b91c1c">키워드를 찾지 못했어요. 머리글(키워드 · 입찰가 …) 줄까지 넣어 주세요</span>'; return; }
      const m = new Map(rows.map((r) => [r.kw.replace(/\s+/g, '').toUpperCase(), r]));
      let changed = 0, missing = 0;
      for (const r of on) { const x = m.get(r.kw.replace(/\s+/g, '').toUpperCase()); if (!x) missing++; else if (x.bid != null && x.bid !== r.bid) changed++; }
      got = rows; fname = name;
      info.innerHTML = `<b>${e2(name)}</b>: ${rows.length.toLocaleString('ko-KR')}개 읽음 · 이번 키워드 중 <b style="color:var(--accent)">입찰가 바뀜 ${changed.toLocaleString('ko-KR')}개</b>${missing ? ` · 파일에 없음 ${missing.toLocaleString('ko-KR')}개(이전 값 유지)` : ''}`;
      btnNew.disabled = false;
    };
    const readFiles = async (files) => { const f = files[0]; if (!f) return; try { raw = await readReport(f); take(inputRows(raw.sheets), f.name); } catch (e) { got = null; raw = null; btnNew.disabled = true; info.textContent = e.message; } };
    const dz = bg.querySelector('#rrDrop');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); readFiles([...e.dataTransfer.files]); };
    bg.querySelector('#rrFile').onchange = (e) => readFiles([...e.target.files]);
    bg.querySelector('#rrPaste').addEventListener('paste', (e) => { const rows = window.XlsxLite?.clipRows(e.clipboardData, { raw: true }); if (!rows) return; e.preventDefault(); raw = { name: '붙여넣은 표', sheets: [{ name: '붙여넣은 표', rows }] }; take(fromSheet(rows), raw.name); });
    const close = () => { removeEventListener('keydown', onKey, true); bg.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    addEventListener('keydown', onKey, true);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-v]').forEach((b) => (b.onclick = async () => {
      const v = b.dataset.v;
      if (v === 'x') return close();
      b.disabled = true;
      try {
        const j = await api('/api/pl/rerun', { id, nPc: S.nPc, nMo: S.nMo, ...(v === 'new' && got ? { rows: got, file: fname, reports: raw ? [raw] : [], period: getPeriod(bg) } : {}) });
        close();
        await loadJobs(); await openJob(j.id);
        toast(j.updated ? `새 입찰가로 재분석해요 (입찰가 바뀐 키워드 ${j.changed}개). 첫 분석 아래에 붙어 있어요` : '이전 입찰가로 다시 분석해요. 첫 분석 아래에 붙어 있어요', 'ok');
      } catch (e) { b.disabled = false; info.innerHTML = `<span style="color:#b91c1c">${e2(e.message)}</span>`; }
    }));
  }

  function compareLauncher() {
    return '<div class="pl-bar" style="margin-bottom:10px"><button class="btn" id="plCompare">두 기간 비교</button><span class="muted">저장한 분석의 순위·실제 실적·하락 신호</span></div>';
  }
  function dialogPL(title, html, opener = document.activeElement) {
    const bg = document.createElement('dialog');
    const previous = opener;
    bg.className = 'pl-modal';
    bg.setAttribute('aria-label', title);
    bg.innerHTML = `<div class="cfm" style="width:min(1160px,94vw);max-width:none;max-height:85vh;overflow:auto"><div class="pl-bar"><h3>${title}</h3><span style="flex:1"></span><button class="btn" data-close>닫기</button></div>${html}</div>`;
    bg.addEventListener('close', () => { bg.remove(); if (previous?.isConnected) previous.focus(); });
    bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) bg.close(); });
    document.body.appendChild(bg); bg.showModal(); $('[data-close]', bg).focus();
    return bg;
  }
  function reportHTML(j, running) {
    const p = j.report?.period;
    const files = j.report?.files || [];
    return `<div class="pl-bar" style="margin-top:8px"><b>실적 보고서</b><span class="muted">${p ? e2(p.start + ' ~ ' + p.end) : '기간 미지정'} · ${files.length ? '인식한 키워드 ' + n0(j.report.keywords) + '개' : '저장된 원본 없음'}</span>
      ${running ? '' : '<button class="btn sm" id="plReport">실적 파일·기간 설정</button>'}
      ${files.map((f,i) => f.original ? `<a class="ext" href="/api/pl/report-file?id=${encodeURIComponent(j.id)}&i=${i}" title="업로드 원본 그대로 다운로드">${e2(f.name)}</a>` : e2(f.name)).join(' ')}</div>`;
  }
  function bindReport() {
    const b = $('#plReport'); if (!b) return;
    b.onclick = () => editReport(S.job.id, S.job.report?.period, () => draw());
  }
  function editReport(id, period, onSaved) {
      const bg = dialogPL('실적 파일·기간 설정', `<p class="muted">광고관리에서 같은 범위로 받은 키워드별 실적 보고서 기간을 입력하세요. 파일을 새로 고르면 이 분석에 저장된 원본 세트를 교체하고, 고르지 않으면 날짜만 수정합니다.</p><div class="pl-bar">${periodFields(period || {})}</div><p><input type="file" aria-label="실적 보고서 파일" accept=".xlsx,.xlsm,.csv,.txt" multiple></p><button class="btn pri" data-save>저장</button><p class="muted" role="status"></p>`);
      $('[data-save]', bg).onclick = async e => {
        const btn = e.currentTarget, status = $('[role=status]', bg); btn.disabled = true; status.textContent = '파일을 확인하고 저장 중…';
        try {
          const files = [...$('input[type=file]', bg).files];
          const data = await api('/api/pl/report', { id, period: getPeriod(bg), reports: await Promise.all(files.map(readReport)) });
          if (S.job?.id === id) S.job.report = data.report;
          onSaved?.(data.report);
          $('[data-close]', bg).click(); toast('실적 자료와 기간을 저장했어요.', 'ok');
        } catch (x) { status.textContent = x.message; btn.disabled = false; }
      };
  }
  async function openCompare() {
    const j = S.job, trigger = $('#plCompare');
    if (trigger.disabled) return;
    trigger.disabled = true; trigger.textContent = '내역 불러오는 중…';
    try {
      const { jobs } = await api('/api/pl/jobs');
      const ready = jobs.filter(m => m.status !== 'running');
      const options = id => '<option value="">분석 선택</option>' + ready.map(m => `<option value="${e2(m.id)}" ${id === m.id ? 'selected' : ''}>${e2(m.name)} · ${e2(m.period ? m.period.start + ' ~ ' + m.period.end : '실적 기간 미지정')}</option>`).join('');
      const bg = dialogPL('파워링크 두 기간 비교', `<div class="pl-bar"><label>기준 기간 <select class="inp" data-cmp="a">${options(S.prev?.id)}</select></label><label>비교 기간 <select class="inp" data-cmp="b">${options(j?.id)}</select></label><button class="btn pri" data-run>비교</button></div><p class="muted">같은 광고 URL·계정·보고서 범위를 비교하세요. 보고서 실적은 기간 합계·일평균, 순위는 두 분석에서 측정한 PC·모바일 스냅샷입니다.</p><div data-check class="pl-bar" role="status"></div><div data-status role="status"></div><div data-output></div>`, trigger);
      const sels = $$('[data-cmp]', bg), btn = $('[data-run]', bg), check = $('[data-check]', bg), status = $('[data-status]', bg), out = $('[data-output]', bg);
      let busy = false;
      function validate() {
        const [a,b] = sels.map(s => ready.find(x => x.id === s.value));
        check.replaceChildren();
        const text = !ready.length ? '먼저 파워링크 분석을 저장하세요.' : !a || !b ? '비교할 두 분석을 선택하세요.' : a === b ? '서로 다른 두 분석을 선택하세요.' : !a.period || !b.period ? '기간이 없는 분석의 실적 자료를 보완하세요.' : a.period.end >= b.period.start ? '기준 기간이 먼저 오도록, 겹치지 않는 기간을 선택하세요.' : '';
        if (text) check.append(text);
        for (const [i,m] of [a,b].entries()) if (m) {
          const fix = document.createElement('button'); fix.className = 'btn sm'; fix.textContent = (i ? '비교' : '기준') + ' 자료 설정'; fix.disabled = busy;
          fix.onclick = () => editReport(m.id, m.period, report => {
            m.period = report.period; out.replaceChildren(); status.textContent = '실적 자료를 저장했어요.';
            sels.forEach(sel => { const val = sel.value; sel.innerHTML = options(val); }); validate();
          }); check.append(fix);
        }
        btn.disabled = busy || !!text;
      }
      sels.forEach(sel => sel.onchange = () => { status.textContent = ''; out.replaceChildren(); validate(); }); validate();
      btn.onclick = async () => {
        busy = true; validate(); sels.forEach(s => s.disabled = true); status.textContent = '비교하는 중…';
        try { renderComparison(out, await api('/api/pl/compare', { a: sels[0].value, b: sels[1].value })); status.textContent = '비교 결과를 불러왔어요.'; }
        catch (x) { status.textContent = '비교 실패: ' + x.message; }
        finally { busy = false; sels.forEach(s => s.disabled = false); validate(); }
      };
    } catch (e) { toast(e.message, 'warn'); }
    finally { trigger.disabled = false; trigger.textContent = '두 기간 비교'; }
  }

  function renderComparison(out, c) {
    const f = n => n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    const signed = n => n == null ? '—' : (n > 0 ? '+' : '') + f(n);
    const percent = n => n == null ? '—' : f(n * 100) + '%';
    const s = c.summary;
    const metric = (name, a, b, da, db, pct) => `<div class="card"><b>${name}</b><div>${f(a)} → ${f(b)}</div><div class="muted">일평균 ${f(da)} → ${f(db)} · ${pct == null ? '변화율 미표시' : signed(pct) + '%'}</div></div>`;
    out.innerHTML = `<p><b>${e2(c.pa.start)} ~ ${e2(c.pa.end)}</b> (${c.pa.days}일) → <b>${e2(c.pb.start)} ~ ${e2(c.pb.end)}</b> (${c.pb.days}일)</p>
      <div class="grid g3">${s.matched ? metric('실제 노출수', s.ai, s.bi, s.ia, s.ib, s.impPct) + metric('실제 클릭수', s.ac, s.bc, s.ca, s.cb, s.clkPct) + `<div class="card"><b>CTR</b><div>${percent(s.ta)} → ${percent(s.tb)}</div></div>` : '<p>실적을 합산할 수 있는 키워드가 없어요.</p>'}</div>
      <p class="muted">실적 비교 가능 ${f(s.matched)}개 · 보고서 한쪽에만 있음 ${f(s.onlyA)} / ${f(s.onlyB)}개 · 중복 제외 ${f(s.duplicates)}개 · 식별 가능한 노출 기준 포함 비중 ${percent(s.coverageA)} → ${percent(s.coverageB)}</p>
      <p class="muted">${c.rank.length ? c.rank.map(r => `${DEVN[r.dev]} 순위 ${f(r.avgA)} → ${f(r.avgB)} (양쪽 노출 ${f(r.paired)}개, 하락 ${f(r.down)}개, 미노출 전환 ${f(r.lost)}개)`).join(' · ') : '공통 측정 기기가 없어요.'}</p>
      <div class="pl-compare-grid"><div>
      <div class="pl-bar" style="margin-top:10px"><label>키워드 찾기 <input class="inp" data-search></label><label><input type="checkbox" data-down> 하락만</label><span data-count class="muted"></span><button class="btn" data-export="csv">비교 CSV</button><button class="btn" data-export="txt">키워드 TXT</button></div>
      <div class="tbl-wrap" style="max-height:420px"><table class="rel"><thead><tr><th class="l">키워드</th>${c.dev.map(d => '<th>' + DEVN[d] + ' 순위</th>').join('')}<th>실제 노출수</th><th>실제 클릭수</th><th>클릭/일 증감</th><th>상태</th></tr></thead><tbody></tbody></table></div></div><aside class="card"><b>하락 진단 · AI 미사용</b><ul>${c.notes.map(n => '<li>' + e2(n) + '</li>').join('')}</ul></aside></div>`;
    const rankText = x => (x.aMiss ? '미노출' : f(x.a)) + ' → ' + (x.bMiss ? '미노출' : f(x.b));
    const status = r => r.duplicate ? '중복 제외' : r.ok ? '비교 가능' : r.aOnly ? '기준에만 있음' : r.bOnly ? '비교에만 있음' : '실적 미확인';
    const values = r => [r.kw, ...c.dev.map(d => rankText(r.rank[d])), f(r.ai) + ' → ' + f(r.bi), f(r.ac) + ' → ' + f(r.bc), signed(r.dc), status(r)];
    const selected = () => { const q = $('[data-search]', out).value.trim().toUpperCase().replace(/\s+/g, ''); return c.rows.filter(r => r.kw.toUpperCase().replace(/\s+/g, '').includes(q) && (!$('[data-down]', out).checked || r.dc < 0 || r.di < 0 || Object.values(r.rank).some(x => x.change > 0 || x.a != null && x.bMiss))); };
    const drawRows = () => { const rows = selected(); $('[data-count]', out).textContent = f(rows.length) + '개' + (rows.length > 200 ? ' · 화면 상위 200개, 파일은 필터 전체' : ''); $('tbody', out).innerHTML = rows.slice(0, 200).map(r => '<tr>' + values(r).map((v,i) => '<td' + (i ? '' : ' class="l"') + '>' + e2(v) + '</td>').join('') + '</tr>').join(''); };
    $('[data-search]', out).oninput = $('[data-down]', out).onchange = drawRows; drawRows();
    $$('[data-export]', out).forEach(btn => btn.onclick = () => {
      const rows = selected(); const kind = btn.dataset.export;
      const csv = r => r.map((v, i) => '"' + (i === 0 ? String(v).replace(/^[\s]*[=+@-]/, m => "'" + m) : String(v)).replaceAll('"','""') + '"').join(',');
      const head = ['키워드', ...c.dev.map(d => DEVN[d] + ' 순위'), '기준 노출수', '비교 노출수', '기준 클릭수', '비교 클릭수', '일평균 노출 증감', '일평균 클릭 증감', '상태'];
      const text = kind === 'txt' ? rows.map(r => r.kw.replace(/\s+/g, '')).join('\r\n') : [head, ...rows.map(r => [r.kw, ...c.dev.map(d => rankText(r.rank[d])), r.ai ?? '', r.bi ?? '', r.ac ?? '', r.bc ?? '', r.di ?? '', r.dc ?? '', status(r)])].map(csv).join('\r\n');
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' })); link.download = '파워링크기간비교_' + c.pb.end + '.' + kind; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  }

  function draw() {
    const box = $('#plBody');
    if (!box) return;
    drawSide();
    box.innerHTML = `<div class="sec"><h2>파워링크 분석기 <span class="muted" style="font-size:13px;font-weight:500">내 파워링크가 실제 네이버 검색 화면(로그아웃 상태)에서 몇 위인지 · AI 없이 이 PC에서 직접 검색</span></h2>
      ${compareLauncher()}${S.job ? jobHTML() : newHTML()}</div>`;
    $('#plCompare').onclick = openCompare;
    S.job ? bindJob() : bindNew();
  }

  // ---- 새 분석
  const etaOf = (sec) => (sec < 60 ? `약 ${Math.ceil(sec)}초` : sec < 3600 ? `약 ${Math.round(sec / 60)}분` : `약 ${Math.floor(sec / 3600)}시간 ${Math.round((sec % 3600) / 60)}분`);
  const cntTxt = () => { const rows = S.draft.rows, on = rows.filter((r) => r.on).length; return { head: rows.length ? `${rows.length.toLocaleString('ko-KR')}개 중 ${on.toLocaleString('ko-KR')}개 체크` : '', bar: `체크한 ${on.toLocaleString('ko-KR')}개 × ${S.devices.map((d) => DEVN[d]).join('·')} · 예상 ${etaOf(on * S.devices.length * (runs() + 1.3) * gapS())}` }; };
  function newHTML() {
    const rows = S.draft.rows, on = rows.filter((r) => r.on).length, C = cntTxt();
    const view = rows.slice(0, 300);
    return `<div class="grid g2">
      <div class="card"><h3>① 내 광고 · 조건</h3>
        <label class="muted" style="display:block">내 파워링크 URL <span style="font-size:12px">(고유번호·추적값 없어도 돼요. PC·모바일 주소가 다르면 둘 다, 한 줄에 하나)</span></label>
        <textarea id="plUrls" class="inp" rows="2" placeholder="https://www.example.com/event">${e2(S.urls)}</textarea>
        <div class="pl-opts">
          <span class="muted">기기</span>
          <label class="inl"><input type="checkbox" data-dev="pc" ${S.devices.includes('pc') ? 'checked' : ''}> PC</label>
          <label class="inl"><input type="checkbox" data-dev="mo" ${S.devices.includes('mo') ? 'checked' : ''}> 모바일</label>
          <span class="muted" style="margin-left:10px">n위 입찰가</span>
          PC <select id="plNPc" class="hsel">${Array.from({ length: 10 }, (_, i) => `<option ${S.nPc === i + 1 ? 'selected' : ''} value="${i + 1}">${i + 1}위</option>`).join('')}</select>
          모바일 <select id="plNMo" class="hsel">${Array.from({ length: 5 }, (_, i) => `<option ${S.nMo === i + 1 ? 'selected' : ''} value="${i + 1}">${i + 1}위</option>`).join('')}</select>
        </div>
        <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.7">키워드마다 <b>${runs()}번</b> 검색해서 평균 순위를 내요 (<a href="#" class="ext" id="plSet">설정 › ⑥ 파워링크 분석기</a>에서 1~5회). 검색 사이 ${gapS()}초씩 쉬고, 네이버 검색 제한에 걸리면 자동으로 쉬었다 이어가요.<br>순위는 '광고 더보기'까지 봐요 (PC 최대 25위 · 모바일 최대 15위). 캡처는 통합검색 파워링크 영역, 그 밖이면 광고 더보기 화면이에요.</div>
      </div>
      <div class="card"><h3>② 키워드 <span class="muted" style="font-size:13px" id="plCnt">${C.head}</span></h3>
        <div class="drop" id="plDrop">네이버 광고관리 <b>키워드 다운로드 엑셀</b>을 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" id="plFile" accept=".xlsx,.xlsm,.csv,.txt" hidden></label>
          <div class="muted" style="margin-top:4px">키워드 · 입찰가 · 상태 · 통검 평균노출순위 · 실제 노출수·클릭수를 읽고 원본을 저장해요. '노출가능'만 체크돼요${S.draft.file ? ` · 저장할 원본 ${S.draft.reports.length}개 · 최근 파일: ${e2(S.draft.file)}` : ''}</div></div>
        <label class="muted" style="display:block;margin-top:10px">엑셀 표 붙여넣기 <span style="font-size:12px">(DRM 등으로 파일을 못 넣을 때: 엑셀에서 머리글을 포함해 전체 열을 복사한 뒤 아래 칸에 Ctrl+V)</span></label>
        <textarea id="plPaste" class="inp" rows="3" placeholder="엑셀에서 '키워드 · 입찰가 · 상태 …' 머리글 줄부터 복사해서 붙여넣으면 바로 목록에 들어가요&#10;직접 쓸 때는 한 줄에 &quot;키워드&quot; 또는 &quot;키워드, 입찰가&quot; → [목록에 추가]"></textarea>
        <button class="btn" id="plPasteAdd" style="margin-top:6px">목록에 추가</button>
      </div>
    </div>
    ${rows.length ? `<div class="card" style="margin-top:14px">
      <div class="pl-bar"><button class="btn" data-pick="ok">노출가능만</button><button class="btn" data-pick="all">전체</button><button class="btn" data-pick="none">모두 해제</button><button class="btn" data-find title="키워드 찾기 (Ctrl+F)">⌕ 키워드 찾기</button>
        <span class="muted" id="plEta">${C.bar}</span><span style="flex:1"></span>
        <input id="plName" class="inp" style="width:220px" placeholder="분석 이름 (비우면 자동)">
        <button class="btn" id="plClr">목록 비우기</button><button class="btn pri" id="plGo">분석 시작</button></div>
      <div class="tbl-wrap" style="max-height:420px;margin-top:10px"><table class="rel"><thead><tr><th style="width:34px"><input type="checkbox" id="plAll" ${rows.every((r) => r.on) ? 'checked' : ''}></th><th>#</th><th class="l">키워드</th><th class="l">상태</th><th>현재 입찰가</th><th>계정 PC 평균순위</th><th>계정 모바일 평균순위</th></tr></thead>
      <tbody>${view.map((r, i) => `<tr data-kw="${e2(r.kw)}"><td><input type="checkbox" data-on="${i}" ${r.on ? 'checked' : ''}></td><td class="muted">${i + 1}</td><td class="l"><b>${e2(r.kw)}</b></td><td class="l ${r.state && r.state !== '노출가능' ? 'muted' : ''}">${e2(r.state || '')}</td><td>${r.bid == null ? '' : n0(r.bid) + '원'}</td><td>${r.acctPc || ''}</td><td>${r.acctMo || ''}</td></tr>`).join('')}</tbody></table>
      ${rows.length > view.length ? `<div class="muted" style="padding:8px">… 나머지 ${(rows.length - view.length).toLocaleString('ko-KR')}개는 표에서 생략 (체크 상태는 그대로 반영)</div>` : ''}</div></div>` : ''}`;
  }
  function bindNew() {
    $('[data-period]', $('#plBody')).forEach(x => x.oninput = () => { S.draft.period[x.dataset.period] = x.value; });
    $$('[data-find]').forEach((b) => (b.onclick = () => Finder.open()));
    $('#plUrls').oninput = (e) => { S.urls = e.target.value; localStorage.setItem('plUrls', S.urls); };
    $$('[data-dev]').forEach((c) => (c.onchange = () => { S.devices = $$('[data-dev]').filter((x) => x.checked).map((x) => x.dataset.dev); localStorage.setItem('plDevs', JSON.stringify(S.devices)); draw(); }));
    $('#plNPc').onchange = (e) => { S.nPc = +e.target.value; localStorage.setItem('plNPc', S.nPc); };
    $('#plNMo').onchange = (e) => { S.nMo = +e.target.value; localStorage.setItem('plNMo', S.nMo); };
    $('#plSet').onclick = (e) => { e.preventDefault(); window.openSettings?.('rules'); };
    const dz = $('#plDrop');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
    $('#plFile').onchange = (e) => addFiles([...e.target.files]);
    $('#plPasteAdd').onclick = () => { const r = fromPaste($('#plPaste').value); if (!r.length) return; mergeRows(r); draw(); };
    // 엑셀 표를 붙여넣으면 바로 표로 읽어서 목록에 추가 (머리글 '키워드'가 있으면 입찰가·상태·평균노출순위 열도 읽음)
    $('#plPaste').addEventListener('paste', (e) => {
      const rows = window.XlsxLite?.clipRows(e.clipboardData, { raw: true });
      if (!rows || !rows.some(r => r.length > 1)) return;
      e.preventDefault();
      const got = fromSheet(rows);
      if (!got.length) return toast('붙여넣은 표에서 키워드를 찾지 못했어요', 'warn');
      const before = S.draft.rows.length;
      mergeRows(got);
      S.draft.reports.push({ name: '붙여넣은 표', sheets: [{ name: '붙여넣은 표', rows }] });
      S.draft.file = S.draft.file || '붙여넣은 표';
      draw();
      toast(`붙여넣은 표: 키워드 ${got.length.toLocaleString('ko-KR')}개 (새로 추가 ${(S.draft.rows.length - before).toLocaleString('ko-KR')}개 · 노출가능 ${got.filter((r) => r.on).length.toLocaleString('ko-KR')}개 체크)`, 'ok');
    }, true);
    if (!$('#plGo')) return;
    $$('[data-pick]').forEach((b) => (b.onclick = () => { const k = b.dataset.pick; S.draft.rows.forEach((r) => (r.on = k === 'all' ? true : k === 'none' ? false : !r.state || r.state === '노출가능')); draw(); }));
    $('#plAll').onchange = () => { const on = !S.draft.rows.every((r) => r.on); S.draft.rows.forEach((r) => (r.on = on)); draw(); };
    $$('[data-on]').forEach((c) => (c.onchange = () => { S.draft.rows[+c.dataset.on].on = c.checked; const C = cntTxt(); $('#plCnt').textContent = C.head; $('#plEta').textContent = C.bar; $('#plAll').checked = S.draft.rows.every((r) => r.on); }));
    $('#plClr').onclick = () => { S.draft = { rows: [], file: '', paste: '', reports: [], period: {} }; draw(); };
    $('#plGo').onclick = start;
  }

  // ---- 작업 결과
  const nOf = (dev) => (dev === 'pc' ? S.nPc : S.nMo);
  function rowsView() {
    const j = S.job, dev = S.dev, n = nOf(dev);
    let rows = j.rows.filter((r) => r.on !== false);
    const band = (BANDS[dev][S.band] || BANDS[dev][0])[0];
    if (band) rows = rows.filter((r) => inBand(r.res?.[dev], band));
    if (S.onlyMiss) rows = rows.filter((r) => r.res?.[dev] && !r.res[dev].seen);
    const val = (r) => {
      const x = r.res?.[dev] || {};
      switch (S.sort.key) {
        case 'kw': return r.kw;
        case 'rank': return x.seen ? x.avg : x.seen === 0 ? 999 : 9999;
        case 'bid': return r.bid ?? -1;
        case 'nbid': return j.bids?.[r.key]?.[dev]?.[n - 1] ?? -1;
        case 'clk': return j.perf?.[`${dev}:${n}`]?.[r.key]?.clk ?? -1;
        default: return r.i;
      }
    };
    return rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y) * S.sort.dir; });
  }
  function jobHTML() {
    const j = S.job, dev = j.devices.includes(S.dev) ? S.dev : j.devices[0], n = nOf(dev);
    S.dev = dev;
    const all = j.rows.filter((r) => r.on !== false), done = all.filter((r) => r.done).length;
    const run = j.status === 'running';
    const P = j.perf?.[`${dev}:${n}`] || {};
    const stats = (() => { const xs = all.map((r) => r.res?.[dev]).filter((x) => x && x.n); const seen = xs.filter((x) => x.seen); return { n: xs.length, seen: seen.length, top3: seen.filter((x) => x.avg <= 3).length, avg: seen.length ? (seen.reduce((a, x) => a + x.avg, 0) / seen.length).toFixed(1) : '-' }; })();
    const left = all.length - done, per = j.devices.length * (j.runs + 1.3) * gapS(), eta = left * per;
    const rows = rowsView(), pages = Math.max(1, Math.ceil(rows.length / PG));
    S.page = Math.min(S.page, pages);
    const view = rows.slice((S.page - 1) * PG, S.page * PG);
    const th = (k, label, l) => `<th class="${l ? 'l' : ''}" data-k="${k}" style="cursor:pointer">${label} ${S.sort.key === k ? (S.sort.dir > 0 ? '▲' : '▼') : '<span class="muted">↕</span>'}</th>`;
    const nSel = `<select id="plN" class="hsel" style="height:26px;padding:0 22px 0 6px">${Array.from({ length: MAXN[dev] }, (_, i) => `<option value="${i + 1}" ${n === i + 1 ? 'selected' : ''}>${i + 1}위</option>`).join('')}</select>`;
    return `<div class="card">
      <div class="pl-bar"><b style="font-size:15px">${e2(j.name)}</b><span class="muted">${new Date(j.createdAt).toLocaleString('ko-KR')} · URL ${j.urls.map(e2).join(', ')} · ${j.runs}회 평균${j.source ? ` · <span title="재분석 때 넣은 파일">새 입찰가: ${e2(j.source.file)} (바뀜 ${j.source.changed}개)</span>` : ''}</span><span style="flex:1"></span>
        ${run ? '<button class="btn" id="plStop">중지</button>' : `${j.status !== 'done' ? '<button class="btn pri" id="plResume">이어서 하기</button>' : ''}<button class="btn" id="plRerun" title="같은 키워드 · URL · 기기로 다시 검사해서 이 분석 아래(스레드)에 붙여요">같은 키워드로 재분석</button>`}
        <button class="btn pri" id="plXlsx" title="원본 열 오른쪽에 파워링크 결과를 붙여 저장해요">엑셀 다운로드</button></div>
      ${reportHTML(j, run)}
      ${S.thread.length > 1 ? `<div class="pl-thread">${S.thread.map((m, i) => { const pct = m.total ? Math.round((m.done / m.total) * 100) : 0, run2 = m.status === 'running'; return `<button class="${m.id === j.id ? 'on' : ''} ${run2 ? 'run' : ''}" data-th="${e2(m.id)}" style="--p:${run2 ? pct : 100}%" title="${run2 ? `진행 중 ${pct}%` : ST[m.status] || ''}"><span>${i === 0 ? '첫 분석' : e2(m.custom ? m.name : '재분석 ' + (m.thread || i))} <small>${run2 ? pct + '%' : fmtD(m.createdAt)}</small></span></button>`; }).join('<span class="muted">›</span>')}</div>` : ''}
      <div class="prog ${run ? '' : j.status === 'done' ? 'done' : 'fail'}" style="margin-top:10px"><div class="prog-top"><b>${run ? `검사 중 · ${e2(S.running?.cur || '')}` : ST[j.status]}${j.error ? ' · ' + e2(j.error) : ''}</b><span>${done.toLocaleString('ko-KR')} / ${all.length.toLocaleString('ko-KR')}개${run && left ? ` · 남은 시간 약 ${eta < 3600 ? Math.max(1, Math.round(eta / 60)) + '분' : Math.floor(eta / 3600) + '시간 ' + Math.round((eta % 3600) / 60) + '분'}` : ''}</span></div>
        <div class="bar"><div style="width:${all.length ? (done / all.length) * 100 : 0}%"></div></div>
        ${run && S.running?.note ? `<div class="muted" style="font-size:12px;margin-top:4px">${e2(S.running.note)}</div>` : ''}
        ${j.bidErr ? `<div style="font-size:12px;margin-top:4px;color:#b45309">${e2(j.bidErr)}</div>` : ''}</div>
    </div>
    <div class="grid g4 pl-stats" style="margin-top:14px">
      <div class="card"><div class="muted">${DEVN[dev]} 검사한 키워드</div><div class="big">${stats.n.toLocaleString('ko-KR')}</div></div>
      <div class="card"><div class="muted">노출됨</div><div class="big">${stats.seen.toLocaleString('ko-KR')}</div><div class="muted">미노출 ${(stats.n - stats.seen).toLocaleString('ko-KR')}개</div></div>
      <div class="card"><div class="muted">평균 3위 이내</div><div class="big">${stats.top3.toLocaleString('ko-KR')}</div></div>
      <div class="card"><div class="muted">노출된 키워드 평균 순위</div><div class="big">${stats.avg}</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="pl-bar">
        <div class="seg">${j.devices.map((d) => `<button class="${d === dev ? 'on' : ''}" data-sd="${d}">${DEVN[d]}</button>`).join('')}</div>
        <div class="seg pl-band">${BANDS[dev].map(([b, l], i) => { const c = all.filter((r) => r.res?.[dev]?.n && inBand(r.res[dev], b)).length; return `<button class="${S.band === i ? 'on' : ''}" data-band="${i}">${l} <small>${c.toLocaleString('ko-KR')}</small></button>`; }).join('')}</div>
        <label class="inl"><input type="checkbox" id="plMiss" ${S.onlyMiss ? 'checked' : ''}> 미노출만</label>
        <button class="btn" data-find title="키워드 찾기 (Ctrl+F) · 치고 Enter → 그 줄로 이동">⌕ 키워드 찾기</button>
        <span style="flex:1"></span><span class="muted">${rows.length.toLocaleString('ko-KR')}개 표시</span>
      </div>
      <div class="tbl-wrap" style="margin-top:10px" id="plTblWrap"><table class="rel pl-tbl"><thead><tr><th>#</th>${th('kw', '키워드', 1)}${th('rank', '순위')}<th>순위 캡처</th>${th('bid', '현재 입찰가')}<th data-k="nbid" style="cursor:pointer">${nSel} 입찰가 ${S.sort.key === 'nbid' ? (S.sort.dir > 0 ? '▲' : '▼') : '<span class="muted">↕</span>'}</th>${th('clk', `${n}위 예상 (월)`)}</tr></thead>
      <tbody>${view.map((r) => {
        const x = r.res?.[dev], nb = j.bids?.[r.key]?.[dev]?.[n - 1], p = P[r.key];
        const pv = S.prev?.ranks?.[r.key]?.[dev];
        const chg = !x || !x.n || pv == null ? '' : !x.seen && pv ? '<span class="pl-chg dn">빠짐</span>' : x.seen && !pv ? '<span class="pl-chg up">새로 노출</span>' : x.seen && pv ? (Math.abs(pv - x.avg) < 0.05 ? '<span class="pl-chg">변화 없음</span>' : `<span class="pl-chg ${x.avg < pv ? 'up' : 'dn'}">${x.avg < pv ? '▲' : '▼'}${Math.round(Math.abs(pv - x.avg) * 10) / 10}</span>`) : '';
        const rank = !x ? `<span class="muted">${run ? '대기' : '-'}</span>` : x.seen ? `<b class="pl-rk ${x.avg <= 3 ? 'pl-top' : ''}">${x.avg}위</b><div class="muted" style="font-size:11px">${x.min === x.max ? '' : `${x.min}~${x.max}위 · `}${x.seen}/${x.n}회 노출${x.mainCount != null && x.avg > x.mainCount ? ' · 통합검색 밖' : ''}</div>${x.match && x.match.score < 3 ? `<div class="pl-warn" title="${e2(x.match.display)}">${x.match.score === 1 ? '도메인만 일치' : '경로 다름'}</div>` : ''}`
          : `<span class="pl-miss">미노출</span><div class="muted" style="font-size:11px">${x.n}회 모두 · 광고 ${x.total || 0}개 중</div>`;
        const cap = x?.cap && j.purged ? '<span class="muted" style="font-size:12px">캡처 지움</span>' : x?.cap ? `<img class="pl-th" loading="lazy" src="/api/pl/img?id=${e2(j.id)}&f=${e2(x.cap.focus || x.cap.thumb)}" data-full="/api/pl/img?id=${e2(j.id)}&f=${e2(x.cap.file)}" data-t="${e2(r.kw)} · ${DEVN[dev]} · 캡처 당시 ${x.cap.rank ? x.cap.rank + '위' : '미노출'}${x.cap.where === 'more' ? ' (광고 더보기)' : ''}" alt=""><div class="muted" style="font-size:11px">캡처 당시 ${x.cap.rank ? x.cap.rank + '위' : '미노출'}${x.cap.where === 'more' ? ' · 더보기' : ''}</div>` : x?.capErr ? `<span class="muted" title="${e2(x.capErr)}">캡처 실패</span>` : '';
        const diff = r.bid != null && nb != null ? nb - r.bid : null;
        return `<tr data-kw="${e2(r.kw)}"><td class="muted">${r.i}</td><td class="l"><b>${e2(r.kw)}</b></td><td>${rank}${chg ? `<div title="앞 분석(${e2(S.prev?.name || '')}) ${pv ? pv + '위' : '미노출'} 대비">${chg}</div>` : ''}</td><td class="pl-cap">${cap}</td>
          <td>${r.bid == null ? '<span class="muted">-</span>' : n0(r.bid) + '원'}${(() => { const ob = S.prev?.ranks?.[r.key]?.bid; return ob != null && r.bid != null && ob !== r.bid ? `<div class="pl-chg ${r.bid > ob ? 'dn' : 'up'}" title="앞 분석의 입찰가" style="font-weight:500;display:block">전 ${n0(ob)}원</div>` : ''; })()}</td>
          <td>${nb == null ? `<span class="muted" title="${e2(j.bids?.[r.key]?.[dev + 'Err'] || '')}">-</span>` : `${n0(nb)}원${diff ? `<div class="${diff > 0 ? 'pl-up' : 'pl-dn'}" style="font-size:11px">${diff > 0 ? '+' : ''}${n0(diff)}원</div>` : ''}`}</td>
          <td>${!p ? '<span class="muted">-</span>' : p.err ? `<span class="muted" title="${e2(p.err)}">조회 실패</span>` : `클릭 ${n0(p.clk)}회<div class="muted" style="font-size:11px">노출 ${n0(p.imp)} · 비용 ${n0(p.cost)}원</div>`}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => `<button class="${S.page === i + 1 ? 'on' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}
      <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.7">순위 = 키워드마다 ${j.runs}번 검색한 평균 (노출된 회차만). 캡처는 순위 검색과 별도로 한 번 더 열어서 찍어서 순위가 조금 다를 수 있어요. ${n}위 입찰가 = 네이버 검색광고 API '순위별 평균 입찰가'(최근 4주), 아래 +/− 는 현재 입찰가와의 차이. ${n}위 예상 = 그 입찰가로 냈을 때 네이버 예상 실적(월). 로그인 여부·지역·시간대에 따라 실제 화면과 다를 수 있어요.</div>
    </div>`;
  }
  function bindJob() {
    bindReport();
    $$('[data-find]').forEach((b) => (b.onclick = () => Finder.open()));
    const j = S.job;
    $('#plStop')?.addEventListener('click', async () => { await api('/api/pl/stop', { id: j.id }).catch(() => {}); toast('중지할게요 (지금 키워드까지 마치고 멈춰요)', 'ok'); });
    $('#plRerun')?.addEventListener('click', () => rerun(j.id).catch((e) => toast(e.message, 'warn')));
    $$('[data-th]').forEach((b) => (b.onclick = () => openJob(b.dataset.th)));
    $('#plResume')?.addEventListener('click', async () => { try { await api('/api/pl/resume', { id: j.id }); await openJob(j.id); loadJobs(); } catch (e) { toast(e.message, 'warn'); } });
    $('#plXlsx').onclick = () => { toast('엑셀을 만드는 중이에요', 'ok'); location.href = `/api/pl/xlsx?id=${encodeURIComponent(j.id)}&nPc=${S.nPc}&nMo=${S.nMo}`; };
    $$('[data-sd]').forEach((b) => (b.onclick = () => { S.dev = b.dataset.sd; localStorage.setItem('plDev', S.dev); S.page = 1; draw(); ensurePerf(); }));
    $$('[data-band]').forEach((b) => (b.onclick = () => { S.band = +b.dataset.band; S.page = 1; draw(); }));
    $('#plMiss').onchange = (e) => { S.onlyMiss = e.target.checked; S.page = 1; draw(); };
    $('#plN').onclick = (e) => e.stopPropagation();
    $('#plN').onchange = (e) => { const v = +e.target.value; if (S.dev === 'pc') { S.nPc = v; localStorage.setItem('plNPc', v); } else { S.nMo = v; localStorage.setItem('plNMo', v); } draw(); ensurePerf(); };
    $$('#plTblWrap th[data-k]').forEach((t) => (t.onclick = () => { const k = t.dataset.k; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : k === 'kw' || k === 'rank' ? 1 : -1 }; draw(); }));
    $$('.pl-th').forEach((im) => (im.onclick = () => showImg(im.dataset.full, im.dataset.t)));
    $$('[data-pg]').forEach((b) => (b.onclick = () => { S.page = +b.dataset.pg; draw(); $('#plTblWrap').scrollIntoView({ block: 'start' }); }));
  }
  // n을 바꾸면 그 순위 입찰가의 예상 실적을 가져옴 (한 번 가져온 건 저장)
  async function ensurePerf() {
    const j = S.job, dev = S.dev, n = nOf(dev);
    if (!j || S.perfBusy || !j.bids || j.perf?.[`${dev}:${n}`] && Object.keys(j.perf[`${dev}:${n}`]).length) return;
    S.perfBusy = true;
    try { const r = await api('/api/pl/perf', { id: j.id, dev, n }); j.perf = j.perf || {}; j.perf[`${dev}:${n}`] = r.perf || {}; } catch (e) { toast('예상 실적: ' + e.message, 'warn'); }
    S.perfBusy = false;
    if (S.job === j) draw();
  }

  // ---------------------------------------------------------------- 키워드 찾기 (작은 창)
  const nk = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
  var Finder = (() => {
    const box = document.createElement('div');
    box.className = 'pl-find hidden';
    box.innerHTML = '<span class="pl-find-ic">⌕</span><input id="plFindQ" placeholder="찾을 키워드 · Enter" autocomplete="off"><span class="muted" id="plFindN"></span><button title="이전 (Shift+Enter)" data-fd="-1">▲</button><button title="다음 (Enter)" data-fd="1">▼</button><button title="닫기 (Esc)" data-fd="x">✕</button>';
    document.body.appendChild(box);
    const inp = box.querySelector('input'), cnt = box.querySelector('#plFindN');
    let hits = [], at = -1, lastQ = '', curKw = '';
    const list = () => (S.job ? rowsView() : S.draft.rows);
    function search() {
      const q = nk(inp.value);
      lastQ = inp.value;
      if (!q) { hits = []; at = -1; cnt.textContent = ''; return; }
      const rows = list();
      const exact = [], part = [];
      rows.forEach((r, i) => { const k = nk(r.kw); if (k === q) exact.push(i); else if (k.includes(q)) part.push(i); });
      hits = [...exact, ...part]; // 정확히 같은 키워드를 먼저
      at = -1;
    }
    function go(dir) {
      const qChanged = inp.value !== lastQ;
      search(); // 표가 바뀌었을 수 있어서 매번 새로 찾고, 같은 검색어면 지금 위치 다음부터
      if (!qChanged && curKw) { const rows = list(); at = hits.findIndex((i) => rows[i].kw === curKw); }
      if (!hits.length) { cnt.textContent = inp.value.trim() ? '없음' : ''; box.classList.toggle('none', !!inp.value.trim()); return; }
      box.classList.remove('none');
      at = (at + dir + hits.length) % hits.length;
      cnt.textContent = `${at + 1}/${hits.length}`;
      const idx = hits[at], r = list()[idx];
      curKw = r.kw;
      if (S.job) { const pg = Math.floor(idx / PG) + 1; if (pg !== S.page) { S.page = pg; draw(); } }
      else if (idx >= 300) { toast(`'${r.kw}'는 ${idx + 1}번째라 표에 안 보여요 (300개까지만 표시). 체크 상태는 그대로예요`, 'warn'); return; }
      const tr = [...document.querySelectorAll('#plBody tr[data-kw]')].find((t) => t.dataset.kw === r.kw);
      if (!tr) return;
      document.querySelectorAll('#plBody tr.pl-hit').forEach((t) => t.classList.remove('pl-hit'));
      tr.classList.add('pl-hit');
      tr.scrollIntoView({ block: 'center', behavior: 'instant' });
      // 위쪽 캡처 그림이 늦게 뜨면 줄이 밀려남 → 잠깐 동안 다시 가운데로 (사용자가 스크롤하면 멈춤)
      const job = (Finder._job = (Finder._job || 0) + 1);
      let stop = false;
      const halt = () => { stop = true; ['wheel', 'mousedown', 'touchstart'].forEach((ev) => removeEventListener(ev, halt)); };
      ['wheel', 'mousedown', 'touchstart'].forEach((ev) => addEventListener(ev, halt, { passive: true, once: true }));
      const again = () => { if (stop || job !== Finder._job) return; const r = tr.getBoundingClientRect(); if (Math.abs(r.top + r.height / 2 - innerHeight / 2) > 4) tr.scrollIntoView({ block: 'center', behavior: 'instant' }); };
      [120, 300, 600, 1000, 1600].forEach((ms) => setTimeout(again, ms));
      setTimeout(halt, 1700);
      clearTimeout(tr._hl); tr._hl = setTimeout(() => tr.classList.remove('pl-hit'), 3000);
    }
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    inp.addEventListener('input', () => { cnt.textContent = ''; box.classList.remove('none'); });
    box.querySelectorAll('[data-fd]').forEach((b) => (b.onclick = () => (b.dataset.fd === 'x' ? close() : go(+b.dataset.fd))));
    function open() { box.classList.remove('hidden'); inp.focus(); inp.select(); }
    function close() { box.classList.add('hidden'); }
    // 파워링크 분석기 화면에서 Ctrl+F → 이 찾기 창 (다른 화면에서는 브라우저 기본 찾기)
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !$('#plView')?.classList.contains('hidden')) { e.preventDefault(); open(); }
    });
    return { open, close, reset: () => { hits = []; at = -1; lastQ = ''; cnt.textContent = ''; } };
  })();

  // ---------------------------------------------------------------- 메뉴 열기·닫기
  window.__RESET_pl = () => { clearTimeout(S.timer); S.cur = null; S.job = null; S.draft = { rows: [], file: '', paste: '', reports: [], period: {} }; localStorage.setItem('plCur', ''); draw(); scrollTo(0, 0); return '초기화했어요 (지난 분석은 왼쪽 내역에 있어요)'; };
  function showPl(on) {
    if (on) { $('#aiView')?.classList.add('hidden'); window.__hideDup?.(); window.__hideBulk?.(); window.__hideCopy?.(); window.__hideMock?.(); }
    $('#plView').classList.toggle('hidden', !on);
    if (on) {
      $('#main').classList.add('hidden'); $('#banners')?.classList.add('hidden'); $('#tabs')?.classList.add('hidden');
      history.replaceState(null, '', location.pathname + location.search + '#pl');
      loadJobs();
      const last = localStorage.getItem('plCur');
      if (last && !S.job) openJob(last); else { draw(); poll(); }
    }
  }
  window.showPl = showPl;
  // 헤더는 알려진 작업 상태만 읽으며, 다른 화면에서는 진행 여부만 갱신한다.
  window.__PL_WORK = { read: () => S.running, open: id => S.cur === id ? undefined : openJob(id) };
  setInterval(() => { if (S.running && $('#plView').classList.contains('hidden') && !document.hidden) loadJobs(); }, 5000);
  window.__hidePl = () => {
    Finder.close();
    if ($('#plView').classList.contains('hidden')) return;
    $('#plView').classList.add('hidden');
    $('#main').classList.remove('hidden'); $('#banners')?.classList.remove('hidden');
    try { $('#tabs').classList.toggle('hidden', !STATE); } catch {}
    if (location.hash === '#pl') history.replaceState(null, '', location.pathname + location.search);
  };
  mount();
  draw();
  const others = ['aiView', 'dupView', 'bulkView', 'copyView', 'mockView', 'main'];
  const watch = new MutationObserver(() => { if (!$('#plView').classList.contains('hidden') && others.some((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); })) $('#plView').classList.add('hidden'); });
  others.forEach((id) => { const el = document.getElementById(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  if (location.hash === '#pl') setTimeout(() => (window.__LAYOUT?.go ? window.__LAYOUT.go('pl') : showPl(true)), 0);
})();
