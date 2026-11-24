import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Rules from './public/bid-track-rules.js';

export function createBidTracking(dataDir) {
  const dir=path.join(dataDir,'bid-tracking');
  const valid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
  const full=id=>path.join(dir,id+'.json');
  return async function handle(req,res,u,readBody,send){
    res.setHeader('Cache-Control','no-store');
    if(req.method==='POST'){
      const body=await readBody(req);let doc;
      try{doc=Rules.normalize(body?.snapshot);}catch(e){return send(res,400,{error:e.message});}
      const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
      if(doc.download>today)return send(res,400,{error:'미래 날짜의 다운로드 기록은 저장할 수 없어요.'});
      const {rows,...fields}=doc, id=randomUUID(), meta={...fields,id,at:new Date().toISOString(),count:rows.length};
      await fs.mkdir(dir,{recursive:true});const tmp=full(id)+'.tmp';
      try{await fs.writeFile(tmp,JSON.stringify({...meta,rows}),{flag:'wx'});await fs.rename(tmp,full(id));}finally{await fs.unlink(tmp).catch(()=>{});}
      return send(res,201,{meta});
    }
    if(req.method!=='GET')return send(res,405,{error:'지원하지 않는 방식이에요.'});
    const id=u.searchParams.get('id');
    if(id!==null){
      if(!valid.test(id))return send(res,400,{error:'잘못된 기록 ID예요.'});
      try{return send(res,200,{snapshot:JSON.parse(await fs.readFile(full(id),'utf8'))});}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'저장 기록을 찾을 수 없어요.'});throw e;}
    }
    let names;try{names=await fs.readdir(dir);}catch(e){if(e.code==='ENOENT')return send(res,200,{list:[]});throw e;}
    const list=[];let broken=0;
    for(const f of names)if(f.endsWith('.json')&&valid.test(f.slice(0,-5))){try{const {rows,...meta}=JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));if(Array.isArray(rows)&&typeof meta.at==='string')list.push(meta);else broken++;}catch{broken++;}}
    return send(res,200,{list:list.sort((a,b)=>b.at.localeCompare(a.at)),broken});
  };
}
