"""Slack channel — posts a Block Kit summary to an incoming webhook."""

from __future__ import annotations

import httpx

from .summary import ReportSummary


def build_blocks(summary: ReportSummary, dashboard_url: str = "") -> list[dict]:
    blocks: list[dict] = [
        {"type": "header", "text": {"type": "plain_text", "text": f"📊 {summary.title}"}},
        {"type": "context", "elements": [{
            "type": "mrkdwn",
            "text": f"*{summary.period_label}* · {summary.num_reports} report(s) · "
                    f"source: `{summary.source}` · {summary.generated_at}",
        }]},
    ]

    if summary.has_spend:
        fields = [
            {"type": "mrkdwn", "text": f"*Net spend*\n{summary.money(summary.total_net)}"},
            {"type": "mrkdwn", "text": f"*Gross spend*\n{summary.money(summary.total_gross)}"},
        ]
        if summary.total_discount:
            fields.append(
                {"type": "mrkdwn", "text": f"*Discounts*\n{summary.money(summary.total_discount)}"}
            )
        blocks.append({"type": "section", "fields": fields})

        if summary.top_products:
            lines = "\n".join(
                f"• {name} — {summary.money(amt)}" for name, amt in summary.top_products
            )
            blocks.append({"type": "section",
                           "text": {"type": "mrkdwn", "text": f"*Top products*\n{lines}"}})
    else:
        blocks.append({"type": "section", "text": {"type": "mrkdwn",
                       "text": "_No metered-usage spend in this report set._"}})

    if summary.row_counts:
        lines = "\n".join(f"• {name}: {n} rows" for name, n in summary.row_counts.items())
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*Reports*\n{lines}"}})

    if dashboard_url:
        blocks.append({"type": "actions", "elements": [{
            "type": "button",
            "text": {"type": "plain_text", "text": "Open dashboard"},
            "url": dashboard_url,
        }]})

    return blocks


async def send(
    webhook_url: str, summary: ReportSummary, *, dashboard_url: str = "", timeout: float = 30.0
) -> dict:
    blocks = build_blocks(summary, dashboard_url)
    payload = {"text": f"{summary.title} — {summary.period_label}", "blocks": blocks}
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        resp = await client.post(webhook_url, json=payload)
    ok = resp.status_code < 400
    return {"channel": "slack", "ok": ok, "http_status": resp.status_code,
            "error": None if ok else resp.text[:200]}
