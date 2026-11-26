// 빠른 이동 (DesignBookmark 참고)
// ① Ctrl+K 통합 검색: 메뉴 · 키워드 분석 · 관심 키워드 · 최근 검색 · AI 탭 · 대량 분석 · 파워링크 · 키워드 도구 내역
// ② 키워드 줄에 마우스를 올리면 바로가기 버튼 (★ 관심 · 분석 · 키워드 도구 · 복사)
// ③ 관심 키워드(★): 어느 표에서든 별표 → 통합 검색 · 첫 화면에 모임
// ④ 첫 화면 최근 작업 카드
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const toast = (m, t) => window.toast?.(m, t);
  const fmtD = (t) => (t ? new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '');
  const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
  const go = (v) => window.__LAYOUT?.go(v);
  const analyze = (kw) => { go('analyze'); window.run?.(kw); scrollTo({ top: 0 }); };

  // ---------------------------------------------------------------- ③ 관심 키워드
  const STAR = {
    list: () => readLS('kwStars', []),
    has: (kw) => STAR.list().some((x) => norm(x.kw) === norm(kw)),
    toggle(kw) {
      const l = STAR.list(), on = !STAR.has(kw);
      const next = on ? [{ kw: String(kw).trim(), at: Date.now() }, ...l] : l.filter((x) => norm(x.kw) !== norm(kw));
      localStorage.setItem('kwStars', JSON.stringify(next.slice(0, 500)));
      paintStars(); drawHome();
      toast(on ? `'${kw}'를 관심 키워드에 넣었어요 (Ctrl+K · 첫 화면에서 모아 봐요)` : `'${kw}'를 관심 키워드에서 뺐어요`, 'ok');
      return on;
    },
  };
  window.KW_STAR = STAR;
  const kwOf = (td) => { const a = td?.querySelector('a[data-go],a[data-run]'); return a ? (a.dataset.go || a.dataset.run || a.textContent).trim() : ''; };
  let paintT = 0;
  function paintStars() {
    const set = new Set(STAR.list().map((x) => norm(x.kw)));
    document.querySelectorAll('td.kwc').forEach((td) => td.classList.toggle('kw-starred', set.has(norm(kwOf(td)))));
  }
  new MutationObserver(() => { clearTimeout(paintT); paintT = setTimeout(paintStars, 150); }).observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- ② 줄 바로가기 버튼
  const hb = document.createElement('div');
  hb.className = 'row-acts hidden';
  const ic = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  hb.innerHTML = `<button type="button" data-a="star" title="관심 키워드 ★">★</button><button type="button" data-a="go" title="키워드 분석">${ic('<path d="M7 17 17 7M9 7h8v8"/>')}</button><button type="button" data-a="kt" title="키워드 도구에서 연관 키워드 보기">${ic('<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>')}</button><button type="button" data-a="copy" title="복사">${ic('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>')}</button>`;
  document.body.appendChild(hb);
  let hbKw = '', hbTd = null;
  const place = () => {
    if (!hbTd || !hbTd.isConnected) return hb.classList.add('hidden');
    const r = hbTd.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return hb.classList.add('hidden');
    hb.style.top = Math.round(r.top + r.height / 2 - 14) + 'px';
    hb.classList.remove('hidden');
    const w = hb.offsetWidth || 110;
    // 키워드 칸 안쪽 오른쪽 (칸이 좁으면 바로 옆)
    const fit = r.width > w + 70; // 칸 안에 들어가면 칸 안쪽 오른쪽, 좁으면 줄 바로 위 (옆 숫자를 가리지 않게)
    hb.style.left = Math.round(Math.max(4, Math.min(r.right - w - (fit ? 6 : 0), innerWidth - w - 8))) + 'px';
    if (!fit) { hb.classList.add('edge'); hb.style.top = Math.round(r.top - hb.offsetHeight / 2) + 'px'; } else hb.classList.remove('edge'); // 줄 사이 여백에 걸쳐 글자를 가리지 않음
    hb.querySelector('[data-a=star]').classList.toggle('on', STAR.has(hbKw));
    hb.classList.remove('hidden');
  };
  let mvRaf = 0, mvE = null;
  document.addEventListener('mousemove', (e) => { mvE = e; if (!mvRaf) mvRaf = requestAnimationFrame(() => { mvRaf = 0; onMove(mvE); }); }, { passive: true });
  function onMove(e) {
    if (hb.contains(e.target)) return;
    const tr = e.target.closest?.('tr');
    const td = tr?.querySelector('td.kwc');
    if (!td) { hbTd = null; hb.classList.add('hidden'); return; }
    if (td === hbTd) { if (hb.classList.contains('hidden')) place(); return; }
    hbTd = td; hbKw = kwOf(td);
    if (!hbKw) { hbTd = null; hb.classList.add('hidden'); return; }
    place();
  }
  addEventListener('scroll', () => hb.classList.add('hidden'), true);
  hb.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !hbKw) return;
    const a = b.dataset.a;
    if (a === 'star') { b.classList.toggle('on', STAR.toggle(hbKw)); return; }
    hb.classList.add('hidden');
    if (a === 'go') analyze(hbKw);
    if (a === 'kt') window.__KT_OPEN?.(hbKw);
    if (a === 'copy') { try { await navigator.clipboard.writeText(hbKw); toast(`'${hbKw}' 복사했어요`, 'ok'); } catch { toast('복사하지 못했어요', 'warn'); } }
  });

  // ---------------------------------------------------------------- 내역 모으기 (통합 검색 · 첫 화면 공용)
  let remote = { bulk: [], pl: [], at: 0 };
  async function loadRemote(force) {
    if (!force && Date.now() - remote.at < 20000) return remote;
    const [b, p] = await Promise.all([
      fetch('/api/bulk-history').then((r) => r.json()).catch(() => ({})),
      fetch('/api/pl/jobs').then((r) => r.json()).catch(() => ({})),
    ]);
    remote = { bulk: b.list || [], pl: p.jobs || [], at: Date.now() };
    return remote;
  }
  const NAV = [['analyze', '키워드 분석'], ['kt', '키워드 도구'], ['ai', 'AI 키워드 생성기'], ['dup', '키워드 중복 검사'], ['bulk', '대량 분석'], ['pl', '파워링크 분석기'], ['bid', '키워드 입찰가 조정'], ['copy', 'AI 카피 생성기'], ['mock', '광고 목업']];
  function items() {
    const out = [];
    for (const [v, n] of NAV) out.push({ g: '메뉴', t: n, sub: '열기', run: () => go(v) });
    out.push({ g: '메뉴', t: '파워링크 순위 추적', sub: '켜 두면 계속 순위 확인', run: () => window.__PLT?.open() });
    out.push({ g: '메뉴', t: '설정', sub: 'API 키 · 규칙 · 화면', run: () => window.openSettings?.() });
    out.push({ g: '메뉴', t: '다크 모드 바꾸기', sub: '화면 테마', run: () => document.querySelector('.top-actions .icon-btn[title*="테마"], #themeBtn')?.click() });
    for (const x of STAR.list()) out.push({ g: '관심 키워드', t: x.kw, sub: '★ ' + fmtD(x.at), run: () => analyze(x.kw), kw: x.kw });
    for (const x of readLS('kwHistory', []).slice(0, 40)) out.push({ g: '최근 분석', t: x.kw, sub: fmtD(x.at), run: () => analyze(x.kw), kw: x.kw });
    const A = window.__AI?.AI;
    for (const s of (A?.sessions || []).slice(0, 60)) out.push({ g: 'AI 키워드 생성기', t: s.name || '탭', sub: `키워드 ${(s.items || []).length}개 · ${fmtD(s.updatedAt)}`, run: () => { go('ai'); window.__AI.openTab(s); } });
    for (const m of remote.bulk.slice(0, 60)) out.push({ g: '대량 분석', t: m.name, sub: `키워드 ${(m.count || 0).toLocaleString('ko-KR')}개 · ${fmtD(m.updatedAt)}`, run: () => { go('bulk'); window.__BULK?.openSession(m.id); } });
    for (const m of remote.pl.slice(0, 60)) out.push({ g: '파워링크 분석', t: m.name, sub: `${m.parentId ? '재분석 · ' : ''}${m.done ?? ''}/${m.total ?? ''}개 · ${fmtD(m.createdAt)}`, run: () => { go('pl'); window.__PL_WORK?.open(m.id); } });
    for (const h of readLS('ktHistory', []).slice(0, 30)) out.push({ g: '키워드 도구', t: (h.q?.hints || []).join(', ') || '시즌 · 사이트 조회', sub: `${(h.n || 0).toLocaleString('ko-KR')}개 · ${fmtD(h.at)}`, run: () => window.__KT_OPEN?.(h.q?.hints || []) });
    return out;
  }

  // ---------------------------------------------------------------- ① Ctrl+K 통합 검색
  const EX = ['신용카드추천', '파워링크', '대량 분석', '설정', '체크카드'];
  const pal = document.createElement('div');
  pal.className = 'cmdk hidden';
  pal.innerHTML = `<div class="cmdk-bg"></div><div class="cmdk-box" role="dialog" aria-modal="true" aria-label="통합 검색">
    <div class="cmdk-in"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="cmdkQ" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="cmdk-list" id="cmdkList" role="listbox"></div>
    <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 키워드 도구로</span><span class="cmdk-n" id="cmdkN"></span></div></div>`;
  document.body.appendChild(pal);
  const q = $('#cmdkQ', pal), listEl = $('#cmdkList', pal);
  let shown = [], sel = 0, exI = 0, exT = 0;
  function open() {
    pal.classList.remove('hidden'); q.value = ''; sel = 0;
    q.placeholder = `키워드 분석, 메뉴, 지난 작업 찾기 · 예: ${EX[exI % EX.length]}`;
    clearInterval(exT); exT = setInterval(() => { exI++; if (!q.value) q.placeholder = `키워드 분석, 메뉴, 지난 작업 찾기 · 예: ${EX[exI % EX.length]}`; }, 2500);
    render(); setTimeout(() => q.focus(), 0);
    loadRemote().then(render);
  }
  function close() { pal.classList.add('hidden'); clearInterval(exT); }
  window.openQuick = open;
  function score(it, w) {
    const t = norm(it.t), s = norm(it.sub);
    if (!w) return 1;
    if (t === w) return 100;
    if (t.startsWith(w)) return 60;
    if (t.includes(w)) return 40;
    if (s.includes(w)) return 10;
    // 띄어 쓴 단어가 모두 들어 있으면
    const parts = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => t.includes(p.replace(/\s+/g, '')))) return 20;
    return 0;
  }
  function render() {
    if (pal.classList.contains('hidden')) return;
    const raw = q.value.trim(), w = norm(raw);
    let all = items().map((it) => ({ ...it, s: score(it, w) })).filter((it) => it.s > 0);
    if (!w) all = all.filter((it) => ['메뉴', '관심 키워드', '최근 분석'].includes(it.g)).map((it) => ({ ...it })).filter((it, i, a) => it.g !== '최근 분석' || a.slice(0, i).filter((x) => x.g === '최근 분석').length < 6);
    const acts = raw ? [{ g: '바로 하기', t: `'${raw}' 키워드 분석`, sub: 'Enter', run: () => analyze(raw.replace(/\s+/g, '')), s: 1000 }, { g: '바로 하기', t: `'${raw}' 키워드 도구에서 연관 키워드 보기`, sub: 'Ctrl+Enter', run: () => window.__KT_OPEN?.(raw.split(/[,\s]+/).filter(Boolean)), s: 999, kt: true }] : [];
    // 그룹 순서 유지 + 그룹마다 점수순, 그룹당 최대 6개
    const order = ['바로 하기', '메뉴', '관심 키워드', '최근 분석', 'AI 키워드 생성기', '대량 분석', '파워링크 분석', '키워드 도구'];
    const groups = order.map((g) => [g, [...acts, ...all].filter((it) => it.g === g).sort((a, b) => b.s - a.s).slice(0, g === '메뉴' && !w ? 10 : 6)]).filter(([, l]) => l.length);
    shown = groups.flatMap(([, l]) => l);
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    let i = 0;
    listEl.innerHTML = groups.map(([g, l]) => `<div class="cmdk-g">${esc(g)}</div>${l.map((it) => { const k = i++; return `<div class="cmdk-it ${k === sel ? 'on' : ''}" data-i="${k}" role="option"><span class="cmdk-t">${it.g === '관심 키워드' ? '<b class="cmdk-star">★</b> ' : ''}${esc(it.t)}</span><span class="cmdk-s">${esc(it.sub || '')}</span></div>`; }).join('')}`).join('') || '<div class="cmdk-none">찾는 게 없어요</div>';
    $('#cmdkN', pal).textContent = w ? `${all.length.toLocaleString('ko-KR')}개 찾음` : '';
    listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  const pick = (i, kt) => { const it = shown[i]; if (!it) return; close(); if (kt && (it.kw || q.value.trim())) window.__KT_OPEN?.(it.kw ? [it.kw] : q.value.split(/[,\s]+/).filter(Boolean)); else it.run(); };
  q.oninput = () => { sel = 0; render(); };
  q.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel, e.ctrlKey || e.metaKey); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  listEl.onmousemove = (e) => { const r = e.target.closest('[data-i]'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; listEl.querySelectorAll('.cmdk-it').forEach((x) => x.classList.toggle('on', +x.dataset.i === sel)); } };
  listEl.onclick = (e) => { const r = e.target.closest('[data-i]'); if (r) pick(+r.dataset.i, e.ctrlKey || e.metaKey); };
  $('.cmdk-bg', pal).onclick = close;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); pal.classList.contains('hidden') ? open() : close(); }
  }, true);
  // 상단 바 검색 버튼
  const acts = document.querySelector('.top .top-actions');
  if (acts) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'top-search'; b.title = '통합 검색 (Ctrl+K)';
    b.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>키워드 분석 · 메뉴 · 지난 작업 찾기</span><kbd>Ctrl K</kbd>`;
    b.onclick = open;
    acts.parentElement.insertBefore(b, acts);
  }

  // ---------------------------------------------------------------- ④ 첫 화면: 관심 키워드 · 최근 작업
  const home = document.createElement('div');
  home.className = 'home-cards';
  $('#empty')?.appendChild(home);
  function card(title, sub, meta, v, fn) { return { title, sub, meta, v, fn }; }
  async function drawHome() {
    if (!home.isConnected) return;
    const stars = STAR.list().slice(0, 24);
    const recentKw = readLS('kwHistory', []).slice(0, 8);
    const A = window.__AI?.AI;
    const cards = [];
    for (const s of (A?.sessions || []).slice(0, 2)) cards.push(card(s.name || 'AI 탭', `키워드 ${(s.items || []).length}개`, fmtD(s.updatedAt), 'AI 키워드 생성기', () => { go('ai'); window.__AI.openTab(s); }));
    for (const m of remote.pl.filter((x) => !x.parentId).slice(0, 2)) cards.push(card(m.name, `${m.status === 'running' ? '분석 중 · ' : ''}${m.done}/${m.total}개`, fmtD(m.createdAt), '파워링크 분석', () => { go('pl'); window.__PL_WORK?.open(m.id); }));
    for (const m of remote.bulk.slice(0, 2)) cards.push(card(m.name, `키워드 ${(m.count || 0).toLocaleString('ko-KR')}개`, fmtD(m.updatedAt), '대량 분석', () => { go('bulk'); window.__BULK?.openSession(m.id); }));
    for (const h of readLS('ktHistory', []).slice(0, 2)) cards.push(card((h.q?.hints || []).join(', ') || '시즌 조회', `연관 키워드 ${(h.n || 0).toLocaleString('ko-KR')}개`, fmtD(h.at), '키워드 도구', () => window.__KT_OPEN?.(h.q?.hints || [])));
    home.innerHTML = `
      ${stars.length ? `<div class="hc-sec"><div class="hc-h">★ 관심 키워드 <span>${stars.length}개</span></div><div class="hc-chips">${stars.map((x) => `<button type="button" class="chip click" data-kw="${esc(x.kw)}">${esc(x.kw)}</button>`).join('')}</div></div>` : ''}
      ${recentKw.length ? `<div class="hc-sec"><div class="hc-h">최근 분석</div><div class="hc-chips">${recentKw.map((x) => `<button type="button" class="chip click" data-kw="${esc(x.kw)}">${esc(x.kw)}</button>`).join('')}</div></div>` : ''}
      ${cards.length ? `<div class="hc-sec"><div class="hc-h">이어서 하기</div><div class="hc-grid">${cards.map((c, i) => `<button type="button" class="hc-card" data-c="${i}"><span class="hc-v">${esc(c.v)}</span><b>${esc(c.title)}</b><span class="hc-m">${esc(c.sub)} · ${esc(c.meta)}</span></button>`).join('')}</div></div>` : ''}
      <div class="hc-tip">어디서든 <kbd>Ctrl</kbd>+<kbd>K</kbd>로 키워드 분석 · 메뉴 이동 · 지난 작업을 찾을 수 있어요. 표의 키워드 줄에 마우스를 올리면 ★ 관심 키워드 · 분석 · 키워드 도구 · 복사 버튼이 나와요.</div>`;
    home.querySelectorAll('[data-kw]').forEach((b) => (b.onclick = () => analyze(b.dataset.kw)));
    home.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => cards[+b.dataset.c].fn()));
  }
  const emptyEl = $('#empty');
  if (emptyEl) new MutationObserver(() => { if (!emptyEl.classList.contains('hidden') && emptyEl.offsetParent) loadRemote().then(drawHome); }).observe(emptyEl, { attributes: true, attributeFilter: ['class', 'style'] });
  setTimeout(() => loadRemote().then(drawHome), 800);
})();
