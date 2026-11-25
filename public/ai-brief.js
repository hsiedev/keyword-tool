// One brief contract shared by the UI, server, and isolated tests.
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiBrief = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TOPICS = {
    card: { name:'카드·금융', desc:'카드, 계좌, 금융 서비스', productHint:'예: 카드사명 + 체크카드 상품명', conversionHint:'예: 신청서가 접수된 시점', goals:['submit','consult'], opts:[['첫 발급 · 자격 확인','처음 만드는 사람이 조건과 준비물을 알아봄','어떤 조건을 충족해야 신청할 수 있는가'],['온라인 신청 준비','방문하지 않고 신청하려는 사람이 절차를 알아봄','휴대폰으로 어디에서 어떻게 신청하는가'],['혜택 비교','주로 쓰는 곳의 혜택으로 카드를 비교함','혜택을 받는 조건과 제한은 무엇인가']] },
    insurance: { name:'보험', desc:'보장, 조건, 가입, 상담', productHint:'예: 보험사명 + 상품명', conversionHint:'예: 상담 요청 접수 또는 계약 완료', goals:['consult','submit'], opts:[['보장 공백 점검','기존 보험에서 빠진 보장을 확인하려는 상황','어떤 위험을 보장하고 빠지는 조건은 무엇인가'],['처음 가입 비교','첫 가입 전에 보장·보험료 차이를 확인함','어떤 기준으로 비교하고 상담을 시작하는가'],['상담 전 확인','상담 전에 가입 요건·준비 사항을 살펴봄','가입 자격과 상담에 필요한 정보는 무엇인가']] },
    shop: { name:'쇼핑·상품', desc:'구매, 옵션, 사용 상황', productHint:'예: 브랜드명 + 모델명', conversionHint:'예: 결제가 완료된 시점', goals:['buy','consult'], opts:[['급히 교체','사용 중인 물건이 고장 나 대체품을 찾음','호환 규격과 배송 조건은 무엇인가'],['옵션 비교','사용 목적에 맞는 규격이나 구성을 비교함','어떤 규격과 옵션이 내 상황에 맞는가'],['첫 구매','처음 써 보는 상품군이라 필요한 구성을 찾아봄','구매 전에 어떤 기준과 구성품을 확인해야 하는가']] },
    local: { name:'지역·예약', desc:'방문, 일정, 예약', productHint:'예: 지역명 + 업체명 + 예약 서비스', conversionHint:'예: 예약번호가 발급된 시점', goals:['visit','consult'], opts:[['오늘 예약','당장 가까운 곳에서 가능한 일정을 찾음','내 지역과 방문 가능 시간이 맞는가'],['비용 비교','방문 전 가격과 서비스 범위를 비교함','표시 가격에 포함되는 서비스는 무엇인가'],['첫 방문','처음 가기 전에 위치와 이용 방법을 찾음','가는 방법과 예약 방법은 무엇인가']] },
    custom: { name:'직접 입력', desc:'분류에 없는 주제', productHint:'예: 브랜드명 + 상품 또는 서비스명', conversionHint:'예: 사용자가 마쳐야 할 행동', goals:[], opts:[['조건부터 확인','우선 내가 이용할 수 있는지 알아봄','자격·준비물은 무엇인가'],['대안 비교','몇 가지 대안 중 상황에 맞는 것을 고름','어떤 기능·가격·제한이 내 상황에 맞는가'],['이용 준비','이미 관심이 있고 구체적인 방법을 확인함','어디에서 어떤 절차로 이용하는가']] },
  };
  const GOALS = {submit:'신청 제출',visit:'예약 완료',buy:'구매 완료',consult:'상담 신청',explore:'미정 · 탐색용',custom:'직접 입력'};
  const TAILS = {long:'롱테일 우선',balanced:'균형',short:'대표어 우선'};
  const TAIL_LABELS = {short:'숏테일', long:'롱테일'};
  const INTENTS = ['직접 행동','혜택·비교','정보 탐색','일반 관심'];
  const SOURCE = {pick:'선택한 검색 상황', direct:'직접 지정', ai:'AI 제안 · 가설'};
  const limits = {customTopic:80,product:150,customGoal:120,conversion:140,official:350,landing:350,claims:360,exclusions:240,refs:180};
  const value = (v,n=500) => typeof v === 'string' ? v.slice(0,n) : '';
  const text = (v,n) => value(v,n).trim();
  const clampStep = (n) => Number.isInteger(n) ? Math.max(0, Math.min(4,n)) : 0;
  const word = (v,n=30) => typeof v === 'string' ? v.normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]+/g,'').slice(0,n) : '';
  const key = v => word(v,160).toLowerCase();
  const words = (items, count, min=2) => { const seen = new Set(), out = []; for (const v of Array.isArray(items) ? items : []) { const k = key(v); if (k.length < min || k.length > 30 || seen.has(k)) continue; seen.add(k); out.push(word(v)); if (out.length >= count) break; } return out; };
  const lines = (v,limit=20) => [...new Set(value(v).split(/[,\n]+/).map(x=>x.trim()).filter(Boolean))].slice(0,limit);
  const emptyPerson = () => ({who:'',why:'',need:''});
  const blank = () => ({v:1,step:0,max:0,topic:'',customTopic:'',product:'',goal:'',customGoal:'',conversion:'',official:'',landing:'',showLinks:false,picked:{},personaMode:'pick',people:[emptyPerson(),emptyPerson()],second:false,claims:'',exclusions:'',refs:'',mix:'long'});
  function normalize(raw) {
    const s = blank();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw.v != null && raw.v !== 1)) return s;
    for (const [k,n] of Object.entries(limits)) s[k]=value(raw[k],n);
    s.step=clampStep(raw.step); s.max=Math.max(s.step,clampStep(raw.max));
    s.topic=Object.hasOwn(TOPICS,raw.topic) ? raw.topic : '';
    s.goal=Object.hasOwn(GOALS,raw.goal) ? raw.goal : '';
    s.mix=Object.hasOwn(TAILS,raw.mix) ? raw.mix : 'long';
    s.personaMode=Object.hasOwn(SOURCE,raw.personaMode) ? raw.personaMode : 'pick';
    s.showLinks=raw.showLinks===true; s.second=raw.second===true;
    for (const [k,x] of Object.entries(TOPICS)) {
      const p = raw.picked?.[k];
      if (Array.isArray(p)) s.picked[k]=[...new Set(p.filter(i=>Number.isInteger(i)&&i>=0&&i<x.opts.length))].slice(0,2);
    }
    const input = Array.isArray(raw.people) ? raw.people : [];
    s.people=s.people.map((_,i)=>({who:value(input[i]?.who,90),why:value(input[i]?.why,160),need:value(input[i]?.need,140)}));
    return s;
  }
  const topicName = s => s.topic==='custom' ? text(s.customTopic,80) : TOPICS[s.topic]?.name || '';
  const goalName = s => s.goal==='custom' ? text(s.customGoal,120) : GOALS[s.goal] || '';
  const scenarios = s => (TOPICS[s.topic] || TOPICS.custom).opts;
  const picks = s => Array.isArray(s.picked?.[s.topic]) ? s.picked[s.topic] : [];
  function people(s) {
    if (s.personaMode==='ai') return [];
    if (s.personaMode==='direct') return s.people.slice(0,s.second?2:1).filter(x=>x.why.trim()).map((x,i)=>({id:'P'+(i+1),name:x.who.trim() || '타깃 '+(i+1),situation:x.why.trim(),need:x.need.trim(),source:SOURCE.direct}));
    return picks(s).filter(i=>scenarios(s)[i]).map((j,i)=>{const [name,situation,need]=scenarios(s)[j];return {id:'P'+(i+1),name,situation,need,source:SOURCE.pick};});
  }
  const urlOk = v => { if (!v.trim()) return true; if (!/^https?:\/\//i.test(v.trim())) return false; try {const u=new URL(v.trim());return !!u.hostname&&!u.username&&!u.password;}catch{return false;} };
  function problem(s, step) {
    if (step===0 && !topicName(s)) return ['주제를 선택하거나 직접 입력해 주세요.',s.topic==='custom'?'customTopic':null];
    if (step===1) {
      if (!s.product.trim()) return ['상품·서비스명을 적어 주세요.','product'];
      if (!goalName(s)) return ['목표 행동을 선택해 주세요. 모르면 ‘미정 · 탐색용’을 고르세요.',s.goal==='custom'?'customGoal':null];
      if (!urlOk(s.official)) return ['공식 상품 URL은 http:// 또는 https:// 주소로 입력해 주세요.','official'];
      if (!urlOk(s.landing)) return ['실제 광고 랜딩 URL은 http:// 또는 https:// 주소로 입력해 주세요.','landing'];
    }
    if (step===2) {
      if (s.personaMode==='pick' && !picks(s).length) return ['검색 상황을 고르거나 ‘모름 · AI 제안’을 선택해 주세요.',null];
      if (s.personaMode==='direct' && !s.people[0].why.trim()) return ['첫 타깃이 무엇 때문에 검색하는지 적어 주세요.','p0-why'];
      if (s.personaMode==='direct' && s.second && !s.people[1].why.trim()) return ['두 번째 타깃의 검색 상황을 적거나 두 번째 입력을 접어 주세요.','p1-why'];
    }
    return null;
  }
  function firstProblem(s) { for (const i of [0,1,2]) {const p=problem(s,i);if(p)return {step:i,message:p[0],field:p[1]};} return null; }
  const hasContent = s => !!(s && (s.topic || s.product || s.claims || s.exclusions || s.refs));
  function payload(raw) {
    const s=normalize(raw);
    return {platform:'네이버 검색광고 파워링크',topic:topicName(s),product:s.product.trim(),goal:goalName(s),conversion:s.conversion.trim()||'미정',
      officialUrl:urlOk(s.official)&&s.official.trim()||null,landingUrl:urlOk(s.landing)&&s.landing.trim()||null,
      claims:s.claims.trim(),excludeIntents:lines(s.exclusions),refs:words(lines(s.refs),20),personas:people(s),personaMode:SOURCE[s.personaMode],mix:s.mix};
  }
  function summary(raw) {
    const b=payload(raw);
    return [`주제: ${b.topic}`,`상품·광고주: ${b.product}`,`목표 행동: ${b.goal} · 완료 기준: ${b.conversion}`,
      b.officialUrl?`공식 상품 주소(미확인): ${b.officialUrl}`:'',b.landingUrl?`광고 랜딩 주소(미확인): ${b.landingUrl}`:'',
      ...b.personas.map(p=>`타깃 ${p.id} ${p.name} (${p.source}): ${p.situation}${p.need ? ` / 확인 조건: ${p.need}`:''}`),
      b.personas.length?'':`타깃: ${b.personaMode}`,b.claims?`사용자 설명(공식 근거와 구분): ${b.claims}`:'',
      b.excludeIntents.length?`제외 검토: ${b.excludeIntents.join(', ')}`:'',`탐색 방향: ${TAILS[b.mix]}`].filter(Boolean).join('\n');
  }
  const INSTRUCTIONS = [
    '상품·랜딩 적합성 → 목표 행동과의 거리 → 관측된 수요 순으로 검토한다. 공식 근거, 사용자 설명, 가설, 미확인을 구별하며 미확인 혜택·가격·시간·자격을 단정하지 않는다.',
    '페르소나는 누가, 어떤 이유로 지금 검색하는지, 무엇을 확인해야 다음 행동을 하는지로 정의한다. 타깃 미정이면 최대 두 가지 검색 상황을 AI 가설로 제안한다.',
    '숏테일은 탐색용 대표 시드다. 롱테일은 시드와 연결되면서 기능·상황·조건·비교·행동이 구체화된 표현이다. 글자 수나 추정 검색량으로 분류하지 않는다.',
    '페르소나와 검색 의도별로 네이버 키워드 도구·자동완성·관련검색에 나온 적합 표현을 먼저 고르고 빈 의도만 새 표현으로 보완한다. 참고 키워드의 조합만 반복하거나 목표 개수를 억지로 채우지 않는다.',
    '공백 없는 키워드와 부모 시드, 적용 페르소나, 검색 의도, 이유를 남긴다. 의미가 같은 후보는 줄이고 여러 타깃과 겹치는 동일 후보는 한 행에 연결한다.',
    '검색량과 출처는 앱이 붙인다. 소량·미조회 롱테일도 검토 목록에 남긴다. PC·모바일 검색 결과와 실제 랜딩을 확인하기 전에는 집행 추천으로 표시하지 않는다.',
  ];
  const compose = s => `네이버 검색광고 키워드 발굴\n\n[브리프]\n${summary(s)}${payload(s).refs.length?`\n참고 키워드: ${payload(s).refs.join(', ')}`:''}\n\n[발굴 기준]\n${INSTRUCTIONS.map((x,i)=>`${i+1}. ${x}`).join('\n')}`;
  function volumeState(vol, cutoff=0) {
    if (!vol) return '미조회';
    if (vol.error) return '조회 오류';
    if (vol.notFound) return '데이터 없음';
    const pc=vol.pc, mo=vol.mo;
    const known=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
    if ((!known(pc)&&!vol.pcLow)||(!known(mo)&&!vol.moLow)) return '일부 미확인';
    const lb = (vol.pcLow?0:pc)+(vol.moLow?0:mo);
    const hb = lb+9*(Number(!!vol.pcLow)+Number(!!vol.moLow));
    if (cutoff>0&&hb<cutoff) return '기준 미달';
    if (cutoff>0&&lb<cutoff) return '소량·판정 보류';
    return vol.pcLow||vol.moLow ? '소량 표기 있음' : '조회됨';
  }
  const needsVolumeReview = (vol,cutoff) => !['조회됨','소량 표기 있음'].includes(volumeState(vol,cutoff)) || !!(vol?.pcLow||vol?.moLow);
  return {TOPICS,GOALS,TAILS,TAIL_LABELS,INTENTS,SOURCE,INSTRUCTIONS,blank,normalize,topicName,goalName,scenarios,picks,people,problem,firstProblem,hasContent,payload,summary,compose,lines,word,key,words,volumeState,needsVolumeReview};
});
