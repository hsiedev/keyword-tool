(() => {
  const R=window.BidRules, $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={daily:'데일리리포트',naver:'네이버 키워드 파일',previous:'이전 데일리리포트'};
  const states={up:'상향',down:'하향',keep:'유지',hold:'보류'};
  const keys=['group','device','cpa','from','to','nFrom','nTo','download','pFrom','pTo','scopeOK'];
  const newId=()=>crypto.randomUUID();
  const fresh=()=>({id:newId(),files:{},title:'',settings:{},at:0});
  const exported=new Map();
  let doc=fresh(), result=null, list=[], sel=new Set(), applied=new Set(), pg=0, filt='', query='', loads={}, serial=0, opening=0;
  const v=document.createElement('div');
  v.id='bidView'; v.className='hidden';
  const source=k=>'<div class="card bid-source"><h3>'+labels[k]+'</h3><div class="drop"><label class="ext">파일 선택<input id="bidFile-'+k+'" type="file" accept=".xlsx,.xlsm,.csv,.tsv" hidden></label><span class="muted"> · 엑셀 / CSV</span></div><details><summary>엑셀 표 붙여넣기</summary><label class="muted" for="bidPaste-'+k+'">머리글을 포함해 붙여넣으세요.</label><textarea id="bidPaste-'+k+'" class="inp" rows="3"></textarea><button type="button" class="btn sm" id="bidRead-'+k+'">붙여넣기 읽기</button></details><p class="muted bid-source-status" id="bidInfo-'+k+'" role="status"></p><label id="bidSheetBox-'+k+'" class="hidden">시트 <select class="hsel" id="bidSheet-'+k+'"></select></label><button type="button" class="btn sm hidden" id="bidRemove-'+k+'">자료 빼기</button></div>';
  const date=(id,label)=>'<label>'+label+'<input class="inp" id="bid-'+id+'" type="date"></label>';
  v.innerHTML='<div class="ai-wrap"><aside id="bidSide" class="side"></aside><main class="ai-main bid-main"><div class="sec bid-track-nav" aria-label="입찰 화면 선택"><button type="button" class="btn pri" id="bidReviewTab" aria-pressed="true">입찰 조정</button> <button type="button" class="btn" id="bidTrackTab" aria-pressed="false">입찰가 트래킹</button></div><div id="bidTrackPane" class="hidden"></div><div id="bidReviewPane"><div class="sec"><h2>키워드 입찰가 조정</h2><p class="muted">광고그룹 하나씩 검토해요. 파일은 이 브라우저에서만 처리하고, 네이버에 자동 업로드하지 않아요.</p>'+window.WorkTitle.field('bidTitle')+'<div class="grid g2">'+source('daily')+source('naver')+'</div>'
    +'<div class="card bid-step"><h3>분석 기준</h3><div class="bid-fields"><label>광고그룹 이름<input class="inp" id="bid-group" placeholder="예: 광고그룹 이름" maxlength="150"></label><label>기기<select class="inp" id="bid-device"><option value="">선택</option><option value="pc">PC</option><option value="mo">모바일</option><option value="both">PC·모바일 합산</option></select></label><label>목표 CPA (원)<input class="inp" id="bid-cpa" type="number" min="1" step="1" placeholder="예: 6500"></label></div><p class="muted">보고서의 비용 기준(VAT·마크업 포함 여부)과 같은 기준의 목표 CPA를 입력하세요.</p>'
    +'<fieldset><legend>데일리리포트 성과 기간</legend><div class="bid-fields">'+date('from','성과 시작일')+date('to','성과 종료일')+'</div></fieldset><fieldset><legend>네이버 파일</legend><div class="bid-fields">'+date('nFrom','조회 시작일')+date('nTo','조회 종료일')+date('download','다운로드일')+'</div><p class="muted">네이버에서 데일리와 같은 기간을 조회한 파일을 넣으세요. 조회 종료일과 다운로드일은 별개예요.</p></fieldset><label class="bid-check"><input id="bid-scopeOK" type="checkbox"> 두 파일이 같은 광고그룹·기기 기준임을 확인했어요.</label><div id="bidPeriod" class="muted" role="status"></div>'
    +'<details class="bid-step" id="bidOptional"><summary>이전 기간과 비교 (선택 · 순위 하락 확인 및 상향 판단)</summary><p class="muted">같은 그룹·기기에서, 현재와 같은 길이의 겹치지 않는 이전 데일리리포트를 넣으세요.</p><div class="bid-fields">'+date('pFrom','이전 시작일')+date('pTo','이전 종료일')+'</div>'+source('previous')+'</details></div><div class="bid-tools"><button type="button" class="btn pri" id="bidRun">입찰 조정 분석</button><span role="status" id="bidStatus" class="muted"></span></div></div>'
    +'<section class="sec hidden" id="bidResults"><h2>키워드별 검토</h2><p class="muted" id="bidSummary"></p><div id="bidWarnings"></div><div class="bid-tools"><label>결과 <select id="bidFilter" class="hsel"><option value="">전체</option><option value="down">하향</option><option value="up">상향</option><option value="keep">유지</option><option value="hold">보류</option><option value="naver">네이버 파일에만 있음</option><option value="applied">적용 완료</option></select></label><label>키워드 <input id="bidSearch" class="inp" type="search" placeholder="검색"></label><button type="button" class="btn sm" id="bidPick">현재 필터의 변경 후보 선택</button><button type="button" class="btn pri" id="bidApply">선택 적용</button></div><p class="muted" id="bidSelection" role="status"></p><div id="bidRows"></div><div class="bid-tools" id="bidPages"><button type="button" id="bidBack" class="btn sm">이전</button><span id="bidPage"></span><button type="button" id="bidNext" class="btn sm">다음</button></div><div class="bid-tools"><button type="button" id="bidCsv" class="btn pri">네이버 양식 CSV 다운로드</button><button type="button" id="bidTxt" class="btn">검토 TXT 다운로드</button><button type="button" id="bidUndo" class="btn sm">적용 해제</button><button type="button" class="btn" id="bidTrackSave">트래킹에 저장</button><span id="bidDownloadHelp" class="muted"></span></div></section></div></main></div>';
  $('main').after(v);
  const node=(k,id)=>$('bid'+k+'-'+id);
  const isoToday=()=>R.dayKst();
  const won=v=>v==null?'미확인':Math.round(v).toLocaleString('ko-KR')+'원';
  const num=v=>v==null?'미확인':v.toLocaleString('ko-KR');
  const percent=v=>v==null?'미확인':(v*100).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
  const delta=r=>(r.delta>0?'+':'−')+won(Math.abs(r.delta))+' ('+(r.delta>0?'+':'−')+percent(Math.abs(r.percent))+')';
  const get=k=>{const f=doc.files[k];return f?.sheets[f.selected]?.rows||[];};
  function say(s){$('bidStatus').textContent=s;}
  function readForm(){ doc.title=$('bidTitle').value; doc.settings=Object.fromEntries(keys.map(k=>[k,k==='scopeOK'?node('',k).checked:node('',k).value])); }
  function writeForm(){ $('bidTitle').value=doc.title; for(const k of keys) {const e=node('',k);if(k==='scopeOK')e.checked=!!doc.settings[k];else e.value=doc.settings[k]||'';if(e.type==='date')e.max=isoToday();} }
  function paintPeriod(){
    const s=doc.settings,p=R.period(s);
    const note=!(s.from&&s.to&&s.nFrom&&s.nTo)?'두 파일을 조회한 실제 기간을 각각 입력하세요.':p.same?'두 조회 기간 일치':'두 조회 기간 불일치 · 진단은 가능하지만 변경 적용은 보류해요.';
    $('bidPeriod').textContent=note;
  }
  function invalidate(){ if(result) say('입력값이 바뀌었어요. 다시 분석하면 새 변경안이 나와요.'); serial++; result=null; pg=0; sel.clear(); applied.clear(); exported.clear(); $('bidResults').classList.add('hidden'); }
  for(const k of keys) node('',k).addEventListener('input',()=>{readForm();invalidate();paintPeriod();});
  $('bidTitle').oninput=readForm;
  function paintFile(k){
    const f=doc.files[k], t=node('Sheet',k), busy=loads[k]?.busy;
    node('Info',k).textContent=busy?'파일 읽는 중…':loads[k]?.error || (f?f.name+' · '+f.sheets[f.selected].rows.length.toLocaleString('ko-KR')+'행':'파일을 선택하거나 표를 붙여넣으세요.');
    node('SheetBox',k).classList.toggle('hidden',!f||f.sheets.length<2);node('Remove',k).classList.toggle('hidden',!f&&!busy);
    t.replaceChildren(); if(f){f.sheets.forEach((s,i)=>t.add(new Option(s.name,i)));t.value=f.selected;}
    $('bidRun').disabled=Object.values(loads).some(x=>x.busy);
  }
  async function load(k, getSheets, name){
    const token={busy:true}; loads[k]=token; delete doc.files[k]; invalidate(); paintFile(k);
    try {
      const sheets=await getSheets(); if(loads[k]!==token)return;
      const kind=k==='naver'?'naver':'daily', found=[]; let issue='';
      for(const s of sheets) { try { const p=R.parseSheet(s.rows,kind); if(p?.rows.length)found.push({name:s.name, rows:p.rows}); } catch(e) {issue=e.message;} }
      if(!found.length) throw Error(issue|| (kind==='naver'?'키워드·키워드 ID·입찰가·상태 머리글과 데이터가 필요해요.':'키워드(또는 그룹)·클릭·비용·신청·추정 실적 머리글과 데이터가 필요해요.'));
      doc.files[k]={sheets:found,selected:0,name};
    }catch(e){if(loads[k]===token)token.error=e.message;}
    finally{if(loads[k]===token){token.busy=false;paintFile(k);}}
  }
  for(const k in labels) {
    node('File',k).onchange=e=>{const f=e.target.files[0]; e.target.value=''; if(f)load(k,()=>{if(f.size>30*1024*1024)throw Error('30MB 이하 파일로 나눠서 넣어 주세요.');return window.XlsxLite.readFile(f,{raw:true,csvHeader:r=>R.header(r,k==='naver'?'naver':'daily')});},f.name);};
    node('Read',k).onclick=()=>{const box=node('Paste',k), str=box.value; if(!str.trim()){node('Info',k).textContent='머리글과 데이터를 먼저 붙여넣으세요.';return;} load(k,()=>{if(str.length>15000000)throw Error('붙여넣기 데이터가 너무 커요. 파일로 넣어 주세요.'); return [{name:'붙여넣은 표',rows:window.XlsxLite.parseTsv(str,{raw:true})}];},'붙여넣은 표');};
    node('Sheet',k).onchange=e=>{doc.files[k].selected=+e.target.value;invalidate();paintFile(k);};
    node('Remove',k).onclick=()=>{delete doc.files[k];delete loads[k]; node('Paste',k).value='';invalidate();paintFile(k);};
  }
  function openDB(){return new Promise((ok,no)=>{const r=indexedDB.open('kt-bid-review',1);r.onupgradeneeded=()=>r.result.createObjectStore('cases',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
  async function dbCall(mode,fn){const db=await openDB();try{return await new Promise((ok,no)=>{const tx=db.transaction('cases',mode);const r=fn(tx.objectStore('cases'));tx.oncomplete=()=>ok(r.result);tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});}finally{db.close();}}
  const title=d=>window.WorkTitle.clean(d.title)||d.settings.group||'입찰가 조정';
  async function listCases(){list=(await dbCall('readonly',s=>s.getAll())).map(d=>({id:d.id,name:title(d),at:d.at,cpa:d.settings.cpa})).sort((a,b)=>b.at-a.at);paintSide();}
  function paintSide(){
    $('bidSide').innerHTML='<button type="button" class="btn pri newbtn" id="bidNew">+ 새 입찰 검토</button><div class="side-h">입찰 검토 내역</div>'+(list.length?list.map(x=>'<div class="bid-history"><button type="button" class="sit '+(x.id===doc.id?'on':'')+'" data-case="'+esc(x.id)+'"><span class="sn">'+esc(x.name)+'</span><span class="sm">'+(x.cpa?'목표 CPA '+won(+x.cpa):'목표 CPA 미입력')+'</span></button><button type="button" class="btn sm bid-del" data-case-del="'+esc(x.id)+'" aria-label="'+esc(x.name)+' 삭제">삭제</button></div>').join(''):'<p class="muted as-empty">분석한 작업이 브라우저에 저장돼요.</p>');
    $('bidNew').onclick=()=>{reset();$('bidTitle').focus();};
    $('bidSide').querySelectorAll('[data-case]').forEach(b=>b.onclick=async()=>{ const token=++opening; try{const saved=await dbCall('readonly',s=>s.get(b.dataset.case));if(saved&&token===opening){showTrack(false);useDoc(saved);run(false);}}catch{say('검토 내역을 열지 못했어요.');}});
    $('bidSide').querySelectorAll('[data-case-del]').forEach(b=>b.onclick=async()=>{if(!await window.uiConfirm('이 입찰 검토 내역을 이 브라우저에서 삭제할까요?'))return;try{const id=b.dataset.caseDel;await dbCall('readwrite',s=>s.delete(id));if(doc.id===id)reset();await listCases();}catch{say('검토 내역을 삭제하지 못했어요.');}});
  }
  function useDoc(d){doc=d;loads={};invalidate();writeForm();paintPeriod();for(const k in labels){node('Paste',k).value='';paintFile(k);} $('bidOptional').open=!!(doc.files.previous||doc.settings.pFrom||doc.settings.pTo); filt='';query='';$('bidFilter').value='';$('bidSearch').value='';say('');paintSide();}
  function reset(){opening++;showTrack(false);useDoc(fresh());return '새 입찰 검토를 열었어요. 저장한 내역은 그대로 있어요.';}
  window.__RESET_bid=reset;
  function run(save=true){
    readForm(); if(!get('daily').length||!get('naver').length){say('데일리리포트와 네이버 키워드 파일을 모두 넣어 주세요.');return;}
    invalidate(); result=R.evaluate({daily:get('daily'),naver:get('naver'),previous:get('previous'),settings:doc.settings}); say(''); paint();
    if(save){doc.at=Date.now(); const saved=doc, rev=serial; dbCall('readwrite',s=>s.put(saved)).then(listCases).catch(()=>{if(rev===serial)say('이 브라우저에 내역을 저장하지 못했어요. 이번 결과는 계속 사용할 수 있어요.');});}
  }
  $('bidRun').onclick=()=>run();
  const eligible=r=>Boolean(r?.n && (r.state==='up'||r.state==='down'));
  function rowsFiltered(){
    if(!result)return [];
    const needle=query.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
    if(filt==='naver')return result.naverOnly.filter(n=>n.kk.includes(needle)).map(n=>({n,state:'hold',reason:'데일리 성과가 없어서 변경하지 않아요.'}));
    return result.rows.filter(r=>r.d.kk.includes(needle)&&(!filt||(filt==='applied'?applied.has(r.n?.id):filt===r.state)));
  }
  function exportables(){return rowsFiltered().filter(r=>eligible(r)&&applied.has(r.n.id));}
  function controls(){
    const current=rowsFiltered(), count=current.filter(eligible).length, out=exportables().length;
    $('bidPick').disabled=!count; $('bidApply').disabled=!sel.size; $('bidUndo').disabled=!applied.size; $('bidCsv').disabled=!out; $('bidTxt').disabled=!current.length;
    $('bidSelection').textContent='선택 '+num(sel.size)+'개 · 적용 '+num(applied.size)+'개 · 현재 필터에서 CSV에 들어갈 행 '+num(out)+'개';
    $('bidDownloadHelp').textContent=out>10000?'10,000행 단위로 '+Math.ceil(out/10000)+'개 파일을 준비해요.': 'CSV는 현재 필터의 적용된 행만 담아요.';
  }
  function renderRow(r){
    const {d,n}=r, approved=applied.has(n?.id), choice=eligible(r), label=states[r.state];
    const amounts=choice?won(n.bid)+' → '+won(r.bid)+' · '+delta(r):(n?'현재 '+won(n.bid):'현재 입찰가 없음');
    const metrics=d?'클릭 '+num(d.clicks)+' · 신청 '+num(d.conv)+' · 비용 '+won(d.cost)+' · CPA '+(r.cpa==null?'해당 없음':won(r.cpa))+' · 추정 ROAS '+percent(r.roas):'네이버 클릭 '+num(n.clicks)+' · 노출 '+num(n.imp);
    const details=d?'<details><summary>근거 수치 보기</summary><p>데일리 순위 '+num(d.rank)+' · 순방문 '+num(d.visits)+' · 실제 CPC '+won(r.cpc)+' · 허용 CPC '+won(r.allowed)+'</p>'+(n?'<p>네이버 키워드 ID '+esc(n.id||'미확인')+' · 통검 순위 PC '+num(n.pc)+' / 모바일 '+num(n.mo)+' · 수정 '+esc(n.modified||'미확인')+'</p>':'')+'</details>':'';
    return '<article class="card bid-result"><div class="bid-line"><div>'+(choice?'<label class="bid-choice"><input type="checkbox" data-bid-id="'+esc(n.id)+'" '+(sel.has(n.id)?'checked':'')+' aria-label="'+esc(d.kw)+' 변경 선택">':'')+'<b>'+esc(d?.kw||n.kw)+'</b>'+(choice?'</label>':'')+' <span class="bid-pill">'+label+(approved?' · 적용됨':'')+'</span></div><strong>'+esc(amounts)+'</strong></div><p>'+esc(metrics)+'</p><p class="muted">'+esc(r.reason)+'</p>'+(r.notes?.length?'<ul class="muted">'+r.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+details+'</article>';
  }
  function paint(){
    if(!result)return;
    $('bidResults').classList.remove('hidden');
    const {rows,matched,naverOnly,p,discrep}=result;
    $('bidSummary').textContent='데일리 '+num(rows.length)+'개 · 매칭 '+num(matched)+'개 · 네이버에만 '+num(naverOnly.length)+'개 · 상향 '+num(rows.filter(r=>r.state==='up').length)+'개 / 하향 '+num(rows.filter(r=>r.state==='down').length)+'개';
    $('bidWarnings').innerHTML=p.errors.map(m=>'<p class="bid-warning">'+esc(m)+'</p>').join('')+(discrep?'<p class="muted">'+num(discrep)+'개 키워드의 클릭수가 자료 간에 달라요. 성과는 데일리 수치만 사용했어요.</p>':'')+(doc.files.previous&&!p.before?'<p class="bid-warning">이전 기간이 비어 있거나 길이가 다르거나 현재와 겹쳐 비교하지 않아요.</p>':'');
    const rr=rowsFiltered(), max=Math.max(1,Math.ceil(rr.length/50));pg=Math.min(pg,max-1);
    $('bidRows').innerHTML=rr.slice(pg*50,(pg+1)*50).map(renderRow).join('')||'<p class="muted">이 조건에 맞는 키워드가 없어요.</p>';
    $('bidPage').textContent=(pg+1)+' / '+max+' 페이지';$('bidBack').disabled=pg===0;$('bidNext').disabled=pg+1>=max;$('bidPages').classList.toggle('hidden',max===1);
    $('bidRows').querySelectorAll('[data-bid-id]').forEach(x=>x.onchange=()=>{if(x.checked)sel.add(x.dataset.bidId);else sel.delete(x.dataset.bidId);controls();});controls();
  }
  $('bidFilter').onchange=e=>{filt=e.target.value;pg=0;sel.clear();paint();};
  $('bidSearch').oninput=e=>{query=e.target.value;pg=0;sel.clear();paint();};
  $('bidBack').onclick=()=>{pg=Math.max(0,pg-1);paint();};$('bidNext').onclick=()=>{pg++;paint();};
  $('bidPick').onclick=()=>{rowsFiltered().filter(eligible).forEach(r=>sel.add(r.n.id));paint();};
  function gate(){const p=R.period(doc.settings);if(!p.errors.length)return true; window.toast?.(p.errors[0],'error');return false;}
  $('bidApply').onclick=()=>{if(!result||!gate())return;rowsFiltered().filter(r=>eligible(r)&&sel.has(r.n.id)).forEach(r=>applied.add(r.n.id));sel.clear();paint();};
  $('bidUndo').onclick=()=>{applied.clear();sel.clear();paint();};
  function dl(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
  $('bidCsv').onclick=async()=>{
    if(!gate())return;const rev=serial, selected=exportables(), b=$('bidCsv'); b.disabled=true;
    try {const template=await fetch('ko_edit_keyword_bid_template.csv');if(!template.ok)throw Error('네이버 CSV 원본을 불러오지 못했어요.');const bytes=new Uint8Array(await template.arrayBuffer());const live=exportables();if(rev!==serial||!gate()||selected.length!==live.length||selected.some((r,i)=>r!==live[i]))return;
      const files=R.csvFiles(bytes,selected.map(r=>({id:r.n.id,gid:r.n.gid,kw:r.n.kw, bid:r.bid,before:r.n.bid})));
      if(files.length===1){dl(new Blob([files[0]],{type:'text/csv;charset=windows-949'}),'ko_edit_keyword_bid_template.csv');selected.forEach(r=>exported.set(r.n.id,r.bid));}
      else { // Browser multiple-download permissions can block bulk downloads. Offer each part explicitly.
        $('bidDownloadHelp').replaceChildren(...files.map((f,i)=>{const a=document.createElement('button');a.type='button';a.className='btn sm';a.textContent=(i+1)+'번 파일';a.onclick=()=>{if(rev===serial&&gate()){dl(new Blob([f],{type:'text/csv;charset=windows-949'}),'ko_edit_keyword_bid_template_'+(i+1)+'.csv');selected.slice(i*10000,(i+1)*10000).forEach(r=>exported.set(r.n.id,r.bid));}};return a;}));return;}
    }catch(e){window.toast?.(e.message,'error');}finally{b.disabled=!exportables().length;}
  };
  $('bidTxt').onclick=()=>{
    const s=doc.settings;const summary=[title(doc),'광고그룹 '+s.group+' · 기기 '+({pc:'PC',mo:'모바일',both:'PC·모바일'}[s.device]||'미입력'),'목표 CPA '+(s.cpa?won(+s.cpa):'미입력'),'성과 기간 '+s.from+' ~ '+s.to+' / 네이버 조회 '+s.nFrom+' ~ '+s.nTo+' / 다운로드 '+s.download,''];
    for(const r of rowsFiltered())summary.push((r.d?.kw||r.n.kw).replace(/\s+/g,'')+' | '+states[r.state]+(applied.has(r.n?.id)?' · 적용됨':'')+' | '+(eligible(r)?won(r.n.bid)+' → '+won(r.bid)+' · '+delta(r):r.n?won(r.n.bid):'입찰가 없음')+'\r\n'+r.reason+(r.notes?.length?'\r\n'+r.notes.join('\r\n'):''),'');
    dl(new Blob(['\ufeff'+summary.join('\r\n')],{type:'text/plain;charset=utf-8'}),'입찰가_검토.txt');
  };
  window.__BID={show(on){v.classList.toggle('hidden',!on);if(!on)return;for(const id of ['main','banners','tabs'])$(id)?.classList.add('hidden');history.replaceState(null,'',location.pathname+location.search+'#bid');},hide(){v.classList.add('hidden');}};
  function captureTracking(){
    if(!result)throw Error('입찰 조정 분석부터 실행해 주세요.');
    const s=doc.settings,p=R.period(s), groups=[...new Set(get('naver').map(n=>n.gid).filter(Boolean))];
    if(!p.same||!s.scopeOK||groups.length>1||result.p.errors.some(e=>e.includes('광고그룹')))throw Error('두 파일의 조회 기간, 광고그룹·기기를 맞춘 뒤 저장해 주세요.');
    const base=(n,d,r)=>({kw:d?.kw||n.kw,id:n?.id,bid:n?.bid,approved:applied.has(n?.id)?r?.bid:null,csv:exported.get(n?.id),status:n?.status,state:r?.state,reason:r?[r.reason,...(r.notes||[])].join(' · '):'',metric:d||null});
    const rows=[...result.rows.map(r=>base(r.n,r.d,r)),...result.naverOnly.map(n=>base(n))];
    return window.BidTrackRules.normalize({title:title(doc),group:s.group,gid:groups[0],device:s.device,from:s.from,to:s.to,nFrom:s.nFrom,nTo:s.nTo,download:s.download,target:Number(s.cpa),rows});
  }
  const tracker=window.BidTracking.mount($('bidTrackPane'),{capture:captureTracking,flash:(m,bad)=>window.toast?.(m,bad?'error':'ok')});
  function showTrack(on){
    $('bidReviewPane').classList.toggle('hidden',on);$('bidTrackPane').classList.toggle('hidden',!on);
    for(const [id,active] of [['bidReviewTab',!on],['bidTrackTab',on]]){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('pri',active);}
    if(on)tracker.refresh();
  }
  $('bidReviewTab').onclick=()=>showTrack(false);$('bidTrackTab').onclick=()=>showTrack(true);
  $('bidTrackSave').onclick=()=>tracker.save($('bidTrackSave'));
  useDoc(doc);listCases().catch(()=>{});
})();
