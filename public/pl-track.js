// 파워링크 순위 추적 화면 (파워링크 분석기 왼쪽 '순위 추적')
// - 확인은 서버(powerlink-track.mjs)가 계속 함. 이 화면은 5초마다 상태를 읽어 보여주기만 함 → 탭을 닫아도 추적은 계속
// - 알림: 어느 메뉴에 있든 15초마다 새 알림을 확인해서 화면 알림 + 윈도 알림 (추적마다 켜고 끄기)
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const e2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => (v == null || v === '' ? '' : Math.round(+v).toLocaleString('ko-KR'));
  const DEVN = { pc: 'PC', mo: '모바일' }, MAXN = { pc: 10, mo: 5 };
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t, sec) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? ':' + pad(d.getSeconds()) : ''}`; };
  const dayClock = (t) => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? clock(t) : `${d.getMonth() + 1}/${d.getDate()} ${clock(t)}`; };
  const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}초` : s < 3600 ? `${Math.floor(s / 60)}분${s % 60 ? ' ' + (s % 60) + '초' : ''}` : `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분`; };
  const fmtMin = (m) => (m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`);
  const rankText = (r, dev) => (r == null ? '미노출' : r > MAXN[dev] ? `더보기 ${r}위` : `${r}위`);
  const gapS = () => (window.SETTINGS?.rules?.powerlink?.gapMs || 1200) / 1000 + 0.15;
  const INTERVALS = [1, 3, 5, 10, 15, 30, 60], CAPS = [10, 30, 50, 100];
  const DURS = [[30, '30분'], [60, '1시간'], [120, '2시간'], [180, '3시간'], [360, '6시간'], [720, '12시간']];
  const RANGES = [['1h', '1시간'], ['3h', '3시간'], ['today', '오늘'], ['7d', '7일'], ['30d', '30일']];

  const S = { list: [], sel: localStorage.getItem('pltSel') || '', row: '', range: localStorage.getItem('pltRange') || 'today', edit: null,
    pause: 0, onCount: 0, onKw: 0, root: null, loaded: false, pts: null, ptsKey: '', busy: false };
  const api = async (url, body) => {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    if (r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) throw new Error('서버를 다시 시작해야 순위 추적을 쓸 수 있어요 (상단 [서버 다시 시작])');
    let j; try { j = await r.json(); } catch { throw new Error('서버를 다시 시작해야 순위 추적을 쓸 수 있어요 (상단 [서버 다시 시작])'); }
    if (!r.ok || j.error) throw new Error(j.error || '서버 오류 ' + r.status);
    return j;
  };
  const cur = () => S.list.find((t) => t.id === S.sel) || S.list[0] || null;
  const visible = () => !!S.root?.isConnected && !$('#plView')?.classList.contains('hidden');

  // ---------------------------------------------------------------- 불러오기
  async function refresh(force) {
    if (S.busy && !force) return;
    S.busy = true;
    try {
      const j = await api('/api/pl/track');
      S.list = j.trackers || []; S.pause = j.pauseUntil || 0; S.onCount = j.on || 0; S.onKw = j.onKw || 0; S.loaded = true; S.err = '';
      if (!S.list.some((t) => t.id === S.sel)) S.sel = S.list[0]?.id || '';
      sideBadge();
      if (visible()) draw(true);
    } catch (e) { S.err = e.message; S.loaded = true; if (visible()) draw(true); }
    finally { S.busy = false; }
  }

  // ---------------------------------------------------------------- 그리기
  function draw(soft) {
    const root = S.root;
    if (!root?.isConnected) return;
    if (S.edit) { if (!soft || !root.querySelector('#pltForm')) { root.innerHTML = formHTML(); bindForm(); } return; }
    // 표의 목표 칸에 입력 중이면 통째로 다시 그리지 않음 (상태 줄만)
    const typing = root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (soft && typing) { const h = root.querySelector('#pltHead'); if (h && cur()) h.outerHTML = headHTML(cur()); bindHead(); return; }
    if (!S.loaded) { root.innerHTML = '<div class="muted" style="padding:20px">불러오는 중…</div>'; return; }
    if (S.err && !S.list.length) { root.innerHTML = `<div class="card"><b>순위 추적을 불러오지 못했어요</b><div class="muted" style="margin-top:6px">${e2(S.err)}</div></div>`; return; }
    if (!S.list.length) { root.innerHTML = emptyHTML(); $('#pltNew', root).onclick = () => openForm(); return; }
    const t = cur();
    const scroll = root.querySelector('.plt-tbl')?.scrollTop || 0;
    root.innerHTML = `${chipsHTML()}<div class="card plt-card">${headHTML(t)}${tableHTML(t)}<div id="pltChart" class="plt-chart"></div></div>`;
    const tb = root.querySelector('.plt-tbl'); if (tb) tb.scrollTop = scroll;
    bindChips(); bindHead(); bindTable(t);
    chart(t);
  }
  function emptyHTML() {
    return `<div class="card plt-empty">
      <h3>순위 추적</h3>
      <p>입찰가를 바꾼 뒤 내 파워링크가 <b>몇 위로 움직이는지</b> 계속 확인해요. 켜 두면 이 PC가 정해진 간격(기본 5분)으로 네이버를 검색해서 순위만 기록해요. 광고는 누르지 않고 캡처도 하지 않아요.</p>
      <ul class="muted"><li>브라우저 탭을 닫아도 서버(start.bat 창)가 켜져 있으면 계속 확인해요. PC를 끄거나 절전에 들어가면 멈추고, 서버를 다시 켜면 이어가요.</li>
      <li>입찰가를 기록하면 그 키워드만 <b>20분 동안 1분마다</b> 확인해서 변화를 빨리 볼 수 있어요.</li>
      <li>목표 순위에 닿거나 밀리면, 광고가 안 보이면 알림을 줄 수 있어요 (추적마다 켜고 끄기).</li></ul>
      <button class="btn pri" id="pltNew">+ 새 추적 만들기</button></div>`;
  }
  function chipsHTML() {
    return `<div class="plt-chips">${S.list.map((t) => `<button type="button" class="plt-chip ${t.id === cur()?.id ? 'on' : ''}" data-tid="${e2(t.id)}" title="${e2(t.name)}"><span class="plt-dot ${t.on ? (t.waiting ? 'wait' : 'on') : ''}"></span>${e2(t.name)}</button>`).join('')}
      <button type="button" class="plt-chip add" id="pltNew">+ 새 추적</button>
      ${S.onCount ? `<span class="muted plt-load">켜진 추적 ${S.onCount}개 · 한 바퀴 검색 ${S.onKw.toLocaleString('ko-KR')}번</span>` : ''}</div>`;
  }
  function schedText(t) {
    const s = t.sched || {};
    if (s.mode === 'hours') return `매일 ${s.from}~${s.to}`;
    if (s.mode === 'for') return `시작부터 ${fmtMin(s.minutes)}`;
    return '24시간 계속';
  }
  function statusHTML(t) {
    const now = Date.now();
    if (S.pause > now && t.on) return `<span class="plt-st warn">네이버 검색 제한 → ${dur(S.pause - now)} 쉬었다 이어가요</span>`;
    if (!t.on) return `<span class="plt-st">멈춤${t.endReason === 'time' ? ' · 추적 시간이 끝났어요' : ''}${t.stoppedAt ? ` · ${dayClock(t.stoppedAt)}` : ''}</span>`;
    if (t.waiting) return `<span class="plt-st wait">${e2(t.note)}</span>`;
    const left = t.endAt ? ` · 남은 시간 <b data-left="${t.endAt}">${dur(t.endAt - now)}</b>` : '';
    if (t.inRound) return `<span class="plt-st on">확인 중 · ${e2(t.cur)}${left}</span>`;
    return `<span class="plt-st on">추적 중 · 다음 확인 <b data-next="${t.nextAt}">${t.nextAt > now ? dur(t.nextAt - now) + ' 뒤' : '곧'}</b>${left}</span>${t.note ? ` <span class="plt-st warn">${e2(t.note)}</span>` : ''}`;
  }
  function headHTML(t) {
    const kwN = t.items.filter((i) => i.on !== false).length, per = kwN * t.devices.length;
    return `<div id="pltHead" class="plt-head">
      <div class="plt-title"><span class="plt-dot big ${t.on ? (t.waiting ? 'wait' : 'on') : ''}"></span><b>${e2(t.name)}</b>${statusHTML(t)}</div>
      <div class="plt-meta muted">${t.interval}분마다 · ${t.devices.map((d) => DEVN[d]).join('·')} · 키워드 ${kwN}개 · 한 바퀴 ${per}번 검색(약 ${dur(per * gapS() * 1000)}) · ${schedText(t)}${t.roundMs ? ` · 지난 바퀴 ${dur(t.roundMs)}` : ''}</div>
      <div class="plt-acts">
        <label class="inl" title="목표 순위 도달·이탈, 미노출일 때 화면 알림과 윈도 알림"><input type="checkbox" id="pltNotify" ${t.notify ? 'checked' : ''}> 알림</label>
        <button class="btn" id="pltNow" ${t.on && !t.waiting ? '' : 'disabled'} title="다음 확인을 기다리지 않고 지금 한 바퀴 확인">지금 확인</button>
        <button class="btn" id="pltEdit">설정</button>
        <button class="btn" id="pltXlsx" title="확인 기록을 엑셀로 (그래프 아래 기간 기준)">엑셀</button>
        <button class="btn" id="pltDel">삭제</button>
        <button class="btn ${t.on ? '' : 'pri'}" id="pltOn">${t.on ? '멈춤' : '시작'}</button>
      </div></div>`;
  }
  function lastBid(t, key, dev) {
    for (let i = t.bids.length - 1; i >= 0; i--) { const b = t.bids[i]; if (b.key === key && (b.dev === dev || b.dev === 'both')) return b; }
    return null;
  }
  function spark(sp, dev) {
    const pts = (sp || []).filter((p) => p[0] > Date.now() - 3 * 3600000);
    if (!pts.length) return '<span class="muted">—</span>';
    const w = 96, h = 24, t0 = Date.now() - 3 * 3600000, span = 3 * 3600000;
    const mx = Math.max(MAXN[dev], ...pts.map((p) => p[1] || 0));
    let d = '', pen = false, dots = '', lx = null, ly = null;
    for (const [t, r] of pts) {
      const x = Math.min(w - 2, ((t - t0) / span) * w);
      if (r == null) { pen = false; dots += `<circle cx="${x.toFixed(1)}" cy="${h - 1.5}" r="1.4" class="plt-miss"/>`; continue; }
      const y = 2 + ((r - 1) / Math.max(1, mx - 1)) * (h - 6);
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); pen = true; lx = x; ly = y;
    }
    return `<svg class="plt-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}"/>${dots}${lx != null ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.2" class="plt-sp-last"/>` : ''}</svg>`;
  }
  function tableHTML(t) {
    if (!S.row || !t.rows.some((r) => r.key + '|' + r.dev === S.row)) S.row = t.rows[0] ? t.rows[0].key + '|' + t.rows[0].dev : '';
    const rows = t.rows.filter((r) => r.on);
    return `<div class="tbl-wrap plt-tbl"><table class="rel plt"><thead><tr><th class="l">키워드</th><th class="l">기기</th><th>지금</th><th>직전 대비</th><th>목표</th><th class="l">최근 3시간</th><th>확인</th><th class="l">입찰가 기록</th></tr></thead><tbody>
      ${rows.map((r) => {
        const k = r.key + '|' + r.dev, hit = r.r != null && r.target && r.r <= r.target;
        let ch = '<span class="muted">—</span>';
        if (r.at && r.prevAt) {
          if (r.r != null && r.prev != null) ch = r.r < r.prev ? `<span class="plt-up">▲${r.prev - r.r}</span>` : r.r > r.prev ? `<span class="plt-down">▼${r.r - r.prev}</span>` : '<span class="muted">그대로</span>';
          else if (r.r == null && r.prev != null) ch = '<span class="plt-down">사라짐</span>';
          else if (r.r != null && r.prev == null) ch = '<span class="plt-up">다시 보임</span>';
        }
        const b = lastBid(t, r.key, r.dev);
        const now = r.at ? `<span class="plt-rk ${r.r == null || r.r > MAXN[r.dev] ? 'dim' : hit ? 'ok' : ''}">${rankText(r.r, r.dev)}</span>` : '<span class="muted">아직</span>';
        return `<tr data-row="${e2(k)}" class="${k === S.row ? 'sel' : ''}">
          <td class="l"><b>${e2(r.kw)}</b>${r.focus ? ' <span class="plt-tag" title="입찰가 기록 뒤 20분 동안 1분마다 확인">집중 확인</span>' : ''}</td>
          <td class="l muted">${DEVN[r.dev]}</td>
          <td>${now}</td><td>${ch}</td>
          <td class="plt-tg"><input class="plt-tgi" type="number" min="1" max="25" placeholder="-" value="${r.target ?? ''}" data-tg="${e2(r.key)}" data-dev="${r.dev}" title="목표 순위 (비우면 목표 없음)">위 ${r.target ? `<span class="${hit ? 'plt-up' : 'muted'}" style="font-size:12px">${hit ? '달성' : r.at ? '미달' : ''}</span>` : ''}</td>
          <td class="l">${spark(r.sp, r.dev)}</td>
          <td class="muted" title="${r.at ? '확인 ' + r.n + '번' : ''}">${r.at ? clock(r.at) : ''}</td>
          <td class="l">${b ? `<span class="plt-bid" title="${e2(b.note || '')}">${dayClock(b.at)} · ${b.bid == null ? '메모' : n0(b.bid) + '원'}</span> ` : ''}<button class="btn sm" data-bid="${e2(r.key)}" data-dev="${r.dev}">+ 기록</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- 그래프 (고른 줄)
  async function chart(t) {
    const box = $('#pltChart', S.root);
    if (!box || !S.row) return;
    const [key, dev] = S.row.split('|');
    const r = t.rows.find((x) => x.key === key && x.dev === dev);
    if (!r) return;
    const want = `${t.id}|${S.row}|${S.range}|${r.at || 0}|${t.bids.length}`;
    if (S.ptsKey !== want) {
      try { const j = await api(`/api/pl/track/points?id=${encodeURIComponent(t.id)}&key=${encodeURIComponent(key)}&dev=${dev}&range=${S.range}`); S.pts = j; S.ptsKey = want; }
      catch (e) { box.innerHTML = `<div class="muted">${e2(e.message)}</div>`; return; }
    }
    if (!box.isConnected) return;
    const P = S.pts, pts = P.pts || [];
    const seen = pts.filter((p) => p[1] != null).map((p) => p[1]);
    const miss = pts.length - seen.length;
    const stat = pts.length ? `${seen.length ? `${Math.min(...seen)}~${Math.max(...seen)}위 · 평균 ${(seen.reduce((a, b) => a + b, 0) / seen.length).toFixed(1)}위 · ` : ''}확인 ${pts.length}번${miss ? ` · 미노출 ${miss}번` : ''}` : '이 기간에 확인 기록이 없어요';
    box.innerHTML = `<div class="plt-ch-h"><b>${e2(r.kw)} · ${DEVN[dev]}</b><span class="muted">${stat}</span>
      <div class="seg plt-seg">${RANGES.map(([v, n]) => `<button type="button" data-rg="${v}" class="${S.range === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="plt-svgw"><svg class="plt-svg" height="240"></svg><div class="plt-tip hidden"></div></div>
      <div class="muted plt-foot">로그아웃 화면 기준 · 확인할 때마다 1번 검색한 값이라 조금씩 흔들려요 · 아래 회색 점 = 미노출 · 세로선 = 입찰가 기록</div>`;
    $$('[data-rg]', box).forEach((b) => (b.onclick = () => { S.range = b.dataset.rg; localStorage.setItem('pltRange', S.range); chart(cur()); }));
    paint(box, r, dev, P, t);
  }
  function paint(box, r, dev, P, t) {
    const svg = $('.plt-svg', box), tip = $('.plt-tip', box);
    const W = svg.clientWidth || 800, H = 240, L = 44, R = 12, TP = 12, B = 24;
    const pts = P.pts || [], bids = P.bids || [];
    if (!pts.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="plt-ax">확인 기록이 쌓이면 여기에 순위 흐름이 그려져요</text>`; return; }
    const now = Date.now();
    let a = P.from, z = Math.max(now, pts.at(-1)[0]);
    if (S.range !== '1h' && S.range !== '3h') a = Math.max(P.from, Math.min(pts[0][0], ...bids.map((b) => b.at)) - 5 * 60000);
    if (z - a < 10 * 60000) a = z - 10 * 60000;
    const maxR = Math.max(...pts.map((p) => p[1] || 0));
    const top = Math.max(MAXN[dev], maxR) + (maxR > MAXN[dev] ? 1 : 0);
    const x = (tm) => L + ((tm - a) / (z - a)) * (W - L - R), y = (v) => TP + ((v - 1) / Math.max(1, top - 1)) * (H - TP - B - 10);
    let g = '';
    if (top > MAXN[dev]) g += `<rect x="${L}" y="${y(MAXN[dev] + 0.5)}" width="${W - L - R}" height="${y(top) - y(MAXN[dev] + 0.5) + 4}" class="plt-out"/><text x="${W - R - 4}" y="${y(MAXN[dev] + 0.5) + 13}" text-anchor="end" class="plt-ax">통합검색 밖 (광고 더보기)</text>`;
    const ticks = [...new Set([1, Math.round(MAXN[dev] / 2), MAXN[dev], top > MAXN[dev] + 1 ? top : null].filter(Boolean))];
    for (const v of ticks) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="plt-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="plt-ax">${v}위</text>`;
    // 시간 눈금
    const span = z - a, steps = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * 60000);
    const step = steps.find((s) => span / s <= 7) || steps.at(-1);
    const off = new Date().getTimezoneOffset() * 60000;
    for (let tm = Math.ceil((a - off) / step) * step + off; tm <= z; tm += step) {
      const d = new Date(tm), lab = step >= 86400000 || (d.getHours() === 0 && d.getMinutes() === 0 && span > 86400000) ? `${d.getMonth() + 1}/${d.getDate()}` : clock(tm);
      g += `<text x="${x(tm)}" y="${H - 6}" text-anchor="middle" class="plt-ax">${lab}</text>`;
    }
    if (r.target) g += `<line x1="${L}" x2="${W - R}" y1="${y(r.target)}" y2="${y(r.target)}" class="plt-target"/><text x="${L + 4}" y="${y(r.target) - 4}" class="plt-target-t">목표 ${r.target}위</text>`;
    for (const b of bids) {
      const bx = x(b.at);
      g += `<line x1="${bx}" x2="${bx}" y1="${TP}" y2="${H - B}" class="plt-bidl"/><text x="${Math.min(bx + 5, W - 120)}" y="${H - B - 8}" class="plt-bidt">입찰 ${b.bid == null ? '' : n0(b.bid) + '원'}${b.note ? ' · ' + e2(b.note.slice(0, 16)) : ''}</text>`;
      if (r.target) { const hitP = pts.find((p) => p[0] >= b.at && p[1] != null && p[1] <= r.target); if (hitP) g += `<text x="${Math.min(bx + 5, W - 120)}" y="${H - B - 22}" class="plt-bidt2">${dur(hitP[0] - b.at)} 뒤 목표 도달</text>`; }
    }
    // 선: 미노출이거나 기록이 오래 비면 끊음
    const brk = Math.max(3, (t.interval || 5) * 2.5) * 60000;
    let d = '', pen = false, prevT = 0, dots = '';
    for (const [tm, v] of pts) {
      if (v == null) { pen = false; dots += `<circle cx="${x(tm)}" cy="${H - B - 3}" r="2.2" class="plt-miss"/>`; prevT = tm; continue; }
      if (pen && tm - prevT > brk) pen = false;
      d += (pen ? 'L' : 'M') + x(tm).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; prevT = tm;
    }
    g += `<path d="${d}" class="plt-line"/>${dots}`;
    const lastP = [...pts].reverse().find((p) => p[1] != null);
    if (lastP) g += `<circle cx="${x(lastP[0])}" cy="${y(lastP[1])}" r="3.5" class="plt-last"/>`;
    if (pts.length < 200) for (const [tm, v] of pts) if (v != null) g += `<circle cx="${x(tm)}" cy="${y(v)}" r="1.8" class="plt-pt"/>`;
    g += `<line class="plt-cx" y1="${TP}" y2="${H - B}" visibility="hidden"/><rect class="plt-hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
    svg.innerHTML = g;
    const cx = $('.plt-cx', svg);
    $('.plt-hit', svg).onmousemove = (e) => {
      const bx = svg.getBoundingClientRect(), tm = a + ((e.clientX - bx.left - L) / (W - L - R)) * (z - a);
      let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - tm) < Math.abs(best[0] - tm)) best = p;
      cx.setAttribute('x1', x(best[0])); cx.setAttribute('x2', x(best[0])); cx.setAttribute('visibility', 'visible');
      tip.classList.remove('hidden'); tip.innerHTML = `${dayClock(best[0])} · <b>${rankText(best[1], dev)}</b>`;
      tip.style.left = Math.min(W - 150, x(best[0]) + 10) + 'px'; tip.style.top = (best[1] == null ? H - B - 30 : y(best[1]) + 8) + 'px';
    };
    $('.plt-hit', svg).onmouseleave = () => { tip.classList.add('hidden'); cx.setAttribute('visibility', 'hidden'); };
  }

  // ---------------------------------------------------------------- 동작
  function bindChips() {
    $$('[data-tid]', S.root).forEach((b) => (b.onclick = () => { S.sel = b.dataset.tid; localStorage.setItem('pltSel', S.sel); S.row = ''; S.ptsKey = ''; draw(); }));
    const nb = $('#pltNew', S.root); if (nb) nb.onclick = () => openForm();
  }
  function bindHead() {
    const t = cur(); if (!t || !S.root) return;
    const on = $('#pltOn', S.root);
    if (on) on.onclick = async () => {
      try { await api('/api/pl/track/' + (t.on ? 'stop' : 'start'), { id: t.id }); toast(t.on ? '추적을 멈췄어요' : '추적을 시작했어요. 첫 확인을 바로 해요', 'ok'); } catch (e) { toast(e.message, 'warn'); }
      refresh(true);
    };
    const now = $('#pltNow', S.root);
    if (now) now.onclick = async () => { try { const j = await api('/api/pl/track/now', { id: t.id }); toast(j.inRound ? '지금 확인 중이에요' : '지금 확인할게요', 'ok'); } catch (e) { toast(e.message, 'warn'); } setTimeout(() => refresh(true), 1500); };
    const ed = $('#pltEdit', S.root); if (ed) ed.onclick = () => openForm(t);
    const xl = $('#pltXlsx', S.root); if (xl) xl.onclick = () => { location.href = `/api/pl/track/xlsx?id=${encodeURIComponent(t.id)}&range=${S.range}`; };
    const del = $('#pltDel', S.root);
    if (del) del.onclick = async () => {
      if (!(await uiConfirm(`'${t.name}' 추적을 지울까요?\n확인 기록과 입찰가 기록도 같이 지워져요.`))) return;
      try { await api('/api/pl/track/delete', { id: t.id }); toast('지웠어요', 'ok'); S.sel = ''; } catch (e) { toast(e.message, 'warn'); }
      refresh(true);
    };
    const nf = $('#pltNotify', S.root);
    if (nf) nf.onchange = async () => {
      if (nf.checked) await askPermission();
      try { await api('/api/pl/track/notify', { id: t.id, on: nf.checked }); t.notify = nf.checked; } catch (e) { toast(e.message, 'warn'); }
    };
  }
  function bindTable(t) {
    $$('tr[data-row]', S.root).forEach((tr) => (tr.onclick = (e) => {
      if (e.target.closest('input,button')) return;
      S.row = tr.dataset.row; S.ptsKey = '';
      $$('tr[data-row]', S.root).forEach((x) => x.classList.toggle('sel', x === tr));
      chart(t);
    }));
    $$('[data-tg]', S.root).forEach((inp) => {
      inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
      inp.onchange = async () => {
        try { await api('/api/pl/track/target', { id: t.id, key: inp.dataset.tg, dev: inp.dataset.dev, value: inp.value.trim() }); toast(inp.value.trim() ? `목표 ${inp.value.trim()}위로 정했어요` : '목표를 지웠어요', 'ok'); S.ptsKey = ''; }
        catch (e) { toast(e.message, 'warn'); }
        inp.blur(); refresh(true);
      };
    });
    $$('[data-bid]', S.root).forEach((b) => (b.onclick = () => bidDialog(t, b.dataset.bid, b.dataset.dev)));
  }
  function bidDialog(t, key, dev) {
    const it = t.items.find((i) => i.key === key);
    const prev = lastBid(t, key, dev);
    const bg = document.createElement('div');
    bg.className = 'cfm-bg';
    bg.innerHTML = `<div class="cfm" role="dialog" aria-modal="true" style="width:min(440px,92vw)">
      <div class="cfm-msg"><b>${e2(it?.kw || key)}</b> 입찰가 기록</div>
      <div class="muted" style="font-size:13px;margin:6px 0 10px">네이버 광고관리에서 입찰가를 바꾼 뒤 여기에 적으면 그래프에 세로선이 생겨요. 실제 입찰가는 바뀌지 않아요.</div>
      <label class="plt-f">새 입찰가 <span><input class="inp" id="pbBid" inputmode="numeric" placeholder="${prev?.bid != null ? '지난 기록 ' + n0(prev.bid) + '원' : '예: 1200'}" style="width:140px"> 원</span></label>
      <label class="plt-f">기기 <select class="inp" id="pbDev" style="width:auto">${t.devices.length > 1 ? '<option value="both">PC·모바일 둘 다</option>' : ''}${t.devices.map((d) => `<option value="${d}" ${d === dev && t.devices.length === 1 ? 'selected' : ''}>${DEVN[d]}</option>`).join('')}</select></label>
      <label class="plt-f">메모 <input class="inp" id="pbNote" maxlength="100" placeholder="선택 (예: 3위 목표로 올림)"></label>
      <label class="inl" style="margin-top:6px"><input type="checkbox" id="pbFocus" ${t.on ? 'checked' : 'disabled'}> 20분 동안 이 키워드만 1분마다 확인 (집중 확인)${t.on ? '' : ' · 추적을 켜야 돼요'}</label>
      <div class="cfm-btns"><button type="button" class="btn" data-v="0">취소</button><button type="button" class="btn pri" data-v="1">기록</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => { document.removeEventListener('keydown', onKey, true); bg.remove(); };
    const ok = async () => {
      const bid = $('#pbBid', bg).value.trim(), note = $('#pbNote', bg).value.trim();
      if (!bid && !note) { toast('입찰가나 메모를 적어 주세요', 'warn'); return; }
      try {
        const j = await api('/api/pl/track/bid', { id: t.id, key, dev: $('#pbDev', bg).value, bid, note, focus: $('#pbFocus', bg).checked });
        close(); toast(j.focus ? '기록했어요. 20분 동안 1분마다 확인해요' : '기록했어요', 'ok'); S.ptsKey = ''; refresh(true);
      } catch (e) { toast(e.message, 'warn'); }
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); ok(); } };
    document.addEventListener('keydown', onKey, true);
    bg.querySelector('[data-v="0"]').onclick = close;
    bg.querySelector('[data-v="1"]').onclick = ok;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    $('#pbBid', bg).focus();
  }

  // ---------------------------------------------------------------- 새 추적 · 설정
  function openForm(t) {
    const f = t ? {
      id: t.id, name: t.name, urls: t.urls.join('\n'), devices: [...t.devices], interval: t.interval, cap: t.cap,
      kws: t.items.map((i) => [i.kw, i.target?.pc ?? '', i.target?.mo ?? ''].join(', ').replace(/(, )+$/, '')).join('\n'),
      sched: { ...t.sched }, notify: t.notify, on: t.on,
    } : { id: '', name: '', urls: localStorage.getItem('plUrls') || '', devices: ['pc', 'mo'], interval: 5, cap: 30, kws: '', sched: { mode: 'always', from: '09:00', to: '24:00', minutes: 60 }, notify: true, on: false };
    S.edit = f; draw();
  }
  const parseKws = (txt) => String(txt || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/[,\t]/).map((s) => s.trim());
    const n = (v) => (v && /^\d{1,2}$/.test(v) ? +v : '');
    const pc = n(p[1]), mo = p.length > 2 ? n(p[2]) : pc;
    return { kw: p[0], targetPc: pc, targetMo: mo };
  }).filter((x) => x.kw);
  function formHTML() {
    const f = S.edit, s = f.sched;
    const hours = (v) => Array.from({ length: 25 }, (_, h) => `<option value="${pad(h)}:00" ${v === pad(h) + ':00' ? 'selected' : ''}>${h}시</option>`).join('');
    const durCustom = !DURS.some(([m]) => m === s.minutes);
    const jobs = (window.__PL_JOBS?.() || []).filter((m) => !m.parentId).slice(0, 40);
    return `<div class="card" id="pltForm">
      <h3>${f.id ? '추적 설정' : '새 추적'}<span class="muted" style="font-size:12px">${f.id && f.on ? '저장하면 바로 다시 확인해요' : ''}</span></h3>
      <div class="grid g2 plt-fgrid">
        <div>
          <label class="plt-f">이름 <input class="inp" id="pfName" maxlength="60" placeholder="비우면 첫 키워드로 지어요" value="${e2(f.name)}"></label>
          ${jobs.length ? `<label class="plt-f">분석에서 가져오기 <select class="inp" id="pfJob"><option value="">파워링크 분석 내역에서 URL·기기·키워드 불러오기</option>${jobs.map((m) => `<option value="${e2(m.id)}">${e2(m.name)} (${m.total}개)</option>`).join('')}</select></label>` : ''}
          <label class="plt-f">내 파워링크 URL <span class="muted" style="font-size:12px">한 줄에 하나 · 분석기와 같은 방식으로 찾아요</span><textarea class="inp" id="pfUrls" rows="2" placeholder="https://www.example.com/event">${e2(f.urls)}</textarea></label>
          <label class="plt-f">키워드 <span class="muted" style="font-size:12px">한 줄에 하나 · 목표를 같이 쓰려면 "키워드, 3" (PC·모바일 같게) 또는 "키워드, 3, 2"</span><textarea class="inp" id="pfKws" rows="7" placeholder="비씨카드발급, 3&#10;비씨바로카드신청, 3, 2&#10;BC카드캐시백이벤트">${e2(f.kws)}</textarea></label>
        </div>
        <div>
          <div class="plt-f">기기 <span><label class="inl"><input type="checkbox" class="no-sw" data-pfdev="pc" ${f.devices.includes('pc') ? 'checked' : ''}> PC</label> <label class="inl"><input type="checkbox" class="no-sw" data-pfdev="mo" ${f.devices.includes('mo') ? 'checked' : ''}> 모바일</label></span></div>
          <div class="plt-f">확인 간격 <select class="inp" id="pfInt" style="width:auto">${INTERVALS.map((m) => `<option value="${m}" ${f.interval === m ? 'selected' : ''}>${m}분마다${m === 5 ? ' (기본)' : ''}</option>`).join('')}</select></div>
          <div class="plt-f">키워드 상한 <select class="inp" id="pfCap" style="width:auto">${CAPS.map((m) => `<option value="${m}" ${f.cap === m ? 'selected' : ''}>${m}개${m === 30 ? ' (기본)' : ''}</option>`).join('')}</select><span class="muted" style="font-size:12px">많을수록 네이버 검색 제한에 걸리기 쉬워요</span></div>
          <div class="plt-f">추적 시간
            <div class="plt-radio">
              <label><input type="radio" name="pfMode" value="always" ${s.mode === 'always' ? 'checked' : ''}> 24시간 계속 (멈출 때까지)</label>
              <label><input type="radio" name="pfMode" value="hours" ${s.mode === 'hours' ? 'checked' : ''}> 매일 정한 시간에만 <select class="inp" id="pfFrom" style="width:auto">${hours(s.from)}</select> ~ <select class="inp" id="pfTo" style="width:auto">${hours(s.to)}</select></label>
              <label><input type="radio" name="pfMode" value="for" ${s.mode === 'for' ? 'checked' : ''}> 시작부터 <select class="inp" id="pfDur" style="width:auto">${DURS.map(([m, n]) => `<option value="${m}" ${!durCustom && s.minutes === m ? 'selected' : ''}>${n}</option>`).join('')}<option value="custom" ${durCustom ? 'selected' : ''}>직접 입력</option></select>
                <span id="pfCustomW" class="${durCustom ? '' : 'hidden'}"><input class="inp" id="pfMin" type="number" min="10" max="1440" value="${s.minutes}" style="width:80px"> 분</span> 뒤 자동으로 멈춤</label>
            </div></div>
          <label class="inl plt-f"><input type="checkbox" id="pfNotify" ${f.notify ? 'checked' : ''}> 알림 (목표 순위 도달·이탈, 광고가 안 보일 때, 추적 시간이 끝났을 때)</label>
          <div class="plt-est" id="pfEst"></div>
        </div>
      </div>
      <div class="pl-bar" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="pfCancel">취소</button><button class="btn" id="pfSave">저장</button><button class="btn pri" id="pfStart">${f.id && f.on ? '저장 (추적 계속)' : '저장하고 시작'}</button></div>
    </div>`;
  }
  function readForm() {
    const f = S.edit, r = S.root;
    f.name = $('#pfName', r).value; f.urls = $('#pfUrls', r).value; f.kws = $('#pfKws', r).value;
    f.devices = $$('[data-pfdev]', r).filter((c) => c.checked).map((c) => c.dataset.pfdev);
    f.interval = +$('#pfInt', r).value; f.cap = +$('#pfCap', r).value;
    const mode = $('input[name=pfMode]:checked', r)?.value || 'always';
    const dv = $('#pfDur', r).value;
    f.sched = { mode, from: $('#pfFrom', r).value, to: $('#pfTo', r).value, minutes: dv === 'custom' ? Math.round(+$('#pfMin', r).value || 60) : +dv };
    f.notify = $('#pfNotify', r).checked;
    return f;
  }
  function estimate() {
    const f = readForm(), kws = parseKws(f.kws), n = kws.length * f.devices.length, sec = n * gapS();
    const el = $('#pfEst', S.root); if (!el) return;
    const perDay = f.sched.mode === 'for' ? Math.ceil(f.sched.minutes / Math.max(f.interval, sec / 60)) * n
      : Math.round(((f.sched.mode === 'hours' ? ((parseInt(f.sched.to) - parseInt(f.sched.from) + 24) % 24 || 24) : 24) * 60 / Math.max(f.interval, sec / 60)) * n);
    const warns = [];
    if (kws.length > f.cap) warns.push(`키워드가 ${kws.length}개라 상한(${f.cap}개)을 넘어요`);
    if (sec > f.interval * 60) warns.push(`한 바퀴(약 ${dur(sec * 1000)})가 확인 간격보다 길어서 쉬지 않고 계속 돌아요`);
    if (perDay > 15000) warns.push('하루 검색이 많아요. 네이버 검색 제한에 걸리면 이 PC에서 네이버 검색할 때 자동입력 방지 문자가 나올 수 있어요');
    el.innerHTML = kws.length ? `키워드 ${kws.length}개 × ${f.devices.length}기기 = 한 바퀴 <b>${n}번</b> 검색 · 약 ${dur(sec * 1000)} · ${f.sched.mode === 'for' ? `${fmtMin(f.sched.minutes)} 동안` : '하루'} 최대 약 ${perDay.toLocaleString('ko-KR')}번
      ${warns.map((w) => `<div class="plt-warn">${e2(w)}</div>`).join('')}` : '<span class="muted">키워드를 넣으면 한 바퀴 걸리는 시간을 계산해 드려요</span>';
  }
  function bindForm() {
    const r = S.root;
    $$('input,select,textarea', r).forEach((el) => el.addEventListener('input', estimate));
    $$('input[type=radio],input[type=checkbox],select', r).forEach((el) => el.addEventListener('change', estimate));
    $('#pfDur', r).addEventListener('change', () => { $('#pfCustomW', r).classList.toggle('hidden', $('#pfDur', r).value !== 'custom'); const fr = $('input[name=pfMode][value=for]', r); fr.checked = true; });
    $('#pfFrom', r).addEventListener('change', () => { $('input[name=pfMode][value=hours]', r).checked = true; });
    $('#pfTo', r).addEventListener('change', () => { $('input[name=pfMode][value=hours]', r).checked = true; });
    $('#pfNotify', r).addEventListener('change', (e) => { if (e.target.checked) askPermission(); });
    const job = $('#pfJob', r);
    if (job) job.onchange = async () => {
      if (!job.value) return;
      try {
        const j = await api('/api/pl/job?id=' + encodeURIComponent(job.value)), jb = j.job;
        $('#pfUrls', r).value = (jb.urls || []).join('\n');
        $$('[data-pfdev]', r).forEach((c) => (c.checked = (jb.devices || []).includes(c.dataset.pfdev)));
        const rows = (jb.rows || []).filter((x) => x.on !== false);
        const cap = +$('#pfCap', r).value;
        $('#pfKws', r).value = rows.slice(0, 100).map((x) => x.kw).join('\n');
        if (!$('#pfName', r).value.trim()) $('#pfName', r).value = jb.name || '';
        toast(rows.length > cap ? `키워드 ${rows.length}개를 불러왔어요. 상한 ${cap}개에 맞게 추적할 키워드만 남겨 주세요` : `키워드 ${rows.length}개를 불러왔어요`, rows.length > cap ? 'warn' : 'ok');
      } catch (e) { toast(e.message, 'warn'); }
      estimate();
    };
    $('#pfCancel', r).onclick = () => { S.edit = null; draw(); };
    const save = async (start) => {
      const f = readForm(), items = parseKws(f.kws);
      if (f.notify) await askPermission();
      try {
        const j = await api('/api/pl/track/save', { id: f.id || undefined, name: f.name, urls: f.urls, devices: f.devices, interval: f.interval, cap: f.cap, items, sched: f.sched, notify: f.notify, start });
        if (f.urls.trim()) localStorage.setItem('plUrls', f.urls.trim());
        S.edit = null; S.sel = j.id; localStorage.setItem('pltSel', j.id); S.row = ''; S.ptsKey = '';
        toast(start && !f.on ? '추적을 시작했어요. 첫 확인을 바로 해요' : '저장했어요', 'ok');
        await refresh(true); draw();
      } catch (e) { toast(e.message, 'warn'); }
    };
    $('#pfSave', r).onclick = () => save(false);
    $('#pfStart', r).onclick = () => save(true);
    estimate();
  }

  // ---------------------------------------------------------------- 알림 (어느 메뉴에 있든)
  async function askPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') { toast('브라우저에서 이 사이트 알림이 막혀 있어요. 주소창 왼쪽 자물쇠 › 알림 › 허용으로 바꾸면 윈도 알림도 떠요 (화면 알림은 그대로 나와요)', 'warn', 8000); return false; }
    try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
  }
  let since = +localStorage.getItem('pltSince') || Date.now();
  localStorage.setItem('pltSince', String(since));
  async function pollEvents() {
    try {
      const j = await api('/api/pl/track?lite=1&since=' + since);
      S.onCount = j.on || 0; S.onKw = j.onKw || 0; S.pause = j.pauseUntil || 0;
      sideBadge();
      for (const e of j.events || []) {
        since = Math.max(since, e.at);
        if (!e.notify) continue;
        const kind = e.type === 'hit' || e.type === 'back' ? 'ok' : 'warn';
        toast('순위 추적 · ' + e.text, kind, 8000);
        if ('Notification' in window && Notification.permission === 'granted') {
          try { const n = new Notification('파워링크 순위 추적', { body: e.text, tag: 'plt' + e.id + e.at, silent: false }); n.onclick = () => { window.focus(); open(e.id); n.close(); }; } catch {}
        }
      }
      localStorage.setItem('pltSince', String(since));
      if (j.events?.length && visible()) refresh(true);
    } catch {}
  }
  setInterval(pollEvents, 15000);
  setTimeout(pollEvents, 3000);

  // 왼쪽 목록의 '순위 추적' 칸 (pl.js 가 그림) 의 상태만 갱신
  function sideBadge() {
    const el = document.getElementById('pSideTrack');
    if (!el) return;
    const dot = el.querySelector('.plt-dot'), sm = el.querySelector('.sm');
    if (dot) dot.className = 'plt-dot ' + (S.onCount ? 'on' : '');
    if (sm) sm.textContent = S.onCount ? `추적 중 ${S.onCount}개` : '켜 두면 계속 순위 확인';
  }

  // 화면이 보이는 동안: 5초마다 상태, 1초마다 '다음 확인' 남은 시간
  setInterval(() => { if (visible() && !S.edit) refresh(); }, 5000);
  setInterval(() => {
    if (!visible()) return;
    const now = Date.now();
    $$('[data-next]', S.root).forEach((b) => { const t = +b.dataset.next; b.textContent = t > now ? dur(t - now) + ' 뒤' : '곧'; });
    $$('[data-left]', S.root).forEach((b) => { b.textContent = dur(+b.dataset.left - now); });
  }, 1000);
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (visible() && S.pts && !S.edit) chart(cur()); }, 200); });

  function open(id) {
    if (id) { S.sel = id; localStorage.setItem('pltSel', id); S.row = ''; S.ptsKey = ''; }
    window.__PL_OPEN_TRACK?.();
  }
  window.__PLT = {
    mount(el) { S.root = el; draw(); refresh(true); },
    summary: () => ({ on: S.onCount }),
    open,
  };
})();
