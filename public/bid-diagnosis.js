(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=(v,d=0)=>v==null?'미확인':typeof v==='number'?v.toLocaleString('ko-KR',{maximumFractionDigits:d}):esc(v);
  const pct=v=>v==null?'미확인':n(v*100,1)+'%';
  const won=v=>v==null?'미확인':n(v)+'원';
  const device={pc:'PC',mo:'모바일',both:'PC·모바일'};
  const sourced=(url,label)=>'<a class="ext" target="_blank" rel="noopener noreferrer" href="'+url+'">'+label+'</a>';
  const d=document.createElement('dialog');d.className='card bid-diag-dialog';d.setAttribute('aria-labelledby','bdTitle');
  d.innerHTML='<header class="bid-line"><h2 id="bdTitle">시장·성과 진단</h2><button type="button" class="btn sm" id="bdClose">닫기</button></header><p id="bdHead" class="muted"></p><div class="bid-tools"><span id="bdStatus" role="status"></span><button type="button" class="btn sm hidden" id="bdStop">중지</button></div><div id="bdEvidence"></div><section class="bid-step hidden" id="bdAI"><h3>AI가 우선 확인할 원인</h3><p class="muted">선택한 행의 집계 수치와 API 지표만 설정된 AI로 보내요. 키워드명·ID·엑셀 원본은 보내지 않아요. 입찰 금액과 CSV는 바뀌지 않아요.</p><button type="button" class="btn sm" id="bdExplain">AI로 원인 해석</button><div id="bdNotes"></div></section>';
  document.body.append(d);
  const $=id=>d.querySelector('#'+id);
  let active=null, seq=0, tick=0, data=null;
  async function post(url,body,signal){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(r.status===404&&!r.headers.get('content-type')?.includes('json'))throw Error('서버를 다시 시작한 뒤 진단을 실행해 주세요.');const j=await r.json();if(!r.ok)throw Error(j.error||'진단을 가져오지 못했어요.');return j;}
  function stop(msg=''){seq++;active?.abort();active=null;clearInterval(tick);$('bdStop').classList.add('hidden');$('bdStatus').textContent=msg;$('bdExplain').disabled=!data?.ticket;}
  function start(text){stop();const now=Date.now();active=new AbortController();const step=()=>{$('bdStatus').textContent=text+' · '+Math.floor((Date.now()-now)/1000)+'초';};step();tick=setInterval(step,1000);$('bdStop').classList.remove('hidden');$('bdExplain').disabled=true;return {key:seq,signal:active.signal};}
  $('bdClose').onclick=()=>{stop();d.close();};$('bdStop').onclick=()=>stop('진단을 중지했어요.');d.addEventListener('close',()=>stop());d.addEventListener('cancel',()=>stop());
  function evidence(j){
    const {market:m,trend:t,metrics:{before:a,after:b}}=j;
    const box=(t,x)=>'<div class="card bid-diag-card"><h3>'+t+'</h3>'+x+'</div>';
    const source='<p class="muted">'+sourced('https://ads.naver.com/help/faq/1639','검색광고 키워드 도구')+' · 조회일 기준 지표이며 성과 집계 기간과 달라요. 경쟁정도·평균 노출 광고수는 기기별 데이터랩 지표와 별개예요.</p>';
    const snap=r=>'<p>'+esc(r.at)+' 조회 · PC 월간검색수 '+n(r.pc)+' / 모바일 '+n(r.mo)+' · 경쟁 '+n(r.comp)+' · 평균 노출 광고수 '+n(r.depth,1)+'</p>';
    const index=r=>esc(r.from)+' ~ '+esc(r.to)+' 평균 '+n(r.avg,1)+'점 ('+n(r.observed)+'/'+n(r.days)+'일 관측)';
    const market=box('광고 경쟁 관측',m?(m.previous?snap(m.previous):'')+snap(m.current)+source:'<p class="muted">확인할 수 있는 경쟁 조회값이 없어요.</p>');
    const trend=box('검색 수요 지표',t?'<p>'+index(t.before)+'</p><p>'+index(t.after)+(t.delta==null?'':' · '+(t.delta>0?'+':'')+pct(t.delta))+'</p><p class="muted">'+sourced('https://developers.naver.com/docs/serviceapi/datalab/search','네이버 데이터랩')+' · 두 기간을 한 번에 조회한 상대 지수예요. 절대 검색 건수가 아니에요.</p>':'<p class="muted">비교 가능한 검색 지수가 없어요.</p>');
    const pair=(k,fmt=n)=>a?fmt(a[k])+' → '+fmt(b?.[k]):fmt(b?.[k]);
    const met=box('데일리리포트 실측',a||b?'<p>노출 '+pair('imp')+' · 클릭 '+pair('clicks')+' · 신청 '+pair('conv')+' · 순위 '+pair('rank',v=>n(v,1))+'</p><p>클릭률 '+pair('ctr',pct)+' · CPC '+pair('cpc',won)+' · 방문/클릭 '+pair('visitRate',pct)+' · 신청/방문 '+pair('applyRate',pct)+'</p><p>CPA '+pair('cpa',won)+' · 추정 ROAS '+pair('roas',pct)+'</p>':'<p class="muted">확인된 데일리 성과 없음</p>');
    $('bdEvidence').innerHTML=market+trend+met+(j.messages?.length?'<ul class="muted">'+j.messages.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'');
    $('bdAI').classList.remove('hidden');$('bdExplain').textContent=j.model?'AI로 원인 해석 · '+j.model:'AI로 원인 해석';$('bdNotes').textContent=j.explainStatus||'';
  }
  async function open(q){
    stop();data=null;$('bdEvidence').replaceChildren();$('bdNotes').replaceChildren();$('bdAI').classList.add('hidden');$('bdTitle').textContent=q.keyword.replace(/\s+/g,'')+' · 시장·성과 진단';$('bdHead').textContent=(device[q.device]||'기기 미확인')+' · 이 진단은 입찰 금액을 바꾸지 않아요.';
    if(!d.open)d.showModal();const {key,signal}=start('네이버 근거 조회 중');
    try{const j=await post('/api/bid-diagnosis',q,signal);if(key!==seq)return;data=j;evidence(j);stop('네이버 근거 조회 완료');}
    catch(e){if(key===seq)stop(e.message);}
  }
  $('bdExplain').onclick=async()=>{
    if(!data?.ticket)return;
    const {key,signal}=start((data.model||'설정된 AI')+' 해석 중');
    try{const j=await post('/api/bid-diagnosis/explain',{ticket:data.ticket},signal);if(key!==seq)return;
      $('bdNotes').innerHTML=(j.notes?.length?'<p class="muted">'+esc(j.model||'AI')+' · 다음은 근거와 맞는 가설이며, 원인이 확정된 것은 아니에요.</p><ol>'+j.notes.map(x=>'<li><b>'+esc(x.title)+'</b><p>'+esc(x.why)+'</p><p class="muted">다음 확인: '+esc(x.next)+'</p></li>').join('')+'</ol>':'<p class="muted">'+esc(j.message)+'</p>');stop('AI 해석 완료');}
    catch(e){if(key===seq)stop(e.message);}
  };
  window.BidDiagnosis={open};
})();
