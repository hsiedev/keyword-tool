// 새 작업 제목 입력을 모든 작업 화면에서 같은 방식으로 표시한다.
(() => {
  const clean = value => String(value ?? '').trim().slice(0, 60);
  const field = id => `<div class="work-title"><label for="${id}">작업 제목 <span class="muted">선택</span></label><input id="${id}" type="text" class="inp" maxlength="60" placeholder="예: 11월 PC 이벤트 2차 분석" aria-describedby="${id}Hint"><small id="${id}Hint" class="muted">비워두면 제목을 자동으로 정해요.</small></div>`;
  function apply(doc, value) {
    const title = clean(value);
    doc.custom = Boolean(title);
    if (title) doc.name = title;
    return title;
  }
  window.WorkTitle = { clean, field, apply };
})();
