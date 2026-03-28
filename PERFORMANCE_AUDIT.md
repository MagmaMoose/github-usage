# TBB Performance Audit

**Date:** March 28, 2026
**Tool:** Chrome DevTools MCP (Lighthouse + Performance Trace)
**Device:** Desktop

## Audit 1: Empty State (No Data Loaded)

**URL:** `http://localhost:5174/tbb/?period=2026-02`

### Lighthouse Scores

| Category | Score |
|----------|-------|
| Accessibility | ✅ 100 |
| Best Practices | ⚠️ 96 |
| SEO | ✅ 100 |

### Failed Audit: `errors-in-console`

```
ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before.
```

React strict mode double-render issue in `main.tsx`. Likely calling `createRoot()` twice due to HMR or Vite's dev server re-executing the module. Non-critical in production but drops Best Practices to 96.

### Core Web Vitals (Lab)

| Metric | Value | Verdict |
|--------|-------|---------|
| LCP | 491ms | 🟢 Good |
| CLS | 0.00 | 🟢 Perfect |
| TTFB | 4ms | 🟢 Excellent (localhost) |

### LCP Breakdown

| Phase | Duration | % of LCP |
|-------|----------|----------|
| TTFB | 4ms | 0.8% |
| Render Delay | 487ms | 99.2% |

The LCP element is text (`<p>` tag), not an image. 99% of the LCP time is render delay caused by the JS/CSS waterfall blocking first paint.

### Critical Rendering Path (6 levels deep)

```
index.html (11ms)
 └─ main.tsx (13ms)
     └─ App.tsx (21ms)
         └─ ReportPageLayout.tsx (42ms)
             └─ TimeSeriesChart.tsx (96ms)
                 └─ highcharts.js (160ms) ← longest chain endpoint
```

**Max critical path latency: 160ms** on localhost.

## Audit 2: Loaded State (Data with Charts)

**URL:** `http://localhost:5174/tbb/?groupBy=sku&period=2026-02`
**Data:** 30,541 rows across 22 SKU groups (Feb 1 to Mar 28, 2026)

### Lighthouse Scores

| Category | Score | Delta vs Empty |
|----------|-------|----------------|
| Accessibility | ⚠️ 98 | ↓2 |
| Best Practices | ⚠️ 96 | — |
| SEO | ✅ 100 | — |

### Failed Audits

1. **`errors-in-console`** (same as empty state)
2. **`heading-order`** (NEW): `<h3>` used for hero cards ("Gross amount", "Net amount", etc.) directly after `<h1>` "Usage Report", skipping `<h2>`. Accessibility issue: heading levels should descend sequentially.

### Core Web Vitals (Lab)

| Metric | Value | Delta vs Empty | Verdict |
|--------|-------|----------------|---------|
| LCP | 660ms | ↑169ms (+34%) | 🟡 Slower |
| CLS | 0.01 | ↑0.01 | 🟢 Still good |
| TTFB | 6ms | ↑2ms | 🟢 Fine |
| FCP | 620ms | N/A (new) | 🟡 Moderate |

### LCP Breakdown

| Phase | Duration | % of LCP |
|-------|----------|----------|
| TTFB | 6ms | 0.9% |
| Render Delay | 654ms | 99.1% |

LCP element: `<span>` in ActionList sidebar (Primer React component). Still text, not an image. The 654ms render delay is the cost of parsing CSVs, computing aggregations, and rendering 4 Highcharts instances.

### 🚨 Critical: Forced Reflows from Highcharts (256ms total)

Highcharts is causing **256ms of forced synchronous layout** during chart rendering. The biggest offenders:

| Function | Time | Source |
|----------|------|--------|
| `getStyle()` | 151ms | `highcharts.js:1755` |
| `t()` (layout calc) | 60ms | `highcharts.js:292` |
| `offset()` | 50ms | `highcharts.js:351` |
| `getContainer()` | 36ms | `highcharts.js:6432` |
| `getBBox()` | 34ms | `highcharts.js:1706` |
| `f()` | 25ms | `highcharts.js:2469` |
| `updateTransform()` | 17ms | `highcharts.js:2941` |
| `htmlGetBBox()` | 10ms | `highcharts.js:2898` |

This is Highcharts measuring SVG element dimensions (getBBox, getStyle, offset) which forces the browser to do synchronous layout. Each chart instance triggers this. With 4 charts on the page, it compounds.

### DOM & Memory Profile

| Metric | Value |
|--------|-------|
| Total DOM nodes | 992 (after scroll) |
| SVG elements | 559 (56% of DOM!) |
| Highcharts instances | 4 |
| SVG paths | 318 |
| SVG rects | 39 |
| Stylesheets loaded | 117 |
| JS heap memory | 92 MB |
| Page height | 2,148px (2.3 viewports) |

**56% of the DOM is SVG elements from Highcharts.** This is the primary contributor to layout/style recalculation costs.

### Style Recalculation

One large style recalculation event: **60ms affecting 309 elements.** Triggered during chart rendering.

### Critical Path Changed: Google Fonts is the Bottleneck

```
index.html (240ms)
 └─ fonts.googleapis.com/css2 (237ms)
     └─ fonts.gstatic.com/.../inter.woff2 (1,389ms) ← NEW longest chain!
```

**Max critical path latency: 1,389ms** (vs 160ms in empty state). The font file download became the longest chain because the loaded state takes longer, giving more time for the font waterfall to become visible in the trace.

### Layout Shifts

CLS score: 0.01 (within "good" threshold of ≤0.1). One layout shift cluster at 3,073ms, no identified root cause. Likely triggered by chart rendering completing after initial paint.

### Missing Character Set Header

Vite dev server doesn't set `charset=utf-8` in the `Content-Type` HTTP header. The `<meta charset="UTF-8">` tag exists in `index.html` (line 4), so this is a dev-only issue. Non-issue in production if hosting sets the header.

## Shared Findings (Both States)

### CSS Request Explosion

**117 stylesheets** loaded, including **103+ individual CSS files** from `@primer/react/dist/`. Primer React uses granular per-component CSS files, all loaded eagerly.

Fine in dev (Vite serves individually with HMR), but worth verifying the production build bundles them properly.

### Heaviest Dependencies (Dev Bundles)

| File | Size |
|------|------|
| `client-rRt5c1ua.js` (React DOM internals) | 802 KB |
| `@primer_react.js` | 703 KB |
| `@primer_octicons-react.js` | 496 KB |
| `highcharts.js` | 365 KB |
| `SkeletonText-DzI7JYx5.js` | 305 KB |
| `@primer_react_experimental.js` | 117 KB |
| `@tanstack/react-table.js` | 116 KB |
| `fflate.js` | 61 KB |
| **Total** | **~3+ MB** |

### Third Parties

Google Fonts (`Inter`): 10 KB CSS transfer, render-blocking. The `.woff2` font file download can take up to 1,389ms and dominates the critical path.

### Document Latency

Server responded quickly, no redirects. **Compression was not applied** (Vite dev default).

## Prioritized Action Plan

### P0: Fix Heading Order (a11y)

Hero cards use `<h3>` directly after `<h1>`, skipping `<h2>`. Either change to `<h2>` or restructure the heading hierarchy. Restores Accessibility to 100.

### P1: Fix the `createRoot()` Bug

Guard against double-invocation in `main.tsx`. Cleans up the console error, gets Best Practices to 100.

### P2: Reduce Highcharts Forced Reflows (256ms)

This is the biggest runtime performance issue. Options:
- Render charts in a `requestAnimationFrame` or `requestIdleCallback` to avoid blocking the main thread
- Use `chart.reflow()` sparingly and batch DOM reads/writes
- Consider setting explicit chart dimensions (`width`/`height` in options) to avoid Highcharts measuring container size
- Lazy render below-the-fold charts (the Sankey and second time series chart) with IntersectionObserver

### P3: Lazy Load Chart Dependencies

`highcharts.js` (365 KB) + `highcharts/modules/sankey` (23 KB) sit at the end of the critical rendering path. Charts are only needed when data is loaded. `LazyChart.tsx` exists but chart components still eagerly import Highcharts.

### P4: Self-Host Google Fonts

Google Fonts is the #1 critical path bottleneck at **1,389ms**. The waterfall is: HTML → Google CSS → Google WOFF2 (3 hops). Self-hosting the Inter font eliminates 2 network hops and removes the render-blocking external CSS.

### P5: Audit Primer React Imports

703 KB for `@primer_react.js` + 496 KB for octicons. 117 stylesheets is excessive. Check barrel imports (`import { Button } from '@primer/react'`) vs. deep imports. Verify tree-shaking actually works in production.

### P6: Lazy Load File Processing Libs

`fflate` (61 KB), `lz-string` (14 KB), `papaparse` (25 KB) are only needed when a user drops a file or shares a URL. Dynamic `import()` on demand.

### P7: Virtualize SVG Elements

56% of the DOM (559 elements) is SVG from Highcharts. For charts with many data points, consider:
- Enabling Highcharts boost module for large datasets
- Using `turboThreshold` to limit rendered points
- Lazy rendering below-the-fold charts with IntersectionObserver

### P8: Production Build Audit

Run `npx vite build --report` to analyze actual production bundle sizes. Dev-mode numbers are inflated. Key questions: does tree-shaking eliminate unused Primer components? Are the 117 CSS files bundled?

### P9: Enable Compression

Document response had no compression. For production, ensure gzip/brotli is enabled on hosting (automatic on Vercel/GitHub Pages).
