// 화면 틀: 왼쪽 사이드바(기능 4개 + 내역) · 상단 바(제목 · 검색 · 테마 · 설정) · 라이트/다크 테마
// 기존 기능 코드는 그대로 두고, 버튼·목록 위치만 옮겨요.
(function () {
  const I = {
    analyze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    pl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><path d="M7 7h6"/><path d="M3 14h10M3 18h7"/><circle cx="18" cy="17" r="3"/><path d="m20.2 19.2 1.8 1.8"/></svg>',
    mock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 13h6M7 16h10"/></svg>',
    bulk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M3 12h18M3 19h18"/><path d="M8 5v14"/></svg>',
    set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };
  const VIEWS = [
    ['analyze', '키워드 분석'],
    ['ai', 'AI 키워드 생성기'],
    ['dup', '키워드 중복 검사'],
    ['bulk', '대량 분석'],
    ['pl', '파워링크 분석기'],
    ['copy', 'AI 카피 생성기'],
    ['mock', '광고 목업'],
  ];
  const NAME = Object.fromEntries(VIEWS);
  // NAVER / Google 모드 (구글은 지금 '키워드 분석'만)
  const getMode = () => (localStorage.getItem('siteMode') === 'google' ? 'google' : 'naver');
  const isG = () => getMode() === 'google';

  // ---------------------------------------------------------------- 테마
  const media = matchMedia('(prefers-color-scheme: dark)');
  const getTheme = () => localStorage.getItem('theme') || 'light';
  function applyTheme() {
    const t = getTheme();
    document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && media.matches));
    const b = document.getElementById('themeBtn');
    if (b) { const dark = document.documentElement.classList.contains('dark'); b.innerHTML = dark ? I.sun : I.moon; b.title = dark ? '라이트 모드로' : '다크 모드로'; b.setAttribute('aria-label', b.title); }
    document.querySelectorAll('[data-theme-opt]').forEach((x) => x.classList.toggle('on', x.dataset.themeOpt === t));
    // 그래프는 색을 그릴 때 정하므로 다시 그림
    window.dispatchEvent(new Event('themechange'));
  }
  window.setTheme = (t) => { localStorage.setItem('theme', t); applyTheme(); };
  media.addEventListener?.('change', () => getTheme() === 'system' && applyTheme());

  // ---------------------------------------------------------------- 사이드바 만들기
  const side = document.createElement('aside');
  side.className = 'app-side';
  side.id = 'appSide';
  side.innerHTML = `
    <div class="as-head"></div>
    <nav class="as-nav">${VIEWS.map(([k, n]) => `<button type="button" class="as-item" data-view="${k}" title="${n}">${I[k]}<span>${n}</span></button>`).join('')}</nav>
    <div class="as-label" id="asLabel">내역</div>
    <div class="as-slot" id="asSlot"><div class="as-recent" id="asRecent"></div><div class="as-empty hidden" id="asNone">중복 검사는 결과를 따로 저장하지 않아요.</div></div>
    <div class="as-foot">
      <button type="button" class="as-item" id="asSet" title="설정">${I.set}<span>설정</span></button>
    </div>`;
  document.body.prepend(side);
  const scrim = document.createElement('div');
  scrim.className = 'side-scrim';
  scrim.onclick = () => document.body.classList.remove('side-open');
  document.body.prepend(scrim);

  // 로고·이름은 사이드바로
  const brand = document.querySelector('.top .brand');
  if (brand) side.querySelector('.as-head').appendChild(brand);
  const modeTg = document.createElement('div');
  modeTg.className = 'mode-tg'; modeTg.id = 'modeTg'; modeTg.setAttribute('role', 'group'); modeTg.setAttribute('aria-label', '검색 엔진 모드');
  modeTg.innerHTML = '<button type="button" data-mode="naver" title="네이버 모드">NAVER</button><button type="button" data-mode="google" title="구글 모드 (무료 데이터 · 지금은 키워드 분석만)">Google</button>';
  const small = brand?.querySelector('small');
  if (small) small.replaceWith(modeTg); else side.querySelector('.as-head').appendChild(modeTg);
  modeTg.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setMode(b.dataset.mode); }));
  // 사이드바를 접었을 때는 한 글자 버튼(N / G)
  const modeMini = document.createElement('button');
  modeMini.type = 'button'; modeMini.className = 'as-item mode-mini'; modeMini.id = 'modeMini';
  modeMini.onclick = () => setMode(isG() ? 'naver' : 'google');
  side.querySelector('.as-nav').prepend(modeMini);

  // 상단 바: [사이드바 접기] | 화면 이름 · 검색 · 테마 · 기록 · 설정
  const top = document.querySelector('.top');
  const lead = document.createElement('div');
  lead.className = 'top-context';
  lead.innerHTML = `<button type="button" class="icon-btn" id="sideBtn" title="사이드바 접기/펴기">${I.side}</button><span class="top-sep"></span><span class="top-title" id="topTitle" tabindex="-1">키워드 분석</span>`;
  top.prepend(lead);
  // 키워드 검색창: 상단 바에서 빼서, 키워드 분석 화면에서만 본문 가운데에
  const kwBox = document.createElement('div');
  kwBox.className = 'kw-search hidden'; kwBox.id = 'kwSearch';
  document.getElementById('tabs')?.before(kwBox);
  const acts = top.querySelector('.top-actions');
  const tb = document.createElement('button');
  tb.type = 'button'; tb.className = 'icon-btn'; tb.id = 'themeBtn';
  tb.onclick = () => window.setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  acts.prepend(tb);
  // 초기화: 지금 보고 있는 메뉴를 처음 상태로 (작성 중인 게 있으면 그 메뉴의 탭/기록으로 저장한 뒤)
  const rb = document.createElement('button');
  rb.type = 'button'; rb.className = 'icon-btn reset-btn'; rb.id = 'resetBtn';
  rb.title = '초기화 · 지금 화면을 처음 상태로 (작성하던 건 탭으로 저장)';
  rb.setAttribute('aria-label', '초기화');
  rb.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><span>초기화</span>';
  rb.onclick = async () => {
    const v = current();
    let msg = null;
    if (isG()) { window.__G?.reset?.(); msg = '초기화했어요'; }
    else if (v === 'analyze') { if (typeof window.resetAnalyze === 'function') { window.resetAnalyze(); msg = '초기화했어요 (분석한 키워드는 왼쪽 최근 검색에 있어요)'; } }
    else if (v === 'dup') { document.getElementById('dReset')?.click(); return; } // 중복 검사는 따로 저장하는 내역이 없어서 확인창을 거쳐 비움
    else msg = window['__RESET_' + v]?.();
    rb.classList.remove('spin1'); void rb.offsetWidth; rb.classList.add('spin1');
    if (msg) window.toast?.(msg, 'ok');
  };
  acts.prepend(rb);
  const sb = document.getElementById('setBtn');
  if (sb) { sb.className = 'icon-btn'; sb.innerHTML = I.set; sb.title = '설정'; }
  const headerMenu = (id, label) => {
    const root = document.createElement('details'); root.className = 'header-menu'; root.id = id;
    const trigger = document.createElement('summary'); trigger.className = 'btn sm'; trigger.textContent = label;
    const panel = document.createElement('div'); panel.className = 'card header-panel';
    root.append(trigger, panel); acts.append(root);
    return { root, trigger, panel };
  };
  const work = headerMenu('activeWork', '작업'); work.root.hidden = true; acts.prepend(work.root);
  work.root.addEventListener('keydown', e => { if (e.key === 'Escape' && work.root.open) { e.preventDefault(); work.root.open = false; work.trigger.focus(); } });
  document.addEventListener('click', e => { if (!work.root.contains(e.target)) work.root.open = false; });

  document.getElementById('sideBtn').onclick = () => {
    if (matchMedia('(max-width: 900px)').matches) { document.body.classList.toggle('side-open'); return; }
    document.body.classList.toggle('side-collapsed');
    localStorage.setItem('sideCollapsed', document.body.classList.contains('side-collapsed') ? '1' : '0');
  };
  if (localStorage.getItem('sideCollapsed') === '1') document.body.classList.add('side-collapsed');
  document.getElementById('asSet').onclick = () => window.openSettings?.();

  // ---------------------------------------------------------------- 화면 전환
  const isOn = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
  const current = () => (isG() ? 'analyze' : isOn('copyView') ? 'copy' : isOn('mockView') ? 'mock' : isOn('plView') ? 'pl' : isOn('aiView') ? 'ai' : isOn('dupView') ? 'dup' : isOn('bulkView') ? 'bulk' : 'analyze');
  // 메뉴(탭)마다 마지막 스크롤 위치: 새로고침해도 유지 (sessionStorage)
  let POS = {};
  try { POS = JSON.parse(sessionStorage.getItem('ktPos') || '{}') || {}; } catch {}
  const savePos = () => { try { POS[current()] = scrollY; sessionStorage.setItem('ktPos', JSON.stringify(POS)); } catch {} };
  addEventListener('pagehide', savePos);
  let posT = 0;
  addEventListener('scroll', () => { clearTimeout(posT); posT = setTimeout(savePos, 300); }, { passive: true });
  // 내용이 늦게 그려져서 아직 짧으면 그 위치까지 못 내려감 → 내용이 다 그려질 때까지(최대 4초) 다시 맞춤. 사용자가 직접 스크롤하면 멈춤
  let restoreJob = 0;
  function restoreY(y) {
    const job = ++restoreJob;
    if (!y) { scrollTo(0, 0); return; }
    const t0 = Date.now();
    const stop = () => { restoreJob++; off(); };
    const off = () => { removeEventListener('wheel', stop); removeEventListener('keydown', stop); removeEventListener('touchstart', stop); removeEventListener('mousedown', stop); };
    addEventListener('wheel', stop, { passive: true }); addEventListener('keydown', stop); addEventListener('touchstart', stop, { passive: true }); addEventListener('mousedown', stop);
    const tick = () => {
      if (job !== restoreJob) return;
      scrollTo(0, y);
      if (Math.abs(scrollY - y) < 4 || Date.now() - t0 > 4000) { off(); return; }
      setTimeout(tick, 120);
    };
    tick();
  }
  function go(v) {
    document.body.classList.remove('side-open');
    if (isG()) { if (v === 'analyze') return; setMode('naver'); }
    if (v === current()) return;
    savePos();
    if (v !== 'copy') window.__hideCopy?.();
    if (v !== 'mock') window.__hideMock?.();
    if (v !== 'pl') window.__hidePl?.();
    if (v === 'copy') window.showCopy?.(true);
    if (v === 'mock') window.showMock?.(true);
    if (v === 'pl') window.showPl?.(true);
    if (v === 'analyze') {
      if (isOn('aiView')) window.showAI?.(false);
      if (isOn('dupView')) window.showDup?.(false);
      if (isOn('bulkView')) window.showBulk?.(false);
    }
    if (v === 'ai') window.showAI?.(true);
    if (v === 'dup') window.showDup?.(true);
    if (v === 'bulk') window.showBulk?.(true);
    sync();
    // 그 탭에서 보던 위치로 (내용이 늦게 그려져도 따라가서 맞춤)
    restoreY(POS[v] || 0);
  }
  const workLinks = new Map();
  for (const [v,name] of [['bulk','대량 분석'],['ai','AI 키워드 생성기'],['pl','파워링크 분석기']]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm header-job'; b.hidden = true;
    const title = document.createElement('b'), info = document.createElement('span'); info.className = 'muted'; title.textContent = name;
    b.append(title, info); work.panel.append(b); workLinks.set(v, [b,info]);
    b.onclick = () => { const job = v === 'pl' ? window.__PL_WORK?.read() : null; work.root.open = false; go(v); if (job?.id) window.__PL_WORK?.open(job.id); document.getElementById('topTitle')?.focus({ preventScroll: true }); };
  }
  const workText = id => document.getElementById(id)?.textContent?.trim() || '';
  function syncWork() {
    const bulk = window.__BULK?.B, ai = window.__AI?.AI, pl = window.__PL_WORK?.read();
    const resume = bulk?.info?.resume;
    const saved = bulk?.lastSavedCount ?? resume?.next ?? 0;
    const aiModel = document.querySelector('#aiProg:not(.hidden) .p-model')?.textContent?.trim();
    const states = {
      bulk: bulk?.busy ? [workText('bPhase') || '진행 중', '저장 ' + saved.toLocaleString('ko-KR') + '개'].join(' · ') : bulk?.vbusy ? '재검증 중' : resume ? '이어하기 가능 · 저장 ' + resume.next.toLocaleString('ko-KR') + '개' : '',
      ai: ai?.busy ? [ai.busy, aiModel].filter(Boolean).join(' · ') : '',
      pl: pl ? ['분석 중', pl.note || pl.cur].filter(Boolean).join(' · ') : '',
    };
    for (const [v,[b,info]] of workLinks) {
      b.hidden = !states[v] || (!isG() && current() === v);
      if (info.textContent !== states[v]) info.textContent = states[v];
    }
    const count = [...workLinks.values()].filter(([b]) => !b.hidden).length;
    if (!count && work.root.open) { if (work.root.contains(document.activeElement)) document.getElementById('topTitle')?.focus({ preventScroll: true }); work.root.open = false; }
    work.root.hidden = !count;
    const label = '작업 ' + count;
    if (work.trigger.textContent !== label) work.trigger.textContent = label;
  }
  setInterval(syncWork, 600);
  side.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => go(b.dataset.view)));

  // 각 화면의 내역 목록(AI 생성기·대량 분석)을 사이드바 안으로
  function adopt() {
    const slot = document.getElementById('asSlot');
    ['aiSide', 'bSide', 'cSide', 'mSide', 'pSide'].forEach((id) => { const el = document.getElementById(id); if (el && el.parentElement !== slot) slot.appendChild(el); });
  }

  // 키워드 분석: 최근 검색
  function recent() {
    let h = [];
    try { h = JSON.parse(localStorage.getItem(isG() ? 'gHistory' : 'kwHistory') || '[]'); } catch {}
    const box = document.getElementById('asRecent');
    const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = h.length
      ? h.slice(0, 30).map((x) => `<div class="rk" data-rk="${esc2(x.kw)}"><span>${esc2(x.kw)}</span><small>${new Date(x.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</small></div>`).join('')
      : '<div class="as-empty">분석한 키워드가 여기 쌓여요.</div>';
    box.querySelectorAll('[data-rk]').forEach((r) => (r.onclick = () => { document.body.classList.remove('side-open'); if (isG()) window.__G?.run(r.dataset.rk); else window.run?.(r.dataset.rk); scrollTo({ top: 0 }); }));
  }
  if (typeof window.renderHist === 'function') {
    const orig = window.renderHist;
    window.renderHist = function () { const r = orig.apply(this, arguments); recent(); return r; };
  }

  function sync() {
    if (isG() && ['aiView', 'dupView', 'bulkView', 'copyView', 'mockView', 'plView'].some(isOn)) { localStorage.setItem('siteMode', 'naver'); applyMode(); return; }
    adopt();
    const v = current();
    side.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    document.getElementById('topTitle').textContent = isG() ? 'Google 키워드 분석' : NAME[v];
    const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
    show('aiSide', v === 'ai'); show('bSide', v === 'bulk'); show('cSide', v === 'copy'); show('mSide', v === 'mock'); show('pSide', v === 'pl'); show('asRecent', v === 'analyze'); show('asNone', v === 'dup');
    document.getElementById('asLabel').textContent = v === 'analyze' ? '최근 검색' : v === 'mock' ? '캠페인' : '내역';
    // 설정 › 화면 › 숨길 버튼 → 사이드바에도 적용
    const hide = new Set((window.SETTINGS?.ui?.hideButtons) || []);
    side.querySelectorAll('[data-view]').forEach((b) => { const k = b.dataset.view; b.style.display = k !== 'analyze' && hide.has(k) && k !== v ? 'none' : ''; });
    if (v === 'analyze') recent();
    syncWork();
    placeSearch(v);
  }
  window.__LAYOUT = { sync, go, current };

  // 맨 위로 버튼: 한 화면 넘게 내려가면 오른쪽 아래에 작게
  const topBtn = document.createElement('button');
  topBtn.type = 'button'; topBtn.id = 'toTop'; topBtn.title = '맨 위로'; topBtn.setAttribute('aria-label', '맨 위로');
  topBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
  topBtn.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(topBtn);
  let topRaf = 0;
  addEventListener('scroll', () => { if (!topRaf) topRaf = requestAnimationFrame(() => { topRaf = 0; topBtn.classList.toggle('show', scrollY > innerHeight * 0.8); }); }, { passive: true });

  // 검색창 자리: 첫 화면이면 로고 아래 가운데, 분석 결과가 있으면 결과 위 가운데
  function placeSearch(v) {
    const form = document.getElementById('searchForm'), empty = document.getElementById('empty');
    if (!form) return;
    const hero = empty && !empty.classList.contains('hidden');
    if (hero) { if (form.parentElement !== empty) empty.insertBefore(form, document.getElementById('quick')); }
    else if (form.parentElement !== kwBox) kwBox.appendChild(form);
    kwBox.classList.toggle('hidden', v !== 'analyze' || !!hero || isG());
  }

  // ---------------------------------------------------------------- NAVER / Google 모드 바꾸기
  function setMode(m) {
    if (m === getMode()) return;
    localStorage.setItem('siteMode', m === 'google' ? 'google' : 'naver');
    applyMode();
    scrollTo({ top: 0 });
  }
  function applyMode() {
    const g = isG();
    document.body.classList.toggle('mode-google', g);
    modeTg.querySelectorAll('[data-mode]').forEach((b) => { b.classList.toggle('on', b.dataset.mode === getMode()); b.setAttribute('aria-pressed', String(b.dataset.mode === getMode())); });
    modeMini.textContent = g ? 'G' : 'N';
    modeMini.title = g ? '지금 구글 모드 · 누르면 네이버로' : '지금 네이버 모드 · 누르면 구글로';
    if (g) {
      window.__hideCopy?.(); window.__hideMock?.(); window.__hidePl?.();
      if (isOn('aiView')) window.showAI?.(false);
      if (isOn('dupView')) window.showDup?.(false);
      if (isOn('bulkView')) window.showBulk?.(false);
      window.__G?.show(true);
    } else window.__G?.show(false);
    sync();
  }
  window.__MODE = { get: getMode, set: setMode };

  // 화면이 바뀌면(다른 코드가 바꿔도) 사이드바·제목을 맞춤
  const mo = new MutationObserver(() => sync());
  ['aiView', 'dupView', 'bulkView', 'copyView', 'mockView', 'plView', 'main', 'empty'].forEach((id) => { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  if (typeof window.applyUI === 'function') { const o = window.applyUI; window.applyUI = function () { const r = o.apply(this, arguments); sync(); return r; }; }

  // ---------------------------------------------------------------- 서버 상태 띠: 꺼짐 / 예전 버전 / 코드가 바뀜 → 다시 시작
  const bar = document.createElement('div');
  bar.className = 'srv-bar hidden';
  document.querySelector('.top')?.after(bar);
  let lastStart = 0, restarting = false;
  async function checkServer() {
    if (restarting) return;
    let v = null, down = false;
    try { const r = await fetch('/api/version', { cache: 'no-store' }); v = r.ok ? await r.json() : { old: true }; } catch { down = true; }
    let html = '';
    if (down) html = '<b>분석기 서버가 꺼져 있어요.</b> 폴더의 <b>start.bat</b>을 실행해 주세요. (켜지면 이 띠는 저절로 사라져요)';
    else if (v.old) html = '<b>서버가 예전 버전이에요.</b> start.bat 창을 닫고 다시 실행하면 새 기능이 켜져요.';
    else if (v.stale) html = `<b>서버 코드가 바뀌었어요.</b> 다시 시작해야 적용돼요. ${v.canRestart ? '<button type="button" class="btn sm" id="srvRestart">서버 다시 시작</button>' : '(이번에는 start.bat 창을 닫고 다시 실행해 주세요. 다음부터는 버튼 한 번이면 돼요)'}`;
    if (v?.startedAt) { if (lastStart && v.startedAt !== lastStart && !v.stale) toast('서버가 새로 켜졌어요.', 'ok'); lastStart = v.startedAt; }
    bar.innerHTML = html;
    bar.classList.toggle('hidden', !html);
    bar.classList.toggle('down', down);
    const b = document.getElementById('srvRestart');
    if (b) b.onclick = restart;
  }
  async function restart() {
    restarting = true;
    bar.innerHTML = '<span class="spin" style="display:inline-block;width:12px;height:12px;border-width:2px;vertical-align:-2px"></span> 서버를 다시 시작하는 중...';
    try { const r = await (await fetch('/api/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json(); if (!r.ok) { restarting = false; bar.innerHTML = r.error || '다시 시작하지 못했어요'; return; } } catch {}
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      try { const v = await (await fetch('/api/version', { cache: 'no-store' })).json(); if (v.startedAt && v.startedAt !== lastStart) { location.reload(); return; } } catch {}
      if (Date.now() - t0 > 30000) { restarting = false; bar.innerHTML = '<b>30초가 지나도 서버가 다시 켜지지 않았어요.</b> start.bat 창을 확인해 주세요.'; return; }
    }
  }
  window.__LAYOUT.checkServer = checkServer;
  checkServer();
  setInterval(checkServer, 30000);
  addEventListener('focus', checkServer);

  applyTheme();
  sync();
  applyMode();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // 브라우저 기본 복원은 내용이 늦게 그려지면 실패해서 직접 함
  setTimeout(() => restoreY(POS[current()] || 0), 50);
})();
