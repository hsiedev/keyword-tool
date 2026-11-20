// 그림 주소 안전하게: data:image · http(s) · 같은 사이트 경로만 허용
function safeUrl(u) { u = String(u || '').trim(); if (!/^(data:image\/|https?:\/\/|\/(?!\/)|blob:)/i.test(u)) return ''; return u.replace(/["'<>\\()\s]/g, (c) => encodeURIComponent(c)); }
// 광고 목업: 네이버 광고주센터처럼 캠페인 › 광고그룹 › 소재 · 확장 소재를 만들고, 네이버 검색 결과 모양으로 미리보기
// - 파워링크: 단일형/반응형 소재, 확장 소재(추가제목·추가설명·홍보문구·서브링크·이미지형 서브링크·파워링크 이미지)
// - 브랜드검색: PC 라이트형 · PC 프리미엄형(이미지) · 모바일 라이트형(베이직/리스팅) · 모바일 프리미엄형(스토리)
// - 규격 검사(글자 수 · 이미지 크기 · 최상급 등) → "검수 예상" 표시, PNG · HTML 저장
// - 저장: 캠페인 하나 = 파일 하나 (data\ad-mock\)
// - 모양은 실제 네이버 화면을 재서 맞춘 근사치예요 (2026-11 PC/모바일 측정)
(function () {
  const S = window.CopySpec;
  if (!S) return;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const RC = () => window.SETTINGS?.rules?.copy || {};
  const H = { list: [], cur: null, cache: new Map(), err: '' };
  const M = { group: null, tab: 'ads', device: 'pc', rank: 1, comp: {}, combo: 0, edit: null, showComp: true, mark: true, compBusy: false, adId: null, sel: new Set(), below: false };
  const CH = { pl: '파워링크', bs: '브랜드검색' };

  // ---------------------------------------------------------------- 규격
  const EXT = {
    addtitle: { name: '추가제목', max: 15, limit: 15, note: '단일형 소재에서만 노출 · 그룹당 15개' },
    adddesc: { name: '추가설명', max: 0, limit: 4, note: '단일형에서만 노출 · 글자 수 규격은 확인 못 했어요' },
    promo: { name: '홍보문구', max: 14, limit: 2, note: '말머리 + 14자 · 그룹당 2개' },
    sublink: { name: '서브링크', max: 6, limit: 2, links: [3, 4], note: '링크 3~4개 · 이름 6자' },
    imgsub: { name: '이미지형 서브링크', max: 6, limit: 2, links: [3, 4], img: true, note: '3~4개 · 이름은 서브링크(6자) 기준으로 검사' },
    plimg: { name: '파워링크 이미지', limit: 2, img: true, note: '그룹당 2개' },
  };
  const T = (key, label, max, o = {}) => ({ key, t: 'text', label, max, min: o.min ?? 1, ...o });
  const I = (key, label, w, h, o = {}) => ({ key, t: 'img', label, w, h, ...o });
  const SEC = (label) => ({ t: 'sec', label });
  const SEL = (key, label, options, o = {}) => ({ key, t: 'sel', label, options, ...o });
  const LIST = (key, label, min, max, item, o = {}) => ({ key, t: 'list', label, min, max, item, ...o });
  const is = (k, val) => (v) => v[k] === val;
  const HOME = (dev) => [
    SEC('홈링크'),
    I('logo', '로고 (투명 PNG, 선택)', 80, 88, { opt: true, note: '가로 80~960 × 세로 88~160px · 로고와 브랜드명 중 하나' }),
    T('brandName', '브랜드명', 7, { min: 0, note: '로고가 없을 때 · 1~7자' }),
    T('slogan', '홈페이지/슬로건', dev === 'pc' ? 28 : 11, { min: 0, slogan: true, note: '비우면 "홈페이지" · 이벤트·할인·최상급 불가' }),
    SEC('브랜드소식 (선택)'),
    SEL('newsPrefix', '말머리', ['사용 안 함', ...S.NEWS_PREFIX]),
    T('newsText', '브랜드소식', dev === 'pc' ? 36 : 18, { when: (v) => v.newsPrefix && v.newsPrefix !== '사용 안 함' }),
  ];
  const LEGAL = [SEC('법적고지문 (선택)'), { key: 'legal', t: 'area', label: '법적고지문', note: '글자 수 규격은 확인 못 했어요' }];
  const SUB2 = LIST('sub2', '2구 섬네일', 2, 2, [I('img', '이미지', 222, 222), T('sub', '서브타이틀', 14), T('title', '타이틀', 12, { title: true }), T('desc1', '설명 1줄', 13), T('desc2', '설명 2줄', 13)], { when: is('subType', '2구 섬네일') });
  const SUB5 = LIST('sub5', '5구 섬네일', 5, 5, [I('img', '이미지', 232, 166), T('text', '텍스트', 8)], { when: is('subType', '5구 섬네일') });
  const SUBT = T('subTitle', '서브 콘텐츠 메인타이틀', 30, { when: (v) => /섬네일/.test(v.subType || '') });
  const MO3 = LIST('thumbs3', '3구 섬네일', 3, 3, [I('img', '이미지', 240, 240), T('text', '텍스트', 7)], { when: is('subType', '3구 섬네일') });
  const MOTAB = LIST('tabs', '탭 (탭마다 섬네일 3개)', 2, 3, [T('name', '탭 이름', 7), I('img1', '섬네일 1', 240, 240), T('text1', '텍스트 1', 7), I('img2', '섬네일 2', 240, 240), T('text2', '텍스트 2', 7), I('img3', '섬네일 3', 240, 240), T('text3', '텍스트 3', 7)], { when: is('subType', '탭') });
  const MOFL = LIST('flick', '플리킹 섬네일', 4, 5, [I('img', '이미지', 240, 240), T('text', '텍스트', 7)], { when: is('subType', '플리킹') });
  const SLIDE = (w, h, tmax, dmax, bmax, note) => [I('img', '이미지', w, h, { exact: true, note }), T('title1', '타이틀 1줄', tmax, { title: true, spaceAtMax: true }), T('title2', '타이틀 2줄 (선택)', tmax, { min: 0, title: true, spaceAtMax: true }), T('desc1', '설명 1줄', dmax, { min: 0, spaceAtMax: true }), T('desc2', '설명 2줄 (선택)', dmax, { min: 0, spaceAtMax: true }), T('button', '버튼', bmax)];
  const TPL = {
    pc_light: { name: 'PC 라이트형', dev: 'pc', src: 'ads.naver.com/adguide/1650~1654', fields: [...HOME('pc'), SEC('메인 콘텐츠 · 베이직'), I('mainImg', '메인이미지', 472, 472, { note: '472×472px 이상 · 테두리·분할 이미지 불가' }), T('imgText', '이미지 하단 텍스트 (선택)', 15, { min: 0 }), SEL('imgTextColor', '하단 텍스트 색', ['흰색', '검정'], { when: (v) => !!v.imgText }), T('title', '타이틀', 18, { title: true }), T('desc1', '설명 1줄', 23), T('desc2', '설명 2줄', 23), LIST('sublinks', '서브링크', 2, 4, [T('text', '이름', 21)]), LIST('thumbs', '섬네일 (3개 필수)', 3, 3, [I('img', '이미지', 232, 152), T('text', '텍스트', 8)]), SEC('서브 콘텐츠 (선택)'), SEL('subType', '서브 콘텐츠', ['사용 안 함', '2구 섬네일', '5구 섬네일']), SUBT, SUB2, SUB5, ...LEGAL] },
    pc_premium: { name: 'PC 프리미엄형 (이미지)', dev: 'pc', src: 'ads.naver.com/adguide/1656·1668', fields: [...HOME('pc'), SEC('메인 콘텐츠 · 이미지'), LIST('slides', '메인이미지 (1~5장)', 1, 5, SLIDE(1340, 600, 12, 22, 8, '1340×600px · 좌우 126px 안에 주요 내용 금지'), { lines3: true }), { key: 'brandColor', t: 'color', label: '브랜드컬러', note: '밝기(HSB B) 90% 이하' }, SEC('서브 콘텐츠 (필수)'), SEL('subType', '서브 콘텐츠', ['버튼', '5구 섬네일', '2구 섬네일']), LIST('buttons', '서브 버튼', 2, 3, [T('text', '버튼', 20)], { when: is('subType', '버튼'), maxBy: { 2: 20, 3: 12 } }), SUBT, SUB5, SUB2, ...LEGAL] },
    mo_light: { name: '모바일 라이트형', dev: 'mo', src: 'ads.naver.com/adguide/1627·1628·1666', fields: [...HOME('mo'), SEC('메인 콘텐츠'), SEL('mainType', '메인 유형', ['베이직', '리스팅']), I('mainImg', '메인이미지', 208, 208, { when: is('mainType', '베이직'), note: '208×208px 이상' }), T('sub', '서브타이틀 (빨간 줄)', 15, { when: is('mainType', '베이직') }), T('main', '메인타이틀', 14, { title: true, spaceAtMax: true, when: is('mainType', '베이직'), note: '한 줄 · 14자면 띄어쓰기 1회 필수' }), T('desc1', '설명 1줄', 17, { spaceAtMax: true, when: is('mainType', '베이직') }), T('desc2', '설명 2줄', 17, { spaceAtMax: true, when: is('mainType', '베이직') }), T('ltitle', '타이틀', 30, { title: true, when: is('mainType', '리스팅') }), T('ldesc1', '설명 1줄', 30, { when: is('mainType', '리스팅') }), T('ldesc2', '설명 2줄', 30, { when: is('mainType', '리스팅') }), SEL('lbtn', '버튼 아이콘', ['전화', '계산기', '상세', '이벤트'], { when: is('mainType', '리스팅') }), SEC('서브 콘텐츠 (필수)'), SEL('subType', '서브 콘텐츠', ['3구 섬네일', '탭', '버튼', '플리킹']), MO3, MOTAB, LIST('buttons', '버튼', 1, 4, [T('text', '버튼', 19)], { when: is('subType', '버튼'), maxBy: { 1: 19, 2: 9, 3: 7, 4: 9 } }), MOFL, ...LEGAL] },
    mo_story: { name: '모바일 프리미엄형 (스토리)', dev: 'mo', src: 'ads.naver.com/adguide/1637·1667', fields: [...HOME('mo'), SEC('메인 콘텐츠 · 스토리'), LIST('slides', '스토리 이미지 (1~5장)', 1, 5, SLIDE(786, 496, 12, 16, 7, '786×496px · 좌우 48px 안에 주요 내용 금지'), { lines3: true }), { key: 'brandColor', t: 'color', label: '브랜드컬러' }, SEC('서브 콘텐츠 (필수)'), SEL('subType', '서브 콘텐츠', ['3구 섬네일', '탭', '버튼', '플리킹']), MO3, MOTAB, LIST('buttons', '버튼', 2, 3, [T('text', '버튼', 10)], { when: is('subType', '버튼'), maxBy: { 2: 10, 3: 7 } }), MOFL, ...LEGAL] },
  };
  function defaults(fields) {
    const v = {};
    for (const f of fields) {
      if (f.t === 'sec') continue;
      if (f.t === 'sel') v[f.key] = f.options[0];
      else if (f.t === 'list') v[f.key] = Array.from({ length: f.min }, () => defaults(f.item));
      else if (f.t === 'color') v[f.key] = '#0c43b7';
      else if (f.t === 'img') v[f.key] = null;
      else v[f.key] = '';
    }
    return v;
  }

  // ---------------------------------------------------------------- 데이터
  const newAd = (site = '') => ({ id: uid('a'), on: true, type: 'single', site, dispUrl: '', titles: [''], descs: [''], tags: ['', '', ''], favicon: null });
  const newExt = (kind) => ({ id: uid('x'), on: true, kind, text: '', prefix: '없음', links: EXT[kind].links ? Array.from({ length: 3 }, () => ({ name: '', img: null })) : [], img: null });
  const newGroup = (type, name, tpl = 'pc_light') => (type === 'pl' ? { id: uid('g'), name, on: true, keyword: '', ads: [], ext: [] } : { id: uid('g'), name, on: true, keyword: '', tpl, v: defaults(TPL[tpl].fields) });
  const newCampaign = (type, name) => ({ id: uid('m'), name, type, on: true, custom: true, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), groups: [newGroup(type, '광고그룹 1')] });
  const D = () => H.cur;
  const G = () => D()?.groups.find((g) => g.id === M.group) || null;

  async function api(body) {
    const r = await fetch('/api/ad-mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || (r.status === 404 ? '서버가 예전 버전이에요 (서버를 다시 시작해 주세요)' : '저장 실패 ' + r.status));
    return j;
  }
  let saveT = null;
  function save(now, doc = D()) {
    if (!doc) return;
    doc.updatedAt = Date.now();
    clearTimeout(saveT);
    const run = async () => {
      try {
        const body = JSON.stringify({ doc });
        if (body.length > 22e6) throw new Error('이미지가 너무 많아요 (22MB 넘음). 이미지를 줄여 주세요');
        const { meta } = await api({ doc });
        H.list = [meta, ...H.list.filter((m) => m.id !== doc.id)];
        H.cache.set(doc.id, doc); H.err = '';
      } catch (e) { H.err = '저장하지 못했어요: ' + e.message; }
      drawSide();
    };
    if (now) return run();
    saveT = setTimeout(run, 700);
  }
  async function loadList() {
    try { const j = await (await fetch('/api/ad-mock')).json(); if (j.error) throw new Error(j.error); H.list = j.list || []; H.err = ''; }
    catch { H.err = '목록을 읽지 못했어요 (서버를 다시 시작하면 생겨요)'; }
    drawSide();
  }
  async function openDoc(id, groupId = null) {
    let d = H.cache.get(id);
    if (!d) {
      try { const j = await (await fetch('/api/ad-mock?id=' + encodeURIComponent(id))).json(); if (j.error) throw new Error(j.error); d = j.doc; H.cache.set(id, d); }
      catch (e) { return toast('불러오지 못했어요: ' + e.message, 'err'); }
    }
    H.cur = d; M.group = groupId; M.edit = null; M.sel = new Set(); M.tab = d.type === 'pl' ? 'ads' : 'bs';
    localStorage.setItem('mockCur', id);
    draw();
  }

  // ---------------------------------------------------------------- 검사
  function cctx(names = []) {
    const rc = RC();
    return { brandNames: names.filter((x) => x && x.trim()), caution: S.words(rc.caution), superCheck: rc.superCheck !== false, superWords: S.words(rc.superWords || S.SUPER_DEFAULT) };
  }
  const noInfo = (a) => a.filter((i) => i.level !== 'info');
  function checkAd(ad) {
    const out = [];
    const e = (level, msg) => out.push({ level, msg });
    const ctx = cctx([ad.site]);
    if (!ad.site.trim()) e('err', '사이트 이름 비어 있음'); else if (S.len(ad.site) > 10) e('err', `사이트 이름 ${S.len(ad.site)}자 (최대 10자)`);
    const ts = ad.type === 'single' ? ad.titles.slice(0, 1) : ad.titles;
    const ds = ad.type === 'single' ? ad.descs.slice(0, 1) : ad.descs;
    if (ad.type === 'resp') {
      const nT = ts.filter((t) => t.trim()).length, nD = ds.filter((t) => t.trim()).length;
      if (nT < 3 || nT > 15) e('err', `반응형 제목 ${nT}개 (3~15개)`);
      if (nD < 2 || nD > 4) e('err', `반응형 설명 ${nD}개 (2~4개)`);
    }
    ts.forEach((t, i) => out.push(...noInfo(S.checkText(t, { key: 't', label: `제목${ts.length > 1 ? ' ' + (i + 1) : ''}`, min: ad.type === 'resp' && i >= 3 ? 0 : 1, max: 15 }, ctx))));
    ds.forEach((t, i) => out.push(...noInfo(S.checkText(t, { key: 'd', label: `설명${ds.length > 1 ? ' ' + (i + 1) : ''}`, min: ad.type === 'resp' && i >= 2 && !t.trim() ? 0 : 20, max: 45 }, ctx))));
    if (ad.site.trim() && !ts.some((t) => S.norm(t).includes(S.norm(ad.site)))) e('warn', '제목에 업체·사이트 이름이 없어요 (파워링크 제목은 필수)');
    const tags = ad.tags.map((t) => t.trim()).filter(Boolean);
    if (tags.length) {
      if (tags.length !== 3) e('warn', `태그 ${tags.length}개 (새 소재 화면은 3개 필수)`);
      tags.forEach((t) => { if (S.len(t) < 3 || S.len(t) > 6) e('err', `태그 '${t}' ${S.len(t)}자 (3~6자)`); });
      if (new Set(tags).size !== tags.length) e('err', '태그가 겹쳐요');
    }
    return out;
  }
  function checkExt(x, g) {
    const out = [];
    const sp = EXT[x.kind];
    const ctx = cctx();
    if (x.kind === 'addtitle' || x.kind === 'promo') out.push(...noInfo(S.checkText(x.text, { key: 't', label: sp.name, min: 1, max: sp.max }, ctx)));
    if (x.kind === 'adddesc') out.push(...noInfo(S.checkText(x.text, { key: 't', label: sp.name, min: 1, max: 999 }, ctx)));
    if (sp.links) {
      const n = x.links.length;
      if (n < sp.links[0] || n > sp.links[1]) out.push({ level: 'err', msg: `${sp.name}: 링크 ${n}개 (${sp.links[0]}~${sp.links[1]}개)` });
      x.links.forEach((l, i) => { out.push(...noInfo(S.checkText(l.name, { key: 'n', label: `${sp.name} ${i + 1}`, min: 1, max: sp.max }, ctx))); if (sp.img && !l.img) out.push({ level: 'warn', msg: `${sp.name} ${i + 1}: 이미지 없음` }); });
    }
    if (x.kind === 'plimg' && !x.img) out.push({ level: 'warn', msg: '파워링크 이미지: 이미지 없음' });
    const same = g.ext.filter((y) => y.kind === x.kind);
    if (same.length > sp.limit && same.indexOf(x) >= sp.limit) out.push({ level: 'err', msg: `${sp.name}는 그룹당 ${sp.limit}개까지` });
    return out;
  }
  function hsbB(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0; const n = parseInt(m[1], 16); return Math.round((Math.max(n >> 16, (n >> 8) & 255, n & 255) / 255) * 100); }
  function checkBS(g) {
    const tpl = TPL[g.tpl], v = g.v, out = [];
    const ctx = cctx();
    const walk = (fields, obj, prefix, lc) => {
      for (const f of fields) {
        if (f.t === 'sec' || (f.when && !f.when(v))) continue;
        if (f.t === 'text') {
          const max = lc?.maxBy?.[lc.count] ?? f.max;
          out.push(...noInfo(S.checkText(obj[f.key], { ...f, max, label: prefix + f.label }, ctx)));
        }
        if (f.t === 'img') {
          const im = obj[f.key];
          if (!im) { if (!f.opt) out.push({ level: 'warn', msg: `${prefix}${f.label}: 이미지 없음 (목업엔 회색 칸)` }); }
          else if (f.exact ? im.w !== f.w || im.h !== f.h : im.w < f.w || im.h < f.h) out.push({ level: f.exact && im.w >= f.w && im.h >= f.h ? 'warn' : 'err', msg: `${prefix}${f.label}: ${im.w}×${im.h}px (${f.exact ? '규격' : '최소'} ${f.w}×${f.h}px)` });
        }
        if (f.t === 'list') {
          const arr = obj[f.key] || [];
          if (arr.length < f.min || arr.length > f.max) out.push({ level: 'err', msg: `${prefix}${f.label}: ${arr.length}개 (${f.min === f.max ? f.min : f.min + '~' + f.max}개)` });
          arr.forEach((it, i) => {
            walk(f.item, it, `${prefix}${f.label.replace(/\s*\(.*\)$/, '')} ${i + 1} · `, { maxBy: f.maxBy, count: arr.length });
            if (f.lines3) { const n = ['title1', 'title2', 'desc1', 'desc2'].filter((k) => (it[k] || '').trim()).length; if (n !== 3) out.push({ level: 'err', msg: `${f.label.replace(/\s*\(.*\)$/, '')} ${i + 1}: 타이틀 + 설명은 모두 3줄 (지금 ${n}줄)` }); }
          });
        }
      }
    };
    walk(tpl.fields, v, '', null);
    if (!v.logo && !(v.brandName || '').trim()) out.push({ level: 'err', msg: '홈링크: 로고나 브랜드명 중 하나는 있어야 해요' });
    if (tpl.fields.some((f) => f.t === 'color') && hsbB(v.brandColor) > 90) out.push({ level: 'err', msg: `브랜드컬러 밝기 ${hsbB(v.brandColor)}% (90% 이하)` });
    return out;
  }
  function groupIssues(g) {
    if (D().type === 'bs') return checkBS(g);
    return [...g.ads.filter((a) => a.on).flatMap(checkAd), ...g.ext.filter((x) => x.on).flatMap((x) => checkExt(x, g))];
  }
  const verdict = (iss) => (iss.some((i) => i.level === 'err') ? ['bad', '보류 예상'] : iss.some((i) => i.level === 'warn') ? ['mix', '확인 필요'] : ['ok', '통과 예상']);
  const badge = (iss) => { const [c, t] = verdict(iss); return `<span class="mk-v ${c}" title="${esc(iss.map((i) => i.msg).join('\n') || '규격·표현 검사 통과')}">${t}${iss.length ? ` ${iss.length}` : ''}</span>`; };
  const issList = (iss) => (iss.length ? `<div class="cp-iss">${iss.map((i) => `<span class="iss ${i.level}">${esc(i.msg)}</span>`).join('')}</div>` : '<div class="cp-iss"><span class="iss ok">규격·표현 검사 통과</span></div>');

  // ---------------------------------------------------------------- 네이버 모양 (렌더)
  const MOCK_CSS = `
.nvm{font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",helvetica,"Apple SD Gothic Neo",sans-serif;color:#1c1c1c;background:#f5f6f8;padding:16px 24px 20px;line-height:1.35;letter-spacing:-.2px;width:720px;-webkit-font-smoothing:antialiased;text-align:left}
.nvm *{box-sizing:border-box}
.nvm.mo{width:390px;padding:10px 0 14px;background:#eef0f3}
.nvm.mini{width:auto;max-width:100%;padding:10px;background:#f5f6f8;border-radius:10px}
.nvm .sbar{display:flex;align-items:center;gap:12px;height:56px;border-radius:28px;background:#fff;border:2px solid #03c75a;padding:0 20px;margin:0 0 14px;font-size:20px;font-weight:700;color:#1c1c1c}
.nvm.mo .sbar{height:46px;margin:0 12px 10px;font-size:17px;border-width:1.5px}
.nvm .nlogo{width:22px;height:22px;border-radius:4px;background:#03c75a;color:#fff;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;flex:none}
.nvm .sec{background:#fff;border-radius:16px;margin:0 0 12px;overflow:hidden}
.nvm.mo .sec{border-radius:12px;margin:0 8px 10px}
.nvm .pl-h{padding:18px 20px 6px;font-size:18px;font-weight:600;display:flex;align-items:center;gap:6px}
.nvm .pl-h small{margin-left:auto;font-size:13px;font-weight:400;color:#8c8c8c}
.nvm .pl-li{padding:16px 20px;border-top:1px solid #f1f1f1;display:flex;gap:16px;position:relative}
.nvm .pl-h + .pl-li{border-top:0}
.nvm.mo .pl-li{padding:14px 16px;flex-wrap:wrap;gap:10px}
.nvm .pl-main{flex:1;min-width:0}
.nvm .pl-main.narrow{flex:0 0 286px}
.nvm.mo .pl-main.narrow{flex:1 1 100%}
.nvm .pl-u{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.nvm .fav{width:26px;height:26px;border-radius:50%;border:1px solid #ececec;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;overflow:hidden;flex:none}
.nvm .fav img{width:100%;height:100%;object-fit:cover}
.nvm .site{font-size:14px;line-height:19px;font-weight:600}
.nvm .adm{display:inline-block;font-size:11px;line-height:16px;color:#767676;border:1px solid #e3e3e3;border-radius:99px;padding:0 6px;margin-left:5px;vertical-align:1px;font-weight:400}
.nvm .url{font-size:14px;line-height:19px;color:#737373}
.nvm .tit{font-size:18px;line-height:24px;color:#0c43b7}
.nvm.mo .tit{font-size:17px;line-height:23px}
.nvm .tit b,.nvm .dsc b{font-weight:700}
.nvm .dsc{font-size:16px;line-height:24px;color:#424242;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nvm.mo .dsc{font-size:15px;line-height:22px}
.nvm .promo{margin-top:8px;border:.8px solid #cdd8ea;border-radius:12px;height:44px;padding:0 12px;display:flex;align-items:center;gap:6px;font-size:15px;color:#424242;white-space:nowrap;overflow:hidden}
.nvm .promo.red{border-color:#f1a9a9}
.nvm .promo .pf{color:#fc4c4e;font-weight:600}
.nvm .promo .ic{width:16px;height:16px;border-radius:4px;background:#5b7bd5;flex:none}
.nvm .promo.red .ic{background:#fc4c4e;border-radius:50%}
.nvm .promo .chev{margin-left:auto;color:#9a9a9a}
.nvm .subs{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.nvm .subs span{border:.8px solid #e5e5e5;border-radius:100px;padding:0 12px;font-size:14px;line-height:32px;color:#0c43b7;white-space:nowrap}
.nvm .isubs{display:flex;gap:8px;flex:none;margin-top:46px}
.nvm.mo .isubs{margin-top:2px;width:100%}
.nvm .isub{width:104px;flex:none}
.nvm.mo .isub{width:auto;flex:1}
.nvm .th{border-radius:12px;background:#e9edf3 center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#9aa3b0;font-size:11px;overflow:hidden}
.nvm .isub .th{width:104px;height:104px}
.nvm.mo .isub .th{width:100%;height:auto;aspect-ratio:1}
.nvm .isub div.n{font-size:14px;text-align:center;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nvm .plimg{width:104px;height:130px;flex:none}
.nvm.mo .plimg{width:84px;height:104px;position:absolute;right:16px;top:58px}
.nvm.mo .pl-li.hasimg .pl-main{padding-right:96px}
.nvm .me{box-shadow:inset 0 0 0 2px #03c75a}
.nvm .me-tag{position:absolute;top:8px;right:10px;font-size:11px;background:#03c75a;color:#fff;border-radius:4px;padding:1px 6px;z-index:2}
.nvm .ph{color:#b0b6bf}
.nvm .bs{background:#fff;border:1px solid #e3e7ee;border-radius:16px;overflow:hidden;margin:0 0 12px}
.nvm.mo .bs{border:0;border-radius:12px;margin:0 8px 10px}
.nvm .bs-home{display:flex;align-items:center;gap:10px;padding:18px 24px 8px}
.nvm.mo .bs-home{padding:14px 16px 6px}
.nvm .bs-home img{max-height:22px;max-width:140px;object-fit:contain}
.nvm .bs-home .bn{font-size:15px;font-weight:800;color:#1c1c1c}
.nvm .bs-home .sl{font-size:18px;line-height:22px;color:#0c43b7}
.nvm.mo .bs-home .sl{color:#0068c3}
.nvm .bs-news{display:flex;align-items:center;gap:8px;margin:0 24px 10px;font-size:15px;color:#424242;white-space:nowrap;overflow:hidden}
.nvm.mo .bs-news{margin:0 16px 8px;font-size:14px}
.nvm .bs-news .pf{font-weight:700;color:#fc4c4e;border:1px solid #f5c2c2;border-radius:6px;padding:1px 6px;font-size:13px}
.nvm .bs-main{display:flex;gap:24px;padding:6px 24px 20px}
.nvm .bs-mi{width:236px;height:236px;border-radius:16px;flex:none;position:relative}
.nvm .bs-mi .it{position:absolute;left:0;right:0;bottom:0;padding:26px 10px 12px;font-size:15px;font-weight:600;text-align:center}
.nvm .bs-mi .it.w{color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.55))}
.nvm .bs-mi .it.k{color:#111}
.nvm .bs-r{flex:1;min-width:0}
.nvm .bs-t{font-size:20px;line-height:25px;font-weight:600;color:#0c43b7}
.nvm .bs-d{font-size:16px;line-height:21px;color:#424242;margin-top:4px}
.nvm .bs-sl{display:flex;gap:6px;margin-top:12px;overflow:hidden}
.nvm .bs-sl span{border:1px solid #e5e5e5;border-radius:99px;padding:0 14px;font-size:15px;line-height:34px;color:#0c43b7;white-space:nowrap}
.nvm .bs-th{display:flex;gap:10px;margin-top:14px}
.nvm .bs-th > div{width:116px;flex:none}
.nvm .bs-th .th{width:116px;height:76px}
.nvm .tx{font-size:15px;line-height:20px;text-align:center;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nvm .bs-sub{border-top:1px solid #f0f0f0;padding:18px 24px}
.nvm .bs-sub h4{font-size:17px;line-height:22px;font-weight:600;margin:0 0 12px}
.nvm .bs-2g{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.nvm .bs-2g > div{display:flex;gap:14px;min-width:0}
.nvm .bs-2g .th{width:111px;height:111px;flex:none}
.nvm .hl{color:#fc4c4e;font-size:14px;line-height:19px}
.nvm .t2{font-size:16px;line-height:24px;font-weight:500;color:#000}
.nvm .d2{font-size:15px;line-height:20px;color:rgba(0,0,0,.6)}
.nvm .bs-5g{display:flex;gap:10px}
.nvm .bs-5g > div{flex:1;min-width:0}
.nvm .bs-5g .th{width:100%;aspect-ratio:232/166}
.nvm .bs-legal{border-top:1px solid #f0f0f0;padding:12px 24px;font-size:11px;line-height:15px;color:#8c8c8c;white-space:pre-wrap}
.nvm.mo .bs-legal{padding:12px 16px}
.nvm .mo-main{display:flex;gap:14px;padding:4px 16px 16px;align-items:center}
.nvm .mo-mi{width:104px;height:104px;flex:none}
.nvm .mo-r{flex:1;min-width:0}
.nvm .mo-sub{font-size:14px;line-height:19px;color:#fc4c4e}
.nvm .mo-t{font-size:20px;line-height:25px;font-weight:600;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nvm .mo-d{font-size:16px;line-height:21px;color:#595959;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nvm .mo-list{display:flex;gap:12px;padding:4px 16px 16px;align-items:center}
.nvm .mo-list .mo-t{white-space:normal}
.nvm .mo-ic{width:44px;height:44px;border-radius:50%;border:1px solid #e3e7ee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#0068c3;flex:none}
.nvm .mo-tabs{display:flex;background:#f1f3f6;margin-top:2px}
.nvm .mo-tabs span{flex:1;text-align:center;font-size:15px;line-height:44px;color:#000;white-space:nowrap;overflow:hidden}
.nvm .mo-tabs span.on{background:#fff;font-weight:600;border-radius:12px 12px 0 0}
.nvm .mo-3{display:flex;gap:8px;padding:16px}
.nvm .mo-3 > div{flex:1;min-width:0}
.nvm .mo-3 .th{width:100%;aspect-ratio:1}
.nvm .mo-btns{display:flex;gap:8px;padding:12px 16px 16px}
.nvm .mo-btns span{flex:1;border:1px solid #e3e7ee;border-radius:8px;line-height:42px;text-align:center;font-size:15px;white-space:nowrap;overflow:hidden;color:#1c1c1c}
.nvm .mo-btns.bc span{border:0;color:#fff}
.nvm .mo-fl{display:flex;gap:8px;padding:16px;overflow:hidden}
.nvm .mo-fl > div{width:110px;flex:none}
.nvm .mo-fl .th{width:110px;height:110px}
.nvm .pm{position:relative;width:100%;aspect-ratio:1340/600;overflow:hidden}
.nvm.mo .pm{aspect-ratio:786/496}
.nvm .pm .th{position:absolute;inset:0;border-radius:0}
.nvm .pm-tx{position:absolute;left:40px;top:50%;transform:translateY(-50%);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25)}
.nvm.mo .pm-tx{left:20px;top:auto;bottom:22px;transform:none}
.nvm .pm-t{font-size:28px;line-height:36px;font-weight:700}
.nvm.mo .pm-t{font-size:21px;line-height:27px}
.nvm .pm-d{font-size:17px;line-height:24px;margin-top:2px}
.nvm.mo .pm-d{font-size:15px;line-height:21px}
.nvm .pm-b{display:inline-block;margin-top:14px;background:#fff;border-radius:99px;padding:0 18px;line-height:36px;font-size:15px;font-weight:600;text-shadow:none}
.nvm.mo .pm-b{margin-top:10px;line-height:32px;font-size:14px}
.nvm .pm-dots{position:absolute;right:16px;bottom:12px;display:flex;gap:5px}
.nvm .pm-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5)}
.nvm .pm-dots i.on{background:#fff}
.nvm .pc-btns{display:flex;gap:8px;padding:16px 24px}
.nvm .pc-btns span{flex:1;text-align:center;line-height:44px;border-radius:10px;font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden}
.nvm .cap{font-size:11px;color:#8c8c8c;margin:4px 0 0}
`;
  const st = document.createElement('style');
  st.id = 'mockCss';
  st.textContent = MOCK_CSS;
  document.head.appendChild(st);

  const e2 = (s) => esc(s ?? '');
  const ph = (text, fallback) => (String(text ?? '').trim() ? e2(text) : `<span class="ph">${e2(fallback)}</span>`);
  const bg = (im) => (im?.src ? ` style="background-image:url('${safeUrl(im.src)}')"` : '');
  const thumb = (im, cls, label) => `<div class="th ${cls || ''}"${bg(im)}>${im?.src ? '' : e2(label || '')}</div>`;
  function hl(text, kw) {
    let s = e2(text);
    const ws = [...new Set([kw, ...String(kw || '').split(/\s+/)].map((w) => String(w || '').trim()).filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length);
    for (const w of ws) { const ew = e2(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp(`(?![^<]*>)${ew}`, 'g'), `<b>${e2(w)}</b>`); }
    return s.replace(/<b>(<b>)+/g, '<b>').replace(/(<\/b>)+/g, '</b>');
  }
  const PAL = ['#3b6fd8', '#e0533d', '#1f9d6b', '#8a5bd6', '#d98b17', '#2b8fb3', '#c2457a'];
  const favColor = (s) => PAL[[...String(s || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];

  // 파워링크 광고 한 개: { site, url, fav, titles, desc, promo, sublinks, isubs, image, mine }
  function plItem(a, kw, dev) {
    const right = dev === 'pc' && (a.isubs || a.image !== undefined && a.image !== null);
    const isubs = a.isubs ? `<div class="isubs">${a.isubs.map((x) => `<div class="isub">${thumb(x.img ? { src: x.img } : null, '', '이미지')}<div class="n">${ph(x.name, '이름')}</div></div>`).join('')}</div>` : '';
    const img = !a.isubs && a.image !== undefined && a.image !== null ? `<div class="th plimg"${a.image ? ` style="background-image:url('${safeUrl(a.image)}')"` : ''}>${a.image ? '' : '이미지'}</div>` : '';
    const promo = a.promo ? `<div class="promo ${a.promo.prefix ? 'red' : ''}"><span class="ic"></span>${a.promo.prefix ? `<span class="pf">${e2(a.promo.prefix)}</span>` : ''}<span>${ph(a.promo.text, '홍보문구')}</span><span class="chev">›</span></div>` : '';
    const subs = a.sublinks?.length && !a.isubs ? `<div class="subs">${a.sublinks.map((s) => `<span>${ph(s, '서브링크')}</span>`).join('')}</div>` : '';
    return `<div class="pl-li ${a.mine && M.mark ? 'me' : ''} ${img && dev === 'mo' ? 'hasimg' : ''}">${a.mine && M.mark ? '<span class="me-tag">내 광고</span>' : ''}
      <div class="pl-main ${a.isubs && dev === 'pc' ? 'narrow' : ''}">
        <div class="pl-u"><span class="fav" style="background:${a.fav ? '#fff' : favColor(a.site)}">${a.fav ? `<img src="${safeUrl(a.fav)}" alt="">` : e2([...String(a.site || '?')][0])}</span><div><div><span class="site">${ph(a.site, '사이트 이름')}</span><span class="adm">광고</span></div><div class="url">${ph(a.url, 'example.com')}</div></div></div>
        <div class="tit">${(a.titles?.length ? a.titles : ['']).map((t) => (String(t).trim() ? hl(t, kw) : '<span class="ph">제목</span>')).join(' · ')}</div>
        <div class="dsc">${String(a.desc || '').trim() ? hl(a.desc, kw) : '<span class="ph">설명 문구</span>'}</div>
        ${promo}${subs}
      </div>${right ? isubs || img : ''}${!right ? isubs || img : ''}</div>`;
  }
  const plSection = (items, kw, dev) => `<div class="sec"><div class="pl-h"><span>${e2(kw || '키워드')}</span> 관련 광고<small>등록 안내</small></div>${items.map((a) => plItem(a, kw, dev)).join('') || '<div class="pl-li"><span class="ph">소재가 없어요</span></div>'}</div>`;
  const searchBar = (kw) => `<div class="sbar"><span class="nlogo">N</span>${e2(kw || '검색어')}</div>`;

  // 브랜드검색
  function bsHome(v, dev) {
    return `<div class="bs-home">${v.logo?.src ? `<img src="${safeUrl(v.logo.src)}" alt="">` : `<span class="bn">${ph(v.brandName, '브랜드명')}</span>`}<span class="sl">${e2(String(v.slogan || '').trim() || '홈페이지')}</span></div>
      ${v.newsPrefix && v.newsPrefix !== '사용 안 함' ? `<div class="bs-news"><span class="pf">${e2(v.newsPrefix)}</span><span>${ph(v.newsText, '브랜드소식')}</span></div>` : ''}`;
  }
  const legal = (v) => (String(v.legal || '').trim() ? `<div class="bs-legal">ⓘ ${e2(v.legal)}</div>` : '');
  function pcSub(v) {
    if (v.subType === '2구 섬네일') return `<div class="bs-sub">${v.subTitle ? `<h4>${e2(v.subTitle)}</h4>` : '<h4 class="ph">서브 메인타이틀</h4>'}<div class="bs-2g">${(v.sub2 || []).map((x) => `<div>${thumb(x.img, '', '222×222')}<div style="min-width:0"><div class="hl">${ph(x.sub, '서브타이틀')}</div><div class="t2">${ph(x.title, '타이틀')}</div><div class="d2">${ph(x.desc1, '설명 1줄')}</div><div class="d2">${ph(x.desc2, '설명 2줄')}</div></div></div>`).join('')}</div></div>`;
    if (v.subType === '5구 섬네일') return `<div class="bs-sub">${v.subTitle ? `<h4>${e2(v.subTitle)}</h4>` : '<h4 class="ph">서브 메인타이틀</h4>'}<div class="bs-5g">${(v.sub5 || []).map((x) => `<div>${thumb(x.img, '', '232×166')}<div class="tx">${ph(x.text, '텍스트')}</div></div>`).join('')}</div></div>`;
    return '';
  }
  function moSub(v, premium) {
    const bc = premium ? v.brandColor || '#0c43b7' : '';
    if (v.subType === '3구 섬네일') return `<div class="mo-3">${(v.thumbs3 || []).map((x) => `<div>${thumb(x.img, '', '240×240')}<div class="tx">${ph(x.text, '텍스트')}</div></div>`).join('')}</div>`;
    if (v.subType === '탭') { const t = (v.tabs || [])[0] || {}; return `<div class="mo-tabs">${(v.tabs || []).map((x, i) => `<span class="${i ? '' : 'on'}">${ph(x.name, '탭 ' + (i + 1))}</span>`).join('')}</div><div class="mo-3">${[1, 2, 3].map((i) => `<div>${thumb(t['img' + i], '', '240×240')}<div class="tx">${ph(t['text' + i], '텍스트')}</div></div>`).join('')}</div>`; }
    if (v.subType === '버튼') return `<div class="mo-btns ${bc ? 'bc' : ''}">${(v.buttons || []).map((x) => `<span${bc ? ` style="background:${e2(bc)}"` : ''}>${ph(x.text, '버튼')}</span>`).join('')}</div>`;
    if (v.subType === '플리킹') return `<div class="mo-fl">${(v.flick || []).map((x) => `<div>${thumb(x.img, '', '240×240')}<div class="tx">${ph(x.text, '텍스트')}</div></div>`).join('')}</div>`;
    return '';
  }
  function slideHTML(s, n, i, dev) {
    s = s || {};
    const t = [s.title1, s.title2].filter((x) => String(x || '').trim());
    const d = [s.desc1, s.desc2].filter((x) => String(x || '').trim());
    return `<div class="pm">${thumb(s.img, '', dev === 'pc' ? '1340×600' : '786×496')}<div class="pm-tx"><div class="pm-t">${t.length ? t.map(e2).join('<br>') : '<span class="ph" style="color:#fff">타이틀</span>'}</div>${d.length ? `<div class="pm-d">${d.map(e2).join('<br>')}</div>` : ''}<span class="pm-b" style="color:${e2(M._bc || '#0c43b7')}">${ph(s.button, '버튼')}</span></div>${n > 1 ? `<div class="pm-dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>`;
  }
  function bsBlock(tplKey, v) {
    const dev = TPL[tplKey].dev;
    if (tplKey === 'pc_light') {
      return `<div class="bs">${bsHome(v, dev)}<div class="bs-main"><div class="th bs-mi"${bg(v.mainImg)}>${v.mainImg?.src ? '' : '472×472'}${v.imgText ? `<div class="it ${v.imgTextColor === '검정' ? 'k' : 'w'}">${e2(v.imgText)}</div>` : ''}</div>
        <div class="bs-r"><div class="bs-t">${ph(v.title, '타이틀 (18자)')}</div><div class="bs-d">${ph(v.desc1, '설명 1줄 (23자)')}<br>${ph(v.desc2, '설명 2줄 (23자)')}</div>
        <div class="bs-sl">${(v.sublinks || []).map((x) => `<span>${ph(x.text, '서브링크')}</span>`).join('')}</div>
        <div class="bs-th">${(v.thumbs || []).map((x) => `<div>${thumb(x.img, '', '232×152')}<div class="tx">${ph(x.text, '텍스트')}</div></div>`).join('')}</div></div></div>${pcSub(v)}${legal(v)}</div>`;
    }
    if (tplKey === 'mo_light') {
      const main = v.mainType === '리스팅'
        ? `<div class="mo-list"><div class="mo-r"><div class="mo-t">${ph(v.ltitle, '타이틀 (30자)')}</div><div class="mo-d">${ph(v.ldesc1, '설명 1줄')}</div><div class="mo-d">${ph(v.ldesc2, '설명 2줄')}</div></div><span class="mo-ic">${e2(v.lbtn || '상세')}</span></div>`
        : `<div class="mo-main">${thumb(v.mainImg, 'mo-mi', '208×208')}<div class="mo-r"><div class="mo-sub">${ph(v.sub, '서브타이틀')}</div><div class="mo-t">${ph(v.main, '메인타이틀 (14자)')}</div><div class="mo-d">${ph(v.desc1, '설명 1줄')}</div><div class="mo-d">${ph(v.desc2, '설명 2줄')}</div></div></div>`;
      return `<div class="bs">${bsHome(v, dev)}${main}${moSub(v, false)}${legal(v)}</div>`;
    }
    M._bc = v.brandColor;
    const slides = v.slides || [];
    if (tplKey === 'pc_premium') {
      const btns = v.subType === '버튼' ? `<div class="pc-btns">${(v.buttons || []).map((x) => `<span style="background:${e2(v.brandColor || '#0c43b7')}">${ph(x.text, '버튼')}</span>`).join('')}</div>` : pcSub(v);
      return `<div class="bs">${bsHome(v, dev)}${slideHTML(slides[0], slides.length, 0, 'pc')}${btns}${legal(v)}</div>`;
    }
    return `<div class="bs">${bsHome(v, dev)}${slideHTML(slides[0], slides.length, 0, 'mo')}<div style="background:${e2(v.brandColor || '#0c43b7')}14">${moSub(v, true)}</div>${legal(v)}</div>`;
  }

  // 내 파워링크 광고 → 렌더용 (반응형은 M.combo로 조합을 바꿔 봄)
  function rnd(seed) { let s = (seed * 9301 + 49297) % 233280 || 7; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
  function shuffle(a, r) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function myAd(g, ad) {
    if (!ad) return null;
    const on = (k) => g.ext.filter((x) => x.on && x.kind === k);
    const r = rnd(M.combo + 1);
    let titles, desc;
    if (ad.type === 'resp') {
      const ts = ad.titles.filter((t) => t.trim()), ds = ad.descs.filter((t) => t.trim());
      titles = M.combo ? shuffle(ts, r).slice(0, 3) : ts.slice(0, 3);
      desc = (M.combo ? shuffle(ds, r) : ds).slice(0, 2).join(' ');
    } else {
      titles = [ad.titles[0] || ''];
      const at = on('addtitle'); if (at.length) titles.push(at[M.combo % at.length].text);
      desc = ad.descs[0] || '';
      const adx = on('adddesc'); if (adx.length) desc += ' ' + adx[M.combo % adx.length].text;
    }
    const pr = on('promo'), sl = on('sublink'), isl = on('imgsub'), pi = on('plimg');
    const p = pr.length ? pr[M.combo % pr.length] : null;
    return {
      site: ad.site, url: ad.dispUrl, fav: ad.favicon?.src, titles, desc, mine: true,
      promo: p ? { prefix: p.prefix && p.prefix !== '없음' ? p.prefix : '', text: p.text } : null,
      sublinks: sl.length ? sl[0].links.map((l) => l.name) : [],
      isubs: isl.length ? isl[0].links.map((l) => ({ name: l.name, img: l.img?.src })) : null,
      image: pi.length ? pi[M.combo % pi.length].img?.src || '' : null,
    };
  }
  const compAd = (a) => ({ site: a.site, url: a.url, titles: a.titles, desc: a.desc, promo: a.promo, sublinks: a.sublinks, isubs: null, image: null });

  // ---------------------------------------------------------------- 저장 (PNG · HTML)
  async function toPng(el, name) {
    const w = el.offsetWidth, h = el.offsetHeight;
    const wrap = document.createElement('div');
    const s = document.createElement('style'); s.textContent = MOCK_CSS; wrap.appendChild(s);
    wrap.appendChild(el.cloneNode(true));
    const xml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const k = 2;
    const cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k;
    const c2 = cv.getContext('2d'); c2.scale(k, k); c2.drawImage(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    dl(blob, name + '.png');
  }
  function toHtml(el, name) {
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${e2(name)}</title><style>body{margin:0;padding:20px;background:#e9ebef}${MOCK_CSS}</style></head><body>${el.outerHTML}<p style="font:12px sans-serif;color:#888">네이버 광고 목업 (근사치) · ${new Date().toLocaleString('ko-KR')}</p></body></html>`;
    dl(new Blob([html], { type: 'text/html;charset=utf-8' }), name + '.html');
  }
  function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/[\\/:*?"<>|]/g, ''); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }

  // 이미지 읽기: 원본 크기는 규격 검사용으로 기억, 저장은 최대 1600px로 줄여서
  function readImg(file) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type)) return rej(new Error('이미지 파일이 아니에요'));
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const w = im.naturalWidth, h = im.naturalHeight;
          const k = Math.min(1, 1600 / Math.max(w, h));
          const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          const png = /png|gif|webp/.test(file.type);
          res({ src: k === 1 && file.size < 900e3 ? fr.result : cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w, h, name: file.name.slice(0, 60) });
        };
        im.onerror = () => rej(new Error('이미지를 읽지 못했어요'));
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------- 화면 틀
  function mount() {
    const v = document.createElement('div');
    v.id = 'mockView';
    v.className = 'hidden';
    v.innerHTML = `<div class="ai-wrap"><aside class="side" id="mSide"></aside><main class="ai-main" style="max-width:1400px"><div id="mBody"></div></main></div><div class="ctx hidden" id="mCtx"></div>`;
    $('#main').after(v);
    document.addEventListener('click', (e) => { if (!e.target.closest('#mCtx')) $('#mCtx')?.classList.add('hidden'); });
  }
  function menu(e, items) {
    e?.stopPropagation?.(); // 이 클릭이 문서 전체 클릭(메뉴 닫기)으로 번지지 않게
    const box = $('#mCtx');
    box.innerHTML = items.map(([k, label, cls]) => `<button data-a="${k}" class="${cls || ''}">${e2(label)}</button>`).join('');
    box.classList.remove('hidden');
    box.style.left = Math.min(e.clientX, innerWidth - 230) + 'px';
    box.style.top = Math.min(e.clientY, innerHeight - box.offsetHeight - 10) + 'px';
    return new Promise((res) => $$('button', box).forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); box.classList.add('hidden'); res(b.dataset.a); })));
  }
  function drawSide() {
    const side = $('#mSide');
    if (!side) return;
    const cur = D();
    const fmtD = (t) => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : `${d.getMonth() + 1}.${d.getDate()}`; };
    const list = H.list.map((m) => (cur && m.id === cur.id ? { ...m, name: cur.name, type: cur.type, groups: cur.groups.length } : m));
    if (cur && !list.some((m) => m.id === cur.id)) list.unshift({ id: cur.id, name: cur.name, type: cur.type, groups: cur.groups.length, updatedAt: cur.updatedAt });
    side.innerHTML = `<button class="btn pri newbtn" id="mNew">+ 새 캠페인</button>
      ${H.err ? `<div style="font-size:11px;color:#b45309;padding:4px 6px;line-height:1.5">${e2(H.err)}</div>` : ''}
      ${list.sort((a, b) => b.updatedAt - a.updatedAt).map((m) => `<div class="sit ${cur?.id === m.id ? 'on' : ''}" data-mid="${e2(m.id)}" title="${e2(m.name)} (우클릭: 이름 변경·삭제)"><div class="sn"><span class="mk-type ${m.type}">${m.type === 'bs' ? '브검' : 'PL'}</span><span>${e2(m.name)}</span></div><div class="sm">${CH[m.type] || ''} · 광고그룹 ${m.groups || 0} · ${fmtD(m.updatedAt)}</div></div>`).join('') || '<div class="muted" style="padding:6px 10px;font-size:12px">만든 캠페인이 여기 쌓여요</div>'}`;
    $('#mNew').onclick = async (e) => { const a = await menu(e, [['pl', '파워링크 캠페인'], ['bs', '브랜드검색 캠페인']]); if (a) createCampaign(a); };
    $$('.sit', side).forEach((el) => {
      el.onclick = () => openDoc(el.dataset.mid);
      el.oncontextmenu = async (e) => { e.preventDefault(); const a = await menu(e, [['rename', '이름 변경'], ['del', '삭제', 'danger']]); if (a) campAction(a, el.dataset.mid); };
    });
  }
  async function createCampaign(type) {
    const n = H.list.filter((m) => m.type === type).length + 1;
    const d = newCampaign(type, `${CH[type]} 캠페인 ${n}`);
    H.cur = d; M.group = d.groups[0].id; M.tab = type === 'pl' ? 'ads' : 'bs'; M.edit = null;
    if (type === 'pl') { const ad = newAd(); d.groups[0].ads.push(ad); M.edit = ad.id; }
    await save(true, d);
    draw();
  }
  async function campAction(a, id) {
    if (D()?.id !== id) await openDoc(id);
    const d = D();
    if (!d) return;
    if (a === 'rename') { const v = await uiPrompt('캠페인 이름', { value: d.name, max: 60 }); if (v) { d.name = v; save(); draw(); } }
    if (a === 'del') {
      if (!await uiConfirm(`'${d.name}' 캠페인을 삭제할까요? 광고그룹 ${d.groups.length}개와 소재·이미지가 같이 지워져요.`)) return;
      try { await api({ delete: d.id }); } catch {}
      H.list = H.list.filter((m) => m.id !== d.id); H.cache.delete(d.id); H.cur = null; M.group = null;
      draw();
    }
    if (a === 'dup') {
      const c = JSON.parse(JSON.stringify(d)); c.id = uid('m'); c.name = d.name + ' 복사본'; c.createdAt = Date.now();
      c.groups.forEach((g) => { g.id = uid('g'); });
      H.cur = c; M.group = null; await save(true, c); draw();
    }
  }

  // ---------------------------------------------------------------- 그리기
  function draw() {
    drawSide();
    const body = $('#mBody');
    if (!body) return;
    const d = D();
    if (!d) {
      body.innerHTML = `<div class="sec"><h2>광고 목업 <span class="muted" style="font-size:13px;font-weight:500">네이버 광고주센터처럼 캠페인 › 광고그룹 › 소재를 만들고, 검색 결과 모양으로 미리 봐요</span></h2>
        <div class="mk-start"><button class="mk-big" data-new="pl"><b>파워링크 캠페인</b><span>제목·설명 소재, 확장 소재(추가제목·홍보문구·서브링크·이미지), 지금 노출 중인 경쟁 광고 사이에서 보기</span></button>
        <button class="mk-big" data-new="bs"><b>브랜드검색 캠페인</b><span>PC 라이트형 · PC 프리미엄형 · 모바일 라이트형 · 모바일 스토리 템플릿, 이미지 규격 검사</span></button></div>
        <div class="muted" style="margin-top:12px">AI 카피 생성기의 카피를 [목업]으로 바로 넣을 수도 있어요. 모양은 실제 네이버 화면을 재서 맞춘 근사치예요.</div></div>`;
      $$('[data-new]', body).forEach((b) => (b.onclick = () => createCampaign(b.dataset.new)));
      return;
    }
    if (!G()) return drawCampaign(body, d);
    drawGroup(body, d, G());
  }
  function drawCampaign(body, d) {
    body.innerHTML = `<div class="mk-crumb"><b>캠페인</b></div>
      <div class="mk-head"><span class="mk-type ${d.type} lg">${CH[d.type]}</span><input class="mk-name" id="mkCName" value="${e2(d.name)}" maxlength="60"><label class="mk-tg"><input type="checkbox" id="mkCOn" ${d.on ? 'checked' : ''}><span>${d.on ? 'ON' : 'OFF'}</span></label><span class="cp-sp"></span><button class="btn sm" data-c="dup">캠페인 복제</button><button class="btn sm" data-c="del">삭제</button></div>
      <div class="card"><h3>광고그룹 <button class="btn sm pri" id="mkAddG">+ 새 광고그룹</button></h3>
      <div class="tbl-wrap"><table class="mk-tbl"><thead><tr><th>ON</th><th>광고그룹</th><th>미리보기 키워드</th><th>${d.type === 'pl' ? '소재' : '템플릿'}</th><th>${d.type === 'pl' ? '확장 소재' : '서브 콘텐츠'}</th><th>검수 예상</th><th></th></tr></thead><tbody>
      ${d.groups.map((g) => `<tr data-g="${g.id}"><td><input type="checkbox" data-gon ${g.on ? 'checked' : ''}></td><td><a href="#" class="mk-a" data-open>${e2(g.name)}</a></td><td>${e2(g.keyword || '-')}</td>
        <td>${d.type === 'pl' ? `${g.ads.length}개${g.ads.some((a) => a.type === 'resp') ? ' (반응형 포함)' : ''}` : e2(TPL[g.tpl].name)}</td>
        <td>${d.type === 'pl' ? (g.ext.length ? [...new Set(g.ext.map((x) => EXT[x.kind].name))].map(e2).join(', ') : '-') : e2(g.v.subType || '-')}</td>
        <td>${badge(groupIssues(g))}</td><td class="mk-ra"><button class="btn sm" data-open>열기</button><button class="btn sm" data-gdup>복제</button><button class="btn sm" data-gdel>삭제</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#mkCName').onchange = (e) => { d.name = e.target.value.trim() || d.name; d.custom = true; save(); drawSide(); };
    $('#mkCOn').onchange = (e) => { d.on = e.target.checked; save(); draw(); };
    $$('[data-c]', body).forEach((b) => (b.onclick = () => campAction(b.dataset.c, d.id)));
    $('#mkAddG').onclick = () => { const g = newGroup(d.type, `광고그룹 ${d.groups.length + 1}`); if (d.type === 'pl') g.ads.push(newAd(d.groups[0]?.ads[0]?.site || '')); d.groups.push(g); save(); M.group = g.id; M.tab = d.type === 'pl' ? 'ads' : 'bs'; M.edit = d.type === 'pl' ? g.ads[0].id : null; draw(); };
    $$('tr[data-g]', body).forEach((tr) => {
      const g = d.groups.find((x) => x.id === tr.dataset.g);
      $$('[data-open]', tr).forEach((a) => (a.onclick = (e) => { e.preventDefault(); M.group = g.id; M.tab = d.type === 'pl' ? 'ads' : 'bs'; M.edit = null; draw(); }));
      tr.querySelector('[data-gon]').onchange = (e) => { g.on = e.target.checked; save(); };
      tr.querySelector('[data-gdup]').onclick = () => { const c = JSON.parse(JSON.stringify(g)); c.id = uid('g'); c.name = g.name + ' 복사본'; (c.ads || []).forEach((a) => (a.id = uid('a'))); (c.ext || []).forEach((x) => (x.id = uid('x'))); d.groups.push(c); save(); draw(); };
      tr.querySelector('[data-gdel]').onclick = async () => { if (!await uiConfirm(`'${g.name}' 광고그룹을 삭제할까요?`)) return; d.groups = d.groups.filter((x) => x !== g); save(); draw(); };
    });
  }
  function drawGroup(body, d, g) {
    const tabs = d.type === 'pl' ? [['ads', `소재 ${g.ads.length}`], ['ext', `확장 소재 ${g.ext.length}`], ['pv', '미리보기']] : [['bs', '소재'], ['pv', '미리보기']];
    if (!tabs.some(([k]) => k === M.tab)) M.tab = tabs[0][0];
    body.innerHTML = `<div class="mk-crumb"><a href="#" id="mkBack">${e2(d.name)}</a> › <b>${e2(g.name)}</b></div>
      <div class="mk-head"><span class="mk-type ${d.type} lg">${CH[d.type]}</span><input class="mk-name" id="mkGName" value="${e2(g.name)}" maxlength="60"><label class="mk-tg"><input type="checkbox" id="mkGOn" ${g.on ? 'checked' : ''}><span>${g.on ? 'ON' : 'OFF'}</span></label>
        <label class="mk-kw">미리보기 키워드 <input class="hsel" id="mkKw" value="${e2(g.keyword)}" placeholder="예: 운전자보험" maxlength="40"></label><span class="cp-sp"></span>${badge(groupIssues(g))}</div>
      <div class="seg mk-tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${M.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div id="mkTab"></div>`;
    $('#mkBack').onclick = (e) => { e.preventDefault(); M.group = null; draw(); };
    $('#mkGName').onchange = (e) => { g.name = e.target.value.trim() || g.name; save(); };
    $('#mkGOn').onchange = (e) => { g.on = e.target.checked; save(); draw(); };
    $('#mkKw').onchange = (e) => { g.keyword = e.target.value.trim(); save(); drawTab(); };
    $$('[data-tab]', body).forEach((b) => (b.onclick = () => { M.tab = b.dataset.tab; draw(); }));
    drawTab();
  }
  function drawTab() {
    const g = G(), box = $('#mkTab');
    // 탭 이름의 개수(소재 n · 확장 소재 n)도 맞춤
    if (D()?.type === 'pl') { const b1 = $('[data-tab="ads"]'), b2 = $('[data-tab="ext"]'); if (b1) b1.textContent = `소재 ${g.ads.length}`; if (b2) b2.textContent = `확장 소재 ${g.ext.length}`; }
    if (M.tab === 'ads') return drawAds(box, g);
    if (M.tab === 'ext') return drawExt(box, g);
    if (M.tab === 'bs') return drawBS(box, g);
    return drawPreview(box, g);
  }
  function refreshHeadBadge() { const g = G(); const b = $('.mk-head .mk-v'); if (b && g) b.outerHTML = badge(groupIssues(g)); }

  // ---------------------------------------------------------------- 파워링크 소재
  function drawAds(box, g) {
    box.innerHTML = `<div class="mk-tools"><button class="btn sm pri" id="mkNewAd">+ 새 소재</button><button class="btn sm" id="mkMerge" title="체크한 단일형 소재의 제목·설명을 모아 반응형 소재 하나로 만들어요">선택한 소재로 반응형 만들기</button><span class="muted">소재를 고치면 바로 저장돼요</span></div>
      <div class="tbl-wrap"><table class="mk-tbl"><thead><tr><th></th><th>ON</th><th>유형</th><th>소재</th><th>검수 예상</th><th></th></tr></thead><tbody>
      ${g.ads.map((a) => `<tr data-ad="${a.id}" class="${M.edit === a.id ? 'sel' : ''}"><td><input type="checkbox" data-sel ${M.sel.has(a.id) ? 'checked' : ''}></td><td><input type="checkbox" data-on ${a.on ? 'checked' : ''}></td><td>${a.type === 'resp' ? '반응형' : '단일형'}</td>
        <td class="mk-sum"><b>${e2(a.site || '(사이트 이름)')}</b> <span class="mk-blue">${e2(a.titles.filter(Boolean).join(' · ') || '(제목)')}</span><div class="muted">${e2(a.descs.filter(Boolean).join(' / ') || '(설명)')}</div></td>
        <td>${badge(checkAd(a))}</td><td class="mk-ra"><button class="btn sm" data-edit>${M.edit === a.id ? '편집 닫기' : '수정'}</button><button class="btn sm" data-dup>복제</button><button class="btn sm" data-del>삭제</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="padding:14px">소재가 없어요. [+ 새 소재]로 만들어 보세요.</td></tr>'}
      </tbody></table></div><div id="mkEdit"></div>`;
    $('#mkNewAd').onclick = () => { const a = newAd(g.ads[0]?.site || ''); a.dispUrl = g.ads[0]?.dispUrl || ''; g.ads.push(a); M.edit = a.id; save(); drawTab(); };
    $('#mkMerge').onclick = () => {
      const picked = g.ads.filter((a) => M.sel.has(a.id));
      if (picked.length < 2) return toast('합칠 소재를 2개 이상 체크해 주세요', 'info');
      const ts = [...new Set(picked.flatMap((a) => a.titles).filter((t) => t.trim()))].slice(0, 15);
      const ds = [...new Set(picked.flatMap((a) => a.descs).filter((t) => t.trim()))].slice(0, 4);
      const a = { ...newAd(picked[0].site), type: 'resp', dispUrl: picked[0].dispUrl, titles: ts, descs: ds, favicon: picked[0].favicon };
      g.ads.push(a); M.edit = a.id; M.sel = new Set(); save(); drawTab();
      toast(`반응형 소재를 만들었어요 (제목 ${ts.length}개 · 설명 ${ds.length}개)`, 'ok');
    };
    $$('tr[data-ad]', box).forEach((tr) => {
      const a = g.ads.find((x) => x.id === tr.dataset.ad);
      tr.querySelector('[data-sel]').onchange = (e) => (e.target.checked ? M.sel.add(a.id) : M.sel.delete(a.id));
      tr.querySelector('[data-on]').onchange = (e) => { a.on = e.target.checked; save(); };
      tr.querySelector('[data-edit]').onclick = () => { M.edit = M.edit === a.id ? null : a.id; drawTab(); };
      tr.querySelector('[data-dup]').onclick = () => { const c = JSON.parse(JSON.stringify(a)); c.id = uid('a'); g.ads.push(c); save(); drawTab(); };
      tr.querySelector('[data-del]').onclick = async () => { if (!await uiConfirm('이 소재를 삭제할까요?')) return; g.ads = g.ads.filter((x) => x !== a); if (M.edit === a.id) M.edit = null; save(); drawTab(); };
    });
    const a = g.ads.find((x) => x.id === M.edit);
    if (a) drawAdEditor($('#mkEdit'), g, a);
  }
  const cnt = (s, max, min = 0) => { const n = S.len(s); return `<span class="cp-n ${n > max || (n && n < min) ? 'bad' : 'ok'}">${n}/${max}</span>`; };
  function drawAdEditor(box, g, a) {
    const resp = a.type === 'resp';
    const ts = resp ? a.titles : a.titles.slice(0, 1);
    const ds = resp ? a.descs : a.descs.slice(0, 1);
    box.innerHTML = `<div class="mk-edit"><div class="mk-form card">
      <h3>소재 ${resp ? '(반응형)' : '(단일형)'} <span class="seg"><button data-type="single" class="${resp ? '' : 'on'}">단일형</button><button data-type="resp" class="${resp ? 'on' : ''}">반응형</button></span></h3>
      <div class="muted" style="margin:-4px 0 8px">${resp ? '제목 3~15개 · 설명 2~4개를 넣으면 네이버가 최대 제목 3개 · 설명 2개를 골라 보여줘요. 추가제목·추가설명 확장소재는 반응형에선 안 보여요.' : '제목 1개 · 설명 1개. 추가제목·추가설명 확장소재가 같이 보일 수 있어요.'}</div>
      <label class="mk-f"><span>사이트 이름</span><input class="inp" data-f="site" value="${e2(a.site)}" maxlength="30" placeholder="예: ○○다이렉트">${cnt(a.site, 10)}</label>
      <label class="mk-f"><span>표시 URL</span><input class="inp" data-f="dispUrl" value="${e2(a.dispUrl)}" maxlength="80" placeholder="예: direct.example.com"></label>
      <div class="mk-sub">제목 <span class="muted">1~15자 · 업체·사이트 이름 필수</span></div>
      ${ts.map((t, i) => `<div class="mk-f row"><input class="inp" data-t="${i}" value="${e2(t)}" maxlength="40" placeholder="제목 ${i + 1}">${cnt(t, 15)}${resp && ts.length > 1 ? `<button class="btn sm" data-tdel="${i}">×</button>` : ''}</div>`).join('')}
      ${resp && ts.length < 15 ? '<button class="btn sm" id="mkTAdd">+ 제목</button>' : ''}
      <div class="mk-sub">설명 <span class="muted">20~45자</span></div>
      ${ds.map((t, i) => `<div class="mk-f row"><input class="inp" data-d="${i}" value="${e2(t)}" maxlength="80" placeholder="설명 ${i + 1}">${cnt(t, 45, 20)}${resp && ds.length > 1 ? `<button class="btn sm" data-ddel="${i}">×</button>` : ''}</div>`).join('')}
      ${resp && ds.length < 4 ? '<button class="btn sm" id="mkDAdd">+ 설명</button>' : ''}
      <div class="mk-sub">태그 <span class="muted">3개 · 각 3~6자 · 겹치면 안 돼요 (목업엔 안 보여요)</span></div>
      <div class="mk-f row">${a.tags.map((t, i) => `<input class="inp" data-tag="${i}" value="${e2(t)}" maxlength="10" placeholder="태그 ${i + 1}">`).join('')}</div>
      <div class="mk-sub">파비콘 <span class="muted">선택</span></div>
      ${imgPick(a.favicon, 'fav')}
    </div><div class="mk-live"><div class="mk-live-h">미리보기 <span class="muted">PC · 확장 소재 포함</span></div><div id="mkLive"></div><div id="mkLiveIss"></div></div></div>`;
    const live = () => {
      $('#mkLive').innerHTML = `<div class="nvm mini">${plItem(myAd(g, a), g.keyword, 'pc')}</div>`;
      $('#mkLiveIss').innerHTML = issList(checkAd(a));
      const tr = $(`tr[data-ad="${a.id}"]`);
      if (tr) { tr.querySelector('.mk-sum').innerHTML = `<b>${e2(a.site || '(사이트 이름)')}</b> <span class="mk-blue">${e2(a.titles.filter(Boolean).join(' · ') || '(제목)')}</span><div class="muted">${e2(a.descs.filter(Boolean).join(' / ') || '(설명)')}</div>`; tr.children[4].innerHTML = badge(checkAd(a)); }
      refreshHeadBadge();
    };
    const upCnt = (inp, max, min) => { const c = inp.parentElement.querySelector('.cp-n'); if (c) c.outerHTML = cnt(inp.value, max, min); };
    $$('[data-f]', box).forEach((inp) => (inp.oninput = () => { a[inp.dataset.f] = inp.value; if (inp.dataset.f === 'site') upCnt(inp, 10); save(); live(); }));
    $$('[data-t]', box).forEach((inp) => (inp.oninput = () => { a.titles[+inp.dataset.t] = inp.value; upCnt(inp, 15); save(); live(); }));
    $$('[data-d]', box).forEach((inp) => (inp.oninput = () => { a.descs[+inp.dataset.d] = inp.value; upCnt(inp, 45, 20); save(); live(); }));
    $$('[data-tag]', box).forEach((inp) => (inp.oninput = () => { a.tags[+inp.dataset.tag] = inp.value; save(); live(); }));
    $$('[data-type]', box).forEach((b) => (b.onclick = () => {
      a.type = b.dataset.type;
      if (a.type === 'resp') { while (a.titles.length < 3) a.titles.push(''); while (a.descs.length < 2) a.descs.push(''); }
      save(); drawTab();
    }));
    $('#mkTAdd') && ($('#mkTAdd').onclick = () => { a.titles.push(''); save(); drawTab(); });
    $('#mkDAdd') && ($('#mkDAdd').onclick = () => { a.descs.push(''); save(); drawTab(); });
    $$('[data-tdel]', box).forEach((b) => (b.onclick = () => { a.titles.splice(+b.dataset.tdel, 1); save(); drawTab(); }));
    $$('[data-ddel]', box).forEach((b) => (b.onclick = () => { a.descs.splice(+b.dataset.ddel, 1); save(); drawTab(); }));
    bindImg(box, (k, im) => { if (k === 'fav') { a.favicon = im; save(); drawTab(); } });
    live();
  }
  function imgPick(im, key, spec) {
    return `<div class="mk-img"><label class="mk-img-btn">${im?.src ? `<img src="${safeUrl(im.src)}" alt="">` : '<span>이미지 선택</span>'}<input type="file" accept="image/*" data-img="${e2(key)}" hidden></label>
      <div class="mk-img-i">${im ? `${im.w}×${im.h}px` : ''}${spec ? `<div class="muted">${e2(spec)}</div>` : ''}${im ? `<button class="btn sm" data-imgdel="${e2(key)}">지우기</button>` : ''}</div></div>`;
  }
  function bindImg(box, set) {
    $$('[data-img]', box).forEach((inp) => (inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { set(inp.dataset.img, await readImg(f)); } catch (e) { toast(e.message, 'err'); } }));
    $$('[data-imgdel]', box).forEach((b) => (b.onclick = (e) => { e.preventDefault(); set(b.dataset.imgdel, null); }));
  }

  // ---------------------------------------------------------------- 파워링크 확장 소재
  function drawExt(box, g) {
    const kinds = Object.keys(EXT);
    box.innerHTML = `<div class="mk-edit"><div class="mk-form">
      ${kinds.map((k) => { const sp = EXT[k]; const list = g.ext.filter((x) => x.kind === k); return `<div class="card mk-ext"><h3>${sp.name} <span class="muted">${list.length}/${sp.limit} · ${e2(sp.note)}</span><button class="btn sm" data-add="${k}" ${list.length >= sp.limit ? 'disabled' : ''}>+ 추가</button></h3>
        ${list.map((x) => extRow(x, g)).join('') || '<div class="muted">없음</div>'}</div>`; }).join('')}
      </div><div class="mk-live"><div class="mk-live-h">미리보기 <span class="muted">첫 번째 켜진 소재 기준 · PC</span></div><div id="mkLive"></div></div></div>`;
    const live = () => { const ad = g.ads.find((a) => a.on) || g.ads[0]; $('#mkLive').innerHTML = ad ? `<div class="nvm mini">${plItem(myAd(g, ad), g.keyword, 'pc')}</div>${ad.type === 'resp' && g.ext.some((x) => x.on && (x.kind === 'addtitle' || x.kind === 'adddesc')) ? '<div class="muted" style="margin-top:6px">반응형 소재라 추가제목·추가설명은 안 보여요</div>' : ''}` : '<div class="muted">소재를 먼저 만들어 주세요</div>'; refreshHeadBadge(); };
    $$('[data-add]', box).forEach((b) => (b.onclick = () => { g.ext.push(newExt(b.dataset.add)); save(); drawTab(); }));
    $$('.mk-xrow', box).forEach((row) => {
      const x = g.ext.find((y) => y.id === row.dataset.x);
      const iss = () => { row.querySelector('.mk-xiss').innerHTML = issList(checkExt(x, g)); live(); };
      row.querySelector('[data-xon]').onchange = (e) => { x.on = e.target.checked; save(); iss(); };
      row.querySelector('[data-xdel]').onclick = () => { g.ext = g.ext.filter((y) => y !== x); save(); drawTab(); };
      const t = row.querySelector('[data-xt]'); if (t) t.oninput = () => { x.text = t.value; const c = t.parentElement.querySelector('.cp-n'); if (c && EXT[x.kind].max) c.outerHTML = cnt(t.value, EXT[x.kind].max); save(); iss(); };
      const p = row.querySelector('[data-xp]'); if (p) p.onchange = () => { x.prefix = p.value; save(); iss(); };
      $$('[data-ln]', row).forEach((inp) => (inp.oninput = () => { x.links[+inp.dataset.ln].name = inp.value; const c = inp.parentElement.querySelector('.cp-n'); if (c) c.outerHTML = cnt(inp.value, EXT[x.kind].max); save(); iss(); }));
      const la = row.querySelector('[data-ladd]'); if (la) la.onclick = () => { x.links.push({ name: '', img: null }); save(); drawTab(); };
      $$('[data-ldel]', row).forEach((b) => (b.onclick = () => { x.links.splice(+b.dataset.ldel, 1); save(); drawTab(); }));
      bindImg(row, (k, im) => { if (k === 'main') x.img = im; else x.links[+k.slice(1)].img = im; save(); drawTab(); });
    });
    live();
  }
  function extRow(x, g) {
    const sp = EXT[x.kind];
    let f = '';
    if (x.kind === 'addtitle' || x.kind === 'adddesc') f = `<div class="mk-f row"><input class="inp" data-xt value="${e2(x.text)}" maxlength="80" placeholder="${sp.name}">${sp.max ? cnt(x.text, sp.max) : ''}</div>`;
    if (x.kind === 'promo') f = `<div class="mk-f row"><select class="hsel" data-xp>${S.PROMO_PREFIX.map((o) => `<option ${o === x.prefix ? 'selected' : ''}>${o}</option>`).join('')}</select><input class="inp" data-xt value="${e2(x.text)}" maxlength="30" placeholder="홍보문구">${cnt(x.text, 14)}</div>`;
    if (sp.links) f = x.links.map((l, i) => `<div class="mk-f row">${sp.img ? imgPick(l.img, 'l' + i) : ''}<input class="inp" data-ln="${i}" value="${e2(l.name)}" maxlength="12" placeholder="이름 ${i + 1}">${cnt(l.name, sp.max)}${x.links.length > sp.links[0] ? `<button class="btn sm" data-ldel="${i}">×</button>` : ''}</div>`).join('') + (x.links.length < sp.links[1] ? '<button class="btn sm" data-ladd>+ 링크</button>' : '');
    if (x.kind === 'plimg') f = imgPick(x.img, 'main', '정사각형에 가까운 이미지');
    return `<div class="mk-xrow" data-x="${x.id}"><div class="mk-xh"><label class="mk-tg"><input type="checkbox" data-xon ${x.on ? 'checked' : ''}><span>ON</span></label><span class="cp-sp"></span><button class="btn sm" data-xdel>삭제</button></div>${f}<div class="mk-xiss">${issList(checkExt(x, g))}</div></div>`;
  }

  // ---------------------------------------------------------------- 브랜드검색 소재 (템플릿 폼)
  function drawBS(box, g) {
    const tpl = TPL[g.tpl];
    box.innerHTML = `<div class="mk-tools"><span class="muted">템플릿</span><div class="seg" id="mkTpl">${Object.entries(TPL).map(([k, t]) => `<button data-tpl="${k}" class="${g.tpl === k ? 'on' : ''}">${e2(t.name)}</button>`).join('')}</div><span class="muted">규격 출처 ${e2(tpl.src)}</span></div>
      <div class="mk-edit"><div class="mk-form card" id="mkBSForm">${formHTML(tpl.fields, g.v, '', g.v)}</div>
      <div class="mk-live"><div class="mk-live-h">미리보기 <span class="muted">${tpl.dev === 'pc' ? 'PC' : '모바일'}</span></div><div id="mkLive"></div><div id="mkLiveIss"></div></div></div>`;
    $$('[data-tpl]', box).forEach((b) => (b.onclick = async () => {
      const nt = b.dataset.tpl;
      if (nt === g.tpl) return;
      if (!await uiConfirm(`템플릿을 '${TPL[nt].name}'(으)로 바꿀까요? 홈링크·브랜드소식·법적고지와 이름이 같은 칸은 그대로 옮기고, 나머지는 새 템플릿 기본값이 돼요.`, { ok: '바꾸기' })) return;
      const nv = defaults(TPL[nt].fields);
      for (const k of Object.keys(nv)) if (g.v[k] !== undefined && (Array.isArray(nv[k]) === Array.isArray(g.v[k])) && !(TPL[nt].fields.find((f) => f.key === k)?.t === 'sel' && !TPL[nt].fields.find((f) => f.key === k).options.includes(g.v[k]))) nv[k] = g.v[k];
      g.tpl = nt; g.v = nv; save(); drawTab();
    }));
    bindForm($('#mkBSForm'), g);
    liveBS(g);
  }
  function liveBS(g) {
    const tpl = TPL[g.tpl];
    $('#mkLive').innerHTML = `<div class="nvm ${tpl.dev === 'mo' ? 'mo' : ''}" style="${tpl.dev === 'pc' ? 'width:720px;zoom:.78' : ''}">${bsBlock(g.tpl, g.v)}</div>`;
    $('#mkLiveIss').innerHTML = issList(checkBS(g));
    refreshHeadBadge();
  }
  const getP = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function setP(obj, p, val) { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((x, k) => x[k], obj); o[last] = val; }
  function formHTML(fields, obj, prefix, root, lc) {
    return fields.map((f) => {
      if (f.when && !f.when(root)) return '';
      const p = prefix + (f.key || '');
      if (f.t === 'sec') return `<div class="mk-sec">${e2(f.label)}</div>`;
      const note = f.note ? `<div class="muted mk-note">${e2(f.note)}</div>` : '';
      if (f.t === 'text') { const max = lc?.maxBy?.[lc.count] ?? f.max; return `<label class="mk-f"><span>${e2(f.label)}</span><input class="inp" data-p="${p}" data-max="${max}" data-min="${f.min ?? 1}" value="${e2(obj[f.key] || '')}" maxlength="${max + 20}">${cnt(obj[f.key] || '', max, f.min)}</label>${note}`; }
      if (f.t === 'area') return `<label class="mk-f col"><span>${e2(f.label)}</span><textarea class="inp" rows="3" data-p="${p}">${e2(obj[f.key] || '')}</textarea></label>${note}`;
      if (f.t === 'sel') return `<label class="mk-f"><span>${e2(f.label)}</span><select class="hsel" data-p="${p}" data-re="1">${f.options.map((o) => `<option ${o === obj[f.key] ? 'selected' : ''}>${e2(o)}</option>`).join('')}</select></label>`;
      if (f.t === 'color') return `<label class="mk-f"><span>${e2(f.label)}</span><input type="color" data-p="${p}" value="${e2(obj[f.key] || '#0c43b7')}"><span class="muted">${e2(obj[f.key] || '')}</span></label>${note}`;
      if (f.t === 'img') return `<div class="mk-f"><span>${e2(f.label)}</span>${imgPick(obj[f.key], p, `${f.exact ? '' : '최소 '}${f.w}×${f.h}px`)}</div>${note}`;
      if (f.t === 'list') {
        const arr = obj[f.key] || [];
        return `<div class="mk-list"><div class="mk-list-h">${e2(f.label)} <span class="muted">${arr.length}개 · ${f.min === f.max ? f.min + '개' : f.min + '~' + f.max + '개'}${f.maxBy ? ' · 개수에 따라 글자 수가 달라요' : ''}</span>${arr.length < f.max ? `<button class="btn sm" data-ladd="${p}">+ 추가</button>` : ''}</div>
          ${arr.map((it, i) => `<div class="mk-li"><div class="mk-li-h">${i + 1}${arr.length > f.min ? `<button class="btn sm" data-ldel="${p}.${i}">×</button>` : ''}</div>${formHTML(f.item, it, `${p}.${i}.`, root, { maxBy: f.maxBy, count: arr.length })}</div>`).join('')}</div>`;
      }
      return '';
    }).join('');
  }
  function findField(fields, path) {
    // 'slides.0.title1' → 필드 정의
    const ks = path.split('.');
    let fs = fields, f = null;
    for (let i = 0; i < ks.length; i++) { f = fs.find((x) => x.key === ks[i]); if (!f) return null; if (f.t === 'list') { fs = f.item; i++; } }
    return f;
  }
  function bindForm(form, g) {
    const tpl = TPL[g.tpl];
    $$('[data-p]', form).forEach((inp) => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'color' ? 'onchange' : 'oninput';
      inp[ev] = () => {
        const before = getP(g.v, inp.dataset.p);
        setP(g.v, inp.dataset.p, inp.value);
        save();
        if (inp.dataset.re || (inp.dataset.p === 'imgText' && !!before !== !!inp.value)) { const sy = scrollY; drawTab(); scrollTo(0, sy); return; }
        if (inp.dataset.max) { const c = inp.parentElement.querySelector('.cp-n'); if (c) c.outerHTML = cnt(inp.value, +inp.dataset.max, +inp.dataset.min); }
        if (inp.type === 'color') inp.nextElementSibling.textContent = inp.value;
        liveBS(g);
      };
    });
    $$('[data-ladd]', form).forEach((b) => (b.onclick = () => { const f = findField(tpl.fields, b.dataset.ladd); getP(g.v, b.dataset.ladd).push(defaults(f.item)); save(); const sy = scrollY; drawTab(); scrollTo(0, sy); }));
    $$('[data-ldel]', form).forEach((b) => (b.onclick = () => { const ks = b.dataset.ldel.split('.'); const i = +ks.pop(); getP(g.v, ks.join('.')).splice(i, 1); save(); const sy = scrollY; drawTab(); scrollTo(0, sy); }));
    bindImg(form, (p, im) => { setP(g.v, p, im); save(); const sy = scrollY; drawTab(); scrollTo(0, sy); });
  }

  // ---------------------------------------------------------------- 미리보기 탭
  async function loadComp(kw, force) {
    if (!kw) return;
    if (M.comp[kw] && !force) return;
    M.compBusy = true; drawTab();
    try {
      const r = await fetch('/api/copy/competitors?keyword=' + encodeURIComponent(kw));
      const j = r.status === 404 ? { error: '서버가 예전 버전이에요 (서버를 다시 시작해 주세요)' } : await r.json();
      if (j.error) throw new Error(j.error);
      M.comp[kw] = j.ads || [];
    } catch (e) { toast('경쟁 광고를 못 읽었어요: ' + e.message, 'err'); M.comp[kw] = M.comp[kw] || []; }
    M.compBusy = false;
    if (M.tab === 'pv') drawTab();
  }
  function drawPreview(box, g) {
    const d = D();
    const kw = g.keyword;
    const isPL = d.type === 'pl';
    const dev = isPL ? M.device : TPL[g.tpl].dev;
    const ads = isPL ? g.ads.filter((a) => a.on) : [];
    const ad = ads.find((a) => a.id === M.adId) || ads[0];
    const comp = (M.comp[kw] || []).map(compAd);
    if (kw && !M.comp[kw] && !M.compBusy && (isPL ? M.showComp : M.below)) setTimeout(() => loadComp(kw), 0);
    let inner;
    if (isPL) {
      const mine = myAd(g, ad);
      const list = M.showComp ? [...comp] : [];
      if (mine) list.splice(Math.min(M.rank - 1, list.length), 0, mine);
      inner = searchBar(kw) + plSection(list.slice(0, M.showComp ? 11 : 1), kw, dev);
    } else {
      inner = searchBar(kw) + bsBlock(g.tpl, g.v) + (M.below && comp.length ? plSection(comp.slice(0, 5), kw, dev) : '');
    }
    box.innerHTML = `<div class="mk-tools mk-pvbar">
        ${isPL ? `<div class="seg" id="mkDev"><button data-dev="pc" class="${dev === 'pc' ? 'on' : ''}">PC</button><button data-dev="mo" class="${dev === 'mo' ? 'on' : ''}">모바일</button></div>` : `<span class="muted">${dev === 'pc' ? 'PC' : '모바일'} 템플릿</span>`}
        ${isPL && ads.length > 1 ? `<select class="hsel" id="mkAdSel">${ads.map((a, i) => `<option value="${a.id}" ${a === ad ? 'selected' : ''}>소재 ${i + 1} · ${e2((a.titles[0] || '').slice(0, 16))}</option>`).join('')}</select>` : ''}
        ${isPL ? `<label>내 광고 순위 <select class="hsel" id="mkRank">${Array.from({ length: Math.min(comp.length + 1, 11) || 1 }, (_, i) => `<option ${i + 1 === M.rank ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
          <label class="cp-chk"><input type="checkbox" id="mkShowComp" ${M.showComp ? 'checked' : ''}> 경쟁 광고 함께</label>` : `<label class="cp-chk"><input type="checkbox" id="mkBelow" ${M.below ? 'checked' : ''}> 아래에 경쟁 파워링크</label>`}
        ${isPL ? `<label class="cp-chk"><input type="checkbox" id="mkMark" ${M.mark ? 'checked' : ''}> 내 광고 표시</label>` : ''}
        ${isPL ? '<button class="btn sm" id="mkCombo" title="반응형은 조합을, 확장 소재가 여러 개면 다른 것을 보여줘요">다른 조합</button>' : ''}
        <button class="btn sm" id="mkReComp" ${kw ? '' : 'disabled'}>경쟁 광고 다시 읽기</button>
        <span class="cp-sp"></span><button class="btn sm" id="mkPng">PNG 저장</button><button class="btn sm" id="mkHtml">HTML 저장</button>
      </div>
      <div class="muted" style="margin:0 0 8px">${!kw ? '위 <b>미리보기 키워드</b>를 넣으면 지금 네이버에 노출 중인 경쟁 광고(PC 기준)를 불러와 같이 보여줘요. ' : M.compBusy ? '경쟁 광고를 읽는 중… ' : comp.length ? `'${e2(kw)}' 경쟁 광고 ${comp.length}개 (PC 검색 결과 기준, 이미지는 빼고 보여줘요). ` : ''}모양은 실제 네이버 화면을 재서 맞춘 근사치예요.</div>
      <div class="mk-stage"><div class="nvm ${dev === 'mo' ? 'mo' : ''}" id="mkFrame">${inner}</div></div>`;
    const name = `목업_${d.name}_${g.name}_${dev === 'pc' ? 'PC' : '모바일'}`;
    $('#mkPng').onclick = async () => { try { await toPng($('#mkFrame'), name); } catch (e) { toast('PNG로 저장하지 못했어요: ' + e.message + ' (HTML 저장은 돼요)', 'err'); } };
    $('#mkHtml').onclick = () => toHtml($('#mkFrame'), name);
    $('#mkMark') && ($('#mkMark').onchange = (e) => { M.mark = e.target.checked; drawTab(); });
    $('#mkReComp').onclick = () => loadComp(kw, true);
    if (isPL) {
      $$('[data-dev]', box).forEach((b) => (b.onclick = () => { M.device = b.dataset.dev; drawTab(); }));
      $('#mkRank').onchange = (e) => { M.rank = +e.target.value; drawTab(); };
      $('#mkShowComp').onchange = (e) => { M.showComp = e.target.checked; drawTab(); };
      $('#mkCombo').onclick = () => { M.combo++; drawTab(); };
      $('#mkAdSel') && ($('#mkAdSel').onchange = (e) => { M.adId = e.target.value; drawTab(); });
    } else $('#mkBelow').onchange = (e) => { M.below = e.target.checked; drawTab(); };
  }

  // ---------------------------------------------------------------- 카피 생성기 → 목업
  function miniPreview(fmt, f, brand = {}, kw = '') {
    const site = brand.site || brand.name || '';
    const base = { site, url: brand.url || '', titles: [site ? `${site} ${kw}`.trim() : '(기본 제목)'], desc: '(기본 설명)', promo: null, sublinks: [], isubs: null, image: null };
    const pc = (inner) => `<div class="nvm mini">${inner}</div>`;
    const mo = (inner) => `<div class="nvm mini mo" style="width:390px;padding:6px 0">${inner}</div>`;
    switch (fmt) {
      case 'pl_ad': return pc(plItem({ ...base, titles: [f.title], desc: f.desc }, kw, 'pc'));
      case 'pl_addtitle': return pc(plItem({ ...base, titles: [...base.titles, f.text] }, kw, 'pc'));
      case 'pl_promo': return pc(plItem({ ...base, promo: { prefix: f.prefix && f.prefix !== '없음' ? f.prefix : '', text: f.text } }, kw, 'pc'));
      case 'pl_sublink': return pc(plItem({ ...base, sublinks: [f.text, '서브링크', '서브링크'] }, kw, 'pc'));
      case 'bs_pc_basic': return `<div class="nvm mini" style="width:720px;zoom:.72">${bsBlock('pc_light', { ...defaults(TPL.pc_light.fields), brandName: brand.name, title: f.title, desc1: f.desc1, desc2: f.desc2 })}</div>`;
      case 'bs_mo_basic': return mo(bsBlock('mo_light', { ...defaults(TPL.mo_light.fields), brandName: brand.name, sub: f.sub, main: f.main, desc1: f.desc1, desc2: f.desc2 }));
      case 'bs_mo_listing': return mo(bsBlock('mo_light', { ...defaults(TPL.mo_light.fields), brandName: brand.name, mainType: '리스팅', ltitle: f.title, ldesc1: f.desc1, ldesc2: f.desc2 }));
      case 'bs_pc_premium': return `<div class="nvm mini" style="width:720px;zoom:.72">${bsBlock('pc_premium', { ...defaults(TPL.pc_premium.fields), brandName: brand.name, slides: [{ title1: f.title, desc1: f.desc, button: f.button }] })}</div>`;
      case 'bs_mo_story': return mo(bsBlock('mo_story', { ...defaults(TPL.mo_story.fields), brandName: brand.name, slides: [{ title1: f.title, desc1: f.desc, button: f.button }] }));
      case 'bs_2gu': return `<div class="nvm mini" style="width:720px;zoom:.72"><div class="bs">${pcSub({ subType: '2구 섬네일', subTitle: '', sub2: [{ sub: f.sub, title: f.title, desc1: f.desc1, desc2: f.desc2 }, {}] })}</div></div>`;
      case 'bs_news': return `<div class="nvm mini" style="width:720px;zoom:.72"><div class="bs">${bsHome({ brandName: brand.name, newsPrefix: f.prefix, newsText: f.pc }, 'pc')}</div></div>` + mo(`<div class="bs">${bsHome({ brandName: brand.name, newsPrefix: f.prefix, newsText: f.mo }, 'mo')}</div>`);
      case 'bs_slogan': return `<div class="nvm mini" style="width:720px;zoom:.72"><div class="bs">${bsHome({ brandName: brand.name, slogan: f.pc }, 'pc')}</div></div>` + mo(`<div class="bs">${bsHome({ brandName: brand.name, slogan: f.mo }, 'mo')}</div>`);
      case 'bs_sublink': return `<div class="nvm mini"><div class="bs-sl" style="margin:0"><span>${e2(f.text)}</span></div></div>`;
      case 'bs_label': return mo(`<div class="bs"><div class="mo-3"><div>${thumb(null, '', '240×240')}<div class="tx">${e2(f.text)}</div></div><div></div><div></div></div></div>`);
      default: return '';
    }
  }
  const BS_MAP = { bs_pc_basic: 'pc_light', bs_sublink: 'pc_light', bs_2gu: 'pc_light', bs_mo_basic: 'mo_light', bs_mo_listing: 'mo_light', bs_label: 'mo_light', bs_pc_premium: 'pc_premium', bs_mo_story: 'mo_story' };
  function addFromCopy(items, brand = {}, kw = '') {
    if (!items.length) return { ok: false, msg: '넣을 카피가 없어요' };
    const type = S.FORMATS[items[0].format].ch;
    if (items.some((x) => S.FORMATS[x.format].ch !== type)) return { ok: false, msg: '파워링크와 브랜드검색 카피는 따로 넣어주세요' };
    const want0 = type === 'bs' ? BS_MAP[items[0].format] || 'pc_light' : null;
    let d = D() && D().type === type ? D() : null;
    if (!d) { d = newCampaign(type, `AI 카피 · ${CH[type]}`); if (type === 'bs') d.groups[0] = newGroup('bs', `${kw ? ' · ' + kw : ''}`, want0); d.groups[0].name = type === 'pl' ? kw || 'AI 카피' : d.groups[0].name; d.groups[0].keyword = kw; H.cur = d; }
    let g = d.groups.find((x) => x.id === M.group) || d.groups[0];
    if (!g) { g = newGroup(type, kw || 'AI 카피'); d.groups.push(g); }
    if (!g.keyword && kw) g.keyword = kw;
    let n = 0, skip = 0;
    if (type === 'pl') {
      const site = brand.site || brand.name || '';
      const links = [];
      for (const it of items) {
        if (it.format === 'pl_ad') { const a = newAd(g.ads[0]?.site || site); a.dispUrl = g.ads[0]?.dispUrl || brand.url || ''; a.titles = [it.f.title]; a.descs = [it.f.desc]; g.ads.push(a); n++; }
        if (it.format === 'pl_addtitle' || it.format === 'pl_promo') { const kind = it.format === 'pl_promo' ? 'promo' : 'addtitle'; if (g.ext.filter((x) => x.kind === kind).length >= EXT[kind].limit) { skip++; continue; } const x = newExt(kind); x.text = it.f.text; if (kind === 'promo') x.prefix = it.f.prefix || '없음'; g.ext.push(x); n++; }
        if (it.format === 'pl_sublink') links.push(it.f.text);
      }
      for (let i = 0; i < links.length; i += 4) {
        if (g.ext.filter((x) => x.kind === 'sublink').length >= 2) { skip += links.length - i; break; }
        const x = newExt('sublink'); x.links = links.slice(i, i + 4).map((name) => ({ name, img: null })); while (x.links.length < 3) x.links.push({ name: '', img: null });
        g.ext.push(x); n += Math.min(4, links.length - i);
      }
      if (!g.ads.length) { g.ads.push(newAd(site)); }
    } else {
      const want = BS_MAP[items[0].format];
      if (want && g.tpl !== want) {
        // 다른 템플릿 그룹이면 새 광고그룹을 만들어서 넣음
        g = d.groups.find((x) => x.tpl === want) || (() => { const ng = newGroup('bs', `${TPL[want].name}${kw ? ' · ' + kw : ''}`, want); ng.keyword = kw; d.groups.push(ng); return ng; })();
      }
      const v = g.v;
      if (!v.brandName && brand.name) v.brandName = String(brand.name).slice(0, 7);
      const done = new Set();
      for (const it of items) {
        const f = it.f, key = it.format;
        const once = (fn) => { if (done.has(key)) { skip++; return; } done.add(key); fn(); n++; };
        if (key === 'bs_pc_basic' && g.tpl === 'pc_light') once(() => Object.assign(v, { title: f.title, desc1: f.desc1, desc2: f.desc2 }));
        if (key === 'bs_mo_basic' && g.tpl === 'mo_light') once(() => Object.assign(v, { mainType: '베이직', sub: f.sub, main: f.main, desc1: f.desc1, desc2: f.desc2 }));
        if (key === 'bs_mo_listing' && g.tpl === 'mo_light') once(() => Object.assign(v, { mainType: '리스팅', ltitle: f.title, ldesc1: f.desc1, ldesc2: f.desc2 }));
        if ((key === 'bs_pc_premium' && g.tpl === 'pc_premium') || (key === 'bs_mo_story' && g.tpl === 'mo_story')) { const s = v.slides.find((x) => !x.title1) || (v.slides.length < 5 ? (v.slides.push(defaults(TPL[g.tpl].fields.find((x) => x.key === 'slides').item)), v.slides[v.slides.length - 1]) : null); if (s) { Object.assign(s, { title1: f.title, desc1: f.desc, button: f.button }); n++; } else skip++; }
        if (key === 'bs_2gu' && g.tpl === 'pc_light') { v.subType = '2구 섬네일'; v.sub2 = v.sub2?.length ? v.sub2 : defaults(TPL.pc_light.fields).sub2; const s = v.sub2.find((x) => !x.title); if (s) { Object.assign(s, { sub: f.sub, title: f.title, desc1: f.desc1, desc2: f.desc2 }); n++; } else skip++; }
        if (key === 'bs_sublink' && g.tpl === 'pc_light') { const s = v.sublinks.find((x) => !x.text); if (s) { s.text = f.text; n++; } else if (v.sublinks.length < 4) { v.sublinks.push({ text: f.text }); n++; } else skip++; }
        if (key === 'bs_label' && g.tpl === 'mo_light') { const s = (v.thumbs3 || []).find((x) => !x.text); if (s) { s.text = f.text; n++; } else skip++; }
        if (key === 'bs_news') once(() => Object.assign(v, { newsPrefix: f.prefix, newsText: TPL[g.tpl].dev === 'pc' ? f.pc : f.mo }));
        if (key === 'bs_slogan') once(() => (v.slogan = TPL[g.tpl].dev === 'pc' ? f.pc : f.mo));
      }
    }
    M.group = g.id; M.tab = type === 'pl' ? 'ads' : 'bs';
    save(true, d);
    draw();
    return { ok: n > 0, msg: n ? `광고 목업 › ${d.name} › ${g.name}에 ${n}개 넣었어요${skip ? ` (자리가 없어 ${skip}개는 뺐어요)` : ''}. 왼쪽 메뉴 '광고 목업'에서 볼 수 있어요.` : '넣을 자리가 없었어요' };
  }

  // ---------------------------------------------------------------- 보이기 · 숨기기
  window.__RESET_mock = () => {
    if (!H.cur) return '초기화했어요';
    const name = H.cur.name;
    H.cur = null; M.group = null; M.sel = new Set(); localStorage.removeItem('mockCur');
    draw(); scrollTo(0, 0);
    return `'${name}' 캠페인은 저장된 채로 닫고 초기화했어요 (왼쪽 캠페인 목록에 있어요)`;
  };
  function showMock(on) {
    if (on) { $('#aiView')?.classList.add('hidden'); window.__hideDup?.(); window.__hideBulk?.(); window.__hideCopy?.(); }
    $('#mockView').classList.toggle('hidden', !on);
    if (on) {
      $('#main').classList.add('hidden'); $('#banners').classList.add('hidden'); $('#tabs').classList.add('hidden');
      history.replaceState(null, '', location.pathname + location.search + '#mock');
      if (!H.list.length) loadList();
      draw();
    }
  }
  window.showMock = showMock;
  window.__hideMock = () => {
    if ($('#mockView').classList.contains('hidden')) return;
    $('#mockView').classList.add('hidden');
    $('#main').classList.remove('hidden'); $('#banners').classList.remove('hidden');
    try { $('#tabs').classList.toggle('hidden', !STATE); } catch {}
    if (location.hash === '#mock') history.replaceState(null, '', location.pathname + location.search);
  };
  const watch = new MutationObserver(() => { if (!$('#mockView').classList.contains('hidden') && ['aiView', 'dupView', 'bulkView', 'copyView', 'main'].some((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); })) $('#mockView').classList.add('hidden'); });
  window.__MOCK = { addFromCopy, miniPreview, TPL, EXT, checkBS, checkAd, plItem, bsBlock, MOCK_CSS };

  mount();
  ['aiView', 'dupView', 'bulkView', 'copyView', 'main'].forEach((id) => { const el = document.getElementById(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  loadList().then(() => { const last = localStorage.getItem('mockCur'); if (last && H.list.some((m) => m.id === last)) openDoc(last); else draw(); });
  if (location.hash === '#mock') setTimeout(() => (window.__LAYOUT?.go ? window.__LAYOUT.go('mock') : showMock(true)), 0);
})();
