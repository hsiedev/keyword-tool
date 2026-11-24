(() => {
  const R=window.BidRules, $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={daily:'데일리리포트',naver:'네이버 키워드 파일',previous:'이전 데일리리포트'};
  const states={up:'상향',down:'하향',keep:'유지',hold:'자동 추천 보류'};
  const holdLabels={match:'매칭 실패·중복',id:'ID 확인',bid:'현재가 확인',status:'노출 상태 확인',type:'입찰가 유형 확인',settings:'분석 조건 확인',noSample:'클릭·비용 표본 없음',missing:'집계 확인',missingConversion:'신청 미확인',modifiedUnknown:'수정시각 미확인',modified:'성과 기간 중 수정 기록',smallSample:'표본 부족'};
  const keys=['group','device','cpa','from','to','nFrom','nTo','download','pFrom','pTo','scopeOK'];
  const newId=()=>crypto.randomUUID();
  const fresh=()=>({id:newId(),files:{},title:'',settings:{},at:0});
  const exported=new Map(), edits=new Map();
  let doc=fresh(), result=null, list=[], sel=new Set(), applied=new Map(), pg=0, filt='', query='', holdFilter='', sortCol='', sortDir=1, pageSize=50, loads={}, serial=0, opening=0;
  const v=document.createElement('div');
  v.id='bidView'; v.className='hidden';
  const source=k=>'<div class="card bid-source"><h3>'+labels[k]+'</h3><div class="drop"><label class="ext">파일 선택<input id="bidFile-'+k+'" type="file" accept=".xlsx,.xlsm,.csv,.tsv" hidden></label><span class="muted"> · 엑셀 / CSV</span></div><details><summary>엑셀 표 붙여넣기</summary><label class="muted" for="bidPaste-'+k+'">머리글을 포함해 붙여넣으세요.</label><textarea id="bidPaste-'+k+'" class="inp" rows="3"></textarea><button type="button" class="btn sm" id="bidRead-'+k+'">붙여넣기 읽기</button></details><p class="muted bid-source-status" id="bidInfo-'+k+'" role="status"></p><label id="bidSheetBox-'+k+'" class="hidden">시트 <select class="hsel" id="bidSheet-'+k+'"></select></label><button type="button" class="btn sm hidden" id="bidRemove-'+k+'">자료 빼기</button></div>';
  const date=(id,label)=>'<label>'+label+'<input class="inp" id="bid-'+id+'" type="date"></label>';
  v.innerHTML='<div class="ai-wrap"><aside id="bidSide" class="side"></aside><main class="ai-main bid-main"><div class="sec bid-track-nav" aria-label="입찰 화면 선택"><button type="button" class="btn pri" id="bidReviewTab" aria-pressed="true">입찰 조정</button> <button type="button" class="btn" id="bidTrackTab" aria-pressed="false">입찰가 트래킹</button></div><div id="bidTrackPane" class="hidden"></div><div id="bidReviewPane"><div class="sec"><h2>키워드 입찰가 조정</h2><p class="muted">광고그룹 하나씩 검토해요. 파일은 이 브라우저에서만 처리하고, 네이버에 자동 업로드하지 않아요.</p>'+window.WorkTitle.field('bidTitle')+'<div class="grid g2">'+source('daily')+source('naver')+'</div>'
    +'<div class="card bid-step"><h3>분석 기준</h3><div class="bid-fields"><label>광고그룹 이름<input class="inp" id="bid-group" placeholder="예: 광고그룹 이름" maxlength="150"></label><label>기기<select class="inp" id="bid-device"><option value="">선택</option><option value="pc">PC</option><option value="mo">모바일</option><option value="both">PC·모바일 합산</option></select></label><label>목표 CPA (원)<input class="inp" id="bid-cpa" type="number" min="1" step="1" placeholder="예: 6500"></label></div><p class="muted">보고서의 비용 기준(VAT·마크업 포함 여부)과 같은 기준의 목표 CPA를 입력하세요.</p>'
    +'<fieldset><legend>데일리리포트 성과 기간</legend><div class="bid-fields">'+date('from','성과 시작일')+date('to','성과 종료일')+'</div></fieldset><fieldset><legend>네이버 파일</legend><div class="bid-fields">'+date('nFrom','조회 시작일')+date('nTo','조회 종료일')+date('download','다운로드일')+'</div><p class="muted">네이버에서 데일리와 같은 기간을 조회한 파일을 넣으세요. 조회 종료일과 다운로드일은 별개예요.</p></fieldset><label class="bid-check"><input id="bid-scopeOK" type="checkbox"> 두 파일이 같은 광고그룹·기기 기준임을 확인했어요.</label><div id="bidPeriod" class="muted" role="status"></div>'
    +'<details class="bid-step" id="bidOptional"><summary>이전 기간과 비교 (선택 · 순위 하락 확인 및 상향 판단)</summary><p class="muted">같은 그룹·기기에서, 현재와 같은 길이의 겹치지 않는 이전 데일리리포트를 넣으세요.</p><div class="bid-fields">'+date('pFrom','이전 시작일')+date('pTo','이전 종료일')+'</div>'+source('previous')+'</details></div><div class="bid-tools"><button type="button" class="btn pri" id="bidRun">입찰 조정 분석</button><span role="status" id="bidStatus" class="muted"></span></div></div>'
    +'<section class="sec hidden" id="bidResults"><h2>키워드별 검토</h2><p class="muted" id="bidSummary"></p><p class="muted">자동 추천가는 목표 CPA 규칙으로 계산해요. AI 판단은 각 행의 [AI 진단]에서 근거 확인 후 모델을 골라 원인을 해석할 수 있어요.</p><div id="bidWarnings"></div><div id="bidHolds" class="bid-hold-tools" aria-label="보류 유형별 빠른 필터"></div><div class="bid-tools"><label>결과 <select id="bidFilter" class="hsel"><option value="">전체</option><option value="down">하향</option><option value="up">상향</option><option value="keep">유지</option><option value="hold">보류</option><option value="naver">네이버 파일에만 있음</option><option value="applied">적용 완료</option></select></label><label>키워드 <input id="bidSearch" class="inp" type="search" placeholder="검색"></label><button type="button" class="btn sm" id="bidPick">현재 필터의 변경 후보 선택</button><button type="button" class="btn pri" id="bidApply">선택 적용</button></div><p class="muted" id="bidSelection" role="status"></p><div class="tbl-wrap bid-table-wrap" tabindex="0" role="region" aria-label="입찰 검토 표 · 가로 스크롤 가능"><table class="rel" id="bidTable" aria-label="키워드별 입찰 검토"><thead></thead><tbody id="bidRows"></tbody></table></div><div class="bid-tools" id="bidPages"><button type="button" id="bidBack" class="btn sm">이전</button><span id="bidPage"></span><label>페이지당 <select id="bidPageSize" class="hsel"><option>25</option><option selected>50</option><option>100</option></select></label><button type="button" id="bidNext" class="btn sm">다음</button></div><div class="bid-tools"><button type="button" id="bidCsv" class="btn pri">네이버 양식 CSV 다운로드</button><button type="button" id="bidTxt" class="btn">검토 TXT 다운로드</button><button type="button" id="bidUndo" class="btn sm">적용 해제</button><button type="button" class="btn" id="bidTrackSave">트래킹에 저장</button><span id="bidDownloadHelp" class="muted"></span></div></section></div></main></div>';
  $('main').after(v);
  const detail=document.createElement('dialog');detail.id='bidRowDetail';detail.className='bid-row-dialog';detail.setAttribute('aria-labelledby','bidRowTitle');
  detail.innerHTML='<header class="bid-line"><h2 id="bidRowTitle"></h2><form method="dialog"><button class="btn sm">닫기</button></form></header><div id="bidRowFacts"></div>';
  v.append(detail);
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
    const note=!(s.from&&s.to&&s.nFrom&&s.nTo)?'두 파일을 조회한 실제 기간을 각각 입력하세요.':p.same?'두 조회 기간 일치':'두 조회 기간 불일치 · 자동 추천은 보류해요.';
    $('bidPeriod').textContent=note;
  }
  function invalidate(){ if(result) say('입력값이 바뀌었어요. 다시 분석하면 새 변경안이 나와요.'); serial++; result=null; pg=0; sel.clear(); applied.clear(); exported.clear(); edits.clear(); $('bidResults').classList.add('hidden'); }
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
  function useDoc(d){doc=d;loads={};invalidate();writeForm();paintPeriod();for(const k in labels){node('Paste',k).value='';paintFile(k);} $('bidOptional').open=!!(doc.files.previous||doc.settings.pFrom||doc.settings.pTo); filt='';query='';holdFilter='';sortCol='';sortDir=1;$('bidFilter').value='';$('bidSearch').value='';say('');paintSide();}
  function reset(){opening++;showTrack(false);useDoc(fresh());return '새 입찰 검토를 열었어요. 저장한 내역은 그대로 있어요.';}
  window.__RESET_bid=reset;
  function run(save=true){
    readForm(); if(!get('daily').length||!get('naver').length){say('데일리리포트와 네이버 키워드 파일을 모두 넣어 주세요.');return;}
    invalidate(); result=R.evaluate({daily:get('daily'),naver:get('naver'),previous:get('previous'),settings:doc.settings}); say(''); paint();
    if(save){doc.at=Date.now(); const saved=doc, rev=serial; dbCall('readwrite',s=>s.put(saved)).then(listCases).catch(()=>{if(rev===serial)say('이 브라우저에 내역을 저장하지 못했어요. 이번 결과는 계속 사용할 수 있어요.');});}
  }
  $('bidRun').onclick=()=>run();
  const draft=r=>edits.has(r.n?.id)?edits.get(r.n.id):String(r.bid??'');
  const final=r=>R.finalBid(r,draft(r));
  const canApply=r=>!result.p.exportErrors.length&&final(r)!=null;
  function rowsFiltered(){
    if(!result)return [];
    const needle=query.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
    if(filt==='naver')return result.naverOnly.filter(n=>n.kk.includes(needle)).map(n=>({n,state:'hold',reason:'데일리 성과와 매칭되지 않아 변경에서 제외해요.',editBlock:'데일리 성과와 매칭되지 않아 변경에서 제외해요.'}));
    return result.rows.filter(r=>r.d.kk.includes(needle)&&(!filt||(filt==='applied'?applied.has(r.n?.id):filt===r.state))&&(!holdFilter||r.holdCode===holdFilter));
  }
  function exportables(){return rowsFiltered().filter(r=>canApply(r)&&applied.get(r.n.id)===final(r)).map(r=>({id:r.n.id,gid:r.n.gid,kw:r.n.kw,bid:applied.get(r.n.id),before:r.n.bid}));}
  const sameExport=(a,b)=>a.length===b.length&&a.every((r,i)=>r.id===b[i].id&&r.bid===b[i].bid);
  function controls(){
    const current=rowsFiltered(), count=current.filter(canApply).length, out=exportables().length;
    $('bidPick').disabled=!count; $('bidApply').disabled=!sel.size; $('bidUndo').disabled=!applied.size; $('bidCsv').disabled=!out; $('bidTxt').disabled=!current.length;
    $('bidSelection').textContent='선택 '+num(sel.size)+'개 · 적용 '+num(applied.size)+'개 · 현재 필터에서 CSV에 들어갈 행 '+num(out)+'개';
    $('bidPick').textContent='필터 전체 변경 후보 선택';
    $('bidDownloadHelp').textContent=out>10000?'10,000행 단위로 '+Math.ceil(out/10000)+'개 파일을 준비해요.': 'CSV는 현재 필터의 적용된 행만 담아요.';
  }
  const cols=[['keyword','키워드',r=>(r.d||r.n).kw],['current','현재가',r=>r.n?.bid],['recommend','자동 추천가',r=>r.bid],['final','최종가 (원)',r=>R.canEdit(r)?R.manualBid(draft(r)):null],['delta','증감',r=>R.canEdit(r)&&R.manualBid(draft(r))!=null?R.manualBid(draft(r))-r.n.bid:null],['status','상태 · 사유',r=>states[r.state]],['clicks','클릭',r=>r.d?.clicks],['conv','신청',r=>r.d?.conv],['cost','비용',r=>r.d?.cost],['cpa','CPA',r=>r.cpa]];
  function sortedRows(rows){
    const get=cols.find(c=>c[0]===sortCol)?.[2];if(!get)return rows;
    return rows.map(r=>[r,get(r)]).sort((a,b)=>{
      if(a[1]==null||b[1]==null)return a[1]==null?(b[1]==null?0:1):-1;
      return sortDir*(typeof a[1]==='number'?a[1]-b[1]:String(a[1]).localeCompare(b[1],'ko',{numeric:true}));
    }).map(([r])=>r);
  }
  function drawHead(){
    $('bidTable').tHead.innerHTML='<tr><th scope="col" class="bid-pick-cell"><input type="checkbox" id="bidCheckPage" aria-label="현재 페이지 변경 후보 전체 선택"></th>'+cols.map(([id,label])=>'<th scope="col" class="'+(id==='keyword'?'l bid-key-cell':id==='status'?'l':'bid-num')+'" '+(sortCol===id?'aria-sort="'+(sortDir===1?'ascending':'descending')+'"':'')+'><button type="button" data-bid-sort="'+id+'">'+label+' <span aria-hidden="true">'+(sortCol===id?(sortDir===1?'▲':'▼'):'↕')+'</span></button></th>').join('')+'<th scope="col" class="l">상세</th></tr>';
    $('bidTable').tHead.querySelectorAll('[data-bid-sort]').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.bidSort;sortDir=sortCol===k?-sortDir:(['keyword','status'].includes(k)?1:-1);sortCol=k;pg=0;paint(true);$('bidTable').tHead.querySelector('[data-bid-sort="'+k+'"]').focus({preventScroll:true});});
  }
  function deltaCell(r,value){
    const n=R.manualBid(value); if(n==null)return value?'규격 확인':'–';
    return n===r.n.bid?'변경 없음':delta({delta:n-r.n.bid,percent:(n-r.n.bid)/r.n.bid});
  }
  function renderRow(r,i){
    const {d,n}=r, id=n?.id, label=states[r.state], kw=esc((d?.kw||n.kw).replace(/\s+/g,''));
    const edit=R.canEdit(r), choice=canApply(r), value=edit?draft(r):'', invalid=Boolean(value&&R.manualBid(value)==null);
    const short=r.holdCode?holdLabels[r.holdCode]:r.state==='down'?(d?.conv===0?'신청 없이 비용 누적':'CPA 기준 초과'):r.state==='up'?'순위 하락 확인':r.state==='hold'?'데일리 미매칭':'';
    const price=edit?'<input id="bidManual-'+i+'" data-bid-manual="'+i+'" class="inp bid-manual" type="text" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="직접 입력" value="'+esc(value)+'" aria-label="'+kw+' 최종 입찰가 (원)" aria-invalid="'+invalid+'" title="70~100,000원 · 10원 단위">':'<span class="muted" title="'+esc(r.editBlock||r.reason)+'">변경 제외</span>';
    return '<tr><td class="bid-pick-cell">'+(edit?'<input type="checkbox" data-bid-id="'+esc(id)+'" '+(sel.has(id)?'checked ':'')+(choice?'':'disabled ')+'aria-label="'+kw+' 변경 선택">':'–')+'</td><td class="l bid-key-cell"><b title="'+kw+'">'+kw+'</b></td><td>'+won(n?.bid)+'</td><td>'+(r.bid==null?'없음':won(r.bid))+'</td><td>'+price+'</td><td><output class="bid-delta '+(invalid?'bid-invalid':'muted')+'" data-bid-amount="'+i+'" '+(edit?'for="bidManual-'+i+'"':'')+'>'+esc(edit?deltaCell(r,value):'–')+'</output></td><td class="l" title="'+esc(r.reason)+'"><span class="bid-pill">'+label+'</span>'+(short?' <small class="muted">'+esc(short)+'</small>':'')+'<small class="bid-approved" data-bid-mark="'+i+'">'+(applied.has(id)?' · 적용됨':'')+'</small></td><td>'+num(d?.clicks)+'</td><td>'+num(d?.conv)+'</td><td>'+won(d?.cost)+'</td><td>'+(r.cpa==null?'–':won(r.cpa))+'</td><td class="l"><button type="button" class="btn sm" data-bid-facts="'+i+'" aria-label="'+kw+' 근거 보기">근거</button> <button type="button" class="btn sm" data-bid-diag="'+i+'" aria-label="'+kw+' AI 진단">AI 진단</button></td></tr>';
  }
  function showFacts(r){
    const {d,n}=r;$('bidRowTitle').textContent=(d||n).kw.replace(/\s+/g,'');
    $('bidRowFacts').innerHTML='<p>'+esc(r.reason)+'</p>'+(d?'<p>클릭 '+num(d.clicks)+' · 신청 '+num(d.conv)+' · 비용 '+won(d.cost)+' · CPA '+won(r.cpa)+' · 추정 ROAS '+percent(r.roas)+'</p><p>데일리 순위 '+num(d.rank)+' · 순방문 '+num(d.visits)+' · 실제 CPC '+won(r.cpc)+' · 허용 CPC '+won(r.allowed)+'</p>':'<p>네이버 클릭 '+num(n.clicks)+' · 노출 '+num(n.imp)+'</p>')+(n?'<p>네이버 키워드 ID '+esc(n.id||'미확인')+' · 통검 순위 PC '+num(n.pc)+' / 모바일 '+num(n.mo)+' · 수정 '+esc(n.modified||'미확인')+'</p>':'')+(r.notes?.length?'<ul>'+r.notes.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'');
    detail.showModal();
  }
  function syncPageChecks(showing){
    const head=$('bidCheckPage');if(!head)return;
    const valid=showing.filter(r=>canApply(r)&&(filt!=='applied'||applied.has(r.n.id))),n=valid.filter(r=>sel.has(r.n.id)).length;
    head.disabled=!valid.length;head.checked=!!valid.length&&n===valid.length;head.indeterminate=n>0&&n<valid.length;
  }
  function paint(resetScroll=false){
    if(!result)return;
    $('bidResults').classList.remove('hidden');
    const {rows,matched,naverOnly,p,discrep}=result;
    $('bidSummary').textContent='데일리 '+num(rows.length)+'개 · 매칭 '+num(matched)+'개 · 네이버에만 '+num(naverOnly.length)+'개 · 상향 '+num(rows.filter(r=>r.state==='up').length)+'개 / 하향 '+num(rows.filter(r=>r.state==='down').length)+'개';
    const blocked=p.exportErrors.length>0;
    const counts=new Map();for(const r of rows)if(r.holdCode)counts.set(r.holdCode,(counts.get(r.holdCode)||0)+1);
    const holds=[...counts].sort((a,b)=>b[1]-a[1]);
    $('bidHolds').innerHTML=holds.length?'<span class="muted">자동 추천 보류 '+num(rows.filter(r=>r.holdCode).length)+'개</span> '+holds.map(([k,n])=>'<button type="button" class="btn sm" data-hold-filter="'+k+'" aria-pressed="'+(holdFilter===k)+'">'+holdLabels[k]+' '+num(n)+'개</button>').join(''):'';
    $('bidHolds').querySelectorAll('[data-hold-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.holdFilter;holdFilter=holdFilter===k?'':k;filt=holdFilter?'hold':'';$('bidFilter').value=filt;pg=0;sel.clear();paint(true);$('bidHolds').querySelector('[data-hold-filter="'+k+'"]').focus({preventScroll:true});});
    $('bidWarnings').innerHTML=(blocked?'<p class="bid-warning"><b>CSV 내보내기 잠김:</b> '+esc(p.exportErrors.join(' '))+'</p>':'')+p.errors.filter(m=>!p.exportErrors.includes(m)).map(m=>'<p class="muted">자동 추천: '+esc(m)+'</p>').join('')+(discrep?'<p class="muted">'+num(discrep)+'개 키워드의 클릭수가 자료 간에 달라요. 성과는 데일리 수치만 사용했어요.</p>':'')+(doc.files.previous&&!p.before?'<p class="bid-warning">이전 기간이 비어 있거나 길이가 다르거나 현재와 겹쳐 비교하지 않아요.</p>':'');
    const rr=sortedRows(rowsFiltered()), max=Math.max(1,Math.ceil(rr.length/pageSize));pg=Math.min(pg,max-1);
    const showing=rr.slice(pg*pageSize,(pg+1)*pageSize);
    drawHead();
    $('bidRows').innerHTML=showing.map(renderRow).join('')||'<tr><td colspan="12" class="l muted">이 조건에 맞는 키워드가 없어요.</td></tr>';
    if(resetScroll)$('bidTable').parentElement.scrollTop=0;
    $('bidPage').textContent=(pg+1)+' / '+max+' 페이지 · '+num(rr.length)+'개';$('bidBack').disabled=pg===0;$('bidNext').disabled=pg+1>=max;
    $('bidRows').querySelectorAll('[data-bid-facts]').forEach(b=>b.onclick=()=>showFacts(showing[+b.dataset.bidFacts]));
    $('bidCheckPage').onchange=e=>{
      for(const r of showing.filter(r=>canApply(r)&&(filt!=='applied'||applied.has(r.n.id)))){if(e.target.checked)sel.add(r.n.id);else sel.delete(r.n.id);}
      $('bidRows').querySelectorAll('[data-bid-id]').forEach(x=>{x.checked=sel.has(x.dataset.bidId);});
      syncPageChecks(showing);controls();
    };
    $('bidRows').querySelectorAll('[data-bid-diag]').forEach(btn=>btn.onclick=()=>{
      const row=showing[+btn.dataset.bidDiag],s=doc.settings, prior=get('previous').filter(d=>d.kk===(row.d||row.n).kk && (!d.id||d.id===row.n?.id) && (!d.gid||!row.n?.gid||d.gid===row.n.gid));
      const metric=d=>d?Object.fromEntries(['imp','clicks','visits','conv','cost','value','rank'].map(k=>[k,d[k]])):null;
      window.BidDiagnosis.open({keyword:(row.d||row.n).kw,device:s.device,current:{from:s.from,to:s.to},prior:s.scopeOK?{from:s.pFrom,to:s.pTo}:null,after:metric(row.d),before:prior.length===1 && result.p.before && s.scopeOK && !result.p.errors.some(e=>e.includes('광고그룹'))?metric(prior[0]):null});
    });
    $('bidRows').querySelectorAll('[data-bid-manual]').forEach(input=>input.oninput=()=>{
      const i=+input.dataset.bidManual,r=showing[i],id=r.n.id;edits.set(id,input.value);serial++;
      if(applied.has(id)&&applied.get(id)!==final(r))applied.delete(id);
      const row=input.closest('tr'), check=row.querySelector('[data-bid-id]');
      check.disabled=!canApply(r)||(filt==='applied'&&!applied.has(id));
      if(check.disabled){sel.delete(id);check.checked=false;}
      row.querySelector('[data-bid-mark]').textContent=applied.has(id)?' · 적용됨':'';
      const invalid=Boolean(input.value&&R.manualBid(input.value)==null), out=row.querySelector('[data-bid-amount]');
      input.setAttribute('aria-invalid',String(invalid));out.textContent=deltaCell(r,input.value);out.classList.toggle('bid-invalid',invalid);
      syncPageChecks(showing);controls();
    });
    $('bidRows').querySelectorAll('[data-bid-id]').forEach(x=>x.onchange=()=>{if(x.checked)sel.add(x.dataset.bidId);else sel.delete(x.dataset.bidId);syncPageChecks(showing);controls();});syncPageChecks(showing);controls();
  }
  $('bidFilter').onchange=e=>{filt=e.target.value;holdFilter='';pg=0;sel.clear();paint(true);};
  $('bidSearch').oninput=e=>{query=e.target.value;pg=0;sel.clear();paint(true);};
  $('bidPageSize').onchange=e=>{pageSize=+e.target.value;pg=0;paint(true);};
  $('bidBack').onclick=()=>{pg=Math.max(0,pg-1);paint(true);};$('bidNext').onclick=()=>{pg++;paint(true);};
  $('bidPick').onclick=()=>{rowsFiltered().filter(canApply).forEach(r=>sel.add(r.n.id));paint();};
  function gate(){const problem=result?.p.exportErrors[0]||R.period(doc.settings).exportErrors[0];if(!problem)return Boolean(result);window.toast?.(problem,'error');return false;}
  $('bidApply').onclick=()=>{if(!result||!gate())return;rowsFiltered().filter(r=>canApply(r)&&sel.has(r.n.id)).forEach(r=>applied.set(r.n.id,final(r)));serial++;sel.clear();paint();};
  $('bidUndo').onclick=()=>{serial++;applied.clear();sel.clear();paint();};
  function dl(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
  $('bidCsv').onclick=async()=>{
    if(!gate())return;const rev=serial, selected=exportables(), b=$('bidCsv'); b.disabled=true;
    try {const template=await fetch('ko_edit_keyword_bid_template.csv');if(!template.ok)throw Error('네이버 CSV 원본을 불러오지 못했어요.');const bytes=new Uint8Array(await template.arrayBuffer());const live=exportables();if(rev!==serial||!gate()||!sameExport(selected,live))return;
      const files=R.csvFiles(bytes,selected);
      if(files.length===1){dl(new Blob([files[0]],{type:'text/csv;charset=windows-949'}),'ko_edit_keyword_bid_template.csv');selected.forEach(r=>exported.set(r.id,r.bid));}
      else { // Browser multiple-download permissions can block bulk downloads. Offer each part explicitly.
        $('bidDownloadHelp').replaceChildren(...files.map((f,i)=>{const a=document.createElement('button');a.type='button';a.className='btn sm';a.textContent=(i+1)+'번 파일';a.onclick=()=>{if(rev===serial&&gate()&&sameExport(selected,exportables())){dl(new Blob([f],{type:'text/csv;charset=windows-949'}),'ko_edit_keyword_bid_template_'+(i+1)+'.csv');selected.slice(i*10000,(i+1)*10000).forEach(r=>exported.set(r.id,r.bid));}};return a;}));return;}
    }catch(e){window.toast?.(e.message,'error');}finally{b.disabled=!exportables().length;}
  };
  $('bidTxt').onclick=()=>{
    const s=doc.settings;const summary=[title(doc),'광고그룹 '+s.group+' · 기기 '+({pc:'PC',mo:'모바일',both:'PC·모바일'}[s.device]||'미입력'),'목표 CPA '+(s.cpa?won(+s.cpa):'미입력'),'성과 기간 '+s.from+' ~ '+s.to+' / 네이버 조회 '+s.nFrom+' ~ '+s.nTo+' / 다운로드 '+s.download,''];
    for(const r of rowsFiltered())summary.push((r.d?.kw||r.n.kw).replace(/\s+/g,'')+' | '+states[r.state]+(applied.has(r.n?.id)?' · 적용됨':'')+' | '+(r.n?'현재 '+won(r.n.bid)+' · 자동 추천 '+(r.bid==null?'없음':won(r.bid))+' · 최종 '+(R.manualBid(draft(r))==null?'미입력':won(R.manualBid(draft(r))))+' · 승인 '+(applied.has(r.n.id)?won(applied.get(r.n.id)):'없음'):'입찰가 없음')+'\r\n'+r.reason+(r.notes?.length?'\r\n'+r.notes.join('\r\n'):''),'');
    dl(new Blob(['\ufeff'+summary.join('\r\n')],{type:'text/plain;charset=utf-8'}),'입찰가_검토.txt');
  };
  window.__BID={show(on){v.classList.toggle('hidden',!on);if(!on)return;for(const id of ['main','banners','tabs'])$(id)?.classList.add('hidden');history.replaceState(null,'',location.pathname+location.search+'#bid');},hide(){v.classList.add('hidden');}};
  function captureTracking(){
    if(!result)throw Error('입찰 조정 분석부터 실행해 주세요.');
    const s=doc.settings,p=R.period(s), groups=[...new Set(get('naver').map(n=>n.gid).filter(Boolean))];
    if(!p.same||!s.scopeOK||groups.length>1||result.p.errors.some(e=>e.includes('광고그룹')))throw Error('두 파일의 조회 기간, 광고그룹·기기를 맞춘 뒤 저장해 주세요.');
    const base=(n,d,r)=>({kw:d?.kw||n.kw,id:n?.id,bid:n?.bid,approved:applied.get(n?.id)??null,csv:exported.get(n?.id),status:n?.status,state:r?.state,reason:r?[r.reason,...(r.notes||[])].join(' · '):'',metric:d||null});
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
