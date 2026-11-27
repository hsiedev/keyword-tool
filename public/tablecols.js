// 키워드 표 공용: ① 키워드 열(그 왼쪽의 체크·번호 포함) 틀 고정  ② 열 제목을 끌어서 순서 바꾸기 (표마다 기억)
// ③ [열 맞춤 설정]: 파워링크 분석기와 같은 창으로 열 보이기/숨기기 + 순서 (표마다 이 브라우저에 저장, 다운로드 파일은 그대로)
// 표는 화면마다 innerHTML로 다시 그려지므로, 다시 그려질 때마다 저장된 순서대로 칸을 옮기고 고정을 다시 적용함
(function () {
  const TABLES = '#relTbl, #aiTbl, #bTblWrap > table, #dTblWrap > table, #gView table.g-tbl';
  const EXTRA = '#ktTbl, #bidTable'; // 번호 열·틀 고정은 없이 열 맞춤만 (키워드 도구 · 입찰가 조정)
  const COLSET = TABLES + ', ' + EXTRA;
  const OVR = new Map(); // 열 맞춤 창을 여는 동안 미리보기 { order, hidden }
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
  const HKEY = (key) => key.replace(/^colOrder:/, 'colHide:');
  function loadHide(t) { try { return JSON.parse(localStorage.getItem(HKEY(KEY(t))) || '[]') || []; } catch { return []; } }
  const orderOf = (t) => OVR.get(KEY(t))?.order || load(t);
  const hideOf = (t) => new Set(OVR.get(KEY(t))?.hidden || loadHide(t));
  const nameOf = (th) => th.textContent.replace(/[↕▲▼⇅]/g, '').replace(/\s+/g, ' ').trim() || labelOf(th);

  // 저장된 순서대로 칸 옮기기 (고정 열은 그대로)
  function applyOrder(t) {
    const hr = headRow(t);
    if (!hr) return;
    const n = hr.cells.length, k = kwIndex(t);
    const cur = [...hr.cells].map(labelOf);
    const movable = cur.slice(k + 1);
    if (!hr.dataset.cwSeen) { hr.dataset.cwSeen = '1'; DEF[KEY(t)] = movable; } // 새로 그려진 표 = 기본 순서
    const saved = orderOf(t) || DEF[KEY(t)]; // 저장한 순서가 없으면 기본 순서 (미리보기 취소 때 되돌림)
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
  // 숨긴 열: 칸에 cw-hide (키워드 열과 그 왼쪽은 못 숨김)
  function applyHide(t) {
    const hr = headRow(t);
    if (!hr) return;
    const n = hr.cells.length, k = kwIndex(t), hid = hideOf(t), off = new Set();
    [...hr.cells].forEach((th, i) => { if (i > k && hid.has(labelOf(th))) off.add(i); });
    for (const row of t.rows) {
      if (row.cells.length !== n) continue;
      for (let i = 0; i < n; i++) { const c = row.cells[i], h = off.has(i); if (c.classList.contains('cw-hide') !== h) c.classList.toggle('cw-hide', h); }
    }
    const b = btnOf(t); if (b) b.querySelector('small').textContent = (n - off.size) + '개';
  }
  // [열 맞춤 설정] 버튼: [집중 피킹] 버튼과 같은 줄 (표 바로 위)
  const wrapOf = (t) => t.closest('.tbl-wrap') || t.parentElement;
  function btnOf(t) { const w = wrapOf(t); return w?.__cwBtn?.isConnected ? w.__cwBtn : null; }
  function attachBtn(t) {
    const w = wrapOf(t);
    if (!w || w.__cwBtn?.isConnected) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn cw-btn';
    b.title = '보일 열과 순서를 정해요 (이 표만 · 이 브라우저에 저장 · 다운로드 파일은 그대로)';
    b.innerHTML = '열 맞춤 설정 <small class="muted"></small>';
    b.onclick = () => { const tb = w.querySelector('table'); if (tb) openEditor(tb); };
    const prev = w.previousElementSibling;
    if (prev && (prev.classList.contains('fp-bar') || (prev.classList.contains('toolbar') && !prev.id))) prev.prepend(b);
    else { const bar = document.createElement('div'); bar.className = 'fp-bar'; bar.append(b); w.before(bar); }
    w.__cwBtn = b;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let ED = null;
  function openEditor(t) {
    if (ED) return;
    const key = KEY(t), hr = headRow(t), k = kwIndex(t), cells = [...hr.cells];
    const fixed = cells.slice(0, k + 1).map(nameOf).filter((x) => x && x !== '#');
    const names = new Map(cells.slice(k + 1).map((th) => [labelOf(th), nameOf(th)]));
    const draft = { order: cells.slice(k + 1).map(labelOf), hidden: [...hideOf(t)].filter((x) => names.has(x)), q: '' };
    const same = () => [...document.querySelectorAll(COLSET)].filter((x) => KEY(x) === key && headRow(x));
    const preview = () => { OVR.set(key, { order: [...draft.order], hidden: [...draft.hidden] }); same().forEach(refresh); };
    const dialog = document.createElement('dialog');
    dialog.className = 'pl-modal pl-col-modal';
    dialog.innerHTML = `<div class="pl-col-content">
      <header class="pl-bar pl-col-head"><h3>열 맞춤 설정</h3><button type="button" class="btn sm" data-x>닫기</button></header>
      <div class="pl-bar pl-col-tools"><span class="muted">체크로 표시하고, 끌거나 ↑↓ 버튼으로 순서를 바꿔요.</span><input class="inp pl-col-search" type="search" aria-label="열 이름 찾기" placeholder="열 이름 찾기"></div>
      <ul class="pl-col-list" aria-label="열 목록"></ul>
      <div class="muted pl-col-help">화면의 이 표에만 적용돼요. 엑셀·CSV 다운로드는 그대로예요.</div>
      <footer class="pl-bar pl-col-footer"><button type="button" class="btn sm" data-reset>기본값으로</button><span style="flex:1"></span><button type="button" class="btn sm" data-x>취소</button><button type="button" class="btn pri sm" data-save>저장</button></footer>
    </div>`;
    ED = dialog;
    const list = dialog.querySelector('.pl-col-list'), search = dialog.querySelector('.pl-col-search');
    const sk = (s) => String(s).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
    const draw = () => {
      const scroll = list.scrollTop, q = sk(draft.q);
      const fixedRow = fixed.length && sk(fixed.join('')).includes(q) ? `<li class="pl-col-item"><span></span><label><input type="checkbox" checked disabled>${esc(fixed.join(' · '))}</label><small class="muted">고정</small></li>` : '';
      const items = draft.order.filter((id) => sk(names.get(id) || id).includes(q));
      list.innerHTML = fixedRow + items.map((id) => `<li class="pl-col-item" data-col-key="${esc(id)}"><span class="pl-col-grip" title="끌어서 이동" draggable="true" aria-hidden="true">⠿</span><label><input type="checkbox" ${draft.hidden.includes(id) ? '' : 'checked'}>${esc(names.get(id) || id)}</label><small class="muted"></small><div class="pl-col-move"><button type="button" class="btn sm" data-move="-1" aria-label="${esc((names.get(id) || id) + ' 위로')}">↑</button><button type="button" class="btn sm" data-move="1" aria-label="${esc((names.get(id) || id) + ' 아래로')}">↓</button></div></li>`).join('')
        + (!items.length && !fixedRow ? '<li class="muted pl-col-none">검색한 열이 없어요.</li>' : '');
      list.scrollTop = scroll;
    };
    const close = (save) => {
      if (save) {
        try { localStorage.setItem(key, JSON.stringify(draft.order)); localStorage.setItem(HKEY(key), JSON.stringify(draft.hidden)); }
        catch { window.toast?.('열 설정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.', 'warn'); return; }
      }
      OVR.delete(key); ED = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      same().forEach(refresh);
      if (save) window.toast?.('열 순서와 표시 설정을 저장했어요.', 'ok');
    };
    const from = (e) => e.target.closest('[data-col-key]')?.dataset.colKey;
    const move = (id, target) => {
      if (!target || id === target) return;
      const a = draft.order.indexOf(id), b = draft.order.indexOf(target);
      if (a < 0 || b < 0) return;
      draft.order.splice(a, 1); draft.order.splice(b, 0, id);
      draw(); preview();
    };
    list.onchange = (e) => {
      const id = from(e); if (!id || e.target.type !== 'checkbox') return;
      draft.hidden = e.target.checked ? draft.hidden.filter((x) => x !== id) : [...draft.hidden, id];
      preview();
    };
    list.onclick = (e) => {
      const step = +e.target.dataset.move, id = from(e);
      if (!step || !id) return;
      const vis = [...list.querySelectorAll('[data-col-key]')].map((r) => r.dataset.colKey);
      move(id, vis[vis.indexOf(id) + step]);
      [...list.querySelectorAll('[data-col-key]')].find((r) => r.dataset.colKey === id)?.querySelector(`[data-move="${step}"]`)?.focus({ preventScroll: true });
    };
    let dragId = null;
    const clean = () => list.querySelector('.pl-col-over')?.classList.remove('pl-col-over');
    list.ondragstart = (e) => { dragId = from(e); if (dragId) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } };
    list.ondragover = (e) => { if (dragId && from(e)) { e.preventDefault(); clean(); e.target.closest('[data-col-key]').classList.add('pl-col-over'); } };
    list.ondrop = (e) => { if (dragId && from(e)) { e.preventDefault(); move(dragId, from(e)); } dragId = null; clean(); };
    list.ondragend = () => { dragId = null; clean(); };
    search.oninput = () => { draft.q = search.value; draw(); };
    dialog.querySelector('[data-reset]').onclick = () => { draft.order = [...(DEF[key] || draft.order)]; draft.hidden = []; draft.q = ''; search.value = ''; draw(); preview(); };
    dialog.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => close(false)));
    dialog.querySelector('[data-save]').onclick = () => close(true);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    document.body.appendChild(dialog);
    dialog.showModal();
    draw();
  }

  let busy = false;
  function refresh(t) {
    busy = true;
    try {
      const extra = t.matches(EXTRA);
      if (!extra) addNumbers(t);
      applyOrder(t); wireDrag(t);
      if (!extra) freeze(t);
      applyHide(t); attachBtn(t);
    } finally { busy = false; }
  }
  function all() { document.querySelectorAll(COLSET).forEach((t) => { if (t.offsetParent !== null && headRow(t)) refresh(t); }); }

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; all(); }); };
  new MutationObserver(() => { if (!busy) schedule(); }).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', schedule);
  window.TableCols = { refresh: all };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
