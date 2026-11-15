// Tests for cloudflare-worker/webhook.js (HMAC verification + event filtering) using a mocked Telegram fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker, { verifySignature, formatOrder } from '../../cloudflare-worker/webhook.js';

const SECRET = 'whsec_test';
const env = { LEMONSQUEEZY_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42' };
const order = {
  meta: { event_name: 'order_created' },
  data: { id: '1', attributes: { total: 900, currency: 'EUR', total_formatted: '€9.00', order_number: 7, status: 'paid', user_country: 'IT', first_order_item: { product_name: 'TableSnap <Pro>' } } },
};
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('hex');

function req(body, headers = {}) {
  return new Request('https://w.example/', { method: 'POST', body, headers });
}

test('verifySignature accepts valid and rejects tampered signatures', async () => {
  const body = JSON.stringify(order);
  assert.equal(await verifySignature(SECRET, body, sign(body)), true);
  assert.equal(await verifySignature(SECRET, body + ' ', sign(body)), false);
  assert.equal(await verifySignature(SECRET, body, 'zz'), false);
});

test('formatOrder escapes HTML', () => {
  const text = formatOrder(order);
  assert.ok(text.includes('TableSnap &lt;Pro&gt;'));
  assert.ok(text.includes('€9.00'));
});

test('worker forwards order_created, ignores other events, rejects bad signatures', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
  };
  try {
    const body = JSON.stringify(order);
    let res = await worker.fetch(req(body, { 'X-Signature': sign(body), 'X-Event-Name': 'order_created' }), env);
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.chat_id, '42');
    assert.ok(sent[0].url.includes('/botT/sendMessage'));

    const other = JSON.stringify({ ...order, meta: { event_name: 'subscription_created' } });
    res = await worker.fetch(req(other, { 'X-Signature': sign(other) }), env);
    assert.equal(await res.text(), 'Ignored');

    res = await worker.fetch(req(body, { 'X-Signature': '00' }), env);
    assert.equal(res.status, 401);
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
