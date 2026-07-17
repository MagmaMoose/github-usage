from __future__ import annotations

import pytest

from app.config import ScheduleConfig, Settings
from app.schedules import (
    ScheduleEntry,
    ScheduleError,
    ScheduleModel,
    load_model,
    parse_model,
)

# -- cron derivation --------------------------------------------------------

def test_daily_cron_from_time():
    assert ScheduleEntry(hour=9, minute=0).to_cron("daily") == "0 9 * * *"
    assert ScheduleEntry(hour=23, minute=45).to_cron("daily") == "45 23 * * *"


def test_weekly_cron_uses_weekday_name():
    # Names, not numbers: APScheduler's from_crontab maps the weekday field onto
    # its own 0=Monday scale, so a numeric field would be a day off.
    assert ScheduleEntry(hour=8, minute=30, day_of_week="tue").to_cron("weekly") == "30 8 * * tue"


def test_monthly_cron_uses_day_of_month():
    assert ScheduleEntry(hour=6, minute=0, day_of_month=15).to_cron("monthly") == "0 6 15 * *"


def test_cron_override_wins_verbatim():
    entry = ScheduleEntry(hour=9, minute=0, cron="*/5 * * * *")
    assert entry.to_cron("daily") == "*/5 * * * *"


# -- env seeding ------------------------------------------------------------

def _settings(**sched) -> Settings:
    return Settings(schedule=ScheduleConfig(**sched))


def test_seed_from_settings_enables_configured_crons():
    model = ScheduleModel.seed_from_settings(
        _settings(daily_cron="0 9 * * *", timezone="Europe/Amsterdam"))
    assert model.timezone == "Europe/Amsterdam"
    assert model.entries["daily"].enabled is True
    assert model.entries["daily"].cron == "0 9 * * *"
    # Unset frequencies stay disabled.
    assert model.entries["weekly"].enabled is False
    assert model.entries["monthly"].enabled is False


def test_seed_from_settings_empty_is_all_disabled():
    model = ScheduleModel.seed_from_settings(_settings())
    assert model.timezone == "UTC"
    assert not any(model.entries[f].enabled for f in ("daily", "weekly", "monthly"))


# -- round-trip -------------------------------------------------------------

def test_model_as_dict_round_trips_through_parse():
    original = ScheduleModel(
        timezone="UTC",
        entries={
            "daily": ScheduleEntry(enabled=True, hour=7, minute=15, channels=["slack"]),
            "weekly": ScheduleEntry(enabled=True, day_of_week="fri", channels=None),
            "monthly": ScheduleEntry(enabled=False),
        },
    )
    reparsed = parse_model(original.as_dict())
    assert reparsed.as_dict() == original.as_dict()


def test_summary_reports_effective_cron_only_when_enabled():
    model = ScheduleModel(
        timezone="UTC",
        entries={
            "daily": ScheduleEntry(enabled=True, hour=9, minute=0),
            "weekly": ScheduleEntry(enabled=False),
        },
    )
    summary = model.summary()
    assert summary["daily"] == "0 9 * * *"
    assert summary["weekly"] is None
    assert summary["timezone"] == "UTC"


# -- validation -------------------------------------------------------------

def _valid_payload(**overrides):
    entry = {"enabled": True, "hour": 9, "minute": 0, "day_of_week": "mon",
             "day_of_month": 1, "cron": "", "channels": None}
    entry.update(overrides)
    return {"timezone": "UTC", "entries": {"daily": entry}}


def test_parse_rejects_bad_hour():
    with pytest.raises(ScheduleError, match="hour"):
        parse_model(_valid_payload(hour=24))


def test_parse_rejects_bad_minute():
    with pytest.raises(ScheduleError, match="minute"):
        parse_model(_valid_payload(minute=60))


def test_parse_rejects_bad_weekday():
    with pytest.raises(ScheduleError, match="day_of_week"):
        parse_model(_valid_payload(day_of_week="funday"))


def test_parse_rejects_day_of_month_over_28():
    # Capped at 28 so a monthly job never skips a short month.
    with pytest.raises(ScheduleError, match="day_of_month"):
        parse_model(_valid_payload(day_of_month=31))


def test_parse_rejects_unknown_channel():
    with pytest.raises(ScheduleError, match="channel"):
        parse_model(_valid_payload(channels=["slack", "carrier-pigeon"]))


def test_parse_rejects_unknown_timezone():
    with pytest.raises(ScheduleError, match="timezone"):
        parse_model({"timezone": "Mars/Phobos", "entries": {}})


def test_parse_rejects_invalid_override_cron_when_enabled():
    with pytest.raises(ScheduleError, match="cron"):
        parse_model(_valid_payload(cron="not a cron"))


def test_parse_ignores_invalid_cron_when_disabled():
    # A disabled entry never fires, so its (unused) fields aren't validated hard.
    model = parse_model(_valid_payload(enabled=False, cron="not a cron"))
    assert model.entries["daily"].enabled is False


def test_parse_normalizes_empty_channel_list_to_none():
    model = parse_model(_valid_payload(channels=[]))
    assert model.entries["daily"].channels is None


def test_parse_lowercases_and_trims_channels():
    model = parse_model(_valid_payload(channels=[" Slack ", "EMAIL"]))
    assert set(model.entries["daily"].channels) == {"slack", "email"}


def test_missing_entries_default_to_disabled():
    model = parse_model({"timezone": "UTC", "entries": {}})
    for freq in ("daily", "weekly", "monthly"):
        assert model.entries[freq].enabled is False


# -- load_model (tolerant rehydrate) ---------------------------------------

def test_load_model_none_seeds_from_settings():
    model = load_model(None, _settings(weekly_cron="0 8 * * 1"))
    assert model.entries["weekly"].enabled is True


def test_load_model_corrupt_falls_back_to_seed():
    # A corrupt persisted blob must not brick startup.
    corrupt = {"timezone": "Nowhere/Nowhere", "entries": {"daily": {"hour": 99}}}
    model = load_model(corrupt, _settings(daily_cron="0 6 * * *"))
    assert model.timezone == "UTC"
    assert model.entries["daily"].cron == "0 6 * * *"
