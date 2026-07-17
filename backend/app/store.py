"""Persistence for the report cache + notification log.

Two interchangeable backends behind one `Store` interface:

  * `PostgresStore` — **first-class** / production. Selected when DATABASE_URL is
    set. Connects lazily with retry (so the pod tolerates Postgres coming up a
    beat later), stores the cache + log in JSONB.
  * `SqliteStore`   — **fallback** for local dev / demo. A file-backed SQLite DB;
    zero extra services, but single-file and single-host.

`build_store(settings)` picks one. Both store the same two things:
  - report_cache: a single row — the last fetched report set + when + its source.
  - notifications: an append-only log of report deliveries.

The app is single-replica by design (one writer), so neither backend needs to
coordinate concurrent writers.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

logger = logging.getLogger("github-usage.store")


class Store(ABC):
    """Interface shared by the Postgres and SQLite backends."""

    @abstractmethod
    def save_reports(self, reports: list[dict[str, Any]], *, source: str) -> float: ...

    @abstractmethod
    def load_reports(self) -> dict[str, Any] | None: ...

    @abstractmethod
    def record_notification(
        self, *, trigger: str, channels: list[str], status: str,
        detail: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    @abstractmethod
    def list_notifications(self, limit: int = 50) -> list[dict[str, Any]]: ...

    @abstractmethod
    def describe(self) -> str: ...

    def close(self) -> None:  # noqa: B027 — optional lifecycle hook, no-op by default
        """Release any pooled resources on shutdown. Overridden by PostgresStore."""


def build_store(settings) -> Store:
    """Postgres when DATABASE_URL is set, else the SQLite fallback."""
    if settings.uses_postgres:
        logger.info("using Postgres datastore")
        return PostgresStore(settings.database_url)
    logger.info("using SQLite datastore at %s", settings.db_path)
    return SqliteStore(settings.db_path)


# ---------------------------------------------------------------------------
# SQLite (fallback)
# ---------------------------------------------------------------------------

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS report_cache (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    fetched_at  REAL    NOT NULL,
    source      TEXT    NOT NULL,
    payload     TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  REAL    NOT NULL,
    trigger     TEXT    NOT NULL,
    channels    TEXT,
    status      TEXT    NOT NULL,
    detail      TEXT
);
"""


class SqliteStore(Store):
    def __init__(self, db_path: str) -> None:
        self._path = db_path
        self._lock = threading.Lock()
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SQLITE_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def save_reports(self, reports: list[dict[str, Any]], *, source: str) -> float:
        ts = time.time()
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO report_cache (id, fetched_at, source, payload) "
                "VALUES (1, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET fetched_at=excluded.fetched_at, "
                "source=excluded.source, payload=excluded.payload",
                (ts, source, json.dumps(reports)),
            )
        return ts

    def load_reports(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT fetched_at, source, payload FROM report_cache WHERE id = 1"
            ).fetchone()
        if not row:
            return None
        return {
            "fetched_at": row["fetched_at"],
            "source": row["source"],
            "reports": json.loads(row["payload"]),
        }

    def record_notification(
        self, *, trigger: str, channels: list[str], status: str,
        detail: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ts = time.time()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO notifications (created_at, trigger, channels, status, detail) "
                "VALUES (?,?,?,?,?)",
                (ts, trigger, json.dumps(channels), status,
                 json.dumps(detail) if detail is not None else None),
            )
            nid = cur.lastrowid
        return {
            "id": nid, "created_at": ts, "trigger": trigger,
            "channels": channels, "status": status, "detail": detail or {},
        }

    def list_notifications(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["channels"] = json.loads(d["channels"]) if d.get("channels") else []
            d["detail"] = json.loads(d["detail"]) if d.get("detail") else {}
            out.append(d)
        return out

    def describe(self) -> str:
        return "sqlite"


# ---------------------------------------------------------------------------
# Postgres (first-class)
# ---------------------------------------------------------------------------

_PG_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS report_cache (
        id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        fetched_at  DOUBLE PRECISION NOT NULL,
        source      TEXT NOT NULL,
        payload     JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id          BIGSERIAL PRIMARY KEY,
        created_at  DOUBLE PRECISION NOT NULL,
        trigger     TEXT NOT NULL,
        channels    JSONB,
        status      TEXT NOT NULL,
        detail      JSONB
    )
    """,
)


class PostgresStore(Store):
    def __init__(self, dsn: str, *, connect_retries: int = 15, retry_delay: float = 2.0) -> None:
        self._dsn = dsn
        self._retries = connect_retries
        self._delay = retry_delay
        self._pool = None
        self._lock = threading.Lock()

    def _ensure(self):
        """Create + open the pool on first use, retrying while Postgres warms up,
        then apply the schema. Subsequent calls reuse the pool."""
        if self._pool is not None:
            return self._pool
        # Imported lazily so SQLite-only deployments never need psycopg loaded.
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        with self._lock:
            if self._pool is not None:
                return self._pool
            last: Exception | None = None
            for attempt in range(1, self._retries + 1):
                pool = ConnectionPool(
                    self._dsn, min_size=1, max_size=5, open=False,
                    kwargs={"autocommit": True, "row_factory": dict_row},
                )
                try:
                    pool.open(wait=True, timeout=10)
                    with pool.connection() as conn:
                        for ddl in _PG_SCHEMA:
                            conn.execute(ddl)
                    self._pool = pool
                    return pool
                except Exception as exc:  # noqa: BLE001
                    pool.close()
                    last = exc
                    logger.warning(
                        "Postgres not ready (attempt %d/%d): %s",
                        attempt, self._retries, type(exc).__name__,
                    )
                    time.sleep(self._delay)
            raise RuntimeError(
                f"could not connect to Postgres after {self._retries} attempts"
            ) from last

    def save_reports(self, reports: list[dict[str, Any]], *, source: str) -> float:
        from psycopg.types.json import Json

        ts = time.time()
        with self._ensure().connection() as conn:
            conn.execute(
                "INSERT INTO report_cache (id, fetched_at, source, payload) "
                "VALUES (1, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET fetched_at=EXCLUDED.fetched_at, "
                "source=EXCLUDED.source, payload=EXCLUDED.payload",
                (ts, source, Json(reports)),
            )
        return ts

    def load_reports(self) -> dict[str, Any] | None:
        with self._ensure().connection() as conn:
            row = conn.execute(
                "SELECT fetched_at, source, payload FROM report_cache WHERE id = 1"
            ).fetchone()
        if not row:
            return None
        # JSONB decodes to a Python list already.
        return {"fetched_at": row["fetched_at"], "source": row["source"], "reports": row["payload"]}

    def record_notification(
        self, *, trigger: str, channels: list[str], status: str,
        detail: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        from psycopg.types.json import Json

        ts = time.time()
        with self._ensure().connection() as conn:
            row = conn.execute(
                "INSERT INTO notifications (created_at, trigger, channels, status, detail) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (ts, trigger, Json(channels), status,
                 Json(detail) if detail is not None else None),
            ).fetchone()
        return {
            "id": row["id"], "created_at": ts, "trigger": trigger,
            "channels": channels, "status": status, "detail": detail or {},
        }

    def list_notifications(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._ensure().connection() as conn:
            rows = conn.execute(
                "SELECT id, created_at, trigger, channels, status, detail "
                "FROM notifications ORDER BY id DESC LIMIT %s",
                (limit,),
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["channels"] = d.get("channels") or []
            d["detail"] = d.get("detail") or {}
            out.append(d)
        return out

    def describe(self) -> str:
        return "postgres"

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()
            self._pool = None
