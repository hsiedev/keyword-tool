// 네이버 통합검색 결과 HTML에서 섹션 배치 순서, AI 브리핑 출처, 상위 웹문서를 뽑아내는 파서
// 네이버 화면 구조가 바뀌면 여기만 고치면 됩니다.

const SSUID_NAME = {
  ex_csa: 'AI브리핑',
  web: '웹사이트',
  review: '웹사이트',
  kin: '웹사이트',
  blog: '블로그',
  cafe: '카페',
  image: '이미지',
  video: '동영상',
  news: '뉴스',
  shop: '쇼핑',
  shopping: '쇼핑',
  place: '플레이스',
  local: '플레이스',
  book: '도서',
  encyc: '지식백과',
  dic: '어학사전',
  influencer: '인플루언서',
};

export function strip(s = '') {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;|&[a-z]+;/g, ' ')
    .replace(/새 창 열림/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decode(u = '') {
  return u.replace(/&amp;/g, '&');
}

function domainOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function kindOfUrl(u) {
  const d = domainOf(u);
  if (/blog\.naver\.com|^m\.blog\.naver\.com/.test(d)) return '블로그';
  if (/cafe\.naver\.com/.test(d)) return '카페';
  if (/kin\.naver\.com/.test(d)) return '지식iN';
  if (/tistory\.com/.test(d)) return '티스토리';
  if (/youtube\.com|youtu\.be/.test(d)) return '유튜브';
  if (/post\.naver\.com/.test(d)) return '포스트';
  return '웹사이트';
}

const SKIP_LINK = /keep\.naver\.com|help\.naver\.com|search\.naver\.com|ader\.naver\.com|adcr\.naver\.com|naver\.me\/|javascript:/;

function anchors(chunk) {
  return [...chunk.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: decode(m[1]),
    text: strip(m[2]),
  }));
}

function findDate(text) {
  const m = text.match(/(\d+\s?(?:분|시간|일|주|개월|년)\s?전|\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?)/);
  return m ? m[1] : '';
}

function parseWebItem(chunk) {
  const as = anchors(chunk).filter((a) => /^https?:/.test(a.href) && !SKIP_LINK.test(a.href));
  if (!as.length) return null;
  const named = as.filter((a) => a.text);
  const source = named[0]?.text || domainOf(as[0].href);
  const t = named.find(
    (a) =>
      a.text !== source &&
      !a.text.includes('›') &&
      !/^(자세히 보기|Keep에|더보기|이미지|동영상)/.test(a.text) &&
      !/^(\d+\s?(분|시간|일|주|개월|년)\s?전|\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?)$/.test(a.text) &&
      a.text.length >= 4 &&
      !a.text.startsWith(domainOf(a.href)) &&
      !/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\s|$)/i.test(a.text)
  );
  const url = t?.href || as[0].href;
  return {
    kind: kindOfUrl(url),
    source,
    domain: domainOf(url),
    url,
    title: (t?.text || '').slice(0, 120),
    date: findDate(strip(chunk).slice(0, 600)),
  };
}

function countAds(chunk) {
  const urls = new Set();
  for (const m of chunk.matchAll(/<li\b[^>]*class="([^"]*)"/g)) {
    if (/^(lst|bx)\b/.test(m[1])) urls.add(m.index);
  }
  return urls.size;
}

export function parseSections(html, device = 'pc') {
  const marks = [];
  const re = /<(section|div|ul)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    if (/_pl_section|id="power_link_body"/.test(attrs)) {
      marks.push({ i: m.index, type: 'ad' });
    } else {
      const s = attrs.match(/data-meta-ssuid="([^"]*)"/);
      if (s) marks.push({ i: m.index, type: s[1] });
    }
  }
  // 광고 영역 안쪽에 중복 마커가 생기는 것 방지
  const filtered = marks.filter((mk, k) => !(k > 0 && marks[k - 1].type === 'ad' && mk.type === 'ad'));

  const order = [];
  const web = [];
  const ai = [];
  for (let k = 0; k < filtered.length; k++) {
    const mk = filtered[k];
    const end = filtered[k + 1]?.i ?? Math.min(html.length, mk.i + 250000);
    const chunk = html.slice(mk.i, end);
    let name;
    let count = 1;
    if (mk.type === 'ad') {
      name = '파워링크';
      count = countAds(chunk) || 1;
    } else if (mk.type === 'qra') {
      const h = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      name = (h && strip(h[1])) || (device === 'pc' ? '함께 많이 찾는' : '관련 검색어');
    } else if (SSUID_NAME[mk.type] && mk.type !== 'influencer') {
      name = SSUID_NAME[mk.type];
    } else {
      const h = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      name = (h && strip(h[1])) || SSUID_NAME[mk.type] || mk.type;
    }

    if (name === '웹사이트') {
      const item = parseWebItem(chunk);
      if (item) web.push(item);
    }
    if (mk.type === 'ex_csa') {
      const seen = new Set();
      const unq = (s) => { try { return JSON.parse('"' + s + '"'); } catch { return s; } };
      const re2 = /\{"title":"((?:[^"\\]|\\.)*)","url":"([^"]+)"[\s\S]{0,3000}?"sourceName":"((?:[^"\\]|\\.)*)"[\s\S]{0,800}?"dateTime":"([^"]*)"/g;
      for (const x of chunk.matchAll(re2)) {
        const url = unq(x[2]);
        if (seen.has(url)) continue;
        seen.add(url);
        ai.push({
          kind: kindOfUrl(url),
          source: unq(x[3]),
          domain: domainOf(url),
          url,
          title: unq(x[1]).slice(0, 120),
          date: x[4] ? x[4].slice(0, 10) : '',
        });
      }
    }

    const last = order[order.length - 1];
    if (last && last.name === name && name === '웹사이트') last.count += 1;
    else order.push({ name, count, key: mk.type });
  }
  return { order, web, ai };
}
