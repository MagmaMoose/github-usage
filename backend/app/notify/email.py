"""Email channel — SMTP with an HTML summary and the CSV(s) attached.

smtplib is blocking, so the send runs in a worker thread via `asyncio.to_thread`
to keep the event loop free.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from html import escape
from typing import Any

from ..config import NotifyConfig
from .summary import ReportSummary


def build_html(summary: ReportSummary, dashboard_url: str = "") -> str:
    rows = ""
    if summary.has_spend:
        rows += f"<tr><td><b>Net spend</b></td><td>{summary.money(summary.total_net)}</td></tr>"
        rows += f"<tr><td><b>Gross spend</b></td><td>{summary.money(summary.total_gross)}</td></tr>"
        if summary.total_discount:
            rows += f"<tr><td><b>Discounts</b></td><td>{summary.money(summary.total_discount)}</td></tr>"
    products = "".join(
        f"<li>{escape(name)} — {summary.money(amt)}</li>" for name, amt in summary.top_products
    )
    report_rows = "".join(
        f"<li>{escape(name)}: {n} rows</li>" for name, n in summary.row_counts.items()
    )
    link = f'<p><a href="{escape(dashboard_url)}">Open the dashboard →</a></p>' if dashboard_url else ""
    spend_block = (
        f"<table cellpadding='6' style='border-collapse:collapse'>{rows}</table>"
        f"<h3>Top products</h3><ul>{products}</ul>"
        if summary.has_spend
        else "<p><i>No metered-usage spend in this report set.</i></p>"
    )
    return f"""\
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328">
  <h2>📊 {escape(summary.title)}</h2>
  <p style="color:#656d76">{escape(summary.period_label)} · {summary.num_reports} report(s)
     · source: {escape(summary.source)} · {escape(summary.generated_at)}</p>
  {spend_block}
  <h3>Reports</h3><ul>{report_rows}</ul>
  {link}
</body></html>"""


def _send_sync(cfg: NotifyConfig, msg: EmailMessage) -> None:
    if cfg.smtp_starttls:
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            if cfg.smtp_user:
                server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30) as server:
            if cfg.smtp_user:
                server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(msg)


async def send(
    cfg: NotifyConfig,
    summary: ReportSummary,
    reports: list[dict[str, Any]],
    *,
    dashboard_url: str = "",
    attach_csvs: bool = True,
) -> dict:
    msg = EmailMessage()
    msg["Subject"] = f"{summary.title} — {summary.period_label}"
    msg["From"] = cfg.email_from
    msg["To"] = ", ".join(cfg.email_to)
    msg.set_content(
        f"{summary.title}\n{summary.period_label}\n"
        f"Net spend: {summary.money(summary.total_net)}\n"
        f"See the HTML version for the full summary."
    )
    msg.add_alternative(build_html(summary, dashboard_url), subtype="html")

    if attach_csvs:
        for report in reports:
            csv_text = report.get("csv", "")
            if not csv_text:
                continue
            msg.add_attachment(
                csv_text.encode("utf-8"),
                maintype="text",
                subtype="csv",
                filename=report.get("name", "report.csv"),
            )

    try:
        await asyncio.to_thread(_send_sync, cfg, msg)
        return {"channel": "email", "ok": True, "recipients": len(cfg.email_to), "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"channel": "email", "ok": False, "error": f"{type(exc).__name__}: {exc}"}
