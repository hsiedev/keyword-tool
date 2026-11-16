// 로컬 키워드 분석기 서버 (외부 패키지 없이 Node.js 18+ 에서 실행)
// 실행: node server.mjs  ->  http://localhost:8787

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings-defaults.mjs';
import { parseSections } from './sections.mjs';
import { CLI, CLI_MODELS, cliPath, runCli, cliStatus, cliTest, openConsole, cliJobs, cliModels } from './ai-cli.mjs';
import { createGitSync } from './github-sync.mjs';
import { createGoogle } from './google-core.mjs';
import { assertAdAllowed } from './ad-guard.mjs';
import { parsePowerlinks, copyGenerateRequest, cleanCopyItems, copyVerifyRequest, cleanVerifyItems, createStore, copyMeta, mockMeta } from './copy-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CACHE_PATH = path.join(__dirname, 'cache.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SOURCES_PATH = path.join(__dirname, 'data', 'existing-keywords.json');
const SETTINGS_PATH = path.join(__dirname, 'data', 'settings.json');
const BULK_DIR = path.join(__dirname, 'data', 'bulk-history'); // 대량 분석 내역 (탭 하나 = 파일 하나)
const BULK_INDEX = path.join(BULK_DIR, 'index.json');
const COPY_STORE = createStore(path.join(__dirname, 'data', 'copy-projects'), copyMeta); // AI 카피 생성기 탭
const GOOGLE = createGoogle({ dataDir: path.join(__dirname, 'data'), cached: (...a) => cached(...a), getConfig: () => config }); // 구글 모드 (무료 방식)
const MOCK_STORE = createStore(path.join(__dirname, 'data', 'ad-mock'), mockMeta); // 광고 목업 캠페인
let SETTINGS = DEFAULT_SETTINGS;
try { SETTINGS = normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))); } catch { SETTINGS = normalizeSettings({}); }
const RA = () => SETTINGS.rules.analysis;
const RG = () => SETTINGS.rules.generate;
const RV = () => SETTINGS.rules.verify;
const words = (s) => String(s || '').split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);

// ---------------------------------------------------------------- 설정
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
// Claude·GPT는 API(유료) 대신 로그인형 CLI로 바뀜 → 예전 API 키는 설정 파일에서 지움
if (config.claudeKey || config.openaiKey) {
  delete config.claudeKey; delete config.openaiKey;
  if (/^claude-/.test(config.claudeModel || '')) delete config.claudeModel;
  delete config.openaiModel;
  if (config.aiProvider === 'openai') config.aiProvider = 'codex';
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch {}
}
const hasAd = () => !!(config.adApiKey && config.adSecret && config.adCustomerId);
const hasOpen = () => !!(config.clientId && config.clientSecret);

// ---------------------------------------------------------------- 캐시 (디스크에도 저장)
const HOUR = 3600e3;
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
let saveTimer = null;
function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const now = Date.now();
    for (const k of Object.keys(cache)) if (cache[k].exp < now) delete cache[k];
    fs.writeFile(CACHE_PATH, JSON.stringify(cache), () => {});
  }, 1000);
}
async function cached(key, ttl, fn) {
  const hit = cache[key];
  if (hit && hit.exp > Date.now()) return hit.v;
  const v = await fn();
  cache[key] = { v, exp: Date.now() + ttl };
  saveCache();
  return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 날짜 (한국 시간 기준)
const KST = 9 * HOUR;
const kstNow = () => new Date(Date.now() + KST);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

// ---------------------------------------------------------------- 네이버 검색광고 API
async function adRequest(method, uri, { query, body } = {}) {
  assertAdAllowed(method, uri); // 읽기·예상치 호출만 (광고 켜기/끄기·입찰가 변경 등은 네트워크로 보내기 전에 차단)
  const url = 'https://api.searchad.naver.com' + uri + (query ? '?' + new URLSearchParams(query) : '');
  for (let attempt = 0; attempt < 4; attempt++) {
    const ts = String(Date.now());
    const sig = crypto.createHmac('sha256', config.adSecret).update(`${ts}.${method}.${uri}`).digest('base64');
    const res = await fetch(url, {
      method,
      headers: {
        'X-Timestamp': ts,
        'X-API-KEY': config.adApiKey,
        'X-Customer': String(config.adCustomerId),
        'X-Signature': sig,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(800 * (attempt + 1)); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`검색광고 API 오류 ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }
  throw new Error('검색광고 API 호출 한도 초과 (잠시 후 다시 시도)');
}

const normKw = (s) => String(s).replace(/\s+/g, '').toUpperCase();
const cnt = (v) => (typeof v === 'number' ? v : String(v).includes('<') ? 5 : Number(v) || 0);

function mapAd(r) {
  const pc = cnt(r.monthlyPcQcCnt);
  const mo = cnt(r.monthlyMobileQcCnt);
  return {
    keyword: r.relKeyword,
    pc, mo, total: pc + mo,
    pcLow: typeof r.monthlyPcQcCnt !== 'number',
    moLow: typeof r.monthlyMobileQcCnt !== 'number',
    pcClk: Number(r.monthlyAvePcClkCnt) || 0,
    moClk: Number(r.monthlyAveMobileClkCnt) || 0,
    pcCtr: Number(r.monthlyAvePcCtr) || 0,
    moCtr: Number(r.monthlyAveMobileCtr) || 0,
    adDepth: Number(r.plAvgDepth) || 0,
    comp: r.compIdx || '-',
  };
}

async function keywordTool(hints) {
  const hint = hints.map((h) => h.replace(/\s+/g, '')).filter(Boolean).slice(0, 5).join(',');
  return cached('kt:' + hint, 12 * HOUR, async () => {
    const j = await adRequest('GET', '/keywordstool', { query: { hintKeywords: hint, showDetail: '1' } });
    return (j.keywordList || []).map(mapAd);
  });
}

async function bidEstimate(keyword) {
  const key = keyword.replace(/\s+/g, '');
  return cached('bid:' + key, 12 * HOUR, async () => {
    const out = {};
    for (const [dev, name] of [['PC', 'pc'], ['MOBILE', 'mobile']]) {
      const j = await adRequest('POST', '/estimate/average-position-bid/keyword', {
        body: { device: dev, items: [1, 2, 3, 4, 5].map((p) => ({ key, position: p })) },
      });
      out[name] = (j.estimate || []).map((e) => ({ position: e.position, bid: e.bid }));
    }
    return out;
  });
}

// 여러 키워드의 순위별 입찰가를 한 번에 (키워드 20개 × 1~5위 = 요청 1번, PC·모바일 각각)
async function bulkBids(keys) {
  const out = {}, need = [];
  for (const k of keys) {
    const hit = cache['bid:' + k];
    if (hit && hit.exp > Date.now()) out[k] = hit.v; else need.push(k);
  }
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    const res = Object.fromEntries(chunk.map((k) => [k, { pc: [], mobile: [] }]));
    for (const [dev, name] of [['PC', 'pc'], ['MOBILE', 'mobile']]) {
      const items = chunk.flatMap((key) => [1, 2, 3, 4, 5].map((p) => ({ key, position: p })));
      const j = await adRequest('POST', '/estimate/average-position-bid/keyword', { body: { device: dev, items } });
      (j.estimate || []).forEach((e, idx) => {
        const k = e.keyword && res[e.keyword] ? e.keyword : items[idx]?.key;
        if (res[k]) res[k][name].push({ position: e.position ?? items[idx]?.position, bid: e.bid });
      });
      await sleep(120);
    }
    for (const k of chunk) { out[k] = res[k]; cache['bid:' + k] = { v: res[k], exp: Date.now() + 12 * HOUR }; }
    saveCache();
  }
  return out;
}

// 대량 분석: 키워드 목록 → 검색량·클릭·클릭률·경쟁·광고수 + (선택) 순위별 입찰가, 블로그 발행량
// 결과를 묶음마다 'rows' 이벤트로 보내서 화면이 바로 채워짐
async function bulkStream(b, emit, signal) {
  if (!hasAd()) throw new Error('검색광고 API 키가 있어야 검색량을 조회할 수 있어요 (API 설정 > 네이버 API)');
  const seen = new Set();
  const list = [];
  for (const k0 of b.keywords || []) {
    const key = String(k0).replace(/\s+/g, '');
    if (!key || seen.has(key.toUpperCase())) continue;
    seen.add(key.toUpperCase());
    list.push(key);
  }
  if (list.length > 1000) list.length = 1000;
  const total = list.length;
  const stop = () => { if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  emit('start', { total, steps: ['검색량', b.bids ? '입찰가' : null, b.blog && hasOpen() ? '블로그 발행량' : null].filter(Boolean) });
  // 1) 검색량·광고 지표 (5개씩)
  let notFound = 0, failed = 0;
  for (let i = 0; i < list.length; i += 5) {
    stop();
    const chunk = list.slice(i, i + 5);
    let rows;
    try {
      const res = await keywordTool(chunk);
      rows = chunk.map((k) => {
        const hit = res.find((r) => normKw(r.keyword) === normKw(k));
        if (!hit) notFound++;
        return hit ? { ...hit, keyword: k } : { keyword: k, notFound: true };
      });
    } catch (e) {
      failed += chunk.length;
      rows = chunk.map((k) => ({ keyword: k, error: e.message }));
    }
    emit('rows', { rows });
    emit('progress', { step: '검색량', done: Math.min(i + 5, total), total });
    await sleep(120);
  }
  // 2) 순위별 입찰가
  let bidErr = '';
  if (b.bids) {
    for (let i = 0; i < list.length; i += 20) {
      stop();
      const chunk = list.slice(i, i + 20);
      try {
        const bids = await bulkBids(chunk);
        emit('rows', { rows: chunk.map((k) => ({ keyword: k, bids: bids[k] })) });
      } catch (e) { bidErr = e.message; emit('rows', { rows: chunk.map((k) => ({ keyword: k, bidError: e.message })) }); }
      emit('progress', { step: '입찰가', done: Math.min(i + 20, total), total });
    }
  }
  // 3) 블로그 누적 발행량 (검색 API 키가 있을 때)
  let blogErr = '';
  if (b.blog && hasOpen()) {
    for (let i = 0; i < list.length; i++) {
      stop();
      const k = list[i];
      try { emit('rows', { rows: [{ keyword: k, blog: await searchTotal('blog', k) }] }); }
      catch (e) { blogErr = e.message; emit('rows', { rows: [{ keyword: k, blogError: e.message }] }); }
      if ((i + 1) % 5 === 0 || i === list.length - 1) emit('progress', { step: '블로그 발행량', done: i + 1, total });
      await sleep(60);
    }
  }
  return { total, notFound, failed, bidErr, blogErr, blogSkipped: !!b.blog && !hasOpen() };
}

// ---------------------------------------------------------------- 네이버 검색 / 데이터랩 API
// 2026-07-31부터 신규 신청은 네이버 클라우드 NAVER API HUB로만 가능 (기존 개발자센터 키는 2027-06-30까지)
// config.openProvider: 'hub'(기본) | 'legacy'
function toHub(p) {
  if (p.startsWith('/v1/datalab/search')) return '/search-trend/v1/search';
  const m = p.match(/^\/v1\/search\/([a-z]+)\.json(\?.*)?$/);
  if (m) return `/search/v1/${m[1]}${m[2] || ''}`;
  return p;
}
async function openApi(p, body) {
  const hub = config.openProvider !== 'legacy';
  const url = hub ? 'https://naverapihub.apigw.ntruss.com' + toHub(p) : 'https://openapi.naver.com' + p;
  const auth = hub
    ? { 'X-NCP-APIGW-API-KEY-ID': config.clientId, 'X-NCP-APIGW-API-KEY': config.clientSecret }
    : { 'X-Naver-Client-Id': config.clientId, 'X-Naver-Client-Secret': config.clientSecret };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...auth,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(600 * (attempt + 1)); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`${hub ? 'NAVER API HUB' : '오픈 API'} 오류 ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }
  throw new Error('오픈 API 호출 한도 초과');
}

const searchTotal = (kind, q) =>
  cached(`st:${kind}:${q}`, 12 * HOUR, async () => {
    const j = await openApi(`/v1/search/${kind}.json?display=1&query=${encodeURIComponent(q)}`);
    return j.total || 0;
  });

// 최근 30일 블로그 발행량 추정: 최신순 100개 글의 날짜 분포로 계산
const blogRecent = (q) =>
  cached('br:' + q, 12 * HOUR, async () => {
    const j = await openApi(`/v1/search/blog.json?display=100&sort=date&query=${encodeURIComponent(q)}`);
    const dates = (j.items || []).map((i) => i.postdate).filter(Boolean)
      .map((s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`));
    if (!dates.length) return 0;
    const today = new Date(ymd(kstNow()) + 'T00:00:00Z');
    const within = dates.filter((d) => (today - d) / 86400e3 <= 30).length;
    if (within < dates.length) return within; // 100개 안에 30일치가 다 들어옴
    const spanDays = Math.max(1, (today - dates[dates.length - 1]) / 86400e3);
    return Math.round((dates.length / spanDays) * 30); // 100개가 30일 안에 다 있으면 비율로 추정
  });

const adultCheck = (q) =>
  cached('ad:' + q, 24 * HOUR, async () => (await openApi(`/v1/search/adult.json?query=${encodeURIComponent(q)}`)).adult === '1');
const errataCheck = (q) =>
  cached('er:' + q, 24 * HOUR, async () => (await openApi(`/v1/search/errata.json?query=${encodeURIComponent(q)}`)).errata || '');

async function datalab(groups, startDate, endDate, timeUnit) {
  if (!hasOpen()) throw new Error('검색어 트렌드 API 키 미설정');
  const key = `dl:${timeUnit}:${startDate}:${endDate}:${groups.join('|')}`;
  return cached(key, 12 * HOUR, async () => {
    const j = await openApi('/v1/datalab/search', {
      startDate, endDate, timeUnit,
      keywordGroups: groups.map((g) => ({ groupName: g, keywords: [g] })),
    });
    return (j.results || []).map((r) => ({ title: r.title, data: r.data || [] }));
  });
}

// ---------------------------------------------------------------- 트렌드 계산
function fillDaily(data, start, end) {
  const m = new Map(data.map((d) => [d.period, d.ratio]));
  const out = [];
  for (let d = new Date(start + 'T00:00:00Z'); ymd(d) <= end; d = addDays(d, 1)) out.push({ date: ymd(d), ratio: m.get(ymd(d)) || 0 });
  return out;
}
function fillMonthly(data, start, end) {
  const m = new Map(data.map((d) => [d.period.slice(0, 7), d.ratio]));
  const out = [];
  const d = new Date(start.slice(0, 7) + '-01T00:00:00Z');
  while (ymd(d).slice(0, 7) <= end.slice(0, 7)) {
    const k = ymd(d).slice(0, 7);
    out.push({ month: k, ratio: m.get(k) || 0 });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function buildTrend(keyword, total) {
  const today = kstNow();
  const end = ymd(addDays(today, -1));
  const dStart = ymd(addDays(today, -400));
  const [dRes, mRes] = await Promise.all([
    datalab([keyword], dStart, end, 'date'),
    datalab([keyword], '2016-01-01', end, 'month'),
  ]);
  const daily = fillDaily(dRes[0]?.data || [], dStart, end);
  const monthlyRaw = fillMonthly(mRes[0]?.data || [], '2016-01-01', end);

  // 검색광고 월간 검색수(최근 30일) = 데이터랩 최근 30일 비율 합계 → 비율을 실제 검색수로 환산
  const s30 = daily.slice(-30).reduce((a, b) => a + b.ratio, 0);
  const scale = s30 > 0 && total > 0 ? total / s30 : 0;
  daily.forEach((d) => (d.est = Math.round(d.ratio * scale)));

  // 월 단위 환산: 일별 데이터로 완전히 덮이는 최근 달을 기준으로 맞춤
  const dailySumBy = {};
  for (const d of daily) dailySumBy[d.date.slice(0, 7)] = (dailySumBy[d.date.slice(0, 7)] || 0) + d.est;
  const curMonth = ymd(today).slice(0, 7);
  let scaleM = 0;
  for (let i = monthlyRaw.length - 2; i >= 0; i--) {
    const mm = monthlyRaw[i];
    if (mm.month <= dStart.slice(0, 7)) break;
    if (mm.ratio > 0 && dailySumBy[mm.month] > 0) { scaleM = dailySumBy[mm.month] / mm.ratio; break; }
  }

  // 이번 달 예상 검색량
  const mtd = daily.filter((d) => d.date.startsWith(curMonth)).reduce((a, b) => a + b.est, 0);
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const countedDays = daily.filter((d) => d.date.startsWith(curMonth)).length;
  const last7 = daily.slice(-7);
  const avg7 = last7.reduce((a, b) => a + b.est, 0) / Math.max(1, last7.length);
  const projected = Math.round(mtd + avg7 * (daysInMonth - countedDays));

  const monthly = monthlyRaw.map((m) => ({
    month: m.month,
    ratio: m.ratio,
    est: m.month === curMonth ? projected : Math.round(m.ratio * scaleM),
    partial: m.month === curMonth,
  }));

  const firstIdx = monthlyRaw.findIndex((m) => m.ratio > 0);
  const firstSeen = firstIdx < 0 ? null : firstIdx === 0 ? '2016-01 이전' : monthlyRaw[firstIdx].month;

  // 월별 검색 비율 (최근 3년, 같은 달끼리 평균)
  const full = monthly.filter((m) => !m.partial).slice(-36);
  const byMonth = Array.from({ length: 12 }, () => []);
  for (const m of full) byMonth[Number(m.month.slice(5, 7)) - 1].push(scaleM ? m.est : m.ratio);
  const mAvg = byMonth.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0));
  const mSum = mAvg.reduce((a, b) => a + b, 0) || 1;
  const monthShare = mAvg.map((v) => +((v / mSum) * 100).toFixed(1));

  // 요일별 검색 비율 (최근 52주)
  const wk = Array(7).fill(0);
  for (const d of daily.slice(-364)) wk[new Date(d.date + 'T00:00:00Z').getUTCDay()] += d.ratio;
  const wSum = wk.reduce((a, b) => a + b, 0) || 1;
  const weekdayShare = wk.map((v) => +((v / wSum) * 100).toFixed(1)); // 0=일요일

  // 이슈성: 최근 12개월 변동계수 + 최근 90일 최고점/중앙값
  const last12 = full.slice(-12).map((m) => m.ratio);
  const mean = last12.reduce((a, b) => a + b, 0) / Math.max(1, last12.length);
  const sd = Math.sqrt(last12.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, last12.length));
  const cv = mean ? sd / mean : 0;
  const r90 = daily.slice(-90).map((d) => d.ratio).sort((a, b) => a - b);
  const median = r90[Math.floor(r90.length / 2)] || 0;
  const peak = median ? r90[r90.length - 1] / median : 0;
  const issueScore = Math.max(0, Math.min(100, Math.round(cv * 110 + Math.max(0, peak - 1.5) * 8)));
  const ib = RA().issueBands;
  const issueLabel = issueScore < ib[0] ? '매우 낮음' : issueScore < ib[1] ? '낮음' : issueScore < ib[2] ? '보통' : issueScore < ib[3] ? '높음' : '매우 높음';

  // 전년 대비 (최근 3개월 vs 1년 전 같은 3개월)
  const f = full.map((m) => m.ratio);
  const recent3 = f.slice(-3).reduce((a, b) => a + b, 0);
  const prev3 = f.slice(-15, -12).reduce((a, b) => a + b, 0);
  const yoy = prev3 ? +(((recent3 - prev3) / prev3) * 100).toFixed(1) : null;

  const lastFull = monthly.filter((m) => !m.partial).slice(-1)[0];
  return {
    daily, monthly, scaled: scale > 0, firstSeen,
    mtd: Math.round(mtd), projected, lastMonth: lastFull ? lastFull.est : 0, curMonth, countedDays, daysInMonth,
    monthShare, weekdayShare,
    issue: { score: issueScore, label: issueLabel, cv: +cv.toFixed(2), peak: +peak.toFixed(1) },
    yoy,
  };
}

// ---------------------------------------------------------------- 지표 해석

function commercialScore(kw, v) {
  const sig = [];
  let s = 0;
  const comp = { 높음: 35, 중간: 20, 낮음: 5 }[v.comp] ?? 10;
  s += comp; sig.push(`광고 경쟁 정도 ${v.comp} (+${comp})`);
  const depth = Math.round((Math.min(v.adDepth, 15) / 15) * 25);
  s += depth; sig.push(`평균 노출 광고 ${v.adDepth}개 (+${depth})`);
  const ctr = (v.pcCtr + v.moCtr) / 2;
  const c = Math.round(Math.min(ctr / 3, 1) * 15);
  s += c; sig.push(`평균 광고 클릭률 ${ctr.toFixed(2)}% (+${c})`);
  const A = RA();
  const ch = words(A.commercialWords).filter((w) => kw.includes(w));
  const ih = words(A.infoWords).filter((w) => kw.includes(w));
  if (ch.length) { s += A.commercialBonus; sig.push(`구매/가입 의도 단어: ${ch.join(', ')} (+${A.commercialBonus})`); }
  if (ih.length) { s -= A.infoPenalty; sig.push(`정보 탐색 단어: ${ih.join(', ')} (-${A.infoPenalty})`); }
  s = Math.max(0, Math.min(100, s));
  const cb = A.commercialBands;
  const label = s >= cb[2] ? '상업성 강함' : s >= cb[1] ? '상업성 우세' : s >= cb[0] ? '정보성·상업성 혼합' : '정보성 우세';
  return { score: s, label, signals: sig };
}

function saturationLevel(content, search) {
  if (!search) return { pct: null, label: '-' };
  const pct = (content / search) * 100;
  const b = RA().satBands;
  const label = pct < b[0] ? '매우 낮음' : pct < b[1] ? '낮음' : pct < b[2] ? '보통' : pct < b[3] ? '높음' : '매우 높음';
  return { pct: Math.round(pct), label };
}

function keywordGrade(total, blog) {
  const A = RA(), g = A.gradeBands;
  if (total < A.gradeMinVol) return { grade: 'D', desc: '검색량이 적어 효과가 작음' };
  const r = blog / total;
  if (r < g[0]) return { grade: 'S', desc: '검색량 대비 콘텐츠가 매우 적음 (블루오션)' };
  if (r < g[1]) return { grade: 'A', desc: '검색량 대비 콘텐츠가 적은 편' };
  if (r < g[2]) return { grade: 'B', desc: '경쟁 보통' };
  if (r < g[3]) return { grade: 'C', desc: '콘텐츠가 많아 경쟁이 치열함' };
  return { grade: 'D', desc: '콘텐츠 포화 (레드오션)' };
}

// ---------------------------------------------------------------- 분석 메인
async function analyze(keyword) {
  const kw = keyword.trim();
  const errors = {};
  // 키가 없는 API는 호출하지 않고 해당 항목을 비워둠 (화면에서 '미표시')
  const missing = { ad: !hasAd(), open: !hasOpen() };
  const safe = async (name, fn, fallback) => {
    try { return await fn(); } catch (e) { errors[name] = e.message; return fallback; }
  };

  const adP = safe('검색량', async () => {
    if (missing.ad) return { seed: null, related: [] };
    const list = await keywordTool([kw]);
    const seed = list.find((r) => normKw(r.keyword) === normKw(kw)) ||
      { keyword: kw, pc: 0, mo: 0, total: 0, pcClk: 0, moClk: 0, pcCtr: 0, moCtr: 0, adDepth: 0, comp: '-', notFound: true };
    return { seed, related: list.filter((r) => r !== seed) };
  }, { seed: null, related: [] });

  const contentP = safe('콘텐츠 발행량', async () => {
    if (missing.open) return null;
    const [blog, cafe, blogRecent30] = await Promise.all([searchTotal('blog', kw), searchTotal('cafearticle', kw), blogRecent(kw)]);
    return { blog, cafe, total: blog + cafe, blogRecent30 };
  }, null);

  const adultP = safe('성인 키워드', async () => (missing.open ? null : adultCheck(kw)), null);
  const errataP = safe('오타 교정', async () => (missing.open ? '' : errataCheck(kw)), '');
  const bidsP = safe('예상 입찰가', async () => (missing.ad ? null : bidEstimate(kw)), null);

  const ad = await adP;
  const total = ad.seed?.total || 0;
  const [content, adult, errata, bids, trend] = await Promise.all([
    contentP, adultP, errataP, bidsP,
    missing.open ? null : safe('트렌드', () => buildTrend(kw, total), null),
  ]);

  const v = ad.seed;
  const insight = v
    ? {
        commercial: commercialScore(kw, v),
        grade: content ? keywordGrade(total, content.blog) : null,
        saturation: content
          ? { blog: saturationLevel(content.blog, total), cafe: saturationLevel(content.cafe, total), total: saturationLevel(content.total, total) }
          : null,
      }
    : null;

  return { keyword: kw, generatedAt: new Date().toISOString(), missing, errors, volume: v, related: ad.related, content, adult, errata, bids, trend, insight };
}

async function compare(keywords) {
  const kws = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 5);
  const today = kstNow();
  const end = ymd(addDays(today, -1));
  const start = ymd(new Date(Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), 1)));
  const errors = {};
  let series = [];
  if (hasOpen()) {
    try {
      const res = await datalab(kws, start, end, 'month');
      series = kws.map((k, i) => ({ keyword: k, data: fillMonthly(res[i]?.data || [], start, end) }));
    } catch (e) { errors['트렌드'] = e.message; }
  }
  let volumes = kws.map((k) => ({ keyword: k, pc: null, mo: null, total: null, comp: null }));
  if (hasAd()) {
    try {
      const list = await keywordTool(kws);
      volumes = kws.map((k) => list.find((r) => normKw(r.keyword) === normKw(k)) || { keyword: k, pc: 0, mo: 0, total: 0 });
    } catch (e) { errors['검색량'] = e.message; }
  }
  // 상대지수 → 월 검색량 추정 (키워드마다): 최근 30일 일별 지수 합을 검색광고 월간 검색수에 맞추고,
  // 일별로 꽉 찬 지난달 합계와 그 달 월간 지수의 비율로 월 단위 환산 계수를 구함
  let scaled = false, warn = '';
  if (series.length && hasAd() && !errors['검색량']) {
    try {
      const dStart = ymd(addDays(today, -75));
      const dres = await datalab(kws, dStart, end, 'date');
      const lastM = ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))).slice(0, 7);
      const ks = [];
      series.forEach((sr, i) => {
        const daily = fillDaily(dres[i]?.data || [], dStart, end);
        const s30 = daily.slice(-30).reduce((a, b) => a + b.ratio, 0);
        const total = volumes[i]?.total || 0;
        const k = s30 > 0 && total > 0 ? total / s30 : 0;
        const mSum = daily.filter((x) => x.date.startsWith(lastM)).reduce((a, b) => a + b.ratio * k, 0);
        const mRatio = sr.data.find((x) => x.month === lastM)?.ratio || 0;
        const scaleM = mRatio > 0 ? mSum / mRatio : 0;
        sr.scale = scaleM;
        sr.data.forEach((x) => (x.est = scaleM ? Math.round(x.ratio * scaleM) : null));
        if (scaleM && total >= 100) ks.push(scaleM);
      });
      scaled = series.some((sr) => sr.scale);
      if (ks.length > 1 && Math.max(...ks) / Math.min(...ks) > 2) warn = '키워드끼리 환산 계수가 2배 넘게 달라요. 검색량이 작은 키워드는 데이터랩 지수가 거칠어서 오차가 클 수 있어요.';
    } catch (e) { errors['환산'] = e.message; }
  }
  return { keywords: kws, series, volumes, errors, scaled, warn, missing: { ad: !hasAd(), open: !hasOpen() } };
}

async function blogCounts(keywords) {
  const out = {};
  for (const k of keywords.slice(0, 100)) {
    try {
      out[k] = hasOpen() ? await searchTotal('blog', k) : null;
    } catch (e) { out[k] = null; }
    if (hasOpen()) await sleep(60);
  }
  return out;
}

// 네이버 통합검색 섹션 분석 (API 키 불필요)
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_MO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function sections(keyword) {
  return cached('sec:' + keyword, 1 * HOUR, async () => {
    const get = async (url, ua) => {
      const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html' } });
      if (!r.ok) throw new Error('네이버 검색 응답 ' + r.status);
      return r.text();
    };
    const q = encodeURIComponent(keyword);
    const pcHtml = await get(`https://search.naver.com/search.naver?where=nexearch&query=${q}`, UA_PC);
    await sleep(400);
    const moHtml = await get(`https://m.search.naver.com/search.naver?where=m&query=${q}`, UA_MO);
    const pc = parseSections(pcHtml, 'pc');
    const mobile = parseSections(moHtml, 'mobile');
    return { pc: pc.order, mobile: mobile.order, ai: pc.ai.length ? pc.ai : mobile.ai, web: pc.web.slice(0, 7), fetchedAt: new Date().toISOString() };
  });
}

// 경쟁 파워링크: 통합검색 PC 화면의 광고 문구 (사이트 이름 · 제목 · 설명 · 홍보문구 · 서브링크)
async function competitorAds(keyword) {
  return cached('pl:' + keyword, 1 * HOUR, async () => {
    const r = await fetch(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, { headers: { 'User-Agent': UA_PC, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html' } });
    if (!r.ok) throw new Error('네이버 검색 응답 ' + r.status);
    const html = await r.text();
    return { keyword, fetchedAt: new Date().toISOString(), ads: parsePowerlinks(html), brandSearch: /class="[^"]*brand_search/.test(html) };
  });
}

// AI 카피 생성 · 다시 쓰기 (요청문은 copy-core.mjs)
async function copyGenerateStream(b, emit, signal) {
  const RC = SETTINGS.rules.copy || {};
  const q = copyGenerateRequest({ ...b, caution: words(RC.caution), system: RC.system });
  const { arr, model, fallback } = await llmStream({ system: q.system, prompt: q.prompt, schema: q.schema, temperature: RC.temperature ?? 0.9 }, emit, signal, { total: q.total, label: '카피 작성 중', countKey: q.countKey, provider: b.provider });
  return { items: cleanCopyItems(arr, q.format), model, fallback, format: q.format };
}
// AI 재검증: 카피마다 독립 판정
async function copyVerifyStream(b, emit, signal) {
  const q = copyVerifyRequest({ ...b, caution: words((SETTINGS.rules.copy || {}).caution) });
  const { arr, model } = await llmStream({ system: q.system, prompt: q.prompt, schema: q.schema, temperature: 0.4 }, emit, signal, { total: q.total, label: '검토 중', countKey: q.countKey, provider: b.provider });
  return { results: cleanVerifyItems(arr), model };
}

// 자동완성 · 연관검색어 수집 (API 키 불필요)
// - 네이버 자동완성 (ac.search.naver.com), 구글 자동완성 (suggestqueries.google.com)
// - 네이버 '관련 검색어': 통합검색 PC 화면이 따로 불러오는 데이터 주소를 찾아서 읽음
// - deep: 키워드 뒤에 자음(ㄱ~ㅎ)을 붙여 자동완성을 한 번 더 넓게 수집
const CONSONANTS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
async function naverAc(q) {
  const r = await fetch(`https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`, { headers: { 'User-Agent': UA_PC, Referer: 'https://www.naver.com/' } });
  if (!r.ok) throw new Error('네이버 자동완성 ' + r.status);
  const j = await r.json();
  return (j.items?.[0] || []).map((x) => String(x[0] || '').trim()).filter(Boolean);
}
async function googleAc(q) {
  const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA_PC } });
  if (!r.ok) throw new Error('구글 자동완성 ' + r.status);
  const j = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8'));
  return (j[1] || []).map((x) => String(x).trim()).filter(Boolean);
}
async function naverRelated(q) {
  const r = await fetch(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA_PC, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html' } });
  if (!r.ok) throw new Error('네이버 검색 응답 ' + r.status);
  const html = await r.text();
  const m = html.match(/"apiURL":"(https:\/\/s\.search\.naver\.com\/p\/qra\/[^"]+)"/);
  if (!m) return [];
  const url = m[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
  const r2 = await fetch(url, { headers: { 'User-Agent': UA_PC, Referer: 'https://search.naver.com/' } });
  if (!r2.ok) throw new Error('네이버 관련 검색어 응답 ' + r2.status);
  const j = await r2.json();
  return (j.result?.contents || []).map((c) => ({ keyword: String(c.query || '').trim(), badge: c.badge?.text || '' })).filter((x) => x.keyword);
}
async function suggest(keyword, deep) {
  return cached('sug:' + (deep ? 'd:' : '') + keyword, 6 * HOUR, async () => {
    const errors = [];
    const safe = async (name, fn, fb) => { try { return await fn(); } catch (e) { errors.push(name + ': ' + e.message); return fb; } };
    const [naver, google, related] = await Promise.all([safe('네이버 자동완성', () => naverAc(keyword), []), safe('구글 자동완성', () => googleAc(keyword), []), safe('네이버 관련 검색어', () => naverRelated(keyword), [])]);
    const deepN = [], deepG = [];
    if (deep) {
      for (const c of CONSONANTS) {
        deepN.push(...(await safe('네이버 자동완성(' + c + ')', () => naverAc(keyword + ' ' + c), [])));
        deepG.push(...(await safe('구글 자동완성(' + c + ')', () => googleAc(keyword + ' ' + c), [])));
        await sleep(120);
      }
    }
    // 띄어쓰기·대소문자만 다른 것은 하나로 (처음 나온 표기 유지), 원래 키워드는 제외
    const key = (s) => s.replace(/\s+/g, '').toLowerCase();
    const seen = new Set([key(keyword)]), all = [];
    const add = (kw, src) => { const k = key(kw); if (!k) return; const hit = all.find((x) => x.k === k); if (hit) { if (!hit.src.includes(src)) hit.src.push(src); return; } if (seen.has(k)) return; all.push({ k, keyword: kw, src: [src] }); };
    related.forEach((x) => add(x.keyword, '네이버 관련'));
    naver.forEach((x) => add(x, '네이버 자동완성'));
    google.forEach((x) => add(x, '구글 자동완성'));
    deepN.forEach((x) => add(x, '네이버 자동완성'));
    deepG.forEach((x) => add(x, '구글 자동완성'));
    return { keyword, deep: !!deep, related, naver, google, all: all.map(({ keyword: kw, src }) => ({ keyword: kw, src })), errors, fetchedAt: new Date().toISOString() };
  });
}

async function testConnections() {
  const out = {};
  if (hasAd()) {
    try { await adRequest('GET', '/keywordstool', { query: { hintKeywords: '보험', showDetail: '1' } }); out.ad = 'ok'; } catch (e) { out.ad = e.message; }
  } else out.ad = '키 미입력';
  if (hasOpen()) {
    try { await openApi('/v1/search/blog.json?display=1&query=' + encodeURIComponent('보험')); out.search = 'ok'; } catch (e) { out.search = e.message; }
    try {
      const e1 = ymd(addDays(kstNow(), -1));
      await openApi('/v1/datalab/search', { startDate: ymd(addDays(kstNow(), -8)), endDate: e1, timeUnit: 'date', keywordGroups: [{ groupName: '보험', keywords: ['보험'] }] });
      out.datalab = 'ok';
    } catch (e) { out.datalab = e.message; }
  } else { out.search = '키 미입력'; out.datalab = '키 미입력'; }
  if (hasGemini()) {
    try { const ms = await geminiModels(); const cur = config.geminiModel || GEMINI_DEFAULT; out.gemini = ms.includes(cur) ? 'ok' : `키는 정상, 선택한 모델(${cur})이 목록에 없어요. 모델을 다시 고르세요`; }
    catch (e) { out.gemini = e.message; }
  } else out.gemini = '키 미입력';
  for (const p of Object.keys(CLI)) out[p] = cliPath(p, config, true) ? 'ok' : '설치 안 됨';
  return out;
}

// ---------------------------------------------------------------- Gemini (AI 키워드 생성기)
const hasGemini = () => !!config.geminiKey;
const GEMINI_DEFAULT = 'gemini-3.8-flash';

// 선택한 모델이 바쁘거나(503) 한도 초과(429)면 아래 순서로 자동 대체
const GEMINI_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

// 재시도 정책
// - 기본(자동 전환): 바쁘면(503) 같은 모델로 2초·4초 뒤 재시도 후 다른 모델로 넘어감
// - 모델 고정: 같은 모델로만 3·6·12·20·30초 간격 5번(약 70초) 재시도 후 멈춤.
//   한도 초과(429)는 구글이 알려주는 대기 시간이 60초 이하일 때만 한 번 기다렸다 재시도.
const pinned = () => !!config.geminiPin;
const retryPlan = () => (pinned() ? [3, 6, 12, 20, 30] : [2, 4]);
function retryDelaySec(text) {
  try {
    const d = (JSON.parse(text).error?.details || []).find((x) => /RetryInfo/.test(x['@type'] || ''));
    const m = /([\d.]+)s/.exec(d?.retryDelay || '');
    return m ? Math.ceil(Number(m[1])) : 0;
  } catch { return 0; }
}
function pinnedError(status, model, msg, waited) {
  if (status === 429) return new Error(`${model} 모델의 사용 한도를 넘었어요. 분당 한도면 1분 뒤, 일일 한도면 내일 다시 돼요 (유료 API는 크레딧 잔액도 확인하세요). 지금 쓰려면 [모델 고정]을 끄거나 다른 모델을 고르세요. (${msg.slice(0, 120)})`);
  if (status === 404) return new Error(`${model} 모델을 지금 쓸 수 없어요. 모델을 다시 고르세요.`);
  return new Error(`${model} 모델이 지금 구글 쪽에서 바빠요 (요청 몰림, 503 · 약 ${waited}초 기다리며 재시도했지만 계속 거절). 모델 고정 중이라 다른 모델로 넘어가지 않았어요. 다른 모델(예: gemini-3.6-flash, gemini-3.5-flash-lite)을 고르거나 [모델 고정]을 끄면 바쁜 동안 자동으로 다른 모델을 써요.`);
}
async function waitSec(sec, signal, onTick) {
  for (let s = sec; s > 0; s--) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    onTick?.(s);
    await sleep(1000);
  }
}
const modelChain = (over) => {
  const primary = over || config.geminiModel || GEMINI_DEFAULT;
  return pinned() ? [primary] : [primary, ...GEMINI_FALLBACKS.filter((m) => m !== primary)].slice(0, 4);
};

async function gemini(prompt, schema, { temperature = 0.9, system } = {}) {
  if (!hasGemini()) throw new Error('Gemini API 키가 설정되지 않았어요 (API 설정 > AI 모델 탭)');
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
  };
  const tried = [];
  for (const model of modelChain()) {
    try {
      const data = await geminiCall(model, body);
      return { data, model, tried };
    } catch (e) {
      if (!e.retryable) throw e;
      if (pinned()) throw pinnedError(e.status, model, e.message, e.waited || 0);
      tried.push(`${model}(${e.status})`);
      console.log(`  Gemini ${model} ${e.status} → 다음 모델로 대체`);
    }
  }
  throw new Error(`Gemini 모델들이 모두 바빠요 (${tried.join(', ')}). 1~2분 뒤 다시 시도해 주세요. 429는 무료 등급 분당·일당 한도 초과예요.`);
}

async function geminiCall(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const plan = retryPlan();
  let waited = 0, waited429 = false;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, body: JSON.stringify(body) });
    const text = await res.text();
    if ((res.status === 503 || res.status === 500) && attempt < plan.length) { await sleep(plan[attempt] * 1000); waited += plan[attempt]; continue; }
    if (res.status === 429 && pinned() && !waited429) { const d = retryDelaySec(text); if (d && d <= 60) { waited429 = true; await sleep(d * 1000); waited += d; continue; } }
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { msg = JSON.parse(text).error?.message || msg; } catch {}
      const err = new Error(`Gemini 오류 ${res.status} (${model}): ${msg}`);
      err.status = res.status;
      err.waited = waited;
      err.retryable = [429, 500, 503, 404].includes(res.status);
      throw err;
    }
    const j = JSON.parse(text);
    const cand = j.candidates?.[0];
    const out = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    if (!out) throw new Error('Gemini가 빈 응답을 주었어요' + (j.promptFeedback?.blockReason ? ` (차단 사유: ${j.promptFeedback.blockReason})` : cand?.finishReason ? ` (${cand.finishReason})` : ''));
    try { return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw new Error('Gemini 응답을 해석하지 못했어요: ' + out.slice(0, 200)); }
  }
}

// ---------------------------------------------------------------- AI 제공사: Gemini(API 키) + 로그인형(Gemini·Claude·GPT, 각 회사 공식 CLI)
const PROVIDERS = {
  gemini: { name: 'Gemini (API 키)', kind: 'api', has: () => !!config.geminiKey, model: () => config.geminiModel || GEMINI_DEFAULT },
  agy: { name: CLI.agy.name, kind: 'cli', has: () => !!cliPath('agy', config), model: () => config.agyModel || '' },
  claude: { name: CLI.claude.name, kind: 'cli', has: () => !!cliPath('claude', config), model: () => config.claudeModel || '' },
  codex: { name: CLI.codex.name, kind: 'cli', has: () => !!cliPath('codex', config), model: () => config.codexModel || '' },
};
const LEGACY = { openai: 'codex' };
const provId = (x) => (PROVIDERS[x] ? x : PROVIDERS[LEGACY[x]] ? LEGACY[x] : null);
const provider = () => provId(config.aiProvider) || 'gemini';
const hasAI = () => PROVIDERS[provider()].has();
function needKey(p = provider()) {
  if (PROVIDERS[p].has()) return;
  throw new Error(PROVIDERS[p].kind === 'api'
    ? `${PROVIDERS[p].name}: 키가 설정되지 않았어요 (설정 > API 설정 > AI 모델 탭)`
    : `${PROVIDERS[p].name}: ${CLI[p].tool}가 설치되지 않았어요 (설정 > API 설정 > AI 모델 탭에서 [설치] → [로그인])`);
}
function parseItems(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let v;
  try { v = JSON.parse(t); }
  catch {
    const a = Math.min(...['{', '['].map((c) => (t.indexOf(c) < 0 ? Infinity : t.indexOf(c))));
    const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    v = JSON.parse(t.slice(a, b + 1));
  }
  return Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [];
}

// 로그인형 CLI 호출: 진행 중에는 경과 시간만 알려주고, 끝나면 JSON을 읽음 (생각 과정은 표시 안 됨)
async function cliStream(p, { system, prompt }, emit, signal, { total = 0, model: modelOver } = {}) {
  needKey(p);
  const P = PROVIDERS[p];
  const model = modelOver || P.model();
  const tag = `${P.name}${model ? ' · ' + model : ''}`;
  const full = [system, '', prompt, '', '출력 형식: {"items": [...]} 형태의 JSON 객체 하나만 출력한다. 인사말, 설명, 코드블록 없이 JSON만 출력한다. 파일을 만들거나 고치거나 명령을 실행하지 말고 답만 출력한다.'].join('\n');
  emit('start', { total });
  const t0 = Date.now();
  emit('status', { text: `${tag} 실행 중 (로그인 계정 사용)`, model: tag, phase: 'thinking' });
  const tick = setInterval(() => emit('status', { text: `${tag} 응답 기다리는 중 · ${Math.round((Date.now() - t0) / 1000)}초`, model: tag, phase: 'thinking' }), 2000);
  let text;
  try { text = await runCli(p, full, { model, signal, config }); }
  finally { clearInterval(tick); }
  let arr;
  try { arr = parseItems(text); }
  catch { throw new Error(`${P.name} 응답을 해석하지 못했어요: ${String(text).replace(/\s+/g, ' ').slice(0, 200)}`); }
  emit('progress', { count: arr.length, total });
  return { arr, model: tag, fallback: false };
}

// 현재 선택한 AI로 호출 (opts.provider / opts.model 이 있으면 이 요청만 그 AI·모델로)
async function llmStream({ system, prompt, schema, temperature }, emit, signal, opts = {}) {
  const p = provId(opts.provider) || provider();
  needKey(p);
  if (p === 'gemini') {
    const baseBody = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    };
    return geminiStream(baseBody, emit, signal, opts);
  }
  return cliStream(p, { system, prompt }, emit, signal, opts);
}
async function llmJson(prompt, schema, { temperature = 0.9, system } = {}) {
  const p = provider();
  needKey(p);
  if (p === 'gemini') return gemini(prompt, schema, { temperature, system });
  const { arr, model } = await cliStream(p, { system: system || '설명 없이 JSON만 출력한다.', prompt }, () => {}, undefined, {});
  return { data: arr, model, tried: [] };
}
async function providerModels(p) {
  if (p === 'gemini') return geminiModels();
  if (p === 'agy') return (await cliModels('agy', config)).map((m) => m.id);
  return CLI_MODELS[p] || [];
}

async function geminiModels() {
  if (!hasGemini()) throw new Error('Gemini API 키를 먼저 저장하세요');
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': config.geminiKey } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini 모델 목록 오류 ${res.status}: ${text.slice(0, 200)}`);
  return (JSON.parse(text).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /gemini/.test(n) && !/tts|image|live|audio|embedding|robotics|transcribe|banana|omni/.test(n));
}

const INTENTS = ['정보', '비교', '가입·구매', '후기', '세분화', '기타'];
function generateRequest({ topic = '', examples = [], count = 50, extra = '', avoid = [], existing = [], rejected = [], minLen = 2, maxLen = 30, seeds = [] }) {
  // 네이버 키워드 도구 연관 키워드 (실제 검색량): AI가 이걸 바탕으로 넓힘
  const sd = (Array.isArray(seeds) ? seeds : []).filter((x) => x && x.keyword).slice(0, 200);
  const ex = (Array.isArray(existing) ? existing : []).map((k) => String(k).replace(/\s+/g, '')).filter(Boolean).slice(0, 2000);
  const rej = (Array.isArray(rejected) ? rejected : []).filter((r) => r && r.keyword).slice(-150);
  const n = Math.max(10, Math.min(150, Number(count) || 50));
  const lo = Math.max(2, Math.min(30, Number(minLen) || 2));
  const hi = Math.max(lo, Math.min(30, Number(maxLen) || 30));
  const lenRule = lo === 2 && hi === 30 ? '' : `- 각 키워드는 띄어쓰기를 뺀 글자 수가 반드시 ${lo}자 이상 ${hi}자 이하 (예: "운전자 보험"은 5자). 범위를 벗어나면 버려진다`;
  const G = RG();
  const system = G.system;
  const prompt = [
    `주제: ${topic || '(없음)'}`,
    `예시 키워드: ${examples.length ? examples.join(', ') : '(없음)'}`,
    extra ? `요청 사항 (사용자가 자유롭게 쓴 지시이므로 의도를 파악해 반드시 따를 것. 단, 아래 규칙과 충돌하면 규칙을 우선):\n"""\n${String(extra).slice(0, 2000)}\n"""` : '',
    '',
    `위 주제와 예시에 맞는 검색 키워드를 ${n}개 제안해줘.`,
    '규칙:',
    ...String(G.rules || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => (/^[-•\d]/.test(l) ? l : '- ' + l)),
    G.noSpace ? '- 모든 키워드는 띄어쓰기 없이 붙여 쓴다 (예: "운전자보험추천", "30대암보험비교"). 공백이 하나라도 있으면 안 된다' : '',
    lenRule,
    `- intent는 ${INTENTS.join(', ')} 중 하나`,
    '- reason은 왜 유망한지 15자 이내',
    sd.length ? `\n네이버 키워드 도구 연관 키워드 ${sd.length}개 (키워드 도구가 준 관련도 순, 괄호는 실제 월간 검색량):\n${sd.map((x) => `${String(x.keyword).replace(/\s+/g, '')}(${Number(x.total) || 0})`).join(', ')}\n→ 이 목록에서 실제로 많이 검색되는 표현·수식어·조합 패턴을 파악해서, 주제에 맞으면서 이 목록에 없는 새 키워드로 넓혀라. 목록에 있는 키워드를 그대로 다시 내지 말 것. 괄호 속 검색량을 보면 짧고 흔한 표현일수록 많이 검색된다. 실제 사람들이 검색창에 칠 만한 짧은 조합(2~3개 단어)을 우선하고, 검색량이 거의 없을 너무 길거나 꾸민 표현(예: ~꿀팁정리, ~총정리비교)은 피할 것. 주제와 무관한 연관 키워드는 무시할 것.` : '',
    avoid.length ? `\n제외 목록 (이미 확보한 키워드):\n${avoid.slice(-600).join(', ')}` : '',
    ex.length ? `\n기존에 이미 운영 중인 키워드 ${ex.length}개 (이것들과 같거나, 대소문자·어순·조사만 다르거나, 의미가 사실상 같은 키워드는 절대 제안하지 말 것. 이 목록에 없는 새로운 각도로 넓힐 것):\n${ex.join(', ')}` : '',
    rej.length ? `\n부적합 판정을 받은 키워드 (다시 제안하지 말고, 같은 이유로 부적합할 만한 비슷한 유형도 피할 것. 특히 검색량 부족이면 더 널리 검색되는 표현을 쓸 것):\n${rej.map((r) => `${r.keyword} (${String(r.reason || '').slice(0, 30)})`).join('\n')}` : '',
  ].filter((x) => x !== '').join('\n');
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: { keyword: { type: 'STRING' }, intent: { type: 'STRING', enum: INTENTS }, reason: { type: 'STRING' } },
      required: ['keyword', 'intent', 'reason'],
    },
  };
  return { n, system, prompt, schema };
}
const cleanItems = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x.keyword === 'string' && x.keyword.trim())
  .map((x) => ({ keyword: RG().noSpace ? x.keyword.replace(/\s+/g, '') : x.keyword.trim().replace(/\s+/g, ' '), intent: INTENTS.includes(x.intent) ? x.intent : '기타', reason: String(x.reason || '').slice(0, 40) }));

async function aiGenerate(b) {
  const { system, prompt, schema } = generateRequest(b);
  const { data: arr, model, tried } = await llmJson(prompt, schema, { temperature: RG().temperature, system });
  return { items: cleanItems(arr), model, fallback: tried.length > 0 };
}

// 스트리밍 생성: 진행률(받은 키워드 수)과 Gemini 생각 요약을 실시간으로 emit
async function aiGenerateStream(b, emit, signal) {
  needKey();
  const { n, system, prompt, schema } = generateRequest(b);
  const { arr, model, fallback } = await llmStream({ system, prompt, schema, temperature: RG().temperature }, emit, signal, { total: n, label: '키워드 작성 중' });
  return { items: cleanItems(arr), model, fallback, provider: provider() };
}

// Gemini 스트리밍 공통: 생각 요약(thought) + 답변의 "keyword" 개수로 진행률, 바쁘면 다른 모델로 대체
async function geminiStream(baseBody, emit, signal, { total, label = '작성 중', model: modelOver, countKey = 'keyword' } = {}) {
  const countRe = new RegExp(`"${countKey}"\\s*:`, 'g'); // 진행률: 이 필드가 나온 횟수
  if (!hasGemini()) throw new Error('Gemini API 키가 설정되지 않았어요 (API 설정 > AI 모델 탭)');
  const n = total;
  const pin = pinned();
  const plan = retryPlan();
  const tried = [];
  emit('start', { total: n });
  for (const model of modelChain(modelOver)) {
    let thinking = true, waited = 0, waited429 = false;
    const tModel = Date.now(); // 모델 고정일 때 한 모델에 쓰는 시간 상한 (90초)
    for (let attempt = 0; ; attempt++) {
      emit('status', { text: `${model}${pin ? ' (고정)' : ''}에 요청 중${attempt ? ` (재시도 ${attempt}/${plan.length})` : ''}`, model });
      const body = thinking ? { ...baseBody, generationConfig: { ...baseBody.generationConfig, thinkingConfig: { includeThoughts: true } } } : baseBody;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, body: JSON.stringify(body), signal,
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text.slice(0, 300);
        try { msg = JSON.parse(text).error?.message || msg; } catch {}
        if (res.status === 400 && thinking && /think/i.test(msg)) { thinking = false; attempt--; emit('status', { text: `${model}: 생각 요약 미지원 모델이라 바로 생성해요`, model }); continue; }
        if ((res.status === 503 || res.status === 500) && attempt < plan.length && !(pin && Date.now() - tModel + plan[attempt] * 1000 > 90000)) {
          await waitSec(plan[attempt], signal, (s) => emit('status', { text: `${model} 요청이 몰려 ${s}초 후 다시 시도해요 (${attempt + 1}/${plan.length})`, model, phase: 'wait' }));
          waited += plan[attempt];
          continue;
        }
        if (res.status === 429 && pin && !waited429) {
          const d = retryDelaySec(text);
          if (d && d <= 60) {
            waited429 = true;
            await waitSec(d, signal, (s) => emit('status', { text: `${model} 분당 한도 초과, ${s}초 기다렸다 다시 시도해요`, model, phase: 'wait' }));
            waited += d;
            continue;
          }
        }
        if (pin && [429, 500, 503, 404].includes(res.status)) throw pinnedError(res.status, model, msg, waited);
        if ([429, 500, 503, 404].includes(res.status)) {
          tried.push(`${model}(${res.status})`);
          emit('status', { text: `${model} ${res.status === 429 ? '한도 초과' : '사용 불가'} → 다음 모델로 넘어가요`, model });
          break;
        }
        throw new Error(`Gemini 오류 ${res.status} (${model}): ${msg}`);
      }
      // SSE 읽기
      emit('status', { text: thinking ? '생각하는 중' : '작성 준비 중', model, phase: 'thinking' });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', answer = '', lastCount = -1, writing = false, finish = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let j;
          try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (j.error) throw new Error(`Gemini 오류 (${model}): ${j.error.message || 'stream error'}`);
          const cand = j.candidates?.[0];
          if (cand?.finishReason) finish = cand.finishReason;
          for (const p of cand?.content?.parts || []) {
            if (!p.text) continue;
            if (p.thought) emit('thought', { text: p.text });
            else {
              answer += p.text;
              if (!writing) { writing = true; emit('status', { text: label, model, phase: 'writing' }); }
              const c = (answer.match(countRe) || []).length;
              if (c !== lastCount) { lastCount = c; emit('progress', { count: c, total: n }); }
            }
          }
        }
      }
      if (!answer.trim()) throw new Error(`Gemini가 빈 응답을 주었어요${finish ? ` (${finish})` : ''}`);
      let arr;
      try { arr = JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
      catch { throw new Error('Gemini 응답을 해석하지 못했어요' + (finish === 'MAX_TOKENS' ? ' (응답이 너무 길어 잘렸어요. 개수를 줄여보세요)' : '')); }
      return { arr, model, fallback: tried.length > 0 };
    }
  }
  throw new Error(`Gemini 모델들이 모두 바빠요 (${tried.join(', ')}). 1~2분 뒤 다시 시도해 주세요.`);
}

// 재검증: 생성 조건(주제·예시·요청 사항)에 맞는지 키워드마다 독립적으로 판정
// 매번 이전 판정을 알려주지 않고 새로 판단하게 해서, 여러 번 돌렸을 때 일관성을 볼 수 있음
async function aiVerify(b) {
  const { list, prompt, schema } = verifyRequest(b);
  if (!list.length) return { results: [] };
  const { data, model } = await llmJson(prompt, schema, { temperature: RV().temperature });
  return { results: cleanVerify(data), model };
}
// 스트리밍 재검증: 진행률 + 생각 요약
async function aiVerifyStream(b, emit, signal) {
  const { list, prompt, schema } = verifyRequest(b);
  if (!list.length) return { results: [] };
  const prov = provId(b.provider) || undefined;
  const mdl = prov && typeof b.model === 'string' && /^[\w.\-:/]{1,80}$/.test(b.model) ? b.model : undefined;
  const system = '너는 검색 키워드 검수자다. 생각(추론) 과정도 한국어로 작성하고, 최종 답은 JSON만 출력한다.';
  const { arr, model, fallback } = await llmStream({ system, prompt, schema, temperature: RV().temperature }, emit, signal, { total: list.length, label: '판정 작성 중', provider: prov, model: mdl });
  return { results: cleanVerify(arr), model, fallback, provider: prov || provider() };
}
const cleanVerify = (data) => (Array.isArray(data) ? data : []).map((x) => ({ keyword: String(x.keyword || '').replace(/\s*\(월간 검색량[^)]*\)\s*$/, '').trim(), pass: !!x.pass, reason: String(x.reason || '').slice(0, 40) }));
// keywords: 문자열 또는 { keyword, volume } (volume: 월간 검색량 합계, null이면 미조회, -1이면 네이버 데이터 없음)
function verifyRequest({ conditions = {}, keywords = [], minVol = 0 }) {
  const vol = new Map(), labels = new Map();
  const names = keywords.map((k) => {
    const name = String(typeof k === 'string' ? k : k?.keyword || '').trim();
    if (name && typeof k === 'object' && k.volume !== undefined && k.volume !== null) vol.set(name, Number(k.volume));
    if (name && typeof k === 'object' && k.label) labels.set(name, String(k.label).slice(0, 40));
    return name;
  });
  const list = [...new Set(names.filter(Boolean))].slice(0, 120);
  const hasVol = RV().useVolume && list.some((k) => vol.has(k));
  const volText = (k) => (!vol.has(k) ? '미조회' : vol.get(k) < 0 ? '데이터 없음(거의 검색 안 됨)' : labels.has(k) && /미만/.test(labels.get(k)) ? `${labels.get(k)}(거의 검색 안 됨)` : labels.has(k) && /~/.test(labels.get(k)) ? `${labels.get(k)}회` : `${vol.get(k).toLocaleString('ko-KR')}회`);
  const c = conditions;
  const prompt = [
    '너는 검색 키워드 검수자다. 아래 조건을 기준으로 각 키워드가 적합한지 엄격하게 판정해줘.',
    `주제: ${c.topic || '(없음)'}`,
    `예시 키워드: ${(c.examples || []).join(', ') || '(없음)'}`,
    `요청 사항 (사용자가 자유롭게 쓴 지시): ${c.extra ? `\n"""\n${String(c.extra).slice(0, 2000)}\n"""` : '(없음)'}`,
    '',
    '판정 기준 (하나라도 어기면 부적합):',
    ...String(RV().criteria || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    ...(() => {
      const j = (Array.isArray(c.judged) ? c.judged : []).filter((x) => x && x.keyword).slice(-60);
      if (!j.length) return [];
      return ['', '사용자가 직접 판정한 예시 (판정이 엇갈렸던 키워드에 대한 사용자의 결정이다. 비슷한 유형의 키워드는 이 기준을 따른다):',
        ...j.map((x) => `- ${String(x.keyword).slice(0, 40)}: ${x.pass ? '적합' : '부적합'}${!x.pass && x.reason ? ` (${String(x.reason).slice(0, 40)})` : ''}`), ''];
    })(),
    hasVol ? `검색량 기준) 괄호 안 월간 검색량(네이버 PC+모바일)을 참고한다. 검색량이 매우 적거나 "데이터 없음"이면 사람들이 실제로 쓰는 표현이 아닐 가능성이 크다. 검색량이 충분하면 3)의 자연스러움에 유리한 근거다.${minVol > 0 ? ` (최소 기준 ${minVol}회 미만은 프로그램이 따로 부적합 처리하므로, 너는 나머지 기준과 함께 종합 판단만 한다)` : ''}` : '',
    '글자 수는 따로 검사하므로 판단에서 제외한다.',
    'pass는 적합이면 true, reason은 판정 근거 15자 이내. 모든 키워드에 빠짐없이 답하고, keyword에는 괄호 앞의 키워드만 주어진 그대로 적는다.',
    '',
    '키워드 목록:',
    ...list.map((k, i) => (hasVol ? `${i + 1}. ${k} (월간 검색량 ${volText(k)})` : `${i + 1}. ${k}`)),
  ].join('\n');
  const schema = {
    type: 'ARRAY',
    items: { type: 'OBJECT', properties: { keyword: { type: 'STRING' }, pass: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['keyword', 'pass', 'reason'] },
  };
  return { list, prompt, schema };
}

// 의미 중복 검사: 후보마다 비슷한 기존 키워드 몇 개만 보내 판단
async function aiSemantic({ pairs = [] }) {
  const items = pairs.filter((p) => p && p.candidate && Array.isArray(p.existing) && p.existing.length).slice(0, 150);
  if (!items.length) return [];
  const prompt = [
    '각 후보 키워드가 함께 주어진 기존 키워드 중 하나와 검색 의도가 사실상 같은지 판단해줘.',
    '"사실상 같다" = 같은 검색 결과나 같은 콘텐츠/광고로 대응해도 되는 수준 (예: 자동차보험 싼곳 = 자동차보험 저렴한곳). 대상·조건이 다르면 다른 키워드다 (예: 20대 암보험 ≠ 50대 암보험).',
    '같은 것이 있으면 duplicateOf에 그 기존 키워드를 그대로 쓰고, 없으면 빈 문자열. reason은 10자 이내.',
    '',
    ...items.map((p, i) => `${i + 1}. 후보: ${p.candidate} | 기존: ${p.existing.slice(0, 5).join(' / ')}`),
  ].join('\n');
  const schema = {
    type: 'ARRAY',
    items: { type: 'OBJECT', properties: { candidate: { type: 'STRING' }, duplicateOf: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['candidate', 'duplicateOf'] },
  };
  const { data: arr } = await llmJson(prompt, schema, { temperature: 0.1 });
  return (Array.isArray(arr) ? arr : []).map((x) => ({ candidate: String(x.candidate || ''), duplicateOf: String(x.duplicateOf || ''), reason: String(x.reason || '') }));
}

// 의미 중복 후보 찾기: Gemini 임베딩으로 후보마다 뜻이 가장 가까운 기존 키워드를 찾음 (최종 판단은 aiSemantic)
// 글자가 달라도 뜻이 비슷한 것(싼곳/저렴한곳)까지 후보로 잡기 위함. 벡터는 메모리에만 보관
const EMB = new Map();
const EMB_MODEL = 'gemini-embedding-2';
async function embedAll(texts) {
  const need = [...new Set(texts)].filter((t) => !EMB.has(t));
  for (let i = 0; i < need.length; i += 100) {
    const part = need.slice(i, i + 100);
    let res, j;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMB_MODEL}:batchEmbedContents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
        body: JSON.stringify({ requests: part.map((t) => ({ model: 'models/' + EMB_MODEL, content: { parts: [{ text: t }] }, taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 })) }),
      });
      j = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status === 503) { await sleep(3000 * (attempt + 1)); continue; }
      break;
    }
    if (!res.ok) throw new Error(`Gemini 임베딩 오류 ${res.status}: ${String(j.error?.message || '').slice(0, 160)}`);
    part.forEach((t, k) => { const v = j.embeddings?.[k]?.values; if (v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; EMB.set(t, Float32Array.from(v, (x) => x / n)); } });
    if (EMB.size > 60000) EMB.clear();
  }
}
async function embedNear({ candidates = [], existing = [], min = 0.85, top = 5 }) {
  if (!hasGemini()) throw new Error('Gemini API 키가 없어 임베딩을 쓸 수 없어요');
  const C = [...new Set(candidates.map(String).filter(Boolean))].slice(0, 1500);
  const E = [...new Set(existing.map(String).filter(Boolean))].slice(0, 6000);
  if (!C.length || !E.length) return { near: {} };
  await embedAll([...C, ...E]);
  const near = {};
  for (const c of C) {
    const v = EMB.get(c); if (!v) continue;
    const best = [];
    for (const e of E) {
      if (e === c) continue;
      const w = EMB.get(e); if (!w) continue;
      let d = 0; for (let i = 0; i < v.length; i++) d += v[i] * w[i];
      if (d >= min) best.push([e, +d.toFixed(3)]);
    }
    best.sort((x, y) => y[1] - x[1]);
    if (best.length) near[c] = best.slice(0, top);
  }
  return { near, model: EMB_MODEL };
}

// 키워드 여러 개의 검색량 (검색광고 API, 5개씩)
async function volumes(keywords) {
  if (!hasAd()) throw new Error('검색광고 API 키가 없어 검색량을 붙일 수 없어요');
  const list = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))].slice(0, 300);
  const out = {};
  for (let i = 0; i < list.length; i += 5) {
    const chunk = list.slice(i, i + 5);
    try {
      const rows = await keywordTool(chunk);
      for (const k of chunk) {
        const hit = rows.find((r) => normKw(r.keyword) === normKw(k));
        out[k] = hit ? { pc: hit.pc, mo: hit.mo, total: hit.total, comp: hit.comp, pcLow: hit.pcLow, moLow: hit.moLow } : { pc: 0, mo: 0, total: 0, comp: '-', notFound: true };
      }
    } catch (e) {
      for (const k of chunk) out[k] = { error: e.message };
    }
    await sleep(150);
  }
  return out;
}

// ---------------------------------------------------------------- 광고 성과 (읽기 전용)
// 광고 계정 자료는 파일에 남기지 않고 메모리에만 10분 보관
const ADS_MEM = new Map();
async function adsMem(key, fn) {
  const hit = ADS_MEM.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const v = await fn();
  ADS_MEM.set(key, { v, exp: Date.now() + 10 * 60e3 });
  return v;
}
const ON_OFF = (x) => (x.userLock ? '꺼짐' : x.status === 'ELIGIBLE' ? '노출 가능' : x.statusReason || x.status || '-');
async function adsCampaigns() {
  const list = await adsMem('cmp', () => adRequest('GET', '/ncc/campaigns'));
  return (Array.isArray(list) ? list : []).map((c) => ({ id: c.nccCampaignId, name: c.name, type: c.campaignTp, state: ON_OFF(c) }));
}
const PERF_FIELDS = ['impCnt', 'clkCnt', 'salesAmt', 'ctr', 'cpc', 'avgRnk', 'ccnt', 'convAmt'];
async function adsPerf(b = {}) {
  const day = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? String(x) : null);
  const since = day(b.since), until = day(b.until);
  if (!since || !until || since > until) throw new Error('기간을 확인해 주세요');
  const cmps = await adsCampaigns();
  const want = new Set((Array.isArray(b.campaigns) ? b.campaigns : [b.campaign]).filter(Boolean).map(String));
  const pick = cmps.filter((c) => want.has(c.id));
  if (!pick.length) throw new Error('캠페인을 골라 주세요');
  const groups = [];
  for (const c of pick) {
    const gs = await adsMem('grp:' + c.id, () => adRequest('GET', '/ncc/adgroups', { query: { nccCampaignId: c.id } }));
    for (const g of gs || []) groups.push({ id: g.nccAdgroupId, name: g.name, state: ON_OFF(g), cmp: c });
  }
  if (groups.length > 300) throw new Error(`광고그룹이 ${groups.length}개라 너무 많아요. 캠페인을 나눠서 골라 주세요 (300개까지)`);
  const rows = [];
  for (const g of groups) {
    const ks = await adsMem('kw:' + g.id, () => adRequest('GET', '/ncc/keywords', { query: { nccAdgroupId: g.id } }));
    for (const k of ks || []) rows.push({ id: k.nccKeywordId, keyword: k.keyword, group: g.name, groupState: g.state, campaign: g.cmp.name, state: ON_OFF(k), bid: k.useGroupBidAmt ? null : k.bidAmt });
    if (rows.length > 8000) throw new Error('키워드가 8,000개를 넘어요. 캠페인을 나눠서 골라 주세요');
  }
  const stat = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const ids = rows.slice(i, i + 100).map((x) => x.id);
    const j = await adsMem(`st:${since}:${until}:${ids.join(',')}`, () => adRequest('GET', '/stats', { query: { ids: ids.join(','), fields: JSON.stringify(PERF_FIELDS), timeRange: JSON.stringify({ since, until }), timeIncrement: 'allDays' } }));
    for (const d of j?.data || []) stat.set(d.id, d);
    await sleep(120);
  }
  const out = rows.map((x) => {
    const d = stat.get(x.id) || {};
    return { ...x, imp: +d.impCnt || 0, clk: +d.clkCnt || 0, cost: +d.salesAmt || 0, ctr: +d.ctr || 0, cpc: +d.cpc || 0, rank: +d.avgRnk || 0, conv: +d.ccnt || 0, convAmt: +d.convAmt || 0 };
  });
  return { since, until, campaigns: pick.map((c) => c.name), groups: groups.length, rows: out };
}

// ---------------------------------------------------------------- HTTP 서버
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const MAX_BODY = 25 * 1024 * 1024; // 25MB (기존 키워드 목록·대량 분석 내역도 넉넉히)
async function readBody(req) {
  const chunks = []; let n = 0;
  // 한도를 넘으면 나머지는 버리면서 끝까지 읽은 뒤 413 (중간에 끊으면 브라우저에는 '연결 끊김'으로만 보임)
  for await (const c of req) {
    n += c.length;
    if (n <= MAX_BODY) chunks.push(c);
    else if (n > MAX_BODY * 8) { req.destroy(); break; }
  }
  if (n > MAX_BODY) { const e = new Error('요청이 너무 커요 (25MB 초과)'); e.status = 413; throw e; }
  const s = Buffer.concat(chunks).toString('utf8');
  if (!s) return {};
  try { return JSON.parse(s); } catch { const e = new Error('요청 형식이 JSON이 아니에요'); e.status = 400; throw e; }
}

// ---------------------------------------------------------------- 보안: 이 PC의 분석기 화면에서 온 요청만
// - Host: localhost / 127.0.0.1 만 (다른 도메인 이름으로 이 서버를 부르는 공격 차단)
// - 값을 바꾸는 요청(POST 등): Origin이 있으면 localhost / 127.0.0.1 이어야 함 (악성 사이트가 몰래 설정을 바꾸지 못하게)
const LOCAL_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
function guard(req, u) {
  const host = String(req.headers.host || '');
  if (host && !LOCAL_RE.test(host)) return '허용되지 않은 주소로 들어온 요청이에요';
  if (u.pathname.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = String(req.headers.origin || '');
    if (origin && origin !== 'null') {
      let oh = ''; try { oh = new URL(origin).host; } catch {}
      if (!/^https?:$/.test(new URL(origin).protocol) || !LOCAL_RE.test(oh)) return '다른 사이트에서 온 요청이라 막았어요';
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return '다른 사이트에서 온 요청이라 막았어요';
  }
  return '';
}

// ---------------------------------------------------------------- 버전: 서버 코드가 바뀌었는지 (다시 시작 필요 여부)
const SERVER_FILES = ['server.mjs', 'ai-cli.mjs', 'github-sync.mjs', 'sections.mjs', 'settings-defaults.mjs', 'copy-core.mjs', 'public/copy-spec.js', 'google-core.mjs'];
const codeHash = () => {
  const h = crypto.createHash('sha1');
  for (const f of SERVER_FILES) { try { h.update(fs.readFileSync(path.join(__dirname, f))); } catch {} }
  return h.digest('hex').slice(0, 12);
};
const BOOT_HASH = codeHash();
const STARTED_AT = Date.now();
const mask = (s) => (s ? String(s).slice(0, 4) + '••••' : '');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const blocked = guard(req, u);
  if (blocked) { console.log('  차단: ' + req.method + ' ' + u.pathname + ' (' + (req.headers.origin || req.headers.host || '') + ')'); return send(res, 403, { error: blocked }); }
  try {
    if (u.pathname === '/api/version') {
      const now = codeHash();
      return send(res, 200, { boot: BOOT_HASH, now, stale: now !== BOOT_HASH, startedAt: STARTED_AT, canRestart: process.env.KT_LOOP === '1', node: process.version });
    }
    if (u.pathname === '/api/restart' && req.method === 'POST') {
      if (process.env.KT_LOOP !== '1') return send(res, 200, { ok: false, error: '이번에는 start.bat 창을 닫고 다시 실행해 주세요. 그다음부터는 이 버튼으로 다시 시작돼요.' });
      send(res, 200, { ok: true });
      console.log('  화면에서 다시 시작을 요청했어요. 서버를 다시 켜요...');
      try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); } catch {}
      setTimeout(() => process.exit(99), 300); // start.bat이 코드 99를 받으면 다시 실행
      return;
    }
    if (u.pathname === '/api/ads/campaigns' || u.pathname === '/api/ads/perf') {
      // 광고 성과 (읽기 전용): 캠페인 목록 / 캠페인의 키워드별 성과
      if (!hasAd()) return send(res, 400, { error: '검색광고 API 키가 없어요 (설정 > API 설정)' });
      try {
        if (u.pathname === '/api/ads/campaigns') return send(res, 200, { campaigns: await adsCampaigns() });
        const b = req.method === 'POST' ? await readBody(req) : {};
        return send(res, 200, await adsPerf(b));
      } catch (e) { return send(res, e.blocked ? 403 : 502, { error: e.message }); }
    }
    if (u.pathname === '/api/suggest') {
      const kw = String(u.searchParams.get('keyword') || '').trim().slice(0, 60);
      if (!kw) return send(res, 400, { error: '키워드를 넣어주세요' });
      try { return send(res, 200, await suggest(kw, u.searchParams.get('deep') === '1')); }
      catch (e) { return send(res, 200, { error: '자동완성·연관검색어를 가져오지 못했어요: ' + e.message }); }
    }
    if (u.pathname.startsWith('/api/google/')) {
      const [st, obj] = await GOOGLE.handle(req, u, readBody);
      return send(res, st, obj);
    }
    if (u.pathname === '/api/copy/competitors') {
      const kw = String(u.searchParams.get('keyword') || '').trim().slice(0, 60);
      if (!kw) return send(res, 400, { error: '키워드를 넣어주세요' });
      try { return send(res, 200, await competitorAds(kw)); }
      catch (e) { return send(res, 200, { error: '경쟁 광고를 가져오지 못했어요: ' + e.message }); }
    }
    if (u.pathname === '/api/copy-projects' || u.pathname === '/api/ad-mock') {
      const [st, obj] = await (u.pathname === '/api/ad-mock' ? MOCK_STORE : COPY_STORE).handle(req, u, readBody);
      return send(res, st, obj);
    }
    if (u.pathname === '/api/config' && req.method === 'GET') {
      return send(res, 200, {
        hasAd: hasAd(), hasOpen: hasOpen(),
        adApiKey: mask(config.adApiKey), adSecret: mask(config.adSecret), adCustomerId: config.adCustomerId || '',
        clientId: mask(config.clientId), clientSecret: mask(config.clientSecret),
        openProvider: config.openProvider || 'hub',
        hasGemini: hasGemini(), geminiKey: mask(config.geminiKey), hasYoutube: !!config.youtubeKey, youtubeKey: mask(config.youtubeKey), geminiModel: config.geminiModel || GEMINI_DEFAULT, geminiPin: !!config.geminiPin,
        aiProvider: provider(), hasAI: hasAI(),
        // 로그인형 AI: 설치 여부(경로)와 모델
        hasAgy: PROVIDERS.agy.has(), agyModel: config.agyModel || '',
        hasClaude: PROVIDERS.claude.has(), claudeModel: config.claudeModel || '',
        hasCodex: PROVIDERS.codex.has(), codexModel: config.codexModel || '',
        cliPaths: { agy: cliPath('agy', config), claude: cliPath('claude', config), codex: cliPath('codex', config) },
        cliCustom: config.cliPaths || {},
      });
    }
    if (u.pathname === '/api/config' && req.method === 'POST') {
      const b = await readBody(req);
      const before = JSON.stringify([config.adApiKey, config.adSecret, config.adCustomerId, config.clientId, config.clientSecret, config.openProvider]);
      for (const k of ['adApiKey', 'adSecret', 'adCustomerId', 'clientId', 'clientSecret', 'geminiKey', 'geminiModel', 'youtubeKey']) {
        if (typeof b[k] === 'string' && b[k].trim() && !b[k].includes('••••')) config[k] = b[k].trim();
        if (b[k] === null) delete config[k];
      }
      // 로그인형 AI 모델: 빈 값이면 CLI 기본 모델
      for (const k of ['agyModel', 'claudeModel', 'codexModel']) {
        if (typeof b[k] === 'string') { const v = b[k].trim(); if (!v) delete config[k]; else if (/^[\w.\-:/]{1,80}$/.test(v)) config[k] = v; }
      }
      // 실행 파일을 직접 지정 (자동으로 못 찾을 때)
      if (b.cliPaths && typeof b.cliPaths === 'object') {
        config.cliPaths = { ...(config.cliPaths || {}) };
        for (const k of Object.keys(CLI)) if (typeof b.cliPaths[k] === 'string') { const v = b.cliPaths[k].trim().replace(/^"|"$/g, ''); if (v) config.cliPaths[k] = v; else delete config.cliPaths[k]; }
      }
      if (['hub', 'legacy'].includes(b.openProvider)) config.openProvider = b.openProvider;
      if (typeof b.geminiPin === 'boolean') config.geminiPin = b.geminiPin;
      if (provId(b.aiProvider)) config.aiProvider = provId(b.aiProvider);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      // 네이버 키가 바뀐 경우에만 캐시 초기화 (Gemini 모델만 바꿔도 분석 캐시는 유지)
      if (before !== JSON.stringify([config.adApiKey, config.adSecret, config.adCustomerId, config.clientId, config.clientSecret, config.openProvider])) { cache = {}; saveCache(); }
      return send(res, 200, { ok: true, hasAd: hasAd(), hasOpen: hasOpen() });
    }
    if (u.pathname === '/api/test') return send(res, 200, await testConnections());
    // GitHub 자동 백업
    if (u.pathname === '/api/github') {
      if (req.method === 'GET') return send(res, 200, GIT.status());
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (b.config) { const had = GIT.status().configured; const st = GIT.setConfig(b.config); if (!had && st.configured) GIT.start(); }
        if (b.message && typeof b.message === 'string') fs.writeFileSync(path.join(__dirname, 'data', 'next-commit.txt'), b.message.slice(0, 2000));
        if (b.sync) { const r = await GIT.sync('직접 실행'); return send(res, 200, { ...GIT.status(), result: r }); }
        return send(res, 200, GIT.status());
      }
    }
    // 화면·규칙 설정: data\settings.json
    if (u.pathname === '/api/settings') {
      if (req.method === 'GET') return send(res, 200, { settings: SETTINGS, defaults: DEFAULT_SETTINGS, file: SETTINGS_PATH });
      if (req.method === 'POST') {
        const b = await readBody(req);
        SETTINGS = normalizeSettings(b.settings || {});
        fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
        fs.writeFileSync(SETTINGS_PATH + '.tmp', JSON.stringify(SETTINGS, null, 2));
        fs.renameSync(SETTINGS_PATH + '.tmp', SETTINGS_PATH);
        return send(res, 200, { ok: true, settings: SETTINGS });
      }
    }
    // 대량 분석 내역: data\bulk-history\<id>.json + index.json(목록)
    if (u.pathname === '/api/bulk-history') {
      const readIndex = () => { try { return JSON.parse(fs.readFileSync(BULK_INDEX, 'utf8')).list || []; } catch { return []; } };
      const writeIndex = (list) => { fs.mkdirSync(BULK_DIR, { recursive: true }); fs.writeFileSync(BULK_INDEX + '.tmp', JSON.stringify({ list })); fs.renameSync(BULK_INDEX + '.tmp', BULK_INDEX); };
      const okId = (id) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);
      if (req.method === 'GET') {
        const id = u.searchParams.get('id');
        if (!id) return send(res, 200, { list: readIndex(), dir: BULK_DIR });
        if (!okId(id)) return send(res, 400, { error: '잘못된 id' });
        try { return send(res, 200, { session: JSON.parse(fs.readFileSync(path.join(BULK_DIR, id + '.json'), 'utf8')) }); }
        catch { return send(res, 404, { error: '내역 파일을 찾지 못했어요' }); }
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        let list = readIndex();
        if (b.delete) {
          if (!okId(b.delete)) return send(res, 400, { error: '잘못된 id' });
          try { fs.unlinkSync(path.join(BULK_DIR, b.delete + '.json')); } catch {}
          writeIndex(list.filter((m) => m.id !== b.delete));
          return send(res, 200, { ok: true });
        }
        if (b.vcOnly) {
          const s0 = b.session || {};
          if (!okId(s0.id)) return send(res, 400, { error: '잘못된 id' });
          try { const f = path.join(BULK_DIR, s0.id + '.json'); const full = JSON.parse(fs.readFileSync(f, 'utf8')); full.vc = s0.vc || full.vc; fs.writeFileSync(f + '.tmp', JSON.stringify(full)); fs.renameSync(f + '.tmp', f); } catch {}
          return send(res, 200, { ok: true });
        }
        const s = b.session;
        if (!s || !okId(s.id) || !Array.isArray(s.rows)) return send(res, 400, { error: 'session(id, rows)이 필요해요' });
        const meta = { id: s.id, name: String(s.name || '대량 분석').slice(0, 60), custom: !!s.custom, pinned: !!s.pinned, createdAt: Number(s.createdAt) || Date.now(), updatedAt: Number(s.updatedAt) || Date.now(), count: s.rows.length, checked: s.rows.filter((r) => r && r.checks && r.checks.length).length };
        if (!b.metaOnly) {
          fs.mkdirSync(BULK_DIR, { recursive: true });
          const f = path.join(BULK_DIR, s.id + '.json');
          fs.writeFileSync(f + '.tmp', JSON.stringify({ ...s, ...meta }));
          fs.renameSync(f + '.tmp', f);
        } else if (!list.some((m) => m.id === s.id)) return send(res, 404, { error: '없는 내역' });
        else { // 이름·고정만 바꿀 때: 파일 안의 값도 맞춰 둠
          try { const f = path.join(BULK_DIR, s.id + '.json'); const full = JSON.parse(fs.readFileSync(f, 'utf8')); Object.assign(full, { name: meta.name, custom: meta.custom, pinned: meta.pinned }); fs.writeFileSync(f + '.tmp', JSON.stringify(full)); fs.renameSync(f + '.tmp', f); meta.count = full.rows.length; meta.checked = full.rows.filter((r) => r && r.checks && r.checks.length).length; meta.updatedAt = full.updatedAt || meta.updatedAt; } catch {}
        }
        list = [meta, ...list.filter((m) => m.id !== s.id)];
        writeIndex(list);
        return send(res, 200, { ok: true, meta });
      }
    }
    // 중복 검사용 기존 키워드 목록: 이 폴더의 data\existing-keywords.json에 저장
    if (u.pathname === '/api/sources') {
      if (req.method === 'GET') {
        let sources = [];
        try { sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources || []; } catch {}
        return send(res, 200, { sources, file: SOURCES_PATH });
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!Array.isArray(b.sources)) return send(res, 400, { error: 'sources 배열이 필요해요' });
        fs.mkdirSync(path.dirname(SOURCES_PATH), { recursive: true });
        const tmp = SOURCES_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), sources: b.sources }));
        fs.renameSync(tmp, SOURCES_PATH);
        return send(res, 200, { ok: true, count: b.sources.length });
      }
    }
    if (u.pathname.startsWith('/api/ai/') || u.pathname.startsWith('/api/copy/') || u.pathname === '/api/volumes' || u.pathname === '/api/bulk-stream') {
      try {
        if (u.pathname === '/api/ai/seed' && req.method === 'POST') {
          // AI 키워드 생성기: 네이버 키워드 도구(연관 키워드 + 검색량)로 시작
          if (!hasAd()) return send(res, 400, { error: '검색광고 API 키가 없어 키워드 도구를 쓸 수 없어요 (설정 > API 설정)' });
          const b = await readBody(req);
          const ns = (x) => String(x || '').replace(/\s+/g, '');
          const ok = (h) => h && h.length <= 30;
          const examples = (Array.isArray(b.examples) ? b.examples : []).map(ns).filter(ok);
          const topic = String(b.topic || '');
          // 1차 힌트: 예시 키워드(최대 5개) + 주제 붙여 쓴 것
          const hints = [...new Set([...examples, ns(topic)].filter(ok))].slice(0, 5);
          // 2차 힌트(결과가 적을 때): 주제의 핵심 단어 (3글자 이상, '가입'·'고민' 같은 두 글자 일반어는 뺌)
          const words = [...new Set(topic.split(/[\s,/]+/).map(ns).filter((w) => w.length >= 3 && ok(w)))].sort((x, y) => y.length - x.length);
          const cores = words.filter((w) => !hints.includes(w)).slice(0, 3);
          if (!hints.length && !cores.length) return send(res, 400, { error: '키워드 도구에 넣을 키워드가 없어요' });
          const m = new Map(); // 키워드 도구가 준 순서(관련도 순)를 그대로 유지
          let err = '';
          const take = async (hs) => {
            if (!hs.length) return;
            let rows = [];
            try { rows = await keywordTool(hs); } catch (e) { err = e.message; }
            if (!rows.length && hs.length > 1) for (const h of hs) { try { rows.push(...await keywordTool([h])); } catch (e) { err = e.message; } } // 힌트 하나가 잘못되면 전체가 실패하므로 하나씩
            for (const r of rows) if (!m.has(normKw(r.keyword))) m.set(normKw(r.keyword), r);
          };
          await take(hints);
          const used = [...hints];
          if (m.size < 30 && cores.length) { await take(cores); used.push(...cores); }
          if (!m.size && err) return send(res, 502, { error: '키워드 도구 조회 실패: ' + err });
          return send(res, 200, { hints: used, match: [...new Set([...hints, ...words])], list: [...m.values()].map((r) => ({ keyword: r.keyword, pc: r.pc, mo: r.mo, total: r.total, comp: r.comp, pcLow: r.pcLow, moLow: r.moLow })) });
        }
        if (u.pathname === '/api/ai/cli-status') {
          const out = {};
          for (const p of Object.keys(CLI)) out[p] = await cliStatus(p, config);
          return send(res, 200, { cli: out });
        }
        if (u.pathname === '/api/ai/cli-watch') {
          const p = u.searchParams.get('provider');
          if (!CLI[p]) return send(res, 400, { error: '알 수 없는 AI' });
          const st = { path: cliPath(p, config, true), job: cliJobs()[p] || null };
          if (u.searchParams.get('login') === '1' && st.path && CLI[p].statusArgs) { try { st.login = (await cliStatus(p, config)).login; } catch {} }
          return send(res, 200, st);
        }
        if (u.pathname === '/api/ai/cli-test' && req.method === 'POST') {
          const b = await readBody(req);
          if (!CLI[b.provider]) return send(res, 400, { error: '알 수 없는 AI' });
          try { return send(res, 200, await cliTest(b.provider, config, typeof b.model === 'string' ? b.model : PROVIDERS[b.provider].model())); }
          catch (e) { return send(res, 200, { ok: false, error: e.message }); }
        }
        if (u.pathname === '/api/ai/cli-open' && req.method === 'POST') {
          // 다른 웹사이트가 이 PC의 분석기에 몰래 요청하지 못하게: 분석기 화면에서 온 요청만
          const origin = req.headers.origin || '';
          if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return send(res, 403, { error: '허용되지 않은 요청' });
          const b = await readBody(req);
          if (!CLI[b.provider] || !['login', 'install'].includes(b.action)) return send(res, 400, { error: '잘못된 요청' });
          try { return send(res, 200, { ok: true, ...openConsole(b.provider, b.action, config) }); }
          catch (e) { return send(res, 200, { ok: false, error: e.message }); }
        }
        if (u.pathname === '/api/ai/models') { const p = PROVIDERS[u.searchParams.get('provider')] ? u.searchParams.get('provider') : provider(); return send(res, 200, { provider: p, models: await providerModels(p), current: PROVIDERS[p].model() }); }
        const b = req.method === 'POST' ? await readBody(req) : {};
        if (u.pathname === '/api/ai/generate') return send(res, 200, await aiGenerate(b));
        const streamFn = { '/api/ai/generate-stream': aiGenerateStream, '/api/ai/verify-stream': aiVerifyStream, '/api/bulk-stream': bulkStream, '/api/copy/generate-stream': copyGenerateStream, '/api/copy/verify-stream': copyVerifyStream }[u.pathname];
        if (streamFn) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          // 브라우저에서 [중지]하면 Gemini 요청도 같이 끊음
          const ac = new AbortController();
          res.on('close', () => { if (!res.writableEnded) ac.abort(); });
          const emit = (type, data) => { if (!ac.signal.aborted) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
          try { emit('done', await streamFn(b, emit, ac.signal)); }
          catch (e) { if (!ac.signal.aborted) emit('error', { message: e.message }); }
          return res.end();
        }
        if (u.pathname === '/api/ai/embed-near') return send(res, 200, await embedNear(b));
        if (u.pathname === '/api/ai/semantic') return send(res, 200, { results: await aiSemantic(b) });
        if (u.pathname === '/api/ai/verify') return send(res, 200, await aiVerify(b));
        if (u.pathname === '/api/volumes') return send(res, 200, { volumes: await volumes(b.keywords || []) });
      } catch (e) { return send(res, 200, { error: e.message }); }
    }
    if (u.pathname === '/api/analyze') {
      const kw = u.searchParams.get('keyword') || '';
      if (!kw.trim()) return send(res, 400, { error: '키워드를 입력하세요' });
      return send(res, 200, await analyze(kw));
    }
    if (u.pathname === '/api/sections') {
      const kw = u.searchParams.get('keyword') || '';
      try { return send(res, 200, await sections(kw.trim())); } catch (e) { return send(res, 200, { error: '네이버 검색 결과를 가져오지 못했어요: ' + e.message }); }
    }
    if (u.pathname === '/api/compare' && req.method === 'POST') return send(res, 200, await compare((await readBody(req)).keywords || []));
    if (u.pathname === '/api/blogcounts' && req.method === 'POST') return send(res, 200, { counts: await blogCounts((await readBody(req)).keywords || []), missing: !hasOpen() });

    // 정적 파일
    let p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    const fp = path.join(PUBLIC_DIR, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!fp.startsWith(PUBLIC_DIR) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
  }
});

const openBrowser = () => {
  if (!process.argv.includes('--open')) return;
  const url = 'http://localhost:' + PORT;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
};

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  ${PORT}번 포트가 이미 사용 중이에요. 분석기가 이미 켜져 있다면 브라우저에서 http://localhost:${PORT} 를 여세요.\n`);
    openBrowser();
  } else console.error(e);
});

const GIT = createGitSync(__dirname);
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  키워드 분석기 실행 중:  http://localhost:' + PORT);
  console.log('  검색광고 API: ' + (hasAd() ? '설정됨' : '미설정 (관련 항목 미표시)') + '  |  검색·트렌드 API: ' + (hasOpen() ? '설정됨' : '미설정 (관련 항목 미표시)'));
  const gs = GIT.status();
  console.log('  GitHub 자동 백업: ' + (gs.configured ? gs.url + ' (파일이 바뀌면 30초 뒤 자동으로 올려요)' : '미설정'));
  console.log('  종료하려면 이 창을 닫거나 Ctrl+C');
  console.log('');
  openBrowser();
  GIT.start();
});
