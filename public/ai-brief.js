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
  const examples = ['체크카드 신규 발급','운전자보험','치과 임플란트','B2B 협업툴 도입','반려식물 구독'];
  const ex = (id,label,why,placeholder,when) => ({id,label,why,placeholder,when});
  const routes = {
    card: { ...TOPICS.card, name:'카드', keywords:/카드|캐시백|카드한도/i, productLabel:'어떤 카드 상품인가요?', goalLabel:'카드 검색을 어떤 행동으로 연결할까요?', scenarioLabel:'고객은 언제 카드를 알아보나요?', goals:[['submit','신청서 접수'],['compare','혜택·조건 확인'],['consult','상담 신청']], exclusionsHint:'예: 대출·현금서비스, 기존 고객 업무 제외',
      extra:[ex('eligibility','신청할 수 있는 자격이나 연령 조건이 있나요?','신청서 접수가 목표라 자격이 중요해요.','공식 페이지에서 확인한 자격·서류만 적기',a=>a.goal==='submit'),ex('usage','고객이 주로 결제하는 곳이나 비교하는 혜택은 무엇인가요?','혜택을 비교하는 상황이에요.','예: 교통·온라인쇼핑 (확인하지 못한 혜택은 미정)',a=>a.goal==='compare'||hasScenario(a,'혜택 비교'))] },
    insurance: { ...TOPICS.insurance, keywords:/보험|실손|설계사|특약/i, productLabel:'어떤 보험 상품인가요?', goalLabel:'상담·견적·가입 중 어디까지 연결할까요?', scenarioLabel:'어떤 일이 보험을 알아보는 계기가 되나요?', goals:[['consult','상담 신청'],['quote','보험료 확인'],['submit','가입 신청서 접수']], exclusionsHint:'예: 보험금 청구, 지급 보장 표현 제외',
      extra:[ex('channel','상담은 어떤 방식으로 받나요?','상담 신청이 목표라 신청 경로가 중요해요.','전화·방문·온라인 중 실제 가능한 경로',a=>a.goal==='consult'),ex('coverage','상품이 실제로 보장하는 범위와 제외 조건은 무엇인가요?','보장이나 보험료를 비교하는 검색이에요.','공식 상품 정보·약관에서 확인한 범위만 적기',a=>a.goal==='quote'||hasScenario(a,'보장 공백 점검')||hasScenario(a,'처음 가입 비교')),ex('insured','누구를 위한 보험인가요?','가입 전 비교 상황을 선택했어요.','예: 본인·부모·자녀 중 아는 대상만',a=>a.goal==='submit'||hasScenario(a,'처음 가입 비교'))] },
    hospital: { name:'병원·의료', keywords:/병원|의원|치과|한의원|피부과|성형|진료|검진|시술|임플란트|라식|클리닉|수술/i, productLabel:'어느 병원의 어떤 진료인가요?', productHint:'예: 병원명과 진료과 또는 시술명', goalLabel:'예약·상담·전화 중 무엇이 목표인가요?', conversionHint:'예: 온라인 예약이 접수된 시점', scenarioLabel:'환자는 방문 전에 무엇을 알아보나요?', goals:[['visit','진료 예약 완료'],['consult','상담 신청'],['call','전화 문의']], opts:[['통증·증상 발생','증상이 생겨 방문할 병원을 찾음','어떤 진료를 받을 수 있는가'],['검진·정기 관리','정기 검진 일정과 위치를 찾음','예약 가능한 일정과 검진 항목이 맞는가'],['시술 비용 비교','방문 전 비용과 시술 범위를 비교함','실제 비용에 무엇이 포함되는가'],['첫 방문 준비','위치와 예약 방법을 찾음','위치와 예약 방법은 무엇인가']], exclusionsHint:'예: 효과 보장, 과장된 후기 표현 제외',
      extra:[ex('area','진료 지역은 어디인가요?','예약·전화에서는 방문 가능한 지역이 중요해요.','예: 동네·역 이름 (미정이면 비워도 돼요)',a=>['visit','call'].includes(a.goal)),ex('scope','실제로 제공하는 진료 범위는 어디까지인가요?','진료와 맞지 않는 검색을 피하기 위한 질문이에요.','실제로 제공하는 진료과·시술만 적기',()=>true),ex('medicalLimits','비용·효과와 관련해 사용하지 않을 표현이 있나요?','비용이나 증상 검색을 골랐어요.','예: 효과·치료 결과 보장 표현 제외',a=>hasScenario(a,'통증·증상 발생')||hasScenario(a,'시술 비용 비교'))] },
    b2b: { name:'B2B·기업 서비스', keywords:/b2b|솔루션|saas|\berp\b|\bcrm\b|협업툴|기업용|공급업체/i, productLabel:'어떤 기업용 서비스인가요?',productHint:'예: 서비스명과 실제 제공 기능',goalLabel:'데모·체험·견적 중 어디로 연결할까요?',conversionHint:'예: 데모 요청 폼이 접수된 시점',scenarioLabel:'회사에서 무슨 일이 생겨 찾아보나요?',goals:[['demo','데모·문의 접수'],['trial','체험 시작'],['quote','견적 요청'],['consult','상담 신청']],opts:[['기존 방식의 한계','수작업이나 기존 툴이 한계여서 대안을 찾음','어떤 업무를 대체할 수 있는가'],['도입 전 비교','기능과 비용 차이를 비교함','팀에 맞는 기능과 비용은 무엇인가'],['보고·결재 준비','내부 결재 자료를 찾음','도입 근거와 평가 기준은 무엇인가'],['규정·보안 확인','보안·계약 조건을 알아봄','실제 보안 조건과 증빙은 무엇인가']],exclusionsHint:'예: 구직·무료 템플릿 검색 제외',
      extra:[ex('buyer','검색하는 사람은 실무자, 관리자, 구매 담당자 중 누구인가요?','같은 서비스도 검색하는 역할에 따라 질문이 달라요.','예: 현업 팀장 또는 구매 담당자',()=>true),ex('companySize','주로 어느 규모의 기업이 대상인가요?','데모·견적 요청에서 대상 기업 조건이 중요해요.','확인된 규모만 적기',a=>['demo','quote'].includes(a.goal)),ex('security','확인된 보안·인증 요건이 있나요?','규정·보안을 알아보는 상황이에요.','실제 제공 기능·인증만 적기',a=>hasScenario(a,'규정·보안 확인'))] },
    shop: { ...TOPICS.shop, keywords:/쇼핑몰|이커머스|온라인쇼핑|직구|상품구매/i, productLabel:'어떤 상품과 옵션이 있나요?',goalLabel:'구매까지 어느 행동을 늘리고 싶나요?',scenarioLabel:'구매 전 어떤 이유로 검색하나요?',goals:[['buy','결제 완료'],['cart','장바구니 추가'],['consult','상품 문의']],exclusionsHint:'예: 중고·부품·수리 제외',extra:[ex('options','구매 가능한 옵션과 배송 조건은 무엇인가요?','상품 비교나 구매가 목표예요.','실제 제공 옵션과 배송 가능 범위만 적기',a=>a.goal==='buy'||hasScenario(a,'옵션 비교'))] },
    local: { ...TOPICS.local, keywords:/미용실|네일샵|식당|공방|출장수리|세차장|숙소/i, productLabel:'어느 지역의 어떤 서비스인가요?',goalLabel:'방문·예약·문의 중 무엇이 목표인가요?',scenarioLabel:'고객은 왜 근처 서비스를 검색하나요?',goals:[['visit','예약 완료'],['call','전화 문의'],['consult','상담 신청']],exclusionsHint:'예: 서비스가 없는 지역·시간대 제외',extra:[ex('region','방문 가능한 지역과 시간은 어떻게 되나요?','지역 서비스는 실제 이용 범위가 중요해요.','확인된 지역과 운영 시간만 적기',()=>true)] },
    generic: { ...TOPICS.custom, name:'일반', productLabel:'어떤 상품·서비스인가요?',goalLabel:'검색을 어떤 행동으로 연결하고 싶나요?',scenarioLabel:'언제, 왜 이 주제를 검색하나요?',goals:[['submit','신청 제출'],['buy','구매 완료'],['consult','문의·상담'],['visit','예약 완료']],exclusionsHint:'예: 뜻이 비슷하지만 무관한 검색 제외',extra:[] },
  };
  function hasScenario(a,name) { return a.scenarios.some(i=>routes[a.route]?.opts[i]?.[0]===name); }
  const routeId = v => Object.hasOwn(routes,v) ? v : '';
  const topicText = v => value(v,80).normalize('NFKC').replace(/\s+/g,' ');
  function route(v) {
    const t=topicText(v).trim().replace(/\s+/g,'');
    if(!t) return {route:'',kind:'empty',matches:[]};
    const matches=Object.keys(routes).filter(k=>routes[k].keywords?.test(t));
    return matches.length>1?{route:'',kind:'ambiguous',matches}:matches.length===1?{route:matches[0],kind:'auto',matches}:{route:'generic',kind:'unknown',matches};
  }
  const adGoal = (id,v) => v==='explore'||v==='custom'||routes[id]?.goals.some(([k])=>k===v) ? v : '';
  const answer = x => x?.status==='unknown'||x?.status==='skip' ? {status:x.status,value:''} : {status:'given',value:value(x?.value,260)};
  function questions(input) { return [...new Set((Array.isArray(input)?input:[]).slice(0,25).filter(x=>typeof x==='string').map(x=>x.trim().replace(/\s+/g,' ')).filter(x=>x&&x.length<=110))].slice(0,3); }
  const draftKey = (t,r) => JSON.stringify([t.trim().toLowerCase(),r]);
  function adFields(raw,id) {
    const texts={};
    for(const {id:key} of routes[id]?.extra||[]) if(raw.fields?.[key]) texts[key]=answer(raw.fields[key]);
    const q=[];
    for(const item of (Array.isArray(raw.questions)?raw.questions:[]).slice(0,3)) {
      const question = value(item?.question,110);
      q.push({question,answer:answer(item?.answer)});
    }
    return {fields:texts,questions:q,productUnknown:raw.productUnknown===true,goal:adGoal(id,raw.goal),scenarios:Array.isArray(raw.scenarios)?[...new Set(raw.scenarios.filter(x=>Number.isInteger(x)&&x>=0&&x<(routes[id]?.opts.length||0)))].slice(0,2):[]};
  }
  function adState(s,raw) {
    const t=topicText(raw.text), chosen=raw.manual===true?routeId(raw.route):'', id=t.trim()?(chosen||route(t).route):'';
    const drafts=[];
    for(const d of (Array.isArray(raw.drafts)?raw.drafts:[]).slice(-16)) {
      if(!d||!d.adaptive||d.adaptive.drafts||!routeId(d.adaptive.route)||!topicText(d.adaptive.text).trim()) continue;
      const clean=normalize(d);
      if(clean.adaptive?.route&&draftKey(clean.adaptive.text,clean.adaptive.route)!==draftKey(t,id)) drafts.push(clean);
    }
    s.adaptive={text:t,route:id,manual:Boolean(chosen&&id),...adFields(raw,id),...(drafts.length?{drafts}:{})};
    return s;
  }
  const blankAdaptive = () => adState(blank(),{});
  function selectTopic(raw,t,manualRoute) {
    const s=normalize(raw), cur=s.adaptive||blankAdaptive().adaptive;
    t=topicText(t);
    const sameText=cur.text.trim().toLowerCase()===t.trim().toLowerCase();
    const manual=(routeId(manualRoute)||(sameText&&cur.manual?cur.route:''));
    const id=t.trim()?(manual||route(t).route):'';
    if(sameText&&id===cur.route) return {...s,adaptive:{...cur,text:t,route:id,manual:!!manual}};
    const drafts=(cur.drafts||[]).filter(d=>draftKey(d.adaptive.text,d.adaptive.route)!==draftKey(cur.text,cur.route));
    if(cur.route&&cur.text.trim()&&draftUsed(s)) { const {drafts:_,...own}=cur; drafts.push({...s,adaptive:own}); }
    const old=drafts.find(d=>draftKey(d.adaptive.text,d.adaptive.route)===draftKey(t,id));
    const next=old||blankAdaptive();
    return {...next,step:0,max:sameText&&old?next.max:0,adaptive:{...next.adaptive,text:t,route:id,manual:!!manual,drafts:drafts.filter(d=>d!==old).slice(-16)}};
  }
  const extras = s => { const a=s?.adaptive; return a?.route?routes[a.route].extra.filter(q=>q.when(s.personaMode==='pick'?a:{...a,scenarios:[]})):[]; };
  const draftUsed = d => d.product.trim()||d.adaptive.productUnknown||d.adaptive.goal||d.adaptive.scenarios.length||d.claims||d.exclusions||d.refs||d.official||d.landing||d.conversion||d.people.some(p=>p.who||p.why||p.need)||Object.keys(d.adaptive.fields).length||d.adaptive.questions.length;
  const draftCount = s => s?.adaptive?.drafts?.filter(draftUsed).length||0;
  const adaptive = {routes,examples,route,selectTopic,extras,draftCount,questions};
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
    return raw.adaptive && typeof raw.adaptive==='object' && !Array.isArray(raw.adaptive) ? adState(s,raw.adaptive) : s;
  }
  const topicName = s => s.adaptive ? text(s.adaptive.text,80) : s.topic==='custom' ? text(s.customTopic,80) : TOPICS[s.topic]?.name || '';
  const goalName = s => { const a=s.adaptive,k=a?a.goal:s.goal; return k==='custom' ? text(s.customGoal,120) : (a && routes[a.route]?.goals.find(([id])=>id===k)?.[1]) || GOALS[k] || ''; };
  const scenarios = s => s.adaptive ? (routes[s.adaptive.route]||routes.generic).opts : (TOPICS[s.topic] || TOPICS.custom).opts;
  const picks = s => s.adaptive ? s.adaptive.scenarios : Array.isArray(s.picked?.[s.topic]) ? s.picked[s.topic] : [];
  function people(s) {
    if (s.personaMode==='ai') return [];
    if (s.personaMode==='direct') return s.people.slice(0,s.second?2:1).filter(x=>x.why.trim()).map((x,i)=>({id:'P'+(i+1),name:x.who.trim() || '타깃 '+(i+1),situation:x.why.trim(),need:x.need.trim(),source:SOURCE.direct}));
    return picks(s).filter(i=>scenarios(s)[i]).map((j,i)=>{const [name,situation,need]=scenarios(s)[j];return {id:'P'+(i+1),name,situation,need,source:SOURCE.pick};});
  }
  const urlOk = v => { if (!v.trim()) return true; if (!/^https?:\/\//i.test(v.trim())) return false; try {const u=new URL(v.trim());return !!u.hostname&&!u.username&&!u.password;}catch{return false;} };
  function problem(s, step) {
    if (s.adaptive && step===0 && (!topicName(s)||!s.adaptive.route)) return [topicName(s)?'이 주제에 맞는 질문 분야를 선택해 주세요.':'키워드를 찾을 주제를 적어 주세요.','adaptive-topic'];
    if (step===0 && !topicName(s)) return ['주제를 선택하거나 직접 입력해 주세요.',s.topic==='custom'?'customTopic':null];
    if (step===1) {
      if (!s.product.trim()&&!s.adaptive?.productUnknown) return ['상품·서비스명을 적어 주세요. 모르면 미정으로 둘 수 있어요.','product'];
      if (!goalName(s)) return ['목표 행동을 선택해 주세요. 모르면 ‘미정 · 탐색용’을 고르세요.',(s.adaptive?.goal||s.goal)==='custom'?'customGoal':null];
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
  const hasContent = s => !!(s && (s.adaptive?.text.trim() || s.adaptive?.drafts?.length || s.topic || s.product || s.claims || s.exclusions || s.refs));
  function activeContext(s) {
    if (!s.adaptive?.route) return null;
    const status=x=>x?.status==='skip'?'해당 없음':x?.status==='unknown'?'미정':x?.value.trim()?'사용자 입력':'미입력';
    const row=(question,x)=>({question,status:status(x),...(status(x)==='사용자 입력'?{answer:x.value.trim()}:{})});
    return { field:routes[s.adaptive.route].name, notes:[...extras(s).map(q=>row(q.label,s.adaptive.fields[q.id])), ...s.adaptive.questions.filter(q=>q.question.trim()).map(q=>row(q.question.trim(),q.answer))] };
  }
  function forRequest(raw) {
    const s=normalize(raw); if (!s.adaptive) return s;
    const {drafts:_,...a}=s.adaptive;
    const active=new Set(extras(s).map(q=>q.id));
    if(a.productUnknown) s.product='';
    if(a.goal!=='custom') s.customGoal='';
    if(s.personaMode!=='direct') { s.people=[emptyPerson(),emptyPerson()]; s.second=false; }
    else if(!s.second) s.people[1]=emptyPerson();
    if(s.personaMode!=='pick') a.scenarios=[];
    s.picked={};
    s.adaptive={...a,fields:Object.fromEntries(Object.entries(a.fields).filter(([k])=>active.has(k))),questions:a.questions.filter(q=>q.question.trim())};
    return s;
  }
  function payload(raw) {
    const s=forRequest(raw);
    const context=activeContext(s);
    return {platform:'네이버 검색광고 파워링크',topic:topicName(s),product:s.adaptive?.productUnknown?'미정':s.product.trim(),goal:goalName(s),conversion:s.conversion.trim()||'미정',
      officialUrl:urlOk(s.official)&&s.official.trim()||null,landingUrl:urlOk(s.landing)&&s.landing.trim()||null,
      claims:s.claims.trim(),excludeIntents:lines(s.exclusions),refs:words(lines(s.refs),20),personas:people(s),personaMode:SOURCE[s.personaMode],mix:s.mix,...(context?{context}:{})};
  }
  function summary(raw) {
    const b=payload(raw);
    return [`주제: ${b.topic}`,`상품·광고주: ${b.product}`,`목표 행동: ${b.goal} · 완료 기준: ${b.conversion}`,
      b.officialUrl?`공식 상품 주소(미확인): ${b.officialUrl}`:'',b.landingUrl?`광고 랜딩 주소(미확인): ${b.landingUrl}`:'',
      ...(b.context?.notes||[]).map(q=>`${q.question} ${q.answer??q.status}`),
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
  return {TOPICS,GOALS,TAILS,TAIL_LABELS,INTENTS,SOURCE,INSTRUCTIONS,adaptive,blank,blankAdaptive,normalize,forRequest,topicName,goalName,scenarios,picks,people,problem,firstProblem,hasContent,payload,summary,compose,lines,word,key,words,volumeState,needsVolumeReview};
});
