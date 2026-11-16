// 키워드 표 공용: ① 키워드 열(그 왼쪽의 체크·번호 포함) 틀 고정  ② 열 제목을 끌어서 순서 바꾸기 (표마다 기억)
// 표는 화면마다 innerHTML로 다시 그려지므로, 다시 그려질 때마다 저장된 순서대로 칸을 옮기고 고정을 다시 적용함
(function () {
  const TABLES = '#relTbl, #aiTbl, #bTblWrap > table, #dTblWrap > table, #gView table.g-tbl, #pfTbl, #pdTbl';
  const KEY = (t) => 'colOrder:' + (t.id || t.closest('[id]')?.id || 'tbl') + (t.classList.contains('g-tbl') ? ':' + headLabels(t).join('|').slice(0, 60) : '');
  const labelOf = (th) => th.dataset.k || th.textContent.replace(/[↕▲▼]/g, '').trim();
  const headRow = (t) => t.tHead?.rows[0] || t.rows[0];
  const headLabels = (t) => [...(headRow(t)?.cells || [])].map(labelOf);
  const isKw = (th) => th.dataset.k === 'keyword' || /^(신규 )?키워드/.test(th.textContent.trim());

  function kwIndex(t) {
    const cells = [...(headRow(t)?.cells || [])];
    return cells.findIndex(isKw);
  }
  const DEF = {}; // 표마다 처음(기본) 열 순서
  function load(t) { try { return JSON.parse(localStorage.getItem(KEY(t)) || 'null'); } catch { return null; } }

  // 저장된 순서대로 칸 옮기기 (고정 열은 그대로)
  function applyOrder(t) {
    const hr = headRow(t);
    if (!hr) return;
    const n = hr.cells.length, k = kwIndex(t);
    const cur = [...hr.cells].map(labelOf);
    const movable = cur.slice(k + 1);
    if (!hr.dataset.cwSeen) { hr.dataset.cwSeen = '1'; DEF[KEY(t)] = movable; } // 새로 그려진 표 = 기본 순서
    const saved = load(t);
    if (!saved || !saved.length) return;
    // 원하는 순서: 저장된 것 중 지금 있는 열 + 새로 생긴 열은 뒤에
    const want = [...saved.filter((x) => movable.includes(x)), ...movable.filter((x) => !saved.includes(x))];
    if (want.join('\u0001') === movable.join('\u0001')) return;
    const perm = [...cur.slice(0, k + 1).map((_, i) => i), ...want.map((x) => cur.indexOf(x, k + 1))];
    for (const row of t.rows) {
      if (row.cells.length !== n) continue; // 안내 문구 줄(colspan) 등은 그대로
      const cells = [...row.cells];
      perm.forEach((pi) => row.appendChild(cells[pi]));
    }
  }

  // 키워드 열까지 왼쪽 고정
  function freeze(t) {
    const hr = headRow(t);
    const k = kwIndex(t);
    t.querySelectorAll('.fz').forEach((c) => { c.classList.remove('fz', 'fz-last'); c.style.left = ''; });
    if (!hr || k < 0) return;
    const n = hr.cells.length;
    let left = 0;
    const lefts = [];
    for (let i = 0; i <= k; i++) { lefts.push(left); left += hr.cells[i].getBoundingClientRect().width; }
    for (const row of t.rows) {
      if (row.cells.length !== n) continue;
      for (let i = 0; i <= k; i++) {
        const c = row.cells[i];
        c.classList.add('fz');
        if (i === k) c.classList.add('fz-last');
        c.style.left = lefts[i] + 'px';
      }
    }
  }

  // 열 제목 끌기
  let drag = null;
  function wireDrag(t) {
    const hr = headRow(t);
    if (!hr) return;
    const k = kwIndex(t);
    [...hr.cells].forEach((th, i) => {
      if (i <= k) { th.draggable = false; return; }
      if (th.dataset.cw) return;
      th.dataset.cw = '1';
      th.draggable = true;
      th.classList.add('cw-drag');
      th.title = (th.title ? th.title + ' · ' : '') + '끌어서 열 순서 바꾸기 · 오른쪽 클릭: 처음 순서로';
      th.addEventListener('dragstart', (e) => { drag = { t, label: labelOf(th) }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.label); th.classList.add('cw-src'); });
      th.addEventListener('dragend', () => { th.classList.remove('cw-src'); t.querySelectorAll('.cw-over-l,.cw-over-r').forEach((x) => x.classList.remove('cw-over-l', 'cw-over-r')); drag = null; });
      th.addEventListener('dragover', (e) => {
        if (!drag || drag.t !== t) return;
        e.preventDefault();
        const r = th.getBoundingClientRect();
        const right = e.clientX > r.left + r.width / 2;
        t.querySelectorAll('.cw-over-l,.cw-over-r').forEach((x) => x.classList.remove('cw-over-l', 'cw-over-r'));
        th.classList.add(right ? 'cw-over-r' : 'cw-over-l');
      });
      th.addEventListener('drop', (e) => {
        if (!drag || drag.t !== t) return;
        e.preventDefault();
        const r = th.getBoundingClientRect();
        const right = e.clientX > r.left + r.width / 2;
        const cur = headLabels(t).slice(kwIndex(t) + 1);
        const from = drag.label, to = labelOf(th);
        if (from === to) return;
        const list = cur.filter((x) => x !== from);
        list.splice(list.indexOf(to) + (right ? 1 : 0), 0, from);
        localStorage.setItem(KEY(t), JSON.stringify(list));
        refresh(t);
      });
      th.addEventListener('contextmenu', async (e) => {
        if (!load(t)) return;
        e.preventDefault();
        const ok = window.uiConfirm ? await window.uiConfirm('이 표의 열 순서를 처음대로 되돌릴까요?', { ok: '되돌리기', danger: false }) : confirm('이 표의 열 순서를 처음대로 되돌릴까요?');
        if (!ok) return;
        const key = KEY(t);
        if (DEF[key]) { localStorage.setItem(key, JSON.stringify(DEF[key])); refresh(t); }
        localStorage.removeItem(key);
        window.toast?.('열 순서를 처음대로 되돌렸어요');
      });
    });
  }

  // 맨 왼쪽(체크 칸 다음, 키워드 앞)에 번호 열: 이미 '#' 열이 있는 표는 그대로
  function addNumbers(t) {
    const hr = headRow(t);
    if (!hr || hr.querySelector('th.rn')) return;
    if ([...hr.cells].some((c) => c.textContent.trim() === '#')) return;
    const k = kwIndex(t);
    if (k < 0) return;
    const n = hr.cells.length;
    const th = document.createElement('th');
    th.className = 'rn'; th.textContent = '#';
    hr.insertBefore(th, hr.cells[k]);
    // 페이지로 나뉜 표(연관 키워드)는 앞 페이지 개수만큼 더함
    let off = 0;
    try { if (t.id === 'relTbl' && typeof REL !== 'undefined' && typeof PAGE_REL === 'function') off = (REL.page - 1) * PAGE_REL(); } catch {}
    let i = 0;
    for (const tb of t.tBodies) for (const row of tb.rows) {
      if (row.cells.length === n) { const td = document.createElement('td'); td.className = 'rn'; td.textContent = String(off + ++i); row.insertBefore(td, row.cells[k]); }
      else if (row.cells.length === 1) row.cells[0].colSpan = (row.cells[0].colSpan || 1) + 1;
    }
  }
  let busy = false;
  function refresh(t) {
    busy = true;
    try { addNumbers(t); applyOrder(t); wireDrag(t); freeze(t); } finally { busy = false; }
  }
  function all() { document.querySelectorAll(TABLES).forEach((t) => { if (t.offsetParent !== null && headRow(t)) refresh(t); }); }

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; all(); }); };
  new MutationObserver(() => { if (!busy) schedule(); }).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', schedule);
  window.TableCols = { refresh: all };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
