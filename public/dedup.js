// 키워드 중복 검사: 신규 키워드 vs 기존 키워드 비교 → 겹치는 것 빼고 엑셀/TXT/CSV로 다운로드
// 모든 처리는 이 PC 브라우저 안에서만 해요. (비교 엔진은 ai.js의 window.__AI 재사용)
(function () {
  const E = () => window.__AI; // norm, buildIndex, checkOne
  const D = {
    sides: { new: { files: [], paste: '' }, old: { files: [], paste: '' } },
    saved: [], // 서버에 저장된 기존 키워드 목록 (AI 생성기 ②와 같은 파일)
    savedOn: new Set(),
    savingPaste: false,
    opt: { order: false, similar: false, selfDup: true, nospace: true },
    result: null,
    filter: '전체',
  };

  // ---------------------------------------------------------------- 파일 → 키워드
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
  async function addFiles(side, files) {
    for (const file of files) {
      try {
        const sheets = (await XlsxLite.readFile(file)).filter((s) => s.rows.some((r) => r && r.some((v) => v)));
        if (!sheets.length) { alert(`${file.name}: 내용이 없어요`); continue; }
        const g = guess(sheets[0].rows);
        const f = { id: Date.now() + Math.random(), name: file.name, sheets, si: 0, col: g.col, header: g.header, keywords: [] };
        extract(f);
        D.sides[side].files.push(f);
      } catch (e) { alert(`${file.name}: ${e.message}`); }
    }
    D.result = null;
    drawSide(side); drawResult();
  }
  const splitList = (s) => String(s || '').split(/[\r\n,\t]+/).map((x) => x.trim()).filter(Boolean);
  const sideKeywords = (side) => {
    const s = D.sides[side];
    const out = [...s.files.flatMap((f) => f.keywords), ...splitList(s.paste)];
    if (side === 'old') for (const l of D.saved) if (D.savedOn.has(String(l.id))) out.push(...l.keywords);
    return out;
  };

  // ---------------------------------------------------------------- 화면
  function sideHTML(side, title, hint) {
    return `<div class="card"><h3>${title} <span class="muted" id="dc_${side}"></span></h3>
      <div class="drop" id="dd_${side}">txt · 엑셀(xlsx) · csv 파일을 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" id="df_${side}" accept=".xlsx,.xlsm,.csv,.txt,.tsv,.xls" multiple hidden></label>
        <div class="muted" style="margin-top:4px">${hint}</div></div>
      <div id="dl_${side}"></div>
      ${side === 'old' ? '<div id="dsaved"></div>' : ''}
      <label class="muted" style="display:block;margin-top:10px">직접 붙여넣기 (줄바꿈·쉼표로 구분 · 엑셀 표를 복사해 붙여넣으면 '키워드' 열만 골라 넣어요)</label>
      <textarea id="dp_${side}" class="inp" rows="4" placeholder="${side === 'new' ? '운전자보험추천\n운전자보험비교' : '운전자보험\nKB운전자보험'}"></textarea>
      ${side === 'old' ? '<div style="margin-top:7px"><button type="button" class="btn" id="dSavePaste" disabled>붙여넣은 키워드 저장</button></div>' : ''}
    </div>`;
  }
  function mount() {
    const v = document.createElement('div');
    v.id = 'dupView';
    v.className = 'hidden';
    v.innerHTML = `<main style="max-width:1180px;margin:0 auto;padding:18px 24px 80px">
      <div class="sec"><h2>키워드 중복 검사 <span class="muted" style="font-size:13px;font-weight:500">신규 키워드에서 기존 키워드와 겹치는 것을 빼고 바로 내려받아요 · 파일은 이 PC 안에서만 처리</span></h2>
        <div class="grid g2">
          ${sideHTML('new', '① 신규 키워드 (검사할 목록)', '여러 파일을 한꺼번에 넣어도 돼요')}
          ${sideHTML('old', '② 기존 키워드 (비교 기준)', '이미 운영 중인 키워드 목록')}
        </div>
        <div class="card" style="margin-top:14px">
          <h3>겹침 기준</h3>
          <div class="dopts">
            <label><input type="checkbox" checked disabled> 똑같은 키워드 (띄어쓰기·대소문자·기호 차이는 무시) <span class="muted">항상 제외</span></label>
            <label><input type="checkbox" id="do_order"> 단어 순서만 다른 키워드 <span class="muted">예: 보험운전자 = 운전자보험</span></label>
            <label><input type="checkbox" id="do_similar"> 비슷한 키워드도 제외 <span class="muted">기존 키워드를 포함하거나, 포함되거나, 1글자만 다른 것 (끄면 "확인 필요"로만 표시)</span></label>
            <label><input type="checkbox" id="do_selfDup"> 신규 목록 안의 중복도 하나만 남기기</label>
            <label><input type="checkbox" id="do_nospace"> 다운로드할 때 키워드 띄어쓰기 없애기 <span class="muted">예: 운전자보험 추천 → 운전자보험추천</span></label>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">
            <button class="btn pri" id="dRun">중복 검사</button>
            <button class="btn" id="dReset">전부 비우기</button>
            <span class="muted" id="dMsg"></span>
          </div>
        </div>
      </div>
      <div class="sec" id="dResSec"></div>
    </main>`;
    document.body.insertBefore(v, $('#modalBg'));

    for (const side of ['new', 'old']) {
      $('#df_' + side).onchange = (e) => { addFiles(side, [...e.target.files]); e.target.value = ''; };
      const dz = $('#dd_' + side);
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(side, [...e.dataTransfer.files]); };
      $('#dp_' + side).oninput = (e) => { D.sides[side].paste = e.target.value; D.result = null; drawCount(side); drawResult(); };
    }
    for (const k of Object.keys(D.opt)) {
      const cb = $('#do_' + k);
      cb.checked = D.opt[k];
      cb.onchange = () => { D.opt[k] = cb.checked; if (D.result) run(); };
    }
    $('#dRun').onclick = run;
    $('#dSavePaste').onclick = savePastedKeywords;
    $('#dReset').onclick = async () => {
      if (!await uiConfirm('넣은 신규·기존 키워드와 결과를 모두 비울까요? (저장된 기존 키워드 목록 파일은 그대로)')) return;
      for (const side of ['new', 'old']) { D.sides[side] = { files: [], paste: '' }; $('#dp_' + side).value = ''; drawSide(side); }
      D.result = null; drawResult(); $('#dMsg').textContent = '';
    };

    const btn = document.createElement('button');
    btn.className = 'ghost'; btn.id = 'dupBtn'; btn.textContent = '키워드 중복 검사';
    btn.onclick = () => showDup($('#dupView').classList.contains('hidden'));
    $('.top-actions').prepend(btn);

    drawSide('new'); drawSide('old'); drawResult();
    if (location.hash === '#dup') showDup(true);
  }

  function showDup(on) {
    if (on) {
      if (window.showAI && !$('#aiView')?.classList.contains('hidden')) window.showAI(false);
      window.__hideBulk?.();
      loadSaved();
    }
    $('#dupView').classList.toggle('hidden', !on);
    $('#main').classList.toggle('hidden', on);
    $('#banners').classList.toggle('hidden', on);
    $('#tabs').classList.toggle('hidden', on || !STATE);
    $('#dupBtn').textContent = on ? '← 키워드 분석' : '키워드 중복 검사';
    history.replaceState(null, '', location.pathname + location.search + (on ? '#dup' : ''));
  }
  window.showDup = showDup;
  window.__hideDup = () => { if (!$('#dupView').classList.contains('hidden')) { $('#dupView').classList.add('hidden'); $('#dupBtn').textContent = '키워드 중복 검사'; } };

  // 기존 키워드 목록 파일(AI 생성기 ②와 같은 파일) 저장 · 다른 화면에 알림
  async function saveSaved() {
    try {
      const r = await (await fetch('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: D.saved }) })).json();
      if (r.error) throw new Error(r.error);
      window.dispatchEvent(new CustomEvent('sources-changed', { detail: 'dup' }));
      return true;
    } catch (e) { window.toast?.('기존 키워드 목록을 저장하지 못했어요: ' + e.message, 'err'); return false; }
  }
  async function savePastedKeywords() {
    if (D.savingPaste) return;
    const paste = D.sides.old.paste;
    const keywords = [...new Set(splitList(paste))];
    if (!keywords.length) return;
    D.savingPaste = true;
    drawCount('old');
    try {
      const name = (await uiPrompt('기존 키워드 목록 이름', { value: '붙여넣은 키워드', max: 80 }))?.trim();
      if (!name) return;
      const id = crypto.randomUUID();
      const res = await fetch('/api/sources/append', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, keywords }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok || j.source?.id !== id) throw new Error(j.error || '저장 응답을 확인할 수 없어요.');
      if (!D.saved.some(s => s.id === id)) D.saved.push(j.source);
      D.savedOn.add(id);
      if (D.sides.old.paste === paste) {
        D.sides.old.paste = '';
        $('#dp_old').value = '';
      }
      D.result = null; drawSide('old'); drawResult();
      window.dispatchEvent(new CustomEvent('sources-changed', { detail: 'dup' }));
      window.toast?.(`'${name}'에 키워드 ${keywords.length.toLocaleString('ko-KR')}개를 저장했어요.`, 'ok');
    } catch (e) { window.toast?.('기존 키워드 목록을 저장하지 못했어요: ' + e.message, 'err'); }
    finally { D.savingPaste = false; drawCount('old'); }
  }
  window.addEventListener('sources-changed', (e) => { if (e.detail !== 'dup') loadSaved(); });
  function dlSaved(s, fmt) {
    const base = String(s.name).replace(/\.(txt|csv|xlsx?|xlsm|tsv)(?=\s*(\([^)]*\))?\s*$)/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || '기존 키워드';
    const blob = fmt === 'xlsx'
      ? window.XlsxLite.writeXlsx([{ name: '기존 키워드', rows: [['키워드'], ...s.keywords.map((k) => [k])], widths: [40] }])
      : new Blob(['\ufeff' + s.keywords.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = base + (fmt === 'xlsx' ? '.xlsx' : '.txt');
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 3000);
  }
  async function loadSaved() {
    try {
      const j = await (await fetch('/api/sources')).json();
      D.saved = (j.sources || []).map((s) => ({ ...s, id: String(s.id) }));
    } catch { D.saved = []; }
    drawSide('old');
  }

  function drawCount(side) {
    const n = sideKeywords(side).length;
    $('#dc_' + side).textContent = n ? `${n.toLocaleString('ko-KR')}개` : '';
    if (side === 'old') $('#dSavePaste').disabled = D.savingPaste || !splitList(D.sides.old.paste).length;
  }
  function drawSide(side) {
    const box = $('#dl_' + side);
    box.innerHTML = D.sides[side].files.map((f) => {
      const rows = f.sheets[f.si].rows;
      const width = Math.max(...rows.slice(0, 50).map((r) => (r || []).length), 1);
      const isTxt = /\.txt$/i.test(f.name);
      return `<div class="dfile" data-id="${f.id}">
        <div class="dfile-top"><b>${esc(f.name)}</b><span class="muted">${f.keywords.length.toLocaleString('ko-KR')}개 ${side === 'old' ? '<a href="#" class="ext" data-keep="1" title="기존 키워드 목록 파일에 저장해서 다음에도 쓰고, AI 키워드 생성기에서도 써요">목록으로 저장</a> ' : ''}<a href="#" class="ext" data-rm="1">빼기</a></span></div>
        ${isTxt ? '' : `<div class="dfile-opts">
          ${f.sheets.length > 1 ? `<select data-k="si">${f.sheets.map((s, i) => `<option value="${i}" ${i === f.si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
          <select data-k="col"><option value="-1" ${f.col === -1 ? 'selected' : ''}>모든 열</option>${Array.from({ length: width }, (_, c) => `<option value="${c}" ${c === f.col ? 'selected' : ''}>${colLetter(c)}열: ${esc(String((rows[0] || [])[c] ?? '').slice(0, 16))}</option>`).join('')}</select>
          <label class="muted"><input type="checkbox" data-k="header" ${f.header ? 'checked' : ''}> 첫 행은 제목</label></div>`}
        <div class="muted" style="font-size:11px">미리보기: ${esc(f.keywords.slice(0, 5).join(', '))}${f.keywords.length > 5 ? ' …' : ''}</div></div>`;
    }).join('');
    $$('.dfile', box).forEach((el) => {
      const f = D.sides[side].files.find((x) => String(x.id) === el.dataset.id);
      const keepA = el.querySelector('[data-keep]');
      if (keepA) keepA.onclick = async (e) => {
        e.preventDefault();
        if (!f.keywords.length) return window.toast?.('저장할 키워드가 없어요', 'warn');
        const name = f.name + (f.sheets.length > 1 ? ` (${f.sheets[f.si].name})` : '');
        const item = { id: String(Date.now()) + Math.floor(Math.random() * 1000), name, keywords: [...new Set(f.keywords)], addedAt: Date.now() };
        D.saved.push(item);
        if (!await saveSaved()) { D.saved = D.saved.filter((y) => y !== item); return; }
        D.savedOn.add(item.id);
        D.sides.old.files = D.sides.old.files.filter((x) => x !== f); // 같은 키워드가 두 번 들어가지 않게 올린 파일 쪽은 뺌
        D.result = null; drawSide('old'); drawResult();
        window.toast?.(`'${name}'을 기존 키워드 목록으로 저장했어요 (AI 키워드 생성기 ②에도 보여요)`, 'ok');
      };
      el.querySelector('[data-rm]').onclick = (e) => { e.preventDefault(); D.sides[side].files = D.sides[side].files.filter((x) => x !== f); D.result = null; drawSide(side); drawResult(); };
      el.querySelectorAll('[data-k]').forEach((c) => (c.onchange = () => {
        if (c.dataset.k === 'si') { f.si = +c.value; const g = guess(f.sheets[f.si].rows); f.col = g.col; f.header = g.header; }
        if (c.dataset.k === 'col') f.col = +c.value;
        if (c.dataset.k === 'header') f.header = c.checked;
        extract(f); D.result = null; drawSide(side); drawResult();
      }));
    });
    if (side === 'old' && $('#dsaved')) {
      $('#dsaved').innerHTML = D.saved.length
        ? `<div class="muted" style="margin-top:10px;font-size:12px">저장된 기존 키워드 목록 (AI 생성기 ②와 같은 목록) 중 비교에 쓸 것:</div>
           ${D.saved.map((s) => `<div class="src-row"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-saved="${esc(s.id)}" ${D.savedOn.has(s.id) ? 'checked' : ''}> ${esc(s.name)}</label><span class="muted src-acts">${s.keywords.length.toLocaleString('ko-KR')}개 <a href="#" class="ext" data-srn="${esc(s.id)}">이름 변경</a><a href="#" class="ext" data-sdl="${esc(s.id)}" data-fmt="txt" title="한 줄에 키워드 하나">TXT</a><a href="#" class="ext" data-sdl="${esc(s.id)}" data-fmt="xlsx">엑셀</a><a href="#" class="ext" data-srm="${esc(s.id)}">삭제</a></span></div>`).join('')}`
        : '';
      $$('[data-saved]', $('#dsaved')).forEach((cb) => (cb.onchange = () => { cb.checked ? D.savedOn.add(cb.dataset.saved) : D.savedOn.delete(cb.dataset.saved); D.result = null; drawCount('old'); drawResult(); }));
      const find = (id) => D.saved.find((x) => String(x.id) === id);
      $$('[data-srn]', $('#dsaved')).forEach((x) => (x.onclick = async (e) => {
        e.preventDefault();
        const s = find(x.dataset.srn); if (!s) return;
        const v = await window.uiPrompt('기존 키워드 목록 이름', { value: s.name, max: 80 });
        if (!v || v === s.name) return;
        const old = s.name; s.name = v.slice(0, 80);
        if (!await saveSaved()) s.name = old; else window.toast?.('이름을 바꿨어요', 'ok');
        drawSide('old');
      }));
      $$('[data-sdl]', $('#dsaved')).forEach((x) => (x.onclick = (e) => { e.preventDefault(); const s = find(x.dataset.sdl); if (s) dlSaved(s, x.dataset.fmt); }));
      $$('[data-srm]', $('#dsaved')).forEach((x) => (x.onclick = async (e) => {
        e.preventDefault();
        const s = find(x.dataset.srm); if (!s) return;
        if (!await window.uiConfirm(`'${s.name}' 목록(${s.keywords.length}개)을 파일에서 삭제할까요? AI 키워드 생성기에서도 사라져요.`)) return;
        const keep = D.saved;
        D.saved = D.saved.filter((y) => y !== s); D.savedOn.delete(String(s.id));
        if (!await saveSaved()) D.saved = keep;
        D.result = null; drawSide('old'); drawResult();
      }));
    }
    drawCount(side);
  }

  // ---------------------------------------------------------------- 검사
  function run() {
    const eng = E();
    const neu = sideKeywords('new');
    const old = sideKeywords('old');
    if (!neu.length) return ($('#dMsg').innerHTML = '<span style="color:#b91c1c">① 신규 키워드를 넣어주세요</span>');
    if (!old.length && !D.opt.selfDup) return ($('#dMsg').innerHTML = '<span style="color:#b91c1c">② 기존 키워드를 넣어주세요</span>');
    const t0 = performance.now();
    const idx = eng.buildIndex(old);
    const seen = new Map(); // 신규 목록 안의 중복
    const rows = neu.map((k, i) => {
      const r = { no: i + 1, keyword: k, keep: true, reason: '', match: '', warn: '' };
      const n = eng.norm(k);
      if (!n) { r.keep = false; r.reason = '빈 값'; return r; }
      if (D.opt.selfDup && seen.has(n)) { r.keep = false; r.reason = '신규 목록 안에서 중복'; r.match = seen.get(n); return r; }
      const c = eng.checkOne(k, idx);
      if (c.status === '중복' && c.kind.startsWith('동일')) { r.keep = false; r.reason = '기존과 똑같음'; r.match = c.match; }
      else if (c.status === '중복') {
        if (D.opt.order) { r.keep = false; r.reason = '기존과 어순만 다름'; r.match = c.match; }
        else { r.warn = '어순만 다름'; r.match = c.match; }
      } else if (c.status === '유사') {
        if (D.opt.similar) { r.keep = false; r.reason = '기존과 비슷함: ' + c.kind; r.match = c.match; }
        else { r.warn = c.kind; r.match = c.match; }
      }
      if (r.keep) seen.set(n, k);
      return r;
    });
    D.result = { rows, newN: neu.length, oldN: old.length, oldUnique: idx.arr.length, ms: Math.round(performance.now() - t0) };
    D.filter = '전체';
    FB?.reset();
    const kept = rows.filter((r) => r.keep).length;
    $('#dMsg').textContent = `검사 완료 · 신규 ${neu.length.toLocaleString('ko-KR')}개 중 ${kept.toLocaleString('ko-KR')}개 남김, ${(neu.length - kept).toLocaleString('ko-KR')}개 제외`;
    drawResult();
    $('#dResSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const outKw = (k) => (D.opt.nospace ? String(k).replace(/\s+/g, '') : String(k).trim());
  function keptList(list) {
    // 띄어쓰기를 없애면서 같아진 키워드는 하나만
    const out = [], have = new Set();
    for (const r of list || D.result.rows) if (r.keep) { const k = outKw(r.keyword); const n = k.toLowerCase(); if (!have.has(n)) { have.add(n); out.push(k); } }
    return out;
  }

  // 필터 막대는 한 번만 만들어 결과를 다시 그려도 입력이 유지돼요
  let FB = null, fbEl = null;
  function ensureFB() {
    if (FB) return;
    fbEl = document.createElement('div');
    FB = FilterBar(fbEl, { ranges: [['len', '글자 수']], main: ['len'], onChange: drawTable });
  }
  const lenOf = (k) => [...String(k).replace(/\s+/g, '')].length;
  const fpass = (r) => !FB || FB.pass(r.keyword, (k) => (k === 'len' ? lenOf(r.keyword) : null));
  // 다운로드·복사 대상: 필터가 켜져 있으면 필터에 맞는 것만
  const parts = () => {
    const R = D.result;
    const kept = R.rows.filter((r) => r.keep && fpass(r)), drop = R.rows.filter((r) => !r.keep && fpass(r)), warn = kept.filter((r) => r.warn);
    return { kept, drop, warn };
  };
  function drawResult() {
    const sec = $('#dResSec');
    if (!D.result) { sec.innerHTML = ''; return; }
    ensureFB();
    const R = D.result;
    const kept = R.rows.filter((r) => r.keep), drop = R.rows.filter((r) => !r.keep), warn = kept.filter((r) => r.warn);
    sec.innerHTML = `<h2>결과 <span class="muted" style="font-size:13px;font-weight:500">기존 키워드 ${R.oldN.toLocaleString('ko-KR')}개(중복 제외 ${R.oldUnique.toLocaleString('ko-KR')}개)와 비교 · ${R.ms}ms</span></h2>
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card"><div class="muted">신규 키워드</div><div class="big">${R.newN.toLocaleString('ko-KR')}</div></div>
        <div class="card"><div class="muted">남김 (다운로드 대상)</div><div class="big" style="color:#16a34a">${kept.length.toLocaleString('ko-KR')}</div></div>
        <div class="card"><div class="muted">제외 (겹침)</div><div class="big" style="color:#dc2626">${drop.length.toLocaleString('ko-KR')}</div></div>
        <div class="card"><div class="muted">남겼지만 비슷한 기존 키워드 있음</div><div class="big" style="color:#b45309">${warn.length.toLocaleString('ko-KR')}</div></div>
      </div>
      <div class="card">
        <div id="dFbarHost"></div>
        <div class="toolbar">
          <div class="chips" id="dChips"></div>
          <span style="flex:1"></span>
          <span class="muted" id="dViewN"></span>
          <button class="btn pri" id="dXlsx">엑셀 다운로드</button>
          <button class="btn" id="dTxt">텍스트(TXT) 다운로드</button>
          <button class="btn" id="dCsv">CSV 다운로드</button>
          <button class="btn" id="dCopy">남은 키워드 복사</button>
          <button class="btn" id="dToBulk" title="남은 키워드를 대량 분석 입력칸에 넣어요 (검색량·입찰가 조회)">남은 키워드 대량 분석 →</button>
        </div>
        <div class="muted" style="font-size:12px;margin:-2px 0 8px" id="dNote"></div>
        <div class="tbl-wrap" style="max-height:620px" id="dTblWrap"></div>
        <div class="muted" style="margin-top:6px" id="dLimit"></div>
      </div>`;
    $('#dFbarHost').replaceWith(fbEl);
    $('#dXlsx').onclick = () => {
      const { kept: kk, drop: dd, warn: ww } = parts();
      const k = keptList(kk);
      const sheets = [
        { name: '남은 키워드', rows: [['키워드'], ...k.map((x) => [x])], widths: [36] },
        { name: '제외된 키워드', rows: [['키워드', '사유', '겹친 기존 키워드'], ...dd.map((r) => [outKw(r.keyword), r.reason, r.match])], widths: [36, 24, 36] },
      ];
      if (ww.length) sheets.push({ name: '확인 필요', rows: [['키워드', '비슷한 이유', '비슷한 기존 키워드'], ...ww.map((r) => [outKw(r.keyword), r.warn, r.match])], widths: [36, 24, 36] });
      save(XlsxLite.writeXlsx(sheets), 'xlsx');
    };
    $('#dTxt').onclick = () => save(new Blob(['\ufeff' + keptList(parts().kept).join('\r\n')], { type: 'text/plain;charset=utf-8' }), 'txt');
    $('#dCsv').onclick = () => save(new Blob(['\ufeff키워드\r\n' + keptList(parts().kept).map((k) => `"${k.replace(/^([=+\-@\t\r])(?![\d.,]+$)/, "'$1").replace(/"/g, '""')}"`).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'csv');
    $('#dCopy').onclick = async () => {
      const t = keptList(parts().kept).join('\n');
      try { await navigator.clipboard.writeText(t); $('#dCopy').textContent = '복사됨'; }
      catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); $('#dCopy').textContent = '복사됨'; }
      setTimeout(() => ($('#dCopy').textContent = '남은 키워드 복사'), 1500);
    };
    $('#dToBulk').onclick = () => {
      const k = keptList(parts().kept);
      if (!k.length) return alert('남은 키워드가 없어요');
      if (!window.__BULK?.setInput) return alert('대량 분석 화면을 불러오지 못했어요');
      window.__BULK.setInput(k.slice(0, 1000), `중복 검사에서 남은 키워드 ${Math.min(k.length, 1000).toLocaleString('ko-KR')}개를 넣었어요${k.length > 1000 ? ' (최대 1,000개라 앞부분만)' : ''}. [분석 시작]을 누르세요.`);
    };
    drawTable();
  }
  function drawTable() {
    if (!D.result || !$('#dTblWrap')) return;
    const R = D.result;
    const kept = R.rows.filter((r) => r.keep), drop = R.rows.filter((r) => !r.keep), warn = kept.filter((r) => r.warn);
    const base = { 전체: R.rows, 남김: kept, 제외: drop, '확인 필요': warn };
    $('#dChips').innerHTML = Object.entries(base).map(([k, list]) => { const n = list.filter(fpass).length; return `<span class="chip click ${D.filter === k ? 'on' : ''}" data-df="${k}">${k} (${n.toLocaleString('ko-KR')}${n !== list.length ? '/' + list.length.toLocaleString('ko-KR') : ''})</span>`; }).join('');
    $$('[data-df]', $('#dChips')).forEach((c) => (c.onclick = () => { D.filter = c.dataset.df; drawTable(); }));
    const view = (base[D.filter] || R.rows).filter(fpass);
    const on = FB?.active();
    $('#dViewN').innerHTML = `<b>${view.length.toLocaleString('ko-KR')}</b>개 표시`;
    $('#dNote').innerHTML = on
      ? '<b style="color:#b45309">필터 적용 중</b> · 다운로드·복사·대량 분석 보내기도 <b>필터에 맞는 남은 키워드</b>만 담아요. 엑셀에는 "제외된 키워드" 시트도 함께 들어가요.'
      : '다운로드는 <b>남은 키워드</b>만 담아요. 엑셀에는 "제외된 키워드" 시트(사유·겹친 기존 키워드)도 함께 들어가요.';
    const LIMIT = 2000;
    $('#dTblWrap').innerHTML = `<table class="rel" style="min-width:700px">
      <thead><tr><th style="width:60px">#</th><th class="l">신규 키워드</th><th style="width:60px">글자 수</th><th class="l">결과</th><th class="l">사유</th><th class="l">겹친 / 비슷한 기존 키워드</th></tr></thead>
      <tbody>${view.slice(0, LIMIT).map((r) => `<tr>
        <td class="muted">${r.no}</td><td class="l"><b>${esc(r.keyword)}</b></td><td class="muted">${lenOf(r.keyword)}</td>
        <td class="l">${r.keep ? (r.warn ? '<span class="st" data-s="유사">남김 · 확인 필요</span>' : '<span class="st" data-s="신규">남김</span>') : '<span class="st" data-s="중복">제외</span>'}</td>
        <td class="l muted">${esc(r.reason || r.warn || '')}</td><td class="l">${esc(r.match || '')}</td></tr>`).join('') || `<tr><td colspan="6" class="l muted" style="padding:20px">해당하는 키워드가 없어요${on ? ' · 필터를 확인해 주세요' : ''}</td></tr>`}</tbody>
    </table>`;
    $('#dLimit').textContent = view.length > LIMIT ? `화면에는 ${LIMIT.toLocaleString('ko-KR')}개까지만 보여요. 다운로드에는 전부 들어가요.` : '';
  }
  function save(blob, ext) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `중복제거_남은키워드_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  window.__DUP = { D, run, addFiles, showDup };
  mount();
})();
