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
  const xml = {}; for(let i=0;x.readUInt32LE(i)===0x04034b50;) { const len=x.readUInt16LE(i+26), extra=x.readUInt16LE(i+28), n=x.readUInt32LE(i+18), begin=i+30+len+extra; xml[x.toString('utf8',i+30,i+30+len)]=zlib.inflateRawSync(x.subarray(begin,begin+n)).toString(); i=begin+n; }
  assert.match(xml['xl/workbook.xml'],/원본 목록.*실적 키워드.*원본 1.*원본 2/);
  assert.match(xml['xl/worksheets/sheet4.xml'],/  원본 공백  /);
  assert.match(xml['xl/worksheets/sheet5.xml'],/모든 탭 유지.*0021/);
  assert.equal((await call('/api/pl/jobs')).v.jobs.find(x=>x.id===a.id).period.days,2);
  console.log('파워링크 테스트 통과: 기간·실적·순위·중복·원본 파일·결과 엑셀');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
