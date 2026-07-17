# syntax=docker/dockerfile:1
#
# Two-stage build:
#   1. `web`     — build the React/Vite SPA (served at "/").
#   2. `runtime` — Python/FastAPI that serves that SPA + the /api backend.
#
# Diatreme (the org release action) auto-detects this Dockerfile + docker-bake.hcl
# and builds/pushes the multi-arch image to GHCR on PR and release.

# ---------- 1. build the SPA ----------
FROM node:22-slim AS web
WORKDIR /web

# Install deps against the lockfile first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build with base path "/" (the backend serves the SPA at the domain root,
# unlike the GitHub Pages deploy which uses /<repo>/).
COPY . .
ENV BASE_PATH=/
RUN npm run build

# ---------- 2. runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend code, the bundled demo CSVs, and the built SPA.
COPY backend/app /app/app
COPY examples /app/demo-data
COPY --from=web /web/dist /app/web

# Non-root runtime user, pinned to uid/gid 1000 so it matches the Helm chart's
# securityContext (runAsUser/runAsGroup/fsGroup: 1000). The SQLite cache/log DB
# lives on a PVC at /var/lib/github-usage (see the Helm chart).
RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/app \
       --shell /usr/sbin/nologin app \
    && mkdir -p /var/lib/github-usage \
    && chown -R app:app /var/lib/github-usage /home/app /app

USER app
ENV PYTHONPATH=/app \
    HOME=/home/app \
    WEB_DIR=/app/web \
    DEMO_DATA_DIR=/app/demo-data \
    DB_PATH=/var/lib/github-usage/app.db

EXPOSE 8000

# Liveness for local `docker run`; k8s uses the Deployment probes instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
