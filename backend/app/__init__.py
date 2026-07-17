"""github-usage-dashboard backend.

A single FastAPI process that:
  * fetches GitHub billing usage from a configured org and/or enterprise,
  * renders it into the *native* CSV formats the bundled React SPA already
    parses (so the frontend needs no new data model), and
  * serves that SPA plus a small JSON API, and
  * ships summary reports to Slack / Teams / Email on demand and on a schedule.

Runs with zero secrets in `demo` mode (bundled example CSVs) so `docker compose
up` renders a working dashboard immediately.
"""
