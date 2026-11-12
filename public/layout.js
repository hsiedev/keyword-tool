// 화면 틀: 왼쪽 사이드바(기능 4개 + 내역) · 상단 바(제목 · 검색 · 테마 · 설정) · 라이트/다크 테마
// 기존 기능 코드는 그대로 두고, 버튼·목록 위치만 옮겨요.
(function () {
  const I = {
    analyze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
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
  ];
  const NAME = Object.fromEntries(VIEWS);

  // ---------------------------------------------------------------- 테마
  const media = matchMedia('(prefers-color-scheme: dark)');
  const getTheme = () => localStorage.getItem('theme') || 'light';
  function applyTheme() {
    const t = getTheme();
    document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && media.matches));
    const b = document.getElementById('themeBtn');
    if (b) { const dark = document.documentElement.classList.contains('dark'); b.innerHTML = dark ? I.sun : I.moon; b.title = dark ? '라이트 모드로' : '다크 모드로'; }
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

  // 상단 바: [사이드바 접기] | 화면 이름 · 검색 · 테마 · 기록 · 설정
  const top = document.querySelector('.top');
  const lead = document.createElement('div');
  lead.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0';
  lead.innerHTML = `<button type="button" class="icon-btn" id="sideBtn" title="사이드바 접기/펴기">${I.side}</button><span class="top-sep"></span><span class="top-title" id="topTitle">키워드 분석</span>`;
  top.prepend(lead);
  const acts = top.querySelector('.top-actions');
  const tb = document.createElement('button');
  tb.type = 'button'; tb.className = 'icon-btn'; tb.id = 'themeBtn';
  tb.onclick = () => window.setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  acts.prepend(tb);
  const sb = document.getElementById('setBtn');
  if (sb) { sb.className = 'icon-btn'; sb.innerHTML = I.set; sb.title = '설정'; }

  document.getElementById('sideBtn').onclick = () => {
    if (matchMedia('(max-width: 900px)').matches) { document.body.classList.toggle('side-open'); return; }
    document.body.classList.toggle('side-collapsed');
    localStorage.setItem('sideCollapsed', document.body.classList.contains('side-collapsed') ? '1' : '0');
  };
  if (localStorage.getItem('sideCollapsed') === '1') document.body.classList.add('side-collapsed');
  document.getElementById('asSet').onclick = () => window.openSettings?.();

  // ---------------------------------------------------------------- 화면 전환
  const isOn = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
  const current = () => (isOn('aiView') ? 'ai' : isOn('dupView') ? 'dup' : isOn('bulkView') ? 'bulk' : 'analyze');
  function go(v) {
    document.body.classList.remove('side-open');
    if (v === current()) return;
    if (v === 'analyze') {
      if (isOn('aiView')) window.showAI?.(false);
      if (isOn('dupView')) window.showDup?.(false);
      if (isOn('bulkView')) window.showBulk?.(false);
    }
    if (v === 'ai') window.showAI?.(true);
    if (v === 'dup') window.showDup?.(true);
    if (v === 'bulk') window.showBulk?.(true);
    scrollTo({ top: 0 });
    sync();
  }
  side.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => go(b.dataset.view)));

  // 각 화면의 내역 목록(AI 생성기·대량 분석)을 사이드바 안으로
  function adopt() {
    const slot = document.getElementById('asSlot');
    ['aiSide', 'bSide'].forEach((id) => { const el = document.getElementById(id); if (el && el.parentElement !== slot) slot.appendChild(el); });
  }

  // 키워드 분석: 최근 검색
  function recent() {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('kwHistory') || '[]'); } catch {}
    const box = document.getElementById('asRecent');
    const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = h.length
      ? h.slice(0, 30).map((x) => `<div class="rk" data-rk="${esc2(x.kw)}"><span>${esc2(x.kw)}</span><small>${new Date(x.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</small></div>`).join('')
      : '<div class="as-empty">분석한 키워드가 여기 쌓여요.</div>';
    box.querySelectorAll('[data-rk]').forEach((r) => (r.onclick = () => { document.body.classList.remove('side-open'); window.run?.(r.dataset.rk); scrollTo({ top: 0 }); }));
  }
  if (typeof window.renderHist === 'function') {
    const orig = window.renderHist;
    window.renderHist = function () { const r = orig.apply(this, arguments); recent(); return r; };
  }

  function sync() {
    adopt();
    const v = current();
    side.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    document.getElementById('topTitle').textContent = NAME[v];
    const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
    show('aiSide', v === 'ai'); show('bSide', v === 'bulk'); show('asRecent', v === 'analyze'); show('asNone', v === 'dup');
    document.getElementById('asLabel').textContent = v === 'analyze' ? '최근 검색' : v === 'dup' ? '내역' : '내역';
    // 설정 › 화면 › 숨길 버튼 → 사이드바에도 적용
    const hide = new Set((window.SETTINGS?.ui?.hideButtons) || []);
    side.querySelectorAll('[data-view]').forEach((b) => { const k = b.dataset.view; b.style.display = k !== 'analyze' && hide.has(k) && k !== v ? 'none' : ''; });
    if (v === 'analyze') recent();
  }
  window.__LAYOUT = { sync, go, current };

  // 화면이 바뀌면(다른 코드가 바꿔도) 사이드바·제목을 맞춤
  const mo = new MutationObserver(() => sync());
  ['aiView', 'dupView', 'bulkView', 'main'].forEach((id) => { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
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
})();
