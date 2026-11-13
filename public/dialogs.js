// 화면 안 알림 · 확인창 (브라우저 기본 alert / confirm 대신)
// - toast(msg, type): 오른쪽 아래에 잠깐 뜨는 알림. type: 'info' | 'ok' | 'err'
// - uiConfirm(msg, { ok, cancel, danger }): 확인창. Promise<boolean>. Enter = 확인, Esc = 취소
// - uiPrompt(msg, { value, placeholder, max }): 한 줄 입력창. Promise<string|null>
// - window.alert 는 toast 로 바꿔서 기존 코드도 그대로 동작
(function () {
  const esc2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nl = (s) => esc2(s).replace(/\n/g, '<br>');
  let box = null;
  const host = () => { if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); } return box; };

  function toast(msg, type = 'info', ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<div class="toast-msg">${nl(msg)}</div><button type="button" class="toast-x" aria-label="닫기">×</button>`;
    host().appendChild(el);
    const life = ms ?? Math.min(9000, 3000 + String(msg).length * 45);
    let t = setTimeout(close, life);
    el.onmouseenter = () => clearTimeout(t);
    el.onmouseleave = () => { t = setTimeout(close, 1500); };
    el.querySelector('.toast-x').onclick = close;
    function close() { clearTimeout(t); el.classList.add('out'); setTimeout(() => el.remove(), 200); }
    while (host().children.length > 4) host().firstChild.remove();
    return close;
  }

  function uiConfirm(msg, opt = {}) {
    return new Promise((resolve) => {
      const danger = opt.danger ?? /삭제|지울|지우|비울|비우|되돌릴|초기화/.test(msg);
      const bg = document.createElement('div');
      bg.className = 'cfm-bg';
      bg.innerHTML = `<div class="cfm" role="alertdialog" aria-modal="true" aria-labelledby="cfmMsg">
        <div class="cfm-msg" id="cfmMsg">${nl(msg)}</div>
        <div class="cfm-btns"><button type="button" class="btn" data-v="0">${esc2(opt.cancel || '취소')}</button><button type="button" class="btn ${danger ? 'danger-solid' : 'pri'}" data-v="1">${esc2(opt.ok || (danger ? '삭제·진행' : '확인'))}</button></div></div>`;
      document.body.appendChild(bg);
      const prev = document.activeElement;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); bg.remove(); try { prev?.focus?.(); } catch {} resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      document.addEventListener('keydown', onKey, true);
      bg.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => done(b.dataset.v === '1')));
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(false); });
      bg.querySelector('[data-v="1"]').focus();
    });
  }


  // 한 줄 입력창: Promise<string|null>. Enter = 확인, Esc = 취소
  function uiPrompt(msg, opt = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'cfm-bg';
      bg.innerHTML = `<div class="cfm" role="dialog" aria-modal="true" aria-labelledby="cfmMsg">
        <div class="cfm-msg" id="cfmMsg">${nl(msg)}</div>
        <input class="inp" style="margin-top:10px" maxlength="${opt.max || 200}" placeholder="${esc2(opt.placeholder || '')}" value="${esc2(opt.value || '')}">
        <div class="cfm-btns"><button type="button" class="btn" data-v="0">취소</button><button type="button" class="btn pri" data-v="1">${esc2(opt.ok || '확인')}</button></div></div>`;
      document.body.appendChild(bg);
      const inp = bg.querySelector('input');
      const prev = document.activeElement;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); bg.remove(); try { prev?.focus?.(); } catch {} resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); done(inp.value.trim() || null); }
      };
      document.addEventListener('keydown', onKey, true);
      bg.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => done(b.dataset.v === '1' ? inp.value.trim() || null : null)));
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(null); });
      inp.focus(); inp.select();
    });
  }

  window.toast = toast;
  window.uiPrompt = uiPrompt;
  window.uiConfirm = uiConfirm;
  // 기존 alert 호출은 화면 안 알림으로 (오류 문구면 빨간색)
  window.alert = (m) => { const s = String(m ?? ''); toast(s, /실패|오류|못했|못 읽|못 열|에러|error|막았/i.test(s) ? 'err' : 'info'); };
})();
