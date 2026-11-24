// Local Powerlink bid review: source mapping, decision rules, and Naver CSV.
(() => {
  const text = v => String(v ?? '').trim();
  const key = v => text(v).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const head = v => key(v).replace(/[\p{P}\p{S}]/gu, '');
  const defs = {
    daily: { kw:['키워드','검색키워드','그룹'], id:['키워드ID'], gid:['광고그룹ID'], group:['광고그룹','광고그룹명'], imp:['노출','노출수'], clicks:['클릭','클릭수'], cost:['비용(VAT별도/마크업 포함)','비용','광고비','총비용'], visits:['순방문','순방문수'], conv:['신청하기','신청수','전환수','전환'], value:['추정 실적','추정 전환가치','전환가치'], rank:['순위','평균노출순위'], roas:['ROAS','ROAS(%)'] },
    naver: { kw:['키워드'], id:['키워드ID','키워드 ID (필수)'], gid:['광고그룹ID','광고그룹ID (선택)'], group:['광고그룹','광고그룹명'], bid:['입찰가','키워드입찰가'], type:['입찰가 유형','입찰가유형'], status:['상태','키워드 상태'], modified:['수정시각','수정일시','최종수정시각'], imp:['노출','노출수'], clicks:['클릭','클릭수'], rank:['평균노출순위'], pc:['PC통검평균노출순위'], mo:['모바일통검평균노출순위'], quality:['광고 연관지수'], expected:['클릭 기대지수'] }
  };
  const req={daily:['kw','clicks','cost','conv','value'], naver:['kw','id','bid','status']};
  function header(row, kind) {
    const cols = row.map(head), found = {};
    for (const [k, labels] of Object.entries(defs[kind])) {
      for (const alias of new Set(labels.map(head))) {
        const hits = cols.flatMap((c,i) => c === alias && c ? [i] : []);
        if (!hits.length) continue;
        found[k] = hits.length === 1 ? hits[0] : -1;
        break;
      }
    }
    return req[kind].every(k => Object.hasOwn(found,k)) ? found : null;
  }
  const dash = s => /^[-–—]$/.test(text(s));
  function num(v) {
    const s = text(v).replace(/[\s,₩]/g,'').replace(/원$/,'');
    if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s); return Number.isFinite(n) ? n : null;
  }
  const metric = v => dash(v) ? 0 : num(v);
  function parseSheet(rows, kind, scope = '') {
    const hi = rows.findIndex(r => header(r,kind));
    if (hi === -1) return null;
    const h = header(rows[hi],kind);
    if (Object.values(h).includes(-1)) throw Error('같은 의미의 머리글이 한 줄에 반복돼요. 중복 열을 정리해 주세요.');
    const out=[]; let skipped=0;
    for (let i=hi+1;i<rows.length;i++) {
      const r=rows[i], v=k=>r[h[k]], kw=text(v('kw')), kk=key(kw), id=text(v('id')), gid=text(v('gid')), group=text(v('group'));
      if (!kw || /^(?:총합계|전체합계|소계|합계|전체|총계|총합|total|subtotal|grandtotal|키워드[\d,]+개결과)$/.test(kk)
          || (kind==='daily' && !id && scope && kk===key(scope))
          || (kind==='daily' && !id && kw===group && group)) { if(kw)skipped++; continue; }
      if (kind==='daily') {
        const clicks=metric(v('clicks')), cost=metric(v('cost'));
        const conv=metric(v('conv')), value=num(v('value')) ?? (dash(v('value')) && conv===0 ? 0 : null);
        out.push({kw,kk,id,gid,group,line:i+1,imp:metric(v('imp')),clicks,cost,conv,value,visits:metric(v('visits')),rank:num(v('rank')) || null});
      } else {
        out.push({kw,kk,id,gid,group,line:i+1,bid:num(v('bid')),type:text(v('type')), status:text(v('status')),modified:text(v('modified')),imp:metric(v('imp')),clicks:metric(v('clicks')),rank:num(v('rank')) || null, pc:num(v('pc')) || null,mo:num(v('mo')) || null,quality:num(v('quality')),expected:num(v('expected'))});
      }
    }
    return {rows:out,skipped};
  }
  function iso(value) {
    const s=text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d=new Date(s+'T00:00:00Z');
    return !Number.isNaN(+d) && d.toISOString().slice(0,10)===s ? s : '';
  }
  const dayKst = (d = new Date()) => new Date(+d + 9*3600000).toISOString().slice(0,10);
  const days=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
  function modDay(value) {
    const s=text(value), date=iso(s.slice(0,10).replace(/[./]/g,'-'));
    if(date) return date;
    const excel=num(s);
    return excel>=20000 && excel<=100000 ? new Date(Date.UTC(1899,11,30)+Math.floor(excel)*86400000).toISOString().slice(0,10) : '';
  }
  function period(s, today=dayKst()) {
    const start=iso(s.from), end=iso(s.to), nf=iso(s.nFrom), nt=iso(s.nTo), dl=iso(s.download);
    const dailyOK=Boolean(start && end && start<=end && end<=today);
    const naverOK=Boolean(nf && nt && nf<=nt && nt<=today);
    const same=Boolean(dailyOK && naverOK && start===nf && end===nt);
    const prev0=iso(s.pFrom), prev1=iso(s.pTo);
    const before=Boolean(dailyOK && prev0 && prev1 && prev0<=prev1 && prev1<start && days(end,start)===days(prev1,prev0));
    const errors=[];
    if(!text(s.group)||!['pc','mo','both'].includes(s.device)||!s.scopeOK) errors.push('같은 광고그룹·기기에서 내려받은 자료인지 확인해 주세요.');
    if(!(num(s.cpa)>0)) errors.push('목표 CPA를 입력해 주세요.');
    if(!dailyOK || !naverOK) errors.push('데일리 성과 기간과 네이버 조회 기간(시작~종료)을 확인해 주세요.');
    else if(!same) errors.push('두 조회 기간이 달라요. 각 파일을 같은 기간으로 다시 조회한 뒤 변경안을 확정해 주세요.');
    if(!dl || dl>today || (naverOK && dl<nt)) errors.push('네이버 파일 다운로드일을 확인해 주세요. 조회 종료일 이후(당일 포함)여야 해요.');
    else if(days(today,dl)>7) errors.push('다운로드일이 7일보다 오래됐어요. 최신 입찰가 파일로 바꿔 주세요.');
    return {same,before,start,end,download:dl,errors};
  }
  const bidOK = n => Number.isInteger(n) && n>=70 && n<=100000 && n%10===0;
  const idOK = (v,p) => new RegExp('^'+p+'-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+$').test(v);
  function indexed(rows, k) {
    const m=new Map(); for(const row of rows) if(row[k]) { const g=m.get(row[k])||[]; g.push(row); m.set(row[k],g); } return m;
  }
  const sameScope = (a,b) => (!a.gid || !b.gid || a.gid===b.gid) && (!a.group || !b.group || key(a.group)===key(b.group));
  function match(d,n) {
    const byId=indexed(n,'id'), byKw=indexed(n,'kk'), did=indexed(d,'id'), dkw=indexed(d,'kk');
    const used=new Set();
    const matches=d.map(x=>{
      if((x.id && did.get(x.id)?.length>1) || (!x.id && dkw.get(x.kk)?.length>1)) return {d:x,issue:'데일리 중복 행'};
      const all=x.id ? byId.get(x.id)||[] : byKw.get(x.kk)||[];
      const cand=all.filter(y=>sameScope(x,y));
      if(!cand.length) return {d:x,issue:all.length?'광고그룹 불일치':'네이버 파일에서 미매칭'};
      if(cand.length!==1 || (cand[0].id && byId.get(cand[0].id)?.length!==1)) return {d:x,issue:'네이버 키워드 또는 ID 중복'};
      const y=cand[0];
      if(x.kk!==y.kk) return {d:x,issue:'키워드 ID는 같지만 키워드 문구가 다름'};
      used.add(y); return {d:x,n:y};
    });
    const hits=indexed(matches.filter(x=>x.n).map(x=>({id:x.n.id,x})),'id');
    for(const {x} of [...hits.values()].filter(a=>a.length>1).flat()) { x.issue='동일 ID에 여러 성과 행이 연결됨'; delete x.n; }
    return {matches,naverOnly:n.filter(x=>!used.has(x))};
  }
  const ratio=(a,b)=>a!=null && b>0 ? a/b:null;
  const pct=x=>Math.round(x*100)+'%';
  const won=x=>Math.round(x).toLocaleString('ko-KR')+'원';
  function evaluate({daily, naver, previous=[], settings}, today) {
    const p=period(settings,today), target=num(settings.cpa), scope=key(settings.group);
    const d=daily.filter(r=>r.id || r.kk!==scope), dPrev=previous.filter(r=>r.id || r.kk!==scope);
    if ([d, naver, dPrev].some(rows=>['gid','group'].some(k=>new Set(rows.map(x=>key(x[k])).filter(Boolean)).size>1))) p.errors.push('한 파일에 광고그룹이 여러 개 있어요. 그룹별로 나눠서 넣어 주세요.');
    if(d.some(x=>x.group && key(x.group)!==scope) || naver.some(x=>x.group && key(x.group)!==scope) || dPrev.some(x=>x.group && key(x.group)!==scope)) p.errors.push('입력한 광고그룹 이름과 파일의 그룹명이 달라요.');
    const {matches,naverOnly}=match(d,naver), old=indexed(dPrev,'kk');
    const total=d.reduce((a,x)=>[a[0]+(x.cost||0),a[1]+(x.visits!=null ? x.visits : 0),a[2]+(x.visits!=null ? x.clicks||0 : 0)], [0,0,0]);
    const rows=matches.map(({d,n,issue})=>{
      const cpa=ratio(d.cost,d.conv), roas=ratio(d.value,d.cost), cpc=ratio(d.cost,d.clicks), allowed=target && d.conv>0 ? target*d.conv/d.clicks : null;
      const visit=ratio(d.visits,d.clicks), rest=ratio(total[1]-(d.visits||0),total[2]-(d.visits!=null?d.clicks||0:0));
      const notes=[]; const stats={d,n,cpa,roas,cpc,allowed:Number.isFinite(allowed)?allowed:null,notes};
      const hold=reason=>({...stats,state:'hold',reason});
      const keep=reason=>({...stats,state:'keep',reason});
      if(d.cost>0 && total[0]>0 && d.cost/total[0]>=0.2) notes.push('비용 집중: 데일리 전체 비용의 '+pct(d.cost/total[0]));
      if(visit!=null && rest!=null && d.clicks>=20 && visit<rest*0.75) notes.push('방문/클릭이 낮아요 ('+pct(visit)+', 다른 키워드 '+pct(rest)+'). 유입 추적·랜딩을 점검하세요. 순방문과 클릭의 집계 방식은 달라요.');
      if(d.conv===0 && d.visits>=20) notes.push('순방문 '+d.visits+'건에서 신청 0건. 검색 의도·랜딩·신청 추적을 점검하세요.');
      if(cpa!=null && target && cpa>=1.25*target && cpc!=null && Number.isFinite(allowed) && cpc>allowed) notes.push('실제 CPC '+won(cpc)+'가 현재 신청률 기준 허용 CPC '+won(allowed)+'보다 높아요. 허용 CPC는 입찰가가 아니에요.');
      if(n && p.same && n.clicks!=null && d.clicks!=null && n.clicks!==d.clicks) notes.push('같은 선택 기간이어도 클릭수가 달라요 (데일리 '+d.clicks+', 네이버 '+n.clicks+'). 계산에는 데일리만 사용했어요.');
      const prev=old.get(d.kk);
      const past=p.before && prev?.length===1 && sameScope(d,prev[0]) && (!prev[0].id || !n?.id || prev[0].id===n.id) ? prev[0] : null;
      if(past?.imp>=100 && d.imp!=null && d.imp<=past.imp*.7) notes.push('비교 기간보다 광고 노출이 '+pct(1-d.imp/past.imp)+' 줄었어요. 이 자료만으로 시장 수요 감소나 경쟁 심화는 구분할 수 없어요.');
      if(issue) return hold(issue);
      if(!idOK(n.id,'nkw') || (n.gid && !idOK(n.gid,'grp'))) return hold('네이버 키워드/광고그룹 ID 형식을 확인해 주세요.');
      if(!bidOK(n.bid)) return hold('현재 입찰가가 네이버 규격에 맞지 않아요.');
      if(!['노출가능','노출중'].includes(key(n.status))) return hold('노출 불가 또는 상태 미확인: '+(n.status||'미표기'));
      if(n.type && key(n.type)!=='키워드' && key(n.type)!=='키워드입찰가') return hold('개별 입찰가가 아닌 유형은 변경 대상에서 제외했어요.');
      if(p.errors.length) return hold('기간·목표·파일 범위를 확인해 주세요.');
      if([d.clicks,d.cost,d.conv].some(x=>x==null) || d.conv>d.clicks) return hold('비용·클릭·신청이 누락됐거나 수치가 맞지 않아요.');
      if(!d.clicks || !d.cost) return hold('비용 또는 클릭 표본이 없어요.');
      const mod=modDay(n.modified);
      if (!mod) return hold('최근 변경 여부를 알 수 없어요. 수정시각이 있는 파일로 확인해 주세요.');
      if (mod>=p.start) return hold('성과 시작일 이후에 수정 이력이 있어요 ('+mod+'). 수정 이후 데이터만 모아서 다시 판단하세요.');
      function change(direction, rate, reason) {
        const delta=Math.floor((n.bid*rate+1e-8)/10)*10;
        const bid=Math.max(70,Math.min(100000,n.bid+(direction==='up'?delta:-delta)));
        if(bid===n.bid) return keep(reason+' 허용 변경폭과 10원 단위 안에서 변경할 수 없어요.');
        return {...stats,state:direction,bid,delta:bid-n.bid,percent:(bid-n.bid)/n.bid,reason};
      }
      if (d.conv===0 && d.clicks>=30 && d.cost>=2*target) return change('down',.1,'30클릭 이상·목표 CPA의 2배 이상을 썼지만 신청 0건. 추적·랜딩 확인 후 비용을 줄이는 테스트예요.');
      if (d.conv>=3 && d.clicks>=30 && cpa>=1.25*target) return change('down',.1,'신청 3건 이상·30클릭 이상에서 CPA가 목표를 25% 이상 넘었어요. 클릭비와 순위의 변화를 확인하는 테스트예요.');
      if (d.conv<3 || d.clicks<20) return hold('표본이 작아요. 전환 최소 3건과 클릭 20건을 모은 뒤 다시 봐요.');
      // Previous/current rank both come from the daily report, not from a different Naver surface.
      if (cpa<=.8*target && cpc<=.8*allowed && past?.rank && d.rank && past.imp>=100 && d.imp>=100 && d.rank-past.rank>=1 && d.value>0) {
        return change('up',.05,'CPA가 목표보다 20% 이상 낮지만 같은 길이의 이전 기간보다 평균순위가 '+(d.rank-past.rank).toFixed(1)+'위 밀렸어요. 순위 회복 여부를 확인하는 소폭 테스트예요.');
      }
      if(cpa<=target) return keep('CPA가 목표 안이에요. 같은 기준으로 확인된 순위 하락이 없다면 현재 입찰가를 유지해요.');
      return keep('목표 CPA를 넘었지만 충분한 표본과 조정 기준을 둘 다 충족하지 않았어요.');
    });
    return {rows,naverOnly,p, discrep:rows.filter(({d,n})=>n && d.clicks!=null && n.clicks!=null && d.clicks!==n.clicks).length, matched:rows.filter(x=>x.n).length};
  }
  let cp;
  function encode949(s) {
    if(!cp) {
      cp=new Map(); const dec=new TextDecoder('euc-kr',{fatal:true});
      for(let a=0;a<128;a++) cp.set(String.fromCharCode(a),[a]);
      for(let a=129;a<=254;a++) for(let b=65;b<=254;b++) {
        try { const bytes=[a,b], c=dec.decode(Uint8Array.from(bytes)); if([...c].length===1 && !cp.has(c)) cp.set(c,bytes); } catch {}
      }
    }
    const out=[]; for(const c of s) { const b=cp.get(c); if(!b) throw Error('네이버 CSV 인코딩에서 지원하지 않는 문자가 있어요.'); out.push(...b); } return Uint8Array.from(out);
  }
  function csvFiles(template, rows) {
    if(!rows.length) throw Error('적용한 변경사항이 없어요.');
    const lines=new TextDecoder('euc-kr',{fatal:true}).decode(template).split('\r\n');
    if(lines.length!==7 || lines[6]!=='' || lines[5]!=='광고그룹ID (선택),키워드ID (필수),키워드 (선택),"키워드입찰가 (필수,숫자만)"') throw Error('네이버 CSV 원본 양식이 올바르지 않아요.');
    const seen=new Set(), out=[];
    for (const r of rows) {
      if(!idOK(r.id,'nkw') || (r.gid && !idOK(r.gid,'grp')) || seen.has(r.id) || !bidOK(r.bid) || !bidOK(r.before) || r.bid===r.before) throw Error('키워드 ID 또는 입찰가가 잘못됐거나 중복됐어요.');
      seen.add(r.id);
      let kw=text(r.kw).replace(/\s+/g,'');
      if (/^[=+\-@]|[\p{Cc}]/u.test(kw)) kw='';
      try { encode949(kw); } catch { kw=''; } // optional column; never alter a required ID
      out.push([r.gid||'',r.id,/[",]/.test(kw)?'"'+kw.replace(/"/g,'""')+'"':kw,r.bid].join(','));
    }
    const files=[];
    for(let i=0;i<out.length;i+=10000) {
      const chunk=encode949(out.slice(i,i+10000).join('\r\n')+'\r\n');
      const file=new Uint8Array(template.length+chunk.length); file.set(template); file.set(chunk,template.length); files.push(file);
    }
    return files;
  }
  const api={header,parseSheet,period,evaluate,csvFiles,bidOK,dayKst};
  if(typeof module==='object' && module.exports) module.exports=api;
  else window.BidRules=api;
})();
