import plColumns from './public/pl-columns.js';
// 기간별 광고 보고서와 현장 순위 스냅샷을 분리해 비교한다. 외부 호출 없음.
const DAY = 86400000;
export const keyOf = v => String(v ?? '').trim().replace(/\s+/g, '').toUpperCase();
export function periodOf(start, end) {
  const date = v => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return NaN;
    const x = Date.parse(v + 'T00:00:00Z');
    return Number.isFinite(x) && new Date(x).toISOString().slice(0, 10) === v ? x : NaN;
  };
  const a = date(start), b = date(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) throw new Error('광고 보고서의 시작일과 종료일을 올바르게 입력하세요.');
  return { start, end, days: 1 + (b - a) / DAY };
}
const count = v => {
  const s = String(v ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(s)) return null;
  const n = Number(s.replaceAll(',', ''));
  return Number.isSafeInteger(n) ? n : null;
};
export function reports(sources = []) {
  const rows = new Map(); let tables = 0;
  for (const source of sources) for (const s of source.sheets) {
    let col = null;
    for (const row of s.rows) {
      const idx = plColumns.columns(row);
      if (idx.kw >= 0 && idx.imp >= 0 && idx.clk >= 0) { if (!col) tables++; col = idx; continue; }
      if (!col) continue;
      const kw = String(row[col.kw] ?? '').trim(), key = keyOf(kw);
      if (!kw || /^(합계|총계|소계|전체|총합계|전체합계|TOTALS?|키워드[\d,]+개결과)$/i.test(key)) continue;
      if (rows.has(key)) { rows.get(key).duplicate = true; continue; }
      rows.set(key, { kw, imp: count(row[col.imp]), clk: count(row[col.clk]) });
    }
  }
  return { rows, tables };
}
const avgRank = x => x?.n > 0 && x.seen > 0 && Number.isFinite(x.avg) ? x.avg : null;
const delta = (x, y) => x == null || y == null ? null : y - x;
const pct = (x, y) => x > 0 && y != null ? (y / x - 1) * 100 : null;
const sum = (a, k) => a.reduce((n, r) => n + r[k], 0);
const ctr = (i, c) => i > 0 && c != null ? c / i : null;
const fmt = n => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export function comparePowerlink(a, b, sourcesA, sourcesB, pa, pb) {
  if (pa.end >= pb.start) throw new Error('겹치지 않는 기간을 선택하세요. 기준 기간이 비교 기간보다 먼저여야 해요.');
  const scope = j => [...new Set(j.urls.map(v => String(v).trim()))].sort().join('\n');
  if (scope(a) !== scope(b)) throw new Error('두 분석의 내 광고 URL 목록이 달라요. 같은 광고 범위의 결과를 선택하세요.');
  const A = reports(sourcesA), B = reports(sourcesB);
  const R = j => new Map(j.rows.filter(r => r.on !== false).map(r => [keyOf(r.kw), r]));
  const ra = R(a), rb = R(b), dev = a.devices.filter(d => b.devices.includes(d));
  const keys = new Set([...ra.keys(), ...rb.keys(), ...A.rows.keys(), ...B.rows.keys()]);
  const rows = [...keys].map(key => {
    const x = A.rows.get(key), y = B.rows.get(key);
    const duplicate = !!(x?.duplicate || y?.duplicate);
    const ok = !duplicate && x?.imp != null && y?.imp != null && x.clk != null && y.clk != null;
    const ai = x?.duplicate ? null : x?.imp ?? null, bi = y?.duplicate ? null : y?.imp ?? null;
    const ac = x?.duplicate ? null : x?.clk ?? null, bc = y?.duplicate ? null : y?.clk ?? null;
    const rank = Object.fromEntries(dev.map(d => {
      const p = ra.get(key)?.res?.[d], q = rb.get(key)?.res?.[d];
      const av = avgRank(p), bv = avgRank(q);
      return [d, { a: av, b: bv, change: delta(av, bv), aMiss: p?.n > 0 && p.seen === 0, bMiss: q?.n > 0 && q.seen === 0 }];
    }));
    return { kw: x?.kw || y?.kw || ra.get(key)?.kw || rb.get(key)?.kw, ai, bi, ac, bc, ok, duplicate, rank,
      aOnly: !!x && !y, bOnly: !!y && !x, di: ok ? bi / pb.days - ai / pa.days : null, dc: ok ? bc / pb.days - ac / pa.days : null, daCtr: ok ? delta(ctr(ai, ac), ctr(bi, bc)) : null };
  });
  const common = rows.filter(r => r.ok);
  const ai = sum(common, 'ai'), bi = sum(common, 'bi'), ac = sum(common, 'ac'), bc = sum(common, 'bc');
  const ia = ai / pa.days, ib = bi / pb.days, ca = ac / pa.days, cb = bc / pb.days;
  const ta = ctr(ai, ac), tb = ctr(bi, bc);
  const rank = dev.map(d => {
    const matches = rows.map(r => r.rank[d]);
    const both = matches.filter(r => r.change != null);
    return { dev: d, paired: both.length, avgA: both.length ? sum(both, 'a') / both.length : null, avgB: both.length ? sum(both, 'b') / both.length : null, down: both.filter(r => r.change > 0).length, lost: matches.filter(r => r.a != null && r.bMiss).length };
  });
  const notes = [];
  if (!common.length) notes.push('같은 키워드의 실제 노출수·클릭수를 양쪽에서 확인할 수 없어요. 머리글과 보고서 범위를 확인하세요.');
  else if (cb < ca) {
    if (ta != null && tb != null) {
      const exposure = (ib - ia) * ta, response = ib * (tb - ta);
      notes.push(`클릭/일 감소 ${fmt(ca - cb)}건: 노출량 변화 ${fmt(exposure)}건, CTR 변화 ${fmt(response)}건 기여 (기준 CTR로 분해). 원인 단정은 아니에요.`);
      if (exposure < 0) notes.push('노출 감소: 같은 기간의 검색 수요, 입찰가 변경, 예산 소진, 광고 상태·경쟁 변화를 확인하세요.');
      if (response < 0) notes.push('CTR 하락: 소재 변경, 검색어 구성, 기기 구성과 게재 위치 변화부터 확인하세요.');
    } else notes.push('클릭/일은 줄었지만 한쪽 노출이 0건이라 CTR 기여를 분리하지 않았어요.');
  } else notes.push('비교 가능한 키워드 합계에서는 클릭/일이 감소하지 않았어요. 개별 하락 키워드를 확인하세요.');
  if (rank.some(r => r.down || r.lost)) notes.push('현장 순위 하락·미노출 전환이 있어요. 스냅샷은 보고서 기간 평균이 아니므로 클릭 하락의 원인으로 단정할 수 없어요.');
  const biggest = common.filter(r => r.dc < 0).sort((x, y) => x.dc - y.dc).slice(0, 3);
  if (biggest.length) notes.push('클릭 감소 기여 상위: ' + biggest.map(r => r.kw.replace(/\s+/g, '') + ' ' + fmt(r.dc) + '건/일').join(', ') + '.');
  if (pa.days !== pb.days) notes.push('기간 길이가 달라 감소 진단은 일평균을 기준으로 했어요. 요일 구성과 공휴일 차이는 별도 확인이 필요해요.');
  const known = k => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  return { pa, pb, dev, rank, rows: rows.sort((x, y) => (x.dc ?? Infinity) - (y.dc ?? Infinity) || (x.di ?? Infinity) - (y.di ?? Infinity)), notes,
    summary: { matched: common.length, duplicates: rows.filter(r => r.duplicate).length, onlyA: rows.filter(r => r.aOnly).length, onlyB: rows.filter(r => r.bOnly).length, tablesA: A.tables, tablesB: B.tables,
      coverageA: known('ai') > 0 ? ai / known('ai') : null, coverageB: known('bi') > 0 ? bi / known('bi') : null,
      ai, bi, ac, bc, ia, ib, ca, cb, impPct: pct(ia, ib), clkPct: pct(ca, cb), ta, tb } };
}
