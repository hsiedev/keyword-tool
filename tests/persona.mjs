// Isolated guide regression and browser fixture. Never copy config, cache, or data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Brief from '../public/ai-brief.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kt-persona-'));
const browser=process.argv.includes('--browser');
const port=browser?18812:19000+Math.floor(Math.random()*1000);
const home=`http://127.0.0.1:${port}`;
let modelCalls=0,lastPrompt='',googleCalls=0;
const people=[{id:'P1',name:'모델의 첫 타깃',situation:'신청 자격을 확인하는 상황',need:'준비할 조건',seeds:['체크카드발급','체크카드자격'],angles:['정보']},{id:'P2',name:'모델의 두 번째 타깃',situation:'온라인에서 접수하려는 상황',need:'절차',seeds:['체크카드신청','체크카드온라인'],angles:['직접 행동']}];
const keyword=(keyword,tail,seed,personaIds,kind='candidate',intent='직접 행동')=>({keyword,kind,tail,seed,personaIds,intent,match:'core',reason:'검색 상황과 연결',total:97510,source:'모델이 단정한 출처'});
const results=[keyword('체크 카드발급','short','',['P1']),keyword('체크카드발급','short','',['P2']),keyword('체크카드발급조건','long','체크카드발급',['P1'],'candidate','정보 탐색'),keyword('온라인체크카드신청','long','체크카드신청',['P2']),keyword('체크카드당일발급','long','체크카드발급',['P2']),keyword('체크카드분실신고','long','체크카드발급',['P1'],'exclude'),keyword('알수없는타깃','short','',['PX']),keyword('같은부모','long','같은부모',['P1'])];
const modelText = p => {
  if (p.includes('탐색 계획만 만든다')) return [{intent:'신청 흐름',audience:'대상',avoid:[],personas:people}];
  if (p.includes('조사 후보를 페르소나별로')) return results;
  if (p.includes('발굴해줘')) return [{keyword:'직접 입력키워드',intent:'가입·구매',reason:'직접 방식'}];
  if (p.includes('독립적으로') || p.includes('키워드 검수') || p.includes('판정')) return [];
  return [];
};
const realFetch=globalThis.fetch;
function setup(){
  for (const f of fs.readdirSync(root)) if (f.endsWith('.mjs')) fs.copyFileSync(path.join(root,f),path.join(dir,f));
  fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({geminiKey:'test-fixture-not-a-secret',aiProvider:'gemini',adApiKey:'test-ad',adSecret:'test-ad-secret',adCustomerId:'1'}));
  process.env.PORT=String(port);
  globalThis.fetch = async (url, init={})=>{
    const u=new URL(String(url));
    if (u.origin===home) return realFetch(url,init);
    if (u.host==='generativelanguage.googleapis.com') {
      if (u.pathname==='/v1beta/models') return Response.json({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]});
      const p=JSON.parse(init.body||'{}').contents?.[0]?.parts?.[0]?.text||'';
      modelCalls++;lastPrompt=p;
      if(p.includes('실패테스트')&&p.includes('조사 후보를 페르소나별로'))return new Response('fixture refusal',{status:400});
      if(p.includes('중지테스트')&&p.includes('조사 후보를 페르소나별로'))await new Promise(r=>setTimeout(r,3000));
      const response={candidates:[{content:{parts:[{text:JSON.stringify(modelText(p))}]},finishReason:'STOP'}]};
      if (u.pathname.includes(':streamGenerateContent')) return new Response(`data: ${JSON.stringify(response)}\n\n`);
      return Response.json(response);
    }
    if (u.host==='api.searchad.naver.com'&&u.pathname==='/keywordstool') {
      const k=(u.searchParams.get('hintKeywords')||'').split(',');
      const r=(kw,pc,mo)=>({relKeyword:kw,monthlyPcQcCnt:pc,monthlyMobileQcCnt:mo,compIdx:'중간'});
      return Response.json({keywordList:k.flatMap(kw=>kw==='체크카드발급'?[r(kw,100,300),r('체크카드발급조건','< 10',0)]:kw==='확인된영'?[r(kw,0,0)]:kw==='일부누락'?[r(kw,undefined,0)]:['데이터없음','온라인체크카드신청'].includes(kw)?[]:[r(kw,'< 10','< 10')])});
    }
    if(u.host==='ac.search.naver.com')return Response.json({items:[[['온라인체크카드신청','0']]]});
    if(u.host==='suggestqueries.google.com'){googleCalls++;return Response.json(['q',['구글검증용']]);}
    if(u.host==='search.naver.com')return new Response('<html>empty</html>');
    throw new Error('테스트 외부 요청 차단: '+u.host);
  };
}
const post=(p,data)=>realFetch(home+p,{method:'POST',headers:{Origin:`http://localhost:${port}`,'Content-Type':'application/json'},body:JSON.stringify(data)});
const last=async r=>{
  assert.match(r.headers.get('content-type'),/^text\/event-stream/);
  return (await r.text()).split(/\r?\n/).filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6))).findLast(e=>['done','error'].includes(e.type));
};
const complete=()=>Brief.normalize({...Brief.blank(),step:4,max:4,topic:'card',product:'검증용 카드',goal:'submit',conversion:'접수 완료',official:'https://official.invalid/card',landing:'https://landing.invalid/apply',picked:{card:[0,1]},refs:'카드 추천, 카드추천'});
try {
  setup();
  await import(pathToFileURL(path.join(dir,'server.mjs')).href);
  for(let i=0;i<20;i++) {if(await realFetch(home+'/api/version').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
  if(browser){console.log('검증 서버: '+home+'/#ai (외부 요청 가로채기)');await new Promise(()=>{});}
  const s=complete(), p=Brief.payload(s);
  assert.equal(Brief.firstProblem(s),null);
  assert.deepEqual(p.personas.map(x=>x.id),['P1','P2']);
  assert.deepEqual(p.refs,['카드추천']);assert.notEqual(p.officialUrl,p.landingUrl);
  assert.equal(Brief.firstProblem({...s,landing:'https:invalid'}).field,'landing');
  assert.equal(Brief.firstProblem({...s,personaMode:'direct'}).field,'p0-why');
  assert.equal(Brief.payload({...s,personaMode:'ai'}).personas.length,0);
  assert.match(Brief.compose(s),/글자 수나 추정 검색량으로 분류하지 않는다/);
  const invalid=await last(await post('/api/ai/persona-plan-stream',{briefV1:Brief.blank()}));
  assert.equal(invalid.type,'error');assert.equal(modelCalls,0);
  const plan=await last(await post('/api/ai/persona-plan-stream',{briefV1:s}));
  assert.equal(plan.type,'done');assert.equal(plan.personas[0].name,'첫 발급 · 자격 확인');
  assert.deepEqual(plan.seeds.slice(0,4),['체크카드발급','체크카드신청','체크카드자격','체크카드온라인']);
  const unknown=await last(await post('/api/ai/persona-plan-stream',{briefV1:{...s,personaMode:'ai'}}));
  assert.ok(unknown.personas.every(x=>x.source===Brief.SOURCE.ai));
  const gen=await last(await post('/api/ai/generate-stream',{briefV1:s,plan,seeds:[{keyword:'체크카드발급',total:987654321}],count:30}));
  assert.equal(gen.type,'done');
  assert.deepEqual(gen.items.map(x=>x.keyword),['체크카드발급','온라인체크카드신청','체크카드발급조건','체크카드당일발급','체크카드분실신고','같은부모']);
  assert.equal(gen.items[0].personas.length,2);assert.equal(gen.items[2].tail,'long');assert.equal(gen.items[2].seed,'체크카드발급');
  assert.deepEqual(gen.items.slice(3).map(x=>x.discovery),['hold','exclude','hold']);
  assert.ok(gen.items.every(x=>x.total===undefined&&x.source===undefined));assert.ok(!lastPrompt.includes('987654321'));
  const legacy=await last(await post('/api/ai/generate-stream',{topic:'현재 직접 브리프',count:30}));
  assert.deepEqual(legacy.items,[{keyword:'직접입력키워드',intent:'가입·구매',reason:'직접 방식'}]);
  const keys=['확인된영','일부누락','데이터없음','소량표기'];
  const vol=await (await post('/api/volumes',{persona:true,keywords:keys})).json();
  const [zero,partial,missing,low]=keys.map(k=>vol.volumes[k]);
  assert.deepEqual([zero.pc,zero.mo,zero.total],[0,0,0]);assert.ok(zero.checkedAt);
  assert.deepEqual([partial.pc,partial.mo,partial.total,partial.pcLow],[null,0,null,false]);
  assert.deepEqual([missing.notFound,Object.hasOwn(missing,'total')],[true,false]);
  assert.deepEqual([low.pc,low.mo,low.total,low.pcLow,low.moLow],[null,null,null,true,true]);
  assert.equal(Brief.volumeState(partial,50),'일부 미확인');assert.equal(Brief.volumeState(low,5),'소량·판정 보류');assert.equal(Brief.volumeState(low,50),'기준 미달');
  assert.ok(Brief.needsVolumeReview(null,50));
  const research=await last(await post('/api/ai/persona-research-stream',{seeds:['체크카드발급']},{}));
  assert.equal(research.type,'done');
  const hit=research.list.find(x=>x.keyword==='체크카드발급조건');assert.deepEqual([hit.pc,hit.mo,hit.pcLow],[null,0,true]);
  assert.ok(research.suggest.some(x=>x.keyword==='온라인체크카드신청'));
  assert.ok(research.suggest.every(x=>x.src.every(src=>src.startsWith('네이버'))));assert.equal(googleCalls,0);
  assert.equal((await (await realFetch(home+'/api/version')).json()).working,false);
  console.log('대화형 브리프 통과: 검토·가설·시드·복수 타깃·보류, 직접 생성 호환, 네이버 수치/출처');
} catch(e) {
  console.error(e);process.exitCode=1;
} finally {
  if(!browser||process.exitCode) {
    fs.rmSync(dir,{recursive:true,force:true});
    process.exit(process.exitCode||0);
  }
}
