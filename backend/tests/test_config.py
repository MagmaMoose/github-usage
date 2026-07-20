from __future__ import annotations

import pytest

from app.config import load_settings


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in list(__import__("os").environ):
        if key.startswith(("GITHUB_", "SLACK_", "TEAMS_", "SMTP_", "REPORT_", "SCHEDULE_", "APP_MODE")):
            monkeypatch.delenv(key, raising=False)


def test_defaults_to_demo_without_creds():
    assert load_settings().mode == "demo"


def test_currency_defaults_to_usd():
    assert load_settings().currency == "USD"


def test_currency_from_env_is_upper_cased(monkeypatch):
    monkeypatch.setenv("REPORT_CURRENCY", "eur")
    assert load_settings().currency == "EUR"


def test_live_when_org_and_token(monkeypatch):
    monkeypatch.setenv("GITHUB_ORG", "acme")
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_x")
    s = load_settings()
    assert s.mode == "live"
    assert s.github.has_pat and s.github.has_auth
    assert s.github.org == "acme"


def test_pat_takes_precedence_over_app(monkeypatch):
    monkeypatch.setenv("GITHUB_ENTERPRISE", "acme-ent")
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_x")
    monkeypatch.setenv("GITHUB_APP_ID", "123")
    from app.github.auth import PatProvider, build_token_provider

    provider = build_token_provider(load_settings().github)
    assert isinstance(provider, PatProvider)


def test_app_auth_requires_all_three(monkeypatch):
    monkeypatch.setenv("GITHUB_ORG", "acme")
    monkeypatch.setenv("GITHUB_APP_ID", "123")
    monkeypatch.setenv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN-----\\nkey\\n-----END-----")
    # installation id missing -> not usable, so mode falls back to demo
    assert load_settings().mode == "demo"
    monkeypatch.setenv("GITHUB_APP_INSTALLATION_ID", "999")
    s = load_settings()
    assert s.mode == "live"
    assert s.github.has_app_auth
    # literal \n in the key is normalised to real newlines
    assert "\n" in s.github.app_private_key


def test_channel_enabled_flags(monkeypatch):
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/x")
    monkeypatch.setenv("SMTP_HOST", "smtp.x")
    monkeypatch.setenv("REPORT_EMAIL_FROM", "a@x.com")
    monkeypatch.setenv("REPORT_EMAIL_TO", "b@x.com, c@x.com; d@x.com")
    n = load_settings().notify
    assert n.slack_enabled
    assert not n.teams_enabled
    assert n.email_enabled
    assert n.email_to == ["b@x.com", "c@x.com", "d@x.com"]
    assert set(n.enabled_channels()) == {"slack", "email"}


def test_schedule_parsing(monkeypatch):
    monkeypatch.setenv("SCHEDULE_DAILY_CRON", "0 8 * * *")
    monkeypatch.setenv("SCHEDULE_TIMEZONE", "Europe/Berlin")
    sch = load_settings().schedule
    assert sch.daily_cron == "0 8 * * *"
    assert sch.any_enabled
    assert sch.timezone == "Europe/Berlin"
