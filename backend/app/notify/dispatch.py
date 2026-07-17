"""Fan a report summary out to every configured channel and log the outcome."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import Settings
from . import email as email_channel
from . import slack as slack_channel
from . import teams as teams_channel
from .summary import build_summary

logger = logging.getLogger("github-usage.notify")


async def send_report(
    settings: Settings,
    store,
    envelope: dict[str, Any],
    *,
    trigger: str = "manual",
    channels: list[str] | None = None,
    dashboard_url: str = "",
) -> dict[str, Any]:
    """Send the report set in `envelope` to the requested (or all enabled)
    channels. `trigger` is one of manual|daily|weekly|monthly (for the log)."""
    reports = envelope.get("reports", [])
    notify = settings.notify
    requested = channels or notify.enabled_channels()
    # Only channels that are BOTH requested AND actually configured.
    active = [c for c in requested if c in notify.enabled_channels()]

    if not active:
        result = {"status": "skipped", "reason": "no channels enabled", "results": []}
        store.record_notification(trigger=trigger, channels=[], status="skipped", detail=result)
        return result

    summary = build_summary(reports, source=envelope.get("source", "unknown"))

    tasks = []
    for ch in active:
        if ch == "slack":
            tasks.append(slack_channel.send(
                notify.slack_webhook_url, summary,
                dashboard_url=dashboard_url, timeout=settings.http_timeout))
        elif ch == "teams":
            tasks.append(teams_channel.send(
                notify.teams_webhook_url, summary,
                dashboard_url=dashboard_url, timeout=settings.http_timeout))
        elif ch == "email":
            tasks.append(email_channel.send(
                notify, summary, reports, dashboard_url=dashboard_url))

    raw = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for ch, r in zip(active, raw, strict=False):
        if isinstance(r, Exception):
            logger.warning("channel %s raised %s", ch, type(r).__name__)
            results.append({"channel": ch, "ok": False, "error": type(r).__name__})
        else:
            results.append(r)

    oks = sum(1 for r in results if r.get("ok"))
    status = "ok" if oks == len(results) else ("partial" if oks else "error")
    detail = {"status": status, "summary": summary.as_dict(), "results": results}
    store.record_notification(trigger=trigger, channels=active, status=status, detail=detail)
    logger.info("report sent (%s) via %s -> %s", trigger, active, status)
    return detail
