(() => {
  const D=86400000;
  const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return '';const d=new Date(x+'T00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x?x:'';};
  const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
  const fold=v=>str(v,150).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
  const bid=v=>Number.isInteger(v)&&v>=70&&v<=100000&&v%10===0?v:null;
  const id=(v,p)=>typeof v==='string'&&v.length<=80&&new RegExp('^'+p+'-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$').test(v)?v:'';
  const measures=['imp','clicks','visits','cost','conv','value','rank'];
  const duration=(a,b)=>(Date.parse(b)-Date.parse(a))/D+1;
  function normalize(x){
    const from=date(x?.from),to=date(x?.to),download=date(x?.download),group=str(x?.group,150),device=x?.device;
    if(!from||!to||from>to||!download||download<to||x.nFrom!==from||x.nTo!==to||!group||!['pc','mo','both'].includes(device)||!(num(x.target)>0)||!Array.isArray(x.rows)||!x.rows.length||x.rows.length>25000)throw Error('일치하는 조회 기간, 다운로드일, 광고그룹·기기와 목표 CPA를 확인해 주세요. (최대 25,000행)');
    const rows=x.rows.map(r=>{if(!r||!str(r.kw,200))throw Error('키워드 이름이 비어 있는 행은 저장할 수 없어요.');return {kw:str(r.kw,200).replace(/\s+/g,''),id:id(r.id,'nkw'),bid:bid(r.bid),approved:bid(r.approved),csv:bid(r.csv),state:['up','down','hold','keep'].includes(r.state)?r.state:'',reason:str(r.reason,500),status:str(r.status,100),metric:r.metric?Object.fromEntries(measures.map(k=>[k,num(r.metric[k])])):null};});
    const seen=new Set();for(const r of rows)if(r.id){if(seen.has(r.id))throw Error('중복 키워드 ID가 있어요. 네이버 파일을 정리해 주세요.');seen.add(r.id);}
    return {title:str(x.title,120)||group,group,gid:id(x.gid,'grp'),device,from,to,nFrom:from,nTo:to,download,target:x.target,rows};
  }
  function same(a,b){return a.device===b.device&&(a.gid&&b.gid?a.gid===b.gid:fold(a.group)===fold(b.group));}
  function suggest(a){
    if(!date(a?.from)||!date(a?.to)||a.from.slice(0,7)!==a.to.slice(0,7))return null;
    const m=new Date(a.from+'T00:00Z');m.setUTCDate(1);m.setUTCMonth(m.getUTCMonth()+1);const p=m.toISOString().slice(0,7),max=new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth()+1,0)).getUTCDate();
    return Number(a.to.slice(-2))<=max?{from:p+a.from.slice(7),to:p+a.to.slice(7)}:null;
  }
  function compare(a,b){
    if(!same(a,b))throw Error('같은 광고그룹과 기기의 자료끼리만 비교할 수 있어요.');
    const left=new Map(a.rows.filter(r=>r.id).map(r=>[r.id,r])),right=new Map(b.rows.filter(r=>r.id).map(r=>[r.id,r]));
    if((!a.gid||!b.gid)&&![...left.keys()].some(k=>right.has(k)))throw Error('공통 키워드 ID가 없어 같은 광고그룹인지 확인할 수 없어요.');
    const comparable=a.to<b.from&&duration(a.from,a.to)===duration(b.from,b.to), rows=[];
    for(const k of new Set([...left.keys(),...right.keys()])){
      const before=left.get(k),after=right.get(k),status=before&&after?'both':before?'absent':'new';
      rows.push({kw:after?.kw||before.kw,before,after,status,delta:before?.bid!=null&&after?.bid!=null?after.bid-before.bid:null});
    }
    for(const r of a.rows)if(!r.id)rows.push({kw:r.kw,before:r,status:'unknown',delta:null});
    for(const r of b.rows)if(!r.id)rows.push({kw:r.kw,after:r,status:'unknown',delta:null});
    return {rows,comparable};
  }
  const api={normalize,same,suggest,compare};if(typeof module==='object'&&module.exports)module.exports=api;else window.BidTrackRules=api;
})();
