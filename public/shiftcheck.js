// Shift + 클릭으로 여러 줄 한 번에 체크 (앱 전체 공통)
// - 체크박스 하나를 누른 뒤, Shift를 누른 채 같은 목록의 다른 체크박스를 누르면 그 사이 줄도 모두 같은 상태(체크 또는 해제)로 바꿈
// - 대상: 표 본문 줄의 체크박스(키워드 고르기 등), 기존 키워드 목록(.src-row), 카피 카드(.cp-item), 열 맞춤 목록(.pl-col-item)
// - 제외: 머리글 체크(전체 선택), 표 안의 켜기/끄기 스위치(.sw), 꺼진(disabled) 체크, 숨겨진 줄, data-noshift
// - 줄마다 진짜 클릭처럼 .click() → 화면마다 따로 고칠 필요 없음. 표가 중간에 다시 그려져도 줄 키로 다시 찾음
(function () {
  const ROW = 'tr, .src-row, .cp-item, .pl-col-item';
  let last = null, busy = false;

  const rowOf = (cb) => cb.closest(ROW);
  const kindOf = (r) => r.tagName === 'TR' ? 'tr' : ['src-row', 'cp-item', 'pl-col-item'].find((c) => r.classList.contains(c)) || '';
  function ok(cb) {
    if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox' || cb.hasAttribute('data-noshift')) return false;
    const r = rowOf(cb);
    if (!r) return false;
    if (r.tagName === 'TR' && (cb.closest('thead') || !cb.closest('td') || cb.classList.contains('sw'))) return false;
    return true;
  }
  const sigOf = (cb) => [...cb.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')).sort().join(',')
    + '|' + (cb.name || '') + '|' + [...cb.classList].filter((c) => c !== 'sw').sort().join('.');
  const colOf = (cb, r) => r.tagName === 'TR' ? cb.closest('td').cellIndex : [...r.querySelectorAll('input[type=checkbox]')].indexOf(cb);
  const boxAt = (r, col) => r.tagName === 'TR' ? r.cells[col]?.querySelector('input[type=checkbox]') : r.querySelectorAll('input[type=checkbox]')[col];
  const keyOf = (cb) => { const r = rowOf(cb); return JSON.stringify([Object.entries(cb.dataset), Object.entries(r?.dataset || {})]); };
  const visible = (cb) => { const r = rowOf(cb); return !!r && r.getClientRects().length > 0 && cb.getClientRects().length > 0; };

  function describe(cb) {
    const r = rowOf(cb), root = r.parentElement?.closest('[id]') || document.body;
    return { rootId: root.id || '', root, kind: kindOf(r), col: colOf(cb, r), sig: sigOf(cb), key: keyOf(cb) };
  }
  const same = (a, b) => a.rootId === b.rootId && a.kind === b.kind && a.col === b.col && a.sig === b.sig && (a.rootId || a.root === b.root);
  function group(info) {
    const root = (info.rootId && document.getElementById(info.rootId)) || (info.root.isConnected ? info.root : document.body);
    const out = [];
    for (const r of root.querySelectorAll(ROW)) {
      if (kindOf(r) !== info.kind) continue;
      const cb = boxAt(r, info.col);
      if (cb && ok(cb) && sigOf(cb) === info.sig) out.push(cb);
    }
    return out;
  }

  function range(info, fromKey, toKey, state) {
    let g = group(info);
    const keys = g.map(keyOf);
    let i = keys.indexOf(fromKey), j = keys.indexOf(toKey);
    if (i < 0 || j < 0 || i === j) return;
    if (i > j) [i, j] = [j, i];
    const want = keys.slice(i, j + 1).filter((k) => k !== toKey);
    let map = new Map(g.map((c) => [keyOf(c), c]));
    busy = true;
    try {
      for (const k of want) {
        let c = map.get(k);
        if (!c || !c.isConnected) { map = new Map(group(info).map((x) => [keyOf(x), x])); c = map.get(k); } // 표가 다시 그려졌으면 새 줄에서
        if (!c || c.disabled || c.checked === state || !visible(c)) continue;
        c.click();
      }
    } finally { busy = false; }
    try { getSelection()?.removeAllRanges(); } catch {}
  }

  // Shift+클릭 때 글자가 드래그 선택되지 않게
  document.addEventListener('mousedown', (e) => {
    if (!e.shiftKey || !last) return;
    const t = e.target;
    const cb = t instanceof HTMLInputElement ? t : t.closest?.('label')?.querySelector('input[type=checkbox]');
    if (cb && ok(cb)) e.preventDefault();
  }, true);

  document.addEventListener('click', (e) => {
    if (busy) return;
    const cb = e.target;
    if (!ok(cb)) return;
    const info = describe(cb);
    if (e.shiftKey && last && same(last, info) && last.key !== info.key) {
      const from = last.key, state = cb.checked;
      setTimeout(() => range(info, from, info.key, state), 0); // 누른 칸의 화면 처리가 끝난 뒤 사이 줄 처리
    }
    last = info; // 다음 Shift+클릭의 기준
  }, true);

  window.__SHIFTCHECK = { get last() { return last; } };
})();
