#!/usr/bin/env python3
"""Weekly TableSnap business report → Telegram (stdlib only, runs on Windows/Linux/macOS & GitHub Actions).

Checks:
  1. Landing page (LANDING_URL) answers HTTP 200.
  2. LemonSqueezy orders (GET https://api.lemonsqueezy.com/v1/orders): weekly sales, estimated net income,
     calendar-year transaction count with DAC7 warnings (>= 25 approaching, >= 30 threshold).
  3. Sends an HTML-formatted report to Telegram.

Environment variables:
  LEMONSQUEEZY_API_KEY   (required for sales data)    LEMONSQUEEZY_STORE_ID (optional filter)
  TELEGRAM_BOT_TOKEN     (required unless --dry-run)  TELEGRAM_CHAT_ID      (required unless --dry-run)
  LANDING_URL            (default: none → check skipped)
  LS_FEE_PERCENT=5  LS_FEE_FIXED_CENTS=50  (LemonSqueezy standard fee, used for the net estimate)

Usage:
  python scripts/telegram_report.py --dry-run     # print report, send nothing
  python scripts/telegram_report.py               # print + send
Exit code 1 when the landing page is down or Telegram delivery fails.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ORDERS_URL = "https://api.lemonsqueezy.com/v1/orders"
TELEGRAM_URL = "https://api.telegram.org/bot{token}/sendMessage"
USER_AGENT = "TableSnap-Monitor/1.0"
DAC7_WARN = 25
DAC7_LIMIT = 30
DAC7_AMOUNT_EUR_CENTS = 200_000
COUNTED_STATUSES = {"paid", "refunded", "partial_refund"}
MAX_PAGES = 200


def http_request(url: str, headers: dict | None = None, data: bytes | None = None, timeout: int = 25):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def check_landing(url: str) -> dict:
    if not url:
        return {"checked": False}
    start = time.monotonic()
    try:
        status, _ = http_request(url, timeout=20)
    except Exception as err:  # noqa: BLE001 - report any network failure
        return {"checked": True, "ok": False, "status": None, "error": str(err)[:200], "url": url}
    return {"checked": True, "ok": status == 200, "status": status, "ms": int((time.monotonic() - start) * 1000), "url": url}


def fetch_orders(api_key: str, store_id: str | None = None) -> list[dict]:
    headers = {"Accept": "application/vnd.api+json", "Authorization": f"Bearer {api_key}"}
    params = {"page[size]": "100", "page[number]": "1"}
    if store_id:
        params["filter[store_id]"] = store_id
    url: str | None = f"{ORDERS_URL}?{urllib.parse.urlencode(params)}"
    orders: list[dict] = []
    for _ in range(MAX_PAGES):
        if not url:
            break
        status, body = http_request(url, headers)
        if status != 200:
            raise RuntimeError(f"LemonSqueezy API HTTP {status}: {body[:300]!r}")
        payload = json.loads(body)
        orders.extend(payload.get("data") or [])
        url = (payload.get("links") or {}).get("next")
    return orders


def parse_ts(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(dt.timezone.utc)


def summarize(orders: list[dict], now: dt.datetime, fee_percent: float = 5.0, fee_fixed_cents: int = 50,
              include_test: bool = False) -> dict:
    """Pure function: aggregate LemonSqueezy order resources."""
    week_start = now - dt.timedelta(days=7)
    year_start = dt.datetime(now.year, 1, 1, tzinfo=dt.timezone.utc)
    s = {
        "week_orders": 0, "week_gross": 0, "week_tax": 0, "week_net": 0, "week_refunds": 0,
        "ytd_transactions": 0, "ytd_gross": 0, "ytd_net": 0, "currency": None,
        "week_start": week_start, "year": now.year,
    }
    for order in orders:
        a = order.get("attributes") or {}
        if a.get("test_mode") and not include_test:
            continue
        status = a.get("status")
        if status not in COUNTED_STATUSES:
            continue
        created = parse_ts(a["created_at"])
        if created > now:
            continue
        total = int(a.get("total") or 0)
        tax = int(a.get("tax") or 0)
        refunded_amount = int(a.get("refunded_amount") or (total if status == "refunded" else 0))
        fee = (round(total * fee_percent / 100) + fee_fixed_cents) if total else 0
        # Estimate: LemonSqueezy keeps its fee on refunds; tax is remitted by LS as Merchant of Record.
        net = -fee if status == "refunded" else total - tax - refunded_amount - fee
        s["currency"] = s["currency"] or a.get("currency")
        if created >= year_start:
            s["ytd_transactions"] += 1
            s["ytd_gross"] += total - refunded_amount
            s["ytd_net"] += net
        if created >= week_start:
            if status == "refunded":
                s["week_refunds"] += 1
            else:
                s["week_orders"] += 1
            s["week_gross"] += total - refunded_amount
            s["week_tax"] += tax
            s["week_net"] += net
    n = s["ytd_transactions"]
    s["dac7_level"] = "limit" if n >= DAC7_LIMIT else "warn" if n >= DAC7_WARN else "ok"
    s["dac7_amount_exceeded"] = s["currency"] == "EUR" and s["ytd_gross"] >= DAC7_AMOUNT_EUR_CENTS
    return s


def money(cents: int, currency: str | None) -> str:
    return f"{cents / 100:,.2f} {currency or ''}".strip()


def format_report(summary: dict | None, landing: dict, now: dt.datetime, error: str | None = None) -> str:
    e = html.escape
    lines = [f"<b>📊 TableSnap — weekly report</b>", f"<i>{now:%Y-%m-%d %H:%M} UTC</i>", ""]
    if not landing.get("checked"):
        lines.append("🌐 Landing: <i>LANDING_URL not set</i>")
    elif landing.get("ok"):
        lines.append(f"🌐 Landing: ✅ HTTP 200 ({landing['ms']} ms)")
    else:
        detail = landing.get("status") or landing.get("error")
        lines.append(f"🌐 Landing: 🔴 DOWN — {e(str(detail))}\n{e(landing.get('url', ''))}")
    lines.append("")
    if error:
        lines.append(f"🍋 LemonSqueezy: ⚠️ {e(error)}")
    elif summary is None:
        lines.append("🍋 LemonSqueezy: <i>LEMONSQUEEZY_API_KEY not set</i>")
    else:
        c = summary["currency"]
        lines += [
            f"<b>Last 7 days</b>",
            f"• Sales: <b>{summary['week_orders']}</b>" + (f" (refunds: {summary['week_refunds']})" if summary["week_refunds"] else ""),
            f"• Gross: {money(summary['week_gross'], c)} (VAT/tax {money(summary['week_tax'], c)})",
            f"• Est. net: <b>{money(summary['week_net'], c)}</b>",
            "",
            f"<b>Year {summary['year']}</b>",
            f"• Transactions: <b>{summary['ytd_transactions']}</b> / {DAC7_LIMIT} (DAC7)",
            f"• Gross: {money(summary['ytd_gross'], c)} · Est. net: {money(summary['ytd_net'], c)}",
        ]
        if summary["dac7_level"] == "limit":
            lines.append(f"🚨 <b>DAC7: {DAC7_LIMIT}+ transactions this year</b> — reporting threshold reached. Check with your accountant.")
        elif summary["dac7_level"] == "warn":
            lines.append(f"⚠️ DAC7: {summary['ytd_transactions']} transactions — approaching the {DAC7_LIMIT}-transaction threshold.")
        if summary["dac7_amount_exceeded"]:
            lines.append("🚨 DAC7: yearly consideration ≥ €2,000.")
    return "\n".join(lines)


def send_telegram(token: str, chat_id: str, text: str) -> None:
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
    status, body = http_request(TELEGRAM_URL.format(token=token), {"Content-Type": "application/x-www-form-urlencoded"}, data)
    if status != 200:
        raise RuntimeError(f"Telegram HTTP {status}: {body[:300]!r}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the report without sending it")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    now = dt.datetime.now(dt.timezone.utc)
    landing = check_landing(os.environ.get("LANDING_URL", "").strip())
    summary, error = None, None
    api_key = os.environ.get("LEMONSQUEEZY_API_KEY", "").strip()
    if api_key:
        try:
            orders = fetch_orders(api_key, os.environ.get("LEMONSQUEEZY_STORE_ID", "").strip() or None)
            summary = summarize(orders, now, float(os.environ.get("LS_FEE_PERCENT", "5")), int(os.environ.get("LS_FEE_FIXED_CENTS", "50")))
        except Exception as err:  # noqa: BLE001
            error = str(err)[:300]
    report = format_report(summary, landing, now, error)
    print(report)

    failed = landing.get("checked") and not landing.get("ok")
    if args.dry_run:
        return 1 if failed else 0
    token, chat_id = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(), os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing — nothing sent.", file=sys.stderr)
        return 1
    try:
        send_telegram(token, chat_id, report)
    except Exception as err:  # noqa: BLE001
        print(f"Telegram delivery failed: {err}", file=sys.stderr)
        return 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
