// Helper used by tests/test_js_logic.py: writes an XLSX + CSV produced by the real extension code,
// so Python can independently verify them with zipfile/ElementTree and the csv module.
// Usage: node tests/js/export_fixture.js <outDir>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/lib/tablecore.js';
import '../../src/lib/xlsx-lite.js';

const Core = globalThis.TableSnapCore;
const XLSX = globalThis.TableSnapXLSX;
const out = process.argv[2];

export const ROWS = [
  ['Città', 'Prezzo', 'Note'],
  ['Milano', '€ 1.234,50', 'virgola, "quote" & <tag>'],
  ['Roma', '€ 980,00', 'riga1\nriga2'],
  ['Napoli', '€ 15,00', '=HYPERLINK("x")'],
];

const cleaned = Core.cleanRows(ROWS, { stripNumeric: true, hasHeader: true });
const xlsx = XLSX.build([
  { name: 'Prezzi/2025', rows: cleaned, header: true },
  { name: 'Lista', rows: [['uno'], ['due']], header: false },
]);
writeFileSync(join(out, 'fixture.xlsx'), xlsx);
writeFileSync(join(out, 'fixture.csv'), Core.toCSV(ROWS, { separator: ';' }), 'utf8');
writeFileSync(join(out, 'fixture.json'), JSON.stringify({ rows: ROWS, cleaned }), 'utf8');
