/**
 * TableSnap — LemonSqueezy webhook → Telegram (Cloudflare Workers, free tier).
 *
 * Secrets (wrangler secret put …):
 *   LEMONSQUEEZY_WEBHOOK_SECRET  signing secret set in LemonSqueezy → Settings → Webhooks
 *   TELEGRAM_BOT_TOKEN           from @BotFather
 *   TELEGRAM_CHAT_ID             your chat id
 *
 * LemonSqueezy signs the raw body with HMAC-SHA256 (hex) in the "X-Signature" header.
 */

const encoder = new TextEncoder();

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function verifySignature(secret, rawBody, signatureHex) {
  const sig = hexToBytes(String(signatureHex || '').trim());
  if (!sig || !secret) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(rawBody)); // constant-time
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function formatOrder(payload) {
  const a = (payload.data && payload.data.attributes) || {};
  const item = a.first_order_item || {};
  const test = a.test_mode ? ' 🧪 <i>test mode</i>' : '';
  return [
    `💰 <b>New TableSnap sale!</b>${test}`,
    `Product: ${esc(item.product_name || 'TableSnap Pro')}${item.variant_name ? ' — ' + esc(item.variant_name) : ''}`,
    `Total: <b>${esc(a.total_formatted || (a.total / 100).toFixed(2) + ' ' + (a.currency || ''))}</b>`,
    `Country: ${esc(a.user_country || a.country || '—')}`,
    `Order #${esc(a.order_number || payload.data?.id || '?')} · ${esc(a.status || '')}`,
  ].join('\n');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('TableSnap webhook: OK', { status: 200 });

    const raw = await request.text();
    if (raw.length > 512 * 1024) return new Response('Payload too large', { status: 413 });
    const valid = await verifySignature(env.LEMONSQUEEZY_WEBHOOK_SECRET, raw, request.headers.get('X-Signature'));
    if (!valid) return new Response('Invalid signature', { status: 401 });

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return new Response('Bad JSON', { status: 400 });
    }
    const event = request.headers.get('X-Event-Name') || payload?.meta?.event_name;
    if (event !== 'order_created') return new Response('Ignored', { status: 200 });

    const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: formatOrder(payload), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    // 500 makes LemonSqueezy retry the delivery later.
    return tg.ok ? new Response('Forwarded', { status: 200 }) : new Response('Telegram error', { status: 500 });
  },
};

export { verifySignature, formatOrder };
