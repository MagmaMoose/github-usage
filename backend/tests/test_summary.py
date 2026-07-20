from __future__ import annotations

from app.github import csv_render
from app.notify.summary import build_summary, format_money


def _usage_reports():
    items = [
        {"date": "2026-03-01", "product": "actions", "sku": "Actions Linux",
         "quantity": 100, "unitType": "minutes", "netAmount": 10.0,
         "grossAmount": 12.0, "discountAmount": 2.0, "organizationName": "acme"},
        {"date": "2026-03-05", "product": "copilot", "sku": "Copilot Enterprise",
         "quantity": 1, "unitType": "seats", "netAmount": 39.0,
         "grossAmount": 39.0, "discountAmount": 0.0, "organizationName": "acme"},
    ]
    return [{"name": "acme-metered-usage.csv", "type": "usage_report",
             "csv": csv_render.render_usage(items, default_org="acme")}]


def test_summary_totals_and_tops():
    s = build_summary(_usage_reports(), source="live")
    assert s.has_spend
    assert round(s.total_net, 2) == 49.0
    assert round(s.total_gross, 2) == 51.0
    assert round(s.total_discount, 2) == 2.0
    assert s.period_start == "2026-03-01"
    assert s.period_end == "2026-03-05"
    # copilot (39) ranks above actions (10)
    assert s.top_products[0][0] == "copilot"
    assert dict(s.top_products)["actions"] == 10.0
    assert s.row_counts["acme-metered-usage.csv"] == 2


def test_summary_no_spend_report():
    seats = csv_render.render_copilot_seats(
        [{"assignee": {"login": "octocat"}, "last_activity_at": "2026-03-01T00:00:00Z"}],
        org="acme",
    )
    s = build_summary([{"name": "seats.csv", "type": "copilot_seat_activity", "csv": seats}],
                      source="live")
    assert not s.has_spend
    assert s.total_net == 0.0
    assert s.row_counts["seats.csv"] == 1


def test_summary_as_dict_is_json_safe():
    import json

    s = build_summary(_usage_reports(), source="demo")
    json.dumps(s.as_dict())  # must not raise


def test_format_money_by_currency():
    # Babel/CLDR: the same rendering the frontend's Intl.NumberFormat produces
    # (same per-currency locale map), so reports and the dashboard agree.
    assert format_money(1234.56, "USD") == "$1,234.56"
    assert format_money(1234.56, "EUR") == "€ 1.234,56"   # nbsp + euro grouping
    assert format_money(1234.56, "GBP") == "£1,234.56"
    assert format_money(1234.56, "JPY") == "￥1,235"             # yen: no minor unit
    assert format_money(1234.56, "") == "$1,234.56"                 # empty -> USD default


def test_summary_currency_is_normalised_and_applied():
    s = build_summary(_usage_reports(), source="live", currency="eur")
    assert s.currency == "EUR"                 # upper-cased
    assert s.money(1234.56) == "€ 1.234,56"
    assert s.as_dict()["currency"] == "EUR"
