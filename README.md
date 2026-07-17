# GitHub Usage Report Viewer

**Drag, drop, done.** Turn GitHub billing CSVs into interactive dashboards. Everything runs in your browser.

**[→ Try it now](https://austenstone.github.io/github-actions-usage-report/?demo=auto)** · **[Live App](https://austenstone.github.io/github-actions-usage-report/)**

## Supported Reports

Auto-detects the report type from CSV headers. Drop one file or a whole zip.

| Report | What you get |
|---|---|
| **Metered Usage** | Actions minutes, runner SKU breakdown, Copilot seats, Packages, LFS, storage costs |
| **Copilot Premium Requests** | Per-user PRU consumption, model breakdown, quota tracking, AI credit costs |
| **Copilot Token Usage** | Input/output tokens, cache creation/read, per-model cost with token-level granularity |
| **GHAS Active Committers** | Advanced Security license consumption by user and repository |
| **Copilot Seat Activity** | Seat assignment, last activity timestamps, IDE/surface usage breakdown |
| **Dormant Users** | Org member audit with 2FA status, last login, outside collaborator flags |
| **Enterprise Members** | Enterprise licensing, org roles, SAML/GHES status, Visual Studio subscriptions |

## Features

**Charts & Visualization**
- Time series with raw, 7-day rolling average, and cumulative views
- Stacked cost breakdown by top 10 groups (model, user, SKU, org)
- Sankey flow diagrams showing org → user → model relationships
- Token breakdown charts for cache hit analysis
- AI model color-coding (Claude, GPT, Gemini, Grok)

**Data Table**
- Group by any dimension: user, model, org, SKU, cost center, repository
- Sortable columns with visibility controls
- Paginated with virtualized rendering for large datasets

**Filtering & Navigation**
- GitHub-style autocomplete filter bar across any field
- Period selector for monthly or full-range views
- URL-encoded state for every filter, grouping, and view

**Hero Cards**
- At-a-glance KPIs: gross/net spend, total requests, minutes, token counts
- Expandable breakdowns by top models, users, or SKUs

**Multi-Report Support**
- Load multiple CSVs (or zips) and switch between them
- Auto-combines same-type reports from the same enterprise with date range labels
- Duplicate detection via content hashing

**Sharing**
- One-click shareable URLs with compressed filter state + data (LZ-String)
- Falls back to clipboard if URL exceeds 8,000 characters

**Privacy**
- 100% client-side. No server, no uploads, no telemetry
- Reports cached in IndexedDB across sessions
- Sample data auto-removed when real data is imported

## Quick Start

```bash
npm ci
npm run dev
```

Drop a CSV onto the upload area, or append `?demo=auto` to load sample data instantly.

### Where to Get the CSVs

GitHub billing admins can export usage reports from **Settings → Billing → Usage report → Download CSV**. The app auto-detects the report type from headers.

## Tech Stack

| | |
|---|---|
| React 19 + TypeScript | [Primer React](https://primer.style/react) (GitHub's design system) |
| [Highcharts](https://www.highcharts.com/) | [TanStack Table](https://tanstack.com/table) + [Virtual](https://tanstack.com/virtual) |
| Vite | Vitest |

## Scripts

```bash
npm run dev          # Dev server
npm run build        # Type-check + production build
npm run test         # Unit tests
npm run lint         # ESLint
npm run typecheck    # TypeScript (no emit)
```

## Deployment

Pushed to `main` → lint → typecheck → test → build → deployed to [GitHub Pages](https://austenstone.github.io/github-actions-usage-report/) via Actions.

---

## Self-hosted auto-fetch dashboard (Docker + FastAPI)

The static app above is drag-and-drop only. This fork adds an optional **backend**
(`backend/`) that turns it into a long-lived, self-hosted dashboard which
**auto-fetches** GitHub billing usage and can **push scheduled reports** to
Slack, Microsoft Teams, and Email.

```
GitHub billing APIs ──▶ FastAPI backend ──renders native CSVs──▶ the same React dashboard
                             │
                             └──▶ Slack · Teams · Email   (on-demand + daily/weekly/monthly)
```

The backend fetches the enhanced-billing-platform endpoints for a configured
**org and/or enterprise**, renders each response into the *exact native CSV
format* this app already parses, and serves them at `/api/reports`. The SPA loads
them on boot through its normal import pipeline — so every chart, filter, and
table works unchanged. When served statically (GitHub Pages), the API is absent
and the app silently falls back to drag-and-drop.

### Try it locally (no secrets)

```bash
docker compose up --build      # → http://localhost:8000  (demo mode, sample data)
```

### Run against real GitHub

Copy [`.env.example`](.env.example) to `.env`, then set a billing scope and auth:

```bash
GITHUB_ORG=acme-eng                    # and/or GITHUB_ENTERPRISE=acme
GITHUB_APP_ID=...                      # GitHub App auth (default)
GITHUB_APP_INSTALLATION_ID=...
GITHUB_APP_PRIVATE_KEY="$(cat app.pem)"
# For enterprise billing (Apps can't always install on an enterprise) use a PAT:
# GITHUB_TOKEN=github_pat_...           (takes precedence when set)
docker compose up --build
```

### Datastore

The report cache and notification log use **Postgres** (first-class) — set
`DATABASE_URL` (the `docker compose` stack starts one automatically). Caching the
fetched report set with a TTL means browser loads don't re-hit the GitHub API,
and it survives restarts. Without `DATABASE_URL` the app falls back to a
file-backed **SQLite** DB (local/dev only). No Redis: the cache is a single
TTL'd blob on a single-replica app, so it lives in Postgres alongside the log.

### Auto-fetchable reports

| Report | Endpoint | Scope |
|---|---|---|
| Metered Usage | `…/settings/billing/usage` | org + enterprise |
| Copilot Seat Activity | `…/copilot/billing/seats` | org |
| GHAS Active Committers | `…/settings/billing/advanced-security` | org |
| Enterprise Members | `…/consumed-licenses` | enterprise |

Token Usage, Premium Requests, and Dormant Users have no stable public API and
remain drag-and-drop uploads.

### Notifications

Each channel activates only when its config is present. Send **on demand** from
the dashboard toolbar (or `POST /api/report/send`), or on a **schedule**:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TEAMS_WEBHOOK_URL=https://...webhook.office.com/...
SMTP_HOST=smtp.example.com   REPORT_EMAIL_TO=team@example.com
SCHEDULE_DAILY_CRON="0 8 * * *"   SCHEDULE_WEEKLY_CRON="0 9 * * 1"   SCHEDULE_TIMEZONE=Europe/Berlin
```

### API

| Endpoint | Purpose |
|---|---|
| `GET /` | The dashboard SPA |
| `GET /health` | Liveness/readiness probe |
| `GET /api/status` | Mode, scope, channels, schedules, cache age |
| `GET /api/reports` | Manifest of available reports |
| `GET /api/reports/{name}` | One report as native CSV |
| `POST /api/refresh` | Force a fresh GitHub pull |
| `POST /api/report/send` | Send a report now (`{"channels": [...]}` optional) |
| `GET /api/notifications` | Recent delivery log |

### Container image & Kubernetes

`docker-bake.hcl` + the multi-stage `Dockerfile` build a multi-arch image
(Diatreme publishes it to GHCR on release). Deploy in-cluster with the Helm
chart in [`charts/github-usage-dashboard`](charts/github-usage-dashboard) —
single replica, SQLite on a PVC, optional external-secrets + Cloudflare-tunnel
ingress. See the [chart README](charts/github-usage-dashboard/README.md).

### Backend development

```bash
cd backend
pip install -r requirements-dev.txt
ruff check . && pytest                  # lint + tests
uvicorn app.main:create_app --factory --reload --port 8000   # demo mode
```

