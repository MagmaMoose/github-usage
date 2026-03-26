# TBB — Token-Based Billing Report Explorer

> Drag-and-drop a GitHub billing CSV and instantly visualize Copilot spend, premium request usage, and token consumption — all client-side.

**[→ Live App](https://austenstone.github.io/tbb/)**

## What It Does

TBB parses GitHub's billing CSV exports and turns them into interactive dashboards. No backend, no uploads to a server — everything stays in your browser.

### Supported Reports

| Report Type | CSV Columns You'll See |
|---|---|
| **Premium Request Usage** | Per-user PRU consumption, model breakdown, AI credit costs |
| **Token Usage** | Input/output tokens, cache creation/read, per-model costs |
| **General Usage** | Actions minutes, Copilot seats, LFS, Packages |

### Features

- 📊 **Interactive Charts** — Spend over time, model breakdown (stacked bar), cost trends with rolling averages. Powered by Highcharts.
- 📋 **Grouped Data Table** — Group by user, model, organization, SKU, cost center, or repository. Paginated, sortable, with column visibility controls.
- 🔍 **Filter Bar** — GitHub-style autocomplete filtering across any dimension. Combine multiple filters.
- 📅 **Period Selector** — Filter to a specific month or view all data.
- 🎨 **AI Model Branding** — Automatic color-coding and icons for Claude, GPT, Gemini, and other models.
- 🔗 **Linked Entities** — Usernames, orgs, and repos link directly to their GitHub profiles/pages.
- 🏷️ **Human-Readable Names** — Raw SKU codes like `copilot_premium_request` display as "Copilot PRUs".
- 🌙 **Light/Dark Mode** — System-aware with manual toggle. Persisted across sessions.
- 💾 **Local Persistence** — Reports cached in localStorage. Reload the page and your data is still there.
- 🔒 **Client-Side Only** — Zero data leaves your browser. No telemetry, no server calls.
- 🚫 **Duplicate Detection** — Same file content won't be added twice (FNV-1a hash dedup).
- 📥 **Multi-File Support** — Load multiple reports and switch between them via tabs.

## Getting Started

```bash
npm ci
npm run dev
```

Then drag a billing CSV onto the upload area or click to browse.

### Where to Get the CSVs

GitHub billing admins can export usage reports from **Settings → Billing → Usage report → Download**. The app auto-detects the report type from the CSV headers.

## Tech Stack

| | |
|---|---|
| **Framework** | React 19 + TypeScript |
| **UI** | [Primer React](https://primer.style/react) (GitHub's design system) |
| **Charts** | [Highcharts](https://www.highcharts.com/) |
| **Table** | [TanStack Table](https://tanstack.com/table) + [TanStack Virtual](https://tanstack.com/virtual) |
| **Build** | Vite |
| **Testing** | Vitest |
| **Deploy** | GitHub Pages via Actions |

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Type-check + build for production
npm run test         # Run unit tests
npm run lint         # ESLint
npm run typecheck    # TypeScript check (no emit)
```

## Deployment

Deployed to GitHub Pages at [`austenstone.github.io/tbb`](https://austenstone.github.io/tbb/) via the `.github/workflows/deploy.yml` workflow on push to `main`.
