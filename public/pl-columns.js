// 파워링크 보고서의 열 위치는 원본마다 다르므로 화면과 서버가 동일한 머리글 규칙을 사용한다.
(function () {
  const clean = v => String(v ?? '').normalize('NFKC').toUpperCase().replace(/[\s\u200B-\u200D\uFEFF()_·-]/g, '');
  const names = {
    kw: /^(키워드|키워드명|등록키워드|KEYWORD|KEYWORDNAME)$/,
    bid: /^(현재)?입찰가(원)?$|^BID$/,
    state: /^(키워드|광고)?상태$|^STATUS$/,
    pc: /^PC(통검|통합검색)?평균노출순위(위)?$/,
    mo: /^(모바일|MOBILE)(통검|통합검색)?평균노출순위(위)?$/,
    imp: /^(총|전체)?(노출수|노출횟수)(회|건)?$|^IMPRESSIONS?$/,
    clk: /^(총|전체)?(클릭수|클릭횟수)(회|건)?$|^CLICKS?$/,
  };
  function columns(row) {
    const h = row.map(clean);
    return Object.fromEntries(Object.entries(names).map(([k,re]) => [k,h.findIndex(v => re.test(v))]));
  }
  function find(rows) {
    let fallback = null;
    for (const [at,row] of rows.entries()) {
      if (!Array.isArray(row)) continue;
      const col = columns(row);
      if (col.kw < 0) continue;
      if (Object.entries(col).some(([k,v]) => k !== 'kw' && v >= 0)) return {at,col};
      if (!fallback) fallback = {at,col};
    }
    return fallback;
  }
  const api = { clean, columns, find };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PowerlinkColumns = api;
})();
