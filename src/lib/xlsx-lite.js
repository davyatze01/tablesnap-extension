/*!
 * TableSnap XLSX-lite — tiny, dependency-free .xlsx writer (Office Open XML + stored ZIP).
 * Classic script: exposes globalThis.TableSnapXLSX (and module.exports under CommonJS).
 * Supports: multiple sheets, inline strings, numeric cells, bold + frozen header row, column widths.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && !root.TableSnapXLSX) root.TableSnapXLSX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const encoder = new TextEncoder();
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const MAX_CELL = 32767;
  const MAX_ROWS = 1048576;
  const MAX_COLS = 16384;

  /* ----------------------------------------------------------------- ZIP */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** files: [{name, data: string|Uint8Array}] → Uint8Array (ZIP, method STORE, UTF-8 names). */
  function zip(files) {
    const DOS_TIME = 0;
    const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, reproducible output
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = encoder.encode(f.name);
      const data = typeof f.data === 'string' ? encoder.encode(f.data) : f.data;
      const crc = crc32(data);

      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, DOS_TIME, true);
      lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, DOS_TIME, true);
      cv.setUint16(14, DOS_DATE, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);

      parts.push(lh, data);
      central.push(ch);
      offset += lh.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    const all = parts.concat(central, [end]);
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0;
    for (const chunk of all) {
      out.set(chunk, p);
      p += chunk.length;
    }
    return out;
  }

  /* ----------------------------------------------------------------- XML */

  function xmlEscape(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colName(index) {
    let n = index + 1;
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function isStrictNumber(s) {
    if (typeof s !== 'string' || !/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,15})?$/.test(s)) return false;
    return s.replace(/[-.]/g, '').replace(/^0+/, '').length <= 15;
  }

  function sanitizeSheetName(name, used) {
    let base = String(name || '')
      .replace(/[\[\]:*?\/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '');
    if (!base || base.toLowerCase() === 'history') base = 'Sheet';
    base = base.slice(0, 31).trim();
    let candidate = base;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` (${i++})`;
      candidate = base.slice(0, 31 - suffix.length).trim() + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function sheetXml(rows, header) {
    const data = rows.slice(0, MAX_ROWS);
    const width = Math.min(MAX_COLS, data.reduce((w, r) => Math.max(w, r.length), 0));
    const widths = new Array(width).fill(8);
    const rowXml = [];
    data.forEach((row, r) => {
      const cells = [];
      for (let c = 0; c < width; c++) {
        const raw = row[c] === undefined || row[c] === null ? '' : String(row[c]);
        if (raw === '') continue;
        const ref = colName(c) + (r + 1);
        const isHead = header && r === 0;
        const len = Math.max(...raw.split('\n').map((l) => l.length));
        widths[c] = Math.max(widths[c], Math.min(60, len + 2));
        if (!isHead && isStrictNumber(raw)) {
          cells.push(`<c r="${ref}"><v>${raw}</v></c>`);
        } else {
          const text = raw.length > MAX_CELL ? raw.slice(0, MAX_CELL) : raw;
          const style = isHead ? ' s="1"' : text.indexOf('\n') !== -1 ? ' s="2"' : '';
          cells.push(`<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`);
        }
      }
      rowXml.push(`<row r="${r + 1}">${cells.join('')}</row>`);
    });
    const views =
      header && data.length > 1
        ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const cols = width
      ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
      : '';
    return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${views}${cols}<sheetData>${rowXml.join('')}</sheetData></worksheet>`;
  }

  const STYLES =
    `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * sheets: [{name, rows: string[][], header: boolean}] → Uint8Array (.xlsx bytes)
   */
  function build(sheets) {
    const list = (sheets && sheets.length ? sheets : [{ name: 'Sheet', rows: [] }]).slice(0, 255);
    const used = new Set();
    const names = list.map((s) => sanitizeSheetName(s.name, used));
    const files = [];
    const overrides = list
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('');
    files.push({
      name: '[Content_Types].xml',
      data:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        overrides +
        '</Types>',
    });
    files.push({
      name: '_rels/.rels',
      data: `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    });
    files.push({
      name: 'xl/workbook.xml',
      data:
        `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>` +
        names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data:
        `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${names.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    });
    files.push({ name: 'xl/styles.xml', data: STYLES });
    list.forEach((s, i) => {
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows || [], !!s.header) });
    });
    return zip(files);
  }

  return { build, zip, crc32, colName, sanitizeSheetName, xmlEscape };
});
