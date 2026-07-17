"""In-process cron for scheduled report delivery.

APScheduler fires daily/weekly/monthly jobs (each an independent 5-field cron in
the configured timezone). A job refreshes the report set from GitHub, then
dispatches the summary to the channels the schedule targets (or every enabled
channel when the schedule doesn't pin a subset).

The active configuration is a `ScheduleModel` (see schedules.py) that is loaded
from the datastore at startup and can be edited at runtime from the dashboard.
`set_model()` reconciles the live APScheduler jobs against a new model without a
restart, so a schedule change from the UI takes effect immediately.

Keeping the scheduler in-process (rather than a k8s CronJob) means the whole
feature works identically under `docker compose up` and in-cluster, with one
moving part instead of two. The app is single-replica by design, so there is
exactly one scheduler and no cross-replica coordination to worry about.
"""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import Settings
from .notify.dispatch import send_report
from .reports import ReportService
from .schedules import FREQUENCIES, ScheduleModel

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
        self._model = ScheduleModel(timezone="UTC")

    # -- lifecycle ---------------------------------------------------------
    def start(self, model: ScheduleModel) -> None:
        """Start the scheduler and install the initial jobs.

        The scheduler is always started (even with no enabled schedules) so that
        a later `set_model()` from the dashboard can add jobs without a restart.
        """
        self._model = model
        scheduler = AsyncIOScheduler(timezone=model.timezone)
        scheduler.start()
        self._scheduler = scheduler
        self._reconcile()

    def shutdown(self) -> None:
        if self._scheduler:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None

    # -- runtime reconfiguration ------------------------------------------
    def set_model(self, model: ScheduleModel) -> None:
        """Swap in a new schedule model and reconcile jobs in place. Persistence
        is the caller's responsibility (see the PUT /api/schedules handler)."""
        self._model = model
        if self._scheduler is not None:
            self._reconcile()

    def model(self) -> ScheduleModel:
        return self._model

    def _reconcile(self) -> None:
        """Make the live jobs match `self._model`: (re)install enabled schedules,
        remove disabled or invalid ones. Idempotent — safe to call repeatedly."""
        scheduler = self._scheduler
        if scheduler is None:
            return
        tz = self._model.timezone
        if not self._model_has_channels():
            logger.warning(
                "schedules are enabled but no notification channel is configured; "
                "jobs will run and no-op until Slack/Teams/Email is set up")
        for freq in FREQUENCIES:
            job_id = f"report-{freq}"
            entry = self._model.entries[freq]
            if not entry.enabled:
                if scheduler.get_job(job_id):
                    scheduler.remove_job(job_id)
                continue
            cron = entry.to_cron(freq)
            try:
                trigger = CronTrigger.from_crontab(cron, timezone=tz)
            except (ValueError, TypeError) as exc:
                logger.error("invalid %s cron '%s': %s", freq, cron, exc)
                if scheduler.get_job(job_id):
                    scheduler.remove_job(job_id)
                continue
            scheduler.add_job(
                self._run_job,
                trigger,
                args=[freq, entry.channels],
                id=job_id,
                replace_existing=True,
                misfire_grace_time=3600,
                coalesce=True,
            )
            logger.info(
                "scheduled %s report: '%s' (%s) -> %s",
                freq, cron, tz, entry.channels or "all channels")

    def _model_has_channels(self) -> bool:
        """True if any enabled schedule could actually deliver somewhere."""
        if not self._s.notify.any_enabled:
            return False
        return any(self._model.entries[f].enabled for f in FREQUENCIES)

    # -- job body ----------------------------------------------------------
    async def _run_job(self, trigger: str, channels: list[str] | None) -> None:
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
            trigger=trigger, channels=channels, dashboard_url=self._dashboard_url)

    # -- introspection -----------------------------------------------------
    def describe(self) -> dict:
        """Compact schedule view for /api/status (live model + next-run times)."""
        summary = self._model.summary()
        summary["jobs"] = self.jobs()
        return summary

    def jobs(self) -> list[dict]:
        if not self._scheduler:
            return []
        return [
            {"id": j.id, "next_run": j.next_run_time.isoformat() if j.next_run_time else None}
            for j in self._scheduler.get_jobs()
        ]
