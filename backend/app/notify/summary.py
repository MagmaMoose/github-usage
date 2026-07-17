"""Build a channel-agnostic summary of a fetched report set.

The spend numbers come from the Metered Usage report(s) (the only ones with
cost columns). Everything downstream — Slack Block Kit, a Teams Adaptive Card, an
HTML email — renders from this one `ReportSummary`, so the three channels never
drift.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


def _num(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def _is_usage_csv(header: list[str]) -> bool:
    lower = {h.strip().lower() for h in header}
    return {"net_amount", "gross_amount", "product"}.issubset(lower)


def _col(row: dict, norm: dict[str, str], key: str) -> str:
    """Read a column by its lowercased name, via the header-normalisation map."""
    return row.get(norm.get(key, key), "") or ""


@dataclass
class ReportSummary:
    generated_at: str
    source: str
    title: str
    num_reports: int
    report_names: list[str] = field(default_factory=list)
    currency: str = "USD"
    total_gross: float = 0.0
    total_net: float = 0.0
    total_discount: float = 0.0
    period_start: str = ""
    period_end: str = ""
    top_products: list[tuple[str, float]] = field(default_factory=list)
    top_skus: list[tuple[str, float]] = field(default_factory=list)
    top_orgs: list[tuple[str, float]] = field(default_factory=list)
    row_counts: dict[str, int] = field(default_factory=dict)
    has_spend: bool = False

    @property
    def period_label(self) -> str:
        if self.period_start and self.period_end:
            if self.period_start == self.period_end:
                return self.period_start
            return f"{self.period_start} → {self.period_end}"
        return "current period"

    def money(self, amount: float) -> str:
        return f"${amount:,.2f}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "source": self.source,
            "title": self.title,
            "num_reports": self.num_reports,
            "report_names": self.report_names,
            "currency": self.currency,
            "total_gross": round(self.total_gross, 2),
            "total_net": round(self.total_net, 2),
            "total_discount": round(self.total_discount, 2),
            "period": self.period_label,
            "top_products": self.top_products,
            "top_skus": self.top_skus,
            "top_orgs": self.top_orgs,
            "row_counts": self.row_counts,
            "has_spend": self.has_spend,
        }


def build_summary(
    reports: list[dict[str, Any]], *, source: str, title: str = "GitHub usage report"
) -> ReportSummary:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    summary = ReportSummary(
        generated_at=now,
        source=source,
        title=title,
        num_reports=len(reports),
        report_names=[r.get("name", "?") for r in reports],
    )

    product_totals: dict[str, float] = {}
    sku_totals: dict[str, float] = {}
    org_totals: dict[str, float] = {}
    dates: list[str] = []

    for report in reports:
        text = report.get("csv", "")
        if not text:
            continue
        reader = csv.DictReader(io.StringIO(text))
        header = reader.fieldnames or []
        norm = {h.strip().lower(): h for h in header}
        rows = list(reader)
        summary.row_counts[report.get("name", "?")] = len(rows)

        if not _is_usage_csv(header):
            continue
        summary.has_spend = True

        for row in rows:
            net = _num(_col(row, norm, "net_amount"))
            gross = _num(_col(row, norm, "gross_amount"))
            disc = _num(_col(row, norm, "discount_amount"))
            summary.total_net += net
            summary.total_gross += gross
            summary.total_discount += disc

            product = _col(row, norm, "product") or "unknown"
            sku = _col(row, norm, "sku") or "unknown"
            org = _col(row, norm, "organization") or "unknown"
            product_totals[product] = product_totals.get(product, 0.0) + net
            sku_totals[sku] = sku_totals.get(sku, 0.0) + net
            org_totals[org] = org_totals.get(org, 0.0) + net

            d = _col(row, norm, "date")[:10]
            if len(d) == 10 and d[4] == "-":
                dates.append(d)

    if dates:
        dates.sort()
        summary.period_start = dates[0]
        summary.period_end = dates[-1]

    summary.top_products = _top(product_totals, 5)
    summary.top_skus = _top(sku_totals, 5)
    summary.top_orgs = _top(org_totals, 5)
    return summary


def _top(totals: dict[str, float], n: int) -> list[tuple[str, float]]:
    return sorted(
        ((k, round(v, 2)) for k, v in totals.items() if v),
        key=lambda kv: kv[1],
        reverse=True,
    )[:n]
