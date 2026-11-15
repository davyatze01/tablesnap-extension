"""Pure logic of scripts/telegram_report.py (no network)."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import telegram_report as tr  # noqa: E402

NOW = dt.datetime(2026, 11, 16, 9, 0, tzinfo=dt.timezone.utc)


def order(days_ago, total=900, tax=162, status="paid", test=False, refunded_amount=0, currency="EUR"):
    created = (NOW - dt.timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")
    return {"attributes": {"created_at": created, "total": total, "tax": tax, "status": status, "test_mode": test,
                           "refunded_amount": refunded_amount, "currency": currency}}


class TelegramReportTests(unittest.TestCase):
    def test_weekly_and_ytd_aggregation(self):
        orders = [order(1), order(3), order(10), order(400), order(2, test=True), order(2, status="pending"),
                  order(5, status="refunded", refunded_amount=900)]
        s = tr.summarize(orders, NOW)
        self.assertEqual(s["week_orders"], 2)
        self.assertEqual(s["week_refunds"], 1)
        self.assertEqual(s["ytd_transactions"], 4)  # 3 paid this year + 1 refunded
        fee = round(900 * 0.05) + 50
        self.assertEqual(s["week_net"], 2 * (900 - 162 - fee) - fee)
        self.assertEqual(s["currency"], "EUR")
        self.assertEqual(s["dac7_level"], "ok")

    def test_dac7_levels(self):
        self.assertEqual(tr.summarize([order(20)] * 25, NOW)["dac7_level"], "warn")
        self.assertEqual(tr.summarize([order(20)] * 30, NOW)["dac7_level"], "limit")
        big = tr.summarize([order(20, total=150_000)] * 2, NOW)
        self.assertTrue(big["dac7_amount_exceeded"])

    def test_report_formatting(self):
        s = tr.summarize([order(20)] * 26, NOW)
        text = tr.format_report(s, {"checked": True, "ok": True, "status": 200, "ms": 120}, NOW)
        self.assertIn("HTTP 200", text)
        self.assertIn("DAC7", text)
        down = tr.format_report(None, {"checked": True, "ok": False, "status": 503, "url": "https://x/<y>"}, NOW)
        self.assertIn("DOWN", down)
        self.assertIn("&lt;y&gt;", down)


if __name__ == "__main__":
    unittest.main()
