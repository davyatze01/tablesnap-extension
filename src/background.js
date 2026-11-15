/**
 * TableSnap service worker — only job: silent license re-validation (every 7 days) on browser start
 * and on install/update. No alarms permission needed; the popup also re-checks when opened.
 */
import { CONFIG } from './config.js';
import { revalidateIfDue } from './lib/license.js';

function revalidate() {
  revalidateIfDue({ storage: chrome.storage.local, config: CONFIG }).catch(() => {
    /* offline: grace period handles it */
  });
}

chrome.runtime.onStartup.addListener(revalidate);
chrome.runtime.onInstalled.addListener(revalidate);
