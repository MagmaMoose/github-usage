from __future__ import annotations

from app.config import Settings
from app.github.client import GitHubError
from app.reports import ReportService


class _FakeStore:
    """Minimal in-memory store for exercising ReportService logic."""

    def __init__(self, cached=None):
        self._cached = cached

    def load_reports(self):
        return self._cached

    def save_reports(self, reports, *, source):
        self._cached = {"reports": reports, "source": source, "fetched_at": 123.0}
        return 123.0


def _svc(cached=None):
    return ReportService(Settings(), _FakeStore(cached))


async def test_try_permanent_error_is_clean_skip():
    svc = _svc()
    out, transient = [], set()

    async def fn():
        raise GitHubError(404, "not found")

    await svc._try(out, transient, name="r.csv", report_type="usage_report",
                   fn=fn, render=lambda x: "csv")
    assert out == []
    assert transient == set()  # 404 = absent scope, NOT a transient failure


async def test_try_transient_error_records_name():
    svc = _svc()
    out, transient = [], set()

    async def fn():
        raise GitHubError(429, "rate limited")

    await svc._try(out, transient, name="r.csv", report_type="usage_report",
                   fn=fn, render=lambda x: "csv")
    assert out == []
    assert transient == {"r.csv"}


async def test_try_network_error_records_name():
    svc = _svc()
    out, transient = [], set()

    async def fn():
        raise TimeoutError("boom")

    await svc._try(out, transient, name="r.csv", report_type="usage_report",
                   fn=fn, render=lambda x: "csv")
    assert transient == {"r.csv"}


async def test_try_success_appends():
    svc = _svc()
    out, transient = [], set()

    async def fn():
        return {"data": 1}

    await svc._try(out, transient, name="r.csv", report_type="usage_report",
                   fn=fn, render=lambda x: "date,net_amount\n")
    assert transient == set()
    assert out == [{"name": "r.csv", "type": "usage_report", "csv": "date,net_amount\n"}]


def test_merge_prior_keeps_transiently_failed_report():
    prior = {"reports": [
        {"name": "usage.csv", "type": "usage_report", "csv": "OLD-USAGE"},
        {"name": "seats.csv", "type": "copilot_seat_activity", "csv": "OLD-SEATS"},
    ], "source": "live", "fetched_at": 1.0}
    svc = _svc(prior)

    # This pull got seats fresh but usage.csv failed transiently.
    reports = [{"name": "seats.csv", "type": "copilot_seat_activity", "csv": "NEW-SEATS"}]
    svc._merge_prior(reports, {"usage.csv"})

    by_name = {r["name"]: r["csv"] for r in reports}
    assert by_name["seats.csv"] == "NEW-SEATS"      # fresh copy kept
    assert by_name["usage.csv"] == "OLD-USAGE"      # prior copy restored


def test_merge_prior_noop_without_prior_cache():
    svc = _svc(None)
    reports = [{"name": "seats.csv", "type": "copilot_seat_activity", "csv": "NEW"}]
    svc._merge_prior(reports, {"usage.csv"})
    assert reports == [{"name": "seats.csv", "type": "copilot_seat_activity", "csv": "NEW"}]
