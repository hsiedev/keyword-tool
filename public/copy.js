// AI 카피 생성기: 파워링크 · 브랜드검색 문구를 네이버 규격에 맞춰 만들고 자동 검사
// - 탭 하나 = 파일 하나 (data\copy-projects\), 왼쪽 사이드바 내역
// - 경쟁 파워링크를 읽어 AI에 같이 전달 · 자주 쓰는 표현 표시
// - 규칙 검사(글자 수 · 최상급 · 특수문자 · 띄어쓰기 · 숫자 근거 · 주의어)는 copy-spec.js (PC가 계산)
// - AI 재검증 · 다시 쓰기 · 확정/고정/제외 · TXT/CSV/엑셀 · 광고 목업으로 보내기
(function () {
  const S = window.CopySpec;
  if (!S) return;
  const RC = () => window.SETTINGS?.rules?.copy || {};
  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a" style="flex:none"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';
  const STATUS = { cand: '후보', pick: '확정', drop: '제외' };
  const QUICK = [
    ['fix', '검사 문제 고치기'], ['short', '더 짧게'], ['concrete', '더 구체적으로'], ['number', '근거 있는 숫자 넣기'],
    ['question', '질문형으로'], ['soft', '부드러운 말투로'], ['cta', '행동을 부르게 (상담·계산·가입)'], ['custom', '직접 입력…'],
  ];
  const QUICK_TEXT = {
    fix: '아래 "지금 문제"를 모두 고친다. 글자 수·띄어쓰기·최상급·특수문자·근거 없는 숫자 문제를 없앤다.',
    short: '뜻은 유지하고 더 짧고 간결하게', concrete: '막연한 말 대신 구체적인 상황·혜택으로', number: '[브랜드 정보]에 있는 숫자만 써서 구체적으로 (없으면 숫자 없이)',
    question: '검색한 사람에게 묻는 질문형으로', soft: '부담 없이 부드러운 말투로', cta: '마지막에 상담·계산·가입 같은 행동을 부르게',
  };

  const H = { list: [], cur: null, cache: new Map(), err: '' };
  const C = { busy: '', ctrl: null, filter: 'all', issuesOnly: false, sel: new Set(), preview: false, compBusy: false };
  const defaultForm = () => ({ ch: 'pl', format: 'pl_ad', brand: { name: '', site: '', url: '', product: '', usp: '', facts: '', tone: '' }, keywords: '', angles: ['가격·혜택', '불안 해소', '질문형'], perAngle: RC().perAngle || 3, extra: '', refs: '' });
  const newDoc = () => ({ id: uid(), name: '새 카피', custom: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), form: defaultForm(), items: [], rejected: [], comp: null, draft: true });
  const D = () => H.cur;
  const F = () => D().form;
  const kwList = () => [...new Set(String(F().keywords || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 20);
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

  // ---------------------------------------------------------------- 저장 (서버 파일)
  async function api(body) {
    const r = await fetch('/api/copy-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || '저장 실패 ' + r.status);
    return j;
  }
  let saveT = null;
  function save(now) {
    const d = D();
    if (!d) return;
    d.updatedAt = Date.now();
    if (!d.custom) d.name = autoName(d);
    if (d.draft && !d.items.length && !F().keywords.trim() && !F().brand.name.trim()) { drawSide(); return; }
    clearTimeout(saveT);
    const run = async () => {
      try {
        d.draft = false;
        const { meta } = await api({ doc: d });
        H.list = [meta, ...H.list.filter((m) => m.id !== d.id)];
        H.cache.set(d.id, d); H.err = '';
        if (H.cur === d) localStorage.setItem('copyCur', d.id); // 새로고침해도 이 탭을 다시 엶
      } catch (e) { H.err = '저장하지 못했어요: ' + e.message + ' (서버를 다시 시작하면 생겨요)'; }
      drawSide();
    };
    if (now) run(); else saveT = setTimeout(run, 600);
    drawSide();
  }
  function autoName(d) {
    const k = kwList()[0] || d.form.brand.name || '새 카피';
    return `${k} · ${S.CHANNELS[S.FORMATS[d.form.format]?.ch] || ''}`.slice(0, 60);
  }
  async function loadList() {
    try { const j = await (await fetch('/api/copy-projects')).json(); if (j.error) throw new Error(j.error); H.list = j.list || []; H.err = ''; }
    catch (e) { H.err = '내역을 읽지 못했어요 (서버를 다시 시작하면 생겨요)'; }
    drawSide();
  }
  async function open(id) {
    if (H.cur?.id === id) return;
    if (C.busy) return toast('작업이 끝난 뒤에 바꿔주세요', 'info');
    let d = H.cache.get(id);
    if (!d) {
      try { const j = await (await fetch('/api/copy-projects?id=' + encodeURIComponent(id))).json(); if (j.error) throw new Error(j.error); d = j.doc; H.cache.set(id, d); }
      catch (e) { return toast('불러오지 못했어요: ' + e.message, 'err'); }
    }
    d.form = { ...defaultForm(), ...(d.form || {}), brand: { ...defaultForm().brand, ...(d.form?.brand || {}) } };
    d.items = d.items || []; d.rejected = d.rejected || [];
    H.cur = d; C.sel = new Set();
    localStorage.setItem('copyCur', id);
    drawAll();
  }
  function newTab() { if (C.busy) return; H.cur = newDoc(); C.sel = new Set(); drawAll(); $('#cpKw')?.focus(); }
  window.__RESET_copy = () => {
    if (C.busy) return null;
    const d = H.cur, wasDraft = !!d?.draft;
    save(true);
    const saved = d && !d.draft;
    newTab(); scrollTo(0, 0);
    return saved ? `작성하던 내용은 '${d.name}' 탭에 저장해 두고 초기화했어요 (왼쪽 기록)` : '초기화했어요';
  };

  // ---------------------------------------------------------------- 사이드바
  function drawSide() {
    const side = $('#cSide');
    if (!side) return;
    const cur = D();
    const fmtD = (t) => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : `${d.getMonth() + 1}.${d.getDate()}`; };
    const meta = (m) => (cur && m.id === cur.id
      ? (C.busy ? `${C.busy} 중…` : `카피 ${cur.items.length}개${cur.items.some((x) => x.status === 'pick') ? ` · 확정 ${cur.items.filter((x) => x.status === 'pick').length}` : ''} · ${fmtD(cur.updatedAt)}`)
      : `카피 ${m.count || 0}개${m.picked ? ` · 확정 ${m.picked}` : ''} · ${fmtD(m.updatedAt)}`);
    const item = (m) => `<div class="sit ${cur?.id === m.id ? 'on' : ''}" data-cid="${esc(m.id)}" title="${esc(m.name)} (우클릭: 고정·이름 변경·삭제)"><div class="sn">${m.pinned ? PIN : ''}<span>${esc(m.name)}</span></div><div class="sm">${m.draft ? '새 카피 · 형식과 키워드를 넣고 [카피 생성]' : meta(m)}</div></div>`;
    const list = H.list.map((m) => (cur && m.id === cur.id ? { ...m, name: cur.name, pinned: cur.pinned } : m));
    const top = cur && !list.some((m) => m.id === cur.id) ? item(cur) : '';
    const pinned = list.filter((m) => m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const rest = list.filter((m) => !m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    side.innerHTML = `<button class="btn pri newbtn" id="cSideNew">+ 새 카피</button>
      ${H.err ? `<div style="font-size:11px;color:#b45309;padding:4px 6px;line-height:1.5">${esc(H.err)}</div>` : ''}
      ${top}${pinned.length ? `<div class="side-h">고정됨</div>${pinned.map(item).join('')}` : ''}
      ${pinned.length ? '<div class="side-h">최근</div>' : ''}${rest.map(item).join('') || '<div class="muted" style="padding:6px 10px;font-size:12px">만든 카피가 여기 쌓여요</div>'}`;
    $('#cSideNew').onclick = newTab;
    $$('.sit', side).forEach((el) => {
      el.onclick = () => open(el.dataset.cid);
      el.oncontextmenu = (e) => { e.preventDefault(); sideCtx(e, list.find((x) => x.id === el.dataset.cid)); };
    });
  }
  function menu(e, items) {
    e?.stopPropagation?.(); // 이 클릭이 문서 전체 클릭(메뉴 닫기)으로 번지지 않게
    const box = $('#cCtx');
    box.innerHTML = items.map(([k, label, cls]) => `<button data-a="${k}" class="${cls || ''}">${esc(label)}</button>`).join('');
    box.classList.remove('hidden');
    box.style.left = Math.min(e.clientX, innerWidth - 220) + 'px';
    box.style.top = Math.min(e.clientY, innerHeight - box.offsetHeight - 10) + 'px';
    return new Promise((res) => { $$('button', box).forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); box.classList.add('hidden'); res(b.dataset.a); })); });
  }
  async function sideCtx(e, m) {
    if (!m) return;
    const isCur = D()?.id === m.id;
    const a = await menu(e, [['pin', m.pinned ? '고정 해제' : '상단에 고정'], ['rename', '이름 변경'], ['del', '삭제', 'danger']]);
    const target = isCur ? D() : { ...m };
    if (a === 'pin') { target.pinned = !target.pinned; if (H.cache.get(m.id)) H.cache.get(m.id).pinned = target.pinned; try { const { meta } = await api({ doc: target, metaOnly: !isCur }); H.list = [meta, ...H.list.filter((x) => x.id !== m.id)]; } catch {} drawSide(); }
    if (a === 'rename') {
      const el = $(`#cSide .sit[data-cid="${m.id}"] .sn span`);
      if (!el) return;
      const inp = document.createElement('input'); inp.value = target.name; el.replaceWith(inp); inp.focus(); inp.select();
      const fin = async (okk) => { if (inp._d) return; inp._d = 1; const v = inp.value.trim(); if (okk && v && v !== target.name) { target.name = v.slice(0, 60); target.custom = true; if (H.cache.get(m.id)) Object.assign(H.cache.get(m.id), { name: target.name, custom: true }); try { const { meta } = await api({ doc: target, metaOnly: !isCur }); H.list = [meta, ...H.list.filter((x) => x.id !== m.id)]; } catch {} } drawSide(); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); };
      inp.onblur = () => fin(true); inp.onclick = (ev) => ev.stopPropagation();
    }
    if (a === 'del') {
      if (isCur && C.busy) return;
      if (!await uiConfirm(`'${m.name}' 카피 탭을 삭제할까요? 카피 ${(isCur ? D().items.length : m.count || 0)}개가 같이 지워져요.`)) return;
      try { await api({ delete: m.id }); } catch {}
      H.list = H.list.filter((x) => x.id !== m.id); H.cache.delete(m.id);
      if (isCur) { H.cur = newDoc(); drawAll(); } else drawSide();
    }
  }

  // ---------------------------------------------------------------- 화면 틀
  function mount() {
    const v = document.createElement('div');
    v.id = 'copyView';
    v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><aside class="side" id="cSide"></aside><main class="ai-main" style="max-width:1360px">
      <div class="sec"><h2>AI 카피 생성기 <span class="muted" style="font-size:13px;font-weight:500">파워링크·브랜드검색 문구를 네이버 규격에 맞춰 만들고, PC가 규격·표현을 바로 검사해요</span></h2>
      <div class="cp-layout">
        <div class="cp-left">
          <div class="card"><h3>광고 형식</h3>
            <div class="seg" id="cpCh"><button data-ch="pl">파워링크</button><button data-ch="bs">브랜드검색</button></div>
            <select id="cpFmt" class="inp" style="margin-top:8px"></select>
            <div class="cp-spec" id="cpSpec"></div>
          </div>
          <div class="card"><h3>브랜드 정보 <span class="cp-h-act"><select id="cpBrandSel" class="hsel" title="저장해 둔 브랜드 불러오기"></select><button class="btn sm" id="cpBrandSave" title="이 브랜드 정보를 저장해 두고 다른 탭에서 불러와요">저장</button></span></h3>
            <div class="cp-form">
              <label>업체(광고주) 이름<input class="inp" data-b="name" placeholder="예: ○○손해보험"></label>
              <label>사이트 이름 (10자)<input class="inp" data-b="site" placeholder="예: ○○다이렉트"></label>
              <label class="full">상품·서비스<input class="inp" data-b="product" placeholder="예: 다이렉트 운전자보험"></label>
              <label class="full">강점<textarea class="inp" rows="2" data-b="usp" placeholder="예: 24시간 온라인 가입, 형사합의금·변호사선임비 보장"></textarea></label>
              <label class="full">혜택·근거 <span class="muted">카피의 숫자·혜택은 여기 있는 것만 써요 · 자동 대조</span><textarea class="inp" rows="3" data-b="facts" placeholder="예: 월 9,000원 이상 가입 시 상품권 3만원 (11월 이벤트)&#10;자동차보험 가입자 5% 할인"></textarea></label>
              <label>톤<input class="inp" data-b="tone" placeholder="예: 친근하고 믿음직하게"></label>
              <label>홈페이지<input class="inp" data-b="url" placeholder="예: direct.example.com"></label>
            </div>
          </div>
          <div class="card"><h3>대상 키워드 <button class="btn sm" id="cpCompBtn" title="첫 번째 키워드로 지금 네이버 검색 결과의 파워링크를 읽어요">경쟁 광고 보기</button></h3>
            <textarea id="cpKw" class="inp" rows="2" placeholder="운전자보험, 운전자보험추천 (쉼표·줄바꿈)"></textarea>
            <div class="muted" id="cpKwInfo" style="margin-top:4px"></div>
            <div id="cpComp"></div>
          </div>
          <div class="card"><h3>소구 각도 <span class="muted" id="cpAngN"></span></h3>
            <div class="chips" id="cpAng"></div>
            <div class="cp-row"><label>각도마다 <input type="number" id="cpPer" class="hsel" min="1" max="10" style="width:64px"> 개</label><button class="btn sm" id="cpAngAdd">+ 각도 추가</button></div>
            <label class="cp-lbl">요청 사항 <span class="muted">자유롭게</span></label>
            <textarea id="cpExtra" class="inp" rows="3" placeholder="예: 30~40대 직장인 대상, 형사합의금 걱정을 짚어줘. '무료' 같은 말은 빼줘."></textarea>
            <label class="cp-lbl">참고 카피 <span class="muted">좋아하는 문체 · 한 줄에 하나</span></label>
            <textarea id="cpRefs" class="inp" rows="2" placeholder="예: 사고 나면 형사합의금, 미리 준비하세요"></textarea>
          </div>
          <div class="card cp-run">
            <div class="cp-ai">AI <select class="prov-sel hsel" id="cpProv"></select> 모델 <select class="model-sel hsel" id="cpModel"></select></div>
            <div class="cp-row"><button class="btn pri" id="cpGen">카피 생성</button><button class="btn" id="cpMore" title="지금 결과는 두고 더 받아요">이어서 더</button><button class="btn hidden" id="cpStop">중지</button></div>
            <div class="cp-prog hidden" id="cpProg"><div class="cp-prog-top"><span id="cpProgTxt"></span><span id="cpProgPct"></span></div><div class="cp-track"><div class="cp-fill" id="cpProgBar"></div></div><details><summary>AI 생각 과정</summary><div class="cp-think" id="cpThink"></div></details></div>
            <div id="cpMsg" class="muted"></div>
          </div>
        </div>
        <div class="cp-right">
          <div class="cp-bar">
            <div class="seg" id="cpFilter"></div>
            <label class="cp-chk"><input type="checkbox" id="cpIssues"> 문제 있는 것만</label>
            <label class="cp-chk"><input type="checkbox" id="cpPrev"> 네이버 모양으로 보기</label>
            <span class="cp-sp"></span>
            <button class="btn sm" id="cpRules" title="주의어 · 최상급 검사">검사 규칙</button>
            <button class="btn sm" id="cpTxt">TXT</button><button class="btn sm" id="cpCsv">CSV</button><button class="btn sm" id="cpXlsx">엑셀</button>
          </div>
          <div class="cp-bar cp-selbar">
            <label class="cp-chk"><input type="checkbox" id="cpAll"> 전체 선택</label><span class="muted" id="cpSelN"></span>
            <span class="cp-sp"></span>
            <button class="btn sm" data-bulk="rewrite">다시 쓰기 ▾</button><button class="btn sm" data-bulk="verify">AI 재검증</button>
            <button class="btn sm" data-bulk="pick">확정</button><button class="btn sm" data-bulk="cand">후보로</button><button class="btn sm" data-bulk="drop">제외</button><button class="btn sm" data-bulk="mock">목업에 넣기</button><button class="btn sm" data-bulk="del">삭제</button>
          </div>
          <div id="cpList"></div>
        </div>
      </div></div>
    </main></div><div class="ctx hidden" id="cCtx"></div>`;
    $('#main').after(v);
    document.addEventListener('click', (e) => { if (!e.target.closest('#cCtx')) $('#cCtx')?.classList.add('hidden'); });
    bind();
  }

  function bind() {
    $$('#cpCh button').forEach((b) => (b.onclick = () => { if (F().ch === b.dataset.ch) return; F().ch = b.dataset.ch; F().format = Object.keys(S.FORMATS).find((k) => S.FORMATS[k].ch === b.dataset.ch); drawForm(); save(); }));
    $('#cpFmt').onchange = (e) => { F().format = e.target.value; drawForm(); drawList(); save(); };
    $$('[data-b]').forEach((el) => (el.oninput = () => { F().brand[el.dataset.b] = el.value; save(); clearTimeout(el._t); el._t = setTimeout(drawList, 400); }));
    $('#cpKw').oninput = () => { F().keywords = $('#cpKw').value; kwInfoLine(); save(); clearTimeout(bind._k); bind._k = setTimeout(drawList, 400); };
    $('#cpPer').oninput = () => { F().perAngle = Math.max(1, Math.min(10, Number($('#cpPer').value) || 3)); drawAngles(); save(); };
    $('#cpExtra').oninput = () => { F().extra = $('#cpExtra').value; save(); };
    $('#cpRefs').oninput = () => { F().refs = $('#cpRefs').value; save(); };
    $('#cpAngAdd').onclick = async () => {
      const name = await uiPrompt('추가할 소구 각도 이름', { placeholder: '예: 가족 보호, 직장인 맞춤', max: 20 });
      if (!name || !name.trim()) return;
      const n = name.trim().slice(0, 20);
      if (!F().angles.includes(n)) F().angles.push(n);
      const extra = JSON.parse(localStorage.getItem('copyAngles') || '[]');
      if (!S.ANGLES.includes(n) && !extra.includes(n)) localStorage.setItem('copyAngles', JSON.stringify([...extra, n].slice(-20)));
      drawAngles(); save();
    };
    $('#cpGen').onclick = () => generate(false);
    $('#cpMore').onclick = () => generate(true);
    $('#cpStop').onclick = () => C.ctrl?.abort();
    $('#cpCompBtn').onclick = () => loadComp(true);
    $('#cpIssues').onchange = (e) => { C.issuesOnly = e.target.checked; drawList(); };
    $('#cpPrev').onchange = (e) => { C.preview = e.target.checked; localStorage.setItem('copyPreview', C.preview ? '1' : '0'); drawList(); };
    $('#cpAll').onchange = (e) => { const vis = visible(); if (e.target.checked && !vis.every((x) => C.sel.has(x.id))) vis.forEach((x) => C.sel.add(x.id)); else C.sel = new Set(); drawList(); };
    $$('[data-bulk]').forEach((b) => (b.onclick = (e) => bulk(b.dataset.bulk, e)));
    $('#cpTxt').onclick = () => exportAs('txt');
    $('#cpCsv').onclick = () => exportAs('csv');
    $('#cpXlsx').onclick = () => exportAs('xlsx');
    $('#cpRules').onclick = rulesModal;
    $('#cpBrandSave').onclick = () => {
      const b = F().brand;
      if (!b.name.trim()) return toast('업체 이름을 먼저 넣어주세요', 'info');
      const all = brands().filter((x) => x.name !== b.name);
      localStorage.setItem('copyBrands', JSON.stringify([{ ...b }, ...all].slice(0, 30)));
      drawBrandSel(); toast(`'${b.name}' 브랜드 정보를 저장했어요`, 'ok');
    };
    $('#cpBrandSel').onchange = (e) => {
      const b = brands().find((x) => x.name === e.target.value);
      if (!b) return;
      F().brand = { ...defaultForm().brand, ...b };
      drawForm(); save(); drawList();
    };
    $('#cpProv').onchange = (e) => window.setProvider?.(e.target.value);
    $('#cpModel').onchange = (e) => window.setModel?.(e.target.value);
  }
  const brands = () => { try { return JSON.parse(localStorage.getItem('copyBrands') || '[]'); } catch { return []; } };
  function drawBrandSel() {
    const list = brands();
    $('#cpBrandSel').innerHTML = `<option value="">저장한 브랜드 (${list.length})</option>` + list.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
  }

  // ---------------------------------------------------------------- 입력 영역
  function drawForm() {
    const fm = F();
    $$('#cpCh button').forEach((b) => b.classList.toggle('on', b.dataset.ch === fm.ch));
    $('#cpFmt').innerHTML = Object.entries(S.FORMATS).filter(([, v]) => v.ch === fm.ch).map(([k, v]) => `<option value="${k}" ${k === fm.format ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    const Fm = S.FORMATS[fm.format];
    $('#cpSpec').innerHTML = Fm.fields.map((f) => `<span class="tag">${esc(f.label)} ${f.options ? f.options.join('/') : `${f.min || 0}~${f.max}자`}</span>`).join('') + (Fm.note ? `<div class="muted" style="margin-top:4px">${esc(Fm.note)}</div>` : '') + '<div class="muted" style="margin-top:2px">글자 수는 띄어쓰기 포함으로 세요</div>';
    $$('[data-b]').forEach((el) => { if (document.activeElement !== el) el.value = fm.brand[el.dataset.b] || ''; });
    if (document.activeElement !== $('#cpKw')) $('#cpKw').value = fm.keywords || '';
    $('#cpPer').value = fm.perAngle;
    if (document.activeElement !== $('#cpExtra')) $('#cpExtra').value = fm.extra || '';
    if (document.activeElement !== $('#cpRefs')) $('#cpRefs').value = fm.refs || '';
    drawAngles(); drawComp(); kwInfoLine(); drawBrandSel();
  }
  function drawAngles() {
    const extra = (() => { try { return JSON.parse(localStorage.getItem('copyAngles') || '[]'); } catch { return []; } })();
    const all = [...new Set([...S.ANGLES, ...extra, ...F().angles])];
    $('#cpAng').innerHTML = all.map((a) => `<span class="chip click ${F().angles.includes(a) ? 'on' : ''}" data-ang="${esc(a)}">${esc(a)}</span>`).join('');
    $$('#cpAng [data-ang]').forEach((c) => (c.onclick = () => { const a = c.dataset.ang; F().angles = F().angles.includes(a) ? F().angles.filter((x) => x !== a) : [...F().angles, a]; drawAngles(); save(); }));
    $('#cpAngN').textContent = F().angles.length ? `${F().angles.length}개 × ${F().perAngle} = ${F().angles.length * F().perAngle}개 생성` : '각도를 골라주세요';
  }
  // 분석 화면의 결과(검색량)가 있으면 같이 씀
  function kwInfo() {
    const pool = [];
    try { if (typeof STATE !== 'undefined' && STATE) { if (STATE.volume) pool.push(STATE.volume); (STATE.related || []).forEach((r) => pool.push(r)); } } catch {}
    return kwList().map((k) => { const r = pool.find((x) => S.norm(x.keyword) === S.norm(k)); return r ? { keyword: k, total: r.total, mo: r.mo } : { keyword: k }; });
  }
  function kwInfoLine() {
    const info = kwInfo().filter((x) => x.total != null);
    $('#cpKwInfo').textContent = info.length ? '분석한 검색량을 AI에 같이 보내요: ' + info.map((x) => `${x.keyword} ${Number(x.total).toLocaleString('ko-KR')}회`).join(', ') : '';
  }

  // ---------------------------------------------------------------- 경쟁 광고
  async function loadComp(force) {
    const kw = kwList()[0];
    if (!kw) return toast('대상 키워드를 먼저 넣어주세요', 'info');
    if (!force && D().comp?.keyword === kw) return;
    C.compBusy = true; drawComp();
    try {
      const r = await fetch('/api/copy/competitors?keyword=' + encodeURIComponent(kw));
      const j = r.status === 404 ? { error: '서버가 예전 버전이에요. start.bat을 다시 실행하거나 화면 위 [서버 다시 시작]을 눌러주세요.' } : await r.json();
      if (j.error) throw new Error(j.error);
      D().comp = { keyword: kw, fetchedAt: j.fetchedAt, ads: j.ads || [] };
      save(); drawList();
    } catch (e) { toast(e.message, 'err'); }
    C.compBusy = false; drawComp();
  }
  function compWords(ads) {
    const stop = new Set([...kwList().map(S.norm), S.norm(F().brand.name), S.norm(F().brand.site)].filter(Boolean));
    const cnt = new Map();
    for (const a of ads) {
      const seen = new Set();
      const text = [...a.titles, a.desc, a.promo?.text || ''].join(' ');
      for (const w0 of text.split(/[\s,.!?·()\[\]'"/|:]+/)) {
        const w = w0.replace(/(으로|에서|에게|하고|하는|해요|하세요|입니다|이에요|을|를|이|가|은|는|의|도|로|와|과|에)$/, '');
        if (w.length < 2 || /^\d+$/.test(w) || stop.has(S.norm(w)) || [...stop].some((s) => s && S.norm(w).includes(s))) continue;
        if (a.site && S.norm(a.site).includes(S.norm(w))) continue;
        seen.add(w);
      }
      seen.forEach((w) => cnt.set(w, (cnt.get(w) || 0) + 1));
    }
    return [...cnt].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }
  function drawComp() {
    const box = $('#cpComp');
    const c = D()?.comp;
    if (C.compBusy) { box.innerHTML = '<div class="muted" style="margin-top:8px">네이버 검색 결과에서 파워링크를 읽는 중…</div>'; return; }
    if (!c) { box.innerHTML = ''; return; }
    if (!c.ads.length) { box.innerHTML = `<div class="muted" style="margin-top:8px">'${esc(c.keyword)}' 검색 결과(PC)에 파워링크가 없어요</div>`; return; }
    const ws = compWords(c.ads);
    const promos = c.ads.filter((a) => a.promo).map((a) => (a.promo.prefix ? `[${a.promo.prefix}] ` : '') + a.promo.text);
    box.innerHTML = `<details class="cp-comp" ${localStorage.getItem('copyCompOpen') === '1' ? 'open' : ''}><summary>'${esc(c.keyword)}' 경쟁 파워링크 ${c.ads.length}개 · AI에 같이 보내요 <span class="muted">${new Date(c.fetchedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준 (PC)</span></summary>
      ${ws.length ? `<div class="cp-cw"><span class="muted">여러 광고가 쓰는 말</span> ${ws.map(([w, n]) => `<span class="tag" title="광고 ${n}개가 사용">${esc(w)} ${n}</span>`).join('')}</div>` : ''}
      ${promos.length ? `<div class="cp-cw"><span class="muted">홍보문구</span> ${promos.map((p) => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
      <ol class="cp-ads">${c.ads.map((a) => `<li><b>${esc(a.site)}</b> <span class="muted">${esc(a.url)}</span><div class="cp-at">${esc(a.titles.join(' · '))}</div><div class="cp-ad">${esc(a.desc)}</div>${a.sublinks.length ? `<div class="muted">서브링크: ${esc(a.sublinks.join(' / '))}</div>` : ''}</li>`).join('')}</ol></details>`;
    box.querySelector('details').ontoggle = (e) => localStorage.setItem('copyCompOpen', e.target.open ? '1' : '0');
  }

  // ---------------------------------------------------------------- 검사
  function ctx() {
    const b = F().brand;
    const rc = RC();
    const own = [b.name, b.site].filter(Boolean).map(S.norm);
    const rivals = [...new Set((D().comp?.ads || []).map((a) => a.site).filter((s) => s && !own.some((o) => o && (S.norm(s).includes(o) || o.includes(S.norm(s))))))];
    return {
      brandNames: [b.name, b.site].filter((x) => x && x.trim()), facts: [b.facts, b.usp, b.product].join(' '), keywords: kwList(),
      caution: S.words(rc.caution), superCheck: rc.superCheck !== false, superWords: S.words(rc.superWords || S.SUPER_DEFAULT), rivals,
    };
  }
  function checkAll() {
    const c = ctx();
    const counts = new Map();
    for (const it of D().items) { const k = it.format + '|' + S.norm(S.joinText(it.format, it.f)); counts.set(k, (counts.get(k) || 0) + 1); }
    for (const it of D().items) {
      const k = it.format + '|' + S.norm(S.joinText(it.format, it.f));
      it._chk = S.check(it.format, it.f, { ...c, dupKeys: counts.get(k) > 1 ? new Set([S.norm(S.joinText(it.format, it.f))]) : null });
      it._lv = S.worst(it._chk.issues);
    }
  }
  const problems = (it) => it._chk.issues.filter((i) => i.level !== 'info').map((i) => i.msg).join(' / ');
  const aiScore = (it) => { const ch = it.checks || []; return ch.length ? { ok: ch.filter((x) => x.pass).length, n: ch.length, last: ch[ch.length - 1] } : null; };

  // ---------------------------------------------------------------- 결과 목록
  function visible() {
    return D().items.filter((it) => (C.filter === 'all' ? it.status !== 'drop' : it.status === C.filter) && (!C.issuesOnly || it._lv !== 'ok'));
  }
  function drawFilter() {
    const its = D().items;
    const n = (s) => its.filter((x) => x.status === s).length;
    $('#cpFilter').innerHTML = [['all', `전체 ${its.length - n('drop')}`], ['cand', `후보 ${n('cand')}`], ['pick', `확정 ${n('pick')}`], ['drop', `제외 ${n('drop')}`]].map(([k, t]) => `<button data-f="${k}" class="${C.filter === k ? 'on' : ''}">${t}</button>`).join('');
    $$('#cpFilter button').forEach((b) => (b.onclick = () => { C.filter = b.dataset.f; drawList(); }));
  }
  function drawList() {
    if (!D()) return;
    checkAll();
    drawFilter();
    const vis = visible();
    const ids = new Set(D().items.map((x) => x.id));
    C.sel = new Set([...C.sel].filter((id) => ids.has(id)));
    $('#cpAll').checked = vis.length > 0 && vis.every((x) => C.sel.has(x.id));
    $('#cpSelN').textContent = C.sel.size ? `${C.sel.size}개 선택` : '';
    $('.cp-selbar').classList.toggle('dim', !C.sel.size);
    $('#cpPrev').checked = C.preview;
    const box = $('#cpList');
    if (!D().items.length) {
      box.innerHTML = `<div class="cp-empty"><b>아직 카피가 없어요</b><div class="muted">왼쪽에서 광고 형식 · 브랜드 정보 · 키워드 · 소구 각도를 정하고 [카피 생성]을 눌러주세요. 경쟁 광고를 먼저 보면 겹치지 않게 만들어요.</div></div>`;
      return;
    }
    if (!vis.length) { box.innerHTML = '<div class="cp-empty muted">조건에 맞는 카피가 없어요</div>'; return; }
    // 형식 → 각도 순서로 묶기
    const groups = new Map();
    for (const it of vis) { const g = it.format + '|' + (it.angle || '기타'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
    const fmtOrder = Object.keys(S.FORMATS);
    const keys = [...groups.keys()].sort((a, b) => fmtOrder.indexOf(a.split('|')[0]) - fmtOrder.indexOf(b.split('|')[0]));
    let lastFmt = '';
    box.innerHTML = keys.map((g) => {
      const [fmt, ang] = g.split('|');
      const head = fmt !== lastFmt ? `<div class="cp-fmt-h">${esc(S.CHANNELS[S.FORMATS[fmt].ch])} · ${esc(S.FORMATS[fmt].name)}</div>` : '';
      lastFmt = fmt;
      return `${head}<div class="cp-grp"><div class="cp-grp-h">${esc(ang)} <span class="muted">${groups.get(g).length}개</span></div>${groups.get(g).map(card).join('')}</div>`;
    }).join('');
    bindCards();
  }
  function card(it) {
    const Fm = S.FORMATS[it.format];
    const iss = it._chk.issues;
    const sc = aiScore(it);
    const fields = C.preview && window.__MOCK?.miniPreview
      ? `<div class="cp-pv">${window.__MOCK.miniPreview(it.format, it.f, F().brand, kwList()[0] || '')}</div>`
      : `<div class="cp-fields">${Fm.fields.map((f) => {
        if (f.options) return `<label class="cp-f sm"><span class="cp-fl">${esc(f.label)}</span><select class="hsel" data-k="${f.key}">${f.options.map((o) => `<option ${o === it.f[f.key] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
        const n = it._chk.lens[f.key];
        const bad = iss.some((i) => i.field === f.key && i.level === 'err');
        return `<label class="cp-f"><span class="cp-fl">${esc(f.label)}</span><input class="cp-in ${bad ? 'bad' : ''}" data-k="${f.key}" value="${esc(it.f[f.key] || '')}" maxlength="${(f.max || 60) + 20}"><span class="cp-n ${n > f.max || n < (f.min || 0) ? 'bad' : 'ok'}">${n}/${f.max}</span></label>`;
      }).join('')}</div>`;
    return `<div class="cp-item st-${it.status} lv-${it._lv}" data-id="${it.id}">
      <div class="cp-ih"><input type="checkbox" class="cp-cb" ${C.sel.has(it.id) ? 'checked' : ''}>
        ${it.pin ? PIN : ''}${it.status !== 'cand' ? `<span class="cp-st ${it.status}">${STATUS[it.status]}</span>` : ''}
        ${sc ? `<span class="cp-ai-b ${sc.ok === sc.n ? 'ok' : sc.ok === 0 ? 'bad' : 'mix'}" title="${esc(sc.last.reason)}">AI 적합 ${sc.ok}/${sc.n}</span>` : ''}
        <span class="cp-sp"></span>
        <span class="cp-acts">
          <button data-a="pick" class="${it.status === 'pick' ? 'on' : ''}" title="확정">확정</button>
          <button data-a="pin" class="${it.pin ? 'on' : ''}" title="고정하면 [카피 생성]으로 새로 만들 때도 남아요">고정</button>
          <button data-a="drop" title="제외 목록에 넣고 AI가 비슷하게 쓰지 않게 해요">${it.status === 'drop' ? '되살리기' : '제외'}</button>
          <button data-a="rewrite" title="AI로 다시 쓰기">다시 쓰기 ▾</button>
          ${it.prev ? '<button data-a="undo" title="다시 쓰기 전으로">되돌리기</button>' : ''}
          <button data-a="copy" title="복사">복사</button>
          <button data-a="mock" title="광고 목업 도구에 넣기">목업</button>
        </span></div>
      ${fields}
      ${iss.length ? `<div class="cp-iss">${iss.map((i) => `<span class="iss ${i.level}">${esc(i.msg)}</span>`).join('')}</div>` : '<div class="cp-iss"><span class="iss ok">규격·표현 검사 통과</span></div>'}
      ${(it.why || sc) ? `<div class="cp-why">${it.why ? `<span>의도: ${esc(it.why)}</span>` : ''}${sc ? `<span class="${sc.last.pass ? 'ok' : 'bad'}">AI: ${esc(sc.last.reason)}</span>${(sc.last.risks || []).map((r) => `<span class="iss warn">${esc(r)}</span>`).join('')}` : ''}</div>` : ''}
    </div>`;
  }
  const byId = (id) => D().items.find((x) => x.id === id);
  function bindCards() {
    $$('#cpList .cp-item').forEach((el) => {
      const it = byId(el.dataset.id);
      el.querySelector('.cp-cb').onchange = (e) => { if (e.target.checked) C.sel.add(it.id); else C.sel.delete(it.id); $('#cpSelN').textContent = C.sel.size ? `${C.sel.size}개 선택` : ''; $('.cp-selbar').classList.toggle('dim', !C.sel.size); $('#cpAll').checked = visible().every((x) => C.sel.has(x.id)); };
      $$('[data-k]', el).forEach((inp) => {
        const upd = () => {
          it.f[inp.dataset.k] = inp.value;
          checkAll();
          // 글자 수 · 검사만 바로 고침 (입력 중 커서 유지)
          const fd = S.FORMATS[it.format].fields.find((f) => f.key === inp.dataset.k);
          const n = it._chk.lens[fd.key];
          const cnt = inp.parentElement.querySelector('.cp-n');
          if (cnt) { cnt.textContent = `${n}/${fd.max}`; cnt.className = 'cp-n ' + (n > fd.max || n < (fd.min || 0) ? 'bad' : 'ok'); }
          inp.classList.toggle('bad', it._chk.issues.some((i) => i.field === fd.key && i.level === 'err'));
          const iss = it._chk.issues;
          el.querySelector('.cp-iss').innerHTML = iss.length ? iss.map((i) => `<span class="iss ${i.level}">${esc(i.msg)}</span>`).join('') : '<span class="iss ok">규격·표현 검사 통과</span>';
          el.className = `cp-item st-${it.status} lv-${it._lv}`;
          it.edited = true;
          save();
        };
        inp.oninput = upd; inp.onchange = upd;
      });
      $$('.cp-acts button', el).forEach((b) => (b.onclick = (e) => act(it, b.dataset.a, e)));
    });
  }
  async function act(it, a, e) {
    if (a === 'pick') { it.status = it.status === 'pick' ? 'cand' : 'pick'; }
    if (a === 'pin') it.pin = !it.pin;
    if (a === 'drop') { if (it.status === 'drop') it.status = 'cand'; else { it.status = 'drop'; it.pin = false; reject([it]); } }
    if (a === 'undo' && it.prev) { const p = it.prev; it.prev = null; it.f = p; }
    if (a === 'copy') { try { await navigator.clipboard.writeText(S.joinText(it.format, it.f)); toast('복사했어요', 'ok'); } catch { toast('복사하지 못했어요', 'err'); } return; }
    if (a === 'mock') return toMock([it]);
    if (a === 'rewrite') return rewriteMenu([it], e);
    save(); drawList(); drawSide();
  }
  function reject(items) {
    const set = new Set(D().rejected);
    items.forEach((it) => set.add(S.joinText(it.format, it.f)));
    D().rejected = [...set].slice(-300);
  }
  async function bulk(a, e) {
    const items = D().items.filter((x) => C.sel.has(x.id));
    if (!items.length) return toast('카피를 먼저 선택해 주세요 (체크박스)', 'info');
    if (a === 'rewrite') return rewriteMenu(items, e);
    if (a === 'verify') return verify(items);
    if (a === 'mock') return toMock(items);
    if (a === 'del') {
      if (!await uiConfirm(`선택한 카피 ${items.length}개를 삭제할까요? (제외와 달리 AI에 '비슷하게 쓰지 말라'고 전하지 않아요)`)) return;
      D().items = D().items.filter((x) => !C.sel.has(x.id)); C.sel = new Set();
    }
    if (a === 'pick' || a === 'cand') items.forEach((x) => (x.status = a));
    if (a === 'drop') { items.forEach((x) => { x.status = 'drop'; x.pin = false; }); reject(items); C.sel = new Set(); }
    save(); drawList(); drawSide();
  }
  function toMock(items) {
    if (!window.__MOCK?.addFromCopy) return toast('광고 목업 도구가 준비되지 않았어요', 'err');
    const r = window.__MOCK.addFromCopy(items.map((it) => ({ format: it.format, f: { ...it.f } })), { ...F().brand }, kwList()[0] || '');
    toast(r.msg, r.ok ? 'ok' : 'err');
  }

  // ---------------------------------------------------------------- AI 호출 (스트림)
  async function streamPost(url, body, onEvent, signal) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (res.status === 404) throw new Error('서버가 예전 버전이라 아직 이 기능이 없어요. start.bat을 다시 실행하거나 화면 위 [서버 다시 시작]을 눌러주세요.');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('event-stream')) { const j = await res.json(); if (j.error) throw new Error(j.error); return j; }
    const reader = res.body.getReader();
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
  function prog(label) {
    const root = $('#cpProg');
    root.classList.remove('hidden');
    $('#cpThink').textContent = '';
    let pct = 3; const t0 = Date.now();
    const set = (p, txt) => { pct = Math.max(pct, Math.min(99, p)); $('#cpProgBar').style.width = pct + '%'; $('#cpProgPct').textContent = Math.round(pct) + '%'; if (txt) $('#cpProgTxt').textContent = txt; };
    set(3, label);
    const tick = setInterval(() => { if (pct < 60) set(pct + 0.6); }, 1000);
    return {
      ev(ev) {
        if (ev.type === 'status') set(pct, ev.text);
        if (ev.type === 'thought') { const t = $('#cpThink'); t.textContent += ev.text; t.scrollTop = t.scrollHeight; }
        if (ev.type === 'progress' && ev.total) set(10 + (ev.count / ev.total) * 85, `${label} ${ev.count}/${ev.total}`);
      },
      end() { clearInterval(tick); set(100, `${label} 끝 · ${Math.round((Date.now() - t0) / 1000)}초`); setTimeout(() => root.classList.add('hidden'), 1500); },
      fail() { clearInterval(tick); root.classList.add('hidden'); },
    };
  }
  function busy(on, label) {
    C.busy = on ? label : '';
    $('#cpGen').disabled = $('#cpMore').disabled = !!on;
    $('#cpStop').classList.toggle('hidden', !on);
    drawSide();
  }
  const msg = (t, err) => { $('#cpMsg').innerHTML = err ? `<span style="color:#b91c1c">${esc(t)}</span>` : esc(t); };
  function baseBody() {
    const fm = F();
    return { format: fm.format, brand: fm.brand, keywords: kwList(), kwInfo: kwInfo(), extra: fm.extra, refs: lines(fm.refs), competitors: (D().comp?.keyword && kwList().includes(D().comp.keyword) ? D().comp.ads : []).slice(0, 10) };
  }
  async function generate(more) {
    if (C.busy) return;
    const fm = F();
    if (!fm.angles.length) return msg('소구 각도를 하나 이상 골라주세요', true);
    if (!kwList().length && !fm.brand.name.trim() && !fm.extra.trim()) return msg('키워드 · 브랜드 정보 · 요청 사항 중 하나는 넣어주세요', true);
    const same = D().items.filter((x) => x.format === fm.format);
    const old = same.filter((x) => x.status === 'cand' && !x.pin);
    if (!more && old.length && !await uiConfirm(`이 형식의 후보 ${old.length}개를 지우고 새로 만들까요? 확정·고정·제외한 카피는 남아요. (그대로 두고 더 받으려면 [이어서 더])`)) return;
    if (!more) D().items = D().items.filter((x) => !old.includes(x));
    // 키워드를 넣었는데 경쟁 광고를 아직 안 봤으면 먼저 읽어 둠
    if (kwList().length && D().comp?.keyword !== kwList()[0]) await loadComp(true);
    const keepItems = D().items.filter((x) => x.format === fm.format && (x.status === 'pick' || x.pin));
    const body = {
      ...baseBody(), angles: fm.angles, perAngle: fm.perAngle,
      keep: keepItems.map((x) => S.joinText(x.format, x.f)),
      existing: D().items.filter((x) => x.format === fm.format && x.status !== 'drop').map((x) => S.joinText(x.format, x.f)).slice(-150),
      rejected: D().rejected.slice(-100),
    };
    busy(true, '카피 생성'); msg('');
    const P = prog('카피 작성 중');
    C.ctrl = new AbortController();
    try {
      const done = await streamPost('/api/copy/generate-stream', body, (ev) => P.ev(ev), C.ctrl.signal);
      const have = new Set(D().items.map((x) => x.format + '|' + S.norm(S.joinText(x.format, x.f))));
      const rej = new Set(D().rejected.map(S.norm));
      let added = 0, dropped = 0;
      for (const x of done.items || []) {
        const key = done.format + '|' + S.norm(S.joinText(done.format, x.f));
        if (have.has(key) || rej.has(S.norm(S.joinText(done.format, x.f)))) { dropped++; continue; }
        have.add(key);
        D().items.push({ id: uid(), format: done.format, angle: x.angle || '기타', f: x.f, why: x.why, status: 'cand', pin: false, checks: [], at: Date.now(), model: done.model });
        added++;
      }
      P.end();
      checkAll();
      const nErr = D().items.filter((x) => x._lv === 'err' && x.format === done.format).length;
      msg(`${added}개 만들었어요${dropped ? ` (겹치는 ${dropped}개 뺌)` : ''} · ${done.model}${nErr ? ` · 규격 오류 ${nErr}개는 [다시 쓰기 ▾ → 검사 문제 고치기]로 고칠 수 있어요` : ''}`);
      C.filter = 'all';
      save(true);
    } catch (e) {
      P.fail();
      msg(e.name === 'AbortError' ? '중지했어요' : e.message, e.name !== 'AbortError');
    }
    busy(false); drawList();
  }
  async function rewriteMenu(items, e) {
    const a = await menu(e, QUICK.map(([k, t]) => [k, t]));
    if (!a) return;
    let instruction = QUICK_TEXT[a];
    if (a === 'custom') { const t = await uiPrompt('어떻게 고칠까요?', { placeholder: '예: 형사합의금을 앞에 두고, 더 짧게', max: 300 }); if (!t) return; instruction = t; }
    rewrite(items, instruction);
  }
  async function rewrite(items, instruction) {
    if (C.busy) return;
    const groups = new Map();
    items.forEach((it) => { if (!groups.has(it.format)) groups.set(it.format, []); groups.get(it.format).push(it); });
    busy(true, '다시 쓰기'); msg('');
    const P = prog('다시 쓰는 중');
    C.ctrl = new AbortController();
    let changed = 0;
    try {
      for (const [fmt, its] of groups) {
        checkAll();
        const body = { ...baseBody(), format: fmt, rejected: D().rejected.slice(-60), rewrite: { instruction, items: its.slice(0, 40).map((x) => ({ id: x.id, angle: x.angle, fields: x.f, problems: problems(x) })) } };
        const done = await streamPost('/api/copy/generate-stream', body, (ev) => P.ev(ev), C.ctrl.signal);
        for (const x of done.items || []) {
          const it = its.find((y) => y.id === x.id);
          if (!it) continue;
          it.prev = { ...it.f }; it.f = x.f; if (x.why) it.why = x.why; it.checks = []; changed++;
        }
      }
      P.end();
      msg(`${changed}개를 다시 썼어요 · 마음에 안 들면 카드의 [되돌리기]`);
      save(true);
    } catch (e) { P.fail(); msg(e.name === 'AbortError' ? '중지했어요' : e.message, e.name !== 'AbortError'); }
    busy(false); drawList();
  }
  async function verify(items) {
    if (C.busy) return;
    const groups = new Map();
    items.filter((x) => x.status !== 'drop').forEach((it) => { if (!groups.has(it.format)) groups.set(it.format, []); groups.get(it.format).push(it); });
    if (!groups.size) return toast('재검증할 카피가 없어요 (제외한 카피는 빼요)', 'info');
    busy(true, 'AI 재검증'); msg('');
    const P = prog('검토 중');
    C.ctrl = new AbortController();
    let n = 0, ok = 0;
    try {
      for (const [fmt, its] of groups) {
        for (let i = 0; i < its.length; i += 30) {
          const part = its.slice(i, i + 30);
          const body = { ...baseBody(), format: fmt, items: part.map((x) => ({ id: x.id, fields: x.f })) };
          const done = await streamPost('/api/copy/verify-stream', body, (ev) => P.ev(ev), C.ctrl.signal);
          for (const r of done.results || []) {
            const it = part.find((y) => y.id === r.id);
            if (!it) continue;
            it.checks = [...(it.checks || []), { pass: r.pass, reason: r.reason, risks: r.risks, at: Date.now(), model: done.model }].slice(-6);
            n++; if (r.pass) ok++;
          }
        }
      }
      P.end();
      msg(`${n}개 검토: 적합 ${ok} · 부적합 ${n - ok}. 여러 번 돌려서 계속 적합이면 믿을 만해요.`);
      save(true);
    } catch (e) { P.fail(); msg(e.name === 'AbortError' ? '중지했어요' : e.message, e.name !== 'AbortError'); }
    busy(false); drawList();
  }

  // ---------------------------------------------------------------- 내보내기 (선택한 게 있으면 선택만, 없으면 지금 보이는 것)
  function exportRows() {
    const vis = visible();
    const items = C.sel.size ? vis.filter((x) => C.sel.has(x.id)) : vis;
    return items;
  }
  function fileName(ext) { return `카피_${(kwList()[0] || F().brand.name || '내보내기').replace(/[\\/:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.${ext}`; }
  function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  function exportAs(kind) {
    checkAll();
    const items = exportRows();
    if (!items.length) return toast('내보낼 카피가 없어요', 'info');
    if (kind === 'txt') {
      const out = [];
      let last = '';
      for (const it of items) {
        if (it.format !== last) { out.push((out.length ? '\n' : '') + `# ${S.CHANNELS[S.FORMATS[it.format].ch]} · ${S.FORMATS[it.format].name}`); last = it.format; }
        out.push(S.FORMATS[it.format].fields.map((f) => it.f[f.key]).filter(Boolean).join(' | '));
      }
      return dl(new Blob(['\ufeff' + out.join('\n')], { type: 'text/plain;charset=utf-8' }), fileName('txt'));
    }
    const fieldKeys = [];
    for (const it of items) for (const f of S.FORMATS[it.format].fields) if (!fieldKeys.some((x) => x.label === f.label)) fieldKeys.push({ key: f.key, label: f.label });
    const head = ['채널', '형식', '각도', '상태', ...fieldKeys.map((f) => f.label), '글자 수', '자동 검사', 'AI 판정', '의도'];
    const rows = items.map((it) => {
      const fd = S.FORMATS[it.format].fields;
      const sc = aiScore(it);
      return [S.CHANNELS[S.FORMATS[it.format].ch], S.FORMATS[it.format].name, it.angle, STATUS[it.status], ...fieldKeys.map((k) => (fd.some((f) => f.label === k.label) ? it.f[fd.find((f) => f.label === k.label).key] || '' : '')),
        fd.filter((f) => !f.options).map((f) => `${f.label} ${it._chk.lens[f.key]}/${f.max}`).join(', '), it._chk.issues.filter((i) => i.level !== 'info').map((i) => i.msg).join(' / ') || '통과',
        sc ? `적합 ${sc.ok}/${sc.n} · ${sc.last.reason}` : '', it.why || ''];
    });
    if (kind === 'csv') {
      const q = (v) => `"${String(v ?? '').replace(/^([=+\-@\t\r])(?![\d.,]+$)/, "'$1").replace(/"/g, '""')}"`;
      return dl(new Blob(['\ufeff' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
    }
    const blob = window.XlsxLite.writeXlsx([{ name: '카피', rows: [head, ...rows], widths: [10, 22, 12, 7, ...fieldKeys.map(() => 30), 26, 40, 40, 30] }]);
    dl(blob, fileName('xlsx'));
  }

  // ---------------------------------------------------------------- 검사 규칙 (주의어는 빈 목록에서 시작)
  function rulesModal() {
    const rc = RC();
    const bg = document.createElement('div');
    bg.className = 'cp-modal-bg';
    bg.innerHTML = `<div class="cp-modal"><h3>카피 검사 규칙</h3>
      <label class="cp-lbl">사용자 주의어 <span class="muted">카피에 들어가면 노란색으로 표시하고, AI에도 쓰지 말라고 전해요 · 쉼표·줄바꿈 구분</span></label>
      <textarea class="inp" rows="4" id="cpRC1" placeholder="예: 무조건, 무료, 보장해드립니다">${esc(rc.caution || '')}</textarea>
      <label class="cp-chk" style="margin-top:12px"><input type="checkbox" id="cpRC2" ${rc.superCheck !== false ? 'checked' : ''}> 네이버 공통 규정: 근거 없는 최상급 검사 <span class="muted">(브랜드검색 타이틀·슬로건은 오류, 그 외는 '근거·출처 필요')</span></label>
      <textarea class="inp" rows="2" id="cpRC3">${esc(rc.superWords || S.SUPER_DEFAULT)}</textarea>
      <div class="muted" style="margin-top:6px">출처: 네이버 광고 가이드 '최상급 표현' (ads.naver.com/adguide/24). 근거가 있으면 설명에는 쓸 수 있어요.</div>
      <div class="cp-row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x="def">최상급 기본값</button><button class="btn" data-x="no">닫기</button><button class="btn pri" data-x="ok">저장</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    bg.querySelector('[data-x="no"]').onclick = close;
    bg.querySelector('[data-x="def"]').onclick = () => { bg.querySelector('#cpRC3').value = S.SUPER_DEFAULT; };
    bg.querySelector('[data-x="ok"]').onclick = async () => {
      const cur = window.SETTINGS || {};
      const next = { ...cur, rules: { ...(cur.rules || {}), copy: { ...(cur.rules?.copy || {}), caution: bg.querySelector('#cpRC1').value, superCheck: bg.querySelector('#cpRC2').checked, superWords: bg.querySelector('#cpRC3').value } } };
      try {
        const j = await (await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: next }) })).json();
        if (!j.ok) throw new Error(j.error || '저장 실패');
        window.SETTINGS = j.settings;
        if (!j.settings.rules.copy) { window.SETTINGS.rules.copy = next.rules.copy; toast('화면에는 적용했지만 서버가 예전 버전이라 저장이 안 됐어요. 서버를 다시 시작한 뒤 한 번 더 저장해 주세요.', 'info'); }
        else toast('검사 규칙을 저장했어요', 'ok');
        close(); drawList();
      } catch (e) { toast('저장하지 못했어요: ' + e.message, 'err'); }
    };
  }

  // ---------------------------------------------------------------- 보이기 · 숨기기
  function hideOthers() {
    $('#aiView')?.classList.add('hidden');
    window.__hideDup?.(); window.__hideBulk?.(); window.__hideMock?.();
  }
  async function refreshAI() {
    try {
      const c = await (await fetch('/api/config')).json();
      window.applyCfg?.(c);
      if (window.fillProviderSelect) fillProviderSelect($('#cpProv'));
      if (window.fillModelSelect && typeof AICFG !== 'undefined') fillModelSelect($('#cpModel'), AICFG.models[AICFG.provider]);
    } catch {}
  }
  function showCopy(on) {
    if (on) hideOthers();
    $('#copyView').classList.toggle('hidden', !on);
    if (on) {
      $('#main').classList.add('hidden'); $('#banners').classList.add('hidden'); $('#tabs').classList.add('hidden');
      history.replaceState(null, '', location.pathname + location.search + '#copy');
      refreshAI();
      if (!H.list.length) loadList();
      if (D()) drawAll();
    }
  }
  window.showCopy = showCopy;
  window.__hideCopy = () => {
    if ($('#copyView').classList.contains('hidden')) return;
    $('#copyView').classList.add('hidden');
    $('#main').classList.remove('hidden'); $('#banners').classList.remove('hidden');
    try { $('#tabs').classList.toggle('hidden', !STATE); } catch {}
    if (location.hash === '#copy') history.replaceState(null, '', location.pathname + location.search);
  };
  // 다른 화면이 열리면 이 화면은 닫음
  const watch = new MutationObserver(() => { if (!$('#copyView').classList.contains('hidden') && ['aiView', 'dupView', 'bulkView', 'mockView', 'main'].some((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); })) $('#copyView').classList.add('hidden'); });

  function drawAll() { drawForm(); drawList(); drawSide(); }

  // 다른 화면에서 키워드를 들고 들어오기 (분석 화면 [카피 만들기])
  window.__COPY = {
    fromKeyword(kw, opts = {}) {
      if (!H.cur || H.cur.items.length || H.cur.form.keywords.trim()) H.cur = newDoc();
      F().keywords = kw;
      if (opts.ch) { F().ch = opts.ch; F().format = Object.keys(S.FORMATS).find((k) => S.FORMATS[k].ch === opts.ch); }
      window.__LAYOUT?.go ? window.__LAYOUT.go('copy') : showCopy(true);
      drawAll();
      loadComp(true);
    },
  };

  function init() {
    mount();
    C.preview = localStorage.getItem('copyPreview') === '1';
    H.cur = newDoc();
    ['aiView', 'dupView', 'bulkView', 'main'].forEach((id) => { const el = document.getElementById(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    loadList().then(() => {
      const last = localStorage.getItem('copyCur');
      if (last && H.list.some((m) => m.id === last)) open(last); else drawAll();
    });
    drawAll();
    if (location.hash === '#copy') setTimeout(() => (window.__LAYOUT?.go ? window.__LAYOUT.go('copy') : showCopy(true)), 0);
  }
  init();
})();
