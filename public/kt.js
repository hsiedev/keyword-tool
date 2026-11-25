// 키워드 도구: 네이버 검색광고 키워드 도구와 같은 데이터 (연관 키워드 · 검색량 · 클릭 · 경쟁)
// 키워드 최대 5개 · 시즌 월 · 시즌 테마 · 광고 계정에 등록된 사이트 기준. 조회만 하고 광고 계정에는 아무것도 바꾸지 않음
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
  const toast = (m, t) => window.toast?.(m, t);
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

  // 네이버 공식 시즌 테마 코드 (searchad-apidoc seasonal_event_code)
  const THEMES = [
    [1, '생활', [[3, '가전'], [5, '장마'], [6, '난방/방한'], [7, '방충'], [8, '냉방'], [10, '유아/아동'], [12, '자동차'], [14, '취업'], [16, '수공예'], [17, '낚시'], [18, '원예'], [20, '영화/공연'], [22, '침구'], [23, '생활용품'], [86, '반려동물']]],
    [24, '건강', [[26, '건강']]],
    [27, '레저/스포츠', [[29, '프로야구'], [30, '등산'], [31, '스키/보드'], [32, '수상스포츠'], [33, '스포츠'], [34, '자전거']]],
    [35, '시기', [[37, '설'], [38, '추석'], [39, '스승의날'], [40, '어린이날'], [41, '화이트데이'], [42, '크리스마스'], [43, '발렌타인데이'], [44, '어버이날'], [45, '성년의날'], [46, '할로윈'], [47, '빼빼로데이'], [49, '축제/행사'], [50, '벚꽃'], [52, '봄'], [53, '가을'], [54, '겨울'], [55, '새해/운세'], [56, '연말'], [57, '여름']]],
    [58, '교육/학교', [[60, '졸업'], [61, '학원'], [62, '학교행사'], [63, '대입/수능'], [64, '교재/교구'], [65, '입학/개학'], [66, '과제']]],
    [67, '농업', [[69, '식물']]],
    [70, '음식/요리', [[72, '건강식품'], [73, '농산물/수산물'], [74, '음식점'], [75, '음식'], [76, '기호식품']]],
    [77, '패션/미용', [[79, '패션'], [80, '미용']]],
    [81, '여행', [[83, '여행'], [84, '캠핑'], [85, '피크닉']]],
  ];
  const THEME_NAME = Object.fromEntries(THEMES.flatMap(([id, n, kids]) => [[id, n + ' 전체'], ...kids.map(([k, kn]) => [k, kn])]));
  const COMP = { 높음: 3, 중간: 2, 낮음: 1 };
  const COLS = [
    ['keyword', '키워드', 'l'], ['from', '찾은 기준', 'l'],
    ['pc', 'PC'], ['mo', '모바일'], ['total', '합계'],
    ['pcClk', 'PC'], ['moClk', '모바일'], ['pcCtr', 'PC'], ['moCtr', '모바일'],
    ['comp', '경쟁'], ['adDepth', '노출 광고'],
  ];

  const S = {
    q: { hints: '', month: '', event: '', siteId: '', split: true },
    res: null, busy: false, sort: { key: 'total', dir: -1 }, show: 200, checked: new Set(),
    f: { inc: '', exc: '', min: '', max: '', comp: '', from: '', hideHint: false },
    channels: null,
  };
  let HIST = [];
  try { HIST = JSON.parse(localStorage.getItem('ktHistory') || '[]') || []; } catch {}
  try { Object.assign(S.q, JSON.parse(localStorage.getItem('ktQuery') || '{}')); } catch {}

  const api = async (p, body) => {
    const r = await fetch(p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '요청이 실패했어요 (' + r.status + ')');
    return j;
  };
  const hintList = (s) => [...new Set(String(s || '').split(/[,\n\t]+/).map((x) => x.replace(/\s+/g, '')).filter(Boolean))];

  // ---------------------------------------------------------------- 화면 틀
  function mount() {
    const v = document.createElement('div');
    v.id = 'ktView'; v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><aside class="side" id="ktSide"></aside><main class="ai-main kt-main"><div id="ktBody"></div></main></div>`;
    $('#main').after(v);
    drawBody(); drawSide();
  }
  const themeOptions = () => `<option value="">선택 안 함</option>${THEMES.map(([id, n, kids]) => `<optgroup label="${esc(n)}"><option value="${id}">${esc(n)} 전체</option>${kids.map(([k, kn]) => `<option value="${k}">${esc(kn)}</option>`).join('')}</optgroup>`).join('')}`;
  function drawBody() {
    const b = $('#ktBody');
    b.innerHTML = `
      <div class="page-head"><h2>키워드 도구</h2><p>네이버 검색광고 키워드 도구와 같은 데이터예요. 키워드 5개까지 한 번에, 시즌·내 사이트 기준으로도 연관 키워드를 찾아요.</p></div>
      <div class="card kt-q">
        <div class="kt-q-main">
          <label class="fl" for="ktHints"><span class="fl-t">키워드 <span class="muted" id="ktHintN"></span></span></label>
          <div class="kt-q-row">
            <input id="ktHints" class="inp kt-hints" placeholder="예: 신용카드추천, 체크카드발급, 카드혜택 (쉼표로 구분 · 최대 5개)" autocomplete="off">
            <button class="btn pri kt-go" id="ktGo">조회</button>
          </div>
          <div class="kt-chips" id="ktChips"></div>
        </div>
        <div class="kt-q-opts">
          <label class="fl"><span class="fl-t">시즌 월 <span class="muted">그 달에 많이 찾는 키워드</span></span>
            <select id="ktMonth" class="inp"><option value="">선택 안 함</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('')}</select></label>
          <label class="fl"><span class="fl-t">시즌 테마 <span class="muted">키워드 없이도 조회 가능</span></span>
            <select id="ktEvent" class="inp">${themeOptions()}</select></label>
          <label class="fl"><span class="fl-t">내 사이트 기준 <span class="muted">광고 계정에 등록된 사이트</span></span>
            <select id="ktSite" class="inp"><option value="">선택 안 함</option></select></label>
        </div>
        <label class="inl kt-split"><input type="checkbox" class="sw" id="ktSplit"> 키워드마다 따로도 조회 <span class="muted">결과가 더 많아지고, 어떤 키워드에서 나왔는지 보여줘요</span></label>
        <div class="kt-msg" id="ktMsg" role="status"></div>
      </div>
      <div id="ktRes"></div>`;
    $('#ktHints').value = S.q.hints || '';
    $('#ktMonth').value = S.q.month || '';
    $('#ktEvent').value = S.q.event || '';
    $('#ktSplit').checked = S.q.split !== false;
    const onHints = () => { S.q.hints = $('#ktHints').value; chips(); saveQ(); };
    $('#ktHints').oninput = onHints;
    $('#ktHints').onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(); } };
    $('#ktHints').onpaste = (e) => { // 엑셀 표나 줄바꿈 목록을 붙여넣으면 쉼표로 바꿈
      const t = e.clipboardData?.getData('text') || '';
      if (!/[\n\t]/.test(t)) return;
      e.preventDefault();
      const rows = window.XlsxLite?.clipRows?.(e.clipboardData);
      const list = rows && Math.max(...rows.map((r) => r.length)) > 1 ? (window.XlsxLite.pickKeywords(rows).list || []) : hintList(t);
      $('#ktHints').value = [...hintList($('#ktHints').value), ...list].join(', ');
      onHints();
    };
    $('#ktMonth').onchange = () => { S.q.month = $('#ktMonth').value; saveQ(); };
    $('#ktEvent').onchange = () => { S.q.event = $('#ktEvent').value; saveQ(); };
    $('#ktSite').onchange = () => { S.q.siteId = $('#ktSite').value; saveQ(); };
    $('#ktSite').onfocus = loadChannels;
    $('#ktSplit').onchange = () => { S.q.split = $('#ktSplit').checked; saveQ(); };
    $('#ktGo').onclick = run;
    chips(); fillChannels(); drawRes();
  }
  const saveQ = () => { try { localStorage.setItem('ktQuery', JSON.stringify(S.q)); } catch {} };
  function chips() {
    const l = hintList($('#ktHints').value);
    $('#ktHintN').textContent = l.length ? `${Math.min(l.length, 5)}/5` : '';
    $('#ktChips').innerHTML = l.length > 5 ? `<span class="kt-warn">키워드 도구는 한 번에 5개까지예요. 앞의 5개만 조회해요: ${esc(l.slice(5).join(', '))} 제외</span>` : '';
  }
  async function loadChannels() {
    if (S.channels) return;
    S.channels = [];
    try { S.channels = (await api('/api/kt/channels')).channels || []; } catch (e) { S.channels = []; S.chErr = e.message; }
    fillChannels();
  }
  function fillChannels() {
    const sel = $('#ktSite'); if (!sel) return;
    const cur = S.q.siteId || '';
    const list = S.channels || [];
    sel.innerHTML = `<option value="">선택 안 함</option>${list.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.url ? ' · ' + esc(c.url) : ''}</option>`).join('')}${S.channels && !list.length ? `<option value="" disabled>${esc(S.chErr ? '불러오지 못했어요: ' + S.chErr : '등록된 사이트가 없어요')}</option>` : ''}${cur && !list.some((c) => c.id === cur) ? `<option value="${esc(cur)}">저장된 사이트</option>` : ''}`;
    sel.value = cur;
  }

  // ---------------------------------------------------------------- 조회
  async function run() {
    if (S.busy) return;
    const hints = hintList($('#ktHints').value).slice(0, 5);
    const q = { hints, month: $('#ktMonth').value, event: $('#ktEvent').value, siteId: $('#ktSite').value, split: $('#ktSplit').checked };
    if (!hints.length && !q.event && !q.siteId) { msg('키워드를 넣거나, 시즌 테마·내 사이트 중 하나를 골라 주세요.', true); $('#ktHints').focus(); return; }
    S.busy = true; $('#ktGo').disabled = true;
    msg(`<span class="spin"></span> 네이버 키워드 도구에서 찾는 중${q.split && hints.length > 1 ? ` (키워드 ${hints.length}개 각각 + 함께)` : ''}...`, false, true);
    try {
      const r = await api('/api/kt/query', q);
      S.res = { ...r, q, at: Date.now() };
      S.checked.clear(); S.show = 200; S.f.from = '';
      remember(q, r.rows.length);
      msg(r.errors?.length ? `일부는 조회하지 못했어요: ${r.errors.join(' / ')}` : '', !!r.errors?.length);
      drawRes();
      $('#ktRes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { msg(e.message, true); }
    finally { S.busy = false; $('#ktGo').disabled = false; }
  }
  const msg = (t, err, html) => { const m = $('#ktMsg'); if (!m) return; m.className = 'kt-msg' + (err ? ' err' : ''); m[html ? 'innerHTML' : 'textContent'] = t || ''; };
  const label = (q) => [q.hints?.length ? q.hints.join(', ') : '', q.month ? q.month + '월' : '', q.event ? THEME_NAME[q.event] : '', q.siteId ? '내 사이트' : ''].filter(Boolean).join(' · ');
  function remember(q, n) {
    const key = JSON.stringify([q.hints, q.month, q.event, q.siteId]);
    HIST = [{ q, n, at: Date.now(), key }, ...HIST.filter((h) => h.key !== key)].slice(0, 40);
    try { localStorage.setItem('ktHistory', JSON.stringify(HIST)); } catch {}
    drawSide();
  }
  function drawSide() {
    const side = $('#ktSide'); if (!side) return;
    side.innerHTML = `<button class="btn pri newbtn" id="ktNew">+ 새 조회</button><div class="side-h">최근 조회</div>${HIST.length ? HIST.map((h, i) => `<div class="sit" data-i="${i}" title="다시 조회 (12시간 안이면 바로 나와요)"><div class="sn"><span>${esc(label(h.q) || '조회')}</span></div><div class="sm">${num(h.n)}개 · ${new Date(h.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</div></div>`).join('') : '<div class="muted" style="padding:6px 10px">조회할 때마다 여기 쌓여요</div>'}`;
    $('#ktNew').onclick = reset;
    $$('[data-i]', side).forEach((el) => (el.onclick = () => {
      const h = HIST[+el.dataset.i]; if (!h) return;
      Object.assign(S.q, { hints: (h.q.hints || []).join(', '), month: h.q.month || '', event: h.q.event || '', siteId: h.q.siteId || '', split: h.q.split !== false });
      saveQ(); drawBody(); run();
    }));
  }
  function reset() {
    if (S.busy) return '조회 중이에요';
    Object.assign(S.q, { hints: '', month: '', event: '', siteId: '' });
    S.res = null; S.checked.clear(); S.f = { inc: '', exc: '', min: '', max: '', comp: '', from: '', hideHint: false };
    saveQ(); drawBody(); $('#ktHints')?.focus();
    return '초기화했어요 (지난 조회는 왼쪽에 있어요)';
  }

  // ---------------------------------------------------------------- 결과
  function rows() {
    if (!S.res) return [];
    const f = S.f, inc = hintList(f.inc).map(norm), exc = hintList(f.exc).map(norm);
    const min = f.min === '' ? null : Number(f.min), max = f.max === '' ? null : Number(f.max);
    let list = S.res.rows.filter((r) => {
      const k = norm(r.keyword);
      if (f.hideHint && r.hint) return false;
      if (inc.length && !inc.some((w) => k.includes(w))) return false;
      if (exc.some((w) => k.includes(w))) return false;
      if (min != null && r.total < min) return false;
      if (max != null && r.total > max) return false;
      if (f.comp && r.comp !== f.comp) return false;
      if (f.from && !(r.from || []).includes(f.from)) return false;
      return true;
    });
    const { key, dir } = S.sort;
    const val = (r) => (key === 'comp' ? COMP[r.comp] || 0 : key === 'keyword' ? r.keyword : key === 'from' ? (r.from || []).join(',') : Number(r[key]) || 0);
    list = list.slice().sort((a, b) => (b.hint - a.hint) || (typeof val(a) === 'string' ? val(a).localeCompare(val(b), 'ko') * dir : (val(a) - val(b)) * dir));
    return list;
  }
  const lowTxt = (n, low) => (low ? '<span class="muted">&lt; 10</span>' : num(n));
  function drawRes() {
    const box = $('#ktRes'); if (!box) return;
    if (!S.res) { box.innerHTML = `<div class="card kt-empty"><b>이렇게 써 보세요</b><ul><li>대표 키워드 2~5개를 함께 넣으면 서로 겹치는 연관 키워드까지 한 표로 볼 수 있어요.</li><li>'크리스마스' 테마나 '12월'을 고르면 그 시즌에 많이 찾는 키워드가 나와요. 키워드와 같이 쓰면 시즌에 맞춰 좁혀져요.</li><li>결과에서 고른 키워드는 대량 분석이나 AI 키워드 생성기로 바로 보낼 수 있어요.</li></ul></div>`; return; }
    const all = S.res.rows, list = rows(), shown = list.slice(0, S.show);
    const sum = (k) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const hints = S.res.hints || [];
    const sel = [...S.checked].filter((k) => all.some((r) => r.keyword === k));
    const arrow = (k) => (S.sort.key === k ? (S.sort.dir < 0 ? ' ▼' : ' ▲') : '');
    box.innerHTML = `
      <div class="kt-sum">
        <div><span>연관 키워드</span><b>${num(all.length)}</b></div>
        <div><span>필터 후</span><b>${num(list.length)}</b></div>
        <div><span>월간 검색량 합계</span><b>${num(sum('total'))}</b></div>
        <div><span>경쟁 높음</span><b>${num(list.filter((r) => r.comp === '높음').length)}</b></div>
      </div>
      <div class="card kt-resc">
        <div class="kt-head"><div><b>${esc(label(S.res.q))}</b> <span class="muted">${new Date(S.res.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 조회 · 최근 30일 기준</span></div></div>
        <div class="kt-filters">
          <label>포함 <input class="inp" id="kfInc" placeholder="예: 추천, 발급" value="${esc(S.f.inc)}"></label>
          <label>제외 <input class="inp" id="kfExc" placeholder="예: 해지, 분실" value="${esc(S.f.exc)}"></label>
          <label>월간 검색량 <input class="inp kf-n" id="kfMin" type="number" min="0" placeholder="최소" value="${esc(S.f.min)}"> ~ <input class="inp kf-n" id="kfMax" type="number" min="0" placeholder="최대" value="${esc(S.f.max)}"></label>
          <div class="seg" id="kfComp">${['', '높음', '중간', '낮음'].map((c) => `<button type="button" data-c="${c}" class="${S.f.comp === c ? 'on' : ''}">${c || '경쟁 전체'}</button>`).join('')}</div>
          ${hints.length > 1 && S.res.q.split ? `<label>찾은 기준 <select class="inp" id="kfFrom"><option value="">전체</option>${hints.map((h) => `<option ${S.f.from === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>` : ''}
          <label class="inl"><input type="checkbox" class="sw" id="kfHide" ${S.f.hideHint ? 'checked' : ''}> 입력 키워드 숨기기</label>
          ${S.f.inc || S.f.exc || S.f.min || S.f.max || S.f.comp || S.f.from || S.f.hideHint ? '<button type="button" class="ext" id="kfClear">필터 지우기</button>' : ''}
        </div>
        <div class="kt-acts">
          <span class="kt-target">${sel.length ? `<b>체크한 ${num(sel.length)}개</b>` : `체크 없음 → <b>필터 결과 ${num(list.length)}개</b>`}에</span>
          <button class="btn pri" id="ktToBulk">대량 분석으로</button>
          <button class="btn" id="ktToAi">AI 생성기 참고 키워드로</button>
          <button class="btn" id="ktCopy">복사</button>
          <span style="flex:1"></span>
          <button class="btn" id="ktTxt">TXT</button>
          <button class="btn" id="ktXlsx">엑셀</button>
        </div>
        <div class="tbl-wrap kt-tbl"><table class="rel" id="ktTbl">
          <thead><tr class="kt-grp"><th rowspan="2" class="ck"><input type="checkbox" id="ktAll" title="보이는 키워드 전체 선택 · 다시 누르면 해제"></th><th rowspan="2">#</th><th rowspan="2" class="l s" data-s="keyword">키워드${arrow('keyword')}</th>${hints.length > 1 && S.res.q.split ? `<th rowspan="2" class="l s" data-s="from">찾은 기준${arrow('from')}</th>` : ''}<th colspan="3">월간 검색량</th><th colspan="2">월평균 클릭수</th><th colspan="2">월평균 클릭률</th><th rowspan="2" class="s" data-s="comp">경쟁${arrow('comp')}</th><th rowspan="2" class="s" data-s="adDepth" title="월평균 노출 광고 수">노출 광고${arrow('adDepth')}</th></tr>
          <tr>${['pc', 'mo', 'total', 'pcClk', 'moClk', 'pcCtr', 'moCtr'].map((k) => `<th class="s" data-s="${k}">${COLS.find((c) => c[0] === k)[1]}${arrow(k)}</th>`).join('')}</tr></thead>
          <tbody>${shown.map((r, i) => `<tr class="${r.hint ? 'kt-hint' : ''}${S.checked.has(r.keyword) ? ' sel' : ''}"><td class="ck"><input type="checkbox" data-k="${esc(r.keyword)}" ${S.checked.has(r.keyword) ? 'checked' : ''}></td><td class="muted">${i + 1}</td><td class="l kwc"><a href="#" data-go="${esc(r.keyword)}">${esc(r.keyword)}</a>${r.hint ? ' <span class="kt-badge">입력</span>' : ''}</td>${hints.length > 1 && S.res.q.split ? `<td class="l kt-from">${(r.from || []).length ? r.from.map((h) => `<span class="chip">${esc(h)}</span>`).join(' ') : '<span class="muted">함께</span>'}</td>` : ''}<td>${lowTxt(r.pc, r.pcLow)}</td><td>${lowTxt(r.mo, r.moLow)}</td><td><b>${num(r.total)}</b></td><td>${r.pcClk}</td><td>${r.moClk}</td><td>${r.pcCtr}%</td><td>${r.moCtr}%</td><td><span class="comp c${COMP[r.comp] || 0}">${esc(r.comp)}</span></td><td>${r.adDepth}</td></tr>`).join('') || `<tr><td colspan="14" class="muted" style="padding:28px">필터에 맞는 키워드가 없어요</td></tr>`}</tbody></table></div>
        ${list.length > shown.length ? `<div class="kt-more"><button class="btn" id="ktMore">${num(Math.min(200, list.length - shown.length))}개 더 보기</button> <span class="muted">${num(shown.length)} / ${num(list.length)}개 표시</span></div>` : ''}
        <p class="muted kt-note">검색량은 네이버 키워드 도구의 최근 30일 값이에요. '&lt; 10'은 10회 미만(합계는 5로 계산). 클릭수·클릭률은 광고 기준 평균이에요. 키워드를 누르면 키워드 분석으로 열려요.</p>
      </div>`;
    bindRes(list);
  }
  function bindRes(list) {
    let t = 0;
    const later = (fn) => { clearTimeout(t); t = setTimeout(fn, 250); };
    const keep = (id, fn) => { const el = $(id); if (!el) return; el.oninput = () => later(() => { fn(el); const pos = el.selectionStart; drawRes(); const n = $(id); n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }); };
    keep('#kfInc', (el) => (S.f.inc = el.value)); keep('#kfExc', (el) => (S.f.exc = el.value));
    keep('#kfMin', (el) => (S.f.min = el.value)); keep('#kfMax', (el) => (S.f.max = el.value));
    $$('#kfComp button').forEach((b) => (b.onclick = () => { S.f.comp = b.dataset.c; drawRes(); }));
    if ($('#kfFrom')) $('#kfFrom').onchange = (e) => { S.f.from = e.target.value; drawRes(); };
    $('#kfHide').onchange = (e) => { S.f.hideHint = e.target.checked; drawRes(); };
    if ($('#kfClear')) $('#kfClear').onclick = () => { S.f = { inc: '', exc: '', min: '', max: '', comp: '', from: '', hideHint: false }; drawRes(); };
    $$('#ktTbl th[data-s]').forEach((th) => (th.onclick = () => { const k = th.dataset.s; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : k === 'keyword' || k === 'from' ? 1 : -1 }; drawRes(); }));
    $$('#ktTbl input[data-k]').forEach((c) => (c.onchange = () => { if (c.checked) S.checked.add(c.dataset.k); else S.checked.delete(c.dataset.k); c.closest('tr').classList.toggle('sel', c.checked); acts(list); }));
    const vis = $$('#ktTbl input[data-k]').map((c) => c.dataset.k);
    $('#ktAll').checked = vis.length > 0 && vis.every((k) => S.checked.has(k));
    $('#ktAll').onchange = () => { const on = !vis.every((k) => S.checked.has(k)); vis.forEach((k) => (on ? S.checked.add(k) : S.checked.delete(k))); drawRes(); };
    $$('#ktTbl [data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.__LAYOUT?.go('analyze'); window.run?.(a.dataset.go); scrollTo({ top: 0 }); }));
    if ($('#ktMore')) $('#ktMore').onclick = () => { S.show += 200; drawRes(); };
    const pick = () => { const sel = list.filter((r) => S.checked.has(r.keyword)); return (sel.length ? sel : list).map((r) => r.keyword); };
    $('#ktToBulk').onclick = () => {
      const l = pick(); if (!l.length) return toast('보낼 키워드가 없어요', 'warn');
      if (!window.__BULK?.setInput) return toast('대량 분석 화면을 불러오지 못했어요', 'warn');
      window.__LAYOUT?.go('bulk');
      window.__BULK.setInput(l, `키워드 도구에서 ${num(l.length)}개를 넣었어요. [분석 시작]을 누르면 입찰가·블로그 발행량까지 조회해요.`);
    };
    $('#ktToAi').onclick = () => {
      const l = pick(); if (!l.length) return toast('보낼 키워드가 없어요', 'warn');
      if (!window.__AI?.openDirectBrief((S.res.hints || []).join(', ') + ' 관련 검색광고 키워드', l)) return;
      window.__LAYOUT?.go('ai');
      toast(`AI 생성기 새 탭에 참고 키워드 ${Math.min(30, l.length)}개를 넣었어요. 브리프를 다듬고 생성해 보세요.`, 'ok');
    };
    $('#ktCopy').onclick = async () => { const l = pick(); try { await navigator.clipboard.writeText(l.join('\n')); toast(`${num(l.length)}개를 복사했어요`, 'ok'); } catch { toast('복사하지 못했어요', 'warn'); } };
    const fname = () => `키워드도구_${(S.res.hints || [])[0] || 'theme'}_${new Date().toISOString().slice(0, 10)}`;
    const dl = (blob, ext) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname() + '.' + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    $('#ktTxt').onclick = () => dl(new Blob(['\ufeff' + pick().join('\r\n')], { type: 'text/plain;charset=utf-8' }), 'txt');
    $('#ktXlsx').onclick = () => {
      const keys = new Set(pick()), src = list.filter((r) => keys.has(r.keyword));
      const head = ['키워드', '찾은 기준', 'PC 검색량', '모바일 검색량', '합계', 'PC 클릭수', '모바일 클릭수', 'PC 클릭률(%)', '모바일 클릭률(%)', '경쟁', '노출 광고 수'];
      const data = src.map((r) => [r.keyword, (r.from || []).join(', ') || (r.hint ? '입력' : ''), r.pcLow ? '< 10' : r.pc, r.moLow ? '< 10' : r.mo, r.total, r.pcClk, r.moClk, r.pcCtr, r.moCtr, r.comp, r.adDepth]);
      dl(window.XlsxLite.writeXlsx([{ name: '키워드 도구', rows: [head, ...data], widths: [26, 18, 11, 11, 11, 10, 10, 10, 10, 8, 10] }]), 'xlsx');
    };
  }
  function acts(list) {
    const el = $('.kt-target'); if (!el) return;
    const n = list.filter((r) => S.checked.has(r.keyword)).length;
    el.innerHTML = n ? `<b>체크한 ${num(n)}개</b>에` : `체크 없음 → <b>필터 결과 ${num(list.length)}개</b>에`;
  }

  // ---------------------------------------------------------------- 표시 전환
  function showKt(on) {
    const v = $('#ktView'); if (!v) return;
    if (on) {
      $('#aiView')?.classList.add('hidden'); window.__hideDup?.(); window.__hideBulk?.(); window.__hideCopy?.(); window.__hideMock?.(); window.__hidePl?.(); window.__BID?.hide();
      $('#main').classList.add('hidden'); $('#banners')?.classList.add('hidden'); $('#tabs')?.classList.add('hidden');
      history.replaceState(null, '', location.pathname + location.search + '#kt');
    }
    v.classList.toggle('hidden', !on);
  }
  window.__KTV = {
    show: () => showKt(true),
    hide: () => {
      const v = $('#ktView'); if (!v || v.classList.contains('hidden')) return;
      v.classList.add('hidden');
      $('#main').classList.remove('hidden'); $('#banners')?.classList.remove('hidden');
      try { $('#tabs').classList.toggle('hidden', !STATE); } catch {}
      if (location.hash === '#kt') history.replaceState(null, '', location.pathname + location.search);
    },
  };
  window.__RESET_kt = reset;
  // 다른 화면에서 키워드를 들고 들어오기 (분석 화면 [키워드 도구로])
  window.__KT_OPEN = (hints) => {
    const l = (Array.isArray(hints) ? hints : [hints]).map((x) => String(x || '').replace(/\s+/g, '')).filter(Boolean);
    if (!l.length) return;
    window.__LAYOUT?.go('kt');
    S.q.hints = [...new Set([...l, ...hintList(S.q.hints)])].slice(0, 5).join(', ');
    saveQ(); drawBody(); $('#ktHints').focus();
    toast('키워드 도구에 넣었어요. 함께 볼 키워드를 4개까지 더 넣고 [조회]를 누르세요.', 'ok');
  };
  document.getElementById('toKt')?.addEventListener('click', () => { try { window.__KT_OPEN(STATE?.keyword); } catch {} });
  mount();
})();
