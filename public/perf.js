// 광고 성과 (읽기 전용): 내 검색광고 계정의 캠페인 › 광고그룹 › 키워드별 성과를 봄
// - 서버는 읽기·예상치 호출만 허용 (ad-guard.mjs). 광고 켜기/끄기·입찰가 변경 같은 호출은 네트워크로 나가기 전에 막힘
// - 성과 자료는 파일로 저장하지 않음 (서버 메모리 10분)
// - 성과 좋은 키워드를 골라 AI 키워드 생성기 예시로 보낼 수 있음
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const e2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(+v || 0).toLocaleString('ko-KR');
  const P = { cmps: null, pick: new Set(JSON.parse(localStorage.getItem('perfPick') || '[]')), preset: localStorage.getItem('perfPreset') || '7', since: '', until: '', data: null, err: '', busy: false, sort: { key: 'cost', dir: -1 }, q: '', onlyClk: false, sel: new Set(),
    mode: localStorage.getItem('perfMode') === 'diag' ? 'diag' : 'kw', dDate: '', dBase: '7', diag: null, dBusy: false, dErr: '' };

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
        <span class="seg pf-mode" style="margin-left:8px"><button data-pm="kw" class="${P.mode === 'kw' ? 'on' : ''}">키워드 성과</button><button data-pm="diag" class="${P.mode === 'diag' ? 'on' : ''}">급등 원인 진단</button></span>
        <span class="muted" style="font-size:13px;font-weight:500">${P.mode === 'kw' ? '내 검색광고 계정의 키워드별 성과' : '노출·클릭이 갑자기 오른 날의 원인을 키워드별로'} · 광고 계정은 바꾸지 않아요</span></h2>
      <div class="card">
        <div class="pf-row"><span class="flabel">캠페인</span><div class="pf-cmps">${cmps == null ? '<span class="muted">불러오는 중...</span>' : cmps.length ? cmps.map((c) => `<label class="pf-cmp"><input type="checkbox" data-cmp="${e2(c.id)}" ${P.pick.has(c.id) ? 'checked' : ''}> ${e2(c.name)} <small class="muted">${e2(c.type === 'WEB_SITE' ? '파워링크' : c.type === 'BRAND_SEARCH' ? '브랜드검색' : c.type || '')} · ${e2(c.state)}</small></label>`).join('') : '<span class="muted">캠페인이 없어요</span>'}</div></div>
        ${P.mode === 'kw' ? `<div class="pf-row"><span class="flabel">기간</span>
          <select id="pfPreset" class="hsel">${[['1', '어제'], ['7', '최근 7일'], ['14', '최근 14일'], ['30', '최근 30일'], ['lastmonth', '지난달'], ['custom', '직접 입력']].map(([k, n]) => `<option value="${k}" ${P.preset === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          ${P.preset === 'custom' ? `<input type="date" id="pfSince" value="${e2(P.since)}"> ~ <input type="date" id="pfUntil" value="${e2(P.until)}">` : `<span class="muted">${since} ~ ${until} (오늘은 빼고)</span>`}
          <span style="flex:1"></span>
          <button class="btn pri" id="pfRun" ${P.busy ? 'disabled' : ''}>${P.busy ? '불러오는 중...' : '성과 불러오기'}</button>
        </div>` : `<div class="pf-row"><span class="flabel">오른 날</span><input type="date" id="pdDate" value="${e2(P.dDate || ymd(new Date(Date.now() - 86400e3)))}">
          <span class="flabel" style="margin-left:10px">비교 기준</span><select id="pdBase" class="hsel">${[['7', '직전 7일 하루 평균'], ['14', '직전 14일 하루 평균'], ['28', '직전 28일 하루 평균']].map(([k, n]) => `<option value="${k}" ${P.dBase === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <span style="flex:1"></span>
          <button class="btn pri" id="pdRun" ${P.dBusy ? 'disabled' : ''}>${P.dBusy ? '진단 중... (키워드가 많으면 1분 정도)' : '원인 진단하기'}</button>
        </div>`}
        ${(P.mode === 'kw' ? P.err : P.dErr) ? `<div style="color:#b91c1c;margin-top:8px">${e2(P.mode === 'kw' ? P.err : P.dErr)}</div>` : ''}
      </div></div>
      ${P.mode === 'diag' ? diagHTML() : P.data ? `<div class="sec"><h2>키워드 ${n0(rows.length)}개 <span class="muted" style="font-size:13px;font-weight:500">${e2(P.data.since)} ~ ${e2(P.data.until)} · ${e2(P.data.campaigns.join(', '))} · 광고그룹 ${n0(P.data.groups)}개</span></h2>
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
    box().querySelectorAll('[data-pm]').forEach((b) => (b.onclick = () => { P.mode = b.dataset.pm; localStorage.setItem('perfMode', P.mode); draw(); }));
    if (P.mode === 'diag') return wireDiag();
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

  // ---------------------------------------------------------------- 급등 원인 진단
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? null : 0);
  const pctTxt = (a, b) => { const p = pct(a, b); return p == null ? '<b class="pd-up">새로 발생</b>' : `<b class="${p > 0 ? 'pd-up' : p < 0 ? 'pd-dn' : ''}">${p > 0 ? '+' : ''}${p}%</b>`; };
  const CAUSE = {
    '수요 증가': ['pd-c1', '그날 그 키워드를 검색한 사람이 평소보다 많았어요 (데이터랩 일별 지수 1.3배 이상)'],
    '순위 상승': ['pd-c2', '평균 노출 순위가 0.5 이상 좋아졌어요 → 입찰가·품질지수 변화나 경쟁 광고가 빠졌을 가능성'],
    '새로 노출': ['pd-c3', '평소에는 거의 노출이 없던 키워드예요 → 켜기·예산·노출 설정 변경이나 확장 검색 확인'],
    '새로 등록': ['pd-c3', '비교 기간 안에 새로 등록된 키워드예요'],
    '그날 전후 수정': ['pd-c4', '키워드나 광고그룹이 그날이나 전날 수정됐어요 (입찰가·상태·설정) → 변경 이력에서 내용 확인'],
    '클릭률 상승': ['pd-c5', '노출보다 클릭이 더 크게 늘었어요 → 소재·확장 소재 변경, 순위 상승, 검색 의도 변화'],
    '불명확': ['pd-c0', '데이터로는 원인이 안 보여요 → 검색어 보고서(실제 검색어)·변경 이력·외부 이슈 확인'],
  };
  const chip = (c) => `<span class="pd-chip ${(CAUSE[c] || CAUSE['불명확'])[0]}" title="${e2((CAUSE[c] || CAUSE['불명확'])[1])}">${e2(c)}</span>`;
  function diagHTML() {
    const d = P.diag;
    if (!d) return `<div class="sec"><div class="card muted" style="line-height:1.8">캠페인과 노출·클릭이 오른 날짜를 고르고 <b>원인 진단하기</b>를 누르세요. 그날과 평소(직전 7·14·28일 하루 평균)를 키워드별로 비교해서, 늘어난 노출이 <b>수요 증가 / 순위 상승 / 새로 노출 / 그날 전후 수정 / 클릭률 상승</b> 중 어디서 왔는지 나눠 보여줘요.<br>광고시스템의 변경 이력·검색어 보고서는 API로 못 가져와서, 의심 가는 곳은 직접 확인하도록 표시해요.</div></div>`;
    const totalUp = Object.values(d.share).reduce((a, b) => a + b, 0) || 1;
    const shares = Object.entries(d.share).sort((a, b) => b[1] - a[1]);
    const devRow = (k, n) => { const a = d.dev?.day?.[k], b = d.dev?.base?.[k]; return a ? `<tr><td class="l">${n}</td><td>${n0(a.imp)}</td><td>${b ? n0(b.imp / d.base.days) : '-'}</td><td>${b ? pctTxt(a.imp, b.imp / d.base.days) : '-'}</td><td>${n0(a.clk)}</td><td>${b ? n0(b.clk / d.base.days) : '-'}</td></tr>` : ''; };
    const devKeys = Object.keys(d.dev?.day || {});
    return `<div class="sec"><h2>${e2(d.date)} 진단 <span class="muted" style="font-size:13px;font-weight:500">평소 = ${e2(d.base.since)} ~ ${e2(d.base.until)} (${d.base.days}일) 하루 평균 · 키워드 ${n0(d.keywords)}개 중 늘어난 상위 ${d.top.length}개 분석</span></h2>
      <div class="pf-sum">${[['노출', d.day.imp, d.avg.imp], ['클릭', d.day.clk, d.avg.clk], ['비용 (VAT 포함)', d.day.cost, d.avg.cost], ['전환', d.day.conv, d.avg.conv]].map(([k, a, b]) => `<div class="card"><div class="muted">${k}</div><b>${n0(a)}</b> <span class="muted">평소 ${n0(b)}</span><div>${pctTxt(a, b)}</div></div>`).join('')}
        <div class="card"><div class="muted">평균 노출 순위</div><b>${d.day.rank ? d.day.rank.toFixed(1) : '-'}</b> <span class="muted">평소 ${d.avg.rank ? d.avg.rank.toFixed(1) : '-'}</span></div></div>
      <div class="grid g2" style="gap:12px;margin-bottom:12px">
        <div class="card"><h3>늘어난 노출은 어디서 왔나</h3>
          ${shares.length ? shares.map(([c, v]) => `<div class="pd-bar"><span style="min-width:110px">${chip(c)}</span><div class="pd-track"><div style="width:${Math.round((v / totalUp) * 100)}%"></div></div><span class="muted">${Math.round((v / totalUp) * 100)}% · +${n0(v)}</span></div>`).join('') : '<div class="muted">늘어난 키워드가 없어요</div>'}
          <div class="muted" style="font-size:12px;margin-top:6px">키워드마다 첫 번째 원인 기준으로 늘어난 노출을 나눴어요. 원인 칩에 마우스를 올리면 설명이 나와요.${d.demandErr ? ' · ' + e2(d.demandErr) : ''}</div></div>
        <div class="card"><h3>같이 확인할 것</h3>
          ${d.edited.length ? `<div style="margin-bottom:6px"><b style="color:#b45309">그날 전후 수정된 캠페인·광고그룹</b>${d.edited.map((x) => `<div class="muted">${e2(x.level)} · ${e2(x.name)} · ${e2(new Date(x.editTm).toLocaleString('ko-KR'))}</div>`).join('')}</div>` : '<div class="muted" style="margin-bottom:6px">그날 전후 수정된 캠페인·광고그룹은 없어요</div>'}
          ${devKeys.length ? `<table class="mini"><tr><th class="l">기기</th><th>노출</th><th>평소</th><th>변화</th><th>클릭</th><th>평소</th></tr>${devKeys.map((k) => devRow(k, /p/i.test(k) && !/m/i.test(k) ? 'PC' : /m/i.test(k) ? '모바일' : k)).join('')}</table>` : `<div class="muted" style="font-size:12px">PC/모바일 나누기는 ${d.dev?.error ? '못 받았어요 (' + e2(d.dev.error) + ')' : '네이버가 최근 7일 안의 날짜만 줘요'}</div>`}
          <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.6">API로 못 보는 것: 광고시스템 <b>변경 이력</b>(누가 무엇을 바꿨는지), <b>검색어 보고서</b>(확장 검색으로 잡힌 실제 검색어), 경쟁사 이벤트·뉴스 같은 외부 이슈</div></div>
      </div>
      <div class="card"><div class="tbl-wrap" style="max-height:640px"><table class="rel" id="pdTbl" style="min-width:1100px">
        <thead><tr><th class="l">키워드</th><th class="l">원인</th><th>노출 그날</th><th>평소</th><th>변화</th><th>클릭 그날</th><th>평소</th><th>순위 그날</th><th>평소</th><th>검색 수요</th><th class="l">광고그룹</th><th class="l">최근 수정</th></tr></thead>
        <tbody>${d.top.map((r) => `<tr>
          <td class="l kwc"><a href="?keyword=${encodeURIComponent(r.keyword)}" data-run="${e2(r.keyword)}">${e2(r.keyword)}</a></td>
          <td class="l">${r.causes.map(chip).join(' ')}</td>
          <td><b>${n0(r.imp)}</b></td><td class="muted">${n0(r.bImp)}</td><td>${pctTxt(r.imp, r.bImp)}</td>
          <td>${n0(r.clk)}</td><td class="muted">${n0(r.bClk)}</td>
          <td>${r.rank ? r.rank.toFixed(1) : '-'}</td><td class="muted">${r.bRank ? r.bRank.toFixed(1) : '-'}</td>
          <td>${r.demand == null ? '<span class="muted">-</span>' : `<b class="${r.demand >= 1.3 ? 'pd-up' : ''}">×${r.demand}</b>`}</td>
          <td class="l muted">${e2(r.group)}</td><td class="l muted">${r.editTm ? e2(new Date(r.editTm).toLocaleDateString('ko-KR')) : ''}</td>
        </tr>`).join('') || '<tr><td colspan="12" class="l muted" style="padding:20px">평소보다 늘어난 키워드가 없어요</td></tr>'}</tbody></table></div>
        <div class="muted" style="margin-top:8px;line-height:1.7">검색 수요 = 데이터랩 일별 지수, 그날 ÷ 평소 평균 (×1.5면 평소의 1.5배 검색). 순위는 숫자가 작을수록 위예요. 키워드를 누르면 키워드 분석으로 넘어가요.</div></div></div>`;
  }
  async function runDiag() {
    if (P.dBusy) return;
    if (!P.pick.size) return window.toast?.('캠페인을 하나 이상 골라 주세요', 'warn');
    P.dDate = $('#pdDate')?.value || P.dDate; P.dBase = $('#pdBase')?.value || P.dBase;
    if (!P.dDate) return window.toast?.('날짜를 골라 주세요', 'warn');
    P.dBusy = true; P.dErr = ''; draw();
    try {
      const j = await (await fetch('/api/ads/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaigns: [...P.pick], date: P.dDate, baseDays: +P.dBase }) })).json();
      if (j.error) throw new Error(j.error);
      P.diag = j;
    } catch (e) { P.dErr = e.message; }
    P.dBusy = false; draw();
  }
  function wireDiag() {
    $('#pdDate').onchange = (e) => (P.dDate = e.target.value);
    $('#pdBase').onchange = (e) => (P.dBase = e.target.value);
    $('#pdRun').onclick = runDiag;
    box().querySelectorAll('#pdTbl [data-run]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.__LAYOUT?.go('analyze'); window.run?.(a.dataset.run); }));
  }

  window.__RESET_perf = () => {
    P.data = null; P.diag = null; P.err = ''; P.dErr = ''; P.sel.clear(); P.q = ''; P.onlyClk = false;
    draw(); scrollTo(0, 0);
    return '초기화했어요 (캠페인 선택은 그대로)';
  };
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
