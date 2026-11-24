// 집중 피킹 모드 (모든 키워드 표 공용)
// - 표 위의 [집중 피킹] 버튼으로 켜고 끔 (Esc로도 끝)
// - ↑↓ 로 한 줄씩 이동, Space 로 그 줄 체크/해제, Home/End 로 처음/끝
// - 보고 있는 줄 위아래를 검정 그라데이션으로 살짝 어둡게 해서 그 줄만 눈에 들어오게
(function () {
  // 대상 표: 키워드 분석(연관), AI 키워드 생성기, 대량 분석, 키워드 중복 검사, 구글 모드 키워드 표
  const TABLES = '#relTbl, #aiTbl, #bTblWrap > table, #dTblWrap > table, #gView table.g-tbl, #bidTable';
  const FP = { table: null, idx: -1, raf: 0 };
  let shade, pill;

  const rowsOf = (t) => [...(t?.tBodies[0]?.rows || [])].filter((r) => r.cells.length > 1 && r.offsetParent !== null);
  const visible = (el) => !!el && el.isConnected && el.offsetParent !== null;
  const cbOf = (tr) => tr?.querySelector('input[type="checkbox"]');

  function ensureUi() {
    if (shade) return;
    shade = document.createElement('div');
    shade.id = 'fpShade';
    shade.innerHTML = '<div class="fp-top"></div><div class="fp-bot"></div>';
    pill = document.createElement('div');
    pill.id = 'fpPill';
    document.body.append(shade, pill);
  }

  function place() {
    FP.raf = 0;
    const t = FP.table;
    if (!t) return;
    if (!visible(t)) return stop();
    const rows = rowsOf(t);
    if (!rows.length) { shade.firstChild.style.transform = shade.lastChild.style.transform = 'translate3d(0,-200vh,0)'; if (pill.textContent !== '집중 피킹 · 표시할 키워드가 없어요 · Esc 끝내기') pill.textContent = '집중 피킹 · 표시할 키워드가 없어요 · Esc 끝내기'; return; }
    FP.idx = Math.max(0, Math.min(FP.idx, rows.length - 1));
    rows.forEach((r, i) => r.classList.toggle('fp-on', i === FP.idx));
    const tr = rows[FP.idx];
    const rc = tr.getBoundingClientRect();
    const H = innerHeight;
    // 위 막: 아래쪽 끝이 줄 위쪽에, 아래 막: 위쪽 끝이 줄 아래쪽에 오게 (막 높이는 화면 높이 + 그라데이션 여유)
    shade.firstChild.style.transform = `translate3d(0,${Math.round(rc.top - H - 70)}px,0)`;
    shade.lastChild.style.transform = `translate3d(0,${Math.round(rc.bottom)}px,0)`;
    const cb = cbOf(tr);
    const html = `<b>집중 피킹</b> ${FP.idx + 1} / ${rows.length}${cb ? ` · ${cb.disabled ? '지금은 선택할 수 없음' : cb.checked ? '<span class="fp-ck">체크됨</span>' : '체크 안 됨'}` : ''} <span class="fp-keys">↑↓ 이동${cb && !cb.disabled ? ' · Space 체크' : ''} · Esc 끝내기</span>`;
    if (pill.innerHTML !== html) pill.innerHTML = html; // 바뀔 때만 (DOM 감시가 다시 부르지 않게)
  }
  const schedule = () => { if (FP.table && !FP.raf) FP.raf = requestAnimationFrame(place); };

  function move(d, abs) {
    const rows = rowsOf(FP.table);
    if (!rows.length) return;
    FP.idx = abs != null ? abs : Math.max(0, Math.min(rows.length - 1, FP.idx + d));
    keepVisible(rows[FP.idx]);
    place();
  }

  // 보고 있는 줄을 항상 화면 가운데에 고정: 표(안쪽 스크롤)와 화면을 즉시 움직여서 줄은 제자리, 내용만 지나감
  // (표 처음·끝처럼 더 못 움직이는 곳에서만 줄이 가운데를 벗어남)
  function keepVisible(tr) {
    const wrap = tr.closest('.tbl-wrap');
    const head = FP.table.tHead?.getBoundingClientRect().height || 0;
    if (wrap && wrap.scrollHeight > wrap.clientHeight + 2) {
      const w = wrap.getBoundingClientRect(), rc = tr.getBoundingClientRect();
      const mid = w.top + head + (w.height - head) / 2;
      wrap.scrollTop += (rc.top + rc.height / 2) - mid; // 표 안에서 가운데로
    }
    const rc = tr.getBoundingClientRect();
    const d = (rc.top + rc.height / 2) - innerHeight / 2;
    if (Math.abs(d) > 1) scrollTo({ top: scrollY + d, behavior: 'instant' }); // 화면 가운데로
  }
  function start(t) {
    ensureUi();
    if (FP.table && FP.table !== t) stop();
    FP.table = t;
    // 처음 줄: 화면 가운데에 가장 가까운 줄
    const rows = rowsOf(t);
    const mid = innerHeight / 2;
    let best = 0, bd = Infinity;
    rows.forEach((r, i) => { const b = r.getBoundingClientRect(); const dd = Math.abs((b.top + b.bottom) / 2 - mid); if (dd < bd) { bd = dd; best = i; } });
    FP.idx = best;
    document.body.classList.add('fp-mode');
    t.classList.add('fp-table');
    wrapOf(t)?.classList.add('fp-cur');
    shade.hidden = pill.hidden = false;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (rows[FP.idx]) keepVisible(rows[FP.idx]);
    place();
    syncButtons();
  }
  function stop() {
    if (FP.table) FP.table.querySelectorAll('tr.fp-on').forEach((r) => r.classList.remove('fp-on'));
    FP.table?.classList.remove('fp-table');
    document.querySelectorAll('.tbl-wrap.fp-cur').forEach((w) => w.classList.remove('fp-cur'));
    FP.table = null;
    document.body.classList.remove('fp-mode');
    if (shade) { shade.hidden = pill.hidden = true; }
    syncButtons();
  }

  // 표 위에 [집중 피킹] 버튼 달기: 표 바로 위 줄(toolbar)이 있으면 그 끝에, 없으면 작은 줄을 만들어서
  function wrapOf(t) { return t.closest('.tbl-wrap') || t.parentElement; }
  function attach() {
    document.querySelectorAll(TABLES).forEach((t) => {
      const w = wrapOf(t);
      if (!w || w.dataset.fp) return;
      w.dataset.fp = '1';
      const btn = document.createElement('button');
      btn.className = 'btn fp-btn';
      btn.type = 'button';
      btn.title = '키워드를 한 줄씩 보며 고르는 모드: ↑↓ 이동, Space 체크/해제, Esc 끝내기';
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"/></svg> 집중 피킹';
      btn.onclick = () => { const tb = w.querySelector('table'); if (FP.table && FP.table === tb) stop(); else if (tb) start(tb); };
      const prev = w.previousElementSibling;
      if (prev && prev.classList.contains('toolbar') && !prev.id) prev.append(btn); // 고정 툴바
      else {
        const bar = document.createElement('div');
        bar.className = 'fp-bar';
        bar.append(btn);
        w.before(bar);
      }
    });
    // 다시 그려지는 툴바(대량 분석)는 매번 버튼이 사라지므로 표 위 작은 줄을 씀 (위 else 경로)
    syncButtons();
  }
  function syncButtons() {
    document.querySelectorAll('.fp-btn').forEach((b) => {
      const w = b.closest('.fp-bar')?.nextElementSibling || b.closest('.toolbar')?.nextElementSibling;
      const on = !!FP.table && w && w.contains(FP.table);
      b.classList.toggle('on', on);
    });
  }

  // 키보드
  document.addEventListener('keydown', (e) => {
    if (!FP.table) return;
    if (!visible(FP.table)) return stop();
    const el = e.target;
    const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el.tagName === 'INPUT' && el.type === 'checkbox');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ([...document.querySelectorAll('.modal-bg, .cfm-bg, .rv-bg, dialog[open], .bid-diag:not(.hidden)')].some((m) => !m.classList.contains('hidden') && m.getClientRects().length)) return; // 설정·확인창이 떠 있으면 건드리지 않음
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const now = performance.now();
      if (e.repeat && now - (FP.last || 0) < 60) return;
      FP.last = now;
      move(e.key === 'ArrowDown' ? 1 : -1);
    }
    else if (e.key === 'Home') { e.preventDefault(); move(0, 0); }
    else if (e.key === 'End') { e.preventDefault(); move(0, rowsOf(FP.table).length - 1); }
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      const cb = cbOf(rowsOf(FP.table)[FP.idx]);
      if (cb) { cb.click(); if (document.activeElement === cb) cb.blur(); }
      setTimeout(place, 0); // 체크 후 표가 다시 그려져도 같은 줄 유지
    } else if (e.key === 'Escape') { e.preventDefault(); stop(); }
  }, true);

  // 집중 중에 줄을 마우스로 누르면 그 줄로 이동
  document.addEventListener('click', (e) => {
    if (!FP.table) return;
    const tr = e.target.closest?.('tr');
    if (!tr || !FP.table.contains(tr)) return;
    const i = rowsOf(FP.table).indexOf(tr);
    if (i >= 0) { FP.idx = i; schedule(); }
  });

  // 표가 다시 그려지면(정렬·체크·필터) 같은 위치의 줄을 다시 찾고, 새 표에는 버튼을 담
  new MutationObserver(() => {
    attach();
    if (FP.table && !FP.table.isConnected) {
      // innerHTML로 표가 통째로 바뀐 경우(대량 분석·중복 검사): 같은 자리의 새 표로 이어감
      const w = document.querySelector('.tbl-wrap.fp-cur');
      const nt = w?.querySelector('table');
      if (nt) { FP.table = nt; nt.classList.add('fp-table'); } else return stop();
    }
    if (FP.table) {
      document.querySelectorAll('.tbl-wrap.fp-cur').forEach((w) => w.classList.remove('fp-cur'));
      wrapOf(FP.table)?.classList.add('fp-cur');
      schedule();
    }
  }).observe(document.body, { childList: true, subtree: true });
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  window.FocusPick = { start, stop, get on() { return !!FP.table; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach); else attach();
})();
