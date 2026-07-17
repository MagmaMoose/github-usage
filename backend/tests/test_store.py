from __future__ import annotations

from app.config import Settings
from app.store import PostgresStore, SqliteStore, build_store


def test_build_store_defaults_to_sqlite(tmp_path):
    s = Settings(db_path=str(tmp_path / "app.db"))
    store = build_store(s)
    assert isinstance(store, SqliteStore)
    assert store.describe() == "sqlite"


def test_build_store_selects_postgres_when_database_url_set(tmp_path):
    # PostgresStore connects lazily, so selecting it needs no live DB.
    s = Settings(database_url="postgresql://u:p@localhost:5432/db", db_path=str(tmp_path / "app.db"))
    assert s.uses_postgres
    store = build_store(s)
    assert isinstance(store, PostgresStore)
    assert store.describe() == "postgres"


def test_sqlite_reports_roundtrip(tmp_path):
    store = SqliteStore(str(tmp_path / "app.db"))
    assert store.load_reports() is None
    reports = [{"name": "acme-metered-usage.csv", "type": "usage_report", "csv": "date,net_amount\n"}]
    ts = store.save_reports(reports, source="live")
    loaded = store.load_reports()
    assert loaded is not None
    assert loaded["source"] == "live"
    assert loaded["fetched_at"] == ts
    assert loaded["reports"] == reports
    # Upsert: a second save overwrites the single cache row.
    store.save_reports([], source="demo")
    assert store.load_reports()["source"] == "demo"


def test_sqlite_schedules_roundtrip(tmp_path):
    store = SqliteStore(str(tmp_path / "app.db"))
    assert store.load_schedules() is None
    payload = {
        "timezone": "Europe/Amsterdam",
        "entries": {"daily": {"enabled": True, "hour": 9, "minute": 0}},
    }
    store.save_schedules(payload)
    assert store.load_schedules() == payload
    # Upsert: a second save overwrites the single row.
    store.save_schedules({"timezone": "UTC", "entries": {}})
    assert store.load_schedules()["timezone"] == "UTC"


def test_sqlite_notifications_log(tmp_path):
    store = SqliteStore(str(tmp_path / "app.db"))
    store.record_notification(
        trigger="manual", channels=["slack", "email"], status="ok",
        detail={"results": [{"channel": "slack", "ok": True}]},
    )
    store.record_notification(trigger="daily", channels=[], status="skipped")
    rows = store.list_notifications()
    assert len(rows) == 2
    assert rows[0]["trigger"] == "daily"           # newest first
    assert rows[1]["channels"] == ["slack", "email"]
    assert rows[1]["detail"]["results"][0]["ok"] is True
    assert rows[0]["detail"] == {}                  # NULL detail -> {}
