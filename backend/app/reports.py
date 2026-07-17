"""ReportService — the single source of truth for "what usage data do we have".

In **live** mode it pulls the configured org and/or enterprise from GitHub,
renders each response into a native CSV, and returns a manifest of
`{name, type, csv}`. Any single report that 403/404s (a scope the token can't
see, or a product the plan doesn't have) is skipped with a warning — the rest
still come back.

In **demo** mode it serves the bundled example CSVs so the dashboard is fully
populated with no secrets and no network.

Results are cached in the datastore (Postgres in production, SQLite for local
dev) with a TTL so every browser load doesn't re-hit the GitHub API; `refresh()`
forces a fresh pull (used by the "Refresh" button and the scheduled jobs).
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any

from .config import Settings
from .github import csv_render
from .github.auth import build_token_provider
from .github.client import GitHubClient, GitHubError

logger = logging.getLogger("github-usage.reports")


class ReportService:
    def __init__(self, settings: Settings, store) -> None:
        self._s = settings
        self._store = store
        # Serializes refreshes so N concurrent browser loads trigger ONE fetch.
        self._refresh_lock = asyncio.Lock()

    # --- public API -------------------------------------------------------
    def _is_fresh(self, cached: dict[str, Any] | None) -> bool:
        return bool(
            cached and (time.time() - cached["fetched_at"]) < self._s.cache_ttl_seconds
        )

    async def get_reports(self) -> dict[str, Any]:
        """Return cached reports if still fresh, else refresh. Shape:
        {"source", "fetched_at", "age_seconds", "reports": [{name,type,csv}]}."""
        cached = self._store.load_reports()
        if self._is_fresh(cached):
            return self._envelope(cached)
        # Double-checked locking: a concurrent caller may have refreshed while we
        # waited for the lock, so re-read the cache before pulling again.
        async with self._refresh_lock:
            cached = self._store.load_reports()
            if self._is_fresh(cached):
                return self._envelope(cached)
            return await self._do_refresh()

    async def refresh(self) -> dict[str, Any]:
        """Force a fresh pull (live) or reload (demo) and update the cache."""
        async with self._refresh_lock:
            return await self._do_refresh()

    async def _do_refresh(self) -> dict[str, Any]:
        if self._s.is_demo:
            reports = self._load_demo_reports()
            source = "demo"
        else:
            reports, transient = await self._fetch_live_reports()
            source = "live"
            # Never blow away a good cache with an all-empty failed pull.
            if not reports:
                cached = self._store.load_reports()
                if cached and cached["reports"]:
                    logger.warning("live refresh returned nothing; keeping prior cache")
                    return self._envelope(cached)
            # For endpoints that failed *transiently* (rate-limit / 5xx / network,
            # not a permanent 401/403/404), keep the last-known-good copy from the
            # prior cache so one blip doesn't drop a report for a whole TTL.
            elif transient:
                self._merge_prior(reports, transient)
        fetched_at = self._store.save_reports(reports, source=source)
        return self._envelope({"reports": reports, "source": source, "fetched_at": fetched_at})

    def _merge_prior(self, reports: list[dict[str, Any]], failed_names: set[str]) -> None:
        """Re-add prior-cache copies of reports that failed transiently this pull
        and aren't otherwise present, so a transient blip is self-healing."""
        prior = self._store.load_reports()
        if not prior or not prior.get("reports"):
            return
        have = {r["name"] for r in reports}
        for old in prior["reports"]:
            if old["name"] in failed_names and old["name"] not in have:
                reports.append(old)
                logger.warning("kept cached '%s' after a transient fetch failure", old["name"])

    def peek_cached(self) -> dict[str, Any] | None:
        cached = self._store.load_reports()
        return self._envelope(cached) if cached else None

    # --- live fetch -------------------------------------------------------
    async def _fetch_live_reports(self) -> tuple[list[dict[str, Any]], set[str]]:
        """Returns (reports, transiently_failed_names). Permanent 401/403/404
        skips are NOT in the failed set — they're legitimately absent scopes."""
        provider = build_token_provider(self._s.github, self._s.http_timeout)
        if provider is None:
            logger.error("live mode but no GitHub credentials resolved")
            return [], set()
        client = GitHubClient(provider, self._s.github.api_base, self._s.http_timeout)
        gh = self._s.github
        reports: list[dict[str, Any]] = []
        transient: set[str] = set()

        if gh.org:
            await self._try(
                reports, transient, name=f"{gh.org}-metered-usage.csv", report_type="usage_report",
                fn=lambda: client.org_usage(gh.org),
                render=lambda items: csv_render.render_usage(items, default_org=gh.org),
            )
            await self._try(
                reports, transient, name=f"{gh.org}-copilot-seats.csv", report_type="copilot_seat_activity",
                fn=lambda: client.org_copilot_seats(gh.org),
                render=lambda seats: csv_render.render_copilot_seats(seats, org=gh.org),
            )
            await self._try(
                reports, transient, name=f"{gh.org}-ghas-committers.csv", report_type="ghas_active_committers",
                fn=lambda: client.org_advanced_security(gh.org),
                render=lambda payload: csv_render.render_ghas(payload, org=gh.org),
            )

        if gh.enterprise:
            await self._try(
                reports, transient, name=f"{gh.enterprise}-metered-usage.csv", report_type="usage_report",
                fn=lambda: client.enterprise_usage(gh.enterprise),
                render=lambda items: csv_render.render_usage(items, default_org=gh.enterprise),
            )
            await self._try(
                reports, transient, name=f"{gh.enterprise}-enterprise-members.csv", report_type="enterprise_members",
                fn=lambda: client.enterprise_consumed_licenses(gh.enterprise),
                render=csv_render.render_consumed_licenses,
            )

        logger.info("fetched %d report(s) via %s", len(reports), client.describe_auth())
        return reports, transient

    async def _try(self, out: list, transient: set[str], *, name: str, report_type: str, fn, render) -> None:
        """Fetch + render one report, appending to `out`. A permanent 401/403/404
        is a clean skip (absent scope). Any other error (rate-limit, 5xx, network,
        render failure) records `name` in `transient` so the caller can keep the
        prior cached copy instead of dropping the report."""
        try:
            raw = await fn()
        except GitHubError as exc:
            if exc.status in (401, 403, 404):
                logger.warning("skipping %s: %s", name, exc)
            else:
                logger.error("transient error fetching %s: %s", name, exc)
                transient.add(name)
            return
        except Exception as exc:  # noqa: BLE001
            logger.error("transient error fetching %s: %s", name, type(exc).__name__)
            transient.add(name)
            return
        try:
            csv_text = render(raw)
        except Exception as exc:  # noqa: BLE001
            logger.error("error rendering %s: %s", name, type(exc).__name__)
            transient.add(name)
            return
        out.append({"name": name, "type": report_type, "csv": csv_text})

    # --- demo -------------------------------------------------------------
    def _load_demo_reports(self) -> list[dict[str, Any]]:
        directory = self._resolve_demo_dir()
        if directory is None:
            logger.warning("demo mode but no demo-data directory found")
            return []
        reports = []
        for path in sorted(directory.glob("*.csv")):
            try:
                reports.append({
                    "name": path.name,
                    "type": "auto",  # SPA detects the real type from headers
                    "csv": path.read_text(encoding="utf-8-sig"),
                })
            except OSError as exc:
                logger.warning("could not read demo file %s: %s", path, exc)
        return reports

    def _resolve_demo_dir(self) -> Path | None:
        candidates = [
            Path(self._s.demo_data_dir),
            # Dev fallbacks: the repo's bundled examples.
            Path(__file__).resolve().parents[2] / "examples",
            Path.cwd() / "examples",
        ]
        for c in candidates:
            if c.is_dir() and any(c.glob("*.csv")):
                return c
        return None

    # --- helpers ----------------------------------------------------------
    @staticmethod
    def _envelope(cached: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": cached["source"],
            "fetched_at": cached["fetched_at"],
            "age_seconds": max(0.0, time.time() - cached["fetched_at"]),
            "reports": cached["reports"],
        }
