/*!
 * TableSnap content script — injected on demand (activeTab + scripting) when the popup opens.
 * Detects tables / ARIA grids / structured lists, extracts them as string grids and
 * highlights them while the popup is open. Never sends data anywhere: results go to the popup only.
 */
(() => {
  'use strict';

  const Core = globalThis.TableSnapCore;
  if (!Core) return;

  const ID_ATTR = 'data-tablesnap-id';
  const HOVER_ATTR = 'data-tablesnap-hover';
  const FOCUS_ATTR = 'data-tablesnap-focus';
  const STYLE_ID = 'tablesnap-highlight-style';
  const PORT_NAME = 'tablesnap-popup';
  const MAX_ITEMS = 200;
  const MAX_ROWS = 50000;
  const CHEAP_TEXT_CELLS = 20000;

  const S =
    globalThis.__tableSnapState ||
    (globalThis.__tableSnapState = { elements: new Map(), port: null, listenerBound: false, hoverEl: null, onHover: null });

  /* ------------------------------------------------------------ helpers */

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function readText(el, cheap) {
    if (!cheap) {
      const t = el.innerText;
      if (typeof t === 'string') return t;
    }
    return el.textContent || '';
  }

  function oneLine(s, max) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 90);
  }

  function nearestHeading(el) {
    let node = el;
    for (let depth = 0; depth < 4 && node && node !== document.body; depth++) {
      let sib = node.previousElementSibling;
      for (let hops = 0; sib && hops < 4; hops++) {
        if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent;
        const inner = sib.querySelectorAll('h1,h2,h3,h4,h5,h6');
        if (inner.length) return inner[inner.length - 1].textContent;
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }

  function labelFor(el) {
    let label = '';
    if (el.tagName === 'TABLE' && el.caption) label = el.caption.textContent;
    if (!label) label = el.getAttribute('aria-label') || '';
    if (!label) {
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      label = ids.map((id) => (document.getElementById(id) || {}).textContent || '').join(' ');
    }
    if (!label) label = el.getAttribute('title') || '';
    if (!label) label = nearestHeading(el);
    return oneLine(label);
  }

  /* --------------------------------------------------------- extractors */

  function extractNativeTable(table, cheap) {
    const specs = [];
    let truncated = false;
    for (const tr of table.rows) {
      if (specs.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
      specs.push(Array.from(tr.cells, (cell) => ({ text: readText(cell, cheap), colspan: cell.colSpan, rowspan: cell.rowSpan, th: cell.tagName === 'TH' })));
    }
    const first = specs[0] || [];
    const headRows = table.tHead ? table.tHead.rows.length : 0;
    const header = headRows > 0 || (first.length > 0 && first.every((c) => c.th));
    // tHead rows come first in table.rows, so the leading specs are the header rows.
    return { rows: Core.mergeHeaderRows(specs, headRows), header, truncated };
  }

  function extractAriaTable(el, cheap) {
    const rows = Array.from(el.querySelectorAll('[role="row"]')).filter((r) => r.closest('[role="table"],[role="grid"],[role="treegrid"]') === el);
    const specs = [];
    let truncated = false;
    let headerRow = false;
    rows.forEach((row, i) => {
      if (specs.length >= MAX_ROWS) {
        truncated = true;
        return;
      }
      const cells = Array.from(row.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')).filter(
        (c) => c.closest('[role="row"]') === row
      );
      if (i === 0 && cells.length && cells.every((c) => c.getAttribute('role') === 'columnheader')) headerRow = true;
      specs.push(cells.map((c) => ({ text: readText(c, cheap), colspan: c.getAttribute('aria-colspan') || 1, rowspan: c.getAttribute('aria-rowspan') || 1 })));
    });
    return { rows: Core.buildGrid(specs), header: headerRow, truncated };
  }

  function extractList(el, cheap) {
    const rows = [];
    if (el.tagName === 'DL') {
      let current = null;
      const visit = (children) => {
        for (const child of children) {
          if (child.tagName === 'DIV') visit(child.children);
          else if (child.tagName === 'DT') {
            current = [Core.normalizeCellText(readText(child, cheap)), ''];
            rows.push(current);
          } else if (child.tagName === 'DD') {
            const text = Core.normalizeCellText(readText(child, cheap));
            if (!current) {
              current = ['', ''];
              rows.push(current);
            }
            current[1] = current[1] ? current[1] + '\n' + text : text;
          }
        }
      };
      visit(el.children);
    } else {
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue;
        const text = Core.normalizeCellText(readText(li, cheap));
        if (text) rows.push([text]);
        if (rows.length >= MAX_ROWS) break;
      }
    }
    return { rows: rows.filter((r) => r.some((v) => v !== '')), header: false, truncated: rows.length >= MAX_ROWS };
  }

  /* --------------------------------------------------------------- scan */

  function clearMarks() {
    document.querySelectorAll(`[${ID_ATTR}],[${HOVER_ATTR}],[${FOCUS_ATTR}]`).forEach((el) => {
      el.removeAttribute(ID_ATTR);
      el.removeAttribute(HOVER_ATTR);
      el.removeAttribute(FOCUS_ATTR);
    });
    S.elements.clear();
    S.hoverEl = null;
  }

  const LIST_EXCLUDE =
    'table,[role="table"],[role="grid"],[role="treegrid"],nav,header,footer,[role="navigation"],[role="menu"],[role="menubar"],[role="tablist"],[role="listbox"],[role="tree"]';

  function scan() {
    clearMarks();
    const cheap = document.querySelectorAll('td,th').length > CHEAP_TEXT_CELLS;
    const items = [];
    const nodes = document.querySelectorAll('table,[role="table"],[role="grid"],[role="treegrid"],ul,ol,dl');
    for (const el of nodes) {
      if (items.length >= MAX_ITEMS) break;
      if (el.closest('[aria-hidden="true"]') || !isVisible(el)) continue;
      let data = null;
      let kind = '';
      if (el.tagName === 'TABLE') {
        if (el.matches('[role="presentation"],[role="none"]') || el.querySelector('table')) continue; // layout tables
        kind = 'table';
        data = extractNativeTable(el, cheap);
        if (data.rows.length < 2 || data.rows[0].length < 2) data = null;
      } else if (el.matches('[role="table"],[role="grid"],[role="treegrid"]')) {
        kind = 'grid';
        data = extractAriaTable(el, cheap);
        if (data.rows.length < 2 || data.rows[0].length < 2) data = null;
      } else {
        if (el.closest(LIST_EXCLUDE) || (el.parentElement && el.parentElement.closest('li,dd'))) continue;
        kind = 'list';
        data = extractList(el, cheap);
        if (data.rows.length < 3) data = null;
      }
      if (!data) continue;
      const id = items.length + 1;
      el.setAttribute(ID_ATTR, String(id));
      S.elements.set(id, el);
      items.push({
        id,
        kind,
        tag: el.tagName.toLowerCase(),
        label: labelFor(el),
        header: data.header,
        truncated: data.truncated,
        rows: data.rows,
        rowCount: data.rows.length,
        colCount: data.rows[0] ? data.rows[0].length : 0,
      });
    }
    return { url: location.href, title: document.title, items };
  }

  /* ---------------------------------------------------------- highlight */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      `[${HOVER_ATTR}]{outline:2px dashed #14b8a6 !important;outline-offset:2px !important;cursor:copy !important}` +
      `[${FOCUS_ATTR}]{outline:3px solid #0d9488 !important;outline-offset:3px !important;box-shadow:0 0 0 9999px rgba(15,23,42,.08) !important;transition:outline-color .15s ease !important}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function setFocus(id, scroll) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((el) => el.removeAttribute(FOCUS_ATTR));
    const el = S.elements.get(id);
    if (!el || !el.isConnected) return;
    ensureStyle();
    el.setAttribute(FOCUS_ATTR, '');
    if (scroll) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: r.height > innerHeight ? 'start' : 'center', behavior: 'smooth' });
    }
  }

  function enablePageHover() {
    ensureStyle();
    if (S.onHover) return;
    S.onHover = (event) => {
      const target = event.target instanceof Element ? event.target.closest(`[${ID_ATTR}]`) : null;
      if (target === S.hoverEl) return;
      if (S.hoverEl) S.hoverEl.removeAttribute(HOVER_ATTR);
      S.hoverEl = target;
      if (target) target.setAttribute(HOVER_ATTR, '');
      if (S.port) {
        try {
          S.port.postMessage({ type: 'pageHover', id: target ? Number(target.getAttribute(ID_ATTR)) : null });
        } catch (_) {
          /* popup closed */
        }
      }
    };
    document.addEventListener('mouseover', S.onHover, true);
  }

  function teardown() {
    if (S.onHover) document.removeEventListener('mouseover', S.onHover, true);
    S.onHover = null;
    document.querySelectorAll(`[${HOVER_ATTR}],[${FOCUS_ATTR}]`).forEach((el) => {
      el.removeAttribute(HOVER_ATTR);
      el.removeAttribute(FOCUS_ATTR);
    });
    S.hoverEl = null;
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  if (!S.listenerBound) {
    S.listenerBound = true;
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== PORT_NAME) return;
      S.port = port;
      enablePageHover();
      port.onMessage.addListener((msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'focus') setFocus(Number(msg.id), msg.scroll !== false);
        else if (msg.type === 'blur') document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((el) => el.removeAttribute(FOCUS_ATTR));
      });
      port.onDisconnect.addListener(() => {
        if (S.port === port) {
          S.port = null;
          teardown();
        }
      });
    });
  }

  globalThis.TableSnapContent = { scan };
})();
