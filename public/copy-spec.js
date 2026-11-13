// 광고 카피 규격 · 자동 검사 (화면 · 서버 · 테스트가 같이 씀)
// 규격 출처: 네이버 광고 도움말 · 광고 가이드 (2026-11 확인)
//   파워링크 소재 ads.naver.com/help/faq/344 · 반응형 /1454 · 확장소재 /1422, /1134
//   브랜드검색 ads.naver.com/adguide/1627(모바일 베이직) /1628(리스팅) /1631(브랜드소식) /1649(홈링크) /1650~1654(PC 라이트형) /1656·1668(PC 프리미엄) /1637(모바일 스토리) /1666(모바일 서브)
//   표현 규정 /adguide/24(최상급) /adguide/144(표기·특수문자)
(function (G) {
  const NEWS_PREFIX = ['새소식', '기획전', '이벤트', '할인', '핫딜'];
  const PROMO_PREFIX = ['없음', '이벤트', '할인']; // 파워링크 홍보문구 말머리 (실제 검색 화면에서 본 것)

  // 필드: key, label, min, max, title(최상급 불가 타이틀), spaceAtMax(최대 글자면 띄어쓰기 1회 필수), brand(업체·사이트 이름 필요), slogan, options(고르기)
  const FORMATS = {
    pl_ad: { ch: 'pl', name: '제목 + 설명', fields: [{ key: 'title', label: '제목', min: 1, max: 15, brand: true }, { key: 'desc', label: '설명', min: 20, max: 45 }], note: '반응형 소재는 제목 3~15개, 설명 2~4개를 등록하면 네이버가 조합해요' },
    pl_addtitle: { ch: 'pl', name: '추가제목 (확장소재)', fields: [{ key: 'text', label: '추가제목', min: 1, max: 15 }], note: '단일형 소재에서만 노출 · 그룹당 최대 15개' },
    pl_promo: { ch: 'pl', name: '홍보문구 (확장소재)', fields: [{ key: 'prefix', label: '말머리', options: PROMO_PREFIX }, { key: 'text', label: '홍보문구', min: 1, max: 14 }], note: '그룹당 2개까지' },
    pl_sublink: { ch: 'pl', name: '서브링크 이름 (확장소재)', fields: [{ key: 'text', label: '서브링크', min: 1, max: 6 }], note: '링크 3~4개가 한 세트' },
    bs_pc_basic: { ch: 'bs', name: 'PC 라이트형 · 메인 텍스트', fields: [{ key: 'title', label: '타이틀', min: 1, max: 18, title: true }, { key: 'desc1', label: '설명 1줄', min: 1, max: 23 }, { key: 'desc2', label: '설명 2줄', min: 1, max: 23 }], note: '설명 2줄 필수' },
    bs_mo_basic: { ch: 'bs', name: '모바일 라이트형 · 베이직', fields: [{ key: 'sub', label: '서브타이틀(빨간 줄)', min: 1, max: 15 }, { key: 'main', label: '메인타이틀', min: 1, max: 14, title: true, spaceAtMax: true }, { key: 'desc1', label: '설명 1줄', min: 1, max: 17, spaceAtMax: true }, { key: 'desc2', label: '설명 2줄', min: 1, max: 17, spaceAtMax: true }], note: '메인타이틀은 한 줄 · 14자면 띄어쓰기 1회 필수' },
    bs_mo_listing: { ch: 'bs', name: '모바일 라이트형 · 리스팅', fields: [{ key: 'title', label: '타이틀', min: 1, max: 30, title: true }, { key: 'desc1', label: '설명 1줄', min: 1, max: 30 }, { key: 'desc2', label: '설명 2줄', min: 1, max: 30 }], note: '자동 줄바꿈 없음' },
    bs_pc_premium: { ch: 'bs', name: 'PC 프리미엄형 · 이미지 위 텍스트', fields: [{ key: 'title', label: '타이틀', min: 1, max: 12, title: true, spaceAtMax: true }, { key: 'desc', label: '설명', min: 1, max: 22, spaceAtMax: true }, { key: 'button', label: '버튼', min: 1, max: 8 }], note: '총 3줄 (타이틀 2 + 설명 1 또는 타이틀 1 + 설명 2)' },
    bs_mo_story: { ch: 'bs', name: '모바일 프리미엄형 · 스토리 텍스트', fields: [{ key: 'title', label: '타이틀', min: 1, max: 12, title: true }, { key: 'desc', label: '설명', min: 1, max: 16 }, { key: 'button', label: '버튼', min: 1, max: 7 }], note: '이미지 786×496 위에 3줄' },
    bs_2gu: { ch: 'bs', name: 'PC 서브 · 2구 섬네일', fields: [{ key: 'sub', label: '서브타이틀', min: 1, max: 14 }, { key: 'title', label: '타이틀', min: 1, max: 12, title: true }, { key: 'desc1', label: '설명 1줄', min: 1, max: 13 }, { key: 'desc2', label: '설명 2줄', min: 1, max: 13 }] },
    bs_news: { ch: 'bs', name: '브랜드소식', fields: [{ key: 'prefix', label: '말머리', options: NEWS_PREFIX }, { key: 'pc', label: 'PC', min: 1, max: 36 }, { key: 'mo', label: '모바일', min: 1, max: 18 }] },
    bs_slogan: { ch: 'bs', name: '홈링크 슬로건', fields: [{ key: 'pc', label: 'PC', min: 1, max: 28, slogan: true }, { key: 'mo', label: '모바일', min: 1, max: 11, slogan: true }], note: '이벤트·할인·최상급·"공식 스토어" 불가' },
    bs_sublink: { ch: 'bs', name: 'PC 라이트형 · 서브링크', fields: [{ key: 'text', label: '서브링크', min: 1, max: 21 }], note: '2~4개' },
    bs_label: { ch: 'bs', name: '섬네일·탭·버튼 이름 (모바일)', fields: [{ key: 'text', label: '이름', min: 1, max: 7 }] },
  };
  const CHANNELS = { pl: '파워링크', bs: '브랜드검색' };
  const ANGLES = ['가격·혜택', '신뢰·브랜드', '기간·긴급', '불안 해소', '질문형', '숫자·근거', '차별점', '간편·속도'];
  const SUPER_DEFAULT = '완벽, 초일류, 가장 좋은, 초특급, 최초, 최고, 최상, 최적, 최저, 가장, 제일, 1위, 유일, 넘버원, No.1, 100%';

  const len = (s) => [...String(s ?? '')].length; // 띄어쓰기 포함 글자 수
  const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
  const words = (s) => String(s || '').split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);
  const textFields = (fmt) => (FORMATS[fmt]?.fields || []).filter((f) => !f.options);
  const joinText = (fmt, v) => textFields(fmt).map((f) => v?.[f.key] || '').filter(Boolean).join(' | ');

  const DECO = /[★☆♥♡♤♧♣♠◆◇■□●○◎※▶▷◀◁►◄→←↑↓✔✓❤♪♬@#^*=<>\[\]{}|\\]|\p{Extended_Pictographic}/u;
  const NUM = /\d[\d,.]*\s*(%|퍼센트|만원|천원|원|억|만|천|개월|년|일|시간|분|초|세|명|회|배|위|개|건|가지|종|대)?/g;

  // 하나의 글(필드) 검사 → [{ level: 'err'|'warn'|'info', field, msg }]
  function checkText(text, f, ctx = {}) {
    const out = [];
    const t = String(text ?? '');
    const n = len(t);
    const add = (level, msg) => out.push({ level, field: f.key, msg });
    if (f.options) return out;
    if (!t.trim()) { if (f.min) add('err', `${f.label} 비어 있음`); return out; }
    if (f.max && n > f.max) add('err', `${f.label} ${n}자 (최대 ${f.max}자)`);
    if (f.min && n < f.min) add('err', `${f.label} ${n}자 (최소 ${f.min}자)`);
    if (f.spaceAtMax && f.max && n >= f.max && !/\s/.test(t)) add('err', `${f.label}: ${f.max}자를 다 쓰면 띄어쓰기 1회 필수`);
    // 최상급: 타이틀에는 불가, 나머지는 근거·출처가 있어야 가능
    if (ctx.superCheck !== false) {
      const hit = (ctx.superWords || words(SUPER_DEFAULT)).filter((w) => w && t.toLowerCase().includes(w.toLowerCase()));
      if (hit.length) add(f.title || f.slogan ? 'err' : 'warn', `${f.title ? '타이틀에 최상급 불가' : f.slogan ? '슬로건에 최상급 불가' : '최상급은 근거·출처 필요'}: ${hit.join(', ')}`);
    }
    if (f.slogan && /이벤트|할인|프로모션|특가|세일|쿠폰|공식\s*스토어/.test(t)) add('err', '슬로건에 이벤트·할인·"공식 스토어" 불가');
    // 표기: 장식용 특수문자 · 같은 문장부호 반복 · 감정 표현 물결표
    if (DECO.test(t)) add('warn', '장식용 특수문자·이모지는 제한돼요');
    if (/([!?.~])\1/.test(t)) add('warn', '같은 문장부호 반복은 제한돼요');
    if (/~/.test(t) && !/\d\s*~\s*\d/.test(t)) add('warn', '물결표(~)는 기간 표기에만 가능해요');
    if (n >= 12 && !/\s/.test(t)) add('warn', '띄어쓰기가 없어요 (어법·띄어쓰기 심사)');
    // 업체·사이트 이름 (파워링크 제목은 필수)
    if (f.brand && ctx.brandNames?.length && !ctx.brandNames.some((b) => norm(t).includes(norm(b)))) add('warn', '제목에 업체·사이트 이름이 없어요 (파워링크 제목은 필수)');
    // 사용자 주의어 (빈 목록에서 시작)
    const caution = (ctx.caution || []).filter((w) => t.toLowerCase().includes(w.toLowerCase()));
    if (caution.length) add('warn', `주의어: ${caution.join(', ')}`);
    // 다른 광고주 언급 (비교 광고 제한)
    const rivals = (ctx.rivals || []).filter((r) => r.length >= 2 && norm(t).includes(norm(r)));
    if (rivals.length) add('warn', `다른 광고주 언급: ${rivals.join(', ')} (비교 광고 제한)`);
    // 숫자 근거: 브랜드 정보(혜택·근거)에 없는 숫자
    const nums = (t.match(NUM) || []).map((x) => x.replace(/\s+/g, '')).filter((x) => /\d/.test(x));
    if (nums.length) {
      const facts = norm(ctx.facts || '').replace(/,/g, '');
      const known = norm((ctx.brandNames || []).join(' ') + ' ' + (ctx.keywords || []).join(' '));
      const miss = nums.filter((x) => { const d = x.replace(/,/g, ''); const core = d.match(/[\d.]+/)[0]; return !facts.includes(d) && !facts.includes(core) && !known.includes(core); });
      if (miss.length) add(facts ? 'warn' : 'info', facts ? `브랜드 정보에 없는 숫자: ${miss.join(', ')}` : `숫자 근거 확인: ${miss.join(', ')} (혜택·근거 칸에 적으면 자동 대조)`);
    }
    return out;
  }

  // 카피 한 개(형식 + 값) 검사
  function check(fmt, v, ctx = {}) {
    const F = FORMATS[fmt];
    if (!F) return { issues: [{ level: 'err', field: '', msg: '알 수 없는 형식' }], lens: {} };
    const issues = [];
    const lens = {};
    for (const f of F.fields) {
      lens[f.key] = len(v?.[f.key]);
      issues.push(...checkText(v?.[f.key], f, ctx));
    }
    // 키워드 포함 여부는 참고만
    if (ctx.keywords?.length) {
      const all = norm(joinText(fmt, v));
      if (!ctx.keywords.some((k) => all.includes(norm(k)))) issues.push({ level: 'info', field: '', msg: '대상 키워드가 들어 있지 않아요' });
    }
    if (ctx.dupKeys && ctx.dupKeys.has(norm(joinText(fmt, v)))) issues.push({ level: 'warn', field: '', msg: '다른 카피와 똑같아요' });
    return { issues, lens };
  }
  const worst = (issues) => (issues.some((i) => i.level === 'err') ? 'err' : issues.some((i) => i.level === 'warn') ? 'warn' : 'ok');

  G.CopySpec = { FORMATS, CHANNELS, ANGLES, NEWS_PREFIX, PROMO_PREFIX, SUPER_DEFAULT, len, norm, words, textFields, joinText, checkText, check, worst };
})(typeof window !== 'undefined' ? window : globalThis);
