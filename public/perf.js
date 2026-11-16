// 광고 성과 (읽기 전용): 내 검색광고 계정의 캠페인 › 광고그룹 › 키워드별 성과를 봄
// - 서버는 읽기·예상치 호출만 허용 (ad-guard.mjs). 광고 켜기/끄기·입찰가 변경 같은 호출은 네트워크로 나가기 전에 막힘
// - 성과 자료는 파일로 저장하지 않음 (서버 메모리 10분)
// - 성과 좋은 키워드를 골라 AI 키워드 생성기 예시로 보낼 수 있음
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const e2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(+v || 0).toLocaleString('ko-KR');
  const P = { cmps: null, pick: new Set(JSON.parse(localStorage.getItem('perfPick') || '[]')), preset: localStorage.getItem('perfPreset') || '7', since: '', until: '', data: null, err: '', busy: false, sort: { key: 'cost', dir: -1 }, q: '', onlyClk: false, sel: new Set() };

  const ymd = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  function range() {
    const now = new Date(), day = 86400e3;
    const y = new Date(now - day);
    if (P.preset === 'custom') return [P.since, P.until];
    if (P.preset === '1') return [ymd(y), ymd(y)];
    if (P.preset === 'lastmonth') { const k = new Date(now.getTime() + 9 * 3600e3); const f = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - 1, 1)); const l = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 0)); return [f.toISOString().slice(0, 10), l.toISOString().slice(0, 10)]; }
    const n = +P.preset || 7;
    return [ymd(new Date(now - n * day)), ymd(y)];
  }

  function mount() {
    const v = document.createElement('div');
    v.id = 'perfView';
    v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><main class="ai-main" style="max-width:1400px"><div id="pfBody"></div></main></div>`;
    $('#main').after(v);
  }

  async function loadCampaigns() {
    P.err = '';
    try {
      const j = await (await fetch('/api/ads/campaigns')).json();
      if (j.error) throw new Error(j.error);
      P.cmps = j.campaigns;
      for (const id of [...P.pick]) if (!P.cmps.some((c) => c.id === id)) P.pick.delete(id);
    } catch (e) { P.err = e.message; P.cmps = []; }
    draw();
  }

  async function run() {
    if (P.busy) return;
    const [since, until] = range();
    if (!P.pick.size) return window.toast?.('캠페인을 하나 이상 골라 주세요', 'warn');
    if (!since || !until) return window.toast?.('기간을 넣어 주세요', 'warn');
    P.busy = true; P.err = ''; draw();
    try {
      const j = await (await fetch('/api/ads/perf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaigns: [...P.pick], since, until }) })).json();
      if (j.error) throw new Error(j.error);
      P.data = j; P.sel.clear();
    } catch (e) { P.err = e.message; }
    P.busy = false; draw();
  }

  const COLS = [
    ['keyword', '키워드', 'l'], ['campaign', '캠페인', 'l'], ['group', '광고그룹', 'l'], ['state', '상태', 'l'],
    ['imp', '노출'], ['clk', '클릭'], ['ctr', 'CTR'], ['cpc', 'CPC'], ['cost', '비용'], ['rank', '평균순위'], ['conv', '전환'], ['convAmt', '전환매출'],
  ];
  function view() {
    let rows = P.data?.rows || [];
    const q = P.q.trim().replace(/\s+/g, '').toLowerCase();
    if (q) rows = rows.filter((r) => r.keyword.replace(/\s+/g, '').toLowerCase().includes(q) || r.group.toLowerCase().includes(q));
    if (P.onlyClk) rows = rows.filter((r) => r.clk > 0);
    const { key, dir } = P.sort;
    return rows.slice().sort((a, b) => (typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : (a[key] || 0) - (b[key] || 0)) * dir);
  }

  function draw() {
    const box = $('#pfBody');
    if (!box) return;
    const [since, until] = range();
    const cmps = P.cmps;
    const rows = view();
    const sum = rows.reduce((s, r) => { s.imp += r.imp; s.clk += r.clk; s.cost += r.cost; s.conv += r.conv; s.convAmt += r.convAmt; return s; }, { imp: 0, clk: 0, cost: 0, conv: 0, convAmt: 0 });
    box.innerHTML = `
      <div class="sec"><h2>광고 성과 <span class="pf-ro" title="이 화면과 분석기 서버는 광고 계정을 읽기만 해요. 켜기·끄기·입찰가·예산 변경 호출은 서버에서 막혀 있어요.">읽기 전용</span>
        <span class="muted" style="font-size:13px;font-weight:500">내 검색광고 계정의 키워드별 성과 · 광고 계정은 바꾸지 않아요</span></h2>
      <div class="card">
        <div class="pf-row"><span class="flabel">캠페인</span><div class="pf-cmps">${cmps == null ? '<span class="muted">불러오는 중...</span>' : cmps.length ? cmps.map((c) => `<label class="pf-cmp"><input type="checkbox" data-cmp="${e2(c.id)}" ${P.pick.has(c.id) ? 'checked' : ''}> ${e2(c.name)} <small class="muted">${e2(c.type === 'WEB_SITE' ? '파워링크' : c.type === 'BRAND_SEARCH' ? '브랜드검색' : c.type || '')} · ${e2(c.state)}</small></label>`).join('') : '<span class="muted">캠페인이 없어요</span>'}</div></div>
        <div class="pf-row"><span class="flabel">기간</span>
          <select id="pfPreset" class="hsel">${[['1', '어제'], ['7', '최근 7일'], ['14', '최근 14일'], ['30', '최근 30일'], ['lastmonth', '지난달'], ['custom', '직접 입력']].map(([k, n]) => `<option value="${k}" ${P.preset === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          ${P.preset === 'custom' ? `<input type="date" id="pfSince" value="${e2(P.since)}"> ~ <input type="date" id="pfUntil" value="${e2(P.until)}">` : `<span class="muted">${since} ~ ${until} (오늘은 빼고)</span>`}
          <span style="flex:1"></span>
          <button class="btn pri" id="pfRun" ${P.busy ? 'disabled' : ''}>${P.busy ? '불러오는 중...' : '성과 불러오기'}</button>
        </div>
        ${P.err ? `<div style="color:#b91c1c;margin-top:8px">${e2(P.err)}</div>` : ''}
      </div></div>
      ${P.data ? `<div class="sec"><h2>키워드 ${n0(rows.length)}개 <span class="muted" style="font-size:13px;font-weight:500">${e2(P.data.since)} ~ ${e2(P.data.until)} · ${e2(P.data.campaigns.join(', '))} · 광고그룹 ${n0(P.data.groups)}개</span></h2>
        <div class="pf-sum">${[['노출', n0(sum.imp)], ['클릭', n0(sum.clk)], ['CTR', sum.imp ? (sum.clk / sum.imp * 100).toFixed(2) + '%' : '-'], ['평균 CPC', sum.clk ? n0(sum.cost / sum.clk) + '원' : '-'], ['비용 (VAT 포함)', n0(sum.cost) + '원'], ['전환', n0(sum.conv)], ['전환매출', n0(sum.convAmt) + '원']].map(([k, v]) => `<div class="card"><div class="muted">${k}</div><b>${v}</b></div>`).join('')}</div>
        <div class="card">
          <div class="toolbar">
            <input id="pfQ" placeholder="키워드·광고그룹 검색" value="${e2(P.q)}" style="min-width:220px">
            <label class="muted" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="pfClk" ${P.onlyClk ? 'checked' : ''}> 클릭 있는 것만</label>
            <span class="tb-sep"></span>
            <button class="btn" id="pfToAi" title="체크한 키워드를 AI 키워드 생성기의 예시 키워드로 넣어요 (성과 좋은 키워드와 비슷한 키워드를 더 찾게)">체크한 키워드 → AI 생성기 예시로</button>
            <span class="muted" id="pfSelInfo">${P.sel.size ? `${n0(P.sel.size)}개 체크` : ''}</span>
            <span style="flex:1"></span>
            <button class="btn pri" id="pfXlsx">엑셀 다운로드</button>
            <button class="btn" id="pfTxt" title="지금 표에 보이는 키워드만, 한 줄에 하나씩">TXT</button>
          </div>
          <div class="tbl-wrap" style="max-height:680px"><table class="rel" id="pfTbl" style="min-width:1200px">
            <thead><tr><th class="l" style="width:30px"><input type="checkbox" id="pfAll" title="표에 보이는 키워드 전체 체크 / 다시 누르면 전체 해제"></th>${COLS.map(([k, n, c]) => `<th data-k="${k}" class="${c || ''} ${P.sort.key === k ? 'sorted' : ''}">${n}<span class="ar">${P.sort.key === k ? (P.sort.dir < 0 ? '▼' : '▲') : '↕'}</span></th>`).join('')}</tr></thead>
            <tbody>${rows.slice(0, 3000).map((r) => `<tr>
              <td class="l"><input type="checkbox" data-sel="${e2(r.id)}" ${P.sel.has(r.id) ? 'checked' : ''}></td>
              <td class="l kwc"><a href="?keyword=${encodeURIComponent(r.keyword)}" data-run="${e2(r.keyword)}">${e2(r.keyword)}</a></td>
              <td class="l muted">${e2(r.campaign)}</td><td class="l">${e2(r.group)}</td><td class="l muted">${e2(r.state)}</td>
              <td>${n0(r.imp)}</td><td><b>${n0(r.clk)}</b></td><td>${r.ctr ? r.ctr.toFixed(2) + '%' : '-'}</td><td>${r.cpc ? n0(r.cpc) : '-'}</td><td>${n0(r.cost)}</td><td>${r.rank ? r.rank.toFixed(1) : '-'}</td><td>${n0(r.conv)}</td><td>${n0(r.convAmt)}</td>
            </tr>`).join('') || '<tr><td colspan="13" class="l muted" style="padding:20px">조건에 맞는 키워드가 없어요</td></tr>'}</tbody>
          </table></div>
          <div class="muted" style="margin-top:8px;line-height:1.7">${rows.length > 3000 ? '화면에는 3,000개까지만 보여요. 엑셀에는 전부 들어가요. ' : ''}비용은 네이버 기준 VAT 포함 금액, CTR·CPC·평균순위는 네이버가 준 값 그대로예요. 키워드를 누르면 키워드 분석으로 넘어가요. 상태는 조회한 순간 기준이에요.</div>
        </div></div>` : ''}`;
    wire(rows);
  }

  function wire(rows) {
    box().querySelectorAll('[data-cmp]').forEach((c) => (c.onchange = () => { c.checked ? P.pick.add(c.dataset.cmp) : P.pick.delete(c.dataset.cmp); localStorage.setItem('perfPick', JSON.stringify([...P.pick])); }));
    $('#pfPreset').onchange = (e) => { P.preset = e.target.value; localStorage.setItem('perfPreset', P.preset); if (P.preset === 'custom' && !P.since) { const [a, b] = (() => { const s = P.preset; P.preset = '7'; const r = range(); P.preset = s; return r; })(); P.since = a; P.until = b; } draw(); };
    if ($('#pfSince')) { $('#pfSince').onchange = (e) => (P.since = e.target.value); $('#pfUntil').onchange = (e) => (P.until = e.target.value); }
    $('#pfRun').onclick = run;
    if (!P.data) return;
    let t;
    $('#pfQ').oninput = (e) => { P.q = e.target.value; clearTimeout(t); t = setTimeout(() => { draw(); const q = $('#pfQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $('#pfClk').onchange = (e) => { P.onlyClk = e.target.checked; draw(); };
    box().querySelectorAll('#pfTbl th[data-k]').forEach((th) => (th.onclick = () => { const k = th.dataset.k; P.sort = { key: k, dir: P.sort.key === k ? -P.sort.dir : ['keyword', 'campaign', 'group', 'state', 'rank'].includes(k) ? 1 : -1 }; draw(); }));
    box().querySelectorAll('#pfTbl [data-sel]').forEach((c) => (c.onchange = () => { c.checked ? P.sel.add(c.dataset.sel) : P.sel.delete(c.dataset.sel); $('#pfSelInfo').textContent = P.sel.size ? `${n0(P.sel.size)}개 체크` : ''; }));
    const all = $('#pfAll');
    all.checked = rows.length > 0 && rows.every((r) => P.sel.has(r.id));
    all.onchange = () => { const on = !rows.every((r) => P.sel.has(r.id)); rows.forEach((r) => (on ? P.sel.add(r.id) : P.sel.delete(r.id))); draw(); };
    box().querySelectorAll('#pfTbl [data-run]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.__LAYOUT?.go('analyze'); window.run?.(a.dataset.run); }));
    $('#pfToAi').onclick = () => {
      const ks = [...new Set((P.data.rows || []).filter((r) => P.sel.has(r.id)).map((r) => r.keyword))];
      if (!ks.length) return window.toast?.('먼저 표에서 키워드를 체크해 주세요', 'warn');
      window.__LAYOUT?.go('ai');
      setTimeout(() => {
        const ex = $('#aiExamples');
        if (!ex) return;
        const have = ex.value.split(/[\n,\t]+/).map((x) => x.trim()).filter(Boolean);
        ex.value = [...new Set([...have, ...ks])].join('\n');
        ex.dispatchEvent(new Event('input', { bubbles: true }));
        window.toast?.(`예시 키워드에 ${ks.length}개를 넣었어요. 주제를 확인하고 [키워드 생성]을 누르세요.`);
      }, 200);
    };
    const name = () => `광고성과_${P.data.since}_${P.data.until}`;
    $('#pfTxt').onclick = () => window.downloadTxt?.(view().map((r) => r.keyword), name());
    $('#pfXlsx').onclick = () => {
      const head = ['키워드', '캠페인', '광고그룹', '상태', '노출', '클릭', 'CTR(%)', 'CPC', '비용(VAT 포함)', '평균순위', '전환', '전환매출'];
      const blob = window.XlsxLite.writeXlsx([{ name: '광고 성과', rows: [head, ...view().map((r) => [r.keyword, r.campaign, r.group, r.state, r.imp, r.clk, r.ctr, r.cpc, r.cost, r.rank, r.conv, r.convAmt])], widths: [30, 20, 24, 12, 10, 8, 8, 8, 12, 8, 8, 12] }]);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name() + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
  }
  const box = () => $('#pfBody');

  function showPerf(on) {
    if (on) { $('#aiView')?.classList.add('hidden'); window.__hideDup?.(); window.__hideBulk?.(); window.__hideCopy?.(); window.__hideMock?.(); }
    $('#perfView').classList.toggle('hidden', !on);
    if (on) {
      $('#main').classList.add('hidden'); $('#banners')?.classList.add('hidden'); $('#tabs')?.classList.add('hidden');
      history.replaceState(null, '', location.pathname + location.search + '#perf');
      if (P.cmps == null) loadCampaigns(); else draw();
    }
  }
  window.showPerf = showPerf;
  window.__hidePerf = () => {
    if ($('#perfView').classList.contains('hidden')) return;
    $('#perfView').classList.add('hidden');
    $('#main').classList.remove('hidden'); $('#banners')?.classList.remove('hidden');
    try { $('#tabs').classList.toggle('hidden', !STATE); } catch {}
    if (location.hash === '#perf') history.replaceState(null, '', location.pathname + location.search);
  };
  mount();
  draw();
  // 다른 화면이 열리면 이 화면은 닫음
  const watch = new MutationObserver(() => { if (!$('#perfView').classList.contains('hidden') && ['aiView', 'dupView', 'bulkView', 'copyView', 'mockView', 'main'].some((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); })) $('#perfView').classList.add('hidden'); });
  ['aiView', 'dupView', 'bulkView', 'copyView', 'mockView', 'main'].forEach((id) => { const el = document.getElementById(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  if (location.hash === '#perf') setTimeout(() => (window.__LAYOUT?.go ? window.__LAYOUT.go('perf') : showPerf(true)), 0);
})();
