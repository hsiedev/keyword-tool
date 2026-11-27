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
    pause: 0, onCount: 0, onKw: 0, root: null, loaded: false, pts: null, ptsKey: '', busy: false,
    pick: new Set(), posN: localStorage.getItem('pltPosN') || 't', hold: 0 }; // pick = 체크한 키워드, posN = 평균 입찰가 볼 순위('t' = 목표 순위), hold = 화살표 누르는 동안 다시 그리기 멈춤
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
    const ae = document.activeElement;
    const typing = (root.contains(ae) && (ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (ae.tagName === 'INPUT' && !/checkbox|radio|button/.test(ae.type)))) || Date.now() < S.hold;
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
  // 목표 순위 입력: ▲ = 한 순위 위(1위 쪽), ▼ = 한 순위 아래. 키보드 ↑↓도 같음
  const stepHTML = (val, attrs, start) => `<span class="plt-step"><input class="plt-tgi" inputmode="numeric" autocomplete="off" placeholder="-" value="${val ?? ''}" data-start="${start ?? ''}" ${attrs} title="목표 순위 · ▲(↑)는 1위 쪽, ▼(↓)는 아래 순위 쪽 · 비우면 목표 없음"><span class="plt-stb"><button type="button" data-st="-1" tabindex="-1" title="한 순위 위로 (1위 쪽)">▲</button><button type="button" data-st="1" tabindex="-1" title="한 순위 아래로">▼</button></span></span>`;
  const posName = (t) => t.posErr ? `<span class="plt-warn">${e2(t.posErr)}</span>` : t.posBusy ? '순위별 평균 입찰가 받는 중…' : t.posAt ? `순위별 평균 입찰가: ${dayClock(t.posAt)} 받음 (네이버 최근 4주 기준)` : '순위별 평균 입찰가 아직 없음';
  function bulkHTML(t) {
    const n = [...S.pick].filter((k) => t.items.some((i) => i.key === k)).length;
    const pos = `<span>${posName(t)}</span> <button type="button" class="btn sm" id="pltPosRe" ${t.posBusy ? 'disabled' : ''}>새로 받기</button>`;
    if (!n) return `<div class="plt-bulk-hint muted"><span>키워드를 체크하면 <b>목표 순위 · 목표 입찰가 · 추적 켜기/끄기</b>를 한 번에 바꿀 수 있어요</span><span class="plt-sep">·</span>${pos}</div>`;
    const ranks = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}위</option>`).join('');
    return `<div class="plt-bulk" id="pltBulk"><b>${n}개 선택</b>
      <span class="plt-bk-g"><span class="plt-bk-l">목표 순위</span>${t.devices.map((d) => `${t.devices.length > 1 ? DEVN[d] + ' ' : ''}${stepHTML('', `data-bk="${d}"`, d === 'pc' ? 3 : 2)}`).join(' ')}<button type="button" class="btn sm" id="pbkT">일괄 적용</button></span>
      <span class="plt-bk-g"><span class="plt-bk-l" title="네이버 광고관리에서 입찰가를 바꾼 뒤 눌러 기록해요. 실제 입찰가는 바뀌지 않아요">목표 입찰가</span><select class="inp" id="pbkMode"><option value="target">각 키워드 목표 순위의 평균 입찰가</option><option value="rank">정한 순위의 평균 입찰가</option><option value="fixed">직접 입력</option></select><select class="inp hidden" id="pbkRank">${ranks}</select><input class="inp hidden" id="pbkWon" inputmode="numeric" placeholder="예: 1200" style="width:90px"><button type="button" class="btn sm pri" id="pbkB">일괄 적용</button></span>
      <span class="plt-bk-g"><span class="plt-bk-l">추적</span><button type="button" class="btn sm" id="pbkOn">켜기</button><button type="button" class="btn sm" id="pbkOff">끄기</button></span>
      <button type="button" class="btn sm" id="pbkClr">선택 해제</button>
      <div class="plt-bk-pos muted">${pos}</div></div>`;
  }
  function posCell(t, r) {
    const n = S.posN === 't' ? r.target : +S.posN;
    if (!n) return '<span class="muted" title="목표 순위를 정하면 그 순위의 평균 입찰가가 보여요">목표 없음</span>';
    if (n > MAXN[r.dev]) return `<span class="muted" title="${DEVN[r.dev]} 평균 입찰가는 ${MAXN[r.dev]}위까지 있어요">${n}위 -</span>`;
    const v = r.pos?.[n - 1];
    if (v == null) return `<span class="muted" title="${e2(r.posErr || t.posErr || '아직 못 받았어요')}">${n}위 -</span>`;
    const base = lastBid(t, r.key, r.dev)?.bid ?? r.bid0;
    const diff = base != null && v !== base ? `<div class="muted" style="font-size:11px" title="${lastBid(t, r.key, r.dev)?.bid != null ? '마지막 입찰가 기록' : '최초 입찰가'} ${n0(base)}원 대비">${v > base ? '+' : '−'}${n0(Math.abs(v - base))}원</div>` : '';
    return `<span class="muted" style="font-size:11px">${n}위</span> ${n0(v)}원${diff}`;
  }
  function tableHTML(t) {
    if (!S.row || !t.rows.some((r) => r.key + '|' + r.dev === S.row)) S.row = t.rows[0] ? t.rows[0].key + '|' + t.rows[0].dev : '';
    const rows = t.rows, keys = [...new Set(rows.map((r) => r.key))];
    for (const k of [...S.pick]) if (!keys.includes(k)) S.pick.delete(k);
    const allOn = keys.length > 0 && keys.every((k) => S.pick.has(k));
    const posHead = `<select id="pltPosN" class="plt-posn" title="네이버 검색광고 API 순위별 평균 입찰가 (최근 4주) · 어느 순위를 볼지">${[['t', '목표 순위'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), i + 1 + '위'])].map(([v, nm]) => `<option value="${v}" ${S.posN === v ? 'selected' : ''}>${nm}</option>`).join('')}</select> 평균 입찰가`;
    return `${bulkHTML(t)}<div class="tbl-wrap plt-tbl"><table class="rel plt"><thead><tr><th style="width:30px"><input type="checkbox" id="pltAll" ${allOn ? 'checked' : ''} title="전체 선택 · 다시 누르면 전체 해제"></th><th class="l">키워드</th><th class="l">기기</th><th title="키워드마다 추적 켜기/끄기 (PC·모바일 같이)">추적</th><th>지금</th><th>직전 대비</th><th>목표</th><th>${posHead}</th><th class="l">최근 3시간</th><th>확인</th><th title="키워드 파일·분석에서 가져온 처음 입찰가">최초 입찰가</th><th class="l">입찰가 기록</th></tr></thead><tbody>
      ${rows.map((r) => {
        const k = r.key + '|' + r.dev, hit = r.r != null && r.target && r.r <= r.target;
        let ch = '<span class="muted">—</span>';
        if (r.on && r.at && r.prevAt) {
          if (r.r != null && r.prev != null) ch = r.r < r.prev ? `<span class="plt-up">▲${r.prev - r.r}</span>` : r.r > r.prev ? `<span class="plt-down">▼${r.r - r.prev}</span>` : '<span class="muted">그대로</span>';
          else if (r.r == null && r.prev != null) ch = '<span class="plt-down">사라짐</span>';
          else if (r.r != null && r.prev == null) ch = '<span class="plt-up">다시 보임</span>';
        }
        const b = lastBid(t, r.key, r.dev);
        const now = !r.on ? `<span class="muted" title="${r.at ? '마지막 ' + clock(r.at) + ' ' + rankText(r.r, r.dev) : ''}">꺼짐</span>` : r.at ? `<span class="plt-rk ${r.r == null || r.r > MAXN[r.dev] ? 'dim' : hit ? 'ok' : ''}">${rankText(r.r, r.dev)}</span>` : '<span class="muted">아직</span>';
        return `<tr data-row="${e2(k)}" class="${k === S.row ? 'sel' : ''} ${r.on ? '' : 'plt-off'}">
          <td><input type="checkbox" data-pick="${e2(r.key)}" ${S.pick.has(r.key) ? 'checked' : ''} title="체크하면 위에서 한 번에 바꿀 수 있어요"></td>
          <td class="l"><b>${e2(r.kw)}</b>${r.focus ? ' <span class="plt-tag" title="입찰가 기록 뒤 20분 동안 1분마다 확인">집중 확인</span>' : ''}</td>
          <td class="l muted">${DEVN[r.dev]}</td>
          <td class="plt-swc"><input type="checkbox" class="sw" data-onkey="${e2(r.key)}" ${r.on ? 'checked' : ''} title="${r.on ? '추적 끄기' : '추적 켜기'} (${e2(r.kw)} · PC·모바일 같이)"></td>
          <td>${now}</td><td>${ch}</td>
          <td class="plt-tg">${stepHTML(r.target, `data-tg="${e2(r.key)}" data-dev="${r.dev}"`, r.r != null && r.r <= 25 ? r.r : 3)}위 ${r.target ? `<span class="${hit ? 'plt-up' : 'muted'}" style="font-size:12px">${hit ? '달성' : r.at && r.on ? '미달' : ''}</span>` : ''}</td>
          <td>${posCell(t, r)}</td>
          <td class="l">${spark(r.sp, r.dev)}</td>
          <td class="muted" title="${r.at ? '확인 ' + r.n + '번' : ''}">${r.at ? clock(r.at) : ''}</td>
          <td>${r.bid0 != null ? n0(r.bid0) + '원' : '<span class="muted">—</span>'}</td>
          <td class="l">${b ? `<span class="plt-bid" title="${e2(b.note || '')}">${dayClock(b.at)} · ${b.bid == null ? '메모' : n0(b.bid) + '원'}${b.bid != null && r.bid0 != null && b.bid !== r.bid0 ? ` <span class="${b.bid > r.bid0 ? 'plt-up' : 'plt-down'}">(${b.bid > r.bid0 ? '+' : '−'}${n0(Math.abs(b.bid - r.bid0))})</span>` : ''}</span> ` : ''}<button class="btn sm" data-bid="${e2(r.key)}" data-dev="${r.dev}">+ 기록</button></td></tr>`;
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
    $$('[data-tid]', S.root).forEach((b) => (b.onclick = () => { S.sel = b.dataset.tid; localStorage.setItem('pltSel', S.sel); S.row = ''; S.ptsKey = ''; S.pick.clear(); draw(); }));
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
  // ▲▼ 버튼 · ↑↓ 키 (▲/↑ = 1위 쪽)
  function bindSteps(root, onStep) {
    $$('.plt-step', root).forEach((sp) => {
      const inp = sp.querySelector('input');
      const bump = (d) => {
        const c = parseInt(inp.value, 10);
        const v = Math.max(1, Math.min(25, Number.isNaN(c) ? (+inp.dataset.start || 3) : c + d));
        inp.value = v; S.hold = Date.now() + 2500;
        onStep?.(inp);
      };
      sp.querySelectorAll('[data-st]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); bump(+b.dataset.st); }));
      inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); bump(-1); } else if (e.key === 'ArrowDown') { e.preventDefault(); bump(1); } else if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 2); });
    });
  }
  async function bulk(t, body, msg) {
    try { const j = await api('/api/pl/track/bulk', { id: t.id, keys: [...S.pick], ...body }); toast(msg(j), j.skipped?.length && !j.bids ? 'warn' : 'ok', 7000); S.ptsKey = ''; await refresh(true); return j; }
    catch (e) { toast(e.message, 'warn'); }
  }
  function bindTable(t) {
    $$('tr[data-row]', S.root).forEach((tr) => (tr.onclick = (e) => {
      if (e.target.closest('input,button,select,label')) return;
      S.row = tr.dataset.row; S.ptsKey = '';
      $$('tr[data-row]', S.root).forEach((x) => x.classList.toggle('sel', x === tr));
      chart(t);
    }));
    // 목표 순위 (줄마다): 화살표는 멈춘 뒤 0.7초에 저장, 직접 쓰면 칸을 벗어날 때 저장
    const saveTarget = async (inp) => {
      clearTimeout(inp._t);
      const v = inp.value.trim();
      if (v === (inp.dataset.saved ?? inp.defaultValue)) return;
      inp.dataset.saved = v;
      try { await api('/api/pl/track/target', { id: t.id, key: inp.dataset.tg, dev: inp.dataset.dev, value: v }); toast(v ? `목표 ${v}위로 정했어요` : '목표를 지웠어요', 'ok'); S.ptsKey = ''; }
      catch (e) { toast(e.message, 'warn'); }
      S.hold = Date.now() + 600; setTimeout(() => refresh(true), 700);
    };
    bindSteps($('.plt-tbl', S.root), (inp) => { clearTimeout(inp._t); inp._t = setTimeout(() => saveTarget(inp), 700); });
    $$('[data-tg]', S.root).forEach((inp) => { inp.onchange = () => saveTarget(inp); });
    // 체크 · 전체 선택 (다시 누르면 전체 해제)
    $$('[data-pick]', S.root).forEach((c) => (c.onchange = () => { if (c.checked) S.pick.add(c.dataset.pick); else S.pick.delete(c.dataset.pick); clearTimeout(S.pickT); S.pickT = setTimeout(() => draw(), 0); })); // Shift로 여러 줄을 한 번에 체크해도 한 번만 다시 그림
    const all = $('#pltAll', S.root);
    if (all) all.onchange = () => { const keys = [...new Set(t.rows.map((r) => r.key))]; if (keys.every((k) => S.pick.has(k))) S.pick.clear(); else keys.forEach((k) => S.pick.add(k)); draw(); };
    // 키워드마다 추적 켜기/끄기
    $$('[data-onkey]', S.root).forEach((c) => (c.onchange = async () => {
      const it = t.items.find((i) => i.key === c.dataset.onkey);
      try { await api('/api/pl/track/bulk', { id: t.id, keys: [c.dataset.onkey], on: c.checked }); toast(`'${it?.kw || ''}' 추적을 ${c.checked ? '켰어요' : '껐어요'}`, 'ok'); }
      catch (e) { toast(e.message, 'warn'); }
      refresh(true);
    }));
    // 평균 입찰가 볼 순위 · 새로 받기
    const pn = $('#pltPosN', S.root);
    if (pn) { pn.onclick = (e) => e.stopPropagation(); pn.onchange = () => { S.posN = pn.value; localStorage.setItem('pltPosN', S.posN); pn.blur(); draw(); }; }
    const pr = $('#pltPosRe', S.root);
    if (pr) pr.onclick = async () => { pr.disabled = true; try { await api('/api/pl/track/posbids', { id: t.id }); toast('순위별 평균 입찰가를 새로 받았어요', 'ok'); } catch (e) { toast(e.message, 'warn'); } refresh(true); };
    // 일괄 적용 줄
    const bar = $('#pltBulk', S.root);
    if (bar) {
      bindSteps(bar);
      const mode = $('#pbkMode', bar);
      const showMode = () => { $('#pbkRank', bar).classList.toggle('hidden', mode.value !== 'rank'); $('#pbkWon', bar).classList.toggle('hidden', mode.value !== 'fixed'); };
      mode.onchange = showMode; showMode();
      $('#pbkClr', bar).onclick = () => { S.pick.clear(); draw(); };
      $('#pbkT', bar).onclick = () => {
        const target = {};
        $$('[data-bk]', bar).forEach((inp) => { if (inp.value.trim()) target[inp.dataset.bk] = inp.value.trim(); });
        if (!Object.keys(target).length) return toast('목표 순위를 넣어 주세요 (▲▼ 또는 숫자)', 'warn');
        bulk(t, { target }, (j) => `목표 순위를 ${Object.entries(target).map(([d, v]) => (t.devices.length > 1 ? DEVN[d] + ' ' : '') + v + '위').join(' · ')}로 정했어요 (${S.pick.size}개 키워드)`);
      };
      $('#pbkB', bar).onclick = async () => {
        const m = mode.value, rank = $('#pbkRank', bar).value, value = $('#pbkWon', bar).value.trim();
        if (m === 'fixed' && !value) return toast('입찰가를 넣어 주세요', 'warn');
        const what = m === 'target' ? '각 키워드 목표 순위의 평균 입찰가' : m === 'rank' ? rank + '위 평균 입찰가' : n0(value) + '원';
        if (!(await uiConfirm(`체크한 ${S.pick.size}개 키워드에 ${what}를 입찰가 기록으로 남길까요?\n네이버 광고관리에서 입찰가를 이 값으로 바꾼 뒤 누르세요. 이 화면은 실제 입찰가를 바꾸지 않아요.`, { ok: '일괄 적용', danger: false }))) return;
        bulk(t, { bid: { mode: m, rank, value, focus: true } }, (j) => `${j.bids}개 기록했어요${j.skipped.length ? ` · ${j.skipped.length}개 건너뜀 (${j.skipped.slice(0, 3).join(', ')}${j.skipped.length > 3 ? ' …' : ''})` : ''}${j.focus === 'focus' ? ' · 20분 동안 1분마다 확인해요' : j.focus === 'round' ? ' · 바로 한 바퀴 확인해요' : ''}`);
      };
      $('#pbkOn', bar).onclick = () => bulk(t, { on: true }, (j) => `${S.pick.size}개 키워드 추적을 켰어요`);
      $('#pbkOff', bar).onclick = () => bulk(t, { on: false }, (j) => `${S.pick.size}개 키워드 추적을 껐어요`);
    }
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
      <label class="plt-f">새 입찰가 <span><input class="inp" id="pbBid" inputmode="numeric" placeholder="${prev?.bid != null ? '지난 기록 ' + n0(prev.bid) + '원' : it?.bid0 != null ? '최초 ' + n0(it.bid0) + '원' : '예: 1200'}" style="width:140px"> 원${it?.bid0 != null ? ` <span class="muted" style="font-size:12px">최초 입찰가 ${n0(it.bid0)}원</span>` : ''}</span></label>
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
      kws: t.items.map((i) => { const pc = i.target?.pc ?? null, mo = i.target?.mo ?? null; return pc == null && mo == null ? i.kw : pc === mo ? `${i.kw}, ${pc}` : `${i.kw}, ${pc ?? '-'}, ${mo ?? '-'}`; }).join('\n'),
      sched: { ...t.sched }, notify: t.notify, on: t.on, bid0: Object.fromEntries(t.items.filter((i) => i.bid0 != null).map((i) => [i.key, i.bid0])),
    } : { bid0: {}, id: '', name: '', urls: localStorage.getItem('plUrls') || '', devices: ['pc', 'mo'], interval: 5, cap: 30, kws: '', sched: { mode: 'always', from: '09:00', to: '24:00', minutes: 60 }, notify: true, on: false };
    S.edit = f; draw();
  }
  const parseKws = (txt) => String(txt || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/[,\t]/).map((s) => s.trim());
    const n = (v) => (v && /^\d{1,2}$/.test(v) ? +v : '');
    const pc = n(p[1]), mo = p.length > 2 ? n(p[2]) : pc;
    const key = p[0].replace(/\s+/g, '').toUpperCase(), b0 = S.edit?.bid0?.[key];
    return { kw: p[0], targetPc: pc, targetMo: mo, bid0: b0 ?? null };
  }).filter((x) => x.kw);
  // 키워드 파일·붙여넣은 표 → 키워드 칸 + 최초 입찰가 (노출가능만)
  function takeRows(rows, from) {
    const r = S.root, f = S.edit;
    const on = rows.filter((x) => x.on !== false && x.kw);
    if (!on.length) { toast(from + ': 노출가능 키워드를 찾지 못했어요', 'warn'); return; }
    f.bid0 = f.bid0 || {};
    const lines = $('#pfKws', r).value.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const have = new Set(lines.map((l) => l.split(/[,\t]/)[0].trim().replace(/\s+/g, '').toUpperCase()));
    let add = 0, withBid = 0;
    for (const x of on) {
      const key = x.kw.replace(/\s+/g, '').toUpperCase();
      if (x.bid != null) { f.bid0[key] = x.bid; withBid++; }
      if (!have.has(key)) { have.add(key); lines.push(x.kw); add++; }
    }
    $('#pfKws', r).value = lines.join('\n');
    const cap = +$('#pfCap', r).value;
    toast(`${from}: 키워드 ${add}개 추가 · 최초 입찰가 ${withBid}개${lines.length > cap ? ` · 상한 ${cap}개를 넘으니 추적할 키워드만 남겨 주세요` : ''}`, lines.length > cap ? 'warn' : 'ok', 6000);
    estimate();
  }
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
          <div class="plt-f">키워드 파일 <span class="muted" style="font-size:12px">네이버 광고관리 키워드 다운로드 엑셀을 넣으면 키워드와 <b>최초 입찰가</b>를 읽어요 ('노출가능'만) · DRM으로 못 열면 엑셀 표를 머리글부터 복사해 아래 키워드 칸에 붙여넣기</span>
            <div style="margin-top:4px"><label class="btn sm" style="cursor:pointer">파일 선택<input type="file" id="pfFile" accept=".xlsx,.xlsm,.csv,.txt" hidden multiple></label> <span class="muted" id="pfBidN" style="font-size:12px"></span></div></div>
          <label class="plt-f">키워드 <span class="muted" style="font-size:12px">한 줄에 하나 · 목표를 같이 쓰려면 "키워드, 3" (PC·모바일 같게) 또는 "키워드, 3, 2" (PC, 모바일 · 없으면 -)</span><textarea class="inp" id="pfKws" rows="7" placeholder="비씨카드발급, 3&#10;비씨바로카드신청, 3, 2&#10;BC카드캐시백이벤트, -, 2&#10;비씨카드온라인발급">${e2(f.kws)}</textarea></label>
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
    const bn = $('#pfBidN', S.root); if (bn) { const c = kws.filter((x) => x.bid0 != null).length; bn.textContent = c ? `최초 입찰가 ${c}개 읽음` : ''; }
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
        S.edit.bid0 = {}; for (const x of rows) if (x.bid != null) S.edit.bid0[x.kw.replace(/\s+/g, '').toUpperCase()] = x.bid;
        if (!$('#pfName', r).value.trim()) $('#pfName', r).value = jb.name || '';
        toast(rows.length > cap ? `키워드 ${rows.length}개를 불러왔어요. 상한 ${cap}개에 맞게 추적할 키워드만 남겨 주세요` : `키워드 ${rows.length}개를 불러왔어요`, rows.length > cap ? 'warn' : 'ok');
      } catch (e) { toast(e.message, 'warn'); }
      estimate();
    };
    const fileIn = $('#pfFile', r);
    if (fileIn) fileIn.onchange = async () => {
      if (!window.__PL_ROWS) return toast('새로고침한 뒤 다시 해 주세요', 'warn');
      for (const f of fileIn.files) { try { takeRows(await window.__PL_ROWS.file(f), f.name); } catch (e) { toast(f.name + ': ' + e.message, 'warn'); } }
      fileIn.value = '';
    };
    $('#pfKws', r).addEventListener('paste', (e) => {
      const rows = window.__PL_ROWS?.clip(e.clipboardData);
      if (!rows) return; // 머리글 없는 일반 글은 그대로 붙여넣기
      e.preventDefault(); takeRows(rows, '붙여넣은 표');
    });
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

  // 왼쪽 메뉴 '순위 추적'에 추적 중 개수 표시
  function sideBadge() {
    const b = document.querySelector('.as-item[data-view="plt"]');
    if (!b) return;
    let m = b.querySelector('.plt-live');
    if (S.onCount) {
      if (!m) { m = document.createElement('em'); m.className = 'plt-live'; b.appendChild(m); }
      m.textContent = '추적 중 ' + S.onCount;
      b.querySelector('.as-new')?.classList.add('hidden');
      b.title = `순위 추적 · 추적 중 ${S.onCount}개`;
    } else { m?.remove(); b.querySelector('.as-new')?.classList.remove('hidden'); b.title = '순위 추적'; }
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
