import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const DAY=86400000, MAX_RANGE=185;
const iso=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x?x:null;
const toDay=x=>new Date(x).toISOString().slice(0,10);
const clean=x=>typeof x==='string'?x.normalize('NFKC').replace(/\s+/g,''):'';
const val=x=>typeof x==='number' && Number.isFinite(x) && x>=0 && x<=1e15?x:null;
const div=(a,b)=>a!=null&&b>0?a/b:null;
const change=(a,b)=>a>0&&b!=null?b/a-1:null;
const period=(x,today)=>iso(x?.from)&&iso(x?.to)&&x.from>= '2016-01-01'&&x.from<=x.to&&x.to<=today?{from:x.from,to:x.to}:null;
const length=r=>(Date.parse(r.to)-Date.parse(r.from))/DAY+1;
const field=['imp','clicks','visits','conv','cost','value','rank'];
function metrics(x){
  if(!x||typeof x!=='object')return null;
  const y=Object.fromEntries(field.map(k=>[k,val(x[k])]));
  return {...y,rank:y.rank||null,cpc:div(y.cost,y.clicks),ctr:div(y.clicks,y.imp),visitRate:div(y.visits,y.clicks),applyRate:div(y.conv,y.visits),cpa:div(y.cost,y.conv),roas:div(y.value,y.cost)};
}
export function readRequest(b,today){
  const keyword=clean(b?.keyword);
  if(!keyword||[...keyword].length>60||!/^[\p{L}\p{N}][\p{L}\p{N}\-_.+'·&]*$/u.test(keyword)||!['pc','mo','both'].includes(b?.device))throw Object.assign(Error('진단하려면 키워드와 조회 기기를 확인해 주세요.'),{status:400});
  const current=period(b.current,today), prior=period(b.prior,today);
  const comparable=Boolean(current&&prior&&prior.to<current.from&&length(prior)===length(current)&&(Date.parse(current.to)-Date.parse(prior.from))/DAY+1<=MAX_RANGE);
  return {keyword,device:b.device,current,prior:comparable?prior:null,metrics:{before:comparable?metrics(b.before):null,after:current?metrics(b.after):null},comparable};
}
export function trendSummary(data,{current,prior}){
  const lookup=new Map();
  for(const d of data||[])if(iso(d?.period)&&val(d.ratio)!=null&&d.ratio<=100)lookup.set(d.period,d.ratio);
  const part=r=>{
    const values=[];for(let d=Date.parse(r.from),end=Date.parse(r.to);d<=end;d+=DAY){const v=lookup.get(toDay(d));if(v!=null)values.push(v);}
    return {...r,days:length(r),observed:values.length,avg:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};
  };
  const before=part(prior),after=part(current);
  return {before,after,delta:before.observed===before.days&&after.observed===after.days&&before.days>=7&&before.avg>=5?change(before.avg,after.avg):null};
}
const TYPES={
  demand_down:['검색 수요 감소 가능성','동일 기기의 검색 지수가 낮아졌어요. 광고 노출 감소가 함께 나타났는지 확인하세요.','다음 동일 기간의 검색 지수와 광고 노출을 다시 비교하세요.'],
  demand_up:['검색 수요 증가 가능성','동일 기기의 검색 지수가 높아졌어요. 유입 증가가 신청 증가로 이어졌는지는 별도로 봐야 해요.','노출·클릭·신청이 같이 늘었는지 확인하세요.'],
  competition:['광고 경쟁 심화 가능성','날짜가 다른 조회에서 경쟁 단계나 평균 노출 광고수가 올랐고, 성과 기간의 실제 CPC도 올랐어요. 다만 경쟁 변화가 CPC 상승의 원인이라고 단정할 수 없어요.','같은 기기의 평균순위와 품질 지표, 입찰 변경 이력을 확인하세요.'],
  click_rate:['광고 소재·노출 위치 점검','광고 클릭률이 낮아졌어요. 소재나 순위, 노출 지면이 달라졌을 수 있어요.','기간별 평균순위, 검색어, 소재 변경과 지면 구성을 확인하세요.'],
  landing:['랜딩·방문 추적 점검','클릭 대비 순방문 비율이 낮아졌어요. 집계 방식, 접속 문제, 태그 누락 등이 원인일 수 있어요.','모바일 랜딩 로딩, 추적 태그와 집계 기준을 확인하세요.'],
  conversion:['신청 경로·전환 추적 점검','순방문 대비 신청 비율이 낮아졌어요. 신청 절차나 전환 집계를 점검할 만해요.','신청 완료 이벤트, 집계 지연, 폼 오류를 확인하세요.'],
  cpc:['광고 클릭비 상승','실제 CPC가 높아졌어요. 경쟁 외에도 순위, 입찰가, 노출 조건이 영향을 줄 수 있어요.','변경 시점 전후의 CPC·순위·노출 지면을 확인하세요.'],
};
const severity={낮음:1,중간:2,높음:3};
export function allowed({trend,market,metrics:m,metricsPeriod}){
  const a=m.before,b=m.after, out=[];
  if(trend?.delta<=-.15 && trend.delta!=null)out.push('demand_down');
  if(trend?.delta>=.15)out.push('demand_up');
  const cpc=a?.clicks>=20&&b?.clicks>=20&&change(a.cpc,b.cpc)>=.15;
  const old=market?.previous, fresh=market?.current;
  const near=(day,p)=>p && day>=p.to && Date.parse(day)-Date.parse(p.to)<=7*DAY;
  const compUp=old&&fresh&&((severity[fresh.comp]||0)>(severity[old.comp]||0)&&severity[old.comp] || old.depth!=null&&fresh.depth!=null&&fresh.depth-old.depth>=1);
  if(compUp&&cpc&&near(old.at,metricsPeriod?.prior)&&near(fresh.at,metricsPeriod?.current))out.push('competition');
  if(a?.imp>=100&&b?.imp>=100&&a.clicks>=20&&change(a.ctr,b.ctr)<=-.2&&change(a.ctr,b.ctr)!=null)out.push('click_rate');
  if(a?.clicks>=30&&b?.clicks>=30&&change(a.visitRate,b.visitRate)<=-.2&&change(a.visitRate,b.visitRate)!=null)out.push('landing');
  if(a?.visits>=25&&b?.visits>=25&&a.conv>=3&&change(a.applyRate,b.applyRate)<=-.25&&change(a.applyRate,b.applyRate)!=null)out.push('conversion');
  if(cpc)out.push('cpc');
  return out;
}
function rawAd(raw,at){
  const token=x=>typeof x==='number'?val(x):/^<\s*\d+$/.test(String(x))?'< '+String(x).match(/\d+/)[0]:null;
  const comp=Object.hasOwn(severity,raw.compIdx)?raw.compIdx:null;
  const depth=raw.plAvgDepth==null||raw.plAvgDepth===''?null:val(Number(raw.plAvgDepth));
  const r={at,pc:token(raw.monthlyPcQcCnt),mo:token(raw.monthlyMobileQcCnt),comp,depth};
  return [r.pc,r.mo,r.comp,r.depth].some(v=>v!=null)?r:null;
}
async function saveMarket(dir,keyword,current){
  const key=createHash('sha256').update(keyword.toUpperCase()).digest('hex');
  const folder=path.join(dir,key);await fs.mkdir(folder,{recursive:true});
  const names=(await fs.readdir(folder)).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)&&f.slice(0,10)<current.at).sort().reverse();
  let previous=null;
  for(const f of names.slice(0,5)){try{const v=JSON.parse(await fs.readFile(path.join(folder,f),'utf8'));if(v.at===f.slice(0,10)){previous=v;break;}}catch{}}
  try{await fs.writeFile(path.join(folder,current.at+'.json'),JSON.stringify(current),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  return previous;
}
const status=(message,code)=>Object.assign(Error(message),{status:code});
export function createBidDiagnosis({dataDir,lookup,series,interpret,hasAd,hasTrend,hasModel,modelName,today}){
  let active=false;const pending=new Map();
  return async function handle(req,res,u,readBody,send){
    if(req.method==='GET'&&u.pathname==='/api/bid-diagnosis')return send(res,200,{ad:hasAd(),trend:hasTrend(),ai:hasModel(),model:modelName()});
    if(req.method!=='POST')throw status('지원하지 않는 요청이에요.',405);
    if(active)throw status('다른 키워드 진단이 끝난 뒤 다시 실행해 주세요.',429);
    active=true;const signal=new AbortController();const close=()=>{if(!res.writableEnded)signal.abort();};res.once('close',close);
    try {
      const b=await readBody(req);
      if(u.pathname.endsWith('/explain')){
        const now=Date.now();for(const [k,v] of pending)if(v.expires<now)pending.delete(k);
        const saved=pending.get(b?.ticket);if(!saved)throw status('진단 근거가 만료됐어요. 다시 조회해 주세요.',400);
        if(!hasModel())return send(res,200,{notes:[],message:'설정에서 AI 모델을 연결하면 원인 해석을 볼 수 있어요.'});
        const {codes,evidence}=saved;
        let ai;
        try{ai=await interpret({codes,evidence},signal.signal);}catch{if(signal.signal.aborted)return;return send(res,200,{notes:[],message:'AI 응답을 받지 못했어요. 확인된 근거는 그대로 볼 수 있어요.'});}
        const selected=[...new Set((Array.isArray(ai?.arr)?ai.arr:[]).map(x=>x?.code).filter(c=>codes.includes(c)))].slice(0,3);
        return send(res,200,{model:ai.model,notes:selected.map(code=>({code,title:TYPES[code][0],why:TYPES[code][1],next:TYPES[code][2]})),message:selected.length?'':'AI가 확인 가능한 원인 후보를 고르지 못했어요.'});
      }
      const now=today(), q=readRequest(b,now), messages=[];
      const [marketRes,trendRes]=await Promise.allSettled([
        hasAd()?lookup(q.keyword,signal.signal):null,
        hasTrend()&&q.comparable?series(q,signal.signal):null,
      ]);
      if(signal.signal.aborted)return;
      let market=null,trend=null;
      if(!hasAd())messages.push('검색광고 API가 연결되지 않았어요.');
      else if(marketRes.status!=='fulfilled')messages.push('검색광고 지표를 가져오지 못했어요.');
      else if(!marketRes.value || !rawAd(marketRes.value,now))messages.push('키워드 도구에 정확히 일치하는 지표가 없어요.');
      else{
        const current=rawAd(marketRes.value,now);let previous=null;
        try{previous=await saveMarket(path.join(dataDir,'bid-market'),q.keyword,current);}catch{messages.push('경쟁 조회값을 이 PC에 저장하지 못했어요.');}
        market={current,previous};
        if(!previous)messages.push('이전 경쟁 조회가 없어 현재 경쟁 수준만 표시해요.');
      }
      if(!q.comparable)messages.push('검색 수요 변화는 같은 기기의 겹치지 않는 동일 일수 두 기간이 있어야 표시해요. (조회 범위 최대 185일)');
      else if(!hasTrend())messages.push('검색·데이터랩 API가 연결되지 않았어요.');
      else if(trendRes.status!=='fulfilled')messages.push('데이터랩 검색 지표를 가져오지 못했어요.');
      else {trend=trendSummary(trendRes.value,q);if(trend.delta==null)messages.push('검색 지수의 관측일 또는 표본이 부족해 증감률은 표시하지 않아요.');}
      const evidence={device:q.device,market,trend,metrics:q.metrics,metricsPeriod:{prior:q.prior,current:q.current}};const codes=allowed(evidence);
      let ticket=null;
      if(codes.length&&hasModel()){
        // Only numeric evidence and closed labels reach the AI; no keyword, account or workbook.
        ticket=randomUUID();
        for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);
        if(pending.size>=32)pending.delete(pending.keys().next().value);
        pending.set(ticket,{codes,evidence,expires:Date.now()+5*60000});
      }
      return send(res,200,{...evidence,ticket,messages,model:modelName(),explainStatus:!hasModel()?'AI 미연결':!codes.length?'비교 근거 부족: AI를 호출하지 않았어요.':''});
    }finally {active=false;res.off('close',close);}
  };
}
