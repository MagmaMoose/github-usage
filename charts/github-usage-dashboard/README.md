# github-usage-dashboard (Helm chart)

Deploys the [github-usage-dashboard](https://github.com/magmamoose/github-usage):
a single FastAPI process that auto-fetches GitHub billing usage, serves the
interactive dashboard SPA, and delivers Slack / Teams / Email reports on a
schedule or on demand.

## Design constraints

- **Single replica.** One writer for the datastore. The chart pins `replicas: 1`
  with a `Recreate` strategy — do not scale it up.
- **Postgres first-class.** The report cache + notification log use Postgres (set
  the `DATABASE_URL` secret). SQLite on a PVC is the fallback when no DSN is set.
- **Non-secret vs secret split.** Org/enterprise slugs, App ID, schedules, and
  SMTP host/user go in a ConfigMap. `DATABASE_URL`, the App private key, any PAT,
  webhook URLs, and the SMTP password come from a Secret (external-secrets, an
  existing Secret, or chart-managed for dev).

## Datastore (Postgres)

Point at any reachable Postgres via a `DATABASE_URL` DSN. It's a secret, so
provide it the same way as the others (recommended: external-secrets):

```yaml
externalSecret:
  enabled: true
  data:
    - secretKey: DATABASE_URL
      remoteRef: { key: github-usage-database-url }
persistence:
  enabled: false   # PVC not needed when using Postgres
```

Or for dev, inline it (chart-managed Secret): `--set database.url=postgresql://...`.
Without any `DATABASE_URL`, the app uses the SQLite PVC fallback.

## Quick start

```bash
helm install usage ./charts/github-usage-dashboard \
  --namespace github-usage --create-namespace \
  --set github.org=acme-eng \
  --set github.appId=123456 \
  --set github.installationId=987654 \
  --set externalSecret.enabled=true
```

Then port-forward or enable the ingress:

```bash
kubectl -n github-usage port-forward svc/usage-github-usage-dashboard 8000:8000
```

## Auth

Default is a **GitHub App** (`github.appId` + `github.installationId` +
`GITHUB_APP_PRIVATE_KEY` secret). For **enterprise** billing — where Apps can't
always be installed — supply a read-only PAT as the `GITHUB_TOKEN` secret
instead (it takes precedence when set).

## Secrets

Pick one source (see `values.yaml`):

| Source | How |
| --- | --- |
| external-secrets (recommended) | `externalSecret.enabled=true` + `externalSecret.data` mapping store keys → env var names |
| Existing Secret | `secrets.existingSecretName=my-secret` |
| Chart-managed (dev) | `secrets.create=true` + `secrets.data.{KEY}` |

Recognised keys: `GITHUB_APP_PRIVATE_KEY`, `GITHUB_TOKEN`, `SLACK_WEBHOOK_URL`,
`TEAMS_WEBHOOK_URL`, `SMTP_PASSWORD`.

## Ingress (Cloudflare tunnel pattern)

The magmamoose stack terminates the hostname at a cloudflared tunnel and lets
external-dns publish the record. Enable a DNS-only ingress:

```yaml
ingress:
  enabled: true
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "usage.magmamoose.com"
    external-dns.alpha.kubernetes.io/target: "<tunnel-id>.cfargotunnel.com"
    external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"
  hosts:
    - host: usage.magmamoose.com
      paths: [{ path: /, pathType: Prefix }]
config:
  publicUrl: "https://usage.magmamoose.com"
```

Put a Cloudflare Access policy on the hostname — the dashboard has no built-in auth.

## Scheduled reports

Schedules are configured **in the dashboard** — the gear button opens the
"Scheduled reports" editor where you turn daily / weekly / monthly delivery on or
off, pick the time, weekday / day-of-month, timezone, and which channels each
schedule targets. Edits are persisted in the datastore and take effect
immediately (no redeploy).

The `schedule` values below only **seed** the initial config on a fresh
database, so a GitOps deploy can ship a sensible default; after first boot the
in-app configuration is authoritative.

```yaml
schedule:
  daily: "0 8 * * *"      # 08:00 every day
  weekly: "0 9 * * 1"     # 09:00 Mondays
  monthly: "0 7 1 * *"    # 07:00 on the 1st
  timezone: "Europe/Berlin"
notifications:
  email:
    smtpHost: smtp.example.com
    from: usage-bot@example.com
    to: [team@example.com]
```

Slack/Teams webhooks + the SMTP password come from the Secret. A channel is
active only when its config is present — a schedule can only deliver to channels
that are configured.

## Values

See [`values.yaml`](values.yaml) for the full, commented list.
