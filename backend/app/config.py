"""Runtime configuration, read entirely from environment variables.

Mirrors the magmamoose convention: non-sensitive knobs are set on the
Deployment/ConfigMap, secrets are projected from OCI Vault via an ExternalSecret.
Nothing here ever logs a secret value.

Two operating modes:
  * live  — talk to the real GitHub billing API for the configured org and/or
            enterprise. This is the in-cluster / production mode.
  * demo  — no network, no secrets; the bundled example CSVs are served so the
            whole dashboard works offline. Used for local dev + docker-compose.

Auth is GitHub App by default (an installation token is minted from the App
JWT and auto-refreshed). A classic/fine-grained PAT can be supplied via
GITHUB_TOKEN as an override that takes precedence — useful for *enterprise*
billing, which GitHub Apps cannot always be installed against.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Repo root (…/backend/app/config.py -> repo root is three parents up in dev;
# in the container the example CSVs are copied next to the app, so we resolve
# DEMO_DATA_DIR from env with a sensible fallback).
_APP_DIR = Path(__file__).resolve().parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _bool(name: str, default: bool = False) -> bool:
    val = _env(name).lower()
    if not val:
        return default
    return val in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class GitHubConfig:
    """Which GitHub scopes to pull, and how to authenticate.

    `org` and `enterprise` are both optional; whichever is set is fetched. Set
    both to pull both. `api_base` supports GitHub Enterprise Server (GHES).
    """

    org: str = ""
    enterprise: str = ""

    api_base: str = "https://api.github.com"

    # --- GitHub App auth (default) ---
    app_id: str = ""
    app_private_key: str = ""  # PEM contents (not a path)
    app_installation_id: str = ""

    # --- PAT override (takes precedence when set) ---
    token: str = ""

    @property
    def has_app_auth(self) -> bool:
        return bool(self.app_id and self.app_private_key and self.app_installation_id)

    @property
    def has_pat(self) -> bool:
        return bool(self.token)

    @property
    def has_auth(self) -> bool:
        return self.has_pat or self.has_app_auth

    @property
    def has_target(self) -> bool:
        return bool(self.org or self.enterprise)


@dataclass(frozen=True)
class NotifyConfig:
    """Notification channel configuration. Each channel is *enabled* purely by
    the presence of its config — no separate on/off flag — so a channel with no
    webhook simply never fires."""

    slack_webhook_url: str = ""

    teams_webhook_url: str = ""

    # SMTP for the email channel.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    email_from: str = ""
    email_to: list[str] = field(default_factory=list)

    @property
    def slack_enabled(self) -> bool:
        return bool(self.slack_webhook_url)

    @property
    def teams_enabled(self) -> bool:
        return bool(self.teams_webhook_url)

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.email_from and self.email_to)

    @property
    def any_enabled(self) -> bool:
        return self.slack_enabled or self.teams_enabled or self.email_enabled

    def enabled_channels(self) -> list[str]:
        out = []
        if self.slack_enabled:
            out.append("slack")
        if self.teams_enabled:
            out.append("teams")
        if self.email_enabled:
            out.append("email")
        return out


@dataclass(frozen=True)
class ScheduleConfig:
    """Cron schedules for automatic report delivery. Empty = disabled.

    Values are 5-field cron expressions (min hour dom mon dow) evaluated in
    `timezone`. Any subset may be set; each fires an independent job.
    """

    daily_cron: str = ""
    weekly_cron: str = ""
    monthly_cron: str = ""
    timezone: str = "UTC"

    @property
    def any_enabled(self) -> bool:
        return bool(self.daily_cron or self.weekly_cron or self.monthly_cron)


@dataclass(frozen=True)
class Settings:
    mode: str = "demo"  # "live" | "demo"

    github: GitHubConfig = field(default_factory=GitHubConfig)
    notify: NotifyConfig = field(default_factory=NotifyConfig)
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)

    # Datastore for the report cache + notification log. Postgres is first-class
    # (set DATABASE_URL, e.g. postgresql://user:pass@host:5432/db); when it is
    # empty the app falls back to a file-backed SQLite DB at `db_path` — meant
    # for local dev / demo, not production.
    database_url: str = ""
    db_path: str = "/var/lib/github-usage/app.db"

    # Directory with the built SPA (dist/) — served at "/".
    web_dir: str = str(_APP_DIR.parent / "web")

    # Directory with bundled example CSVs, used in demo mode.
    demo_data_dir: str = str(_APP_DIR.parent / "demo-data")

    # Seconds a fetched report set is cached before a fresh GitHub pull.
    cache_ttl_seconds: int = 3600

    # Per-request timeout (seconds) for calls out to GitHub / webhooks.
    http_timeout: float = 30.0

    log_level: str = "INFO"

    @property
    def is_demo(self) -> bool:
        return self.mode == "demo"

    @property
    def uses_postgres(self) -> bool:
        return bool(self.database_url)


def load_settings() -> Settings:
    """Build Settings from the environment. Falls back to demo mode whenever no
    GitHub target+auth is configured, so a bare run is never dead-on-arrival."""
    github = GitHubConfig(
        org=_env("GITHUB_ORG"),
        enterprise=_env("GITHUB_ENTERPRISE"),
        api_base=_env("GITHUB_API_BASE", "https://api.github.com").rstrip("/"),
        app_id=_env("GITHUB_APP_ID"),
        # Support the key inline, or via a mounted file path.
        app_private_key=_read_key(),
        app_installation_id=_env("GITHUB_APP_INSTALLATION_ID"),
        token=_env("GITHUB_TOKEN"),
    )

    notify = NotifyConfig(
        slack_webhook_url=_env("SLACK_WEBHOOK_URL"),
        teams_webhook_url=_env("TEAMS_WEBHOOK_URL"),
        smtp_host=_env("SMTP_HOST"),
        smtp_port=_int("SMTP_PORT", 587),
        smtp_user=_env("SMTP_USER"),
        smtp_password=_env("SMTP_PASSWORD"),
        smtp_starttls=_bool("SMTP_STARTTLS", True),
        email_from=_env("REPORT_EMAIL_FROM") or _env("SMTP_USER"),
        email_to=_split_list(_env("REPORT_EMAIL_TO")),
    )

    schedule = ScheduleConfig(
        daily_cron=_env("SCHEDULE_DAILY_CRON"),
        weekly_cron=_env("SCHEDULE_WEEKLY_CRON"),
        monthly_cron=_env("SCHEDULE_MONTHLY_CRON"),
        timezone=_env("SCHEDULE_TIMEZONE", "UTC") or "UTC",
    )

    explicit_mode = _env("APP_MODE").lower()
    if explicit_mode in ("live", "demo"):
        mode = explicit_mode
    else:
        # Live only when we can actually reach GitHub; demo otherwise.
        mode = "live" if (github.has_target and github.has_auth) else "demo"

    return Settings(
        mode=mode,
        github=github,
        notify=notify,
        schedule=schedule,
        database_url=_env("DATABASE_URL"),
        db_path=_env("DB_PATH", "/var/lib/github-usage/app.db"),
        web_dir=_env("WEB_DIR", str(_APP_DIR.parent / "web")),
        demo_data_dir=_env("DEMO_DATA_DIR", str(_APP_DIR.parent / "demo-data")),
        cache_ttl_seconds=_int("CACHE_TTL_SECONDS", 3600),
        http_timeout=float(_env("HTTP_TIMEOUT", "30") or "30"),
        log_level=_env("LOG_LEVEL", "INFO") or "INFO",
    )


def _read_key() -> str:
    """GitHub App private key: prefer inline PEM, else a mounted file path."""
    inline = os.environ.get("GITHUB_APP_PRIVATE_KEY", "")
    if inline.strip():
        # Support keys passed with literal "\n" (common in some secret stores).
        return inline.replace("\\n", "\n").strip()
    path = _env("GITHUB_APP_PRIVATE_KEY_PATH")
    if path and Path(path).is_file():
        return Path(path).read_text(encoding="utf-8").strip()
    return ""


def _split_list(raw: str) -> list[str]:
    """Split a comma/whitespace/semicolon-separated list into clean items."""
    if not raw:
        return []
    parts = raw.replace(";", ",").replace("\n", ",").split(",")
    return [p.strip() for p in parts if p.strip()]
