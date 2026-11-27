import plColumns from './public/pl-columns.js';
import { comparePowerlink, keyOf, periodOf, reports } from './powerlink-compare.mjs';
// 파워링크 분석기 (AI 없이 이 PC에서 크롤링)
// - 순위: 로그아웃 상태의 네이버 '광고 더보기' 페이지 HTML을 받아 광고 순서를 읽음 (PC 최대 25위, 모바일 최대 15위). 가볍고 빠름
//         같은 키워드를 여러 번(기본 4회) 검색해서 평균 순위를 냄 (검색할 때마다 순위가 조금씩 바뀜)
// - 캡처: 기본으로 안 찍음 (2026-11-27 사용자 요청으로 화면에서 뺌). 설정 rules.powerlink.capture = true 일 때만
//         이 PC의 Edge(없으면 Chrome)를 화면 없이(headless) 띄워 통합검색 화면의 파워링크 영역을 찍음
// - 내 광고 찾기: 사용자가 준 URL(고유번호·추적값 없어도 됨)과 광고의 표시 URL을 비교 (주소+경로 > 같은 주소 > 같은 도메인)
// - 입찰가: 네이버 검색광고 API의 순위별 평균 입찰가(최근 4주)와 그 입찰가의 예상 실적 (읽기 전용 호출만)
// - 네이버 검색 제한을 피하려고 모든 검색 사이에 간격(기본 1.2초), 제한에 걸리면 자동으로 쉬었다 이어감
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
export const UA_MO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEV = { pc: { more: (q) => `https://ad.search.naver.com/search.naver?where=ad&query=${q}`, main: (q) => `https://search.naver.com/search.naver?where=nexearch&query=${q}`, ua: UA_PC, api: 'PC', maxN: 10 },
  mo: { more: (q) => `https://m.ad.search.naver.com/search.naver?where=m_expd&query=${q}`, main: (q) => `https://m.search.naver.com/search.naver?where=m&query=${q}`, ua: UA_MO, api: 'MOBILE', maxN: 5 } };

// ---------------------------------------------------------------- 내 광고 찾기 (URL 비교)
export const normUrl = (u) => String(u || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^www\./, '');
const hostOf = (n) => n.split('/')[0];
const bareHost = (h) => h.replace(/^(www|m|mobile)\./, '');
export function regDomain(h) {
  const p = h.split('.');
  if (p.length <= 2) return h;
  const tld = p[p.length - 1], sld = p[p.length - 2];
  if (tld.length === 2 && /^(co|or|go|ac|ne|re|pe|ms|hs|es|kg|sc|com|net|org|gov|edu)$/.test(sld)) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
// 3: 주소+경로 일치(한쪽이 다른 쪽을 포함) · 2: 같은 주소(경로 다름) · 1: 같은 도메인(하위 주소 다름) · 0: 다름
export function matchScore(display, target) {
  const d = normUrl(display), t = normUrl(target);
  if (!d || !t) return 0;
  const dh = hostOf(d), th = hostOf(t), dp = d.slice(dh.length), tp = t.slice(th.length);
  if (bareHost(dh) === bareHost(th)) return !dp || !tp || tp.startsWith(dp) || dp.startsWith(tp) ? 3 : 2;
  return regDomain(dh) === regDomain(th) ? 1 : 0;
}
export const MATCH_LABEL = { 3: '주소 일치', 2: '같은 주소 · 경로 다름', 1: '같은 도메인만' };
// ads: [{rank, display}] → 가장 잘 맞는 광고 (점수 높은 것, 같으면 순위 높은 것)
export function findMine(ads, targets) {
  let best = null;
  for (const a of ads) {
    const s = Math.max(0, ...targets.map((t) => matchScore(a.display, t)));
    if (s && (!best || s > best.score || (s === best.score && a.rank < best.rank))) best = { rank: a.rank, display: a.display, score: s };
  }
  return best;
}

// ---------------------------------------------------------------- 광고 목록 읽기 (HTML)
const unent = (s) => s.replace(/&quot;/g, '"').replace(/&#x3D;/g, '=').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
// data-nlog-params 의 cr_rank_legacy(순위) · display_url(표시 URL) · ad_id(nad-a001-01 = 파워링크, -03 = 파워컨텐츠는 제외)
export function parseAds(html) {
  const out = new Map();
  const re = /data-nlog-params=(?:'([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] ?? m[2];
    if (!raw.includes('cr_rank_legacy')) continue;
    let j; try { j = JSON.parse(unent(raw)); } catch { continue; }
    const id = String(j.ad_id || j.gdid || '');
    if (id && !id.startsWith('nad-a001-01')) continue;
    const rank = Number(j.cr_rank_legacy);
    if (!rank || out.has(rank)) continue;
    out.set(rank, { rank, display: String(j.display_url || '').replace(/^https?:\/\//, '') });
  }
  return [...out.values()].sort((a, b) => a.rank - b.rank);
}
const isBlocked = (status, html) => status === 403 || status === 429 || /검색 서비스 이용이 (일시적으로 )?제한|비정상적인 (검색|접근)|자동입력 방지/.test(html.slice(0, 60000));

// ---------------------------------------------------------------- 화면 없는 브라우저 (Chrome DevTools Protocol, 추가 설치 없음)
function findBrowser() {
  const L = process.env.LOCALAPPDATA || '', PF = process.env['ProgramFiles'] || 'C:\\Program Files', PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const list = [path.join(PF86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(PF, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(PF, 'Google\\Chrome\\Application\\chrome.exe'), path.join(PF86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(L, 'Google\\Chrome\\Application\\chrome.exe')];
  return list.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}
class Headless {
  constructor(profileDir) { this.dir = profileDir; this.ws = null; this.proc = null; this.seq = 0; this.wait = new Map(); this.events = []; this.sid = null; }
  async start() {
    const exe = findBrowser();
    if (!exe) throw new Error('캡처에 쓸 Edge나 Chrome을 찾지 못했어요');
    fs.mkdirSync(this.dir, { recursive: true });
    const portFile = path.join(this.dir, 'DevToolsActivePort');
    try { fs.unlinkSync(portFile); } catch {}
    this.proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${this.dir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disk-cache-size=1048576', '--media-cache-size=1048576', '--hide-scrollbars', '--mute-audio', '--lang=ko-KR', '--window-size=1280,2400', 'about:blank'], { stdio: 'ignore', windowsHide: true });
    this.proc.on('exit', () => { this.proc = null; this.ws = null; });
    let port = 0;
    for (let i = 0; i < 100 && !port; i++) { await sleep(150); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch {} }
    if (!port) { this.close(); throw new Error('캡처용 브라우저를 띄우지 못했어요'); }
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(10000) })).json();
    this.ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((ok, no) => { this.ws.onopen = ok; this.ws.onerror = () => no(new Error('브라우저 연결 실패')); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
      if (m.id && this.wait.has(m.id)) { const w = this.wait.get(m.id); this.wait.delete(m.id); m.error ? w.no(new Error(m.error.message)) : w.ok(m.result); }
      else if (m.method) { this.events.push(m); if (this.events.length > 200) this.events.shift(); }
    };
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sid = sessionId;
    await this.send('Page.enable', {}, true);
    await this.send('Runtime.enable', {}, true);
  }
  send(method, params = {}, inPage = false, timeout = 30000) {
    if (!this.ws) return Promise.reject(new Error('브라우저가 닫혔어요'));
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, ...(inPage ? { sessionId: this.sid } : {}) }));
    return new Promise((ok, no) => { this.wait.set(id, { ok, no }); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); no(new Error(method + ' 시간 초과')); } }, timeout); });
  }
  async load(url, dev) {
    const mo = dev === 'mo';
    await this.send('Emulation.setDeviceMetricsOverride', { width: mo ? 390 : 1280, height: 2400, deviceScaleFactor: mo ? 2 : 1, mobile: mo }, true);
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mo }, true);
    await this.send('Emulation.setUserAgentOverride', { userAgent: mo ? UA_MO : UA_PC, acceptLanguage: 'ko-KR,ko' }, true);
    // 매번 쿠키·저장소를 지워서 처음 온 사람처럼 (지난 검색이 다음 결과에 영향 주지 않게)
    await this.send('Network.clearBrowserCookies', {}, true).catch(() => {});
    await this.send('Storage.clearDataForOrigin', { origin: '*', storageTypes: 'cookies,local_storage,session_storage' }, true).catch(() => {});
    this.events = [];
    await this.send('Page.navigate', { url }, true);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !this.events.some((e) => e.method === 'Page.loadEventFired')) await sleep(100);
    await sleep(700); // 늦게 붙는 이미지·글꼴
  }
  async eval(fn, arg) {
    const r = await this.send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg ?? null)})`, returnByValue: true, awaitPromise: true }, true);
    if (r.exceptionDetails) throw new Error('페이지 스크립트 오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 200));
    return r.result.value;
  }
  async shot(clip, scale, quality = 78) {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality, clip: { ...clip, scale }, captureBeyondViewport: true, fromSurface: true }, true, 60000);
    return Buffer.from(r.data, 'base64');
  }
  close() { try { this.ws?.close(); } catch {} this.ws = null; try { this.proc?.kill(); } catch {} this.proc = null; }
}

// 페이지 안에서: 파워링크 광고 목록과 위치 (main = 통합검색의 파워링크 영역만, more = 광고 더보기)
function pageAds(where) {
  const blockSel = '[id^="pcPowerLink"],[id^="mobilePowerLink"]';
  let block = where === 'main' ? document.querySelector(blockSel) : null;
  if (where === 'main' && !block) { const b = document.getElementById('power_link_body'); block = b ? (b.closest('section') || b) : null; }
  const scope = where === 'main' ? block : document;
  if (!scope) return { ads: [], block: null };
  const seen = new Map();
  for (const el of scope.querySelectorAll('[data-nlog-params*="cr_rank_legacy"]')) {
    let j; try { j = JSON.parse(el.getAttribute('data-nlog-params')); } catch { continue; }
    const id = String(j.ad_id || j.gdid || '');
    if (id && !id.startsWith('nad-a001-01')) continue;
    const rank = Number(j.cr_rank_legacy);
    if (!rank || seen.has(rank)) continue;
    const li = el.closest('li') || el;
    seen.set(rank, { rank, display: String(j.display_url || '').replace(/^https?:\/\//, ''), li });
  }
  const ads = [...seen.values()].sort((a, b) => a.rank - b.rank);
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  window.__plAds = ads;
  return { ads: ads.map((a) => ({ rank: a.rank, display: a.display, r: R(a.li) })), block: block ? R(block) : null, vw: innerWidth };
}
// 내 광고 표시 (빨간 테두리 + '내 광고' 표)
function markAd(rank) {
  const a = (window.__plAds || []).find((x) => x.rank === rank);
  if (!a) return false;
  const li = a.li;
  li.style.outline = '3px solid #ef4444'; li.style.outlineOffset = '-3px'; li.style.position = li.style.position || 'relative';
  const tag = document.createElement('div');
  tag.textContent = '내 광고';
  tag.style.cssText = 'position:absolute;right:6px;top:6px;z-index:99;background:#ef4444;color:#fff;font:700 12px/1 sans-serif;padding:4px 7px;border-radius:4px';
  li.appendChild(tag);
  return true;
}

// ---------------------------------------------------------------- 엑셀 (그림 포함) 만들기
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const deflate = !/\.(jpe?g|png)$/i.test(f.name), data = deflate ? zlib.deflateRawSync(raw) : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cs = central.reduce((a, b) => a + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cs, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, ...central, end]);
}
const escX = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// sheets: [{ name, rows: [[...]], widths: [..], heights: {rowIndex: pt}, images: [{ row, col, data(jpeg), w, h }] }] (w·h = 엑셀에 보일 크기 px)
export function buildXlsx(sheets) {
  const M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [];
  let imgNo = 0;
  const media = [];
  const drawOv = [];
  sheets.forEach((s, si) => {
    const n = si + 1;
    const cols = (s.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rows = s.rows.map((r, ri) => {
      const ht = s.heights?.[ri];
      return `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1), st = ri === (s.headerRow ?? (s.raw ? -1 : 0)) ? ' s="1"' : ' s="2"';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
        if (v == null || v === '') return ri === 0 ? '' : `<c r="${ref}"${st}/>`;
        return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${escX(v)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    const imgs = s.images || [];
    files.push({ name: `xl/worksheets/sheet${n}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${M}" xmlns:r="${R}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${!s.raw && s.rows.length > 1 ? `<autoFilter ref="A1:${colName(Math.max(0, s.rows[0].length - 1))}${s.rows.length}"/>` : ''}${imgs.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>` });
    if (!imgs.length) return;
    files.push({ name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>` });
    const E = 9525;
    const anchors = imgs.map((im, k) => {
      imgNo++; media.push({ name: `xl/media/image${imgNo}.jpeg`, data: im.data });
      return `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>${4 * E}</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>${4 * E}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(im.w * E)}" cy="${Math.round(im.h * E)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="캡처 ${k + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(im.w * E)}" cy="${Math.round(im.h * E)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    }).join('');
    const first = imgNo - imgs.length + 1;
    files.push({ name: `xl/drawings/drawing${n}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}">${anchors}</xdr:wsDr>` });
    files.push({ name: `xl/drawings/_rels/drawing${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imgs.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${R}/image" Target="../media/image${first + k}.jpeg"/>`).join('')}</Relationships>` });
    drawOv.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
  });
  files.unshift(
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${drawOv.join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${M}" xmlns:r="${R}"><sheets>${sheets.map((s, i) => `<sheet name="${escX(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.map((s, i) => (s.rows.length > 1 ? `` : '')).join('')}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${M}"><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>` },
  );
  return zip([...files, ...media]);
}

// 원본 표시 전용: 머리글 기준으로 연결하고 값이나 원본 파일은 수정하지 않는다.
export function buildReportColumns(rawFiles, selectedRows) {
  const columns = new Map(), observed = new Map();
  const selected = new Set((selectedRows || []).filter(r => r && r.on !== false).map(r => keyOf(r.kw)).filter(Boolean));
  const headerKey = v => v.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]+/g, '').toUpperCase();
  const total = /^(합계|총계|소계|전체|총합계|전체합계|TOTALS?|키워드[\d,]+개결과)$/i;
  for (const file of rawFiles || []) for (const sheet of file?.sheets || []) {
    const rows = sheet.rows || [], found = plColumns.find(rows);
    if (!found) continue;
    const { at, col: { kw } } = found, header = rows[at];
    if (header.filter(cell => plColumns.columns([cell]).kw >= 0).length !== 1) continue;
    const repeated = new Set(), seen = new Set(), fields = [];
    for (let i = 0; i < header.length; i++) {
      if (i === kw) continue;
      const label = String(header[i] ?? '').trim(), key = headerKey(label);
      if (!key || total.test(key)) continue;
      const id = 'raw:' + key;
      fields.push([id, i]);
      if (seen.has(id)) repeated.add(id); else seen.add(id);
      if (!columns.has(id)) columns.set(id, { id, label });
    }
    for (let ri = at + 1; ri < rows.length; ri++) {
      const row = rows[ri]; if (!Array.isArray(row)) continue;
      const key = keyOf(row[kw]);
      if (!selected.has(key) || total.test(key)) continue;
      for (const [id, ci] of fields) {
        const v = row[ci];
        if (v == null || (typeof v === 'string' && !v.trim())) continue;
        let cells = observed.get(key);
        if (!cells) observed.set(key, cells = new Map());
        cells.set(id, repeated.has(id) || cells.has(id) ? null : v);
      }
    }
  }
  const ordered = [...columns.values()]; // 붙여넣은 엑셀의 열 순서 그대로
  const indices = new Map(ordered.map((col, i) => [col.id, i]));
  return { columns: ordered, rows: [...observed].map(([key, values]) => [key, Object.fromEntries([...values].map(([id, v]) => [indices.get(id), v]))]) };
}

// ---------------------------------------------------------------- 작업 관리
export function createPowerlink({ dataDir, adRequest, hasAd, getRules }) {
  const ROOT = path.join(dataDir, 'powerlink');
  fs.mkdirSync(ROOT, { recursive: true });
  const R = () => ({ runs: 4, gapMs: 1200, ...(getRules?.() || {}) });
  const jobDir = (id) => path.join(ROOT, id);
  const okId = (id) => /^pl\d{8,}[a-z0-9]*$/.test(String(id || ''));
  const rawPath = j => path.join(jobDir(j.id), 'reports.json');
  function loadReports(j) {
    if (!j.report?.files?.length) return [];
    return JSON.parse(fs.readFileSync(rawPath(j), 'utf8'));
  }
  function saveReports(j, sources, period) {
    if (!Array.isArray(sources) || !sources.length) return;
    if (sources.length > 30 || sources.some(s => !s || !Array.isArray(s.sheets) || !s.sheets.length || s.sheets.some(h => !h || !Array.isArray(h.rows) || h.rows.some(r => !Array.isArray(r) || r.some(v => v != null && !['string','number','boolean'].includes(typeof v)))))) throw new Error('실적 파일의 시트 형식이 올바르지 않아요.');
    if (sources.reduce((n, s) => n + s.sheets.length, 0) > 200) throw new Error('한 분석에 원본 시트를 200개까지 넣을 수 있어요.');
    const raw = sources.map(s => ({ name: String(s.name || '붙여넣은 표').slice(0, 180), sheets: s.sheets,
      ...(typeof s.original === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s.original) ? { original: s.original } : {}) }));
    const p = period?.start || period?.end ? periodOf(period.start, period.end) : null;
    const parsed = reports(raw);
    fs.mkdirSync(jobDir(j.id), { recursive: true });
    fs.writeFileSync(rawPath(j) + '.tmp', JSON.stringify(raw)); fs.renameSync(rawPath(j) + '.tmp', rawPath(j));
    j.report = { period: p, files: raw.map(s => ({ name: s.name, original: !!s.original })), tables: parsed.tables, keywords: parsed.rows.size };
  }
  const jobs = new Map(); // 메모리 캐시
  function load(id) {
    if (!okId(id)) return null;
    if (jobs.has(id)) return jobs.get(id);
    try { const j = JSON.parse(fs.readFileSync(path.join(jobDir(id), 'job.json'), 'utf8')); jobs.set(id, j); if (j.status === 'running' && RUN?.id !== id) { j.status = 'stopped'; save(j, true); } return j; } catch { return null; }
  }
  // 저장 공간: 폴더 크기 (바이트)
  function dirSize(dir) {
    let n = 0;
    try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); try { n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } catch {} } } catch {}
    return n;
  }
  const BROWSER_DIR = () => path.join(ROOT, '.browser');
  // 캡처용 브라우저의 캐시 · 내려받은 부품만 지움 (설정은 매번 새로 만들어져서 통째로 지워도 됨)
  function cleanBrowser(all = false) {
    const b = BROWSER_DIR();
    const parts = all ? [''] : ['Default/Cache', 'Default/Code Cache', 'Default/GPUCache', 'Default/Service Worker', 'component_crx_cache', 'ProvenanceData', 'GrShaderCache', 'ShaderCache', 'GraphiteDawnCache', 'Default/DawnGraphiteCache', 'Default/DawnWebGPUCache'];
    for (const p of parts) { try { fs.rmSync(path.join(b, p), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {} }
  }
  let saveT = new Map();
  const flushAll = () => { for (const id of [...saveT.keys()]) { const j = jobs.get(id); if (j) save(j, true); } };
  process.once('exit', flushAll);
  function save(j, now = false) {
    j.updatedAt = Date.now();
    const w = () => {
      saveT.delete(j.id);
      try {
        fs.mkdirSync(jobDir(j.id), { recursive: true });
        const f = path.join(jobDir(j.id), 'job.json');
        fs.writeFileSync(f + '.tmp', JSON.stringify(j)); fs.renameSync(f + '.tmp', f);
        j.saveErr = '';
      } catch (e) { j.saveErr = '결과 저장 실패: ' + e.message; console.error('[파워링크] ' + j.saveErr); }
    };
    clearTimeout(saveT.get(j.id));
    if (now) w(); else saveT.set(j.id, setTimeout(w, 1500));
  }
  const meta = (j) => ({ id: j.id, name: j.name, custom: !!j.custom, pinned: !!j.pinned, parentId: j.parentId || null, thread: j.thread || 0, createdAt: j.createdAt, updatedAt: j.updatedAt, status: j.status, purged: !!j.purged, total: j.rows.filter((r) => r.on !== false).length, done: j.rows.filter((r) => r.on !== false && r.done).length, devices: j.devices, period: j.report?.period || null });
  function list() {
    const out = [];
    for (const d of fs.readdirSync(ROOT)) { if (!okId(d)) continue; const j = load(d); if (j) out.push(meta(j)); }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  // 네이버 검색 요청 사이 간격 + 제한 걸리면 쉬기
  let last = 0, pauseUntil = 0, blockN = 0;
  let RUN = null; // { id, stop, browser, note, cur }
  // stop: 멈춰야 하면 true (분석 = [중지], 순위 추적 = 추적 멈춤). 분석과 순위 추적이 이 간격을 함께 씀
  async function gate(stop = () => RUN?.stop) {
    const gap = Math.max(500, Number(R().gapMs) || 1200);
    for (;;) {
      if (stop()) throw new Error('STOP');
      const wait = Math.max(last + gap + Math.random() * 300, pauseUntil) - Date.now();
      if (wait <= 0) break;
      await sleep(Math.min(wait, 500));
    }
    last = Date.now();
  }
  function blocked() {
    blockN++;
    const sec = Math.min(600, 60 * 2 ** (blockN - 1));
    pauseUntil = Date.now() + sec * 1000;
    if (RUN) RUN.note = `네이버 검색 제한 → ${sec}초 쉬었다 이어가요`;
  }
  async function getHtml(url, ua, stop) {
    for (let a = 0; a < 6; a++) {
      await gate(stop);
      let r, h;
      try { r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html,application/xhtml+xml', Referer: 'https://www.naver.com/' } }); h = await r.text(); }
      catch (e) { if (a === 5) throw e; await sleep(2000); continue; }
      if (isBlocked(r.status, h)) { blocked(); continue; }
      if (blockN && RUN) RUN.note = '';
      blockN = 0;
      return h;
    }
    throw new Error('네이버 검색 제한이 계속돼요');
  }

  // 순위별 평균 입찰가 (PC 1~10위, 모바일 1~5위), 키워드 여러 개를 한 번에
  async function posBids(j) {
    if (!hasAd()) { j.bidErr = '검색광고 API 키가 없어 순위별 입찰가를 못 가져와요 (설정 › 네이버 API)'; return; }
    j.bids = j.bids || {};
    const all = [...new Set(j.rows.filter((r) => r.on !== false).map((r) => r.key))];
    const has = (k, dev) => Array.isArray(j.bids[k]?.[dev]) && j.bids[k][dev].some((x) => x != null);
    for (const dev of j.devices) {
      const keys = all.filter((k) => !has(k, dev)); // 아직 없거나 지난번에 실패한 키워드만
      const N = DEV[dev].maxN, per = Math.max(1, Math.floor(100 / N));
      for (let i = 0; i < keys.length; i += per) {
        if (RUN?.stop) return;
        const chunk = keys.slice(i, i + per);
        const items = chunk.flatMap((key) => Array.from({ length: N }, (_, p) => ({ key, position: p + 1 })));
        try {
          const r = await adRequest('POST', '/estimate/average-position-bid/keyword', { body: { device: DEV[dev].api, items } });
          (r.estimate || []).forEach((e, idx) => {
            const k = e.keyword && chunk.includes(e.keyword) ? e.keyword : items[idx]?.key;
            const b = (j.bids[k] = j.bids[k] || {});
            (b[dev] = b[dev] || [])[(e.position ?? items[idx]?.position) - 1] = e.bid; delete b[dev + 'Err'];
          });
        } catch (e) {
          // 묶음이 통째로 실패하면 하나씩 (네이버가 모르는 키워드가 섞인 경우)
          for (const key of chunk) {
            try {
              const r = await adRequest('POST', '/estimate/average-position-bid/keyword', { body: { device: DEV[dev].api, items: Array.from({ length: N }, (_, p) => ({ key, position: p + 1 })) } });
              const b = (j.bids[key] = j.bids[key] || {}); b[dev] = (r.estimate || []).map((x) => x.bid); delete b[dev + 'Err'];
            } catch (e2) { const b = (j.bids[key] = j.bids[key] || {}); b[dev + 'Err'] = String(e2.message).slice(0, 120); }
          }
        }
        await sleep(120);
      }
    }
    save(j);
  }
  // n위 입찰가로 냈을 때 예상 실적 (월 노출·클릭·비용)
  async function perf(j, dev, n) {
    if (!hasAd()) return { error: '검색광고 API 키가 없어요' };
    j.perf = j.perf || {};
    const tag = `${dev}:${n}`, P = (j.perf[tag] = j.perf[tag] || {});
    const todo = j.rows.filter((r) => r.on !== false && (!P[r.key] || P[r.key].err || P[r.key].bid !== j.bids?.[r.key]?.[dev]?.[n - 1]) && j.bids?.[r.key]?.[dev]?.[n - 1]); // 실패했거나 입찰가가 새로 생긴 것도 다시
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const r = todo[i++];
        const bid = j.bids[r.key][dev][n - 1];
        try {
          const x = await adRequest('POST', '/estimate/performance/keyword', { body: { device: DEV[dev].api, keywordplus: false, key: r.key, bids: [bid] } });
          const e = (x.estimate || [])[0] || {};
          P[r.key] = { bid, imp: e.impressions ?? null, clk: e.clicks ?? null, cost: e.cost ?? null };
        } catch (e) { P[r.key] = { bid, err: String(e.message).slice(0, 100) }; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    save(j);
    return { ok: true, perf: P };
  }

  // 키워드 하나 × 기기 하나: 여러 번 검색 → 평균 순위, 그다음 캡처
  async function measure(j, row, dev) {
    const q = encodeURIComponent(row.kw), D = DEV[dev], runs = Math.min(5, Math.max(1, j.runs || 4));
    const res = (row.res = row.res || {})[dev] = { ranks: [], tops: [] };
    for (let k = 0; k < runs; k++) {
      const ads = parseAds(await getHtml(D.more(q), D.ua));
      const me = findMine(ads, j.urls);
      res.ranks.push(me ? me.rank : null);
      res.total = Math.max(res.total || 0, ads.length);
      if (me && (!res.match || me.score > res.match.score)) res.match = { score: me.score, display: me.display };
      if (k === 0) res.tops = ads.slice(0, 3).map((a) => a.display);
    }
    const seen = res.ranks.filter((x) => x != null);
    res.seen = seen.length; res.n = runs;
    if (seen.length) { res.avg = Math.round((seen.reduce((a, b) => a + b, 0) / seen.length) * 10) / 10; res.min = Math.min(...seen); res.max = Math.max(...seen); }
    // 캡처: 통합검색 화면에서 내 광고가 보이면 그 영역, 아니면 광고 더보기
    if (R().capture === true) { try { res.cap = await capture(j, row, dev); } catch (e) { if (e.message === 'STOP') throw e; res.capErr = String(e.message).slice(0, 140); } }
  }
  async function browser() {
    if (RUN.browser?.ws) return RUN.browser;
    RUN.browser = new Headless(path.join(ROOT, '.browser'));
    await RUN.browser.start();
    return RUN.browser;
  }
  async function capture(j, row, dev) {
    const b = await browser(), q = encodeURIComponent(row.kw), D = DEV[dev], mo = dev === 'mo', dsf = mo ? 2 : 1, pad = 8;
    const go = async (url) => { for (let a = 0; a < 4; a++) { await gate(); await b.load(url, dev); const t = await b.eval('() => document.title + " " + (document.body?.innerText || "").slice(0, 3000)'); if (!isBlocked(200, t)) return; blocked(); } };
    // 찍을 영역 정하기 → 원본 · 내 광고 주변(표·엑셀용) 두 장
    const shoot = async (info, me, where) => {
      let clip;
      const mine = me ? info.ads.find((x) => x.rank === me.rank)?.r : null;
      if (where === 'main' && info.block) clip = { x: Math.max(0, info.block.x - pad), y: Math.max(0, info.block.y - pad), width: info.block.w + pad * 2, height: info.block.h + pad * 2 };
      else if (info.ads.length) {
        const first = info.ads[0].r, last = mine || info.ads[Math.min(info.ads.length, 5) - 1].r;
        let top = first.y - 60;
        if (last.y + last.h - top > 2200) top = last.y - 900; // 너무 길면 내 광고 위쪽 일부만
        const left = Math.max(0, Math.min(first.x, last.x) - pad);
        clip = { x: left, y: Math.max(0, top), width: Math.min(info.vw - left, Math.max(first.w, last.w) + pad * 2), height: last.y + last.h + 16 - Math.max(0, top) };
      } else clip = { x: 0, y: 0, width: info.vw, height: 900 };
      clip.height = Math.min(clip.height, 3000);
      const full = await b.shot(clip, mo ? 0.75 : 1, 80); // 원본 (모바일은 1.5배)
      // 내 광고 주변: 위아래 여유를 두고 잘라서 폭 약 420px
      const fy = mine ? Math.max(clip.y, mine.y - 110) : clip.y;
      const fb = mine ? Math.min(clip.y + clip.height, mine.y + mine.h + 110) : Math.min(clip.y + clip.height, clip.y + 520);
      const fclip = { x: clip.x, y: fy, width: clip.width, height: Math.max(40, fb - fy) };
      const fs2 = Math.min(1, 420 / (clip.width * dsf));
      const focus = await b.shot(fclip, fs2, 80);
      return { full, focus, fw: Math.round(fclip.width * dsf * fs2), fh: Math.round(fclip.height * dsf * fs2) };
    };
    await go(D.main(q));
    const main = await b.eval(pageAds, 'main');
    row.res[dev].mainCount = main.ads.length;
    let me = findMine(main.ads, j.urls), where = 'main', shot;
    if (me) { await b.eval(markAd, me.rank); await sleep(200); shot = await shoot(main, me, 'main'); }
    else {
      // 통합검색 영역에 없음 → 통합검색 화면은 미리 찍어 두고, 광고 더보기에서 다시 찾기
      const mainShot = main.block ? await shoot(main, null, 'main') : null;
      await go(D.more(q));
      const more = await b.eval(pageAds, 'more');
      const me2 = findMine(more.ads, j.urls);
      if (me2) { await b.eval(markAd, me2.rank); await sleep(200); shot = await shoot(more, me2, 'more'); me = me2; where = 'more'; }
      else if (mainShot) shot = mainShot;
      else { shot = await shoot(more, null, 'more'); where = more.ads.length ? 'more' : 'none'; }
    }
    const base = `${String(row.i).padStart(4, '0')}_${dev}`;
    fs.writeFileSync(path.join(jobDir(j.id), base + '.jpg'), shot.full);
    fs.writeFileSync(path.join(jobDir(j.id), base + '_f.jpg'), shot.focus);
    return { file: base + '.jpg', focus: base + '_f.jpg', where, rank: me ? me.rank : null, fw: shot.fw, fh: shot.fh, at: Date.now() };
  }

  async function runJob(j) {
    if (RUN) throw new Error('다른 파워링크 분석이 진행 중이에요. 끝나거나 중지한 뒤에 시작하세요');
    RUN = { id: j.id, stop: false, browser: null, note: '', cur: '' };
    j.status = 'running'; j.error = ''; save(j, true);
    (async () => {
      try {
        RUN.note = '순위별 입찰가 가져오는 중';
        await posBids(j).catch((e) => { j.bidErr = e.message; });
        for (const dev of j.devices) if (j.bids) await perf(j, dev, dev === 'pc' ? j.nPc : j.nMo).catch(() => {});
        RUN.note = '';
        for (const row of j.rows) {
          if (row.on === false || row.done) continue;
          RUN.cur = row.kw;
          for (const dev of j.devices) {
            const x0 = row.res?.[dev];
            if (x0?.seen != null && (R().capture !== true || x0.cap || x0.capErr)) continue; // 이미 순위를 잰 기기는 건너뜀
            await measure(j, row, dev);
          }
          row.done = true; save(j, true); // 키워드 하나 끝날 때마다 바로 저장
        }
        j.status = 'done';
      } catch (e) {
        j.status = e.message === 'STOP' ? 'stopped' : 'error';
        if (e.message !== 'STOP') j.error = String(e.message).slice(0, 300);
      } finally {
        RUN.browser?.close();
        RUN = null;
        save(j, true);
        setTimeout(() => { if (!RUN) cleanBrowser(); }, 3000); // 캐시가 쌓이지 않게
      }
    })();
  }

  function create(b) {
    const urls = (Array.isArray(b.urls) ? b.urls : String(b.urls || '').split(/[\s,]+/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
    if (!urls.length) throw new Error('내 파워링크 URL을 넣어주세요');
    const devices = ['pc', 'mo'].filter((d) => (b.devices || ['pc', 'mo']).includes(d));
    if (!devices.length) throw new Error('PC나 모바일 중 하나는 골라주세요');
    const seen = new Set(), rows = [];
    for (const r of b.rows || []) {
      const kw = String(r.kw || '').trim().slice(0, 60), key = kw.replace(/\s+/g, '');
      if (!key || seen.has(key.toUpperCase())) continue;
      seen.add(key.toUpperCase());
      const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return String(v ?? '').trim() !== '' && isFinite(n) ? n : null; };
      rows.push({ i: rows.length + 1, kw, key, bid: num(r.bid), state: String(r.state || '').slice(0, 30), acctPc: num(r.acctPc), acctMo: num(r.acctMo), on: r.on !== false, done: false });
      if (rows.length >= 2000) break;
    }
    if (!rows.some((r) => r.on)) throw new Error('검사할 키워드를 골라주세요');
    if (RUN) throw new Error('다른 파워링크 분석이 진행 중이에요. 끝나거나 중지한 뒤에 시작하세요');
    const now = Date.now();
    const j = { id: 'pl' + now + Math.random().toString(36).slice(2, 6), name: String(b.name || '').trim().slice(0, 60) || `${rows.find((r) => r.on).kw} 외 ${rows.filter((r) => r.on).length - 1}개`,
      parentId: b.parentId || null, thread: b.thread || 0, custom: !!b.custom,
      createdAt: now, updatedAt: now, urls, devices, runs: Math.min(5, Math.max(1, Number(R().runs) || 4)), nPc: Math.min(10, Math.max(1, Number(b.nPc) || 3)), nMo: Math.min(5, Math.max(1, Number(b.nMo) || 3)), rows, status: 'ready' };
    saveReports(j, b.reports, b.period);
    jobs.set(j.id, j); save(j, true);
    if (j.saveErr) { jobs.delete(j.id); throw new Error('분석 내역을 저장하지 못했어요: ' + j.saveErr); }
    return j;
  }

  function threadOf(j) {
    const root = j.parentId || j.id;
    return list().filter((m) => m.id === root || m.parentId === root).sort((a, b) => a.createdAt - b.createdAt);
  }
  function prevRanks(j) {
    const th = threadOf(j), i = th.findIndex((m) => m.id === j.id);
    if (i <= 0) return null;
    const p = load(th[i - 1].id);
    if (!p) return null;
    const out = {};
    for (const r of p.rows) {
      if (r.on === false || !r.res) continue;
      out[r.key] = { bid: r.bid };
      for (const d of ['pc', 'mo']) { const x = r.res[d]; if (x && x.n) out[r.key][d] = x.seen ? x.avg : 0; }
    }
    return { id: p.id, name: p.name, at: p.createdAt, ranks: out };
  }

  // 원본 행과 열은 재정렬하지 않는다. 분석에서 중복 제거하더라도 원본의 해당 행 모두에 같은 검색 결과를 붙인다.
  function withReportResults(rows, j, ranks) {
    const header = plColumns.find(rows);
    if (!header) return null;
    const { at: a, col: { kw: col } } = header;
    const width = rows.reduce((n, row) => Math.max(n, row.length), 0);
    const labels = j.devices.flatMap((d, i) => {
      const dev = d === 'pc' ? 'PC' : '모바일', n = ranks[i];
      return [`파워링크 ${dev} 실측 평균순위`, `${dev} 노출 확인 횟수`, `${dev} 최고~최저 순위`, `${dev} ${n}위 평균 입찰가`, `${dev} ${n}위 예상 노출수(월)`, `${dev} ${n}위 예상 클릭수(월)`, `${dev} ${n}위 예상 비용(월)`];
    });
    const key = v => String(v ?? '').trim().replace(/\s+/g, '').toUpperCase();
    const measured = new Map(j.rows.map(r => [key(r.kw), r]));
    const widths = Array.from({ length: width }, (_, i) => Math.min(28, Math.max(i === col ? 22 : 12, String(rows[a][i] ?? '').length * 2 + 2)));
    return { raw: true, headerRow: a, widths: [...widths, ...labels.map(() => 19)], rows: rows.map((row, i) => {
      if (i < a) return row;
      const k = key(row[col]);
      if (i !== a && (!k || /^(합계|총계|소계|전체|총합계|전체합계|TOTALS?|키워드[\d,]+개결과)$/i.test(k))) return row;
      const r = measured.get(k);
      const cells = i === a ? [...labels, '파워링크 분석 상태'] : [
        ...j.devices.flatMap((d, i) => {
          if (!r || r.on === false) return Array(7).fill(null);
          const n = ranks[i], x = r.res?.[d], p = j.perf?.[`${d}:${n}`]?.[r.key];
          return [x?.n > 0 ? (x.seen > 0 ? x.avg : '미노출') : null, x?.n > 0 ? `${x.seen}/${x.n}회` : null,
            x?.seen > 0 ? (x.min === x.max ? x.min : `${x.min}~${x.max}`) : null,
            j.bids?.[r.key]?.[d]?.[n - 1], p?.imp, p?.clk, p?.cost];
        }), !r || r.on === false ? '분석 대상 아님' : r.done ? '측정 완료' : '측정 미완료'];
      return [...row, ...Array(width - row.length).fill(null), ...cells];
    }) };
  }
  function excel(j, nPc, nMo) {
    const won = (v) => (v == null ? '' : v);
    const sheets = j.devices.map((dev) => {
      const n = dev === 'pc' ? nPc : nMo, P = j.perf?.[`${dev}:${n}`] || {};
      const head = ['키워드', '순위 (평균)', '노출', '최고~최저', '현재 입찰가', `${n}위 입찰가 (4주 평균)`, `${n}위 예상 노출수 (월)`, `${n}위 예상 클릭수 (월)`, `${n}위 예상 비용 (월)`, '통합검색 광고 수', '계정 평균노출순위'];
      const rows = [head], heights = { 0: 30 };
      for (const r of j.rows.filter((x) => x.on !== false)) {
        const x = r.res?.[dev] || {}, p = P[r.key] || {};
        const rank = x.seen ? x.avg : x.seen === 0 ? '미노출' : '';
        rows.push([r.kw, rank, x.n ? `${x.seen}/${x.n}회` : '', x.seen ? (x.min === x.max ? `${x.min}위` : `${x.min}~${x.max}위`) : '', won(r.bid), won(j.bids?.[r.key]?.[dev]?.[n - 1]), won(p.imp), won(p.clk), won(p.cost),
          x.mainCount ?? '', won(dev === 'pc' ? r.acctPc : r.acctMo)]);
      }
      return { name: dev === 'pc' ? 'PC' : '모바일', rows, heights, widths: [22, 10, 8, 10, 11, 13, 13, 13, 13, 10, 11] };
    });
    const raw = loadReports(j), parsed = reports(raw).rows;
    const pastedSheets = [];
    if (raw.length) {
      sheets.push({ name: '실적 키워드', rows: [['키워드', '실제 노출수', '실제 클릭수', '비고'], ...[...parsed.values()].map(r => [r.kw, r.duplicate ? '' : r.imp, r.duplicate ? '' : r.clk, r.duplicate ? '중복: 원본 확인' : ''])] });
      const index = [['원본 탭', '파일', '원래 시트 이름', '행 수', '보고서 시작일', '보고서 종료일']];
      for (const f of raw) for (const s of f.sheets) {
        const n = index.length, name = '원본 ' + n;
        index.push([name, f.name, s.name, s.rows.length, j.report.period?.start, j.report.period?.end]);
        const joined = withReportResults(s.rows, j, j.devices.map(d => d === 'pc' ? nPc : nMo));
        sheets.push(joined ? { name, ...joined } : { name, rows: s.rows, raw: true });
        if (joined && f.name === '붙여넣은 표') pastedSheets.push(sheets.pop());
      }
      sheets.splice(j.devices.length, 0, { name: '원본 목록', rows: index, widths: [12, 32, 24, 12, 15, 15] });
    }
    return buildXlsx([...pastedSheets, ...sheets]);
  }

  // ---------------------------------------------------------------- HTTP
  async function handle(req, res, u, readBody, send) {
    const p = u.pathname;
    try {
      if (p === '/api/pl/jobs') return send(res, 200, { jobs: list(), running: RUN ? { id: RUN.id, note: RUN.note, cur: RUN.cur } : null });
      if (p === '/api/pl/job') {
        const j = load(u.searchParams.get('id'));
        if (!j) return send(res, 404, { error: '없는 작업이에요' });
        return send(res, 200, { job: j, running: RUN?.id === j.id ? { note: RUN.note, cur: RUN.cur } : null, thread: threadOf(j), prev: prevRanks(j) });
      }
      if (p === '/api/pl/report-columns') {
        if (req.method !== 'GET') return send(res, 405, { error: '조회만 할 수 있어요' });
        const j = load(u.searchParams.get('id'));
        if (!j) return send(res, 404, { error: '없는 작업이에요' });
        return send(res, 200, buildReportColumns(loadReports(j), j.rows));
      }
      if (p === '/api/pl/report-file') {
        const j = load(u.searchParams.get('id'));
        const f = j && loadReports(j)[Number(u.searchParams.get('i'))];
        if (!f?.original) return send(res, 404, { error: '저장된 원본 파일이 없어요' });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g, '%27')}`, 'Cache-Control': 'no-store' });
        return res.end(Buffer.from(f.original, 'base64'));
      }
      if (p === '/api/pl/img') {
        const j = load(u.searchParams.get('id')), f = String(u.searchParams.get('f') || '');
        if (!j || !/^\d{4}_(pc|mo)(_t|_f)?\.jpg$/.test(f)) { res.writeHead(404); return res.end(); }
        const fp = path.join(jobDir(j.id), f);
        if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' });
        return res.end(fs.readFileSync(fp));
      }
      if (p === '/api/pl/xlsx') {
        const j = load(u.searchParams.get('id'));
        if (!j) return send(res, 404, { error: '없는 작업이에요' });
        const nPc = Math.min(10, Math.max(1, Number(u.searchParams.get('nPc')) || j.nPc)), nMo = Math.min(5, Math.max(1, Number(u.searchParams.get('nMo')) || j.nMo));
        for (const dev of j.devices) if (j.bids) await perf(j, dev, dev === 'pc' ? nPc : nMo).catch(() => {});
        const buf = excel(j, nPc, nMo);
        res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('파워링크_' + j.name.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx')}`, 'Cache-Control': 'no-store' });
        return res.end(buf);
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST로 보내주세요' });
      const b = await readBody(req);
      if (p === '/api/pl/compare') {
        const a = load(b.a), z = load(b.b);
        if (!a || !z || a.id === z.id) return send(res, 400, { error: '서로 다른 두 분석을 고르세요.' });
        if (RUN?.id === a.id || RUN?.id === z.id) return send(res, 400, { error: '진행 중인 작업은 중지하거나 끝난 뒤 비교하세요.' });
        const pa = a.report?.period, pb = z.report?.period;
        if (!pa || !pb) return send(res, 400, { error: '두 분석 모두 결과 화면에서 실적 기간을 저장하세요.' });
        return send(res, 200, comparePowerlink(a, z, loadReports(a), loadReports(z), pa, pb));
      }
      if (p === '/api/pl/report') {
        const j = load(b.id);
        if (!j) return send(res, 404, { error: '없는 작업이에요' });
        if (RUN?.id === j.id) return send(res, 400, { error: '작업이 끝나거나 중지한 뒤 저장하세요.' });
        const p = periodOf(b.period?.start, b.period?.end);
        if (b.reports?.length) saveReports(j, b.reports, p);
        else if (j.report) j.report.period = p;
        else j.report = { period: p, files: [], tables: 0, keywords: 0 };
        save(j, true);
        if (j.saveErr) throw new Error(j.saveErr);
        return send(res, 200, { report: j.report });
      }
      if (p === '/api/pl/start') { const j = create(b); await runJob(j); return send(res, 200, { id: j.id }); }
      if (p === '/api/pl/resume') { const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' }); if (j.status === 'done') return send(res, 200, { id: j.id }); await runJob(j); return send(res, 200, { id: j.id }); }
      if (p === '/api/pl/stop') { if (RUN && (!b.id || RUN.id === b.id)) RUN.stop = true; return send(res, 200, { ok: true }); }
      if (p === '/api/pl/perf') { const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' }); const dev = b.dev === 'mo' ? 'mo' : 'pc'; const n = Math.min(DEV[dev].maxN, Math.max(1, Number(b.n) || 1)); if (!j.bids) await posBids(j); return send(res, 200, await perf(j, dev, n)); }
      if (p === '/api/pl/rerun') {
        const src = load(b.id); if (!src) return send(res, 404, { error: '없는 작업이에요' });
        const root = load(src.parentId || src.id) || src;
        const k = threadOf(root).length; // 첫 분석 = 1 → 재분석 1, 2, …
        // 새 파일을 넣었으면 같은 키워드의 입찰가 · 상태 · 평균노출순위를 새 값으로 (키워드 목록과 체크는 그대로)
        const nk = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
        const upd = Array.isArray(b.rows) && b.rows.length ? new Map(b.rows.filter((x) => x && x.kw).map((x) => [nk(x.kw), x])) : null;
        const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return String(v ?? '').trim() !== '' && isFinite(n) ? n : null; };
        let changed = 0, missing = 0;
        const rows = src.rows.map((r) => {
          const base = { kw: r.kw, bid: r.bid, state: r.state, acctPc: r.acctPc, acctMo: r.acctMo, on: r.on };
          if (!upd) return base;
          const x = upd.get(nk(r.kw));
          if (!x) { if (r.on !== false) missing++; return base; }
          const nb = num(x.bid);
          if (r.on !== false && nb != null && nb !== r.bid) changed++;
          return { ...base, bid: nb ?? r.bid, state: x.state != null && String(x.state).trim() ? String(x.state).slice(0, 30) : r.state, acctPc: num(x.acctPc) ?? r.acctPc, acctMo: num(x.acctMo) ?? r.acctMo };
        });
        const known = new Set(src.rows.map((r) => nk(r.kw)));
        const extra = upd ? [...upd.keys()].filter((k2) => !known.has(k2)).length : 0;
        const j = create({ urls: src.urls, devices: src.devices, nPc: b.nPc || src.nPc, nMo: b.nMo || src.nMo, rows, reports: b.reports, period: b.period, name: `${root.name} · 재분석 ${k}`, parentId: root.id, thread: k });
        if (upd) { j.source = { file: String(b.file || '새 파일').slice(0, 80), changed, missing, extra }; save(j, true); }
        await runJob(j);
        return send(res, 200, { id: j.id, changed, missing, extra, updated: !!upd });
      }
      if (p === '/api/pl/pin') { const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' }); j.pinned = !!b.pinned; save(j, true); return send(res, 200, { ok: true }); }
      if (p === '/api/pl/rename') { const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' }); const v = String(b.name || '').trim().slice(0, 60); if (v) { j.name = v; j.custom = true; } save(j, true); return send(res, 200, { ok: true }); }
      if (p === '/api/pl/usage') {
        const per = {};
        let jobsTotal = 0;
        for (const m of list()) { const d = jobDir(m.id); let caps = 0; try { for (const f of fs.readdirSync(d)) if (/\.jpg$/i.test(f)) caps += fs.statSync(path.join(d, f)).size; } catch {} const all = dirSize(d); per[m.id] = { all, caps }; jobsTotal += all; }
        const browser = dirSize(BROWSER_DIR());
        return send(res, 200, { jobs: per, jobsTotal, browser, total: jobsTotal + browser });
      }
      if (p === '/api/pl/purge') { // 캡처 그림만 지우기 (순위 · 입찰가 결과는 그대로)
        const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' });
        if (RUN?.id === j.id) return send(res, 400, { error: '진행 중인 분석이에요. 끝나거나 중지한 뒤에 지울 수 있어요' });
        let freed = 0;
        try { for (const f of fs.readdirSync(jobDir(j.id))) if (/\.jpg$/i.test(f)) { const fp = path.join(jobDir(j.id), f); freed += fs.statSync(fp).size; fs.rmSync(fp, { force: true }); } } catch {}
        j.purged = Date.now(); save(j, true);
        return send(res, 200, { ok: true, freed });
      }
      if (p === '/api/pl/clean-browser') {
        if (RUN) return send(res, 400, { error: '분석이 진행 중이에요. 끝난 뒤에 비울 수 있어요' });
        const before = dirSize(BROWSER_DIR()); cleanBrowser(true);
        return send(res, 200, { ok: true, freed: before - dirSize(BROWSER_DIR()) });
      }
      if (p === '/api/pl/delete') {
        const j = load(b.id); if (!j) return send(res, 404, { error: '없는 작업이에요' });
        const ids = j.parentId ? [j.id] : threadOf(j).map((m) => m.id); // 첫 분석을 지우면 그 재분석도 같이
        if (RUN && ids.includes(RUN.id)) return send(res, 400, { error: '진행 중인 분석이 있어요. 먼저 중지하세요' });
        for (const id of ids) { clearTimeout(saveT.get(id)); saveT.delete(id); jobs.delete(id); fs.rmSync(jobDir(id), { recursive: true, force: true }); }
        return send(res, 200, { ok: true, deleted: ids.length });
      }
      return send(res, 404, { error: '없는 주소예요' });
    } catch (e) { return send(res, e.status || 400, { error: e.message }); }
  }

  // 점검용: 키워드 하나를 한 번만 (순위 목록 + 캡처) — 화면 '시험 검색' 버튼
  async function probe(kw, urls, dev = 'pc') {
    const D = DEV[dev], ads = parseAds(await getHtml(D.more(encodeURIComponent(kw)), D.ua));
    return { ads, mine: findMine(ads, urls) };
  }

  // 순위 추적용: 키워드 하나를 한 번만 검색해 내 광고 순위 (캡처 없음)
  async function rankOnce(kw, urls, dev = 'pc', stop = () => false) {
    const D = DEV[dev] || DEV.pc, ads = parseAds(await getHtml(D.more(encodeURIComponent(kw)), D.ua, stop));
    const me = findMine(ads, urls);
    return { rank: me ? me.rank : null, total: ads.length, display: me?.display || '', score: me?.score || 0 };
  }

  return { handle, probe, rankOnce, limiter: () => ({ pauseUntil, blockN }), isRunning: () => !!RUN, stopAll: () => { if (RUN) RUN.stop = true; } };
}
