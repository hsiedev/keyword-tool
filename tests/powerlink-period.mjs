import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createPowerlink, buildXlsx } from '../powerlink-core.mjs';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-period-'));
try {
  const mk = id => ({ id, name: id, urls: ['https://example.test/'], createdAt: Date.now(), devices: ['pc'], status: 'done', nPc: 3, rows: [{ kw: '테스트 키워드', key: '테스트키워드', done: true, res: { pc: { avg: id.endsWith('a') ? 2 : 4, n: 4, seen: 4 } } }] });
  const a = mk('pl123456789a'), b = mk('pl123456789b');
  for (const j of [a,b]) { const d = path.join(tmp,'powerlink',j.id); fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(path.join(d,'job.json'), JSON.stringify(j)); }
  const service = createPowerlink({ dataDir: tmp });
  const call = async (url, body) => {
    let ans; const res = { writeHead(s){ this.status=s; }, end(v){ ans={s:this.status,v}; } };
    await service.handle({ method: body ? 'POST' : 'GET' }, res, new URL(url,'http://localhost'), async()=>body, (_,s,v)=> { ans={s,v}; });
    return ans;
  };
  const raw = (imp, clk) => [{ name:'실제.xlsx', sheets:[{name:'성과',rows:[['키워드','노출수','클릭수','임의 열'],['테스트 키워드',imp,clk,'  원본 공백  '],['중복',3,1],['중복',6,2]]},{name:'미사용 원본',rows:[['모든 탭 유지'],[],['0021']]}] }];
  const sa = raw(100,10), sb = raw(100,4);
  const original = buildXlsx(sa[0].sheets); sa[0].original = original.toString('base64');
  const p = (day,end) => ({start:'2026-10-'+day,end:'2026-10-'+end});
  assert.equal((await call('/api/pl/report',{id:a.id,period:p('01','02'),reports:sa})).s,200);
  assert.equal((await call('/api/pl/report',{id:b.id,period:p('03','06'),reports:sb})).s,200);
  const {s,v:c} = await call('/api/pl/compare',{a:a.id,b:b.id});
  assert.equal(s,200); assert.equal(c.summary.matched,1); assert.equal(c.summary.duplicates,1); assert.equal(c.summary.ca,5); assert.equal(c.summary.cb,1);
  assert.equal(c.rank[0].down,1); assert.match(c.notes.join(' '),/노출량 변화.*CTR 변화/);
  assert.equal((await call('/api/pl/compare',{a:b.id,b:a.id})).s,400);
  assert.deepEqual((await call('/api/pl/report-file?id='+a.id+'&i=0')).v,original);
  const x = (await call('/api/pl/xlsx?id='+a.id)).v;
  const unzip = x => { const xml = {}; for(let i=0;x.readUInt32LE(i)===0x04034b50;) { const len=x.readUInt16LE(i+26), extra=x.readUInt16LE(i+28), n=x.readUInt32LE(i+18), begin=i+30+len+extra; xml[x.toString('utf8',i+30,i+30+len)]=zlib.inflateRawSync(x.subarray(begin,begin+n)).toString(); i=begin+n; } return xml; };
  const xml = unzip(x);
  assert.match(xml['xl/workbook.xml'],/원본 목록.*실적 키워드.*원본 1.*원본 2/);
  assert.match(xml['xl/worksheets/sheet4.xml'],/  원본 공백  /);
  assert.match(xml['xl/worksheets/sheet5.xml'],/모든 탭 유지.*0021/);
  assert.equal((await call('/api/pl/jobs')).v.jobs.find(x=>x.id===a.id).period.days,2);
  const head = ['키워드','총비용','평균 CPC','입찰가 유형','입찰가','클릭률(%)','평균노출순위','광고 연관지수','클릭 기대지수','노출수','클릭수','키워드 ID','등록시각','수정시각','상태','즐겨찾기','PC통검평균노출순위','모바일통검평균노출순위'];
  const fixture = [['붙여넣은 보고서'], head, ['키워드 2개 결과'], ['테스트 키워드', 30, '', '', 10, '', '', '', '', 100, 10, '00123'], ['미선택'], [], ['테스트 키워드']];
  assert.equal((await call('/api/pl/report',{id:a.id,period:p('01','02'),reports:[{name:'붙여넣은 표',sheets:[{name:'붙여넣은 표',rows:fixture}]}]})).s,200);
  const joined = unzip((await call('/api/pl/xlsx?id='+a.id)).v)['xl/worksheets/sheet1.xml'];
  assert.match(joined, /r="R2"[^>]*><is><t[^>]*>모바일통검평균노출순위/);
  assert.match(joined, /r="S2"[^>]*><is><t[^>]*>파워링크 PC 실측 평균순위/);
  assert.match(joined, /r="J4"[^>]*><v>100<\/v>.*r="K4"[^>]*><v>10<\/v>.*r="L4"[^>]*><is><t[^>]*>00123/);
  assert.match(joined, /r="S4"[^>]*><v>2<\/v>/);
  assert.match(joined, /r="S7"[^>]*><v>2<\/v>/);
  assert.match(joined, /r="Z5"[^>]*><is><t[^>]*>분석 대상 아님/);
  assert.doesNotMatch(joined, /r="S3"|r="S6"/);
  const reorder = [10,11,4,17,0,9,14,1,2,3,5,6,7,8,12,13,15,16];
  const shuffled = fixture.map((row, i) => i === 0 || !row.length ? row : reorder.map(k => row[k] ?? ''));
  shuffled[1][4] = '​등록 키워드'; shuffled[1][0] = '클릭 수 (건)'; shuffled[1][5] = '노출 수 (회)';
  assert.equal((await call('/api/pl/report',{id:a.id,period:p('01','02'),reports:[{name:'붙여넣은 표',sheets:[{name:'순서변경',rows:shuffled}]}]})).s,200);
  const shuffledCompare = await call('/api/pl/compare',{a:a.id,b:b.id});
  // 중복 실적을 임의 합산하지 않지만, 해당 머리글과 수치 자체는 찾아낸다.
  assert.equal(shuffledCompare.v.summary.tablesA,1);
  const shuffledXml = unzip((await call('/api/pl/xlsx?id='+a.id)).v)['xl/worksheets/sheet1.xml'];
  assert.match(shuffledXml, /r="A4"[^>]*><v>10<\/v>.*r="B4"[^>]*><is><t[^>]*>00123/);
  assert.match(shuffledXml, /r="E4"[^>]*><is><t[^>]*>테스트 키워드.*r="F4"[^>]*><v>100<\/v>.*r="S4"[^>]*><v>2<\/v>/);
  console.log('파워링크 테스트 통과: 기간·실적·순위·중복·원본 파일·결과 엑셀');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
