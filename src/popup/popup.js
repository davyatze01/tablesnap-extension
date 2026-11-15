/**
 * TableSnap popup controller.
 * Data flow: popup → chrome.scripting (activeTab) → content script scan → rows rendered here → exports
 * are generated locally (Blob download / clipboard). Nothing is uploaded.
 */
import { CONFIG } from '../config.js';
import { getLicenseState, activateLicense, deactivateLicense, revalidateIfDue, isProActive, maskKey } from '../lib/license.js';
import { getReviewState, recordExport, markReviewShown, shouldShowReview, reviewUrl } from '../lib/review.js';
import { DEFAULT_OPTIONS, sanitizeOptions, hasCleaning, loadOptions, saveOptions, clearPreset, resolveSeparator, normalizeHostname } from '../lib/presets.js';

const Core = globalThis.TableSnapCore;
const XLSX = globalThis.TableSnapXLSX;
const storage = chrome.storage.local;
const PORT_NAME = 'tablesnap-popup';
const PREVIEW_ROWS = 8;

const $ = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

const state = {
  tab: null,
  hostname: '',
  items: [],
  selected: new Set(),
  options: { ...DEFAULT_OPTIONS },
  fromPreset: false,
  license: null,
  port: null,
  previewId: null,
};
const isPro = () => isProActive(state.license);

/* ---------------------------------------------------------------- i18n */

function applyI18n(root) {
  document.documentElement.lang = chrome.i18n.getUILanguage() || 'en';
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
}

/* ------------------------------------------------------------- feedback */

let toastTimer = 0;
function toast(message, kind) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'warn' ? 3800 : 2200);
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

function handleError(err) {
  if (err && err.code === 'invalid_regex') return toast(t('invalidRegex'), 'warn');
  if (err && err.code === 'empty') return toast(t('emptyAfterCleaning'), 'warn');
  if (err && err.code === 'clipboard') return toast(t('clipboardFailed'), 'warn');
  console.error('[TableSnap]', err);
  toast(t('exportFailed') + ' ' + ((err && err.message) || ''), 'warn');
}

/* ------------------------------------------------------------------ tab */

function hostnameOf(url) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch (_) {
    return '';
  }
}

function isScriptable(url) {
  if (!url) return true; // unknown: let executeScript decide
  if (!/^(https?|file):/i.test(url)) return false;
  return !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/i.test(url);
}

function connectPort() {
  disconnectPort();
  try {
    const port = chrome.tabs.connect(state.tab.id, { name: PORT_NAME });
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(() => {
      if (state.port === port) state.port = null;
    });
    state.port = port;
  } catch (_) {
    state.port = null;
  }
}

function disconnectPort() {
  if (!state.port) return;
  try {
    state.port.disconnect();
  } catch (_) {
    /* ignore */
  }
  state.port = null;
}

function post(msg) {
  if (!state.port) return;
  try {
    state.port.postMessage(msg);
  } catch (_) {
    state.port = null;
  }
}

function onPortMessage(msg) {
  if (!msg || msg.type !== 'pageHover') return;
  document.querySelectorAll('.item.page-hover').forEach((el) => el.classList.remove('page-hover'));
  if (msg.id == null) return;
  const li = document.querySelector(`.item[data-id="${Number(msg.id)}"]`);
  if (li) {
    li.classList.add('page-hover');
    li.scrollIntoView({ block: 'nearest' });
  }
}

async function scan() {
  disconnectPort();
  setStatus(t('scanning'), 'busy');
  state.items = [];
  state.selected.clear();
  state.previewId = null;
  renderItems();
  if (!state.tab || state.tab.id == null || !isScriptable(state.tab.url)) {
    setStatus(t('restrictedPage'), 'warn');
    return;
  }
  try {
    const target = { tabId: state.tab.id };
    await chrome.scripting.executeScript({ target, files: ['lib/tablecore.js', 'content/content.js'] });
    const [res] = await chrome.scripting.executeScript({
      target,
      func: () => (globalThis.TableSnapContent ? globalThis.TableSnapContent.scan() : null),
    });
    state.items = (res && res.result && res.result.items) || [];
  } catch (err) {
    console.warn('[TableSnap] scan failed', err);
    setStatus(t('restrictedPage'), 'warn');
    return;
  }
  connectPort();
  if (!state.items.length) setStatus(t('noTables'), 'warn');
  else setStatus(t('tablesFound', String(state.items.length)), 'ok');
  $('hoverHint').hidden = !state.items.length;
  renderItems();
}

/* ------------------------------------------------------------- rendering */

const EYE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 8.6 1.5 12c1.2 3.4 5 7 10.5 7s9.3-3.6 10.5-7C21.3 8.6 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';

function kindLabel(item) {
  return t(item.kind === 'list' ? 'kindList' : item.kind === 'grid' ? 'kindGrid' : 'kindTable');
}

function itemName(item) {
  return item.label ? `${kindLabel(item)} ${item.id} · ${item.label}` : `${kindLabel(item)} ${item.id}`;
}

function chip(text, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

function renderPreview(item) {
  const box = document.createElement('div');
  box.className = 'preview';
  const table = document.createElement('table');
  const header = effectiveHeader(item);
  item.rows.slice(0, PREVIEW_ROWS + (header ? 1 : 0)).forEach((row, i) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement(header && i === 0 ? 'th' : 'td');
      td.textContent = cell;
      td.title = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  box.appendChild(table);
  const remaining = item.rows.length - PREVIEW_ROWS - (header ? 1 : 0);
  if (remaining > 0) {
    const more = document.createElement('div');
    more.className = 'more';
    more.textContent = t('previewMore', String(remaining));
    box.appendChild(more);
  }
  return box;
}

function renderItems() {
  const list = $('itemList');
  list.textContent = '';
  for (const item of state.items) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = String(item.id);

    const main = document.createElement('div');
    main.className = 'item-main';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(item.id);
    cb.setAttribute('aria-label', itemName(item));
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      renderSelection();
    });

    const info = document.createElement('div');
    info.className = 'item-info';
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = itemName(item);
    title.title = itemName(item);
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = `${item.rowCount} ${t('rows')} × ${item.colCount} ${t('cols')} · <${item.tag}>${item.truncated ? ' · …' : ''}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      chip('CSV', t('titleCsv'), () => exportItem(item, 'csv')),
      chip('MD', t('titleMarkdown'), () => exportItem(item, 'md')),
      chip('TSV', t('titleTsv'), () => exportItem(item, 'tsv'))
    );
    const eye = chip('', t('titlePreview'), () => {
      state.previewId = state.previewId === item.id ? null : item.id;
      renderItems();
    });
    eye.classList.add('eye');
    eye.innerHTML = EYE_SVG; // static constant markup
    eye.setAttribute('aria-pressed', String(state.previewId === item.id));
    actions.append(eye);

    main.append(cb, info, actions);
    li.append(main);
    if (state.previewId === item.id) li.append(renderPreview(item));

    li.addEventListener('mouseenter', () => post({ type: 'focus', id: item.id, scroll: true }));
    li.addEventListener('focusin', () => post({ type: 'focus', id: item.id, scroll: true }));
    list.append(li);
  }
  list.onmouseleave = () => post({ type: 'blur' });
  renderSelection();
}

function renderSelection() {
  const n = state.selected.size;
  $('selectedCount').textContent = state.items.length ? t('selectedCount', String(n)) : '';
  const all = $('selectAll');
  all.checked = state.items.length > 0 && n === state.items.length;
  all.indeterminate = n > 0 && n < state.items.length;
  all.disabled = !state.items.length;
}

function renderOptions() {
  const o = state.options;
  $('optHeader').checked = o.firstRowHeader;
  $('optSeparator').value = o.csvSeparator;
  $('optRemoveEmpty').checked = o.removeEmptyRows;
  $('optNormalize').checked = o.normalizeWhitespace;
  $('optStripNumeric').checked = o.stripNumeric;
  $('optRegex').value = o.regex;
  $('optRegexMode').value = o.regexMode;
  renderPresetNote();
}

function renderPresetNote() {
  const show = isPro() && !!state.hostname;
  $('presetNote').textContent = show ? t('presetNote', state.hostname) : '';
  $('presetReset').hidden = !(show && state.fromPreset);
}

function renderLicense() {
  const pro = isPro();
  $('proBadge').hidden = !pro;
  $('upsell').hidden = pro;
  $('proTools').disabled = !pro;
  $('licenseActive').hidden = !pro;
  if (pro) $('licenseInfo').textContent = `✓ ${t('licenseActive')} — ${maskKey(state.license.key)}`;
  else if (state.license && state.license.status === 'expired_offline') $('upsell').querySelector('p').textContent = t('licenseExpiredOffline');
  else if (state.license && state.license.status === 'invalid') $('upsell').querySelector('p').textContent = t('licenseInvalid');
  renderPresetNote();
}

/* --------------------------------------------------------------- export */

function effectiveHeader(item) {
  return item.kind !== 'list' && state.options.firstRowHeader;
}

function prepareRows(item) {
  let rows = item.rows;
  if (isPro() && hasCleaning(state.options)) {
    const o = state.options;
    rows = Core.cleanRows(rows, {
      removeEmptyRows: o.removeEmptyRows,
      normalizeWhitespace: o.normalizeWhitespace,
      stripNumeric: o.stripNumeric,
      regex: o.regex,
      regexMode: o.regexMode,
      hasHeader: effectiveHeader(item),
    });
  }
  if (!rows.length) throw new Core.TableSnapError('empty');
  return rows;
}

function baseName(item) {
  const host = Core.slugify(state.hostname, 30) || 'page';
  const label = item ? Core.slugify(item.label, 30) || `${item.kind}-${item.id}` : 'tables';
  return `tablesnap_${host}_${label}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Core.TableSnapError('clipboard');
  }
}

async function exportItem(item, format) {
  try {
    const rows = prepareRows(item);
    if (format === 'csv') {
      const csv = Core.toCSV(rows, { separator: resolveSeparator(state.options.csvSeparator, chrome.i18n.getUILanguage()) });
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), baseName(item) + '.csv');
      toast(t('downloadedCsv'));
    } else if (format === 'md') {
      await copyText(Core.toMarkdown(rows, { header: effectiveHeader(item), columnLabel: t('columnLabel') }));
      toast(t('copiedMarkdown'));
    } else {
      await copyText(Core.toTSV(rows));
      toast(t('copiedTsv'));
    }
    await onExportSuccess();
  } catch (err) {
    handleError(err);
  }
}

async function exportSelected(format) {
  if (!isPro()) return;
  const items = state.items.filter((i) => state.selected.has(i.id));
  if (!items.length) return toast(t('selectAtLeastOne'), 'warn');
  try {
    const tables = items.map((item) => ({ name: item.label || `${kindLabel(item)} ${item.id}`, rows: prepareRows(item), header: effectiveHeader(item) }));
    const name = items.length === 1 ? baseName(items[0]) : baseName(null);
    if (format === 'xlsx') {
      const bytes = XLSX.build(tables);
      downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name + '.xlsx');
    } else {
      const data = Core.toJSONData(tables, { typed: true, source: state.tab && state.tab.url });
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name + '.json');
    }
    toast(t('downloadedFile'));
    await onExportSuccess();
  } catch (err) {
    handleError(err);
  }
}

/* --------------------------------------------------------------- review */

async function onExportSuccess() {
  const s = await recordExport(storage);
  if (shouldShowReview(s, CONFIG.REVIEW_PROMPT_AFTER_EXPORTS)) await showReviewBanner();
}

async function showReviewBanner() {
  $('reviewLink').href = reviewUrl(CONFIG, navigator.userAgent);
  $('reviewBanner').hidden = false;
  await markReviewShown(storage); // shown exactly once
}

async function checkReviewBanner() {
  const s = await getReviewState(storage);
  if (shouldShowReview(s, CONFIG.REVIEW_PROMPT_AFTER_EXPORTS)) await showReviewBanner();
}

/* -------------------------------------------------------------- license */

async function onActivate(event) {
  event.preventDefault();
  // Ask for the LemonSqueezy origin first, while still inside the user gesture.
  let permission = Promise.resolve(false);
  try {
    permission = chrome.permissions.request({ origins: [CONFIG.LEMONSQUEEZY_API_ORIGIN] });
  } catch (_) {
    /* older browsers */
  }
  const btn = $('activateBtn');
  btn.disabled = true;
  btn.textContent = t('activating');
  try {
    await permission.catch(() => false); // if denied we still try: the API may allow CORS
    const browser = /\bEdg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome';
    const instanceName = `TableSnap ${browser} ${Math.random().toString(36).slice(2, 8)}`;
    const res = await activateLicense($('licenseInput').value, { storage, config: CONFIG, instanceName });
    if (res.ok) {
      state.license = res.license;
      $('licenseInput').value = '';
      $('licenseForm').hidden = true;
      await reloadOptions();
      renderLicense();
      toast(t('licenseActivated'));
    } else {
      const map = { invalid_format: 'licenseFormat', network: 'licenseNetwork', limit: 'licenseLimit', wrong_product: 'licenseWrongProduct' };
      toast(t(map[res.code] || 'licenseInvalid'), 'warn');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = t('activate');
  }
}

async function onRemoveLicense() {
  await deactivateLicense({ storage, config: CONFIG });
  state.license = null;
  await reloadOptions();
  renderLicense();
  toast(t('licenseRemoved'));
}

/* -------------------------------------------------------------- options */

async function reloadOptions() {
  const { options, fromPreset } = await loadOptions(storage, state.hostname, isPro());
  state.options = options;
  state.fromPreset = fromPreset;
  renderOptions();
}

let saveTimer = 0;
function onOptionChange() {
  const regex = $('optRegex').value;
  state.options = sanitizeOptions({
    ...state.options,
    firstRowHeader: $('optHeader').checked,
    csvSeparator: $('optSeparator').value,
    removeEmptyRows: $('optRemoveEmpty').checked,
    normalizeWhitespace: $('optNormalize').checked,
    stripNumeric: $('optStripNumeric').checked,
    regex,
    regexMode: $('optRegexMode').value,
  });
  let regexOk = true;
  try {
    if (regex) Core.compileRegex(regex);
  } catch (_) {
    regexOk = false;
  }
  $('optRegex').setAttribute('aria-invalid', String(!regexOk));
  $('optRegex').title = regexOk ? '' : t('invalidRegex');
  if (state.previewId != null) renderItems();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveOptions(storage, state.hostname, isPro(), state.options);
    if (isPro() && state.hostname) {
      state.fromPreset = true;
      renderPresetNote();
    }
  }, 250);
}

/* ----------------------------------------------------------------- init */

function bindEvents() {
  $('rescanBtn').addEventListener('click', scan);
  ['optHeader', 'optSeparator', 'optRemoveEmpty', 'optNormalize', 'optStripNumeric', 'optRegexMode'].forEach((id) =>
    $(id).addEventListener('change', onOptionChange)
  );
  $('optRegex').addEventListener('input', onOptionChange);
  $('selectAll').addEventListener('change', (e) => {
    state.selected = e.target.checked ? new Set(state.items.map((i) => i.id)) : new Set();
    renderItems();
  });
  $('exportXlsx').addEventListener('click', () => exportSelected('xlsx'));
  $('exportJson').addEventListener('click', () => exportSelected('json'));
  $('presetReset').addEventListener('click', async () => {
    await clearPreset(storage, state.hostname);
    await reloadOptions();
    toast(t('presetCleared'));
  });
  $('haveKeyBtn').addEventListener('click', () => {
    $('licenseForm').hidden = false;
    $('licenseInput').focus();
  });
  $('licenseForm').addEventListener('submit', onActivate);
  $('removeLicenseBtn').addEventListener('click', onRemoveLicense);
  $('reviewDismiss').addEventListener('click', () => ($('reviewBanner').hidden = true));
  $('reviewLink').addEventListener('click', () => ($('reviewBanner').hidden = true));
  $('buyLink').href = CONFIG.CHECKOUT_URL;
  $('websiteLink').href = CONFIG.WEBSITE_URL;
  $('privacyLink').href = CONFIG.PRIVACY_URL;
  window.addEventListener('pagehide', disconnectPort);
}

async function init() {
  applyI18n(document);
  bindEvents();
  state.license = await getLicenseState(storage);
  renderLicense();
  revalidateIfDue({ storage, config: CONFIG })
    .then(async (r) => {
      if (r && r.changed) {
        state.license = await getLicenseState(storage);
        await reloadOptions();
        renderLicense();
      }
    })
    .catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab || null;
  state.hostname = hostnameOf(tab && tab.url);
  await reloadOptions();
  await checkReviewBanner();
  await scan();
}

init().catch(handleError);
