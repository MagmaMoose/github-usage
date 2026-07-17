"""Runtime-editable schedule model for automatic report delivery.

The scheduler (scheduler.py) fires daily/weekly/monthly report jobs. Their
configuration used to come *only* from environment variables read once at
startup; this module makes the schedule a runtime value — a small structured
model that is persisted in the datastore and edited from the dashboard
(GET / PUT /api/schedules), while the SCHEDULE_* env vars still provide the
initial defaults on a fresh database.

Design notes:
  * The model is structured (enable + time-of-day + weekday / day-of-month +
    channels) rather than raw cron, so the dashboard can offer friendly
    controls. A raw-cron escape hatch per frequency is kept for power users and
    for seeding from the SCHEDULE_*_CRON env vars.
  * Weekdays are stored as NAMES ("mon".."sun"), never numbers. APScheduler's
    `CronTrigger.from_crontab` maps the weekday field onto its native
    0=Monday..6=Sunday scale — i.e. it does NOT follow the standard-cron
    0=Sunday convention — so a numeric weekday would silently land a day off.
    Names are unambiguous on both sides.
  * day_of_month is capped at 1..28 so a "monthly" job actually fires every
    month (day 30/31 would skip February and short months).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger

from .config import Settings

FREQUENCIES: tuple[str, ...] = ("daily", "weekly", "monthly")
VALID_CHANNELS: frozenset[str] = frozenset({"slack", "teams", "email"})
WEEKDAYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

_MAX_DOM = 28  # cap so a monthly job never skips a short month


class ScheduleError(ValueError):
    """Invalid schedule input. The message is safe to surface to the client."""


@dataclass
class ScheduleEntry:
    """One frequency (daily/weekly/monthly). Disabled entries never fire."""

    enabled: bool = False
    hour: int = 9
    minute: int = 0
    day_of_week: str = "mon"          # weekly only; one of WEEKDAYS
    day_of_month: int = 1             # monthly only; 1..28
    cron: str = ""                    # advanced override — used verbatim when set
    channels: list[str] | None = None  # None => every enabled channel

    def to_cron(self, frequency: str) -> str:
        """Derive the 5-field crontab string this entry represents."""
        override = self.cron.strip()
        if override:
            return override
        if frequency == "daily":
            return f"{self.minute} {self.hour} * * *"
        if frequency == "weekly":
            return f"{self.minute} {self.hour} * * {self.day_of_week}"
        if frequency == "monthly":
            return f"{self.minute} {self.hour} {self.day_of_month} * *"
        raise ScheduleError(f"unknown frequency: {frequency}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "hour": self.hour,
            "minute": self.minute,
            "day_of_week": self.day_of_week,
            "day_of_month": self.day_of_month,
            "cron": self.cron,
            "channels": self.channels,
        }


@dataclass
class ScheduleModel:
    timezone: str = "UTC"
    entries: dict[str, ScheduleEntry] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Guarantee an entry for every frequency so callers never KeyError.
        for freq in FREQUENCIES:
            self.entries.setdefault(freq, ScheduleEntry())

    def as_dict(self) -> dict[str, Any]:
        return {
            "timezone": self.timezone,
            "entries": {freq: self.entries[freq].as_dict() for freq in FREQUENCIES},
        }

    def summary(self) -> dict[str, Any]:
        """Compact view for /api/status: the effective cron per enabled frequency."""
        out: dict[str, Any] = {"timezone": self.timezone}
        for freq in FREQUENCIES:
            entry = self.entries[freq]
            out[freq] = entry.to_cron(freq) if entry.enabled else None
        return out

    @classmethod
    def seed_from_settings(cls, settings: Settings) -> ScheduleModel:
        """Initial model from the SCHEDULE_* env vars (the pre-UI behaviour).

        A configured SCHEDULE_<freq>_CRON becomes an enabled entry whose raw
        cron override preserves the exact expression the operator set.
        """
        sch = settings.schedule
        entries: dict[str, ScheduleEntry] = {}
        for freq, raw in (
            ("daily", sch.daily_cron),
            ("weekly", sch.weekly_cron),
            ("monthly", sch.monthly_cron),
        ):
            raw = (raw or "").strip()
            entries[freq] = ScheduleEntry(enabled=True, cron=raw) if raw else ScheduleEntry()
        return cls(timezone=(sch.timezone or "UTC"), entries=entries)


# ---------------------------------------------------------------------------
# Validation of untrusted PUT payloads
# ---------------------------------------------------------------------------

def _as_int(value: Any, name: str, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ScheduleError(f"{name} must be an integer") from None
    if not lo <= n <= hi:
        raise ScheduleError(f"{name} must be between {lo} and {hi}")
    return n


def _validate_channels(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or any(not isinstance(c, str) for c in value):
        raise ScheduleError("channels must be a list of strings or null")
    cleaned = [c.strip().lower() for c in value if c.strip()]
    bad = sorted({c for c in cleaned if c not in VALID_CHANNELS})
    if bad:
        raise ScheduleError(f"unknown channel(s): {', '.join(bad)}")
    # None and [] both mean "all enabled channels"; normalise [] -> None.
    return cleaned or None


def _validate_timezone(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ScheduleError("timezone is required")
    tz = value.strip()
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ScheduleError(f"unknown timezone: {tz}") from None
    return tz


def _validate_entry(freq: str, raw: Any) -> ScheduleEntry:
    if not isinstance(raw, dict):
        raise ScheduleError(f"{freq} entry must be an object")

    dow = raw.get("day_of_week", "mon")
    if not isinstance(dow, str):
        raise ScheduleError(f"{freq}.day_of_week must be a weekday name")
    dow = dow.strip().lower()[:3]
    if dow not in WEEKDAYS:
        raise ScheduleError(f"{freq}.day_of_week must be one of {', '.join(WEEKDAYS)}")

    entry = ScheduleEntry(
        enabled=bool(raw.get("enabled", False)),
        hour=_as_int(raw.get("hour", 9), f"{freq}.hour", 0, 23),
        minute=_as_int(raw.get("minute", 0), f"{freq}.minute", 0, 59),
        day_of_week=dow,
        day_of_month=_as_int(raw.get("day_of_month", 1), f"{freq}.day_of_month", 1, _MAX_DOM),
        cron=str(raw.get("cron") or "").strip(),
        channels=_validate_channels(raw.get("channels")),
    )

    # Only a firing schedule needs a valid cron; a disabled entry can hold junk.
    if entry.enabled:
        try:
            CronTrigger.from_crontab(entry.to_cron(freq))
        except (ValueError, TypeError) as exc:
            raise ScheduleError(f"{freq}: invalid cron expression ({exc})") from None
    return entry


def parse_model(payload: Any) -> ScheduleModel:
    """Validate an untrusted PUT body into a ScheduleModel or raise ScheduleError."""
    if not isinstance(payload, dict):
        raise ScheduleError("body must be a JSON object")
    tz = _validate_timezone(payload.get("timezone", "UTC"))
    raw_entries = payload.get("entries") or {}
    if not isinstance(raw_entries, dict):
        raise ScheduleError("entries must be an object")
    entries = {freq: _validate_entry(freq, raw_entries.get(freq, {})) for freq in FREQUENCIES}
    return ScheduleModel(timezone=tz, entries=entries)


def load_model(payload: dict[str, Any] | None, settings: Settings) -> ScheduleModel:
    """Rehydrate a persisted model, falling back to env-seeded defaults when the
    store is empty or the stored blob is somehow corrupt (never brick startup)."""
    if not payload:
        return ScheduleModel.seed_from_settings(settings)
    try:
        return parse_model(payload)
    except ScheduleError:
        return ScheduleModel.seed_from_settings(settings)
