"""Microsoft Teams channel.

Posts an Adaptive Card. Teams has two incoming-webhook flavours:
  * the newer **Workflows** (Power Automate) webhook expects an
    `attachments: [{contentType: adaptive-card, content: {...}}]` envelope, and
  * the legacy **Office 365 connector** accepts a bare MessageCard.

We send the Adaptive-Card envelope (the supported path going forward). The card
degrades gracefully on either.
"""

from __future__ import annotations

import httpx

from .summary import ReportSummary


def build_card(summary: ReportSummary, dashboard_url: str = "") -> dict:
    body: list[dict] = [
        {"type": "TextBlock", "size": "Large", "weight": "Bolder",
         "text": f"📊 {summary.title}"},
        {"type": "TextBlock", "isSubtle": True, "spacing": "None", "wrap": True,
         "text": f"{summary.period_label} · {summary.num_reports} report(s) · "
                 f"source: {summary.source}"},
    ]

    facts: list[dict] = []
    if summary.has_spend:
        facts.append({"title": "Net spend", "value": summary.money(summary.total_net)})
        facts.append({"title": "Gross spend", "value": summary.money(summary.total_gross)})
        if summary.total_discount:
            facts.append({"title": "Discounts", "value": summary.money(summary.total_discount)})
    for name, amt in summary.top_products:
        facts.append({"title": name, "value": summary.money(amt)})
    if facts:
        body.append({"type": "FactSet", "facts": facts})

    if not summary.has_spend:
        body.append({"type": "TextBlock", "wrap": True,
                     "text": "_No metered-usage spend in this report set._"})

    if summary.row_counts:
        rows = "\n\n".join(f"- {name}: {n} rows" for name, n in summary.row_counts.items())
        body.append({"type": "TextBlock", "wrap": True, "text": rows})

    card: dict = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": body,
    }
    if dashboard_url:
        card["actions"] = [
            {"type": "Action.OpenUrl", "title": "Open dashboard", "url": dashboard_url}
        ]
    return card


async def send(
    webhook_url: str, summary: ReportSummary, *, dashboard_url: str = "", timeout: float = 30.0
) -> dict:
    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": build_card(summary, dashboard_url),
        }],
    }
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        resp = await client.post(webhook_url, json=payload)
    ok = resp.status_code < 400
    return {"channel": "teams", "ok": ok, "http_status": resp.status_code,
            "error": None if ok else resp.text[:200]}
