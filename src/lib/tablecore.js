/*!
 * TableSnap Core — DOM-free table helpers shared by the content script, the popup and the tests.
 * Classic script: exposes globalThis.TableSnapCore (and module.exports under CommonJS).
 * No dependencies, no network access.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && !root.TableSnapCore) root.TableSnapCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const MAX_COLSPAN = 1000;
  const MAX_ROWSPAN = 65534;

  class TableSnapError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'TableSnapError';
      this.code = code;
    }
  }

  /* ------------------------------------------------------------------ text */

  function normalizeCellText(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/[    ]/g, ' ')
      .replace(/[​-‍⁠﻿]/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .filter((line) => line !== '')
      .join('\n');
  }

  function toInt(value, min, max) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < min) return min;
    return Math.min(n, max);
  }

  /** Pads every row to the same width and replaces holes with ''. */
  function rectangularize(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let width = 0;
    for (const row of list) if (row && row.length > width) width = row.length;
    return list.map((row) => {
      const out = new Array(width);
      for (let c = 0; c < width; c++) {
        const v = row ? row[c] : undefined;
        out[c] = v === undefined || v === null ? '' : String(v);
      }
      return out;
    });
  }

  /**
   * Expands colspan/rowspan into a rectangular string grid.
   * rowSpecs: Array<Array<{text, colspan?, rowspan?}>>
   * By default rowspans repeat their value (good for analysis), colspans leave '' (good for headers).
   */
  function buildGrid(rowSpecs, options) {
    const opts = Object.assign({ fillRowspan: true, fillColspan: false }, options);
    const specs = Array.isArray(rowSpecs) ? rowSpecs : [];
    const total = specs.length;
    const grid = [];
    for (let r = 0; r < total; r++) {
      if (!grid[r]) grid[r] = [];
      let c = 0;
      for (const spec of specs[r] || []) {
        while (grid[r][c] !== undefined) c++;
        const text = normalizeCellText(spec && spec.text);
        const colspan = toInt(spec && spec.colspan, 1, MAX_COLSPAN);
        const rowspan = Math.min(toInt(spec && spec.rowspan, 1, MAX_ROWSPAN), total - r);
        for (let dr = 0; dr < rowspan; dr++) {
          const row = grid[r + dr] || (grid[r + dr] = []);
          for (let dc = 0; dc < colspan; dc++) {
            let fill;
            if (dr === 0 && dc === 0) fill = true;
            else if (dc === 0) fill = opts.fillRowspan;
            else if (dr === 0) fill = opts.fillColspan;
            else fill = opts.fillRowspan && opts.fillColspan;
            row[c + dc] = fill ? text : '';
          }
        }
        c += colspan;
      }
    }
    return rectangularize(grid);
  }

  /**
   * Collapses the first `count` header rows into one ("2025" over "Q1" → "2025 Q1").
   * `rowSpecs` are the raw specs; colspans are filled for the header so group labels propagate.
   */
  function mergeHeaderRows(rowSpecs, count) {
    const n = Math.min(Math.max(count | 0, 0), 3, (rowSpecs || []).length);
    const grid = buildGrid(rowSpecs);
    if (n < 2) return grid;
    const filled = buildGrid(rowSpecs.slice(0, n), { fillColspan: true, fillRowspan: true });
    const width = grid[0].length;
    const header = [];
    for (let c = 0; c < width; c++) {
      const parts = [];
      for (let r = 0; r < n; r++) {
        const v = (filled[r] && filled[r][c]) || '';
        if (v && parts[parts.length - 1] !== v) parts.push(v);
      }
      header.push(parts.join(' '));
    }
    return [header].concat(grid.slice(n));
  }

  /* ---------------------------------------------------------------- export */

  // Cells Excel would evaluate as formulas (=, @, or +/- followed by non-numeric text).
  const FORMULA_RE = /^(?:[=@]|[+\-](?![\d\s.,]*$))/;

  function csvField(value, sep, protect) {
    let s = value === null || value === undefined ? '' : String(value);
    if (protect && FORMULA_RE.test(s)) s = "'" + s;
    if (s.indexOf('"') !== -1 || s.indexOf(sep) !== -1 || /[\r\n]/.test(s) || /^\s|\s$/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** RFC 4180 CSV. UTF-8 BOM by default so Excel on Windows detects the encoding. */
  function toCSV(rows, options) {
    const o = Object.assign({ separator: ',', bom: true, eol: '\r\n', protectFormulas: true }, options);
    const grid = rectangularize(rows);
    const body = grid
      .map((row) => row.map((v) => csvField(v, o.separator, o.protectFormulas)).join(o.separator))
      .join(o.eol);
    return (o.bom ? '﻿' : '') + body + (grid.length ? o.eol : '');
  }

  /** Tab-separated values for pasting into spreadsheets: tabs/newlines inside cells become spaces. */
  function toTSV(rows) {
    return rectangularize(rows)
      .map((row) => row.map((v) => v.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t'))
      .join('\n');
  }

  function mdEscape(v) {
    return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  }

  /** GitHub-flavoured Markdown table, numeric columns right-aligned. */
  function toMarkdown(rows, options) {
    const o = Object.assign({ header: true, columnLabel: 'Column', alignNumbers: true, maxPad: 40 }, options);
    const grid = rectangularize(rows);
    if (!grid.length || !grid[0].length) return '';
    const width = grid[0].length;
    const label = (i) => `${o.columnLabel} ${i + 1}`;
    const rawHead = o.header ? grid[0] : grid[0].map((_, i) => label(i));
    const head = rawHead.map((h, i) => mdEscape(h) || label(i));
    const body = (o.header ? grid.slice(1) : grid).map((r) => r.map(mdEscape));
    const numeric = head.map((_, i) => o.alignNumbers && isNumericColumn(body.map((r) => r[i])));
    const widths = head.map((h, i) => {
      let w = Math.max(3, h.length);
      for (const r of body) w = Math.max(w, r[i].length);
      return Math.min(w, o.maxPad);
    });
    const pad = (s, i) => {
      const w = widths[i];
      if (s.length >= w) return s;
      return numeric[i] ? ' '.repeat(w - s.length) + s : s + ' '.repeat(w - s.length);
    };
    const line = (cells) => '| ' + cells.map(pad).join(' | ') + ' |';
    const sep = '| ' + widths.map((w, i) => (numeric[i] ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))).join(' | ') + ' |';
    return [line(head), sep].concat(body.map(line)).join('\n') + '\n';
  }

  /* --------------------------------------------------------------- numbers */

  const PREFIX_OK = /^(?:\p{Sc}|[A-Z]{1,3}\p{Sc}|[A-Z]{3})$/u;
  const SUFFIX_OK = /^(?:%|‰|\p{Sc}|[A-Z]{3}|°?[\p{L}µ]{1,4}(?:[²³]|\/[\p{L}]{1,3})?\.?)$/u;
  const MULTIPLIERS = /^(?:k|K|M|B|T|bn|mn|Mio|Mrd|mln|mld|Bn|MM)$/;
  const NUMBER_RE = /^([^\d]*?)(\d(?:[\d.,'’ ]*\d)?)([^\d]*)$/;

  function guessDecimal(core, hint) {
    const hasDot = core.indexOf('.') !== -1;
    const hasComma = core.indexOf(',') !== -1;
    if (hasDot && hasComma) return core.lastIndexOf('.') > core.lastIndexOf(',') ? '.' : ',';
    const sep = hasDot ? '.' : hasComma ? ',' : null;
    if (!sep) return hint || '.';
    const other = sep === '.' ? ',' : '.';
    if (core.indexOf(sep) !== core.lastIndexOf(sep)) return other; // repeated → grouping
    const after = core.length - core.indexOf(sep) - 1;
    if (after === 3) return hint || other; // ambiguous "1,234" / "1.234"
    return sep;
  }

  /** Returns 'unambiguous' decimal separator for a value, or null. */
  function decimalVote(raw) {
    const m = NUMBER_RE.exec(String(raw).replace(/[    ]/g, ' ').trim());
    if (!m) return null;
    const core = m[2];
    const hasDot = core.indexOf('.') !== -1;
    const hasComma = core.indexOf(',') !== -1;
    if (hasDot && hasComma) return core.lastIndexOf('.') > core.lastIndexOf(',') ? '.' : ',';
    const sep = hasDot ? '.' : hasComma ? ',' : null;
    if (!sep) return null;
    if (core.indexOf(sep) !== core.lastIndexOf(sep)) return sep === '.' ? ',' : '.';
    const after = core.length - core.indexOf(sep) - 1;
    return after === 3 ? null : sep;
  }

  function detectDecimalSeparator(values) {
    let dot = 0;
    let comma = 0;
    for (const v of values || []) {
      const vote = decimalVote(v);
      if (vote === '.') dot++;
      else if (vote === ',') comma++;
    }
    return comma > dot ? ',' : '.';
  }

  /**
   * Parses "€ 1.234,56", "(1,200)", "45 %", "12 kg", "USD 3.5" … into a normalized number.
   * Returns { value, text } or null when the cell is not a plain quantity (dates, phones, IDs, "12k"…).
   */
  function parseNumber(raw, decimalHint) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).replace(/[    ]/g, ' ').trim();
    if (!s || s.length > 64) return null;
    const m = NUMBER_RE.exec(s);
    if (!m) return null;
    let prefix = m[1];
    let core = m[2];
    let suffix = m[3];
    let negative = false;
    if (/\(\s*$/.test(prefix) && /^\s*\)/.test(suffix)) {
      negative = true;
      prefix = prefix.replace(/\(\s*$/, '');
      suffix = suffix.replace(/^\s*\)/, '');
    }
    const minus = (prefix.match(/[-−–]/g) || []).length;
    if (minus > 1 || (minus && negative)) return null;
    if (minus) negative = true;
    prefix = prefix.replace(/[-+−–]/g, '').trim();
    suffix = suffix.trim();
    if (prefix && !PREFIX_OK.test(prefix)) return null;
    if (suffix && (!SUFFIX_OK.test(suffix) || MULTIPLIERS.test(suffix))) return null;

    core = core.replace(/[’']/g, ' ');
    const dec = guessDecimal(core.replace(/ /g, ''), decimalHint);
    const group = dec === '.' ? ',' : '.';
    const decIdx = core.lastIndexOf(dec);
    if (core.indexOf(dec) !== decIdx) return null;
    let intPart = decIdx === -1 ? core : core.slice(0, decIdx);
    const frac = decIdx === -1 ? '' : core.slice(decIdx + 1);
    if (frac && !/^\d+$/.test(frac)) return null;
    if (decIdx !== -1 && !frac) return null;
    if (intPart.indexOf(dec) !== -1) return null;
    const groups = intPart.split(new RegExp('[ ' + (group === '.' ? '\\.' : ',') + ']'));
    if (groups.length > 1) {
      if (!/^\d{1,3}$/.test(groups[0])) return null;
      for (let i = 1; i < groups.length; i++) if (!/^\d{3}$/.test(groups[i])) return null;
    } else if (!/^\d+$/.test(intPart)) {
      return null;
    }
    intPart = groups.join('');
    if (intPart.length > 1 && intPart[0] === '0' && !frac) return null; // IDs / zip codes like 00123
    const text = (negative && /[1-9]/.test(intPart + frac) ? '-' : '') + intPart.replace(/^0+(?=\d)/, '') + (frac ? '.' + frac : '');
    return { value: Number(text), text };
  }

  // Placeholders for "no value" that must not prevent a column from being recognised as numeric.
  const NULL_TOKEN = /^(?:n\/?a|n\.?d\.?|null|none|nil|tbd|\?|-|–|—|\.{1,3}|…|×|x)$/i;

  function isBlank(v) {
    const s = String(v).trim();
    return s === '' || NULL_TOKEN.test(s);
  }

  function isNumericColumn(values, threshold) {
    const nonEmpty = (values || []).filter((v) => !isBlank(v));
    if (!nonEmpty.length) return false;
    const dec = detectDecimalSeparator(nonEmpty);
    const ok = nonEmpty.filter((v) => parseNumber(v, dec) !== null).length;
    return ok / nonEmpty.length >= (threshold || 0.8);
  }

  /** Strict machine number (safe to store as a numeric spreadsheet/JSON value). */
  function isStrictNumber(s) {
    if (typeof s !== 'string' || !/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,15})?$/.test(s)) return false;
    return s.replace(/[-.]/g, '').replace(/^0+/, '').length <= 15;
  }

  /* -------------------------------------------------------------- cleaning */

  function compileRegex(pattern, flags) {
    const p = String(pattern || '');
    if (p.length > 500) throw new TableSnapError('invalid_regex', 'Pattern too long');
    try {
      return new RegExp(p, (flags || 'i').replace(/[gy]/g, ''));
    } catch (e) {
      throw new TableSnapError('invalid_regex', e.message);
    }
  }

  /**
   * Pro cleaning pipeline. Header row (when hasHeader) is never filtered or numerically converted.
   */
  function cleanRows(rows, options) {
    const o = Object.assign(
      {
        removeEmptyRows: false,
        normalizeWhitespace: false,
        stripNumeric: false,
        regex: '',
        regexMode: 'keep',
        regexFlags: 'i',
        hasHeader: true,
      },
      options
    );
    let out = rectangularize(rows);
    if (o.normalizeWhitespace) out = out.map((r) => r.map((v) => v.replace(/\s+/g, ' ').trim()));
    if (o.removeEmptyRows) out = out.filter((r) => r.some((v) => v.trim() !== ''));
    const headerCount = o.hasHeader && out.length ? 1 : 0;
    if (o.regex) {
      const re = compileRegex(o.regex, o.regexFlags);
      const head = out.slice(0, headerCount);
      const body = out.slice(headerCount).filter((r) => {
        const hit = re.test(r.join('\t'));
        return o.regexMode === 'exclude' ? !hit : hit;
      });
      out = head.concat(body);
    }
    if (o.stripNumeric && out.length > headerCount) {
      const width = out[0].length;
      for (let c = 0; c < width; c++) {
        const values = [];
        for (let r = headerCount; r < out.length; r++) if (!isBlank(out[r][c])) values.push(out[r][c]);
        if (!values.length) continue;
        const dec = detectDecimalSeparator(values);
        const parsed = values.map((v) => parseNumber(v, dec));
        const ok = parsed.filter(Boolean).length;
        if (ok / values.length < 0.8) continue;
        for (let r = headerCount; r < out.length; r++) {
          const p = isBlank(out[r][c]) ? null : parseNumber(out[r][c], dec);
          if (p) out[r][c] = p.text;
        }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ JSON */

  function uniqueHeaders(row) {
    const seen = new Map();
    return (row || []).map((h, i) => {
      let base = String(h || '').replace(/\s+/g, ' ').trim() || `column_${i + 1}`;
      const key = base.toLowerCase();
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) base = `${base}_${n}`;
      return base;
    });
  }

  /** tables: [{name, rows, header}] → structured JSON-able object. */
  function toJSONData(tables, options) {
    const o = Object.assign({ typed: false, source: '', exportedAt: new Date().toISOString() }, options);
    const conv = (v) => (o.typed && isStrictNumber(v) ? Number(v) : v);
    return {
      generator: `TableSnap ${VERSION}`,
      source: o.source || undefined,
      exportedAt: o.exportedAt,
      tables: (tables || []).map((t, i) => {
        const grid = rectangularize(t.rows);
        const name = t.name || `Table ${i + 1}`;
        if (t.header && grid.length) {
          const cols = uniqueHeaders(grid[0]);
          return {
            name,
            columns: cols,
            rows: grid.slice(1).map((r) => {
              const obj = {};
              cols.forEach((col, ci) => {
                obj[col] = conv(r[ci]);
              });
              return obj;
            }),
          };
        }
        return { name, columns: null, rows: grid.map((r) => r.map(conv)) };
      }),
    };
  }

  /* ----------------------------------------------------------------- misc */

  function slugify(s, max) {
    const out = String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max || 40)
      .replace(/-+$/g, '');
    return out;
  }

  return {
    VERSION,
    TableSnapError,
    normalizeCellText,
    rectangularize,
    buildGrid,
    mergeHeaderRows,
    toCSV,
    toTSV,
    toMarkdown,
    parseNumber,
    detectDecimalSeparator,
    isNumericColumn,
    isStrictNumber,
    compileRegex,
    cleanRows,
    uniqueHeaders,
    toJSONData,
    slugify,
  };
});
