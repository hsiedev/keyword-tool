// AI 카피 생성기 · 광고 목업 (서버 쪽)
// - 경쟁 파워링크 읽기: 네이버 통합검색 PC 화면 HTML의 #power_link_body
// - 카피 생성 · 다시 쓰기 · 재검증 요청문 만들기 (규격은 public/copy-spec.js와 같은 것을 씀)
// - 카피 탭 · 광고 목업 저장: data\copy-projects\, data\ad-mock\ (탭/캠페인 하나 = 파일 하나 + index.json)
import fs from 'node:fs';
import path from 'node:path';

// 화면용 규격 파일을 그대로 읽어서 씀 (규격을 한 곳에서만 고치도록)
const specSrc = fs.readFileSync(new URL('./public/copy-spec.js', import.meta.url), 'utf8');
const holder = {};
new Function('window', specSrc)(holder);
export const CopySpec = holder.CopySpec;
const { FORMATS, len, textFields, joinText } = CopySpec;

// ---------------------------------------------------------------- 경쟁 파워링크
const decode = (s) => String(s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#x3D;/g, '=').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
// class="이름"인 요소의 안쪽 HTML들 (같은 태그 중첩을 세어서 닫는 태그를 찾음)
function inner(html, cls) {
  const out = [];
  const re = new RegExp(`<(\\w+)\\b[^>]*\\bclass=["'](?:[^"']*\\s)?${cls}(?:\\s[^"']*)?["'][^>]*>`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const open = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
    open.lastIndex = m.index + m[0].length;
    let depth = 1, k;
    while (depth && (k = open.exec(html))) depth += k[0][1] === '/' ? -1 : 1;
    out.push(html.slice(m.index + m[0].length, k ? k.index : html.length));
  }
  return out;
}
export function parsePowerlinks(html) {
  const a = String(html || '').indexOf('id="power_link_body"');
  if (a < 0) return [];
  let end = html.indexOf('<section', a + 20);
  if (end < 0) end = a + 500000;
  const body = html.slice(a, end);
  const lis = body.split(/<li class="lst js-hover-item/).slice(1);
  return lis.map((li, i) => {
    const first = (c) => decode(inner(li, c)[0] || '');
    const promoHtml = inner(li, 'link_ext_desc')[0] || '';
    const promoText = decode(inner(promoHtml, 'title_ext')[0] || '');
    const types = (li.match(/^[^"]*/) || [''])[0];
    return {
      rank: i + 1,
      site: first('site'),
      url: first('lnk_url') || first('url_text'),
      titles: inner(li, 'lnk_tit').map(decode).filter(Boolean),
      desc: inner(li, 'link_desc').map(decode).filter(Boolean).join(' '),
      promo: promoText ? { prefix: decode(inner(promoHtml, 'prefix_ext')[0] || ''), text: promoText } : null,
      sublinks: [...inner(li, 'sublink_text'), ...inner(inner(li, 'lst_link')[0] || '', 'link')].map(decode).filter(Boolean).slice(0, 6),
      imageSublinks: /sublink_img/.test(li),
      image: /type_img/.test(types) && !/sublink_img/.test(li),
    };
  }).filter((x) => x.site || x.titles.length);
}

// ---------------------------------------------------------------- 카피 생성 요청문
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const list = (a, n, m = 200) => (Array.isArray(a) ? a : []).map((x) => clip(x, m)).filter(Boolean).slice(0, n);
const ANGLE_HINT = {
  '가격·혜택': '가격·보험료·할인·사은품 같은 이득을 구체적으로',
  '신뢰·브랜드': '회사 신뢰·실적·전문성 (근거 있는 것만)',
  '기간·긴급': '지금 해야 할 이유·기간 한정 (실제 기간이 있을 때만)',
  '불안 해소': '검색한 사람이 걱정하는 상황을 짚고 해결',
  '질문형': '검색한 사람의 궁금증을 질문으로',
  '숫자·근거': '근거 있는 숫자로 구체적으로',
  '차별점': '경쟁 광고가 말하지 않는 장점',
  '간편·속도': '가입·계산·상담이 쉽고 빠름',
};
function specLines(fmt) {
  const F = FORMATS[fmt];
  return F.fields.map((f) => f.options
    ? `- ${f.key} (${f.label}): ${f.options.join(' / ')} 중 하나`
    : `- ${f.key} (${f.label}): ${f.min || 0}~${f.max}자 (띄어쓰기 포함)${f.title ? ', 최상급 표현 금지' : ''}${f.spaceAtMax ? `, ${f.max}자를 다 쓰면 띄어쓰기 1회 이상` : ''}${f.brand ? ', 업체 이름이나 사이트 이름을 넣는다' : ''}${f.slogan ? ', 이벤트·할인·프로모션·최상급·"공식 스토어" 금지' : ''}`).join('\n');
}
function brandBlock(b = {}) {
  const rows = [
    ['업체(광고주) 이름', b.name], ['사이트 이름', b.site], ['홈페이지', b.url], ['상품·서비스', b.product],
    ['강점', b.usp], ['혜택·근거 (숫자·혜택은 여기 있는 것만 쓴다)', b.facts], ['톤', b.tone],
  ].filter(([, v]) => v && String(v).trim());
  return rows.length ? rows.map(([k, v]) => `- ${k}: ${clip(v, 1500)}`).join('\n') : '- (입력 없음: 숫자·혜택·실적을 지어내지 말고 일반적인 표현만 쓴다)';
}
function compBlock(ads) {
  const a = (Array.isArray(ads) ? ads : []).slice(0, 10);
  if (!a.length) return '';
  return a.map((x, i) => `${i + 1}. ${clip(x.site, 30)} | 제목: ${list(x.titles, 3, 40).join(' · ')} | 설명: ${clip(x.desc, 120)}${x.promo ? ` | 홍보문구: ${x.promo.prefix ? `[${clip(x.promo.prefix, 6)}] ` : ''}${clip(x.promo.text, 30)}` : ''}`).join('\n');
}
function rulesBlock(b) {
  const caution = list(b.caution, 100, 40);
  return [
    '- 글자 수를 반드시 지킨다. 다 쓴 뒤 글자 수를 세어 보고 넘치면 줄인다.',
    '- 어법과 띄어쓰기를 지킨다. 장식용 특수문자(★ ♥ ※ 등), 이모지, 같은 문장부호 반복(!! ??)을 쓰지 않는다. 물결표(~)는 기간 표기에만 쓴다.',
    '- 근거 없는 최상급·단정(최고, 최초, 1위, 가장, 제일, 최저가, 유일, 무조건, 100% 등)을 쓰지 않는다. [브랜드 정보]에 근거가 있으면 설명에만 쓰고 출처를 짐작하게 쓴다. 타이틀에는 쓰지 않는다.',
    '- 다른 광고주(경쟁사) 이름을 쓰거나 비교·비방하지 않는다.',
    '- 숫자·금액·할인율·기간·사은품은 [브랜드 정보]에 있는 것만 쓴다. 없는 혜택이나 실적을 지어내지 않는다.',
    '- 같은 결과 안에서 표현이 겹치지 않게 다양하게 쓴다.',
    caution.length ? `- 다음 단어는 쓰지 않는다 (사용자 주의어): ${caution.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export function copyGenerateRequest(b = {}) {
  const fmt = FORMATS[b.format] ? b.format : 'pl_ad';
  const F = FORMATS[fmt];
  const keys = F.fields.map((f) => f.key);
  const angles = list(b.angles, 8, 20);
  const per = Math.max(1, Math.min(10, Number(b.perAngle) || 3));
  const rewrite = b.rewrite && Array.isArray(b.rewrite.items) && b.rewrite.items.length ? b.rewrite : null;
  const kwInfo = (Array.isArray(b.kwInfo) ? b.kwInfo : []).slice(0, 20).map((k) => `${clip(k.keyword, 40)}${k.total ? ` (월 ${Number(k.total).toLocaleString('ko-KR')}회${k.mo ? `, 모바일 ${Math.round((k.mo / Math.max(1, k.total)) * 100)}%` : ''})` : ''}${k.intent ? ` · ${clip(k.intent, 20)}` : ''}`);
  const keywords = kwInfo.length ? kwInfo : list(b.keywords, 20, 40);
  const comp = compBlock(b.competitors);
  const system = clip(b.system, 2000) || '너는 한국 네이버 검색광고(파워링크·브랜드검색) 카피라이터다. 네이버 광고 심사 기준을 지키면서, 검색한 사람이 클릭하고 싶어지는 짧고 구체적인 문구를 쓴다. 생각 과정도 한국어로 쓰고, 최종 답은 설명 없이 JSON만 출력한다.';
  const parts = [
    `[광고 형식] ${CopySpec.CHANNELS[F.ch]} · ${F.name}${F.note ? ` (${F.note})` : ''}`,
    specLines(fmt),
    '',
    '[지킬 규칙]',
    rulesBlock(b),
    '',
    '[브랜드 정보]',
    brandBlock(b.brand),
    '',
    keywords.length ? `[대상 키워드] ${keywords.join(', ')}\n→ 이 검색어로 들어온 사람의 의도에 맞춘다.${F.ch === 'pl' ? ' 파워링크는 키워드를 자연스럽게 넣으면 굵게 표시돼 눈에 띈다.' : ''}` : '',
    comp ? `\n[지금 네이버에 노출 중인 경쟁 파워링크]\n${comp}\n→ 위 광고와 같은 표현·각도를 되풀이하지 말고, 차별되는 포인트를 찾는다.` : '',
    list(b.refs, 20).length ? `\n[참고 카피 (사용자가 좋아하는 문체, 그대로 베끼지 말 것)]\n${list(b.refs, 20).map((x) => '- ' + x).join('\n')}` : '',
    list(b.keep, 30).length ? `\n[확정·고정한 카피 (방향은 참고하되 겹치지 않게)]\n${list(b.keep, 30).map((x) => '- ' + x).join('\n')}` : '',
    list(b.rejected, 100).length ? `\n[사용자가 뺀 카피 (비슷하게 쓰지 말 것)]\n${list(b.rejected, 100).map((x) => '- ' + x).join('\n')}` : '',
    !rewrite && list(b.existing, 150).length ? `\n[이미 있는 카피 (똑같거나 거의 같은 것은 내지 말 것)]\n${list(b.existing, 150).map((x) => '- ' + x).join('\n')}` : '',
    clip(b.extra, 2000) ? `\n[요청 사항]\n${clip(b.extra, 2000)}` : '',
    '',
  ];
  let total, schemaProps, required;
  if (rewrite) {
    const items = rewrite.items.slice(0, 50);
    total = items.length;
    parts.push(`[다시 쓰기] 아래 카피를 [고칠 방향]에 맞게 다시 쓴다. 항목마다 id를 그대로 두고 1개씩 돌려준다. 고칠 방향에 없는 부분(각도·핵심 메시지)은 되도록 유지한다.`);
    parts.push(`[고칠 방향] ${clip(rewrite.instruction, 500) || '규격과 규칙에 맞게 다듬기'}`);
    parts.push(items.map((x) => `- id=${clip(x.id, 40)} | 각도: ${clip(x.angle, 20)} | ${keys.map((k) => `${k}: ${clip(x.fields?.[k], 200)}`).join(' | ')}${x.problems ? ` | 지금 문제: ${clip(x.problems, 200)}` : ''}`).join('\n'));
    parts.push(`\n출력: {"items": [...]} . 각 항목 {"id": 원래 id, "angle": 각도, ${keys.map((k) => `"${k}": ...`).join(', ')}, "why": 이 카피의 의도 한 줄(25자 이내)}`);
    schemaProps = { id: { type: 'STRING' }, angle: { type: 'STRING' }, why: { type: 'STRING' } };
    required = ['id', ...keys];
  } else {
    const ang = angles.length ? angles : ['가격·혜택', '불안 해소', '질문형'];
    total = ang.length * per;
    parts.push(`[소구 각도] 각도마다 ${per}개씩, 모두 ${total}개를 쓴다.`);
    parts.push(ang.map((a) => `- ${a}${ANGLE_HINT[a] ? `: ${ANGLE_HINT[a]}` : ''}`).join('\n'));
    parts.push(`\n출력: {"items": [...]} . 각 항목 {"angle": 각도 이름 그대로, ${keys.map((k) => `"${k}": ...`).join(', ')}, "why": 이 카피의 의도 한 줄(25자 이내)}`);
    schemaProps = { angle: { type: 'STRING' }, why: { type: 'STRING' } };
    required = ['angle', ...keys];
  }
  for (const k of keys) schemaProps[k] = { type: 'STRING' };
  const prompt = parts.filter((x) => x !== '').join('\n');
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: schemaProps, required } };
  return { system, prompt, schema, total, countKey: keys[keys.length - 1], format: fmt };
}

// AI가 준 결과 정리: 형식에 있는 필드만, 말머리는 목록 안에서만
export function cleanCopyItems(arr, fmt) {
  const F = FORMATS[fmt];
  return (Array.isArray(arr) ? arr : []).map((x) => {
    if (!x || typeof x !== 'object') return null;
    const f = {};
    for (const fd of F.fields) {
      let v = String(x[fd.key] ?? '').replace(/\s+/g, ' ').trim();
      if (fd.options && !fd.options.includes(v)) v = fd.options[0];
      f[fd.key] = v.slice(0, 200);
    }
    if (!textFields(fmt).some((fd) => f[fd.key])) return null;
    return { id: x.id ? String(x.id).slice(0, 40) : undefined, angle: String(x.angle || '').slice(0, 20), why: String(x.why || '').slice(0, 80), f };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- 재검증 (카피마다 독립 판정)
export function copyVerifyRequest(b = {}) {
  const fmt = FORMATS[b.format] ? b.format : 'pl_ad';
  const F = FORMATS[fmt];
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60);
  const keys = F.fields.map((f) => f.key);
  const system = '너는 네이버 검색광고 소재 검수 담당자다. 각 카피를 다른 카피와 비교하지 말고 하나씩 독립적으로 판정한다. 최종 답은 설명 없이 JSON만 출력한다.';
  const prompt = [
    `[광고 형식] ${CopySpec.CHANNELS[F.ch]} · ${F.name}`,
    specLines(fmt),
    '',
    '[브랜드 정보]',
    brandBlock(b.brand),
    list(b.keywords, 20, 40).length ? `\n[대상 키워드] ${list(b.keywords, 20, 40).join(', ')}` : '',
    clip(b.extra, 1500) ? `\n[요청 사항]\n${clip(b.extra, 1500)}` : '',
    list(b.caution, 100, 40).length ? `\n[사용자 주의어] ${list(b.caution, 100, 40).join(', ')}` : '',
    '',
    '[판정 기준] 아래를 모두 지키면 pass=true',
    '1) 형식의 글자 수와 규칙을 지킨다 (띄어쓰기 포함으로 센다)',
    '2) [브랜드 정보]에 없는 사실·숫자·혜택·실적을 지어내지 않았다',
    '3) 근거 없는 최상급·단정·과장 표현이 없다 (타이틀에는 근거가 있어도 최상급 불가)',
    '4) 다른 광고주 언급·비교·비방이 없다',
    '5) 대상 키워드로 검색한 사람의 의도와 맞고, 요청 사항을 지킨다',
    '6) 자연스러운 한국어이고 어법·띄어쓰기가 맞다, 장식용 특수문자가 없다',
    '',
    '[카피]',
    items.map((x) => `- id=${clip(x.id, 40)} | ${keys.map((k) => `${k}: ${clip(x.fields?.[k], 200)}`).join(' | ')}`).join('\n'),
    '',
    '출력: {"items": [{"id": 원래 id, "pass": true/false, "reason": 판정 이유 한 줄, "risks": ["심사·법적으로 걸릴 수 있는 점", ...]}]}',
  ].filter((x) => x !== '').join('\n');
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, pass: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, risks: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['id', 'pass', 'reason'] } };
  return { system, prompt, schema, total: items.length, countKey: 'pass' };
}
export const cleanVerifyItems = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.id != null).map((x) => ({
  id: String(x.id).slice(0, 40), pass: x.pass === true || x.pass === 'true', reason: String(x.reason || '').slice(0, 200), risks: (Array.isArray(x.risks) ? x.risks : []).map((r) => String(r).slice(0, 120)).slice(0, 5),
}));

// ---------------------------------------------------------------- 파일 저장소 (탭 · 캠페인)
// GET ?id= → { doc } · GET → { list } · POST { doc } 저장 · POST { doc, metaOnly } 이름·고정만 · POST { delete: id }
export function createStore(dir, metaOf) {
  const INDEX = path.join(dir, 'index.json');
  const okId = (id) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);
  const readIndex = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')).list || []; } catch { return []; } };
  const write = (f, obj) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(obj)); fs.renameSync(f + '.tmp', f); };
  const baseMeta = (d) => ({ id: d.id, name: String(d.name || '이름 없음').slice(0, 60), custom: !!d.custom, pinned: !!d.pinned, createdAt: Number(d.createdAt) || Date.now(), updatedAt: Number(d.updatedAt) || Date.now() });
  return {
    dir,
    async handle(req, u, readBody) {
      if (req.method === 'GET') {
        const id = u.searchParams.get('id');
        if (!id) return [200, { list: readIndex(), dir }];
        if (!okId(id)) return [400, { error: '잘못된 id' }];
        try { return [200, { doc: JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')) }]; }
        catch { return [404, { error: '파일을 찾지 못했어요' }]; }
      }
      if (req.method !== 'POST') return [405, { error: 'GET/POST만 돼요' }];
      const b = await readBody(req);
      let idx = readIndex();
      if (b.delete) {
        if (!okId(b.delete)) return [400, { error: '잘못된 id' }];
        try { fs.unlinkSync(path.join(dir, b.delete + '.json')); } catch {}
        write(INDEX, { list: idx.filter((m) => m.id !== b.delete) });
        return [200, { ok: true }];
      }
      const d = b.doc;
      if (!d || !okId(d.id)) return [400, { error: 'doc(id)가 필요해요' }];
      const f = path.join(dir, d.id + '.json');
      let full = d;
      if (b.metaOnly) {
        try { full = { ...JSON.parse(fs.readFileSync(f, 'utf8')), name: d.name, custom: !!d.custom, pinned: !!d.pinned }; }
        catch { return [404, { error: '없는 파일' }]; }
      }
      const meta = { ...baseMeta(full), ...(metaOf ? metaOf(full) : {}) };
      write(f, { ...full, ...baseMeta(full) });
      idx = [meta, ...idx.filter((m) => m.id !== d.id)];
      write(INDEX, { list: idx });
      return [200, { ok: true, meta }];
    },
  };
}
export const copyMeta = (d) => ({ format: String(d.form?.format || ''), count: Array.isArray(d.items) ? d.items.length : 0, picked: Array.isArray(d.items) ? d.items.filter((x) => x && x.status === 'pick').length : 0 });
export const mockMeta = (d) => ({ type: d.type === 'bs' ? 'bs' : 'pl', groups: Array.isArray(d.groups) ? d.groups.length : 0 });
export { len, joinText };
