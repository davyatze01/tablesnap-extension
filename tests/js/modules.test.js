// Unit tests for license / review / presets ES modules with an in-memory storage and a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activateLicense, revalidateIfDue, deactivateLicense, getLicenseState, isProActive, maskKey, productMatches } from '../../src/lib/license.js';
import { shouldShowReview, recordExport, markReviewShown, getReviewState, reviewUrl } from '../../src/lib/review.js';
import { sanitizeOptions, loadOptions, saveOptions, clearPreset, resolveSeparator, hasCleaning, presetKey } from '../../src/lib/presets.js';
import { CONFIG } from '../../src/config.js';

const DAY = 86400000;
const KEY = '38b1460a-5104-4067-a91d-77b872934d51';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      const list = typeof keys === 'string' ? [keys] : keys;
      const out = {};
      for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      Object.assign(data, structuredClone(obj));
    },
    async remove(k) {
      delete data[k];
    },
  };
}

function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, init) => {
    const endpoint = url.split('/').pop();
    const params = Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ endpoint, params });
    const h = handlers[endpoint];
    if (!h) throw new Error('offline');
    const { status = 200, body } = h(params);
    return { status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const cfg = { ...CONFIG, LEMONSQUEEZY_STORE_ID: 111, LEMONSQUEEZY_PRODUCT_ID: 222 };
const goodMeta = { store_id: 111, product_id: 222, product_name: 'TableSnap Pro' };

test('activate: success stores license', async () => {
  const storage = memoryStorage();
  const fetchImpl = fakeFetch({
    activate: () => ({ body: { activated: true, instance: { id: 'inst-1' }, license_key: { status: 'active' }, meta: goodMeta } }),
  });
  const res = await activateLicense(KEY, { storage, config: cfg, fetchImpl, now: 1000, instanceName: 'test' });
  assert.equal(res.ok, true);
  const lic = await getLicenseState(storage);
  assert.equal(lic.instanceId, 'inst-1');
  assert.ok(isProActive(lic));
  assert.equal(fetchImpl.calls[0].params.license_key, KEY);
  assert.equal(fetchImpl.calls[0].params.instance_name, 'test');
});

test('activate: format, invalid, limit, network, wrong product', async () => {
  const storage = memoryStorage();
  assert.equal((await activateLicense('bad key!', { storage, config: cfg, fetchImpl: fakeFetch({}) })).code, 'invalid_format');
  const invalid = fakeFetch({ activate: () => ({ status: 404, body: { activated: false, error: 'license_key not found.' } }) });
  assert.equal((await activateLicense(KEY, { storage, config: cfg, fetchImpl: invalid })).code, 'invalid');
  const limit = fakeFetch({ activate: () => ({ status: 400, body: { activated: false, error: 'This license key has reached the activation limit.' } }) });
  assert.equal((await activateLicense(KEY, { storage, config: cfg, fetchImpl: limit })).code, 'limit');
  assert.equal((await activateLicense(KEY, { storage, config: cfg, fetchImpl: fakeFetch({}) })).code, 'network');
  const server = fakeFetch({ activate: () => ({ status: 503, body: null }) });
  assert.equal((await activateLicense(KEY, { storage, config: cfg, fetchImpl: server })).code, 'network');
  const wrong = fakeFetch({
    activate: () => ({ body: { activated: true, instance: { id: 'i' }, meta: { store_id: 999, product_id: 222 } } }),
    deactivate: () => ({ body: { deactivated: true } }),
  });
  assert.equal((await activateLicense(KEY, { storage, config: cfg, fetchImpl: wrong })).code, 'wrong_product');
  assert.equal(wrong.calls[1].endpoint, 'deactivate');
  assert.equal(await getLicenseState(storage), null);
});

test('productMatches skips checks when ids are not configured', () => {
  assert.ok(productMatches(undefined, { LEMONSQUEEZY_STORE_ID: null, LEMONSQUEEZY_PRODUCT_ID: null }));
  assert.ok(!productMatches(undefined, cfg));
});

test('revalidate: skipped before 7 days, valid after, revoked when invalid', async () => {
  const lic = { key: KEY, instanceId: 'inst-1', status: 'active', lastValidatedAt: 0, lastAttemptAt: 0 };
  const storage = memoryStorage({ license: lic });
  const never = fakeFetch({});
  assert.equal((await revalidateIfDue({ storage, config: cfg, fetchImpl: never, now: 6 * DAY })).skipped, true);
  assert.equal(never.calls.length, 0);

  const ok = fakeFetch({ validate: () => ({ body: { valid: true, license_key: { status: 'active' }, meta: goodMeta } }) });
  const r1 = await revalidateIfDue({ storage, config: cfg, fetchImpl: ok, now: 8 * DAY });
  assert.equal(r1.valid, true);
  assert.equal((await getLicenseState(storage)).lastValidatedAt, 8 * DAY);
  assert.equal(ok.calls[0].params.instance_id, 'inst-1');

  const bad = fakeFetch({ validate: () => ({ status: 404, body: { valid: false, error: 'not found' } }) });
  const r2 = await revalidateIfDue({ storage, config: cfg, fetchImpl: bad, now: 16 * DAY });
  assert.equal(r2.changed, true);
  assert.equal((await getLicenseState(storage)).status, 'invalid');
  assert.ok(!isProActive(await getLicenseState(storage)));
});

test('revalidate: offline keeps Pro within grace, pauses after 30 days, recovers online', async () => {
  const storage = memoryStorage({ license: { key: KEY, instanceId: 'i', status: 'active', lastValidatedAt: 0 } });
  const offline = fakeFetch({});
  const r1 = await revalidateIfDue({ storage, config: cfg, fetchImpl: offline, now: 10 * DAY });
  assert.equal(r1.offline, true);
  assert.equal((await getLicenseState(storage)).status, 'active');
  // backoff: no new attempt within 6h
  await revalidateIfDue({ storage, config: cfg, fetchImpl: offline, now: 10 * DAY + 1000 });
  assert.equal(offline.calls.length, 1);
  const r2 = await revalidateIfDue({ storage, config: cfg, fetchImpl: offline, now: 31 * DAY });
  assert.equal(r2.status, 'expired_offline');
  const ok = fakeFetch({ validate: () => ({ body: { valid: true, meta: goodMeta } }) });
  const r3 = await revalidateIfDue({ storage, config: cfg, fetchImpl: ok, now: 32 * DAY });
  assert.equal(r3.status, 'active');
  assert.equal(r3.changed, true);
});

test('deactivate releases the instance and clears storage', async () => {
  const storage = memoryStorage({ license: { key: KEY, instanceId: 'i', status: 'active' } });
  const f = fakeFetch({ deactivate: () => ({ body: { deactivated: true } }) });
  const res = await deactivateLicense({ storage, config: cfg, fetchImpl: f });
  assert.equal(res.remote, true);
  assert.equal(await getLicenseState(storage), null);
});

test('maskKey', () => {
  assert.equal(maskKey(KEY), '••••4d51');
});

test('review banner: exactly after 5 exports, only once', async () => {
  const storage = memoryStorage();
  const shown = [];
  for (let i = 1; i <= 8; i++) {
    const s = await recordExport(storage);
    if (shouldShowReview(s, 5)) {
      shown.push(i);
      await markReviewShown(storage);
    }
  }
  assert.deepEqual(shown, [5]);
  assert.equal((await getReviewState(storage)).exportCount, 8);
  assert.ok(!shouldShowReview(await getReviewState(storage), 5));
});

test('reviewUrl picks Edge vs Chrome store', () => {
  const c = { STORE_REVIEW_URL: 'chrome', EDGE_REVIEW_URL: 'edge' };
  assert.equal(reviewUrl(c, 'Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0'), 'edge');
  assert.equal(reviewUrl(c, 'Mozilla/5.0 Chrome/130.0 Safari/537.36'), 'chrome');
});

test('presets: sanitize, per-domain save/load for Pro, global for free', async () => {
  assert.deepEqual(sanitizeOptions({ csvSeparator: '|', regexMode: 'x', removeEmptyRows: 'yes' }).csvSeparator, 'auto');
  assert.ok(!hasCleaning(sanitizeOptions({})));
  assert.ok(hasCleaning(sanitizeOptions({ regex: 'a' })));
  const storage = memoryStorage();
  await saveOptions(storage, 'www.example.com', true, { removeEmptyRows: true, csvSeparator: ';', firstRowHeader: false });
  assert.ok(storage.data[presetKey('example.com')]);
  const pro = await loadOptions(storage, 'example.com', true);
  assert.equal(pro.fromPreset, true);
  assert.equal(pro.options.removeEmptyRows, true);
  const free = await loadOptions(storage, 'example.com', false);
  assert.equal(free.fromPreset, false);
  assert.equal(free.options.removeEmptyRows, false);
  assert.equal(free.options.csvSeparator, ';'); // global free fields persist
  await clearPreset(storage, 'example.com');
  assert.equal((await loadOptions(storage, 'example.com', true)).fromPreset, false);
});

test('resolveSeparator: ; for comma-decimal locales', () => {
  assert.equal(resolveSeparator('auto', 'it'), ';');
  assert.equal(resolveSeparator('auto', 'de-DE'), ';');
  assert.equal(resolveSeparator('auto', 'en-US'), ',');
  assert.equal(resolveSeparator(',', 'it'), ',');
});
