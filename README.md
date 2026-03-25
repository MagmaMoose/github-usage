# Copilot Usage Viewer

Static React + Vite app for exploring Copilot usage CSV exports.

## Local dev

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## GitHub Pages

This repo is configured for GitHub Pages deployment via GitHub Actions.

- Production URL: [https://austenstone.github.io/tbb/](https://austenstone.github.io/tbb/)
- Vite base path: `/tbb/`
- Deploy workflow: `.github/workflows/deploy.yml`
- CI workflow: `.github/workflows/ci.yml`

### First-time setup

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Make sure the default branch is `main`.
4. Push to `main` to trigger the Pages deployment.

### Notes

- If the repo name changes, update `base` in `vite.config.ts`.
- Deployments to Pages only run from `main`.
- Branch pushes and PRs still run CI without publishing.
