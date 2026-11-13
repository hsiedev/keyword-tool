// 구글 모드 · 키워드 분석 (무료 방식만)
// - 자동완성: 구글 · 유튜브 (suggestqueries, 키 없음)
// - 구글 트렌드: 웹사이트가 쓰는 비공식 주소 (키 없음). 요청이 몰리면 429로 막혀서 간격 · 재시도 · 메모리 저장, 안 되면 트렌드 CSV 가져오기
// - 키워드 플래너: 구글 광고 화면에서 내려받은 CSV를 가져와 data\google\planner.json에 모아 둠 (광고비 없는 계정은 검색량이 범위)
// - 유튜브: YouTube Data API 키가 있을 때만 (검색 하루 100회 무료)
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HOUR = 3600e3;
const CONSONANTS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const normKey = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const jsonAfter = (t) => JSON.parse(String(t).slice(String(t).indexOf('{')));

// ---------------------------------------------------------------- 숫자 · 범위 읽기 ("1천~1만", "1K – 10K", "8,100", "₩1,234")
const UNIT = { k: 1e3, m: 1e6, b: 1e9, 천: 1e3, 만: 1e4, 십만: 1e5, 백만: 1e6, 천만: 1e7, 억: 1e8 };
function num1(s) {
  const m = String(s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(십만|백만|천만|k|m|b|천|만|억)?/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2] ? UNIT[m[2].toLowerCase()] || 1 : 1));
}
export function parseVolume(s) {
  const t = String(s ?? '').trim();
  if (!t || /^[-–—]$/.test(t)) return null;
  const parts = t.replace(/,/g, '').split(/\s*[–~—]\s*|\s+-\s+/).filter(Boolean);
  if (parts.length >= 2) { const lo = num1(parts[0]), hi = num1(parts[1]); if (lo != null && hi != null) return { lo, hi }; }
  const v = num1(t);
  return v == null ? null : { lo: v, hi: v };
}
const money = (s) => { const t = String(s ?? '').replace(/[^\d.]/g, ''); return t ? Math.round(parseFloat(t) * 100) / 100 : null; };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function ym(label) {
  const s = String(label);
  const y = s.match(/(20\d\d)/);
  if (!y) return null;
  let mo = null;
  const ko = s.match(/(\d{1,2})\s*월/);
  if (ko) mo = +ko[1];
  else { const en = s.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/); if (en) mo = MONTHS[en[1]]; else { const d = s.match(/20\d\d[.\-/ ]+(\d{1,2})/); if (d) mo = +d[1]; } }
  return mo ? `${y[1]}-${String(mo).padStart(2, '0')}` : null;
}

// ---------------------------------------------------------------- CSV (쉼표 · 탭, 따옴표)
export function splitCsv(text) {
  const t = String(text || '').replace(/^\ufeff/, '');
  const first = t.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = (first.match(/\t/g) || []).length >= (first.match(/,/g) || []).length && /\t/.test(t.slice(0, 5000)) ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim()));
}

// ---------------------------------------------------------------- 키워드 플래너 CSV
// 구글 광고 › 키워드 플래너 › [다운로드] 파일 (영어 · 한국어 화면 모두). 첫 줄 몇 개는 제목 · 기간이라 '키워드' 칸이 있는 줄을 머리글로 씀
export function parsePlannerCsv(text) {
  const rows = splitCsv(text);
  const hi = rows.findIndex((r, i) => i < 15 && r.some((c) => /^(keyword|키워드)$/i.test(c)));
  if (hi < 0) throw new Error("키워드 플래너 파일이 아닌 것 같아요 ('키워드' 칸을 찾지 못했어요)");
  const head = rows[hi];
  const find = (re, not) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const MONTHLY = /^(searches|검색(수|량)?)\s*[:：]/i;
  const col = {
    kw: find(/^(keyword|키워드)$/i),
    currency: find(/currency|통화/i),
    avg: find(/avg\.? ?monthly searches|평균.*검색|월간.*검색|월평균/i, MONTHLY),
    chg3m: find(/three month|3개월/i),
    yoy: find(/yoy|year over year|전년/i),
    compIdx: find(/indexed|색인|지수/i),
    comp: find(/^(competition|경쟁)$/i),
    bidLow: find(/low range|낮은 범위|하단|최저/i),
    bidHigh: find(/high range|높은 범위|상단 입찰가\(높|최고/i),
  };
  if (col.comp < 0) col.comp = find(/competition|경쟁/i, /indexed|색인|지수/i);
  const months = head.map((h, i) => (MONTHLY.test(h) ? { i, ym: ym(h) } : null)).filter((x) => x && x.ym);
  const out = [];
  let ranged = 0;
  for (const r of rows.slice(hi + 1)) {
    const kw = (r[col.kw] || '').trim();
    if (!kw) continue;
    const avg = col.avg >= 0 ? parseVolume(r[col.avg]) : null;
    if (avg && avg.lo !== avg.hi) ranged++;
    const comp = (r[col.comp] || '').trim();
    out.push({
      keyword: kw,
      avg,
      months: months.map((m) => ({ ym: m.ym, v: parseVolume(r[m.i]) })).filter((m) => m.v),
      comp: /low|낮/i.test(comp) ? '낮음' : /medium|중간/i.test(comp) ? '중간' : /high|높/i.test(comp) ? '높음' : comp || '',
      compIdx: col.compIdx >= 0 && r[col.compIdx] !== '' ? Number(String(r[col.compIdx]).replace(/[^\d.]/g, '')) || 0 : null,
      bidLow: col.bidLow >= 0 ? money(r[col.bidLow]) : null,
      bidHigh: col.bidHigh >= 0 ? money(r[col.bidHigh]) : null,
      currency: col.currency >= 0 ? r[col.currency] || '' : '',
      chg3m: col.chg3m >= 0 ? r[col.chg3m] || '' : '',
      yoy: col.yoy >= 0 ? r[col.yoy] || '' : '',
    });
  }
  return { rows: out, ranged, months: months.map((m) => m.ym), found: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, v >= 0])) };
}

// ---------------------------------------------------------------- 구글 트렌드 (응답 · CSV)
export function parseTrendsTimeline(j) {
  return (j?.default?.timelineData || []).map((x) => ({ t: Number(x.time) * 1000, label: x.formattedAxisTime || x.formattedTime || '', v: Array.isArray(x.value) ? Number(x.value[0]) || 0 : 0, partial: !!x.isPartial }));
}
export function parseTrendsRelated(j) {
  const L = j?.default?.rankedList || [];
  const map = (l) => (l?.rankedKeyword || []).map((x) => ({ query: x.query || x.topic?.title || '', value: x.formattedValue ?? String(x.value ?? '') })).filter((x) => x.query);
  return { top: map(L[0]), rising: map(L[1]) };
}
export function parseTrendsGeo(j) {
  return (j?.default?.geoMapData || []).filter((x) => !x.hasData || x.hasData[0]).map((x) => ({ name: x.geoName, v: Array.isArray(x.value) ? Number(x.value[0]) || 0 : 0 })).filter((x) => x.v > 0);
}
// 트렌드 웹사이트의 [내보내기] CSV: multiTimeline.csv · relatedQueries.csv · geoMap.csv
export function parseTrendsCsv(text) {
  const rows = splitCsv(text).filter((r) => r.some((c) => c !== ''));
  const out = {};
  const hi = rows.findIndex((r) => /^(주|일|월|week|day|month|time)$/i.test(r[0] || '') && r.length >= 2);
  if (hi >= 0) {
    out.keyword = String(rows[hi][1] || '').replace(/\s*:\s*\(.*\)\s*$/, '').trim();
    out.timeline = rows.slice(hi + 1).filter((r) => /^\d{4}-\d{2}(-\d{2})?$/.test(r[0])).map((r) => ({ t: Date.parse(r[0].length === 7 ? r[0] + '-01' : r[0]), label: r[0], v: Number(String(r[1]).replace('<', '')) || 0, partial: false }));
  }
  const gi = rows.findIndex((r) => /^(지역|시\/도|region|subregion|city|도시|국가|country)$/i.test(r[0] || '') && r.length >= 2);
  if (gi >= 0) out.regions = rows.slice(gi + 1).filter((r) => r[0] && /^\d+$/.test(String(r[1]).replace('<', ''))).map((r) => ({ name: r[0], v: Number(String(r[1]).replace('<', '')) || 0 })).filter((x) => x.v > 0);
  const ti = rows.findIndex((r) => /^(top|상위|인기)$/i.test((r[0] || '').trim()));
  const ri = rows.findIndex((r) => /^(rising|급상승|급등)$/i.test((r[0] || '').trim()));
  if (ti >= 0 || ri >= 0) {
    const take = (from, to) => (from < 0 ? [] : rows.slice(from + 1, to > from ? to : undefined).filter((r) => r[0] && r.length >= 2).map((r) => ({ query: r[0], value: r[1] })));
    out.related = { top: take(ti, ri), rising: take(ri, ti > ri ? ti : -1) };
  }
  if (!out.timeline && !out.regions && !out.related) throw new Error('구글 트렌드 CSV가 아닌 것 같아요 (multiTimeline · relatedQueries · geoMap 파일을 넣어주세요)');
  return out;
}

// ---------------------------------------------------------------- 실행부
export function createGoogle({ dataDir, cached, getConfig, fetchFn = (...a) => fetch(...a), wait = sleep }) {
  const F = (...a) => fetchFn(...a);
  const DIR = path.join(dataDir, 'google');
  const PLANNER = path.join(DIR, 'planner.json');
  const TR_IMPORT = path.join(DIR, 'trends-import.json');
  const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
  const writeJson = (f, v) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };

  // 자동완성 (구글 · 유튜브)
  async function ac(q, ds) {
    const r = await F(`https://suggestqueries.google.com/complete/search?client=firefox${ds ? '&ds=' + ds : ''}&hl=ko&gl=kr&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error((ds ? '유튜브' : '구글') + ' 자동완성 ' + r.status);
    const j = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8'));
    return (j[1] || []).map((x) => String(x).trim()).filter(Boolean);
  }
  async function suggest(keyword, deep) {
    return cached('gsug:' + (deep ? 'd:' : '') + keyword, 6 * HOUR, async () => {
      const errors = [];
      const safe = async (name, fn) => { try { return await fn(); } catch (e) { errors.push(name + ': ' + e.message); return []; } };
      const [google, youtube] = await Promise.all([safe('구글 자동완성', () => ac(keyword)), safe('유튜브 자동완성', () => ac(keyword, 'yt'))]);
      const dg = [], dy = [];
      if (deep) for (const c of CONSONANTS) { dg.push(...(await safe('구글(' + c + ')', () => ac(keyword + ' ' + c)))); dy.push(...(await safe('유튜브(' + c + ')', () => ac(keyword + ' ' + c, 'yt')))); await wait(120); }
      const seen = new Set([normKey(keyword)]), all = [];
      const add = (kw, src) => { const k = normKey(kw); if (!k) return; const hit = all.find((x) => x.k === k); if (hit) { if (!hit.src.includes(src)) hit.src.push(src); return; } if (seen.has(k)) return; all.push({ k, keyword: kw, src: [src] }); };
      [...google, ...dg].forEach((x) => add(x, '구글'));
      [...youtube, ...dy].forEach((x) => add(x, '유튜브'));
      return { keyword, deep: !!deep, google, youtube, all: all.map(({ keyword: kw, src }) => ({ keyword: kw, src })), errors, fetchedAt: new Date().toISOString() };
    });
  }

  // 구글 트렌드 (비공식): 쿠키 받기 → explore(위젯 토큰) → 추이 · 관련 검색어 · 지역
  let cookie = '', cookieAt = 0;
  async function getCookie(force) {
    if (cookie && !force && Date.now() - cookieAt < 30 * 60e3) return cookie;
    try {
      const r = await F('https://trends.google.com/trends/?geo=KR&hl=ko', { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
      const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
      cookie = sc.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
      cookieAt = Date.now();
    } catch {}
    return cookie;
  }
  async function tget(url) {
    for (let i = 0; i < 3; i++) {
      const r = await F(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Cookie: await getCookie(i > 0), Referer: 'https://trends.google.com/trends/explore?geo=KR&hl=ko' } });
      if (r.status === 429) { await wait(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error('응답 ' + r.status);
      return jsonAfter(await r.text());
    }
    throw new Error('구글이 요청을 잠시 막았어요 (429). 몇 분 뒤 다시 하거나 트렌드 CSV를 가져와 주세요');
  }
  const TR = new Map(); // 메모리 저장: 성공 12시간, 일부 실패 10분
  async function trends(keyword, { force = false } = {}) {
    const k = normKey(keyword);
    const hit = TR.get(k);
    if (hit && !force && hit.exp > Date.now()) return hit.v;
    const errors = [];
    const base = 'https://trends.google.com/trends/api';
    const out = { keyword, geo: 'KR', range: '최근 12개월', source: 'live', timeline: [], related: { top: [], rising: [] }, regions: [], errors, fetchedAt: new Date().toISOString() };
    try {
      const req = { comparisonItem: [{ keyword, geo: 'KR', time: 'today 12-m' }], category: 0, property: '' };
      const ex = await tget(`${base}/explore?hl=ko&tz=-540&req=${encodeURIComponent(JSON.stringify(req))}`);
      const W = (id) => (ex.widgets || []).find((w) => w.id === id);
      const wd = async (name, kind, w, parse, set) => {
        if (!w) return;
        try { set(parse(await tget(`${base}/widgetdata/${kind}?hl=ko&tz=-540&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${encodeURIComponent(w.token)}`))); }
        catch (e) { errors.push(name + ': ' + e.message); }
        await wait(900);
      };
      await wd('관심도 추이', 'multiline', W('TIMESERIES'), parseTrendsTimeline, (v) => (out.timeline = v));
      await wd('관련 검색어', 'relatedsearches', W('RELATED_QUERIES'), parseTrendsRelated, (v) => (out.related = v));
      await wd('지역', 'comparedgeo', W('GEO_MAP'), parseTrendsGeo, (v) => (out.regions = v));
    } catch (e) { errors.push('구글 트렌드: ' + e.message); }
    // 실시간으로 못 받은 부분은 가져온 CSV로 채움
    const imp = readJson(TR_IMPORT, {})[k];
    if (imp) {
      if (!out.timeline.length && imp.timeline?.length) { out.timeline = imp.timeline; out.timelineFrom = 'csv'; }
      if (!out.related.top.length && !out.related.rising.length && imp.related) { out.related = imp.related; out.relatedFrom = 'csv'; }
      if (!out.regions.length && imp.regions?.length) { out.regions = imp.regions; out.regionsFrom = 'csv'; }
      out.importedAt = imp.at;
    }
    if (!out.timeline.length && !errors.length) errors.push('관심도 추이: 데이터가 없어요 (검색이 아주 적은 키워드일 수 있어요)');
    TR.set(k, { v: out, exp: Date.now() + (errors.length ? 10 * 60e3 : 12 * HOUR) });
    return out;
  }
  function importTrendsCsv(keyword, text) {
    const p = parseTrendsCsv(text);
    const k = normKey(keyword || p.keyword);
    if (!k) throw new Error('어떤 키워드의 파일인지 모르겠어요. 키워드를 먼저 분석한 뒤 넣어주세요');
    const all = readJson(TR_IMPORT, {});
    all[k] = { ...(all[k] || {}), ...Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'keyword')), at: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    for (const old of keys.slice(300)) delete all[old];
    writeJson(TR_IMPORT, all);
    TR.delete(k);
    return { ok: true, keyword: keyword || p.keyword, got: Object.keys(p).filter((x) => x !== 'keyword') };
  }

  // 키워드 플래너 CSV 모음
  function plannerStore() { return readJson(PLANNER, { rows: {}, files: [] }); }
  function importPlanner(text, name) {
    const p = parsePlannerCsv(text);
    const st = plannerStore();
    let added = 0, updated = 0;
    for (const r of p.rows) { const k = normKey(r.keyword); if (!k) continue; if (st.rows[k]) updated++; else added++; st.rows[k] = { ...r, at: Date.now(), file: String(name || '').slice(0, 80) }; }
    st.files = [{ name: String(name || '파일').slice(0, 80), at: Date.now(), count: p.rows.length, ranged: p.ranged }, ...(st.files || [])].slice(0, 30);
    writeJson(PLANNER, st);
    return { ok: true, added, updated, count: p.rows.length, ranged: p.ranged, total: Object.keys(st.rows).length, months: p.months, found: p.found };
  }
  function plannerLookup(keyword) {
    const st = plannerStore();
    const k = normKey(keyword);
    const tokens = String(keyword || '').split(/\s+/).map(normKey).filter((t) => t.length >= 1);
    const rel = Object.entries(st.rows).filter(([kk]) => kk !== k && tokens.length && tokens.every((t) => kk.includes(t))).map(([, r]) => r)
      .sort((a, b) => (b.avg?.hi ?? -1) - (a.avg?.hi ?? -1) || (b.avg?.lo ?? -1) - (a.avg?.lo ?? -1));
    return { hit: st.rows[k] || null, related: rel.slice(0, 200), relatedTotal: rel.length, total: Object.keys(st.rows).length, files: st.files || [] };
  }
  function plannerClear() { writeJson(PLANNER, { rows: {}, files: [] }); return { ok: true }; }

  // 유튜브 (API 키 있을 때만)
  async function youtube(keyword) {
    const key = getConfig().youtubeKey;
    if (!key) return { missing: true };
    return cached('gyt:' + keyword, 12 * HOUR, async () => {
      const yt = async (p) => {
        const r = await F('https://www.googleapis.com/youtube/v3/' + p + '&key=' + encodeURIComponent(key));
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const reason = j.error?.errors?.[0]?.reason || '';
          if (/quota/i.test(reason)) throw new Error('오늘 유튜브 검색 한도(하루 100회)를 다 썼어요. 내일(태평양 시간 자정) 다시 돼요');
          if (r.status === 400 || /keyInvalid|API key not valid/i.test(JSON.stringify(j))) throw new Error('유튜브 API 키가 맞지 않아요');
          if (r.status === 403) throw new Error('유튜브 API를 쓸 수 없어요 (구글 클라우드에서 YouTube Data API v3를 [사용]으로 바꿨는지 확인해 주세요): ' + (j.error?.message || '').slice(0, 120));
          throw new Error('유튜브 응답 ' + r.status + ': ' + (j.error?.message || '').slice(0, 120));
        }
        return j;
      };
      const s = await yt(`search?part=snippet&type=video&maxResults=10&regionCode=KR&relevanceLanguage=ko&q=${encodeURIComponent(keyword)}`);
      const ids = (s.items || []).map((x) => x.id?.videoId).filter(Boolean);
      const v = ids.length ? await yt(`videos?part=statistics,contentDetails&id=${ids.join(',')}`) : { items: [] };
      const stat = Object.fromEntries((v.items || []).map((x) => [x.id, x]));
      return {
        total: s.pageInfo?.totalResults ?? null,
        videos: (s.items || []).map((x) => { const st = stat[x.id?.videoId]?.statistics || {}; return { id: x.id?.videoId, title: x.snippet?.title || '', channel: x.snippet?.channelTitle || '', publishedAt: x.snippet?.publishedAt || '', views: st.viewCount != null ? Number(st.viewCount) : null, likes: st.likeCount != null ? Number(st.likeCount) : null, comments: st.commentCount != null ? Number(st.commentCount) : null, duration: stat[x.id?.videoId]?.contentDetails?.duration || '' }; }),
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  // 서버 라우터에서 부름: [상태, 응답]
  async function handle(req, u, readBody) {
    const kw = String(u.searchParams.get('keyword') || '').trim().slice(0, 80);
    const need = () => { if (!kw) throw Object.assign(new Error('키워드를 넣어주세요'), { status: 400 }); };
    try {
      if (u.pathname === '/api/google/suggest') { need(); return [200, await suggest(kw, u.searchParams.get('deep') === '1')]; }
      if (u.pathname === '/api/google/trends') { need(); return [200, await trends(kw, { force: u.searchParams.get('force') === '1' })]; }
      if (u.pathname === '/api/google/trends-csv' && req.method === 'POST') { const b = await readBody(req); return [200, importTrendsCsv(b.keyword, String(b.text || ''))]; }
      if (u.pathname === '/api/google/youtube') { need(); return [200, await youtube(kw)]; }
      if (u.pathname === '/api/google/planner') {
        if (req.method === 'GET') return [200, plannerLookup(kw)];
        const b = await readBody(req);
        if (b.clear) return [200, plannerClear()];
        return [200, importPlanner(String(b.text || ''), b.name)];
      }
      return [404, { error: '없는 주소' }];
    } catch (e) { return [e.status || 200, { error: e.message }]; }
  }
  return { suggest, trends, importTrendsCsv, importPlanner, plannerLookup, plannerClear, youtube, handle };
}
