/**
 * Export options + per-domain presets (Pro). Stored only in chrome.storage.local.
 */

export const DEFAULT_OPTIONS = Object.freeze({
  firstRowHeader: true,
  csvSeparator: 'auto',
  removeEmptyRows: false,
  normalizeWhitespace: false,
  stripNumeric: false,
  regex: '',
  regexMode: 'keep',
});

const FREE_FIELDS = ['firstRowHeader', 'csvSeparator'];
const SEPARATORS = ['auto', ',', ';', '\t'];

export function sanitizeOptions(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bool = (k) => (typeof r[k] === 'boolean' ? r[k] : DEFAULT_OPTIONS[k]);
  return {
    firstRowHeader: bool('firstRowHeader'),
    csvSeparator: SEPARATORS.includes(r.csvSeparator) ? r.csvSeparator : DEFAULT_OPTIONS.csvSeparator,
    removeEmptyRows: bool('removeEmptyRows'),
    normalizeWhitespace: bool('normalizeWhitespace'),
    stripNumeric: bool('stripNumeric'),
    regex: typeof r.regex === 'string' ? r.regex.slice(0, 500) : '',
    regexMode: r.regexMode === 'exclude' ? 'exclude' : 'keep',
  };
}

export function hasCleaning(o) {
  return !!(o && (o.removeEmptyRows || o.normalizeWhitespace || o.stripNumeric || o.regex));
}

export function normalizeHostname(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

export const presetKey = (host) => `preset:${normalizeHostname(host)}`;

/** Locales whose Excel uses ';' as list separator by default. */
export function resolveSeparator(sep, uiLanguage) {
  if (sep && sep !== 'auto') return sep;
  const lang = String(uiLanguage || 'en').toLowerCase().split(/[-_]/)[0];
  return ['it', 'de', 'fr', 'es', 'pt', 'nl', 'da', 'fi', 'sv', 'nb', 'pl', 'cs', 'ru', 'tr'].includes(lang) ? ';' : ',';
}

export async function loadOptions(storage, hostname, pro) {
  const key = presetKey(hostname);
  const data = (await storage.get(['options', key])) || {};
  const base = sanitizeOptions(data.options);
  if (pro && hostname && data[key]) return { options: sanitizeOptions({ ...base, ...data[key] }), fromPreset: true };
  return { options: base, fromPreset: false };
}

export async function saveOptions(storage, hostname, pro, options) {
  const clean = sanitizeOptions(options);
  const globalPart = {};
  FREE_FIELDS.forEach((k) => (globalPart[k] = clean[k]));
  const patch = { options: globalPart };
  if (pro && hostname) patch[presetKey(hostname)] = { ...clean, savedAt: Date.now() };
  await storage.set(patch);
  return clean;
}

export async function clearPreset(storage, hostname) {
  await storage.remove(presetKey(hostname));
}
