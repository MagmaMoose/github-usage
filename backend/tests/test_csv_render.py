"""The renderers must produce CSVs whose headers match the SPA's detection
signatures (src/lib/csv-parser.ts HEADER_SIGNATURES). If these break, the
frontend silently fails to detect the auto-fetched report."""

from __future__ import annotations

import csv
import io

from app.github import csv_render

# Mirror of the frontend's HEADER_SIGNATURES (lowercased tokens that must all
# be present for the SPA to detect each report type).
SIGNATURES = {
    "usage_report": ["repository", "workflow_path"],
    "copilot_seat_activity": [
        "report time", "last authenticated at", "last activity at", "last surface used",
    ],
    "ghas_active_committers": [
        "user login", "organization / repository", "last pushed date",
    ],
    "enterprise_members": [
        "github com login", "license type", "github com enterprise roles",
        "total user accounts",
    ],
}


def _headers(csv_text: str) -> list[str]:
    reader = csv.reader(io.StringIO(csv_text))
    return [h.strip().lower() for h in next(reader)]


def _rows(csv_text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(csv_text)))


def test_usage_headers_and_values():
    items = [{
        "date": "2026-03-01", "product": "actions", "sku": "Actions Linux",
        "quantity": 120, "unitType": "minutes", "pricePerUnit": 0.008,
        "grossAmount": 0.96, "discountAmount": 0.0, "netAmount": 0.96,
        "organizationName": "acme-eng", "repositoryName": "acme-eng/web",
    }]
    out = csv_render.render_usage(items, default_org="acme-eng")
    headers = _headers(out)
    assert all(sig in headers for sig in SIGNATURES["usage_report"])
    row = _rows(out)[0]
    assert row["net_amount"] == "0.96"
    assert row["organization"] == "acme-eng"
    assert row["repository"] == "acme-eng/web"
    assert row["applied_cost_per_quantity"] == "0.008"


def test_usage_empty_is_header_only():
    out = csv_render.render_usage([])
    assert all(sig in _headers(out) for sig in SIGNATURES["usage_report"])
    assert _rows(out) == []


def test_usage_normalizes_titlecase_api_values_to_csv_vocabulary():
    # The REST API returns Title-Case product/sku with spaces; the SPA exact-
    # matches the lowercase snake_case CSV vocabulary (product==='actions',
    # sku 'actions_linux', unit 'gigabyte-hours').
    items = [
        {"date": "2026-03-01", "product": "Actions", "sku": "Actions Linux",
         "quantity": 10, "unitType": "minutes", "netAmount": 1.0, "organizationName": "acme"},
        {"date": "2026-03-01", "product": "Git LFS", "sku": "Git LFS Storage",
         "quantity": 5, "unitType": "Gigabyte Hours", "netAmount": 2.0, "organizationName": "acme"},
    ]
    rows = _rows(csv_render.render_usage(items, default_org="acme"))
    assert rows[0]["product"] == "actions"
    assert rows[0]["sku"] == "actions_linux"
    assert rows[0]["unit_type"] == "minutes"
    assert rows[1]["product"] == "git_lfs"
    assert rows[1]["sku"] == "git_lfs_storage"
    assert rows[1]["unit_type"] == "gigabyte-hours"  # unit types keep hyphens


def test_usage_normalization_is_idempotent_for_already_lowercase():
    items = [{"date": "2026-03-01", "product": "actions", "sku": "actions_storage",
              "quantity": 1, "unitType": "gigabyte-hours", "netAmount": 1.0}]
    row = _rows(csv_render.render_usage(items))[0]
    assert row["product"] == "actions"
    assert row["sku"] == "actions_storage"
    assert row["unit_type"] == "gigabyte-hours"


def test_copilot_seats_headers_and_values():
    seats = [{
        "assignee": {"login": "octocat"},
        "created_at": "2026-01-01T00:00:00Z",
        "last_activity_at": "2026-03-10T09:00:00Z",
        "last_activity_editor": "vscode/1.0",
    }]
    out = csv_render.render_copilot_seats(seats, org="acme-eng", report_time="2026-03-11T00:00:00Z")
    assert all(sig in _headers(out) for sig in SIGNATURES["copilot_seat_activity"])
    row = _rows(out)[0]
    assert row["Login"] == "octocat"
    assert row["Last Activity At"] == "2026-03-10T09:00:00Z"
    assert row["Last Surface Used"] == "vscode/1.0"
    assert row["Organization"] == "acme-eng"
    # The seats API has no auth timestamp — don't fabricate one.
    assert row["Last Authenticated At"] == ""


def test_ghas_committers_one_row_per_pair():
    payload = {"repositories": [{
        "name": "web",
        "advanced_security_committers_breakdown": [
            {"user_login": "alice", "last_pushed_date": "2026-03-01", "last_pushed_email": "a@x.com"},
            {"user_login": "bob", "last_pushed_date": "2026-03-02", "last_pushed_email": "b@x.com"},
        ],
    }]}
    out = csv_render.render_ghas(payload, org="acme-eng")
    assert all(sig in _headers(out) for sig in SIGNATURES["ghas_active_committers"])
    rows = _rows(out)
    assert len(rows) == 2
    assert rows[0]["Organization / repository"] == "acme-eng/web"
    assert rows[0]["User login"] == "alice"


def test_ghas_full_name_not_double_prefixed():
    payload = {"repositories": [{
        "name": "acme-eng/web",
        "advanced_security_committers_breakdown": [
            {"user_login": "alice", "last_pushed_date": "2026-03-01", "last_pushed_email": "a@x.com"},
        ],
    }]}
    out = csv_render.render_ghas(payload, org="acme-eng")
    assert _rows(out)[0]["Organization / repository"] == "acme-eng/web"


def test_consumed_licenses_headers_and_lists():
    users = [{
        "github_com_login": "octocat",
        "github_com_name": "Octo Cat",
        "license_type": "enterprise",
        "github_com_enterprise_roles": ["owner", "member"],
        "github_com_two_factor_auth": True,
        "total_user_accounts": 1,
    }]
    out = csv_render.render_consumed_licenses(users)
    headers = _headers(out)
    assert all(sig in headers for sig in SIGNATURES["enterprise_members"])
    row = _rows(out)[0]
    assert row["GitHub com login"] == "octocat"
    assert row["GitHub com enterprise roles"] == "owner, member"
    assert row["GitHub com two factor auth"] == "true"
