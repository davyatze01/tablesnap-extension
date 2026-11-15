// Unit tests for src/lib/tablecore.js and src/lib/xlsx-lite.js (run with: node --test tests/js/)
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/lib/tablecore.js';
import '../../src/lib/xlsx-lite.js';

const Core = globalThis.TableSnapCore;
const XLSX = globalThis.TableSnapXLSX;

test('normalizeCellText collapses whitespace, keeps line breaks', () => {
  assert.equal(Core.normalizeCellText('  a  b \r\n\r\n  c\t d  '), 'a b\nc d');
  assert.equal(Core.normalizeCellText(null), '');
  assert.equal(Core.normalizeCellText('x​y'), 'xy');
});

test('buildGrid expands colspan and rowspan', () => {
  const grid = Core.buildGrid([
    [{ text: 'Region', rowspan: 2 }, { text: 'Sales', colspan: 2 }],
    [{ text: 'Q1' }, { text: 'Q2' }],
    [{ text: 'North' }, { text: '10' }, { text: '12' }],
  ]);
  assert.deepEqual(grid, [
    ['Region', 'Sales', ''],
    ['Region', 'Q1', 'Q2'],
    ['North', '10', '12'],
  ]);
});

test('mergeHeaderRows collapses a 2-row thead into one header', () => {
  const specs = [
    [{ text: 'Region', rowspan: 2 }, { text: '2025', colspan: 2 }],
    [{ text: 'Q1' }, { text: 'Q2' }],
    [{ text: 'North' }, { text: '10' }, { text: '12' }],
  ];
  assert.deepEqual(Core.mergeHeaderRows(specs, 2), [
    ['Region', '2025 Q1', '2025 Q2'],
    ['North', '10', '12'],
  ]);
  assert.deepEqual(Core.mergeHeaderRows(specs, 1), Core.buildGrid(specs));
});

test('buildGrid clamps rowspan beyond table and pads ragged rows', () => {
  const grid = Core.buildGrid([[{ text: 'a', rowspan: 99 }, { text: 'b' }], [{ text: 'c' }, { text: 'd' }, { text: 'e' }]]);
  assert.deepEqual(grid, [
    ['a', 'b', '', ''],
    ['a', 'c', 'd', 'e'],
  ]);
});

test('toCSV quotes commas, quotes, newlines and adds BOM + CRLF', () => {
  const csv = Core.toCSV([
    ['name', 'note'],
    ['Rossi, Mario', 'said "hi"\nbye'],
  ]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿name,note\r\n"Rossi, Mario","said ""hi""\nbye"\r\n');
});

test('toCSV semicolon separator and formula protection', () => {
  const csv = Core.toCSV([['=SUM(A1)', '-5', '-', '+39 333 1234567', 'a;b']], { separator: ';', bom: false });
  assert.equal(csv, "'=SUM(A1);-5;-;+39 333 1234567;\"a;b\"\r\n");
});

test('toTSV flattens tabs and newlines', () => {
  assert.equal(Core.toTSV([['a\tb', 'c\nd'], ['1', '2']]), 'a b\tc d\n1\t2');
});

test('toMarkdown escapes pipes, converts newlines, right-aligns numbers', () => {
  const md = Core.toMarkdown([
    ['City', 'Pop.'],
    ['A|B', '1,200'],
    ['Line1\nLine2', '300'],
  ]);
  const lines = md.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^\| City +\| +Pop\. \|$/);
  assert.match(lines[1], /-:\s\|$/);
  assert.ok(lines[2].includes('A\\|B'));
  assert.ok(lines[3].includes('Line1<br>Line2'));
});

test('toMarkdown without header generates column labels', () => {
  const md = Core.toMarkdown([['x', 'y']], { header: false, columnLabel: 'Colonna' });
  assert.ok(md.startsWith('| Colonna 1 | Colonna 2 |'));
});

test('parseNumber handles currencies, units, locales and rejects non-quantities', () => {
  const p = (s, d) => (Core.parseNumber(s, d) || {}).text ?? null;
  assert.equal(p('€ 1.234,56'), '1234.56');
  assert.equal(p('$1,234.56'), '1234.56');
  assert.equal(p('1 234 567'), '1234567');
  assert.equal(p('(1,200)'), '-1200');
  assert.equal(p('-€5'), '-5');
  assert.equal(p('−3,5 %'), '-3.5');
  assert.equal(p('45%'), '45');
  assert.equal(p('12 kg'), '12');
  assert.equal(p('100 km/h'), '100');
  assert.equal(p('USD 3.5'), '3.5');
  assert.equal(p('R$ 10,50'), '10.50');
  assert.equal(p("1'234.5"), '1234.5');
  assert.equal(p('1.234', ','), '1234');
  assert.equal(p('1.234', '.'), '1.234');
  for (const bad of ['2024-01-05', '12.05.2024', '+39 333 1234567', 'Q1', '12k', '1.2M', '00123', 'abc', '#1', '1/2', '']) {
    assert.equal(p(bad), null, bad);
  }
});

test('detectDecimalSeparator votes on unambiguous values', () => {
  assert.equal(Core.detectDecimalSeparator(['1.234,5', '2,75', '1.000']), ',');
  assert.equal(Core.detectDecimalSeparator(['1,234.5', '2.75', '1,000']), '.');
});

test('cleanRows: empty rows, whitespace, numeric columns, regex keep/exclude', () => {
  const rows = [
    ['Country', 'Price', 'Code'],
    ['Italy', '€ 1.200,50', '00123'],
    ['', '', ''],
    ['  Spain\n ', '€ 980,00', '00456'],
    ['France', '€ 2.000,00', '00789'],
  ];
  const out = Core.cleanRows(rows, { removeEmptyRows: true, normalizeWhitespace: true, stripNumeric: true, hasHeader: true });
  assert.deepEqual(out, [
    ['Country', 'Price', 'Code'],
    ['Italy', '1200.50', '00123'],
    ['Spain', '980.00', '00456'],
    ['France', '2000.00', '00789'],
  ]);
  const kept = Core.cleanRows(out, { regex: '^(italy|spain)', hasHeader: true });
  assert.deepEqual(kept.map((r) => r[0]), ['Country', 'Italy', 'Spain']);
  const excluded = Core.cleanRows(out, { regex: 'spain', regexMode: 'exclude', hasHeader: true });
  assert.deepEqual(excluded.map((r) => r[0]), ['Country', 'Italy', 'France']);
  assert.throws(() => Core.cleanRows(out, { regex: '(' }), (e) => e.code === 'invalid_regex');
});

test('cleanRows ignores n/a-style placeholders when detecting numeric columns', () => {
  const out = Core.cleanRows([['Q2'], ['€ 980,00'], ['€ 15,00'], ['n/a'], ['—']], { stripNumeric: true });
  assert.deepEqual(out, [['Q2'], ['980.00'], ['15.00'], ['n/a'], ['—']]);
});

test('cleanRows leaves mostly-text columns untouched', () => {
  const out = Core.cleanRows([['h'], ['10 €'], ['n/a'], ['text']], { stripNumeric: true });
  assert.deepEqual(out, [['h'], ['10 €'], ['n/a'], ['text']]);
});

test('toJSONData builds objects with unique keys and typed numbers', () => {
  const data = Core.toJSONData(
    [
      { name: 'T1', header: true, rows: [['Name', 'Name', ''], ['a', 'b', '3.5'], ['c', 'd', '007']] },
      { name: 'L', header: false, rows: [['x'], ['y']] },
    ],
    { typed: true, exportedAt: 'fixed' }
  );
  assert.deepEqual(data.tables[0].columns, ['Name', 'Name_2', 'column_3']);
  assert.deepEqual(data.tables[0].rows[0], { Name: 'a', Name_2: 'b', column_3: 3.5 });
  assert.equal(data.tables[0].rows[1].column_3, '007');
  assert.deepEqual(data.tables[1].rows, [['x'], ['y']]);
});

test('isStrictNumber guards precision and identifiers', () => {
  assert.ok(Core.isStrictNumber('-12.5'));
  assert.ok(Core.isStrictNumber('0'));
  assert.ok(!Core.isStrictNumber('0123'));
  assert.ok(!Core.isStrictNumber('1234567890123456'));
  assert.ok(!Core.isStrictNumber('1e5'));
});

test('slugify', () => {
  assert.equal(Core.slugify('Città più belle — 2025!'), 'citta-piu-belle-2025');
});

test('xlsx: crc32, column names, sheet names', () => {
  assert.equal(XLSX.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(XLSX.colName(0), 'A');
  assert.equal(XLSX.colName(25), 'Z');
  assert.equal(XLSX.colName(26), 'AA');
  assert.equal(XLSX.colName(701), 'ZZ');
  assert.equal(XLSX.colName(702), 'AAA');
  const used = new Set();
  assert.equal(XLSX.sanitizeSheetName('a/b:c', used), 'a b c');
  assert.equal(XLSX.sanitizeSheetName('A B C', used), 'A B C (2)');
  assert.equal(XLSX.sanitizeSheetName('x'.repeat(40), used).length, 31);
  assert.equal(XLSX.sanitizeSheetName('', used), 'Sheet');
});

test('xlsx: build produces a valid zip signature', () => {
  const bytes = XLSX.build([{ name: 'T', header: true, rows: [['a', 'b'], ['1', 'x&y']] }]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 500);
});
