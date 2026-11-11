// 공통 필터 막대: 키워드 검색 · 제외 단어 · 숫자 범위(최소 ~ 최대)
// 대량 분석 · 키워드 중복 검사 · AI 키워드 생성기 결과에서 같이 써요.
// 입력칸은 한 번만 만들고 표만 다시 그려요 → 숫자가 거꾸로 써지거나 한글 입력이 끊기지 않아요.
window.FilterBar = function (el, { ranges = [], main = [], onChange = () => {}, placeholder = '키워드 검색 (여러 단어는 띄어쓰기)' } = {}) {
  const st = { q: '', ex: '', r: {} };
  const num = (s) => { const t = String(s ?? '').replace(/[,\s원%]/g, ''); return t === '' || isNaN(+t) ? null : +t; };
  const bad = (s) => String(s ?? '').trim() !== '' && num(s) == null;
  const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rangeHTML = ([k, label, unit]) => `<span class="fr" data-k="${k}"><span class="fl">${esc2(label)}</span><input class="fmin" inputmode="decimal" autocomplete="off" placeholder="최소" data-k="${k}"><span class="muted">~</span><input class="fmax" inputmode="decimal" autocomplete="off" placeholder="최대" data-k="${k}">${unit ? `<span class="muted fu">${esc2(unit)}</span>` : ''}</span>`;
  const mainR = ranges.filter((r) => main.includes(r[0]));
  const more = ranges.filter((r) => !main.includes(r[0]));
  el.innerHTML = `<div class="fbar">
      <input class="fq" autocomplete="off" placeholder="${esc2(placeholder)}">
      <input class="fex" autocomplete="off" placeholder="제외 단어">
      ${mainR.map(rangeHTML).join('')}
      ${more.length ? '<button type="button" class="btn fmore">상세 필터 ▾</button>' : ''}
      <button type="button" class="btn freset hidden">필터 초기화</button>
      <span class="fwarn"></span>
    </div>${more.length ? `<div class="fdetail hidden">${more.map(rangeHTML).join('')}<div class="muted fhint">범위는 그 값을 포함해요 (예: 최소 100 = 100 이상). 값이 없는 키워드(조회 안 됨·데이터 없음)는 범위를 지정하면 빠져요.</div></div>` : ''}`;
  const q = (s) => el.querySelector(s);
  let timer = null;
  const fire = () => { status(); clearTimeout(timer); timer = setTimeout(onChange, 120); };
  q('.fq').oninput = (e) => { st.q = e.target.value; fire(); };
  q('.fex').oninput = (e) => { st.ex = e.target.value; fire(); };
  el.querySelectorAll('.fmin,.fmax').forEach((inp) => (inp.oninput = () => {
    const k = inp.dataset.k;
    st.r[k] = st.r[k] || {};
    st.r[k][inp.classList.contains('fmin') ? 'min' : 'max'] = inp.value;
    fire();
  }));
  if (q('.fmore')) q('.fmore').onclick = () => { q('.fdetail').classList.toggle('hidden'); status(); };
  q('.freset').onclick = () => { reset(); onChange(); };

  const rangeOn = (k) => { const v = st.r[k]; return !!v && (num(v.min) != null || num(v.max) != null); };
  function active() { let n = (st.q.trim() ? 1 : 0) + (st.ex.trim() ? 1 : 0); for (const k in st.r) if (rangeOn(k)) n++; return n; }
  function status() {
    q('.freset').classList.toggle('hidden', !active());
    if (q('.fmore')) {
      const d = more.filter(([k]) => rangeOn(k)).length;
      q('.fmore').textContent = `상세 필터${d ? ` (${d})` : ''} ${q('.fdetail').classList.contains('hidden') ? '▾' : '▴'}`;
      q('.fmore').classList.toggle('on', !!d);
    }
    const warn = [];
    el.querySelectorAll('.fr').forEach((fr) => {
      const v = st.r[fr.dataset.k] || {};
      const a = num(v.min), b = num(v.max);
      const wrong = (a != null && b != null && a > b) || bad(v.min) || bad(v.max);
      fr.classList.toggle('bad', wrong);
      if (wrong) warn.push(`${fr.querySelector('.fl').textContent}: ${bad(v.min) || bad(v.max) ? '숫자만 넣어주세요' : '최소가 최대보다 커요'}`);
    });
    q('.fwarn').textContent = warn.join(' · ');
  }
  function sync() {
    q('.fq').value = st.q; q('.fex').value = st.ex;
    el.querySelectorAll('.fmin,.fmax').forEach((inp) => { const v = st.r[inp.dataset.k] || {}; inp.value = (inp.classList.contains('fmin') ? v.min : v.max) ?? ''; });
    status();
  }
  function reset() { st.q = ''; st.ex = ''; st.r = {}; sync(); }
  const nk = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  // getV(key) → 숫자 (없으면 null)
  function pass(kw, getV) {
    const k = nk(kw);
    const inc = st.q.split(/[,\s]+/).map(nk).filter(Boolean);
    if (inc.length && !inc.every((w) => k.includes(w))) return false;
    const exc = st.ex.split(/[,\s]+/).map(nk).filter(Boolean);
    if (exc.some((w) => k.includes(w))) return false;
    for (const key in st.r) {
      const a = num(st.r[key].min), b = num(st.r[key].max);
      if (a == null && b == null) continue;
      const v = getV(key);
      if (v == null || typeof v !== 'number' || isNaN(v)) return false;
      if (a != null && v < a) return false;
      if (b != null && v > b) return false;
    }
    return true;
  }
  status();
  return { st, pass, reset, sync, active };
};
