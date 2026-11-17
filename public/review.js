// 판정 엇갈림 정리: AI 판정이 엇갈린 키워드를 사용자에게 물어서 적합/부적합/보류로 확정
// AI 키워드 생성기와 대량 분석에서 같이 써요. 결정은 키워드의 decision 필드에 저장돼요.
(function () {
  const OPT = {
    get auto() { return localStorage.getItem('reviewAuto') !== '0'; },
    set auto(v) { localStorage.setItem('reviewAuto', v ? '1' : '0'); },
    get teach() { return localStorage.getItem('reviewTeach') !== '0'; },
    set teach(v) { localStorage.setItem('reviewTeach', v ? '1' : '0'); },
  };
  const isMixed = (it) => !it.decision && (((it.checks || []).slice(-1)[0] || {}).mix || ((it.checks || []).some((c) => c.pass) && (it.checks || []).some((c) => !c.pass)));
  // 최소 검색량 판정 (AI 생성기·대량 분석 공용)
  //  기준 이상 → AI 판정 그대로
  //  기준 미만 + 경쟁 높음 → AI 판정 그대로 (광고주가 몰리는 키워드라 검색량이 적어도 살림)
  //  기준 미만 + 경쟁 중간 → AI가 적합이면 '엇갈림' (사람이 정함), 부적합이면 부적합
  //  기준 미만 + 경쟁 낮음·정보 없음 → 부적합
  window.volGate = (v, minVol, comp, ai, label) => {
    const low = minVol > 0 && v !== null && v !== undefined && (v < 0 ? 0 : v) < minVol;
    if (!low) return { low: false, pass: !!ai.pass, reason: ai.reason };
    const base = `검색량 부족 (${label} < ${minVol})`;
    if (comp === '높음') return { low: true, pass: !!ai.pass, reason: ai.pass ? `검색량 낮지만 경쟁 높음 · ${ai.reason || '적합'}` : `${ai.reason} · 검색량 낮음` };
    if (comp === '중간' && ai.pass) return { low: true, pass: false, mix: true, reason: `${base} · 경쟁 중간 (확인 필요)` };
    return { low: true, pass: false, reason: `${base}${comp ? ` · 경쟁 ${comp}` : ''}${ai.pass ? '' : ' · ' + ai.reason}` };
  };
  // 키워드의 대표 부적합 사유 (가장 많이 나온 것)
  function failReason(it) {
    const m = new Map();
    for (const c of it.checks || []) if (!c.pass) { const r = String(c.reason || '사유 없음').replace(/\s+/g, ' ').trim(); m.set(r, (m.get(r) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '사유 없음';
  }
  // 묶음 이름: 검색량 부족은 하나로, 나머지는 사유 그대로
  const groupName = (r) => (/^검색량 부족/.test(r) ? '검색량 부족' : r);

  let box = null;
  function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'rv-bg hidden';
    box.innerHTML = '<div class="rv" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(box);
    box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.classList.contains('hidden')) close(); });
  }
  let cur = null;
  function close() { box.classList.add('hidden'); cur = null; }

  // items: 대상 키워드 배열 (checks 포함), volText(it): 검색량 표시, onApply(n): 적용 후 호출
  function open({ items, volText = () => '', onApply = () => {}, auto = false }) {
    ensure();
    const list = items.filter(isMixed);
    if (!list.length) { if (!auto) alert('판정이 엇갈린 키워드가 없어요.'); return false; }
    const choice = new Map(list.map((it) => [it, 'hold']));
    const groups = new Map();
    for (const it of list) { const g = groupName(failReason(it)); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
    const G = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    cur = { list, choice };
    const seg = (it, i) => `<span class="rv-seg" data-i="${i}">${[['ok', '적합'], ['bad', '부적합'], ['hold', '보류']].map(([v, l]) => `<button type="button" data-v="${v}" class="${choice.get(it) === v ? 'on ' + v : ''}">${l}</button>`).join('')}</span>`;
    const idx = new Map(list.map((it, i) => [it, i]));
    const reasons = (it) => {
      const cs = it.checks || [];
      const ok = [...new Set(cs.filter((c) => c.pass).map((c) => c.reason))].slice(0, 2), bad = [...new Set(cs.filter((c) => !c.pass).map((c) => c.reason))].slice(0, 2);
      return `<span class="rv-r ok">적합 ${cs.filter((c) => c.pass).length}회: ${esc(ok.join(' / ') || '-')}</span><span class="rv-r bad">부적합 ${cs.filter((c) => !c.pass).length}회: ${esc(bad.join(' / ') || '-')}</span>`;
    };
    const dlg = box.querySelector('.rv');
    dlg.innerHTML = `
      <div class="rv-head">
        <div><h3>판정이 엇갈린 키워드 ${list.length.toLocaleString('ko-KR')}개</h3>
          <div class="muted" style="font-size:12px">AI가 적합·부적합을 번갈아 냈어요. 어느 쪽으로 가져갈지 골라주세요. AI가 댄 부적합 사유별로 묶었어요.</div></div>
        <div class="rv-btns"><button type="button" class="btn" data-a="later">나중에</button><button type="button" class="btn pri" data-a="apply">적용</button></div>
      </div>
      <div class="rv-all">전체: <button type="button" class="btn" data-all="ok">모두 적합</button><button type="button" class="btn" data-all="bad">모두 부적합</button><button type="button" class="btn" data-all="hold">모두 보류</button>
        <span class="muted" id="rvCount" style="margin-left:auto"></span></div>
      <div class="rv-body">
        ${G.map(([g, its], gi) => `<div class="rv-g">
          <div class="rv-gh"><b>${esc(g)}</b> <span class="muted">${its.length}개</span><span style="flex:1"></span>
            <button type="button" class="btn sm" data-g="${gi}" data-gv="ok">이 묶음 적합</button><button type="button" class="btn sm" data-g="${gi}" data-gv="bad">이 묶음 부적합</button></div>
          ${its.map((it) => `<div class="rv-row"><div class="rv-k"><b>${esc(it.keyword)}</b> <span class="muted">${esc(volText(it) || '')}</span><div class="rv-rs">${reasons(it)}</div></div>${seg(it, idx.get(it))}</div>`).join('')}
        </div>`).join('')}
      </div>
      <div class="rv-foot">
        <label class="inl"><input type="checkbox" id="rvTeach" ${OPT.teach ? 'checked' : ''}> 내 결정을 다음 재검증 때 AI에게 예시로 알려주기 (비슷한 키워드를 같은 기준으로 판정)</label>
        <label class="inl"><input type="checkbox" id="rvAuto" ${OPT.auto ? 'checked' : ''}> 재검증이 끝나면 엇갈린 키워드를 자동으로 물어보기</label>
        <div class="muted" style="font-size:12px;line-height:1.6">적합 → "적합 (직접)", 부적합 → "부적합 (직접)"으로 확정돼요. 확정한 키워드는 다음 재검증에서 빠지고, 부적합은 [부적합 선택](AI 생성기) / [부적합만 체크](대량 분석)로 골라 지울 수 있어요. 보류는 엇갈림 그대로 남아요. 표에서 [직접 판정 취소]로 되돌릴 수 있어요.</div>
      </div>`;
    const count = () => {
      const c = { ok: 0, bad: 0, hold: 0 };
      for (const v of choice.values()) c[v]++;
      dlg.querySelector('#rvCount').textContent = `적합 ${c.ok} · 부적합 ${c.bad} · 보류 ${c.hold}`;
    };
    const paint = () => {
      dlg.querySelectorAll('.rv-seg').forEach((s) => { const it = list[+s.dataset.i]; s.querySelectorAll('button').forEach((b) => (b.className = choice.get(it) === b.dataset.v ? 'on ' + b.dataset.v : '')); });
      count();
    };
    dlg.querySelectorAll('.rv-seg button').forEach((b) => (b.onclick = () => { choice.set(list[+b.parentElement.dataset.i], b.dataset.v); paint(); }));
    dlg.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => { list.forEach((it) => choice.set(it, b.dataset.all)); paint(); }));
    dlg.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { G[+b.dataset.g][1].forEach((it) => choice.set(it, b.dataset.gv)); paint(); }));
    dlg.querySelector('#rvTeach').onchange = (e) => (OPT.teach = e.target.checked);
    dlg.querySelector('#rvAuto').onchange = (e) => (OPT.auto = e.target.checked);
    dlg.querySelector('[data-a="later"]').onclick = close;
    dlg.querySelector('[data-a="apply"]').onclick = () => {
      let n = 0;
      for (const [it, v] of choice) {
        if (v === 'hold') continue;
        it.decision = { pass: v === 'ok', reason: v === 'ok' ? '직접 적합' : failReason(it), at: Date.now() };
        n++;
      }
      close();
      onApply(n);
    };
    count();
    box.classList.remove('hidden');
    dlg.scrollTop = 0;
    return true;
  }
  // 다음 재검증 때 AI에 보낼 예시 (최근 결정 60개)
  function judged(items) {
    if (!OPT.teach) return [];
    return items.filter((it) => it.decision).sort((a, b) => a.decision.at - b.decision.at).slice(-60).map((it) => ({ keyword: it.keyword, pass: it.decision.pass, reason: it.decision.pass ? '' : it.decision.reason }));
  }
  window.MixedReview = { open, isMixed, judged, opt: OPT };
})();
