from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Isolated, writable DB; force demo mode so no network/secrets are needed.
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "app.db"))
    monkeypatch.setenv("WEB_DIR", str(tmp_path / "web"))  # no build -> placeholder
    with TestClient(create_app()) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_status_demo(client):
    body = client.get("/api/status").json()
    assert body["mode"] == "demo"
    assert body["github"]["auth"] == "demo"


def test_reports_manifest_lists_demo_data(client):
    body = client.get("/api/reports").json()
    assert body["source"] == "demo"
    assert len(body["reports"]) > 0
    # Each entry has a name we can fetch.
    name = body["reports"][0]["name"]
    csv_resp = client.get(f"/api/reports/{name}")
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "," in csv_resp.text  # looks like CSV


def test_unknown_report_404(client):
    assert client.get("/api/reports/does-not-exist.csv").status_code == 404


def test_send_without_channels_is_503(client):
    # No channels configured in demo -> send is unavailable.
    assert client.post("/api/report/send", json={}).status_code == 503


def test_send_invalid_channels_400(client, monkeypatch):
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/x")
    # Rebuild app so it picks up the channel env.
    with TestClient(create_app()) as c:
        assert c.post("/api/report/send", json={"channels": ["bogus"]}).status_code == 400


def test_placeholder_index_when_no_build(client):
    body = client.get("/").json()
    assert body["service"] == "github-usage-dashboard"


def test_post_without_json_content_type_is_415(client):
    # CSRF guard: a non-JSON "simple" POST is rejected before any side effect.
    r = client.post("/api/refresh", content=b"", headers={"content-type": "text/plain"})
    assert r.status_code == 415


def test_status_reports_datastore(client):
    assert client.get("/api/status").json()["database"] == "sqlite"


# -- schedules -------------------------------------------------------------

def test_get_schedules_defaults(client):
    body = client.get("/api/schedules").json()
    assert body["timezone"] == "UTC"
    assert set(body["entries"]) == {"daily", "weekly", "monthly"}
    assert body["entries"]["daily"]["enabled"] is False
    assert body["weekdays"][0] == "mon"
    # Demo has no channels configured.
    assert body["channels_enabled"] == []


def test_put_schedules_requires_json_content_type(client):
    r = client.put("/api/schedules", content=b"{}", headers={"content-type": "text/plain"})
    assert r.status_code == 415


def test_put_schedules_enables_job_and_persists(client):
    payload = {
        "timezone": "UTC",
        "entries": {
            "weekly": {"enabled": True, "hour": 8, "minute": 30, "day_of_week": "tue"},
        },
    }
    r = client.put("/api/schedules", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["entries"]["weekly"]["enabled"] is True
    # A live job now exists with a computed next run.
    weekly = next(j for j in body["jobs"] if j["id"] == "report-weekly")
    assert weekly["next_run"]
    # Persisted: a fresh read returns the same config.
    again = client.get("/api/schedules").json()
    assert again["entries"]["weekly"]["day_of_week"] == "tue"
    # And /api/status reflects the live model.
    status = client.get("/api/status").json()["schedules"]
    assert status["weekly"] == "30 8 * * tue"


def test_put_schedules_validation_error_is_400(client):
    r = client.put("/api/schedules", json={
        "timezone": "UTC",
        "entries": {"daily": {"enabled": True, "hour": 99}},
    })
    assert r.status_code == 400
    assert "hour" in r.json()["detail"]


def test_put_schedules_bad_timezone_is_400(client):
    r = client.put("/api/schedules", json={"timezone": "Mars/Phobos", "entries": {}})
    assert r.status_code == 400
    assert "timezone" in r.json()["detail"]
