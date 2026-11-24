(() => {
  const T=window.BidTrackRules, $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const device={pc:'PC',mo:'모바일',both:'PC·모바일'};
  const n=(x,d=0)=>x==null?'—':x.toLocaleString('ko-KR',{maximumFractionDigits:d});
  const won=x=>x==null?'—':n(x)+'원';
  const span=(a,b,f=n)=>f(a)+' → '+f(b);
  const ratio=(a,b)=>a!=null&&b>0?a/b:null;
  const pct=x=>x==null?'—':n(100*x,1)+'%';
  const signed=x=>(x>0?'+':x<0?'−':'')+n(Math.abs(x));
  async function api(id,body){
    const r=await fetch('/api/bid-tracking'+(id?'?id='+encodeURIComponent(id):''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:body})}:{cache:'no-store'});
    if(r.status===404 && !r.headers.get('content-type')?.includes('json'))throw Error('서버를 다시 시작해야 트래킹을 쓸 수 있어요. 상단 안내의 [서버 다시 시작]을 눌러 주세요.');
    const j=await r.json();if(!r.ok)throw Error(j.error||'트래킹 저장소를 열지 못했어요.');return j;
  }
  const label=m=>m.from+' ~ '+m.to+' · '+m.title+' · '+new Date(m.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' 저장';
  function mount(target,{capture,flash}){
    target.innerHTML='<section class="sec"><h2>입찰가 트래킹</h2><p class="muted">검토 내역과 별개로, 이 PC에 저장한 당시의 성과와 입찰가를 비교해요.</p><div class="card"><div class="bid-fields"><label>기준 기록<select class="inp" id="btBase"></select></label><label>비교 기록<select class="inp" id="btOther"></select></label></div><p id="btHint" class="muted"></p><div class="bid-tools"><button class="btn pri" id="btCompare" type="button">기간 비교</button><button class="btn" id="btReload" type="button">기록 새로고침</button></div><p id="btMsg" role="status"></p></div><div class="hidden" id="btResult"><div class="bid-tools"><label>보기 <select class="hsel" id="btFilter"><option value="">전체</option><option value="up">입찰가 상승</option><option value="down">입찰가 하락</option><option value="roasUp">추정 ROAS 상승</option><option value="roasDown">추정 ROAS 하락</option><option value="new">기준 파일에 없음</option><option value="absent">비교 파일에 없음</option><option value="unknown">ID 미확인</option></select></label><label>키워드 <input class="inp" type="search" id="btSearch"></label></div><p id="btSummary" class="muted"></p><div id="btRows"></div><div class="bid-tools" id="btPages"><button class="btn sm" id="btBack" type="button">이전</button><span id="btPage"></span><button class="btn sm" id="btNext" type="button">다음</button></div></div></section>';
    let list=[], result=null, pg=0, rev=0, busy=false;
    const msg=s=>{$('btMsg').textContent=s;};
    function clear(){rev++;result=null;pg=0;$('btResult').classList.add('hidden');}
    function opts(sel,rows,prefer){sel.replaceChildren(new Option('선택', ''),...rows.map(m=>new Option(label(m),m.id)));sel.value=rows.some(x=>x.id===prefer)?prefer:'';}
    function choose(prefer=$('btOther').value){
      const a=list.find(m=>m.id===$('btBase').value), h=T.suggest(a), available=a?list.filter(m=>m.id!==a.id&&m.to>=a.to&&T.same(a,m)):[];
      const pick=h&&available.find(m=>m.from===h.from&&m.to===h.to);
      opts($('btOther'),available,(available.some(m=>m.id===prefer)?prefer:pick?.id)||'');
      $('btHint').textContent=a?(a.group+' · '+device[a.device]+' · '+(h?'다음달 동일 일수 추천: '+h.from+' ~ '+h.to:'다음달에 같은 날짜 범위가 없어요. 동일 일수 기록을 선택하세요.')):'';
      $('btCompare').disabled=!a||!$('btOther').value;clear();
    }
    async function refresh(prefer){
      const prev=$('btBase').value, other=$('btOther').value;
      try{const rr=await api();list=rr.list;opts($('btBase'),list,prefer||prev||list[0]?.id);choose(other);msg(rr.broken?'읽지 못한 기록 '+rr.broken+'개를 제외했어요.':list.length?'':'저장 기록이 없어요. 입찰 조정 결과에서 [트래킹에 저장]을 눌러 주세요.');}
      catch(e){msg(e.message);}
    }
    $('btBase').onchange=()=>choose('');$('btOther').onchange=()=>{clear();$('btCompare').disabled=!$('btOther').value;};$('btReload').onclick=()=>refresh();$('btCompare').disabled=true;
    $('btCompare').onclick=async()=>{
      clear();const i=$('btBase').value,j=$('btOther').value,r=rev;msg('기록을 읽는 중…');
      try{const [a,b]=await Promise.all([api(i),api(j)]);if(r!==rev)return; result={...T.compare(a.snapshot,b.snapshot),a:a.snapshot,b:b.snapshot};msg('');paint();}catch(e){if(r===rev)msg(e.message);}
    };
    function render(row,ok){
      const {before:a,after:b,delta:d,status}=row, m=a?.metric, f=b?.metric;
      const tag=status==='new'?'기준 파일에 없음':status==='absent'?'비교 파일에 없음':status==='unknown'?'ID 미확인':a.csv!=null&&b.bid!=null?(a.csv===b.bid?'CSV와 실제 입찰가 일치':'CSV와 실제 입찰가 불일치'):'양쪽 파일에서 확인';
      const pair=(t,x)=>'<div><dt>'+t+'</dt><dd>'+x+'</dd></div>';
      const change=d==null?'—':signed(d)+'원 ('+(d>0?'+':d<0?'−':'')+pct(Math.abs(d)/a.bid)+')';
      const metrics=(m||f)?'<p>'+ (ok?'':'<b>참고 · 직접 증감 비교 안 함</b> · ')+'노출 '+span(m?.imp,f?.imp)+' · 클릭 '+span(m?.clicks,f?.clicks)+' · 신청 '+span(m?.conv,f?.conv)+' · 순위 '+span(m?.rank,f?.rank,v=>n(v,1))+'</p><p>비용 '+span(m?.cost,f?.cost,won)+' · CPA '+span(ratio(m?.cost,m?.conv),ratio(f?.cost,f?.conv),won)+' · 추정 ROAS '+span(ratio(m?.value,m?.cost),ratio(f?.value,f?.cost),pct)+'</p>':'<p class="muted">일치하는 데일리 성과 없음</p>';
      return '<article class="card bid-result"><div class="bid-line"><b>'+esc(row.kw)+'</b><span class="bid-pill">'+tag+'</span></div><dl class="bid-track-metrics">'+pair('기준 입찰가',won(a?.bid))+pair('기준 승인안',won(a?.approved))+pair('기준 CSV 값',won(a?.csv))+pair('비교 파일 입찰가',won(b?.bid))+pair('입찰가 변화',change)+'</dl>'+metrics+(a?.reason?'<details><summary>기준 분석 근거</summary><p class="muted">'+esc(a.reason)+'</p></details>':'')+'</article>';
    }
    const roas=r=>ratio(r?.metric?.value,r?.metric?.cost);
    function paint(){
      if(!result)return;const {rows,comparable,a,b}=result;const f=$('btFilter').value,q=$('btSearch').value.trim().toLowerCase().replace(/\s+/g,'');
      $('btResult').classList.remove('hidden');
      const summary=rows.reduce((z,r)=>{z[r.status]++; if(r.delta>0)z.up++;if(r.delta<0)z.down++;return z;},{both:0,new:0,absent:0,unknown:0,up:0,down:0});
      $('btSummary').textContent=a.from+' ~ '+a.to+' (목표 CPA '+won(a.target)+') ↔ '+b.from+' ~ '+b.to+' (목표 CPA '+won(b.target)+') · '+(comparable?'동일 일수':'일수 다름 또는 기간 겹침: 성과 변화 필터를 숨겼어요.')+' · 입찰 상승 '+summary.up+' / 하락 '+summary.down+' · 기준 파일에 없음 '+summary.new+' / 비교 파일에 없음 '+summary.absent+' / ID 미확인 '+summary.unknown+' · 성과를 입찰 변화의 결과로 단정하지 않아요.';
      for(const o of $('btFilter').options)if(o.value.startsWith('roas'))o.disabled=!comparable;
      if(f.startsWith('roas')&&!comparable)$('btFilter').value='';
      const filtered=rows.filter(r=>r.kw.toLowerCase().includes(q)&&(!f||(f==='up'?r.delta>0:f==='down'?r.delta<0:f.startsWith('roas')?(!comparable||roas(r.before)!=null&&roas(r.after)!=null&&(f==='roasUp'?roas(r.after)>roas(r.before):roas(r.after)<roas(r.before))):r.status===f)));
      const max=Math.max(1,Math.ceil(filtered.length/50));pg=Math.min(pg,max-1);$('btRows').innerHTML=filtered.slice(pg*50,(pg+1)*50).map(r=>render(r,comparable)).join('')||'<p class="muted">이 조건에 해당하는 키워드가 없어요.</p>';
      $('btPages').classList.toggle('hidden',max===1);$('btPage').textContent=(pg+1)+' / '+max;$('btBack').disabled=pg===0;$('btNext').disabled=pg+1>=max;
    }
    $('btFilter').onchange=$('btSearch').oninput=()=>{pg=0;paint();};$('btBack').onclick=()=>{pg--;paint();};$('btNext').onclick=()=>{pg++;paint();};
    return {refresh,async save(btn){if(busy)return;busy=true;btn.disabled=true;try{const {meta}=await api('',capture());flash('트래킹에 '+n(meta.count)+'행을 저장했어요.');await refresh(meta.id);}catch(e){flash(e.message,true);}finally{busy=false;btn.disabled=false;}}};
  }
  window.BidTracking={mount};
})();
