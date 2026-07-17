"""github-usage-dashboard — FastAPI app factory.

One process serves:
  * the built React SPA at `/` (the dashboard), and
  * a small JSON API at `/api/*` that feeds it auto-fetched GitHub usage and
    drives on-demand report delivery.

The SPA loads its data from `GET /api/reports` on boot; if that 404s (e.g. the
static build hosted on GitHub Pages with no backend) the SPA silently falls back
to its drag-and-drop / demo behaviour.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .notify.dispatch import send_report
from .reports import ReportService
from .scheduler import ReportScheduler
from .store import build_store

_VALID_CHANNELS = {"slack", "teams", "email"}

# Module-level Body singleton (avoids a function-call default in the route
# signature; keeps the payload optional so an empty POST body is valid).
_SEND_BODY = Body(default={})


def _require_json(content_type: str = Header(default="")) -> None:
    """Require an application/json content-type on state-changing POSTs.

    This is a lightweight CSRF guard: a cross-origin form/`fetch` "simple request"
    cannot set application/json without triggering a CORS preflight the server
    never approves, so a malicious page can't drive /api/refresh or
    /api/report/send from a victim's browser. (Production should still sit behind
    an edge auth layer such as Cloudflare Access — see the chart README.)
    """
    if not content_type.lower().startswith("application/json"):
        raise HTTPException(status_code=415, detail="content_type_must_be_application_json")


def create_app() -> FastAPI:
    settings = load_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger = logging.getLogger("github-usage")

    store = build_store(settings)
    reports = ReportService(settings, store)
    dashboard_url = os.environ.get("PUBLIC_URL", "").strip()
    scheduler = ReportScheduler(settings, store, reports, dashboard_url)

    logger.info(
        "starting in %s mode (org=%s enterprise=%s channels=%s)",
        settings.mode, settings.github.org or "-", settings.github.enterprise or "-",
        settings.notify.enabled_channels() or "none",
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        scheduler.start()
        try:
            yield
        finally:
            scheduler.shutdown()
            store.close()

    app = FastAPI(title="github-usage-dashboard", version="1.0.0", lifespan=lifespan)

    # --- health / status --------------------------------------------------
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/status")
    async def status() -> JSONResponse:
        cached = reports.peek_cached()
        return JSONResponse({
            "mode": settings.mode,
            "github": {
                "org": settings.github.org or None,
                "enterprise": settings.github.enterprise or None,
                "auth": _describe_auth(settings),
                "api_base": settings.github.api_base,
            },
            "channels": settings.notify.enabled_channels(),
            "database": store.describe(),
            "schedules": {
                "daily": settings.schedule.daily_cron or None,
                "weekly": settings.schedule.weekly_cron or None,
                "monthly": settings.schedule.monthly_cron or None,
                "timezone": settings.schedule.timezone,
                "jobs": scheduler.jobs(),
            },
            "cache": {
                "source": cached["source"] if cached else None,
                "fetched_at": cached["fetched_at"] if cached else None,
                "age_seconds": cached["age_seconds"] if cached else None,
                "ttl_seconds": settings.cache_ttl_seconds,
            } if cached else {"source": None},
        })

    # --- reports ----------------------------------------------------------
    @app.get("/api/reports")
    async def list_reports() -> JSONResponse:
        """Manifest of available reports (no CSV bodies). The SPA then GETs each
        `/api/reports/{name}` and feeds it through its normal CSV import path."""
        env = await reports.get_reports()
        return JSONResponse({
            "source": env["source"],
            "fetched_at": env["fetched_at"],
            "age_seconds": env["age_seconds"],
            "reports": [{"name": r["name"], "type": r["type"]} for r in env["reports"]],
        })

    @app.get("/api/reports/{name}")
    async def get_report_csv(name: str) -> PlainTextResponse:
        env = await reports.get_reports()
        for r in env["reports"]:
            if r["name"] == name:
                return PlainTextResponse(r["csv"], media_type="text/csv")
        raise HTTPException(status_code=404, detail="report_not_found")

    @app.post("/api/refresh", dependencies=[Depends(_require_json)])
    async def refresh() -> JSONResponse:
        env = await reports.refresh()
        return JSONResponse({
            "source": env["source"],
            "fetched_at": env["fetched_at"],
            "count": len(env["reports"]),
            "reports": [r["name"] for r in env["reports"]],
        })

    # --- notifications ----------------------------------------------------
    @app.post("/api/report/send", dependencies=[Depends(_require_json)])
    async def send(payload: dict = _SEND_BODY) -> JSONResponse:
        """Send the current report set on demand. Body: {"channels": ["slack",…]}
        (optional — defaults to every enabled channel)."""
        channels = payload.get("channels")
        if channels is not None:
            if not isinstance(channels, list) or any(c not in _VALID_CHANNELS for c in channels):
                raise HTTPException(status_code=400, detail="invalid_channels")
        if not settings.notify.any_enabled:
            raise HTTPException(status_code=503, detail="no_channels_configured")
        env = await reports.get_reports()
        result = await send_report(
            settings, store, env, trigger="manual",
            channels=channels, dashboard_url=dashboard_url)
        code = 200 if result.get("status") in ("ok", "partial") else 502
        if result.get("status") == "skipped":
            code = 200
        return JSONResponse(result, status_code=code)

    @app.get("/api/notifications")
    async def notifications(limit: int = 50) -> JSONResponse:
        return JSONResponse({"notifications": store.list_notifications(min(max(limit, 1), 200))})

    # --- static SPA -------------------------------------------------------
    _mount_spa(app, settings.web_dir, logger)

    return app


def _describe_auth(settings) -> str:
    gh = settings.github
    if settings.is_demo:
        return "demo"
    if gh.has_pat:
        return "pat"
    if gh.has_app_auth:
        return f"app:{gh.app_id}"
    return "none"


def _mount_spa(app: FastAPI, web_dir: str, logger: logging.Logger) -> None:
    web = Path(web_dir)
    index = web / "index.html"
    if not index.is_file():
        logger.warning("no built SPA at %s — serving API only", web_dir)

        @app.get("/")
        async def _placeholder() -> JSONResponse:
            return JSONResponse({
                "service": "github-usage-dashboard",
                "note": "API is up; the SPA build was not found. `npm run build` "
                        "and set WEB_DIR, or use the container image.",
            })
        return

    # html=True makes `/` serve index.html and unknown paths fall through to a
    # 404 (fine — the SPA is a single page driven by query params, not routes).
    app.mount("/", StaticFiles(directory=str(web), html=True), name="spa")
