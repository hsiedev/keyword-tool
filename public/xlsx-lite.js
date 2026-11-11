// 외부 라이브러리 없이 엑셀(xlsx)과 CSV를 읽고, 결과를 xlsx로 저장하는 작은 모듈
(function () {
  const td = new TextDecoder('utf-8');

  // ---------------------------------------------------------------- ZIP 읽기
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('엑셀(xlsx) 파일 형식이 아니에요');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
      const start = off + 30 + lnl + lel;
      const raw = u8.subarray(start, start + csize);
      files[name] = { method, raw };
      p += 46 + nlen + elen + clen;
    }
    return {
      async text(name) {
        const f = files[name];
        if (!f) return null;
        const data = f.method === 0 ? f.raw : await inflateRaw(f.raw);
        return td.decode(data);
      },
      names: Object.keys(files),
    };
  }

  // ---------------------------------------------------------------- XLSX 읽기
  const colIndex = (ref) => {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const byTag = (node, tag) => [...node.getElementsByTagName('*')].filter((e) => e.localName === tag);

  async function readXlsx(buf) {
    const z = await unzip(buf);
    const wb = xml(await z.text('xl/workbook.xml'));
    const relsTxt = await z.text('xl/_rels/workbook.xml.rels');
    const rels = {};
    if (relsTxt) for (const r of byTag(xml(relsTxt), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const ssTxt = await z.text('xl/sharedStrings.xml');
    const shared = ssTxt ? byTag(xml(ssTxt), 'si').map((si) => byTag(si, 't').map((t) => t.textContent).join('')) : [];
    const sheets = [];
    for (const s of byTag(wb, 'sheet')) {
      const rid = s.getAttribute('r:id') || [...s.attributes].find((a) => a.localName === 'id')?.value;
      let target = rels[rid] || '';
      target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const sx = await z.text('xl/' + target);
      if (!sx) continue;
      const rows = [];
      for (const row of byTag(xml(sx), 'row')) {
        const r = [];
        let auto = 0;
        for (const c of byTag(row, 'c')) {
          let ci = colIndex(c.getAttribute('r'));
          if (ci < 0) ci = auto;
          auto = ci + 1;
          const t = c.getAttribute('t');
          let v = '';
          if (t === 's') v = shared[Number(byTag(c, 'v')[0]?.textContent)] ?? '';
          else if (t === 'inlineStr') v = byTag(c, 't').map((x) => x.textContent).join('');
          else v = byTag(c, 'v')[0]?.textContent ?? '';
          r[ci] = String(v).trim();
        }
        rows[Number(row.getAttribute('r') || rows.length + 1) - 1] = r;
      }
      sheets.push({ name: s.getAttribute('name'), rows: Array.from(rows, (r) => Array.from(r || [], (x) => x ?? '')) });
    }
    return sheets;
  }

  // ---------------------------------------------------------------- CSV 읽기 (UTF-8 / EUC-KR 자동)
  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\ufeff/, ''); }
    catch { return new TextDecoder('euc-kr').decode(buf); }
  }
  function parseCsv(text) {
    const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur.trim()); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows;
  }

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(buf);
    if (name.endsWith('.xls')) throw new Error('예전 .xls 형식은 읽을 수 없어요. 엑셀에서 "다른 이름으로 저장 > Excel 통합 문서(.xlsx)"로 저장해 주세요.');
    if (name.endsWith('.txt')) {
      // 메모장 파일: 줄바꿈, 쉼표, 탭 어느 것으로 구분해도 키워드 하나씩 한 열로 읽음
      const words = decodeText(buf).split(/[\r\n,\t]+/).map((s) => s.trim()).filter(Boolean);
      return [{ name: file.name, rows: words.map((w) => [w]) }];
    }
    return [{ name: file.name, rows: parseCsv(decodeText(buf)) }];
  }

  // ---------------------------------------------------------------- XLSX 쓰기 (무압축 ZIP)
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (u8) => { let c = 0xffffffff; for (const b of u8) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zipStore(files) {
    const te = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = te.encode(f.name), data = typeof f.data === 'string' ? te.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const escX = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  // sheets: [{ name, rows: [[...]], widths: [..] }]
  function writeXlsx(sheets) {
    const M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const files = [];
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${M}" xmlns:r="${R}"><sheets>${sheets.map((s, i) => `<sheet name="${escX(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>` });
    // 스타일: 0 기본, 1 굵은 제목(회색 배경)
    files.push({ name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${M}"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>` });
    sheets.forEach((s, si) => {
      const cols = (s.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
      const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1);
        const st = ri === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
        if (v == null || v === '') return '';
        return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${escX(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${M}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>` });
    });
    return zipStore(files);
  }

  window.XlsxLite = { readFile, readXlsx, parseCsv, writeXlsx };
})();
