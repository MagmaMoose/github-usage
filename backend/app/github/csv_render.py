"""Render GitHub billing API payloads into the *native* CSV formats the SPA's
`detectReportType` recognises.

The frontend lowercases + trims headers and keys detection off specific header
sets (see src/lib/csv-parser.ts `HEADER_SIGNATURES`). We therefore reproduce the
exact header rows GitHub's own CSV exports use — that's what makes an auto-fetched
report indistinguishable from a hand-uploaded one, with zero frontend changes.

Every renderer returns a complete CSV string (header + rows). An empty item list
still yields a header-only CSV, which the SPA detects as the right (empty) report.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

# --- header rows (must match src/lib/csv-parser.ts signatures verbatim) ------

USAGE_HEADER = [
    "date", "product", "sku", "quantity", "unit_type",
    "applied_cost_per_quantity", "gross_amount", "discount_amount", "net_amount",
    "username", "organization", "repository", "workflow_path", "cost_center_name",
]

SEAT_ACTIVITY_HEADER = [
    "Report Time", "Login", "Last Authenticated At",
    "Last Activity At", "Last Surface Used", "Organization",
]

GHAS_HEADER = [
    "User login", "Organization / repository", "Last pushed date", "Last pushed email",
]

# Full enterprise-members export header (subset is enough for detection, but we
# emit the whole thing so every column the SPA might read is present).
ENTERPRISE_MEMBERS_HEADER = [
    "GitHub com login", "GitHub com name", "Enterprise server user ids",
    "GitHub com user", "Enterprise server user", "Visual studio subscription user",
    "License type", "GitHub com profile", "GitHub com member roles",
    "GitHub com enterprise roles", "GitHub com verified domain emails",
    "GitHub com saml name", "GitHub com orgs with pending invites",
    "GitHub com two factor auth", "GitHub com two factor auth required by date",
    "GitHub com advanced security license user", "Enterprise server primary emails",
    "Enterprise server advanced security user ids", "Visual studio license status",
    "Visual studio subscription email", "Total user accounts",
]


def _write(header: list[str], rows: Iterable[list[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if c is None else c for c in row])
    return buf.getvalue()


def _first(d: dict, *keys: str, default: Any = "") -> Any:
    """First present, non-None value among alternate key spellings."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _join(value: Any) -> str:
    """A list field -> comma-joined string; scalars pass through."""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return "" if value is None else str(value)


def _bool_str(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value) if value is not None else ""


def _norm_token(value: Any, sep: str = "_") -> str:
    """Normalize a GitHub REST value to the CSV-export vocabulary the SPA parses.

    The enhanced-billing REST API returns product/sku Title-Cased with spaces
    (e.g. "Actions", "Actions Linux"), but the SPA was built for GitHub's CSV
    export, which uses lowercase tokens ("actions", "actions_linux"; unit types
    like "gigabyte-hours" use hyphens). Exact-match logic in the frontend
    (product==='actions', ACTIONS_STORAGE_SKUS, metric filters) depends on this.
    Idempotent for already-normalized values.
    """
    if value is None or value == "":
        return ""
    return str(value).strip().lower().replace(" ", sep)


# --- Metered Usage -----------------------------------------------------------

def render_usage(items: list[dict], *, default_org: str = "") -> str:
    """Enhanced-billing-platform usage items -> the Metered Usage CSV.

    The API omits actor/workflow, so `username` and `workflow_path` are empty —
    the SPA tolerates empty columns and still charts cost/quantity by product,
    SKU, org and repo.
    """
    rows = []
    for it in items:
        org = _first(it, "organizationName", "organization", "org", default=default_org)
        rows.append([
            _first(it, "date"),
            # product/sku/unit_type -> the SPA's lowercase CSV vocabulary.
            # (product/sku join words with "_"; unit types use "-".)
            _norm_token(_first(it, "product"), "_"),
            _norm_token(_first(it, "sku"), "_"),
            _first(it, "quantity", default=0),
            _norm_token(_first(it, "unitType", "unit_type"), "-"),
            _first(it, "pricePerUnit", "applied_cost_per_quantity", default=0),
            _first(it, "grossAmount", "gross_amount", default=0),
            _first(it, "discountAmount", "discount_amount", default=0),
            _first(it, "netAmount", "net_amount", default=0),
            _first(it, "username", "actor", default=""),
            org,
            _first(it, "repositoryName", "repository", default=""),
            _first(it, "workflowPath", "workflow_path", default=""),
            _first(it, "costCenterName", "cost_center_name", default=""),
        ])
    return _write(USAGE_HEADER, rows)


# --- Copilot Seat Activity ---------------------------------------------------

def render_copilot_seats(seats: list[dict], *, org: str = "", report_time: str | None = None) -> str:
    """`/copilot/billing/seats` -> the Copilot Seat Activity CSV."""
    now = report_time or datetime.now(UTC).isoformat()
    rows = []
    for s in seats:
        assignee = s.get("assignee") or {}
        login = assignee.get("login", "") if isinstance(assignee, dict) else ""
        seat_org = org
        if not seat_org and isinstance(s.get("organization"), dict):
            seat_org = s["organization"].get("login", "")
        rows.append([
            now,
            login,
            # "Last Authenticated At": the seats API has no authentication
            # timestamp, so leave it blank rather than aliasing activity/created.
            "",
            _first(s, "last_activity_at", default=""),
            _first(s, "last_activity_editor", default=""),
            seat_org,
        ])
    return _write(SEAT_ACTIVITY_HEADER, rows)


# --- GHAS Active Committers --------------------------------------------------

def render_ghas(payload: dict, *, org: str = "") -> str:
    """`/settings/billing/advanced-security` -> the GHAS Active Committers CSV.

    One row per (repository, committer) from each repo's
    `advanced_security_committers_breakdown`.
    """
    rows = []
    for repo in payload.get("repositories", []) or []:
        repo_name = repo.get("name", "")
        # `name` may be bare ("repo") or "org/repo"; normalise to "org/repo".
        org_repo = repo_name if "/" in repo_name else f"{org}/{repo_name}".strip("/")
        breakdown = repo.get("advanced_security_committers_breakdown") or []
        if not breakdown:
            continue
        for c in breakdown:
            rows.append([
                _first(c, "user_login", "login", default=""),
                org_repo,
                _first(c, "last_pushed_date", default=""),
                _first(c, "last_pushed_email", default=""),
            ])
    return _write(GHAS_HEADER, rows)


# --- Enterprise Members (consumed licenses) ----------------------------------

def render_consumed_licenses(users: list[dict]) -> str:
    """`/consumed-licenses` -> the Enterprise Members CSV."""
    rows = []
    for u in users:
        rows.append([
            _first(u, "github_com_login", default=""),
            _first(u, "github_com_name", default=""),
            _join(_first(u, "enterprise_server_user_ids", default=[])),
            _bool_str(_first(u, "github_com_user", default=False)),
            _bool_str(_first(u, "enterprise_server_user", default=False)),
            _bool_str(_first(u, "visual_studio_subscription_user", default=False)),
            _first(u, "license_type", default=""),
            _first(u, "github_com_profile", default=""),
            _join(_first(u, "github_com_member_roles", default=[])),
            _join(_first(u, "github_com_enterprise_roles", default=[])),
            _join(_first(u, "github_com_verified_domain_emails", default=[])),
            _first(u, "github_com_saml_name_id", "github_com_saml_name", default=""),
            _join(_first(u, "github_com_orgs_with_pending_invites", default=[])),
            _bool_str(_first(u, "github_com_two_factor_auth", default=False)),
            _first(u, "github_com_two_factor_auth_required_by_date", default=""),
            _bool_str(_first(u, "github_com_advanced_security_license_user", default=False)),
            _join(_first(u, "enterprise_server_primary_emails", default=[])),
            _join(_first(u, "enterprise_server_advanced_security_user_ids", default=[])),
            _first(u, "visual_studio_license_status", default=""),
            _first(u, "visual_studio_subscription_email", default=""),
            _first(u, "total_user_accounts", default=1),
        ])
    return _write(ENTERPRISE_MEMBERS_HEADER, rows)
