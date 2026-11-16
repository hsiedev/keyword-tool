// 켜기/끄기 옵션 체크박스 → 둥근 스위치 (부드럽게 움직이는 토글)
// - 대상: 이름표(label)가 붙은 옵션 체크박스 (설정, 생성 옵션, 기존 키워드 목록 켜기, 중복 검사 기준 등)
// - 제외: 표 안의 체크(키워드 고르기, 전체 선택), data-sel, .no-sw → 여러 개 고르는 용도라 체크박스 그대로
// - 새로 그려지는 화면도 자동으로 바꿈
(function () {
  const isOpt = (cb) => cb.type === 'checkbox' && !cb.closest('table') && !cb.hasAttribute('data-sel') && !cb.classList.contains('no-sw')
    && !!(cb.closest('label') || (cb.id && document.querySelector(`label[for="${CSS.escape(cb.id)}"]`)));
  function upgrade() { document.querySelectorAll('input[type=checkbox]:not(.sw)').forEach((cb) => { if (isOpt(cb)) cb.classList.add('sw'); }); }
  let raf = 0;
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; upgrade(); }); }).observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upgrade); else upgrade();
})();
