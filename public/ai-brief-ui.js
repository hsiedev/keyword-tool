/* Guided brief view. AiBrief owns validation, normalization and prompt composition. */
(() => {
  'use strict';

  const STEPS = [
    ['주제', '어떤 주제에서 키워드를 찾을까요?', '주제를 고르면 다음 질문과 타깃 예시가 바뀌어요. 찾는 분야가 없으면 직접 적을 수 있어요.'],
    ['상품·목표', '어떤 상품을, 어떤 행동으로 연결할까요?', '상품 이름과 목표 행동이면 시작할 수 있어요. 전환 기준과 주소는 아는 만큼만 적어요.'],
    ['타깃 상황', '고객은 무슨 일이 생겨서 검색할까요?', '실제로 어떤 상황에서 검색하는지 생각해 보세요. 상황을 최대 두 개 고르거나 직접 적어 주세요.'],
    ['포함·제외', '꼭 포함하거나 빼야 할 것이 있나요?', '상품 조건과 참고 키워드를 적으면 더 구체적으로 찾을 수 있어요. 모르는 건 비워 두세요.'],
    ['검토', '이 브리프로 키워드를 찾으면 될까요?', '자동으로 작성된 요청문을 확인하고, 필요한 항목만 수정하거나 복사할 수 있어요.']
  ];
  const REVIEW = STEPS.length - 1;
  const ADAPTIVE_STEPS = [
    ['주제', STEPS[0][1], '주제를 직접 적거나 예시를 눌러 보세요. 주제에 맞춰 다음 질문이 달라져요.'],
    ['상품·목표', STEPS[1][1], '전환 목표를 고르면 그에 맞는 추가 질문이 열려요. 아는 만큼만 답해 주세요.'],
    ['타깃 상황', STEPS[2][1], '상황을 최대 두 개 고르거나 직접 적어 주세요. 선택에 따라 추가 질문이 달라져요.'],
    ['추가 질문', '이 브리프에만 필요한 추가 질문이에요', '앞에서 고른 목표와 검색 상황을 반영했어요. 모르면 미정으로 두거나 건너뛸 수 있어요.'],
    STEPS[REVIEW]
  ];
  const QUESTION_LIMIT = 3;
  const PERSON_MODES = { pick: '상황에서 고르기', direct: '타깃 직접 입력', ai: '모름 · AI 제안' };
  const text = value => String(value ?? '').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function button(action, label, { key, className = '', attrs = '' } = {}) {
    return `<button type="button" class="btn ${className}" data-ab-action="${action}"${key === undefined ? '' : ` data-ab-key="${escape(key)}"`} ${attrs}>${escape(label)}</button>`;
  }
  function choices(action, keys, labels, selected) {
    return `<div class="ab-choices">${keys.map(key => button(action, labels[key], {
      key, attrs: `aria-pressed="${key === selected}"`
    })).join('')}</div>`;
  }
  function card(action, key, title, description, selected, className = '') {
    return `<button type="button" class="btn ab-choice ${className}" data-ab-action="${action}" data-ab-key="${escape(key)}" aria-pressed="${selected}">
      <strong>${escape(title)}</strong><span>${escape(description)}</span></button>`;
  }
  function field(key, label, value, placeholder, maxLength, type = 'text', locked = false) {
    const id = `ab-${escape(key)}`;
    const attrs = `id="${id}" data-ab-field="${escape(key)}" maxlength="${maxLength}" placeholder="${escape(placeholder)}"${locked ? ' data-ab-locked disabled' : ''}`;
    const control = type === 'textarea'
      ? `<textarea ${attrs} rows="2">\n${escape(value)}</textarea>`
      : `<input ${attrs} type="${type}" value="${escape(value)}"${type === 'url' ? ' inputmode="url" autocomplete="off" spellcheck="false"' : ''}>`;
    return `<div class="ab-field"><label for="${id}">${escape(label)}</label>${control}</div>`;
  }

  function mount(root, { onChange, onReview, suggestQuestions } = {}) {
    const core = window.AiBrief;
    const find = selector => root.querySelector(selector);
    const doc = root.ownerDocument;
    let state = core.blankAdaptive();
    let topicInput = state.adaptive.text;
    let composingTopic = false;
    let suggestion = null;
    let suggestionStatus = '';
    let suggestionTimer = null;
    let pickerMarkup = '';
    let busy = false;
    let invalidControl = null;

    root.classList.add('ab-root');
    root.innerHTML = `
      <ol id="ab-steps" class="ab-steps" aria-label="브리프 단계"></ol>
      <div class="ab-columns">
        <section class="ab-card" aria-labelledby="ab-guide-title">
          <header class="ab-head"><h3 id="ab-guide-title">대화형 브리프</h3><span id="ab-step-count" class="ab-muted"></span></header>
          <div class="ab-transcript">
            <div id="ab-prior" class="ab-prior" role="group" aria-label="이전 답변" hidden></div>
            <div class="ab-turn">
              <span class="ab-badge" aria-hidden="true">가이드</span>
              <div class="ab-bubble"><h4 id="ab-question" tabindex="-1" aria-describedby="ab-help"></h4><p id="ab-help" class="ab-muted"></p></div>
            </div>
          </div>
          <form id="ab-form" novalidate>
            <div class="ab-answer">
              <div id="ab-fields"></div>
              <p id="ab-error" class="ab-error" role="alert"></p>
              <p id="ab-status" class="ab-status" role="status"></p>
            </div>
            <footer class="ab-bottom" id="ab-bottom"></footer>
          </form>
        </section>
        <aside class="ab-card" aria-labelledby="ab-summary-title">
          <header class="ab-head"><h3 id="ab-summary-title">완성 중인 브리프</h3><span class="ab-chip">네이버 파워링크</span></header>
          <div id="ab-summary" class="ab-summary"></div>
        </aside>
      </div>`;

    const nodes = Object.fromEntries(['steps', 'step-count', 'prior', 'question', 'help', 'fields', 'error', 'status', 'bottom', 'summary']
      .map(key => [key, find(`#ab-${key}`)]));
    const read = () => structuredClone(state);
    const reportChange = () => onChange?.(read());
    const focus = () => nodes.question.focus();
    const topicConfig = () => core.TOPICS[state.topic] || core.TOPICS.custom;
    const editButton = (step, label) => step <= state.max ? button('step', '수정', {
      key: step, className: 'ab-edit', attrs: `aria-label="${escape(label)} 수정"`
    }) : '';
    const display = (value, empty = '미입력') => text(value) ? escape(text(value)) : `<span class="ab-muted">${empty}</span>`;
    const summaryRow = (label, value, step) => `<div class="ab-summary-row"><dt>${label}${editButton(step, label)}</dt><dd>${value}</dd></div>`;

    const activeSteps = () => state.adaptive ? ADAPTIVE_STEPS : STEPS;
    const adaptiveRoute = () => core.adaptive.routes[state.adaptive?.route];
    const generic = () => state.adaptive?.route === 'generic';
    const answerText = answer => answer?.status === 'given' ? answer.value : '';
    const statusLabel = { unknown: '미정 · 추정하지 않음', skip: '해당 없음' };
    const withoutAnswer = () => ({ status: 'given', value: '' });
    const topicKey = raw => text(raw).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();

    function routeBanner() {
      const route = adaptiveRoute();
      if (!route) return '';
      const source = state.adaptive.manual ? '직접 선택' : generic() ? '분류 미정' : '자동 선택';
      return `<div class="ab-route"><strong>${escape(route.name)} 경로</strong><span class="ab-chip">${source}</span></div>`;
    }

    function renderRoutePicker() {
      const a = state.adaptive;
      const classified = core.adaptive.route(a.text);
      if (classified.kind === 'empty') return '';
      const routes = Object.entries(core.adaptive.routes);
      const matches = new Set(classified.matches);
      if (!a.route && classified.kind === 'ambiguous') routes.sort(([l], [r]) => Number(matches.has(r)) - Number(matches.has(l)));
      const note = !a.route && classified.kind === 'ambiguous'
        ? '<div class="ab-route-note"><strong>두 가지 이상으로 읽혀요.</strong><p>어느 쪽 질문으로 이어갈지 골라 주세요. 맞는 분야가 없으면 일반을 선택하세요.</p></div>'
        : !a.manual && classified.kind === 'unknown'
          ? '<div class="ab-route-note"><strong>맞는 분야를 찾지 못했어요.</strong><p>일반 질문으로 시작할 수 있어요. 맞는 분야가 있다면 직접 골라 주세요.</p></div>' : '';
      return `${note}${routeBanner()}<fieldset class="ab-group ab-route-picker" id="ab-routes"><legend>질문 경로 직접 선택</legend><div class="ab-choices">
        ${routes.map(([key, route]) => button('route', route.name, { key, attrs: `aria-pressed="${key === a.route}"` })).join('')}
        </div></fieldset>`;
    }

    function renderSuggestionPanel() {
      if (!generic()) return '';
      const qs = state.adaptive.questions;
      const requestLocked = qs.length >= QUESTION_LIMIT || typeof suggestQuestions !== 'function';
      return `<section class="ab-hybrid" aria-labelledby="ab-hybrid-title">
        <h4 id="ab-hybrid-title">질문이 더 필요할까요? <span class="ab-chip">선택</span></h4>
        <p class="ab-muted">원할 때만 주제를 AI에 보내 질문 초안을 받아요. 직접 적거나 수정·삭제할 수 있고, 답은 ‘추가 질문’에서 적어요.</p>
        <div class="ab-choices ab-question-actions">
          ${suggestion ? button('suggest-stop', '제안 중지') : button('suggest', 'AI 질문 초안 받기', { attrs: requestLocked ? 'data-ab-locked disabled' : '' })}
          ${button('question-add', '+ 직접 질문 추가', { attrs: qs.length >= QUESTION_LIMIT ? 'data-ab-locked disabled' : '' })}
          ${suggestion ? '<span id="ab-suggestion-timer" class="ab-muted" aria-hidden="true"></span>' : ''}
        </div>
        ${qs.map(({ question }, i) => `<div class="ab-question-edit">
          ${field(`question-${i}`, `선택 질문 ${i + 1} 수정`, question, '궁금한 점을 질문으로 적어 주세요', 110)}
          ${button('question-delete', '삭제', { key: i, attrs: `aria-label="선택 질문 ${i + 1} 삭제"` })}
        </div>`).join('')}
        <p class="ab-muted">${qs.length} / ${QUESTION_LIMIT}개${typeof suggestQuestions !== 'function' ? ' · AI 제안을 사용할 수 없어도 직접 추가할 수 있어요.' : ''}</p>
      </section>`;
    }

    function renderAdaptiveTopic() {
      return `<div class="ab-group">${field('adaptive-topic', '주제 직접 입력', topicInput, '어떤 상품이나 서비스의 키워드를 찾나요?', 80)}</div>
        <fieldset class="ab-group ab-examples"><legend>주제 예시</legend><div class="ab-choices">
          ${core.adaptive.examples.map(example => button('example', example, { key: example, className: 'ab-example' })).join('')}
        </div></fieldset>
        <div id="ab-route-picker" aria-live="polite">${renderRoutePicker()}</div>
        <div id="ab-hybrid">${renderSuggestionPanel()}</div>`;
    }

    function setSuggestionStatus(message) {
      suggestionStatus = message;
      if (state.adaptive && state.step === 0) nodes.status.textContent = message;
    }

    function refreshSuggestionPanel(retainFocus = false) {
      const panel = find('#ab-hybrid');
      if (!panel) return;
      const active = retainFocus && panel.contains(doc.activeElement) ? doc.activeElement : null;
      const selection = active?.matches('input') ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
      const previous = active?.dataset;
      panel.innerHTML = renderSuggestionPanel();
      syncBusy(panel);
      if (previous?.abField) {
        const control = find(`#ab-${previous.abField}`);
        control?.focus({ preventScroll: true });
        if (selection) control?.setSelectionRange(...selection);
      } else if (previous?.abAction === 'suggest-stop') focusQuestionAction('suggest');
      else if (previous?.abAction) {
        const control = [...panel.querySelectorAll('button:not(:disabled)')].find(el => el.dataset.abAction === previous.abAction && el.dataset.abKey === previous.abKey);
        if (control) control.focus({ preventScroll: true });
        else focusQuestionAction('suggest');
      }
    }

    function completeSuggestion(message) {
      suggestion = null;
      clearInterval(suggestionTimer);
      suggestionTimer = null;
      setSuggestionStatus(message);
    }

    function cancelSuggestion(message = '') {
      const pending = suggestion;
      completeSuggestion(message);
      pending?.abort();
    }

    function focusQuestionAction(preferred) {
      const controls = [preferred, 'question-add', 'question-delete'].map(action => find(`#ab-hybrid [data-ab-action="${action}"]:not(:disabled)`));
      (controls.find(Boolean) || find('#ab-adaptive-topic'))?.focus({ preventScroll: true });
    }

    async function requestQuestions() {
      if (!generic() || state.step !== 0 || suggestion || typeof suggestQuestions !== 'function' || state.adaptive.questions.length >= QUESTION_LIMIT) return;
      const controller = new AbortController();
      suggestion = controller;
      setSuggestionStatus('AI 질문 초안을 받고 있어요.');
      refreshSuggestionPanel();
      find('[data-ab-action="suggest-stop"]')?.focus({ preventScroll: true });
      const started = Date.now();
      const updateTime = () => {
        const timer = find('#ab-suggestion-timer');
        if (timer) timer.textContent = `${Math.floor((Date.now() - started) / 1000)}초 경과`;
      };
      updateTime();
      suggestionTimer = setInterval(updateTime, 1000);
      let result;
      try {
        result = core.adaptive.questions(await suggestQuestions(state.adaptive.text, { signal: controller.signal }));
      } catch {
        if (suggestion !== controller) return;
        completeSuggestion('AI 질문 초안을 받지 못했어요. 다시 시도하거나 직접 질문을 적을 수 있어요.');
        refreshSuggestionPanel(true);
        return;
      }
      if (suggestion !== controller) return;
      const list = state.adaptive.questions;
      const existing = new Set(list.map(({ question }) => topicKey(question)));
      const additions = result.filter(question => !existing.has(topicKey(question))).slice(0, QUESTION_LIMIT - list.length);
      additions.forEach(question => list.push({ question, answer: withoutAnswer() }));
      completeSuggestion(additions.length ? `질문 ${additions.length}개를 제안했어요. 자유롭게 수정하거나 삭제하세요.` : '추가할 새 질문이 없어요. 직접 질문을 적거나 그대로 진행할 수 있어요.');
      refreshSuggestionPanel(true);
      renderSummary();
      if (additions.length) reportChange();
    }

    function setTopic(value, route) {
      if (value === topicInput && route === undefined) return;
      const sameTopic = topicKey(value) === topicKey(state.adaptive.text);
      const previousRoute = state.adaptive.route;
      topicInput = value;
      state = core.adaptive.selectTopic(state, value, route);
      if (!sameTopic || previousRoute !== state.adaptive.route) cancelSuggestion();
      const control = find('#ab-adaptive-topic');
      if (control.value !== value) control.value = value;
      const picker = find('#ab-route-picker');
      const markup = renderRoutePicker();
      if (markup !== pickerMarkup) { pickerMarkup = markup; picker.innerHTML = markup; syncBusy(picker); }
      if (!sameTopic || previousRoute !== state.adaptive.route) refreshSuggestionPanel();
      setMessage();
      renderSummary();
      renderSteps();
      reportChange();
    }

    function targetNames() {
      return state.personaMode === 'ai' ? 'AI 제안 · 가설' : core.people(state).map(person => person.name).join(' · ');
    }

    function renderSummary() {
      const people = core.people(state);
      const target = state.personaMode === 'ai' ? 'AI가 제안 <span class="ab-chip ab-badge">미확인 가설</span>'
        : people.length ? people.map(person => `<div><strong>${escape(person.name)}</strong><br><span class="ab-muted">${escape(person.situation)}</span></div>`).join('')
          : display('', '아직 선택 안 함');
      const goal = `${display(core.goalName(state))}${text(state.conversion) ? `<br><span class="ab-muted">${escape(text(state.conversion))}</span>` : ''}`;
      const conditions = [['포함', state.claims], ['제외', state.exclusions], ['참고', state.refs]].filter(([, value]) => text(value));
      const official = Boolean(text(state.official));
      const landing = Boolean(text(state.landing));
      const evidence = official && landing ? '공식·랜딩 주소 입력됨' : official ? '공식 상품 주소만 입력됨' : landing ? '광고 랜딩 주소만 입력됨' : '근거 확인 필요';
      const a = state.adaptive;
      const drafts = a ? core.adaptive.draftCount(state) : 0;
      const extraAnswers = a ? [
        ...core.adaptive.extras(state).map(({ id, label }) => [label, a.fields[id]]),
        ...(generic() ? a.questions.map(({ question, answer }) => [text(question), answer]) : [])
      ].filter(([label, answer]) => label && (text(answerText(answer)) || statusLabel[answer?.status])) : [];
      nodes.summary.innerHTML = `${a ? routeBanner() : ''}<dl>
        ${summaryRow('주제', display(core.topicName(state)), 0)}
        ${summaryRow('상품·서비스', a?.productUnknown ? '<span class="ab-muted">미정 · 추정하지 않음</span>' : display(state.product), 1)}
        ${summaryRow('목표 행동', goal, 1)}
        ${summaryRow('타깃 상황', target, 2)}
        ${summaryRow('포함·제외', conditions.length ? conditions.map(([name, value]) => `<div><strong>${name}:</strong> ${escape(text(value))}</div>`).join('') : display('', '없으면 생략'), 3)}
        ${a ? summaryRow('추가 답변', extraAnswers.length ? extraAnswers.map(([label, answer]) => `<div><strong>${escape(label)}</strong><br>${display(answerText(answer), statusLabel[answer.status])}</div>`).join('') : display('', '없으면 생략'), 3) : ''}
        ${summaryRow('탐색 방향', display(core.TAILS[state.mix]), 3)}
      </dl>${drafts ? `<p class="ab-drafts ab-muted">다른 주제·경로의 답변 ${drafts}개를 보관 중이에요. 이번 요청에는 쓰지 않으며, 같은 주제·경로를 다시 고르면 복원돼요.</p>` : ''}<div class="ab-note ab-evidence"><strong>${evidence}</strong><br>${official || landing
        ? '주소의 내용은 아직 확인하지 않았어요.'
        : '공식 상품 정보와 광고 랜딩을 확인하기 전에는 집행 후보로 확정하지 않아요.'}</div>`;
      syncBusy(nodes.summary);
    }

    function renderPrior() {
      const answers = [core.topicName(state), [state.adaptive?.productUnknown ? '상품 미정' : text(state.product), core.goalName(state)].filter(Boolean).join(' · '), targetNames(), core.TAILS[state.mix]];
      const prior = answers.slice(0, state.step).map((answer, step) => answer ? button('step', answer, {
        key: step, attrs: `aria-label="${escape(`${activeSteps()[step][0]} 수정: ${answer}`)}"`
      }) : '').join('');
      nodes.prior.innerHTML = prior;
      nodes.prior.hidden = !prior;
    }

    function renderTarget() {
      const modes = `<fieldset class="ab-group"><legend>타깃 입력 방식</legend>${choices('person-mode', Object.keys(PERSON_MODES), PERSON_MODES, state.personaMode)}</fieldset>`;
      if (state.personaMode === 'ai') return `${modes}<p class="ab-note"><strong>가설로 진행해요.</strong> 키워드를 생성할 때 상품과 목표를 바탕으로 AI가 최대 두 상황을 제안해요. 실제 고객 데이터와 구별해 ‘미확인 가설’로 표시해요.</p>`;
      if (state.personaMode === 'direct') return `${modes}
        ${state.people.slice(0, state.second ? 2 : 1).map(({ why, who, need }, i) => `<fieldset class="ab-group ab-person">
          <legend>타깃 ${i + 1}</legend>
          ${field(`p${i}-why`, '어떤 일이 생겨서 검색하나요?', why, '예: 처음 이용하려는데 준비물이 궁금함', 160)}
          <div class="ab-pair ab-group">${field(`p${i}-who`, '누구인가요? (선택)', who, '예: 처음 이용하는 사람', 90)}${field(`p${i}-need`, '무엇을 확인해야 하나요? (선택)', need, '예: 필요한 서류와 신청 경로', 140)}</div>
        </fieldset>`).join('')}
        <div class="ab-remainder">${button('second', state.second ? '두 번째 타깃 접기' : '+ 두 번째 타깃 추가', {
          className: 'ab-quiet', attrs: `aria-expanded="${state.second}"`
        })}<span class="ab-muted">나이만 적기보다 검색 계기를 적어 주세요.</span></div>`;
      const picked = state.adaptive ? state.adaptive.scenarios : core.picks(state);
      return `${modes}<div class="ab-option-grid" id="ab-scenarios" role="group" aria-label="검색 상황 선택">
        ${(state.adaptive ? (adaptiveRoute()?.opts || []) : core.scenarios(state)).map(([name, situation], i) => card('persona', i, name, situation, picked.includes(i))).join('')}
        </div><div class="ab-remainder"><span class="ab-muted">추천은 검색 상황 예시이며 실제 고객 데이터가 아니에요.</span>
        <span class="ab-chip ab-badge">${picked.length} / 2 선택</span></div>`;
    }

    function statusControls(key, current) {
      return `<div class="ab-choices ab-answer-status" role="group" aria-label="답변 상태">
        ${button('answer-state', '아직 미정', { key: `${key}:unknown`, attrs: `aria-pressed="${current === 'unknown'}"` })}
        ${button('answer-state', '해당 없음·건너뛰기', { key: `${key}:skip`, attrs: `aria-pressed="${current === 'skip'}"` })}</div>`;
    }

    function optionalAnswer(id, label, placeholder, answer, { why, suggested = false, key = id } = {}) {
      const ctrlId = `ab-${escape(id)}`;
      return `<section class="ab-ad-question">
        <div class="ab-field"><label for="${ctrlId}">${escape(label)} <span class="ab-chip ab-badge">${suggested ? '선택 질문' : '추가 질문'}</span></label>
          ${why ? `<p class="ab-muted ab-question-why" id="${ctrlId}-why">왜 물어보나요: ${escape(why)}</p>` : ''}
          <input type="text" id="${ctrlId}" data-ab-field="${escape(id)}" maxlength="260" placeholder="${escape(placeholder)}" value="${escape(answerText(answer))}"${why ? ` aria-describedby="${ctrlId}-why"` : ''}${statusLabel[answer?.status] ? ' data-ab-locked disabled' : ''}>
        </div>${statusControls(key, answer?.status)}
      </section>`;
    }

    function renderAdaptiveAnswer() {
      const a = state.adaptive;
      const route = adaptiveRoute();
      if (state.step === 0) return renderAdaptiveTopic();
      if (!route) return '<p class="ab-note">먼저 주제를 적고 질문 경로를 정해 주세요.</p>';
      if (state.step === 1) {
        const goals = [...route.goals];
        if (!goals.some(([k]) => k === 'explore')) goals.push(['explore', '미정 · 탐색용']);
        if (!goals.some(([k]) => k === 'custom')) goals.push(['custom', '직접 입력']);
        return `<div class="ab-group">${field('product', route.productLabel, a.productUnknown ? '' : state.product, route.productHint, 150, 'text', a.productUnknown)}
            <div class="ab-choices ab-answer-status">${button('product-unknown', '아직 미정', { attrs: `aria-pressed="${a.productUnknown}"` })}</div></div>
          <fieldset class="ab-group" id="ab-goals"><legend>전환(성공)으로 볼 행동</legend>${choices('goal', goals.map(([k]) => k), Object.fromEntries(goals), a.goal)}
            <p class="ab-muted ab-mix-help">고른 행동에 따라 추가 질문이 달라져요.</p></fieldset>
          ${a.goal === 'custom' ? `<div class="ab-group">${field('customGoal', '목표 행동 입력', state.customGoal, '예: 관심 상품 목록에 추가', 120)}</div>` : ''}
          <div class="ab-group">${field('conversion', '전환 완료 기준 (선택)', state.conversion, route.conversionHint, 140)}</div>
          <details class="ab-links" id="ab-links"${state.showLinks ? ' open' : ''}>
            <summary>공식 상품 URL · 광고 랜딩 URL (선택)</summary>
            <div class="ab-pair">${field('official', '공식 상품 정보', state.official, 'https://…', 350, 'url')}${field('landing', '실제 광고 랜딩', state.landing, 'https://…', 350, 'url')}</div>
          </details>`;
      }
      if (state.step === 2) return renderTarget();
      if (state.step === 3) {
        const extras = core.adaptive.extras(state);
        const qs = generic() ? a.questions : [];
        return `<div class="ab-group"><p class="ab-muted">${escape(route.name)} 경로에서 추가 질문 ${extras.length}개가 열렸어요.</p>
          ${extras.map(({ id, label, why, placeholder }) => optionalAnswer(`extra-${id}`, label, placeholder, a.fields[id], { why })).join('')}
          ${qs.map(({ question, answer }, i) => text(question) ? optionalAnswer(`q-answer-${i}`, text(question), '아는 만큼만 적어 주세요', answer, { suggested: true }) : '').join('')}
          ${qs.some(({ question }) => text(question)) ? button('step', '선택 질문 수정·삭제', { key: 0, className: 'ab-quiet' }) : ''}</div>
          <div class="ab-pair ab-group">${field('claims', '상품 조건·혜택 (선택)', state.claims, '공식 페이지에서 확인한 기능이나 자격', 360, 'textarea')}
            ${field('exclusions', '제외하거나 피할 표현 (선택)', state.exclusions, route.exclusionsHint, 240, 'textarea')}</div>
          <div class="ab-group">${field('refs', '참고 키워드 (선택)', state.refs, '쉼표 또는 줄바꿈으로 구분', 180, 'textarea')}</div>
          <fieldset><legend>숏테일·롱테일 탐색 방향</legend>${choices('mix', Object.keys(core.TAILS), core.TAILS, state.mix)}</fieldset>`;
      }
      return renderPrompt();
    }

    function renderPrompt() {
      return `<div class="ab-field"><label for="ab-prompt">자동으로 완성된 요청문</label><textarea readonly class="ab-prompt" id="ab-prompt" rows="10" spellcheck="false"></textarea></div>`;
    }

    function renderAnswer() {
      if (state.adaptive) return renderAdaptiveAnswer();
      switch (state.step) {
        case 0:
          return `<div class="ab-option-grid ab-group" id="ab-topics" role="group" aria-label="주제 선택">
            ${Object.entries(core.TOPICS).map(([key, topic]) => card('topic', key, topic.name, topic.desc, state.topic === key, key === 'custom' ? 'ab-span' : '')).join('')}
            </div>${state.topic === 'custom' ? field('customTopic', '주제 입력', state.customTopic, '예: B2B 정산 솔루션', 80) : ''}`;
        case 1: {
          const { productHint, conversionHint, goals } = topicConfig();
          const order = [...new Set([...goals, ...Object.keys(core.GOALS)])];
          return `<div class="ab-group">${field('product', '상품·서비스명과 광고주', state.product, productHint, 150)}</div>
            <fieldset id="ab-goals" class="ab-group"><legend>검색한 고객이 무엇을 하면 성공인가요?</legend>${choices('goal', order, core.GOALS, state.goal)}</fieldset>
            ${state.goal === 'custom' ? `<div class="ab-group">${field('customGoal', '목표 행동 입력', state.customGoal, '예: 관심 상품 목록에 추가', 120)}</div>` : ''}
            <div class="ab-group">${field('conversion', '전환 완료 기준 (선택)', state.conversion, conversionHint, 140)}</div>
            <details class="ab-links" id="ab-links"${state.showLinks ? ' open' : ''}>
              <summary>공식 상품 URL · 광고 랜딩 URL (선택)</summary>
              <div class="ab-pair">${field('official', '공식 상품 정보', state.official, 'https://…', 350, 'url')}${field('landing', '실제 광고 랜딩', state.landing, 'https://…', 350, 'url')}</div>
            </details>`;
        }
        case 2: return renderTarget();
        case 3:
          return `<div class="ab-pair ab-group">${field('claims', '상품 조건·혜택 (선택)', state.claims, '공식 페이지에서 확인한 기능이나 자격', 360, 'textarea')}
            ${field('exclusions', '피할 검색 의도 (선택)', state.exclusions, '상품과 무관한 검색이나 기존 고객 문의', 240, 'textarea')}</div>
            <div class="ab-group">${field('refs', '참고 키워드 (선택)', state.refs, '쉼표 또는 줄바꿈으로 구분', 180, 'textarea')}</div>
            <fieldset><legend>숏테일·롱테일 탐색 방향</legend>${choices('mix', Object.keys(core.TAILS), core.TAILS, state.mix)}
              <p class="ab-muted ab-mix-help">롱테일 우선은 더 구체적인 의도를 찾는 옵션이에요. 글자 수나 정해진 비율을 채우지 않아요.</p>
            </fieldset>`;
        default:
          return renderPrompt();
      }
    }

    function syncBusy(scope = root) {
      for (const control of scope.querySelectorAll('button:not([data-ab-action="copy"]), [data-ab-field]')) {
        control.disabled = busy || control.hasAttribute('data-ab-locked');
      }
      const summary = scope.querySelector('#ab-links > summary');
      if (summary) {
        if (busy) {
          summary.setAttribute('aria-disabled', 'true');
          summary.tabIndex = -1;
        } else {
          summary.removeAttribute('aria-disabled');
          summary.removeAttribute('tabindex');
        }
      }
    }

    function setMessage(message = '', control = null) {
      if (invalidControl) {
        invalidControl.removeAttribute('aria-describedby');
        invalidControl.removeAttribute('aria-invalid');
      }
      invalidControl = control;
      nodes.error.textContent = message;
      if (control) {
        control.setAttribute('aria-describedby', 'ab-error');
        if (control.hasAttribute('data-ab-field')) control.setAttribute('aria-invalid', 'true');
      }
    }

    function renderSteps() {
      nodes.steps.innerHTML = activeSteps().map(([name], i) => `<li><button type="button" class="btn ab-step${i < state.step ? ' ab-done' : ''}"
        data-ab-action="step" data-ab-key="${i}"${i === state.step ? ' aria-current="step"' : ''}${i > state.max ? ' data-ab-locked disabled' : ''}>
        <span class="ab-number" aria-hidden="true">${i < state.step ? '✓' : i + 1}</span>${name}</button></li>`).join('');
    }

    function render() {
      setMessage();
      root.classList.toggle('ab-adaptive', Boolean(state.adaptive));
      nodes.status.textContent = state.adaptive && state.step === 0 ? suggestionStatus : '';
      renderSteps();
      const steps = activeSteps();
      const route = state.adaptive && adaptiveRoute();
      nodes['step-count'].textContent = `${state.step + 1} / ${steps.length} 단계`;
      nodes.question.textContent = (state.step === 1 ? route?.goalLabel : state.step === 2 ? route?.scenarioLabel : '') || steps[state.step][1];
      nodes.help.textContent = steps[state.step][2];
      renderPrior();
      nodes.fields.innerHTML = renderAnswer();
      pickerMarkup = state.adaptive && state.step === 0 ? renderRoutePicker() : '';
      const reviewing = state.step === REVIEW;
      if (reviewing) find('#ab-prompt').value = core.compose(state);
      nodes.bottom.innerHTML = `
        <span class="ab-muted">${reviewing ? '내용이 맞는지 확인해 주세요.' : state.adaptive ? 'AI 질문 초안은 직접 요청할 때만 받아요.' : '답변 중에는 AI를 호출하지 않아요.'}</span>
        <div class="ab-choices">
          ${state.step ? button('back', '이전', { className: 'ab-quiet' }) : ''}
          ${reviewing ? button('copy', '요청문 복사') : `<button type="submit" class="btn pri">${state.step === REVIEW - 1 ? '브리프 검토' : '다음'} <span aria-hidden="true">→</span></button>`}
        </div>`;
      renderSummary();
      syncBusy();
    }

    function firstProblem(end = STEPS.length) {
      for (let step = 0; step < end; step++) {
        const problem = core.problem(state, step);
        if (problem) return { step, message: problem[0], key: problem[1] };
      }
      return null;
    }

    function revealProblem({ step, message, key }, fromUser) {
      const changedStep = state.step !== step;
      const needsLinks = key === 'official' || key === 'landing';
      const openedLinks = needsLinks && !state.showLinks;
      if (needsLinks) state.showLinks = true;
      if (changedStep) {
        state.step = step;
        state.max = Math.max(state.max, step);
        render();
      } else if (needsLinks) {
        find('#ab-links').open = true;
      }
      const control = state.adaptive && step === 0 && state.adaptive.text.trim() && !state.adaptive.route
        ? find('#ab-routes button') || find('#ab-adaptive-topic')
        : key ? find(`#ab-${key}`) : find(['#ab-topics button', '#ab-goals button', '#ab-scenarios button, [data-ab-action="person-mode"]'][step] || '#ab-question');
      setMessage(message, control && control !== nodes.question ? control : null);
      if (control && !control.disabled) control.focus();
      else focus();
      if (fromUser && (changedStep || openedLinks)) reportChange();
    }

    function showProblem() {
      const issue = firstProblem();
      if (issue) revealProblem(issue, false);
      return Boolean(issue);
    }

    function moveTo(step) {
      if (busy || !Number.isInteger(step) || step < 0 || step > REVIEW) return;
      if (step === state.step) { focus(); return; }
      const issue = step > state.step ? firstProblem(step) : null;
      if (issue) { revealProblem(issue, true); return; }
      if (state.adaptive && state.step === 0) cancelSuggestion();
      state.step = step;
      state.max = Math.max(state.max, step);
      render();
      focus();
      reportChange();
      if (step === REVIEW) onReview?.(read());
    }

    function updateButton(action, key, focusField) {
      render();
      const control = (focusField && find(`#ab-${focusField}`)) ||
        [...root.querySelectorAll(`[data-ab-action="${action}"]`)].find(el => el.dataset.abKey === key);
      control?.focus({ preventScroll: !focusField });
      reportChange();
    }

    async function copyPrompt() {
      const box = find('#ab-prompt');
      if (!box?.value) return;
      nodes.status.textContent = '';
      try {
        await doc.defaultView.navigator.clipboard.writeText(box.value);
        if (box === find('#ab-prompt')) nodes.status.textContent = '요청문을 복사했어요.';
      } catch {
        if (box !== find('#ab-prompt')) return;
        box.focus();
        box.select();
        nodes.status.textContent = '요청문을 선택했어요. Ctrl+C 또는 ⌘C로 복사해 주세요.';
      }
    }

    function adaptiveAnswerAccess(key) {
      const a = state.adaptive;
      if (key.startsWith('extra-')) {
        const id = key.slice(6);
        return { owner: a.fields, key: id, optional: true };
      }
      if (key.startsWith('q-answer-')) return { owner: a.questions[Number(key.slice(9))], key: 'answer' };
      return null;
    }

    function updateAdaptiveField(key, control, isComposing) {
      if (key === 'adaptive-topic') {
        if (!composingTopic && !isComposing) setTopic(control.value);
        return true;
      }
      const a = state.adaptive;
      if (key.startsWith('question-')) {
        const question = a.questions[Number(key.slice(9))];
        if (question) question.question = control.value;
      } else {
        const entry = adaptiveAnswerAccess(key);
        if (!entry?.owner) return false;
        if (entry.optional && !text(control.value)) delete entry.owner[entry.key];
        else entry.owner[entry.key] = { status: 'given', value: control.value };
      }
      setMessage();
      renderSummary();
      reportChange();
      return true;
    }

    function runAdaptiveAction(action, key) {
      const a = state.adaptive;
      if (action === 'example') {
        setTopic(key);
        find('#ab-adaptive-topic')?.focus();
      } else if (action === 'route') {
        if (key !== a.route) setTopic(topicInput, key);
        [...root.querySelectorAll('[data-ab-action="route"]')].find(el => el.dataset.abKey === key)?.focus({ preventScroll: true });
      } else if (action === 'suggest') {
        void requestQuestions();
      } else if (action === 'suggest-stop') {
        cancelSuggestion('AI 질문 초안 요청을 중지했어요.');
        refreshSuggestionPanel();
        focusQuestionAction('suggest');
      } else if (action === 'question-add' || action === 'question-delete') {
        if (!generic()) return true;
        const list = a.questions;
        const index = action === 'question-add' ? list.length : Number(key);
        if (action === 'question-add' && list.length < QUESTION_LIMIT) list.push({ question: '', answer: withoutAnswer() });
        else if (action === 'question-delete') list.splice(index, 1);
        refreshSuggestionPanel();
        const next = find(`#ab-question-${Math.min(index, list.length - 1)}`);
        if (next) next.focus();
        else focusQuestionAction('question-add');
        setMessage();
        renderSummary();
        reportChange();
      } else if (action === 'product-unknown') {
        a.productUnknown = !a.productUnknown;
        updateButton(action, key, a.productUnknown ? null : 'product');
      } else if (action === 'goal') {
        a.goal = key;
        updateButton(action, key, key === 'custom' ? 'customGoal' : null);
      } else if (action === 'persona') {
        const index = Number(key);
        const picked = a.scenarios;
        if (!picked.includes(index) && picked.length >= 2) setMessage('이미 두 상황을 골랐어요. 다른 상황을 고르려면 하나를 먼저 해제해 주세요.');
        else {
          a.scenarios = picked.includes(index) ? picked.filter(i => i !== index) : [...picked, index];
          updateButton(action, key);
        }
      } else if (action === 'answer-state') {
        const [id, status] = key.split(':');
        const entry = adaptiveAnswerAccess(id);
        if (entry?.owner) {
          const previous = entry.owner[entry.key];
          const reverting = previous?.status === status;
          if (reverting && entry.optional) delete entry.owner[entry.key];
          else entry.owner[entry.key] = reverting ? withoutAnswer() : { status, value: '' };
          updateButton(action, key, reverting ? id : null);
        }
      } else return false;
      return true;
    }

    root.addEventListener('submit', event => {
      if (event.target.id !== 'ab-form') return;
      event.preventDefault();
      if (state.step < REVIEW && !composingTopic) moveTo(state.step + 1);
    });
    root.addEventListener('compositionstart', event => {
      if (event.target.dataset.abField === 'adaptive-topic') composingTopic = true;
    });
    root.addEventListener('compositionend', event => {
      if (event.target.dataset.abField !== 'adaptive-topic') return;
      composingTopic = false;
      if (state.adaptive && state.step === 0 && !busy) setTopic(event.target.value);
    });
    root.addEventListener('input', event => {
      const control = event.target;
      const key = control.dataset.abField;
      if (!key || busy || control.disabled) return;
      if (state.adaptive && updateAdaptiveField(key, control, event.isComposing)) return;
      const person = /^p([01])-(who|why|need)$/.exec(key);
      const owner = person ? state.people[Number(person[1])] : state;
      const fieldKey = person ? person[2] : key;
      if (owner[fieldKey] === control.value) return;
      owner[fieldKey] = control.value;
      setMessage();
      renderSummary();
      reportChange();
    });
    root.addEventListener('toggle', event => {
      const links = event.target;
      if (links !== find('#ab-links') || links.open === state.showLinks) return;
      if (busy) { links.open = state.showLinks; return; }
      state.showLinks = links.open;
      reportChange();
    }, true);
    root.addEventListener('click', event => {
      if (busy && event.target.closest('#ab-links > summary')) { event.preventDefault(); return; }
      const control = event.target.closest('button[data-ab-action]');
      if (!control || control.disabled) return;
      const { abAction: action, abKey: key } = control.dataset;
      if (action === 'copy') { void copyPrompt(); return; }
      if (busy) return;
      if (action === 'step') { moveTo(Number(key)); return; }
      if (action === 'back') { moveTo(state.step - 1); return; }
      if (state.adaptive && runAdaptiveAction(action, key)) return;
      if (action === 'persona') {
        const picked = core.picks(state);
        const index = Number(key);
        if (!picked.includes(index) && picked.length >= 2) {
          setMessage('이미 두 상황을 골랐어요. 다른 상황을 고르려면 하나를 먼저 해제해 주세요.');
          return;
        }
        state.picked[state.topic] = picked.includes(index) ? picked.filter(i => i !== index) : [...picked, index];
        updateButton(action, key);
      } else if (action === 'second') {
        state.second = !state.second;
        updateButton(action, key, state.second ? 'p1-why' : null);
      } else {
        const target = { topic: 'topic', goal: 'goal', 'person-mode': 'personaMode', mix: 'mix' }[action];
        if (!target) return;
        const focusField = key === 'custom' ? (action === 'topic' ? 'customTopic' : action === 'goal' ? 'customGoal' : null) : null;
        if (state[target] === key) {
          if (focusField) find(`#ab-${focusField}`)?.focus();
          return;
        }
        state[target] = key;
        updateButton(action, key, focusField);
      }
    });

    render();
    return {
      load(briefV1) {
        cancelSuggestion();
        composingTopic = false;
        const normalized = core.normalize(briefV1);
        state = structuredClone(normalized.adaptive || core.hasContent(briefV1) ? normalized : core.blankAdaptive());
        topicInput = state.adaptive?.text ?? '';
        render();
      },
      read,
      showProblem,
      focus,
      cancelSuggestion() {
        if (!suggestion) return;
        cancelSuggestion('AI 질문 초안 요청을 중지했어요.');
        refreshSuggestionPanel(true);
      },
      setBusy(value) {
        busy = Boolean(value);
        if (busy && suggestion) {
          cancelSuggestion('AI 질문 초안 요청을 중지했어요.');
          refreshSuggestionPanel();
        }
        root.toggleAttribute('data-ab-busy', busy);
        const active = doc.activeElement;
        const editing = active && root.contains(active) && active.matches('button:not([data-ab-action="copy"]), [data-ab-field], #ab-links > summary');
        if (busy && editing) focus();
        syncBusy();
      }
    };
  }

  window.AiBriefUI = { mount };
})();
