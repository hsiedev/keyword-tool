// 구글 모드 · 키워드 분석 (무료 방식만)
// 개요(구글 · 네이버 검색량 비교) · 자동완성(구글 · 유튜브) · 구글 트렌드(비공식, 막히면 CSV) · 키워드 플래너(CSV 가져오기) · 유튜브(API 키 있을 때)
// 모드 전환(사이드바 NAVER / Google)은 layout.js, 이 파일은 구글 화면(#gView)만
(function () {
  const S = { kw: '', d: {}, nv: {}, deep: false };
  const NA = '<span class="muted">미표시</span>';
  const n0 = (n) => (n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR'));
  const KO = (n) => (n >= 1e8 ? +(n / 1e8).toFixed(1) + '억' : n >= 1e4 ? +(n / 1e4).toFixed(1) + '만' : n >= 1e3 ? +(n / 1e3).toFixed(1) + '천' : String(n));
  const vol = (a) => (!a ? null : a.lo === a.hi ? n0(a.lo) : `${KO(a.lo)}~${KO(a.hi)}`);
  const ranged = (a) => a && a.lo !== a.hi;
  const won = (v, cur) => (v == null ? '-' : (cur && !/KRW|원/.test(cur) ? cur + ' ' : '') + v.toLocaleString('ko-KR') + (cur && !/KRW|원/.test(cur) ? '' : '원'));
  const dt = (t) => (t ? new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '');
  const getJ = async (u, o) => { const r = await fetch(u, o); if (r.status === 404) throw new Error('서버가 예전 버전이에요. 화면 위 [서버 다시 시작]을 누르거나 start.bat을 다시 실행해 주세요'); return r.json(); };
  const postJ = (u, b) => getJ(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const enc = encodeURIComponent;

  // ---------------------------------------------------------------- 화면 틀
  const v = document.createElement('div');
  v.id = 'gView';
  v.className = 'hidden';
  v.innerHTML = `<div class="kw-search hidden" id="gSlotTop"></div>
    <nav class="tabs hidden" id="gNav"><a href="#g-sum" class="on">개요</a><a href="#g-ac">자동완성</a><a href="#g-tr">구글 트렌드</a><a href="#g-kp">키워드 플래너</a><a href="#g-yt">유튜브</a></nav>
    <main class="ai-main g-main">
    <section class="g-hero" id="gHero">
      <div class="g-mark" aria-hidden="true">G</div>
      <h1>구글 키워드 분석</h1>
      <div class="muted g-sub">무료 데이터만 써요 · 구글·유튜브 자동완성 · 구글 트렌드 · 키워드 플래너 CSV · 유튜브(API 키가 있을 때) · 네이버 검색량 비교</div>
      <div id="gSlotHero"></div>
      <div class="chips" id="gQuick"></div>
    </section>
    <form id="gForm" class="g-form" autocomplete="off"><input id="gQ" placeholder="구글에서 분석할 키워드를 입력하세요 (예: 운전자보험)" maxlength="80"><button>분석</button></form>
    <div id="gRes"></div>
  </main>`;
  document.getElementById('main').after(v);
  const $g = (s) => v.querySelector(s);
  let navLock = 0; // 탭을 누른 직후엔 스크롤 중 표시가 바뀌지 않게
  $g('#gForm').onsubmit = (e) => { e.preventDefault(); const k = $g('#gQ').value.trim(); if (k) run(k); };
  $g('#gNav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); navLock = Date.now() + 1200; $g('#gNav').querySelectorAll('a').forEach((x) => x.classList.toggle('on', x === a)); document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  function placeForm() {
    const has = !!S.kw;
    (has ? $g('#gSlotTop') : $g('#gSlotHero')).appendChild($g('#gForm'));
    $g('#gHero').classList.toggle('hidden', has);
    $g('#gSlotTop').classList.toggle('hidden', !has);
    $g('#gNav').classList.toggle('hidden', !has);
    if (!has) {
      const h = hist().slice(0, 6).map((x) => x.kw);
      const q = h.length ? h : ['운전자보험', '상조', '실손보험'];
      $g('#gQuick').innerHTML = q.map((k) => `<span class="chip click" data-k="${esc(k)}">${esc(k)}</span>`).join('');
      $g('#gQuick').querySelectorAll('[data-k]').forEach((c) => (c.onclick = () => run(c.dataset.k)));
    }
  }

  // ---------------------------------------------------------------- 최근 검색 (구글 따로)
  const hist = () => { try { return JSON.parse(localStorage.getItem('gHistory') || '[]'); } catch { return []; } };
  function addHist(kw) {
    const h = [{ kw, at: Date.now() }, ...hist().filter((x) => x.kw !== kw)].slice(0, 50);
    localStorage.setItem('gHistory', JSON.stringify(h));
  }

  // ---------------------------------------------------------------- 실행
  async function run(kw) {
    kw = String(kw || '').trim();
    if (!kw) return;
    window.__MODE?.get() !== 'google' && window.__MODE?.set('google');
    S.kw = kw; S.d = { kw }; S.nv = {}; S.deep = false;
    $g('#gQ').value = kw;
    addHist(kw);
    placeForm();
    drawAll();
    window.__LAYOUT?.sync();
    scrollTo({ top: 0 });
    const mine = kw;
    const set = (k, val) => { if (S.kw !== mine) return; S.d[k] = val; drawAll(); };
    const safe = (p) => p.catch((e) => ({ error: e.message }));
    safe(getJ(`/api/google/suggest?keyword=${enc(kw)}`)).then((j) => set('ac', j));
    safe(getJ(`/api/google/planner?keyword=${enc(kw)}`)).then((j) => set('kp', j));
    safe(getJ(`/api/google/youtube?keyword=${enc(kw)}`)).then((j) => set('yt', j));
    safe(postJ('/api/volumes', { keywords: [kw] })).then((j) => { if (j.volumes) S.nv = { ...S.nv, ...j.volumes }; set('nv', j.error ? { error: j.error } : j.volumes?.[kw] || { error: '결과 없음' }); });
    safe(getJ(`/api/google/trends?keyword=${enc(kw)}`)).then((j) => set('tr', j));
  }

  // ---------------------------------------------------------------- 그리기
  const card = (title, sub, body, cls = '') => `<div class="card ${cls}"><h3>${title}${sub ? ` <span class="muted">${sub}</span>` : ''}</h3>${body}</div>`;
  const loading = '<div class="muted g-load">불러오는 중…</div>';
  const errBox = (msg) => `<div class="g-err">${esc(msg)}</div>`;
  const spy = new IntersectionObserver((ents) => {
    if (Date.now() < navLock) return;
    for (const e of ents) if (e.isIntersecting) $g('#gNav').querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
  }, { rootMargin: '-120px 0px -60% 0px' });
  function drawAll() {
    if (!S.kw) { $g('#gRes').innerHTML = ''; return; }
    const keep = scrollY;
    const ytv = $g('#gYtKey')?.value; // 입력 중인 유튜브 키는 다시 그려도 유지
    $g('#gRes').innerHTML = [secSum(), secAc(), secTr(), secKp(), secYt()].join('');
    bind();
    drawTrendChart();
    drawKpChart();
    spy.disconnect();
    $g('#gRes').querySelectorAll('.sec').forEach((s) => spy.observe(s));
    if (ytv && $g('#gYtKey')) $g('#gYtKey').value = ytv;
    scrollTo(0, keep);
  }

  function trendSummary(tl) {
    if (!tl?.length) return null;
    const vals = tl.filter((x) => !x.partial).map((x) => x.v);
    const last = vals.slice(-4), prev = vals.slice(-8, -4);
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const a1 = avg(last), a0 = avg(prev);
    const peak = { ...tl.reduce((m, x) => (x.v > m.v ? x : m), tl[0]) };
    if (!peak.label && peak.t) { const d = new Date(peak.t); peak.label = `20${String(d.getFullYear()).slice(2)}. ${d.getMonth() + 1}. ${d.getDate()}. 주`; }
    return { now: Math.round(a1), chg: a0 ? Math.round(((a1 - a0) / a0) * 100) : null, peak };
  }
  function secSum() {
    const kp = S.d.kp, nv = S.d.nv, tr = S.d.tr, ac = S.d.ac;
    const hit = kp?.hit;
    const g = !kp ? loading : kp.error ? errBox(kp.error) : hit
      ? `<div class="g-big">${vol(hit.avg) || '-'}</div><div class="muted">월평균 검색량 · 키워드 플래너 (${esc(dt(hit.at))} 가져옴)</div>
        <div class="g-kv"><span>경쟁</span><b>${esc(hit.comp || '-')}${hit.compIdx != null ? ` (${hit.compIdx})` : ''}</b><span>상단 입찰가</span><b>${hit.bidLow != null || hit.bidHigh != null ? `${won(hit.bidLow, hit.currency)} ~ ${won(hit.bidHigh, hit.currency)}` : '-'}</b></div>
        ${ranged(hit.avg) ? '<div class="g-note">광고비를 쓰지 않는 계정은 범위로 나와요. 옆의 네이버 검색량으로 크기를 가늠해 보세요.</div>' : ''}`
      : `<div class="g-big">${NA}</div><div class="muted">키워드 플래너 CSV를 가져오면 보여요</div><button class="btn sm" data-go="g-kp" style="margin-top:8px">CSV 가져오기 ↓</button>`;
    const n = !nv ? loading : nv.error ? `<div class="g-big">${NA}</div><div class="muted">${esc(/검색광고 API 키/.test(nv.error) ? '검색광고 API 키가 있으면 보여요' : nv.error)}</div>`
      : `<div class="g-big">${n0(nv.total)}</div><div class="muted">월간 검색량 (최근 30일) · 네이버 검색광고</div><div class="g-kv"><span>PC</span><b>${n0(nv.pc)}</b><span>모바일</span><b>${n0(nv.mo)}</b></div>`;
    const ts = trendSummary(tr?.timeline);
    const t = !tr ? loading : ts
      ? `<div class="g-big">${ts.chg == null ? '-' : (ts.chg > 0 ? '+' : '') + ts.chg + '%'}</div><div class="muted">최근 4주 관심도, 그 전 4주와 비교 (구글 트렌드)</div><div class="g-kv"><span>12개월 최고</span><b>${esc(ts.peak.label)}</b><span>지역 1위</span><b>${esc(tr.regions?.[0]?.name || '-')}</b></div>`
      : `<div class="g-big">${NA}</div><div class="muted">${esc(tr.errors?.[0] || '데이터 없음')}</div>`;
    const a = !ac ? loading : ac.error ? errBox(ac.error)
      : `<div class="g-big">${(ac.all || []).length}<small>개</small></div><div class="muted">구글 ${ac.google?.length || 0} · 유튜브 ${ac.youtube?.length || 0} (중복 합침)</div><div class="g-mini-chips">${(ac.all || []).slice(0, 6).map((x) => `<span class="chip click" data-run="${esc(x.keyword)}">${esc(x.keyword)}</span>`).join('')}</div>`;
    const q = enc(S.kw);
    const links = [[`https://www.google.com/search?q=${q}&hl=ko&gl=kr`, '구글에서 검색'], [`https://trends.google.com/trends/explore?geo=KR&q=${q}&hl=ko`, '구글 트렌드'], ['https://ads.google.com/aw/keywordplanner/home', '키워드 플래너'], [`https://adstransparency.google.com/?region=KR`, '광고 투명성 센터'], [`https://www.youtube.com/results?search_query=${q}`, '유튜브에서 검색']];
    return `<section class="sec" id="g-sum"><h2>개요 <span class="kw">'${esc(S.kw)}'</span> <span class="g-badge">Google</span></h2>
      <div class="grid g4">${card('구글 검색량', '', g)}${card('네이버 검색량', '비교', n)}${card('구글 트렌드', '', t)}${card('자동완성', '', a)}</div>
      <div class="g-links">${links.map(([u, l]) => `<a class="chip click" href="${u}" target="_blank" rel="noopener">${l} ↗</a>`).join('')}</div></section>`;
  }

  function secAc() {
    const ac = S.d.ac;
    let body;
    if (!ac) body = loading;
    else if (ac.error) body = errBox(ac.error);
    else {
      const rows = ac.all || [];
      body = `${(ac.errors || []).length ? `<div class="g-note">일부를 못 가져왔어요: ${esc(ac.errors.slice(0, 3).join(' / '))}</div>` : ''}
        <div class="tbl-wrap"><table class="g-tbl"><thead><tr><th>#</th><th>키워드</th><th>출처</th><th class="r">네이버 검색량</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr><td class="muted">${i + 1}</td><td><a href="#" class="g-run" data-run="${esc(x.keyword)}">${esc(x.keyword)}</a></td><td>${x.src.map((s) => `<span class="tag g-src ${s === '구글' ? 'g' : 'y'}">${s}</span>`).join(' ')}</td><td class="r">${nvCell(x.keyword)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted" style="padding:14px">자동완성이 없어요</td></tr>'}
        </tbody></table></div>`;
    }
    return `<section class="sec" id="g-ac"><h2>자동완성 <span class="muted" style="font-size:13px;font-weight:500">구글·유튜브 검색창에 뜨는 추천어</span></h2>
      <div class="card"><h3><span>${ac && !ac.error ? `${(ac.all || []).length}개${ac.deep ? ' (넓게 수집)' : ''}` : ''}</span><span class="g-acts">
        <button class="btn sm" data-a="deep" ${ac?.deep ? 'disabled' : ''} title="키워드 뒤에 ㄱ~ㅎ을 붙여 한 번 더 모아요 (10초쯤)">넓게 수집 (ㄱ~ㅎ)</button>
        <button class="btn sm" data-a="nv-ac">네이버 검색량 붙이기</button><button class="btn sm" data-a="txt-ac">TXT</button><button class="btn sm" data-a="copy-ac">복사</button></span></h3>${body}</div></section>`;
  }
  const nvCell = (k) => { const x = S.nv[k]; return !x ? '<span class="muted">-</span>' : x.error ? '<span class="muted">오류</span>' : x.notFound ? '<span class="muted">없음</span>' : n0(x.total); };

  function secTr() {
    const tr = S.d.tr;
    let body;
    if (!tr) body = loading + '<div class="muted" style="margin-top:4px">구글 트렌드는 요청 사이 간격을 둬서 5~10초 걸려요</div>';
    else {
      const err = (tr.errors || []).length ? `<div class="g-err">${esc(tr.errors.join(' / '))}</div>` : '';
      const fromCsv = [tr.timelineFrom, tr.relatedFrom, tr.regionsFrom].some(Boolean) ? `<div class="g-note">일부는 가져온 CSV(${esc(dt(tr.importedAt))})로 보여줘요</div>` : '';
      const list = (arr, empty) => (arr?.length ? `<ol class="g-ol">${arr.slice(0, 15).map((x) => `<li><a href="#" class="g-run" data-run="${esc(x.query)}">${esc(x.query)}</a><span class="muted">${esc(x.value)}</span></li>`).join('')}</ol>` : `<div class="muted">${empty}</div>`);
      const maxR = Math.max(1, ...(tr.regions || []).map((x) => x.v));
      body = `${err}${fromCsv}
        ${tr.timeline?.length ? `<div class="g-chart" id="gTrChart"></div><div class="muted g-cap">대한민국 · 최근 12개월 · 주 단위. 100 = 이 기간에 가장 많이 검색된 때 (실제 검색 횟수가 아니라 상대값)</div>` : ''}
        <div class="grid g3" style="margin-top:12px">
          <div class="card"><h3>관련 검색어 · 인기</h3>${list(tr.related?.top, '없음')}</div>
          <div class="card"><h3>관련 검색어 · 급상승</h3>${list(tr.related?.rising, '없음')}</div>
          <div class="card"><h3>지역별 관심도</h3>${tr.regions?.length ? `<div class="g-bars">${tr.regions.slice(0, 17).map((x) => `<div class="g-bar"><span>${esc(x.name)}</span><i style="width:${(x.v / maxR) * 100}%"></i><b>${x.v}</b></div>`).join('')}</div>` : '<div class="muted">없음</div>'}</div>
        </div>
        <div class="g-drop" data-drop="tr">구글 트렌드가 막혔거나 다른 기간을 보고 싶으면, <a href="https://trends.google.com/trends/explore?geo=KR&q=${enc(S.kw)}&hl=ko" target="_blank" rel="noopener">트렌드 사이트</a>에서 각 그래프의 <b>⤓ 내보내기</b>로 받은 CSV(multiTimeline · relatedQueries · geoMap)를 여기에 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" accept=".csv,.txt" multiple hidden data-file="tr"></label>하세요</div>`;
    }
    return `<section class="sec" id="g-tr"><h2>구글 트렌드 <span class="muted" style="font-size:13px;font-weight:500">비공식 연결 · 막히면 CSV</span>${tr ? '<button class="btn sm" data-a="tr-retry" style="margin-left:auto">다시 불러오기</button>' : ''}</h2>${body}</section>`;
  }
  function drawTrendChart() {
    const el = document.getElementById('gTrChart');
    const tl = S.d.tr?.timeline;
    if (!el || !tl?.length || typeof lineChart !== 'function') return;
    const lab = (x) => { const d = new Date(x.t); return isNaN(d) ? x.label : `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`; };
    lineChart(el, { labels: tl.map(lab), series: [{ name: '관심도', values: tl.map((x) => x.v), color: '#1a73e8' }], height: 240, yFmt: (y) => Math.round(y), tipLabel: (l) => l });
  }

  function secKp() {
    const kp = S.d.kp;
    let body;
    if (!kp) body = loading;
    else if (kp.error) body = errBox(kp.error);
    else {
      const hit = kp.hit;
      const files = kp.files || [];
      const rel = kp.related || [];
      const anyRange = (hit && ranged(hit.avg)) || rel.some((r) => ranged(r.avg));
      body = `<div class="g-kp-stat">가져온 키워드 <b>${n0(kp.total)}</b>개${files.length ? ` · 최근 파일 ${esc(files[0].name)} (${esc(dt(files[0].at))}, ${n0(files[0].count)}개)` : ''}${kp.total ? ' <button class="btn sm" data-a="kp-clear">모두 지우기</button>' : ''}</div>
        ${hit ? `<div class="card" style="margin-top:10px"><h3>'${esc(hit.keyword)}' <span class="muted">월평균 ${vol(hit.avg) || '-'} · 경쟁 ${esc(hit.comp || '-')} · 입찰가 ${won(hit.bidLow, hit.currency)} ~ ${won(hit.bidHigh, hit.currency)}${hit.yoy ? ` · 전년 대비 ${esc(hit.yoy)}` : ''}</span></h3>
          ${hit.months?.length ? (hit.months.some((m) => ranged(m.v)) ? '<div class="muted">월별 값도 범위라 그래프는 생략했어요: ' + hit.months.map((m) => `${m.ym.slice(2).replace('-', '.')} ${vol(m.v)}`).join(' · ') + '</div>' : '<div class="g-chart" id="gKpChart"></div>') : '<div class="muted">이 파일에는 월별 검색량 칸이 없어요</div>'}</div>` : (kp.total ? `<div class="g-note">가져온 파일에 '${esc(S.kw)}'가 없어요. 키워드 플래너에서 이 키워드로 조회해서 다시 내려받아 주세요.</div>` : '')}
        ${rel.length ? `<div class="card" style="margin-top:10px"><h3><span>'${esc(S.kw)}'가 들어간 키워드 <span class="muted">${n0(kp.relatedTotal)}개${kp.relatedTotal > rel.length ? ` 중 ${rel.length}개` : ''}</span></span><span class="g-acts"><button class="btn sm" data-a="nv-kp">네이버 검색량 붙이기</button><button class="btn sm" data-a="txt-kp">TXT</button><button class="btn sm" data-a="csv-kp">CSV</button></span></h3>
          <div class="tbl-wrap"><table class="g-tbl"><thead><tr><th>키워드</th><th class="r">월평균 검색량</th><th>경쟁</th><th class="r">상단 입찰가</th><th class="r">네이버 검색량</th></tr></thead><tbody>
          ${rel.map((r) => `<tr><td><a href="#" class="g-run" data-run="${esc(r.keyword)}">${esc(r.keyword)}</a></td><td class="r">${vol(r.avg) || '-'}</td><td>${esc(r.comp || '-')}</td><td class="r">${r.bidLow != null || r.bidHigh != null ? `${won(r.bidLow, r.currency)} ~ ${won(r.bidHigh, r.currency)}` : '-'}</td><td class="r">${nvCell(r.keyword)}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}
        ${anyRange ? '<div class="g-note">검색량이 범위로 나와요. 광고비를 쓰지 않는 계정은 키워드 플래너가 범위로만 보여줘요. 같은 칸끼리는 크기를 가리기 어려우니 네이버 검색량을 같이 보세요.</div>' : ''}
        <div class="g-drop" data-drop="kp"><b>키워드 플래너 CSV를 여기에 끌어다 놓거나 <label class="ext" style="cursor:pointer">파일 선택<input type="file" accept=".csv,.tsv,.txt" multiple hidden data-file="kp"></label></b>
          <div class="muted" style="margin-top:4px">구글 광고(ads.google.com) › 도구 › 키워드 플래너 › [새 키워드 찾기] 또는 [검색량 및 예상 실적 조회하기] → 결과 오른쪽 위 <b>⤓ 다운로드</b> (.csv). 여러 번 넣으면 모아서 기억하고, 같은 키워드는 새 파일 값으로 바꿔요.</div></div>`;
    }
    return `<section class="sec" id="g-kp"><h2>키워드 플래너 <span class="muted" style="font-size:13px;font-weight:500">구글 광고 계정에서 내려받은 CSV · 무료</span></h2>${body}</section>`;
  }
  function drawKpChart() {
    const el = document.getElementById('gKpChart');
    const m = S.d.kp?.hit?.months;
    if (!el || !m?.length || typeof lineChart !== 'function') return;
    lineChart(el, { labels: m.map((x) => x.ym.slice(2).replace('-', '.')), series: [{ name: '검색량', values: m.map((x) => x.v.lo), color: '#1a73e8' }], height: 200 });
  }

  function secYt() {
    const yt = S.d.yt;
    let body;
    if (!yt) body = loading;
    else if (yt.missing) body = `<div class="card"><h3>${NA}<span class="muted">유튜브 API 키가 있으면 영상 수·상위 영상 조회수를 보여줘요 (무료 · 검색 하루 100회)</span></h3>
        <ol class="g-steps"><li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud 콘솔</a>에서 프로젝트를 하나 만들어요 (카드 등록 없이 돼요)</li><li>위 검색창에 <b>YouTube Data API v3</b> → [사용]</li><li>[사용자 인증 정보] → [+ 사용자 인증 정보 만들기] → <b>API 키</b> → 복사해서 아래에 붙여넣기</li></ol>
        <div class="g-keyrow"><input class="inp" id="gYtKey" placeholder="AIza로 시작하는 키" autocomplete="off"><button class="btn pri" data-a="yt-save">저장</button></div></div>`;
    else if (yt.error) body = errBox(yt.error) + '<div style="margin-top:6px"><button class="btn sm" data-a="yt-key">키 바꾸기</button></div>';
    else {
      const vs = yt.videos || [];
      const views = vs.map((x) => x.views).filter((x) => x != null);
      const avg = views.length ? views.reduce((s, x) => s + x, 0) / views.length : null;
      const yearAgo = Date.now() - 365 * 864e5;
      const fresh = vs.filter((x) => Date.parse(x.publishedAt) > yearAgo).length;
      body = `<div class="grid g3"><div class="card"><h3>검색 결과 <span class="muted">유튜브 추정치</span></h3><div class="g-big">${yt.total != null ? '약 ' + n0(yt.total) : '-'}</div></div>
          <div class="card"><h3>상위 10개 평균 조회수</h3><div class="g-big">${n0(avg)}</div></div>
          <div class="card"><h3>최근 1년 안에 올라온 영상</h3><div class="g-big">${fresh}<small>/${vs.length}</small></div><div class="muted">많을수록 지금 활발한 주제</div></div></div>
        <div class="tbl-wrap" style="margin-top:10px"><table class="g-tbl"><thead><tr><th>#</th><th>영상</th><th>채널</th><th class="r">조회수</th><th>올린 날</th></tr></thead><tbody>
        ${vs.map((x, i) => `<tr><td class="muted">${i + 1}</td><td><a class="ext" href="https://www.youtube.com/watch?v=${esc(x.id)}" target="_blank" rel="noopener">${esc(x.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'))}</a></td><td>${esc(x.channel)}</td><td class="r">${n0(x.views)}</td><td>${esc((x.publishedAt || '').slice(0, 10))}</td></tr>`).join('')}
        </tbody></table></div><div class="muted g-cap">${esc(new Date(yt.fetchedAt).toLocaleString('ko-KR'))} 기준 · 12시간 동안 저장해 두고 다시 써요 (검색 한도 아끼기)</div>`;
    }
    return `<section class="sec" id="g-yt"><h2>유튜브 <span class="muted" style="font-size:13px;font-weight:500">YouTube Data API · 무료</span></h2>${body}</section>`;
  }

  // ---------------------------------------------------------------- 버튼 · 파일
  function dl(text, name, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: type + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  const fname = (what, ext) => `구글_${what}_${S.kw.replace(/[\\/:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  async function attachNaver(list) {
    const need = [...new Set(list)].filter((k) => !S.nv[k]).slice(0, 300);
    if (!need.length) return toast('이미 붙였어요', 'info');
    toast(`네이버 검색량 ${need.length}개 조회 중…`, 'info');
    try {
      const j = await postJ('/api/volumes', { keywords: need });
      if (j.error) throw new Error(j.error);
      Object.assign(S.nv, j.volumes || {});
      drawAll();
      toast('네이버 검색량을 붙였어요', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
  function decode(buf) {
    const b = new Uint8Array(buf);
    if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
    // BOM 없는 UTF-16 (짝수 바이트가 거의 0)
    let z = 0; for (let i = 1; i < Math.min(b.length, 400); i += 2) if (b[i] === 0) z++;
    if (z > 60) return new TextDecoder('utf-16le').decode(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
  }
  async function importFiles(kind, files) {
    for (const f of files) {
      try {
        const text = decode(await f.arrayBuffer());
        if (kind === 'kp') {
          const j = await postJ('/api/google/planner', { text, name: f.name });
          if (j.error) throw new Error(j.error);
          toast(`${f.name}: 키워드 ${n0(j.count)}개 가져왔어요 (새로 ${n0(j.added)} · 바뀜 ${n0(j.updated)})${j.ranged ? ` · ${n0(j.ranged)}개는 범위` : ''}`, 'ok');
        } else {
          const j = await postJ('/api/google/trends-csv', { text, keyword: S.kw });
          if (j.error) throw new Error(j.error);
          toast(`${f.name}: ${j.got.map((x) => ({ timeline: '관심도 추이', related: '관련 검색어', regions: '지역' }[x] || x)).join(' · ')}를 가져왔어요`, 'ok');
        }
      } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
    }
    if (kind === 'kp') S.d.kp = await getJ(`/api/google/planner?keyword=${enc(S.kw)}`).catch((e) => ({ error: e.message }));
    else S.d.tr = await getJ(`/api/google/trends?keyword=${enc(S.kw)}`).catch((e) => ({ error: e.message }));
    drawAll();
  }
  function bind() {
    const R = $g('#gRes');
    R.querySelectorAll('[data-run]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); run(a.dataset.run); }));
    R.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: 'smooth' })));
    R.querySelectorAll('[data-file]').forEach((inp) => (inp.onchange = () => { importFiles(inp.dataset.file, [...inp.files]); inp.value = ''; }));
    R.querySelectorAll('[data-drop]').forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('on'); };
      z.ondragleave = () => z.classList.remove('on');
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove('on'); importFiles(z.dataset.drop, [...e.dataTransfer.files]); };
    });
    R.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a;
      const acList = (S.d.ac?.all || []).map((x) => x.keyword);
      const kpList = (S.d.kp?.related || []);
      if (a === 'deep') { b.disabled = true; b.textContent = '모으는 중… (10초쯤)'; const j = await getJ(`/api/google/suggest?keyword=${enc(S.kw)}&deep=1`).catch((e) => ({ error: e.message })); S.d.ac = j; drawAll(); }
      if (a === 'nv-ac') attachNaver(acList);
      if (a === 'txt-ac') dl(acList.join('\n'), fname('자동완성', 'txt'));
      if (a === 'copy-ac') { try { await navigator.clipboard.writeText(acList.join('\n')); toast('복사했어요', 'ok'); } catch { toast('복사하지 못했어요', 'err'); } }
      if (a === 'nv-kp') attachNaver(kpList.map((r) => r.keyword));
      if (a === 'txt-kp') dl(kpList.map((r) => r.keyword).join('\n'), fname('키워드플래너', 'txt'));
      if (a === 'csv-kp') { const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`; dl([['키워드', '월평균 검색량', '경쟁', '입찰가 낮음', '입찰가 높음', '통화', '네이버 검색량'], ...kpList.map((r) => [r.keyword, vol(r.avg) || '', r.comp, r.bidLow ?? '', r.bidHigh ?? '', r.currency, S.nv[r.keyword]?.total ?? ''])].map((r) => r.map(q).join(',')).join('\r\n'), fname('키워드플래너', 'csv'), 'text/csv'); }
      if (a === 'kp-clear') { if (!await uiConfirm('가져온 키워드 플래너 데이터를 모두 지울까요? (원래 CSV 파일은 그대로예요)')) return; await postJ('/api/google/planner', { clear: true }); S.d.kp = await getJ(`/api/google/planner?keyword=${enc(S.kw)}`); drawAll(); }
      if (a === 'tr-retry') { S.d.tr = null; drawAll(); S.d.tr = await getJ(`/api/google/trends?keyword=${enc(S.kw)}&force=1`).catch((e) => ({ error: e.message, errors: [e.message] })); drawAll(); }
      if (a === 'yt-save' || a === 'yt-key') {
        const val = a === 'yt-save' ? $g('#gYtKey')?.value.trim() : await uiPrompt('YouTube Data API 키', { placeholder: 'AIza로 시작하는 키', max: 100 });
        if (!val) return;
        try { const r = await postJ('/api/config', { youtubeKey: val }); if (r.error) throw new Error(r.error); } catch (e) { return toast('저장하지 못했어요: ' + e.message, 'err'); }
        toast('유튜브 키를 저장했어요', 'ok');
        S.d.yt = null; drawAll();
        S.d.yt = await getJ(`/api/google/youtube?keyword=${enc(S.kw)}`).catch((e) => ({ error: e.message })); drawAll();
      }
    }));
  }

  // ---------------------------------------------------------------- 보이기 (layout.js가 모드에 따라 부름)
  let shown = false; // 구글 화면을 실제로 띄운 적이 있을 때만 네이버 화면을 되돌림 (시작할 때 네이버 분석 탭 줄을 숨기지 않게)
  function show(on) {
    if (!on && !shown) { v.classList.add('hidden'); return; }
    shown = on;
    v.classList.toggle('hidden', !on);
    const main = document.getElementById('main');
    if (on) {
      main.classList.add('hidden'); document.getElementById('banners')?.classList.add('hidden'); document.getElementById('tabs')?.classList.add('hidden'); document.getElementById('kwSearch')?.classList.add('hidden');
      placeForm();
      if (S.kw) drawAll();
    } else {
      main.classList.remove('hidden'); document.getElementById('banners')?.classList.remove('hidden');
      try { document.getElementById('tabs')?.classList.toggle('hidden', !STATE); } catch {}
    }
  }
  addEventListener('themechange', () => { if (!v.classList.contains('hidden')) { drawTrendChart(); drawKpChart(); } });
  window.__G = { show, run, hist, get kw() { return S.kw; } };
  placeForm();
})();
