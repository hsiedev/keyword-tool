// 파워링크 순위 추적: 켜 두면 서버가 정해진 간격으로 내 파워링크가 몇 위인지 계속 확인 (클릭·캡처 없음)
// - 순위 확인은 powerlink-core 의 rankOnce (로그아웃 · 쿠키 없음 · '광고 더보기' HTML 1번) 그대로
// - 분석기와 같은 검색 간격 제한을 함께 써서, 분석과 동시에 돌아도 네이버 검색 총량은 늘지 않음 (분석이 조금 느려짐)
// - 입찰가를 기록하면 그 키워드만 20분 동안 1분마다 확인 (집중 확인)
// - 알림: 목표 순위 도달 · 이탈, 미노출 · 다시 노출, 추적 시간 끝 (순위가 흔들려서 2번 연속 같을 때만)
// - 저장: data\powerlink\track\<id>\tracker.json (설정 · 최근 상태), p-YYYYMMDD.jsonl (확인 기록, 30일 지나면 삭제)
// - 서버를 다시 켜면 켜져 있던 추적은 알아서 이어감
import fs from 'node:fs';
import path from 'node:path';
import { buildXlsx } from './powerlink-core.mjs';

const MAXN = { pc: 10, mo: 5 };
const DEVN = { pc: 'PC', mo: '모바일' };
const KEEP_DAYS = 30;
const FOCUS_MS = 20 * 60000, FOCUS_GAP = 60000;
const RECENT_MS = 3 * 3600000;
const INTERVALS = [1, 3, 5, 10, 15, 30, 60];
const CAPS = [10, 30, 50, 100];
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
export const trackKey = (kw) => String(kw || '').replace(/\s+/g, '').toUpperCase();
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!m) return null; const v = +m[1] * 60 + +m[2]; return +m[2] < 60 && v >= 0 && v <= 1440 ? v : null; };
const fmtMin = (m) => (m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`);
const rankText = (r, dev) => (r == null ? '미노출' : r > MAXN[dev] ? `더보기 ${r}위` : `${r}위`);
const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// 추적 설정 검사 (화면에서 받은 값 → 저장할 값)
export function cleanTracker(b, old) {
  const urls = (Array.isArray(b.urls) ? b.urls : String(b.urls || '').split(/[\s,]+/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  if (!urls.length) throw new Error('내 파워링크 URL을 넣어주세요');
  const devices = ['pc', 'mo'].filter((d) => (Array.isArray(b.devices) ? b.devices : ['pc', 'mo']).includes(d));
  if (!devices.length) throw new Error('PC나 모바일 중 하나는 골라주세요');
  const cap = CAPS.includes(+b.cap) ? +b.cap : 30;
  const interval = INTERVALS.includes(+b.interval) ? +b.interval : 5;
  const tg = (v) => { if (v == null || v === '') return null; const n = Math.round(Number(v)); return n >= 1 && n <= 25 ? n : null; };
  const before = new Map((old?.items || []).map((i) => [i.key, i]));
  const seen = new Set(), items = [];
  for (const x of Array.isArray(b.items) ? b.items : []) {
    const kw = String(typeof x === 'string' ? x : x?.kw || '').trim().slice(0, 60), key = trackKey(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const o = before.get(key) || {};
    const obj = x && typeof x === 'object' ? x : null;
    items.push({ key, kw, on: obj?.on !== false,
      target: { pc: obj && 'targetPc' in obj ? tg(obj.targetPc) : o.target?.pc ?? null, mo: obj && 'targetMo' in obj ? tg(obj.targetMo) : o.target?.mo ?? null } });
  }
  if (!items.length) throw new Error('추적할 키워드를 넣어주세요');
  if (items.length > cap) throw new Error(`키워드가 ${items.length}개예요. 키워드 상한(${cap}개)을 올리거나 키워드를 줄여 주세요`);
  const s = b.sched || {};
  const mode = ['always', 'hours', 'for'].includes(s.mode) ? s.mode : 'always';
  const sched = { mode, from: hm(s.from) != null ? String(s.from).trim() : '09:00', to: hm(s.to) != null ? String(s.to).trim() : '24:00',
    minutes: Math.min(1440, Math.max(10, Math.round(Number(s.minutes) || 60))) };
  if (mode === 'hours' && hm(sched.from) === hm(sched.to)) throw new Error('추적 시작 시각과 끝 시각이 같아요');
  const name = String(b.name || '').trim().slice(0, 60) || `${items[0].kw}${items.length > 1 ? ` 외 ${items.length - 1}개` : ''}`;
  return { name, urls, devices, cap, interval, items, sched, notify: b.notify !== false };
}

// 목표 상태 판정: 순위가 검색마다 흔들리므로 같은 상태가 2번 연속일 때만 바뀐 것으로 봄
// 반환: 새로 확정된 상태 변화 { from, to } 또는 null. 첫 확인은 기준만 잡고 알림 없음
export function judge(L, r, target) {
  const s = r == null ? 'gone' : target && r <= target ? 'hit' : 'show';
  if (L.cand === s) L.candN = (L.candN || 0) + 1; else { L.cand = s; L.candN = 1; }
  if (L.state == null) { L.state = s; return null; }
  if (s !== L.state && L.candN >= 2) { const from = L.state; L.state = s; return { from, to: s }; }
  return null;
}

export function createTracker({ root, rankOnce, limiter }) {
  const DIR = path.join(root, 'track');
  fs.mkdirSync(DIR, { recursive: true });
  const okId = (id) => /^tr\d{8,}[a-z0-9]*$/.test(String(id || ''));
  const dirOf = (id) => path.join(DIR, id);
  const T = new Map(); // id → 추적
  const recent = new Map(); // id → Map('key|dev' → [[t, r]]) 최근 3시간 (표의 작은 그래프용)

  // ---------------------------------------------------------------- 저장
  const timers = new Map();
  function save(t, now = false) {
    t.updatedAt = Date.now();
    const w = () => {
      timers.delete(t.id);
      if (!T.has(t.id)) return;
      try {
        fs.mkdirSync(dirOf(t.id), { recursive: true });
        const f = path.join(dirOf(t.id), 'tracker.json');
        fs.writeFileSync(f + '.tmp', JSON.stringify(t)); fs.renameSync(f + '.tmp', f);
        t.saveErr = '';
      } catch (e) { t.saveErr = e.message; console.error('[순위 추적] 저장 실패: ' + e.message); }
    };
    clearTimeout(timers.get(t.id));
    if (now) w(); else timers.set(t.id, setTimeout(w, 3000));
  }
  process.once('exit', () => { for (const id of [...timers.keys()]) { const t = T.get(id); if (t) save(t, true); } });

  function readPoints(id, from, to, want) {
    const out = [];
    let files = [];
    try { files = fs.readdirSync(dirOf(id)).filter((f) => /^p-\d{8}\.jsonl$/.test(f)).sort(); } catch { return out; }
    const a = dayOf(from), z = dayOf(to);
    for (const f of files) {
      const d = f.slice(2, 10);
      if (d < a || d > z) continue;
      let txt = '';
      try { txt = fs.readFileSync(path.join(dirOf(id), f), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) {
        if (!line) continue;
        let p; try { p = JSON.parse(line); } catch { continue; }
        if (p[0] < from || p[0] > to) continue;
        if (want && !want(p)) continue;
        out.push(p);
      }
    }
    return out;
  }
  function prune() {
    const cut = dayOf(Date.now() - KEEP_DAYS * 86400000);
    for (const id of T.keys()) {
      try { for (const f of fs.readdirSync(dirOf(id))) if (/^p-\d{8}\.jsonl$/.test(f) && f.slice(2, 10) < cut) fs.rmSync(path.join(dirOf(id), f), { force: true }); } catch {}
    }
  }

  // 불러오기 (서버 켤 때)
  for (const d of fs.readdirSync(DIR)) {
    if (!okId(d)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(dirOf(d), 'tracker.json'), 'utf8'));
      t.inRound = false; t.cur = ''; t.nextAt = 0;
      if (t.focus) for (const f of Object.values(t.focus)) f.next = 0;
      T.set(t.id, t);
      const m = new Map(), now = Date.now();
      for (const p of readPoints(t.id, now - RECENT_MS, now)) { const k = p[1] + '|' + p[2]; if (!m.has(k)) m.set(k, []); m.get(k).push([p[0], p[3]]); }
      recent.set(t.id, m);
    } catch (e) { console.error('[순위 추적] 불러오기 실패 ' + d + ': ' + e.message); }
  }
  prune();
  setInterval(prune, 6 * 3600000).unref?.();

  // ---------------------------------------------------------------- 알림 이벤트
  function addEvent(t, ev) {
    const e = { at: Date.now(), ...ev };
    t.events = [...(t.events || []), e].slice(-100);
    return e;
  }
  function eventOf(t, it, dev, ch, r) {
    const tg = it.target?.[dev], where = `${it.kw} · ${DEVN[dev]}`;
    if (ch.to === 'hit') return addEvent(t, { type: 'hit', key: it.key, kw: it.kw, dev, r, text: `${where}: 목표 ${tg}위 도달 (지금 ${rankText(r, dev)})` });
    if (ch.to === 'gone') return addEvent(t, { type: 'gone', key: it.key, kw: it.kw, dev, r, text: `${where}: 광고가 안 보여요 (미노출)` });
    if (ch.from === 'hit') return addEvent(t, { type: 'lost', key: it.key, kw: it.kw, dev, r, text: `${where}: 목표 ${tg}위 밖으로 밀렸어요 (지금 ${rankText(r, dev)})` });
    if (ch.from === 'gone') return addEvent(t, { type: 'back', key: it.key, kw: it.kw, dev, r, text: `${where}: 다시 노출돼요 (${rankText(r, dev)})` });
    return null;
  }

  // ---------------------------------------------------------------- 확인
  const alive = (t) => t.on && T.get(t.id) === t;
  async function check(t, it, dev) {
    let res;
    try { res = await rankOnce(it.kw, t.urls, dev, () => !alive(t)); }
    catch (e) { if (e.message === 'STOP') throw e; t.note = '확인 실패: ' + String(e.message).slice(0, 120); t.errAt = Date.now(); return; }
    if (!alive(t)) return;
    const now = Date.now(), k = it.key + '|' + dev;
    t.last = t.last || {};
    const L = (t.last[k] = t.last[k] || {});
    if (L.at) { L.prev = L.r; L.prevAt = L.at; }
    L.r = res.rank; L.at = now; L.total = res.total; L.n = (L.n || 0) + 1;
    if (res.display) L.display = res.display;
    const ch = judge(L, res.rank, it.target?.[dev]);
    if (ch) eventOf(t, it, dev, ch, res.rank);
    try { fs.mkdirSync(dirOf(t.id), { recursive: true }); fs.appendFileSync(path.join(dirOf(t.id), `p-${dayOf(now)}.jsonl`), JSON.stringify([now, it.key, dev, res.rank, res.total]) + '\n'); }
    catch (e) { t.note = '기록 저장 실패: ' + e.message; }
    const m = recent.get(t.id) || new Map(); recent.set(t.id, m);
    const arr = m.get(k) || []; arr.push([now, res.rank]);
    while (arr.length && arr[0][0] < now - RECENT_MS) arr.shift();
    m.set(k, arr);
    t.checks = (t.checks || 0) + 1;
    if (t.note && !t.note.startsWith('기록')) t.note = '';
    save(t);
  }

  function waitNote(t, now) {
    if (t.sched?.mode !== 'hours') return '';
    const a = hm(t.sched.from) ?? 540, b = hm(t.sched.to) ?? 1440;
    const d = new Date(now), m = d.getHours() * 60 + d.getMinutes();
    const inside = a <= b ? m >= a && m < b : m >= a || m < b;
    return inside ? '' : `추적 시간(${t.sched.from}~${t.sched.to})이 아니라 ${t.sched.from}까지 쉬는 중`;
  }
  function start(t) {
    t.on = true; t.startedAt = Date.now(); t.stoppedAt = null; t.endReason = ''; t.note = ''; t.nextAt = 0;
    t.endAt = t.sched?.mode === 'for' ? t.startedAt + t.sched.minutes * 60000 : null;
    for (const L of Object.values(t.last || {})) { L.cand = null; L.candN = 0; }
    save(t, true);
  }
  function stop(t, reason = 'user') {
    t.on = false; t.stoppedAt = Date.now(); t.endReason = reason; t.inRound = false; t.cur = ''; t.endAt = null;
    if (reason === 'time') addEvent(t, { type: 'end', text: `'${t.name}' 추적 시간(${fmtMin(t.sched.minutes)})이 끝나서 멈췄어요` });
    save(t, true);
  }

  // 1~2초마다: 켜진 추적 중 차례가 된 것을 확인 (한 번에 하나씩, 검색 간격은 분석기와 함께 씀)
  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      for (const t of [...T.values()]) {
        if (!alive(t)) continue;
        const now = Date.now();
        if (t.endAt && now >= t.endAt) { stop(t, 'time'); continue; }
        const w = waitNote(t, now);
        t.waiting = !!w;
        if (w) { t.note = w; continue; }
        if (t.note?.startsWith('추적 시간')) t.note = '';
        const items = t.items.filter((i) => i.on !== false);
        // 집중 확인: 입찰가를 기록한 키워드는 20분 동안 1분마다
        for (const it of items) {
          const f = t.focus?.[it.key];
          if (!f) continue;
          if (f.until < Date.now()) { delete t.focus[it.key]; save(t); continue; }
          if ((f.next || 0) > Date.now()) continue;
          f.next = Date.now() + FOCUS_GAP;
          for (const dev of f.dev === 'pc' || f.dev === 'mo' ? [f.dev].filter((d) => t.devices.includes(d)) : t.devices) { if (!alive(t)) break; t.cur = it.kw; await check(t, it, dev); }
          t.cur = '';
        }
        if (!alive(t) || Date.now() < (t.nextAt || 0)) continue;
        const st = Date.now();
        t.inRound = true; t.roundAt = st; t.nextAt = st + t.interval * 60000;
        for (const it of items) {
          if (!alive(t)) break;
          for (const dev of t.devices) { if (!alive(t)) break; t.cur = it.kw; await check(t, it, dev); }
        }
        t.inRound = false; t.cur = '';
        if (alive(t)) {
          t.roundMs = Date.now() - st; t.rounds = (t.rounds || 0) + 1;
          if (Date.now() > t.nextAt) t.nextAt = Date.now(); // 한 바퀴가 간격보다 길면 바로 다음 바퀴
        }
        save(t);
      }
    } catch (e) {
      if (e.message !== 'STOP') console.error('[순위 추적] ' + e.message);
      for (const t of T.values()) { t.inRound = false; t.cur = ''; }
    } finally { busy = false; }
  }
  setInterval(tick, 1500).unref?.();

  // ---------------------------------------------------------------- 화면에 보낼 모양
  function view(t, withSpark = true) {
    const m = recent.get(t.id);
    const rows = [];
    for (const it of t.items) for (const dev of t.devices) {
      const k = it.key + '|' + dev, L = t.last?.[k] || {};
      rows.push({ key: it.key, kw: it.kw, dev, on: it.on !== false, target: it.target?.[dev] ?? null, r: L.r ?? null, at: L.at || null, prev: L.prev, prevAt: L.prevAt || null,
        total: L.total ?? null, n: L.n || 0, state: L.state || null, focus: !!(t.focus?.[it.key]?.until > Date.now()),
        sp: withSpark ? (m?.get(k) || []) : undefined });
    }
    return { id: t.id, name: t.name, urls: t.urls, devices: t.devices, cap: t.cap, interval: t.interval, sched: t.sched, notify: t.notify !== false,
      items: t.items, on: !!t.on, waiting: !!t.waiting, inRound: !!t.inRound, cur: t.cur || '', note: t.note || '', nextAt: t.nextAt || 0, endAt: t.endAt || null,
      startedAt: t.startedAt || null, stoppedAt: t.stoppedAt || null, endReason: t.endReason || '', roundMs: t.roundMs || null, rounds: t.rounds || 0, checks: t.checks || 0,
      bids: (t.bids || []).slice(-200), createdAt: t.createdAt, updatedAt: t.updatedAt, saveErr: t.saveErr || '', rows };
  }
  function eventsSince(since) {
    const out = [];
    for (const t of T.values()) for (const e of t.events || []) if (e.at > since) out.push({ ...e, id: t.id, name: t.name, notify: t.notify !== false });
    return out.sort((a, b) => a.at - b.at).slice(-50);
  }
  const RANGE = { '1h': 3600000, '3h': 3 * 3600000, today: null, '7d': 7 * 86400000, '30d': 30 * 86400000 };
  function rangeOf(r) {
    const now = Date.now();
    if (r === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return [d.getTime(), now]; }
    return [now - (RANGE[r] || RANGE['7d']), now];
  }
  function xlsx(t, range) {
    const [a, z] = rangeOf(range);
    const kwOf = new Map(t.items.map((i) => [i.key, i.kw]));
    const pts = readPoints(t.id, a, z);
    const fmt = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
    const rows = [['확인 시각', '키워드', '기기', '순위', '순위(숫자)', '광고 수']];
    for (const p of pts) rows.push([fmt(p[0]), kwOf.get(p[1]) || p[1], DEVN[p[2]] || p[2], rankText(p[3], p[2]), p[3] ?? '', p[4] ?? '']);
    const bids = [['기록 시각', '키워드', '기기', '입찰가(원)', '메모']];
    for (const b of t.bids || []) if (b.at >= a && b.at <= z) bids.push([fmt(b.at), kwOf.get(b.key) || b.key, b.dev === 'pc' ? 'PC' : b.dev === 'mo' ? '모바일' : 'PC·모바일', b.bid ?? '', b.note || '']);
    return buildXlsx([{ name: '순위 기록', rows, widths: [20, 28, 8, 12, 10, 8] }, { name: '입찰가 기록', rows: bids, widths: [20, 28, 10, 12, 30] }]);
  }

  // ---------------------------------------------------------------- HTTP (/api/pl/track...)
  const get = (id) => { const t = T.get(String(id || '')); if (!t) { const e = new Error('없는 추적이에요'); e.status = 404; throw e; } return t; };
  async function handle(req, res, u, readBody, send) {
    const p = u.pathname;
    try {
      if (p === '/api/pl/track') {
        const since = Number(u.searchParams.get('since')) || 0;
        const lim = limiter?.() || {};
        const on = [...T.values()].filter((t) => t.on);
        const base = { now: Date.now(), pauseUntil: lim.pauseUntil > Date.now() ? lim.pauseUntil : 0, on: on.length,
          onKw: on.reduce((n, t) => n + t.items.filter((i) => i.on !== false).length * t.devices.length, 0), events: since ? eventsSince(since) : [] };
        if (u.searchParams.get('lite') === '1') return send(res, 200, { ...base, names: on.map((t) => t.name) });
        return send(res, 200, { ...base, trackers: [...T.values()].sort((a, b) => b.createdAt - a.createdAt).map((t) => view(t)) });
      }
      if (p === '/api/pl/track/points') {
        const t = get(u.searchParams.get('id')), key = String(u.searchParams.get('key') || ''), dev = u.searchParams.get('dev') === 'mo' ? 'mo' : 'pc';
        const [a, z] = rangeOf(u.searchParams.get('range') || 'today');
        const pts = readPoints(t.id, a, z, (q) => q[1] === key && q[2] === dev).map((q) => [q[0], q[3]]);
        return send(res, 200, { from: a, to: z, pts, bids: (t.bids || []).filter((b) => b.key === key && (b.dev === dev || b.dev === 'both') && b.at >= a && b.at <= z) });
      }
      if (p === '/api/pl/track/xlsx') {
        const t = get(u.searchParams.get('id'));
        const buf = xlsx(t, u.searchParams.get('range') || '7d');
        res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('순위추적_' + t.name.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx')}`, 'Cache-Control': 'no-store' });
        return res.end(buf);
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST로 보내주세요' });
      const b = await readBody(req);
      if (p === '/api/pl/track/save') {
        const old = b.id ? get(b.id) : null;
        const v = cleanTracker(b, old);
        if (old) {
          const devChanged = v.devices.join() !== old.devices.join() || v.urls.join() !== old.urls.join();
          Object.assign(old, v);
          if (devChanged) old.last = {};
          if (old.on) { old.nextAt = 0; if (old.sched.mode === 'for') old.endAt = (old.startedAt || Date.now()) + old.sched.minutes * 60000; else old.endAt = null; }
          if (b.start && !old.on) start(old); else save(old, true);
          return send(res, 200, { id: old.id });
        }
        if (T.size >= 20) throw new Error('추적은 20개까지 만들 수 있어요. 안 쓰는 추적을 지워 주세요');
        const now = Date.now();
        const t = { id: 'tr' + now + Math.random().toString(36).slice(2, 6), ...v, on: false, createdAt: now, updatedAt: now, last: {}, bids: [], focus: {}, events: [] };
        T.set(t.id, t); recent.set(t.id, new Map());
        if (b.start) start(t); else save(t, true);
        if (t.saveErr) { T.delete(t.id); throw new Error('추적을 저장하지 못했어요: ' + t.saveErr); }
        return send(res, 200, { id: t.id });
      }
      if (p === '/api/pl/track/start') { const t = get(b.id); if (!t.on) start(t); return send(res, 200, { ok: true }); }
      if (p === '/api/pl/track/stop') { const t = get(b.id); if (t.on) stop(t); return send(res, 200, { ok: true }); }
      if (p === '/api/pl/track/now') {
        const t = get(b.id);
        if (!t.on) throw new Error('추적이 멈춰 있어요. [시작]을 먼저 눌러 주세요');
        if (t.waiting) throw new Error(t.note || '지금은 추적 시간이 아니에요');
        if (!t.inRound) t.nextAt = 0;
        return send(res, 200, { ok: true, inRound: !!t.inRound });
      }
      if (p === '/api/pl/track/notify') { const t = get(b.id); t.notify = !!b.on; save(t, true); return send(res, 200, { ok: true }); }
      if (p === '/api/pl/track/target') {
        const t = get(b.id), it = t.items.find((i) => i.key === b.key);
        if (!it) throw new Error('없는 키워드예요');
        const dev = b.dev === 'mo' ? 'mo' : 'pc', n = b.value === '' || b.value == null ? null : Math.round(Number(b.value));
        if (n != null && !(n >= 1 && n <= 25)) throw new Error('목표 순위는 1~25 사이로 넣어 주세요');
        it.target = { ...(it.target || {}), [dev]: n };
        const L = t.last?.[it.key + '|' + dev];
        if (L) { L.state = null; L.cand = null; L.candN = 0; } // 새 목표 기준으로 다시 판정
        save(t, true);
        return send(res, 200, { ok: true });
      }
      if (p === '/api/pl/track/bid') {
        const t = get(b.id), it = t.items.find((i) => i.key === b.key);
        if (!it) throw new Error('없는 키워드예요');
        const bid = b.bid === '' || b.bid == null ? null : Math.round(Number(String(b.bid).replace(/[^\d.]/g, '')));
        if (bid != null && !(bid >= 0 && bid <= 100000)) throw new Error('입찰가는 0~100,000원 사이로 넣어 주세요');
        const dev = ['pc', 'mo'].includes(b.dev) ? b.dev : 'both';
        const e = { at: Date.now(), key: it.key, dev, bid, note: String(b.note || '').trim().slice(0, 100) };
        t.bids = [...(t.bids || []), e].slice(-500);
        let focus = false;
        if (b.focus !== false && t.on) { t.focus = t.focus || {}; t.focus[it.key] = { until: Date.now() + FOCUS_MS, next: 0, dev }; focus = true; }
        save(t, true);
        return send(res, 200, { ok: true, focus });
      }
      if (p === '/api/pl/track/bid-del') {
        const t = get(b.id);
        t.bids = (t.bids || []).filter((x) => !(x.at === Number(b.at) && x.key === b.key));
        save(t, true);
        return send(res, 200, { ok: true });
      }
      if (p === '/api/pl/track/delete') {
        const t = get(b.id);
        t.on = false; T.delete(t.id); recent.delete(t.id); clearTimeout(timers.get(t.id)); timers.delete(t.id);
        fs.rmSync(dirOf(t.id), { recursive: true, force: true });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: '없는 주소예요' });
    } catch (e) { return send(res, e.status || 400, { error: e.message }); }
  }

  return { handle, running: () => [...T.values()].filter((t) => t.on).length, _tick: tick, _T: T };
}
