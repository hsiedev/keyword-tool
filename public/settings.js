// 설정 > 화면·커스텀, 규칙·알고리즘
// 값은 분석기 폴더의 data\settings.json에 저장돼요 (서버가 읽어서 분석·생성·재검증에 사용, 화면도 같은 값 사용)
(function () {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DEF = () => window.SETTINGS_DEFAULTS || {};
  let DRAFT = null;
  let dirty = false;

  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setP(o, path, v) {
    const ks = path.split('.');
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]];
    a[ks[ks.length - 1]] = v;
  }
  const ensure = () => { if (!DRAFT) DRAFT = clone(window.SETTINGS || DEF()); };

  // ---------------------------------------------------------------- 입력 컨트롤
  const num = (path, opt = {}) => `<input type="number" data-p="${path}" data-t="num" value="${esc(getP(DRAFT, path))}" ${opt.min != null ? `min="${opt.min}"` : ''} ${opt.max != null ? `max="${opt.max}"` : ''} step="${opt.step || 1}">`;
  const txt = (path, ph = '') => `<input type="text" data-p="${path}" data-t="text" value="${esc(getP(DRAFT, path))}" placeholder="${esc(ph)}">`;
  const area = (path, rows = 4, ph = '') => `<textarea data-p="${path}" data-t="text" rows="${rows}" placeholder="${esc(ph)}">${esc(getP(DRAFT, path))}</textarea>`;
  const chk = (path, label) => `<label class="inl"><input type="checkbox" data-p="${path}" data-t="bool" ${getP(DRAFT, path) ? 'checked' : ''}> ${label}</label>`;
  const sel = (path, opts) => `<select data-p="${path}" data-t="${typeof getP(DEF(), path) === 'number' ? 'num' : 'text'}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(getP(DRAFT, path)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const bands = (path, labels) => labels.map((l, i) => `${i ? '' : ''}<span class="muted" style="font-size:12px">${esc(l)}</span> ${num(`${path}.${i}`, { min: 0, step: 'any' })}`).join(' ');
  const row = (label, html, note) => `<div class="set-row"><span>${label}</span>${html}${note ? `<span class="muted" style="font-size:12px">${note}</span>` : ''}</div>`;
  const sec = (id, title, how, body) => `<div class="set-sec" data-sec="${id}"><h4>${title}${id ? `<a href="#" class="ext reset" data-reset="${id}">기본값으로</a>` : ''}</h4>${how ? `<div class="how">${how}</div>` : ''}${body || ''}</div>`;

  // ---------------------------------------------------------------- 화면 · 커스텀
  function renderUI() {
    const hb = new Set(DRAFT.ui.hideButtons || []);
    const ACC = [['#16a34a', '초록'], ['#2563eb', '파랑'], ['#7c3aed', '보라'], ['#db2777', '분홍'], ['#ea580c', '주황'], ['#0f766e', '청록'], ['#334155', '회색']];
    return `
      ${sec('ui', '화면', '바꾼 값은 [저장]을 누르면 바로 적용돼요. 이 PC의 분석기 폴더에 저장돼서 다른 브라우저로 열어도 같아요.', `
        ${row('테마', `<span class="theme-seg">${[['light', '라이트'], ['dark', '다크'], ['system', '시스템 설정 따라가기']].map(([v, l]) => `<button type="button" data-theme-opt="${v}" class="${(localStorage.getItem('theme') || 'light') === v ? 'on' : ''}">${l}</button>`).join('')}</span>`, '바로 적용돼요 (이 브라우저에 저장)')}
        ${row('사이트 이름', txt('ui.brand', '키워드 분석기'))}
        ${row('강조 색', `<input type="color" data-p="ui.accent" data-t="text" value="${esc(DRAFT.ui.accent)}"> ${ACC.map(([c, n]) => `<button type="button" class="acc" data-acc="${c}" title="${n}" style="background:${c}"></button>`).join('')}`)}
        ${row('화면 배율', sel('ui.zoom', [[80, '80%'], [90, '90%'], [100, '100% (기본)'], [110, '110%'], [120, '120%'], [130, '130%']]))}
        ${row('표 간격', sel('ui.density', [['compact', '촘촘하게'], ['normal', '보통'], ['roomy', '넓게']]))}
        ${row('숫자 표기', sel('ui.numberStyle', [['short', '줄여서 (12.5만)'], ['full', '전체 (125,000)']]), '콘텐츠 발행량 등')}
      `)}
      ${sec('', '시작 화면 · 상단 버튼', '', `
        ${row('처음 열 때 보여줄 화면', sel('ui.startView', [['analyze', '키워드 분석'], ['ai', 'AI 키워드 생성기'], ['dup', '키워드 중복 검사'], ['bulk', '대량 분석']]), '주소에 #ai 같은 표시가 있으면 그 화면이 우선이에요')}
        ${row('숨길 상단 버튼', [['ai', 'AI 키워드 생성기'], ['dup', '키워드 중복 검사'], ['bulk', '대량 분석'], ['hist', '검색 기록']].map(([k, l]) => `<label class="inl"><input type="checkbox" data-hide="${k}" ${hb.has(k) ? 'checked' : ''}> ${l}</label>`).join(' '))}
      `)}
      ${sec('', '표', '', `
        ${row('연관 키워드 한 페이지 행 수', sel('ui.relPage', [[30, '30'], [50, '50 (기본)'], [100, '100'], [200, '200']]))}
        ${row('대량 분석 한 페이지 행 수', sel('ui.bulkPage', [[50, '50'], [100, '100 (기본)'], [200, '200'], [500, '500']]))}
      `)}
      ${sec('', '설정 백업', `화면과 규칙 설정 전체를 파일로 내보내거나 다시 불러올 수 있어요. API 키는 포함되지 않아요.${window.SETTINGS_FILE ? `<br>저장 위치: ${esc(window.SETTINGS_FILE)}` : ''}`, `
        <div class="set-row"><button type="button" class="btn" id="setExport">설정 내보내기 (JSON)</button>
          <label class="btn" style="cursor:pointer">설정 불러오기<input type="file" id="setImport" accept=".json" hidden></label>
          <button type="button" class="btn danger-btn" id="setResetAll">화면·규칙 모두 기본값으로</button></div>
      `)}`;
  }

  // ---------------------------------------------------------------- 규칙 · 알고리즘
  function renderRules() {
    const A = 'rules.analysis', G = 'rules.generate', V = 'rules.verify', D = 'rules.dedup';
    return `
      <div class="muted" style="margin:8px 0 2px;line-height:1.7">각 기능이 어떤 원리로 계산되는지와, 바꿀 수 있는 기준이에요. 입력칸이 있는 값은 [저장]하면 바로 계산에 반영돼요. (회색 상자는 설명, 바꿀 수 없는 부분)</div>

      <h3 class="set-h">① 키워드 분석</h3>
      ${sec('', '월간 검색량 · 광고 지표', `네이버 <b>검색광고 API의 키워드 도구</b>가 주는 최근 30일 PC·모바일 검색수를 그대로 써요. 네이버는 10 미만을 숫자 없이 "&lt;10"으로만 알려줘요. 월평균 클릭수·클릭률·경쟁 정도·노출 광고수도 같은 응답에서 와요. 순위별 입찰가는 <b>평균 입찰가 추정 API</b>의 파워링크 1~5위 최근 4주 평균(VAT 제외)이에요.`)}
      ${sec('', '트렌드 · 이번 달 예상 검색량', `데이터랩은 최고점을 100으로 둔 <b>상대 지수</b>만 줘요. 그래서 최근 400일 일별 지수의 <b>최근 30일 합이 월간 검색량과 같아지도록</b> 비율을 곱해 일별 검색량을 추정해요.<br>
        · 이번 달 예상 = 1일~어제 누적 + 최근 7일 하루 평균 × 남은 일수<br>
        · 월별 추이 = 2016년부터의 월간 지수를 일별 데이터로 덮이는 최근 달에 맞춰 환산<br>
        · 월별 검색 비율 = 최근 3년 같은 달 평균 / 요일별 비율 = 최근 52주 합계<br>
        · 키워드 최초 등장 = 월간 지수가 처음 0보다 커진 달 (2016년 1월부터면 "이전")<br>
        · 전년 대비 = 최근 3개월 지수 합 ÷ 1년 전 같은 3개월`)}
      ${sec('', '콘텐츠 발행량', `네이버 <b>검색 API</b>의 블로그·카페 검색 결과 총 개수(누적)예요. 최근 30일 블로그 발행량은 최신순 100개 글의 날짜 분포로 추정해요.`)}
      ${sec('sat', '콘텐츠 포화 지수', `발행량 ÷ 월간 검색량 × 100(%). 아래 경계로 구간 이름을 붙여요. (키워드 분석·대량 분석 공통)`,
        row('구간 경계 (%)', bands(`${A}.satBands`, ['매우 낮음 <', '낮음 <', '보통 <', '높음 <'])))}
      ${sec('grade', '키워드 등급 (S~D)', `월간 검색량이 최소값보다 적으면 D. 아니면 <b>블로그 누적 발행량 ÷ 월간 검색량</b> 비율로 매겨요. 낮을수록 경쟁이 적은 키워드예요.`,
        row('최소 월간 검색량', num(`${A}.gradeMinVol`, { min: 0 })) + row('비율 경계', bands(`${A}.gradeBands`, ['S <', 'A <', 'B <', 'C <']), '그 이상은 D'))}
      ${sec('issue', '이슈성', `점수 = 최근 12개월 월간 지수의 변동계수 × 110 + max(0, 최근 90일 최고점 ÷ 중앙값 − 1.5) × 8 (0~100으로 자름). 꾸준히 찾는 키워드는 낮고, 한때 확 튀는 키워드는 높아요.`,
        row('점수 경계', bands(`${A}.issueBands`, ['매우 낮음 <', '낮음 <', '보통 <', '높음 <'])))}
      ${sec('comm', '정보성 / 상업성', `점수(0~100) = 경쟁 정도(높음 35 · 중간 20 · 낮음 5) + 노출 광고수(15개면 25점) + 평균 클릭률(3%면 15점) + 구매 의도 단어가 있으면 가점 − 정보 탐색 단어가 있으면 감점.`,
        row('구매 의도 단어 (쉼표 구분)', '') + area(`${A}.commercialWords`, 3) +
        row('정보 탐색 단어 (쉼표 구분)', '') + area(`${A}.infoWords`, 3) +
        row('구매 단어 가점', num(`${A}.commercialBonus`, { min: 0, max: 100 })) + row('정보 단어 감점', num(`${A}.infoPenalty`, { min: 0, max: 100 })) +
        row('구간 경계', bands(`${A}.commercialBands`, ['정보성 우세 <', '혼합 <', '상업성 우세 <']), '그 이상은 상업성 강함'))}
      ${sec('', '섹션 분석', `로그아웃 상태의 네이버 통합검색(PC·모바일) 결과 HTML을 받아, 섹션마다 붙은 표시(파워링크, AI 브리핑, 웹사이트, 이미지 등)를 위에서부터 순서대로 읽어요. 1시간 동안 저장해 두고 다시 써요. 로그인 상태나 시간에 따라 실제 화면과 다를 수 있어요.`)}

      <h3 class="set-h">② AI 키워드 생성</h3>
      ${sec('gen', 'AI에 보내는 지시와 생성 후 처리', `AI에게 <b>주제 · 예시 · 요청 사항 · 개수 · 글자 수 범위 · 기존 키워드(최대 2,000개) · 이미 받은 결과 · 제외 목록(사유 포함)</b>을 함께 보내요. 받은 뒤에는 PC에서 순서대로 처리해요:<br>
        띄어쓰기 처리 → 글자 수 범위 밖 제외 → 제외 목록과 같은 것 제외 → 기존 키워드와 같은 것 제외 → 예시·결과와 겹치는 것 제외 → 중복 등급 표시 → 검색량 자동 조회.<br>
        아래 "역할"과 "생성 규칙"은 AI에 보내는 문장 그대로예요. 글자 수 범위, 의도·이유 형식, 제외 목록 안내는 자동으로 붙어요.`,
        row('AI 역할 (시스템 지시)', '') + area(`${G}.system`, 3) +
        row('생성 규칙 (한 줄에 하나)', '') + area(`${G}.rules`, 6) +
        row('띄어쓰기', chk(`${G}.noSpace`, '모든 키워드를 띄어쓰기 없이 붙이기 (AI 지시 + PC에서 한 번 더)')) +
        row('창의성 (temperature)', num(`${G}.temperature`, { min: 0, max: 2, step: 0.1 }), 'Gemini에만 적용, 높을수록 다양함'))}

      ${sec('banned', '금지 키워드', '네이버 · 구글 광고에서 검수 거절되거나 쓰면 안 되는 단어를 적어 두세요. AI 키워드 생성기에서 켜 둔 목록은 <b>제외할 것(Negative)</b>에 자동으로 더해져요: AI에게 쓰지 말라고 알려주고, 이 단어가 들어간 키워드는 결과에서 PC가 바로 빼요. 생성기 화면에서 탭마다 네이버 · 구글을 켜고 끌 수 있어요.',
        row('네이버 금지 키워드', '<span class="muted" style="font-size:12px">쉼표나 줄바꿈으로 구분</span>') + area('rules.banned.naver', 5, '예: 도박, 카지노, 불법대출') +
        row('구글 금지 키워드', '<span class="muted" style="font-size:12px">쉼표나 줄바꿈으로 구분</span>') + area('rules.banned.google', 5, '예: 도박, 카지노') +
        row('새 탭 기본값', chk('rules.banned.naverOn', '네이버 켜기') + ' ' + chk('rules.banned.googleOn', '구글 켜기'), 'AI 생성기에서 새 탭을 만들 때'))}

      <h3 class="set-h">③ 조건 재검증 <span class="muted" style="font-size:12px;font-weight:500">AI 생성기 · 대량 분석 공통</span></h3>
      ${sec('verify', '판정 방식', `누를 때마다 AI가 <b>이전 판정을 모른 채</b> 탭의 주제·예시·요청 사항으로 다시 판정해요. 키워드마다 월간 검색량을 같이 보여주고(아래 설정), <b>최소 월간 검색량 미만은 PC가 정확히 계산해 부적합으로 덮어써요.</b> 글자 수 범위도 PC가 따로 확인해요. 판정은 쌓이고, 정해진 횟수 이상 모두 적합이면 "일관 적합", 모두 부적합이면 "일관 부적합", 섞이면 "엇갈림"이에요. 부적합으로 지운 키워드는 탭의 제외 목록에 들어가 다음 생성에서 빠져요.`,
        row('판정 기준 (한 줄에 하나, 하나라도 어기면 부적합)', '') + area(`${V}.criteria`, 4) +
        row('검색량 참고', chk(`${V}.useVolume`, 'AI에게 월간 검색량을 같이 보여주기')) +
        row('"일관" 판정에 필요한 횟수', num(`${V}.consistN`, { min: 1, max: 10 })) +
        row('네이버 "<10"을 몇으로 계산', num(`${V}.lowAs`, { min: 0, max: 9 }), '0 = 가장 보수적 (기본)') +
        row('새 탭의 최소 월간 검색량', num(`${V}.defaultMinVol`, { min: 0, step: 10 }), '탭마다 따로 바꿀 수 있어요') +
        row('창의성 (temperature)', num(`${V}.temperature`, { min: 0, max: 2, step: 0.1 }), 'Gemini에만 적용, 낮을수록 판정이 일관됨'))}

      <h3 class="set-h">④ 중복 검사 <span class="muted" style="font-size:12px;font-weight:500">AI 생성기 · 키워드 중복 검사 탭 공통</span></h3>
      ${sec('dedup', '비교 규칙', `AI 없이 PC에서 글자 규칙으로만 비교해요. 먼저 키워드를 <b>정규화</b>(띄어쓰기·아래 기호 제거, 대소문자 통일, 같은 말 치환)한 뒤:<br>
        · <b>똑같음</b>: 정규화 결과가 같음<br>
        · <b>어순만 다름</b>: 같은 글자로 이루어졌고 앞뒤 덩어리만 바뀜 (보험운전자 = 운전자보험)<br>
        · <b>유사</b>: 1글자만 다름 / 한쪽이 다른 쪽을 포함<br>
        · 의미 중복 검사 때는 두 글자 조각(예: 운전·전자·자보)이 기준 이상 겹치는 기존 키워드만 AI에 보내요.<br>
        뜻만 같은 표현은 글자 규칙으로 못 잡아서, 아래 <b>같은 말 사전</b>에 적어두면 같은 키워드로 봐요.`,
        row('무시할 기호 (띄어쓰기는 항상)', txt(`${D}.ignoreChars`)) +
        row('대소문자', chk(`${D}.ignoreCase`, '무시 (KB = kb)')) +
        row('어순', chk(`${D}.order`, '단어 순서만 다른 것도 중복으로')) +
        row('1글자 차이 최소 길이', num(`${D}.typoMinLen`, { min: 0, max: 20 }), '이 글자 수 이상일 때만 유사로 봄, 0이면 끔') +
        row('숫자', chk(`${D}.typoDigits`, '숫자가 다르면 다른 키워드로 (20대 ≠ 50대)')) +
        row('포함 관계 최소 길이', num(`${D}.containMinLen`, { min: 0, max: 20 }), '포함된 쪽이 이 글자 수 이상일 때만 유사, 0이면 끔') +
        row('의미 중복 후보 기준', num(`${D}.simThreshold`, { min: 0, max: 1, step: 0.05 }), '0~1, 낮을수록 더 많이 AI에 보냄') +
        row('같은 말 사전 (한 줄에 "기준=다른말=다른말")', '') + area(`${D}.synonyms`, 4, '저렴한=싼=저가\n비용=가격=요금\n자동차보험=자차보험'))}

      <h3 class="set-h">⑥ 파워링크 분석기</h3>
      ${sec('powerlink', '검색 횟수 · 속도', `키워드마다 로그아웃 상태의 네이버 '광고 더보기' 화면(PC 최대 25위 · 모바일 최대 15위)을 여러 번 열어 내 광고 순위의 평균을 내요. 검색할 때마다 순위가 조금씩 바뀌어서 여러 번 볼수록 정확해요. 캡처는 이 PC의 Edge(없으면 Chrome)를 화면 없이 띄워 찍어요.<br>네이버는 짧은 시간에 검색을 많이 하면 검색 제한을 걸어요. 제한에 걸리면 1분부터 점점 길게 쉬었다 자동으로 이어가요.`,
        row('검색 횟수', sel('rules.powerlink.runs', [[1, '1회 (빠름)'], [2, '2회'], [3, '3회'], [4, '4회 (기본)'], [5, '5회']]), '새로 시작하는 분석부터 적용') +
        row('검색 사이 간격 (ms)', num('rules.powerlink.gapMs', { min: 500, max: 10000, step: 100 }), '기본 1,200 · 너무 줄이면 검색 제한에 자주 걸려요'))}
      <h3 class="set-h">⑤ 대량 분석</h3>
      ${sec('', '조회 방식', `키워드는 띄어쓰기를 붙이고 대소문자만 다른 것은 하나로 합친 뒤(최대 1,000개) 서버가 네이버 API를 대신 호출해요: 검색량은 5개씩, 입찰가는 PC·모바일 각각 20개 × 1~5위를 한 번에, 블로그 발행량은 1개씩. 받은 값은 12시간 저장해 두고 다시 조회하면 바로 써요. 포화 지수 구간은 ①의 설정을 따라요.<br>결과 아래 <b>AI 조건 재검증</b>은 ③과 같은 방식이에요(주제·예시·요청 사항은 대량 분석 화면에서 입력하거나 AI 생성기 탭에서 가져와요). 대량 분석은 글자 수 범위를 따로 검사하지 않아요.`)}`;
  }

  // ---------------------------------------------------------------- 그리기 · 이벤트
  function render(tab) {
    ensure();
    const pane = $(`.mpane[data-pane="${tab}"]`);
    if (!pane) return;
    pane.innerHTML = tab === 'ui' ? renderUI() : renderRules();
    $$('[data-p]', pane).forEach((el) => {
      el.oninput = el.onchange = () => {
        let v = el.dataset.t === 'bool' ? el.checked : el.value;
        if (el.dataset.t === 'num') { v = Number(v); if (!isFinite(v)) return; }
        setP(DRAFT, el.dataset.p, v);
        dirty = true;
        if (el.dataset.p === 'ui.accent' || el.dataset.p === 'ui.zoom' || el.dataset.p === 'ui.density') preview();
      };
    });
    $$('[data-hide]', pane).forEach((cb) => (cb.onchange = () => {
      const s = new Set(DRAFT.ui.hideButtons || []);
      cb.checked ? s.add(cb.dataset.hide) : s.delete(cb.dataset.hide);
      DRAFT.ui.hideButtons = [...s]; dirty = true;
    }));
    $$('[data-theme-opt]', pane).forEach((b) => (b.onclick = () => window.setTheme?.(b.dataset.themeOpt)));
    $$('[data-acc]', pane).forEach((b) => (b.onclick = () => { DRAFT.ui.accent = b.dataset.acc; dirty = true; preview(); render(tab); }));
    $$('[data-reset]', pane).forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const id = a.dataset.reset, d = DEF();
      if (id === 'ui') DRAFT.ui = { ...clone(d.ui), hideButtons: DRAFT.ui.hideButtons, startView: DRAFT.ui.startView, relPage: DRAFT.ui.relPage, bulkPage: DRAFT.ui.bulkPage };
      if (id === 'sat') DRAFT.rules.analysis.satBands = clone(d.rules.analysis.satBands);
      if (id === 'grade') { DRAFT.rules.analysis.gradeMinVol = d.rules.analysis.gradeMinVol; DRAFT.rules.analysis.gradeBands = clone(d.rules.analysis.gradeBands); }
      if (id === 'issue') DRAFT.rules.analysis.issueBands = clone(d.rules.analysis.issueBands);
      if (id === 'powerlink') DRAFT.rules.powerlink = clone(d.rules.powerlink);
    if (id === 'banned') DRAFT.rules.banned = clone(d.rules.banned);
      if (id === 'comm') for (const k of ['commercialWords', 'infoWords', 'commercialBonus', 'infoPenalty', 'commercialBands']) DRAFT.rules.analysis[k] = clone(d.rules.analysis[k]);
      if (id === 'gen') DRAFT.rules.generate = clone(d.rules.generate);
      if (id === 'verify') DRAFT.rules.verify = clone(d.rules.verify);
      if (id === 'dedup') DRAFT.rules.dedup = clone(d.rules.dedup);
      dirty = true; preview(); render(tab);
    }));
    if ($('#setExport')) $('#setExport').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(DRAFT, null, 2)], { type: 'application/json' }));
      a.download = `키워드분석기_설정_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    };
    if ($('#setImport')) $('#setImport').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const j = JSON.parse(await f.text()); DRAFT = { ui: { ...clone(DEF().ui), ...(j.ui || {}) }, rules: deepMerge(clone(DEF().rules), j.rules || {}) }; dirty = true; preview(); render(tab); $('#testOut').innerHTML = '설정 파일을 불러왔어요. [저장]을 누르면 적용돼요.'; }
      catch (err) { alert('설정 파일을 읽지 못했어요: ' + err.message); }
    };
    if ($('#setResetAll')) $('#setResetAll').onclick = async () => { if (await uiConfirm('화면과 규칙을 모두 기본값으로 되돌릴까요? ([저장]을 눌러야 적용돼요)')) { DRAFT = clone(DEF()); dirty = true; preview(); render(tab); } };
  }
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(a, b) { for (const k of Object.keys(b)) a[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : b[k]; return a; }

  // 저장 전 미리보기 (색·배율·간격)
  function preview() {
    const keep = window.SETTINGS;
    window.SETTINGS = DRAFT; applyUI(); window.SETTINGS = keep;
  }

  async function saveRules() {
    try {
      const r = await (await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: DRAFT }) })).json();
      if (!r.ok) throw new Error(r.error || '저장 실패');
      window.SETTINGS = r.settings; DRAFT = clone(r.settings); dirty = false;
      applyUI();
      // 바뀐 규칙을 열려 있는 화면에 반영
      window.__AI?.recheckAll?.(); window.__AI?.draw?.(); window.__AI_banCount?.();
      if (window.__DUP?.D?.result) window.__DUP.run();
      if (typeof STATE !== 'undefined' && STATE && !$('#main').classList.contains('hidden')) run(STATE.keyword, false);
      $('#testOut').innerHTML = `<b style="color:#16a34a">저장했어요.</b> 화면과 규칙이 바로 적용됐어요.`;
      render(MTAB);
    } catch (e) { $('#testOut').innerHTML = `<span style="color:#b91c1c">${esc(e.message)}</span>`; }
  }

  // 상단·하단 [저장]: API 탭이면 키 저장, 화면/규칙 탭이면 설정 저장
  $$('.act-save').forEach((b) => (b.onclick = () => (MTAB === 'api' ? saveSettings() : saveRules())));
  // 닫을 때 저장 안 한 변경 확인
  $$('.act-close').forEach((b) => (b.onclick = async () => {
    if (dirty && !await uiConfirm('화면·규칙 설정에 저장하지 않은 변경이 있어요. 저장하지 않고 닫을까요?')) return;
    if (dirty) { DRAFT = null; dirty = false; applyUI(); }
    closeSettings();
  }));
  // 설정 창을 열 때마다 저장된 값에서 다시 시작
  const _open = window.openSettings;
  window.openSettings = async (tab) => { DRAFT = null; dirty = false; await _open(tab); };
  $('#setBtn').onclick = () => window.openSettings();

  window.__SET = { render, get draft() { return DRAFT; } };

  // ---------------------------------------------------------------- 시작
  applyUI();
  const sv = UI().startView;
  if (!location.hash && !new URLSearchParams(location.search).get('keyword') && sv && sv !== 'analyze') {
    if (sv === 'ai') window.showAI?.(true);
    if (sv === 'dup') window.showDup?.(true);
    if (sv === 'bulk') window.showBulk?.(true);
  }
})();
