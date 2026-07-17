"""In-process cron for scheduled report delivery.

APScheduler fires daily/weekly/monthly jobs (each an independent 5-field cron in
the configured timezone). A job refreshes the report set from GitHub, then
dispatches the summary to every enabled channel. Empty schedules => no jobs, so
this is a no-op unless you opt in.

Keeping the scheduler in-process (rather than a k8s CronJob) means the whole
feature works identically under `docker compose up` and in-cluster, with one
moving part instead of two.
"""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import Settings
from .notify.dispatch import send_report
from .reports import ReportService

logger = logging.getLogger("github-usage.scheduler")


class ReportScheduler:
    def __init__(
        self,
        settings: Settings,
        store,
        report_service: ReportService,
        dashboard_url: str = "",
    ) -> None:
        self._s = settings
        self._store = store
        self._reports = report_service
        self._dashboard_url = dashboard_url
        self._scheduler: AsyncIOScheduler | None = None

    async def _run_job(self, trigger: str) -> None:
        logger.info("scheduled job firing: %s", trigger)
        try:
            envelope = await self._reports.refresh()
        except Exception as exc:  # noqa: BLE001
            logger.error("scheduled refresh failed (%s): %s", trigger, type(exc).__name__)
            # Fall back to whatever is cached so a transient GitHub blip still reports.
            envelope = await self._reports.peek_cached()
            if not envelope:
                await asyncio.to_thread(
                    self._store.record_notification,
                    trigger=trigger, channels=[], status="error",
                    detail={"error": "refresh failed and no cache"})
                return
        await send_report(
            self._s, self._store, envelope,
            trigger=trigger, dashboard_url=self._dashboard_url)

    def start(self) -> None:
        sch = self._s.schedule
        if not sch.any_enabled:
            logger.info("no schedules configured; scheduler idle")
            return
        if not self._s.notify.any_enabled:
            logger.warning("schedules set but no notification channels enabled; jobs would no-op")

        scheduler = AsyncIOScheduler(timezone=sch.timezone)
        for trigger, cron in (
            ("daily", sch.daily_cron),
            ("weekly", sch.weekly_cron),
            ("monthly", sch.monthly_cron),
        ):
            if not cron:
                continue
            try:
                scheduler.add_job(
                    self._run_job,
                    CronTrigger.from_crontab(cron, timezone=sch.timezone),
                    args=[trigger],
                    id=f"report-{trigger}",
                    replace_existing=True,
                    misfire_grace_time=3600,
                    coalesce=True,
                )
                logger.info("scheduled %s report: '%s' (%s)", trigger, cron, sch.timezone)
            except ValueError as exc:
                logger.error("invalid %s cron '%s': %s", trigger, cron, exc)
        scheduler.start()
        self._scheduler = scheduler

    def shutdown(self) -> None:
        if self._scheduler:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None

    def jobs(self) -> list[dict]:
        if not self._scheduler:
            return []
        return [
            {"id": j.id, "next_run": j.next_run_time.isoformat() if j.next_run_time else None}
            for j in self._scheduler.get_jobs()
        ]
