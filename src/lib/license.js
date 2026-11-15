/**
 * LemonSqueezy license activation / validation (client-side, zero backend).
 * All side effects are injected (storage, fetch, clock) so the module is unit-testable in Node.
 *
 * Endpoints: POST {API_BASE}/activate | /validate | /deactivate  (application/x-www-form-urlencoded)
 */

export const LICENSE_KEY = 'license';
const DAY = 24 * 60 * 60 * 1000;
const RETRY_BACKOFF = 6 * 60 * 60 * 1000;
const KEY_FORMAT = /^[A-Za-z0-9-]{8,64}$/;

const defaultFetch = (url, init) => globalThis.fetch(url, init);

export async function getLicenseState(storage) {
  const data = await storage.get(LICENSE_KEY);
  return (data && data[LICENSE_KEY]) || null;
}

export function isProActive(license) {
  return !!(license && license.status === 'active' && license.instanceId);
}

export function maskKey(key) {
  const k = String(key || '');
  return k.length <= 4 ? '••••' : '••••' + k.slice(-4);
}

async function callApi(config, endpoint, params, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${config.LEMONSQUEEZY_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch (err) {
    return { kind: 'network', error: String((err && err.message) || err) };
  }
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (res.status >= 500 || res.status === 429 || !data || typeof data !== 'object') return { kind: 'network', status: res.status };
  return { kind: 'response', status: res.status, data };
}

export function productMatches(meta, config) {
  const wantStore = config.LEMONSQUEEZY_STORE_ID;
  const wantProduct = config.LEMONSQUEEZY_PRODUCT_ID;
  if (wantStore == null && wantProduct == null) return true;
  if (!meta) return false;
  if (wantStore != null && Number(meta.store_id) !== Number(wantStore)) return false;
  if (wantProduct != null && Number(meta.product_id) !== Number(wantProduct)) return false;
  return true;
}

/**
 * Activates a key for this browser profile.
 * @returns {Promise<{ok:true, license:object}|{ok:false, code:'invalid_format'|'network'|'invalid'|'limit'|'wrong_product', message?:string}>}
 */
export async function activateLicense(rawKey, { storage, config, fetchImpl = defaultFetch, now = Date.now(), instanceName = 'TableSnap' }) {
  const key = String(rawKey || '').trim();
  if (!KEY_FORMAT.test(key)) return { ok: false, code: 'invalid_format' };
  const r = await callApi(config, 'activate', { license_key: key, instance_name: instanceName }, fetchImpl);
  if (r.kind === 'network') return { ok: false, code: 'network' };
  const d = r.data;
  if (!d.activated || !d.instance || !d.instance.id) {
    const msg = String(d.error || '');
    return { ok: false, code: /limit/i.test(msg) ? 'limit' : 'invalid', message: msg };
  }
  const status = d.license_key && d.license_key.status;
  if (!productMatches(d.meta, config) || status === 'disabled' || status === 'expired') {
    await callApi(config, 'deactivate', { license_key: key, instance_id: d.instance.id }, fetchImpl);
    return { ok: false, code: productMatches(d.meta, config) ? 'invalid' : 'wrong_product' };
  }
  const license = {
    key,
    instanceId: d.instance.id,
    status: 'active',
    productName: (d.meta && d.meta.product_name) || '',
    activatedAt: now,
    lastValidatedAt: now,
    lastAttemptAt: now,
  };
  await storage.set({ [LICENSE_KEY]: license });
  return { ok: true, license };
}

/**
 * Silent re-validation, at most once every REVALIDATE_INTERVAL_DAYS.
 * Network failures keep Pro active for OFFLINE_GRACE_DAYS since the last successful validation.
 * @returns {Promise<{changed:boolean, status?:string, skipped?:boolean, offline?:boolean, valid?:boolean}>}
 */
export async function revalidateIfDue({ storage, config, fetchImpl = defaultFetch, now = Date.now(), force = false }) {
  const lic = await getLicenseState(storage);
  if (!lic || (lic.status !== 'active' && lic.status !== 'expired_offline')) return { changed: false, skipped: true };
  const lastOk = lic.lastValidatedAt || 0;
  if (!force) {
    if (lic.status === 'active' && now - lastOk < config.REVALIDATE_INTERVAL_DAYS * DAY) return { changed: false, skipped: true };
    if (lic.lastAttemptAt && lic.lastAttemptAt > lastOk && now - lic.lastAttemptAt < RETRY_BACKOFF) return { changed: false, skipped: true };
  }
  const r = await callApi(config, 'validate', { license_key: lic.key, instance_id: lic.instanceId }, fetchImpl);
  if (r.kind === 'network') {
    const expired = now - lastOk > config.OFFLINE_GRACE_DAYS * DAY;
    const next = { ...lic, lastAttemptAt: now, status: expired ? 'expired_offline' : lic.status };
    await storage.set({ [LICENSE_KEY]: next });
    return { changed: next.status !== lic.status, status: next.status, offline: true };
  }
  const d = r.data;
  const keyStatus = d.license_key && d.license_key.status;
  const valid = d.valid === true && productMatches(d.meta, config) && keyStatus !== 'disabled' && keyStatus !== 'expired';
  const next = valid
    ? { ...lic, status: 'active', lastValidatedAt: now, lastAttemptAt: now, error: undefined }
    : { ...lic, status: 'invalid', lastAttemptAt: now, error: String(d.error || keyStatus || 'invalid') };
  await storage.set({ [LICENSE_KEY]: next });
  return { changed: next.status !== lic.status, status: next.status, valid };
}

/** Releases the activation slot (best effort) and forgets the key locally. */
export async function deactivateLicense({ storage, config, fetchImpl = defaultFetch }) {
  const lic = await getLicenseState(storage);
  let remote = false;
  if (lic && lic.key && lic.instanceId) {
    const r = await callApi(config, 'deactivate', { license_key: lic.key, instance_id: lic.instanceId }, fetchImpl);
    remote = r.kind === 'response' && r.data.deactivated === true;
  }
  await storage.remove(LICENSE_KEY);
  return { ok: true, remote };
}
