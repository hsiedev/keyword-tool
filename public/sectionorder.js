// 분석 화면 섹션 순서 바꾸기 (네이버 키워드 분석 · 구글 모드 분석)
// - 위쪽 탭 줄(기본 정보, 연관 키워드 …)을 끌어서 놓거나, 각 섹션 제목 왼쪽의 ⠿ 를 끌어서 다른 섹션 제목에 놓으면 순서가 바뀜
// - 화면마다 기억 (localStorage secOrder:naver / secOrder:google), 탭 줄 오른쪽 클릭 → 처음 순서로
// - 결과가 다시 그려질 때마다 저장된 순서로 다시 맞춤
(function () {
  const CFG = [
    { key: 'naver', nav: '#tabs', box: () => document.getElementById('result'), sel: 'section.sec[id^="sec-"]' },
    { key: 'google', nav: '#gNav', box: () => document.getElementById('gRes'), sel: 'section.sec[id^="g-"]' },
  ];
  const load = (c) => { try { return JSON.parse(localStorage.getItem('secOrder:' + c.key) || 'null'); } catch { return null; } };
  const secsOf = (c) => { const b = c.box(); return b ? [...b.querySelectorAll(':scope > ' + c.sel)] : []; };
  const anchorsOf = (c) => [...(document.querySelector(c.nav)?.querySelectorAll(':scope > a[href^="#"]') || [])];
  const idOfA = (a) => a.getAttribute('href').slice(1);

  // 노드들을 원하는 순서로: 지금 마지막 노드 바로 뒤 자리를 기준으로 차례대로 넣음 (다른 요소 위치는 그대로)
  function arrange(nodes, ids, idOf) {
    if (nodes.length < 2) return false;
    const want = [...ids.filter((id) => nodes.some((n) => idOf(n) === id)), ...nodes.map(idOf).filter((id) => !ids.includes(id))];
    if (want.join('|') === nodes.map(idOf).join('|')) return false;
    const parent = nodes[0].parentNode, ref = nodes[nodes.length - 1].nextSibling;
    for (const id of want) parent.insertBefore(nodes.find((n) => idOf(n) === id), ref);
    return true;
  }
  let busy = false;
  function apply(c) {
    const o = load(c);
    if (!o) return;
    busy = true;
    try { arrange(secsOf(c), o, (s) => s.id); arrange(anchorsOf(c), o, idOfA); } finally { busy = false; }
  }
  function save(c, ids) { localStorage.setItem('secOrder:' + c.key, JSON.stringify(ids)); apply(c); }
  function moveId(c, from, to, after) {
    const ids = (anchorsOf(c).length ? anchorsOf(c).map(idOfA) : secsOf(c).map((s) => s.id)).filter((x) => x !== from);
    ids.splice(ids.indexOf(to) + (after ? 1 : 0), 0, from);
    save(c, ids);
    window.toast?.('섹션 순서를 바꿨어요 · 탭 줄 오른쪽 클릭으로 처음 순서', 'ok');
  }

  let drag = null;
  const clearMarks = () => document.querySelectorAll('.so-l,.so-r,.so-t,.so-b').forEach((x) => x.classList.remove('so-l', 'so-r', 'so-t', 'so-b'));
  function wire(c) {
    // 탭 줄
    for (const a of anchorsOf(c)) {
      if (a.dataset.so) continue;
      a.dataset.so = '1';
      a.draggable = true;
      a.title = '끌어서 섹션 순서 바꾸기 · 오른쪽 클릭: 처음 순서로';
      a.addEventListener('dragstart', (e) => { drag = { c, id: idOfA(a) }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id); a.classList.add('so-src'); });
      a.addEventListener('dragend', () => { a.classList.remove('so-src'); clearMarks(); drag = null; });
      a.addEventListener('dragover', (e) => { if (!drag || drag.c !== c) return; e.preventDefault(); const r = a.getBoundingClientRect(); clearMarks(); a.classList.add(e.clientX > r.left + r.width / 2 ? 'so-r' : 'so-l'); });
      a.addEventListener('drop', (e) => { if (!drag || drag.c !== c) return; e.preventDefault(); const r = a.getBoundingClientRect(); if (drag.id !== idOfA(a)) moveId(c, drag.id, idOfA(a), e.clientX > r.left + r.width / 2); });
    }
    const nav = document.querySelector(c.nav);
    if (nav && !nav.dataset.so) {
      nav.dataset.so = '1';
      nav.addEventListener('contextmenu', async (e) => {
        if (!e.target.closest('a[href^="#"]') || !load(c)) return;
        e.preventDefault();
        const ok = window.uiConfirm ? await window.uiConfirm('섹션 순서를 처음대로 되돌릴까요?', { ok: '되돌리기', danger: false }) : confirm('섹션 순서를 처음대로 되돌릴까요?');
        if (!ok) return;
        const def = DEF[c.key];
        if (def) { localStorage.setItem('secOrder:' + c.key, JSON.stringify(def)); apply(c); }
        localStorage.removeItem('secOrder:' + c.key);
      });
    }
    // 섹션 제목의 ⠿
    for (const s of secsOf(c)) {
      const h = s.querySelector(':scope > h2');
      if (!h || h.querySelector('.so-grip')) continue;
      const g = document.createElement('span');
      g.className = 'so-grip';
      g.textContent = '⠿';
      g.draggable = true;
      g.title = '끌어서 다른 섹션 제목에 놓으면 순서가 바뀌어요';
      g.addEventListener('dragstart', (e) => { drag = { c, id: s.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.setDragImage(h, 10, 10); s.classList.add('so-src'); });
      g.addEventListener('dragend', () => { s.classList.remove('so-src'); clearMarks(); drag = null; });
      h.prepend(g);
      h.addEventListener('dragover', (e) => { if (!drag || drag.c !== c) return; e.preventDefault(); const r = h.getBoundingClientRect(); clearMarks(); h.classList.add(e.clientY > r.top + r.height / 2 ? 'so-b' : 'so-t'); });
      h.addEventListener('dragleave', () => h.classList.remove('so-t', 'so-b'));
      h.addEventListener('drop', (e) => { if (!drag || drag.c !== c) return; e.preventDefault(); const r = h.getBoundingClientRect(); if (drag.id !== s.id) moveId(c, drag.id, s.id, e.clientY > r.top + r.height / 2); });
    }
  }
  const DEF = {}; // 처음(기본) 순서
  function all() {
    for (const c of CFG) {
      const n = document.querySelector(c.nav);
      if (n && !n.dataset.def) n.dataset.def = anchorsOf(c).map(idOfA).join('|'); // 처음(HTML) 순서
      if (n) DEF[c.key] = n.dataset.def.split('|');
      wire(c);
      apply(c);
    }
  }
  let raf = 0;
  new MutationObserver(() => { if (!busy && !raf) raf = requestAnimationFrame(() => { raf = 0; all(); }); }).observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
