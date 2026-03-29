/**
 * GitHub's internal Highcharts theme — adapted from github/github-ui chart-card.
 *
 * CSS var() strings DON'T work in Highcharts because it renders to SVG attributes,
 * not CSS properties. We resolve vars at runtime by reading computed styles from the DOM.
 *
 * NOTE: No top-level `import Highcharts` here! chart-theme is imported by ReportTable
 * for getModelIconUrl(). Pulling in Highcharts (365 KB) eagerly for a helper that
 * doesn't need it would bloat the initial bundle.
 */

/** Brighten a hex color by a factor (-1 to 1). Positive = lighter, negative = darker. */
function brightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c + 255 * amount)));
  return `#${adjust(r).toString(16).padStart(2, '0')}${adjust(g).toString(16).padStart(2, '0')}${adjust(b).toString(16).padStart(2, '0')}`;
}

/** Resolved fallback colors for Highcharts (used in chart components for series colors) */
export const GITHUB_COLORS_RESOLVED = [
  '#006edb', '#30a147', '#eb670f', '#ce2c85', '#b88700',
  '#df0c24', '#894ceb', '#9d615c', '#179b9b', '#808fa3',
  '#d43511', '#527a29', '#a830e8', '#167e53', '#866e04',
  '#64762d', '#856d4c',
];

/**
 * Brand base colors for AI model families used in GitHub Copilot.
 * Each brand gets a base hue, then individual models within a ranked list
 * are shaded via brightenHex() based on their position among siblings.
 */
const MODEL_BRAND_BASES: Array<{ match: string; base: string }> = [
  // Anthropic Claude — terracotta
  { match: 'claude',        base: '#D97757' },
  // OpenAI GPT — green
  { match: 'gpt',           base: '#10A37F' },
  // Google Gemini — blue
  { match: 'gemini',        base: '#4285F4' },
  // OpenAI o-series reasoning
  { match: 'o1',            base: '#0D8C6D' },
  { match: 'o3',            base: '#0D8C6D' },
  { match: 'o4',            base: '#0D8C6D' },
  // GitHub internal
  { match: 'code review',   base: '#8250df' },
  { match: 'coding agent',  base: '#6639ba' },
  { match: 'copilot',       base: '#8250df' },
];

/**
 * Get the brand base color for a model name, or null if no brand matches.
 * Only AI model families get branded colors.
 */
function getBrandBase(name: string): { match: string; base: string } | null {
  const lower = name.toLowerCase();
  for (const brand of MODEL_BRAND_BASES) {
    if (lower.includes(brand.match)) return brand;
  }
  return null;
}

/**
 * Assign branded, deterministic colors for an ordered list of model/group names.
 * Models in the same brand family get the same base hue, shaded by their
 * position among siblings in the list. Non-matching names fall back to the
 * GitHub data-viz palette. Returns a Map<name, color>.
 *
 * @param names - ordered list of series names
 * @param useBranding - when true, apply model/SKU brand colors. When false, use
 *   the standard differentiation palette for all series. Defaults to true for
 *   backward compat but charts should pass false for non-model/SKU groupings.
 */
export function buildColorMap(names: string[], useBranding = true): Map<string, string> {
  const colorMap = new Map<string, string>();

  if (!useBranding) {
    for (let i = 0; i < names.length; i++) {
      colorMap.set(names[i], GITHUB_COLORS_RESOLVED[i % GITHUB_COLORS_RESOLVED.length]);
    }
    return colorMap;
  }

  // Count how many siblings each brand key has seen so far
  const brandCounters = new Map<string, number>();
  let fallbackIndex = 0;

  for (const name of names) {
    const brand = getBrandBase(name);
    if (brand) {
      const count = brandCounters.get(brand.match) ?? 0;
      brandCounters.set(brand.match, count + 1);
      const brightenAmount = -0.15 + count * 0.10;
      colorMap.set(name, brightenHex(brand.base, brightenAmount));
    } else {
      colorMap.set(name, GITHUB_COLORS_RESOLVED[fallbackIndex % GITHUB_COLORS_RESOLVED.length]);
      fallbackIndex++;
    }
  }

  return colorMap;
}

/**
 * Model brand icon mapping — Simple Icons CDN for most providers,
 * local SVGs for OpenAI (not available on Simple Icons).
 */
type IconEntry = { match: string; url: string };

/** Inline data-URI builder for OpenAI logo SVG (avoids SPA router intercepting static file requests) */
function openAiDataUri(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MODEL_BRAND_ICONS: IconEntry[] = [
  { match: 'claude',        url: 'https://cdn.simpleicons.org/anthropic/D97757' },
  { match: 'gpt',           url: openAiDataUri('#10A37F') },
  { match: 'o1',            url: openAiDataUri('#0D8C6D') },
  { match: 'o3',            url: openAiDataUri('#0D8C6D') },
  { match: 'o4',            url: openAiDataUri('#0D8C6D') },
  { match: 'gemini',        url: 'https://cdn.simpleicons.org/googlegemini/4285F4' },
  { match: 'code review',   url: 'https://cdn.simpleicons.org/githubcopilot/8250df' },
  { match: 'coding agent',  url: 'https://cdn.simpleicons.org/githubcopilot/6639ba' },
  { match: 'copilot',       url: 'https://cdn.simpleicons.org/githubcopilot/8534F3' },
];

const FALLBACK_ICON_URL = 'https://cdn.simpleicons.org/github/8b949e';

/** Get a branded SVG icon URL for a model name, tinted with the brand color */
export function getModelIconUrl(modelName: string): string {
  const lower = modelName.toLowerCase();
  for (const { match, url } of MODEL_BRAND_ICONS) {
    if (lower.includes(match)) {
      return url;
    }
  }
  return FALLBACK_ICON_URL;
}

/** Read a CSS custom property value from the Primer theme root, with fallback */
function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const primerRoot = document.querySelector('[data-color-mode]');
  if (!primerRoot) return fallback;
  const value = getComputedStyle(primerRoot).getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolve all data visualization colors from the current theme */
function resolveDataColors(): string[] {
  const colorNames = [
    'blue', 'green', 'orange', 'pink', 'yellow',
    'red', 'purple', 'auburn', 'teal', 'gray',
    'coral', 'lime', 'plum', 'pine', 'lemon',
    'olive', 'brown',
  ];
  return colorNames.map((name, i) =>
    getCSSVar(`--data-${name}-color-emphasis`, GITHUB_COLORS_RESOLVED[i]),
  );
}

/** Build the Highcharts theme using live CSS variable values from the current Primer theme */
export function buildGitHubChartTheme(): Record<string, unknown> {
  const bgDefault = getCSSVar('--bgColor-default', '#ffffff');
  const fgDefault = getCSSVar('--fgColor-default', '#1f2328');
  const fgMuted = getCSSVar('--fgColor-muted', '#656d76');
  const borderMuted = getCSSVar('--borderColor-muted', '#d1d9e080');
  const borderDefault = getCSSVar('--borderColor-default', '#d1d9e0');
  const colors = resolveDataColors();

  const fontFamily =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  return {
    colors,
    credits: { enabled: false },
    accessibility: { enabled: false },
    chart: {
      animation: false,
      spacing: [8, 0, 8, 0],
      backgroundColor: bgDefault,
      style: {
        fontFamily,
        fontSize: '12px',
        color: fgDefault,
      },
    },
    title: {
      align: 'left',
      style: { color: fgDefault, fontSize: '16px', fontWeight: '600' },
    },
    caption: {
      align: 'left',
      style: { color: fgMuted },
      verticalAlign: 'top',
    },
    tooltip: {
      backgroundColor: bgDefault,
      borderRadius: 8,
      borderColor: borderMuted,
      borderWidth: 1,
      shape: 'rect',
      padding: 10,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        opacity: 0.04,
        width: 4,
        color: '#1f232826',
      },
      style: {
        color: fgDefault,
        fontFamily,
        fontSize: '12px',
      },
      useHTML: true,
      headerFormat:
        `<table style="min-width: 120px;"><tr><th colspan="2" style="color: ${fgMuted}; font-weight: 600; padding-bottom: 2px; font-size: 12px;">{point.key}</th></tr>`,
      pointFormat:
        `<tr><td style="padding-top: 4px; color: ${fgMuted};">` +
        '<span style="color:{point.color}; font-size: 16px;">●</span> {series.name}</td>' +
        '<td style="text-align: right; padding-top: 4px; padding-left: 12px;">' +
        '<strong>{point.y}</strong></td></tr>',
      footerFormat: '</table>',
    },
    legend: {
      itemStyle: {
        fontSize: '12px',
        fontFamily,
        color: fgDefault,
        fontWeight: '400',
      },
      itemHoverStyle: { color: fgDefault },
      useHTML: true,
      align: 'left',
      verticalAlign: 'top',
      x: -8,
      y: -12,
      maxHeight: 120,
      navigation: {
        activeColor: fgDefault,
        inactiveColor: fgMuted,
        style: { fontFamily, fontSize: '11px' },
      },
    },
    navigation: { buttonOptions: { enabled: false } },
    exporting: { fallbackToExportServer: false },
    plotOptions: {
      series: { animation: { duration: 300 } },
      line: { lineWidth: 2, marker: { enabled: false, radius: 3 } },
      area: { fillOpacity: 0.15, lineWidth: 2, marker: { enabled: false } },
      bar: { borderWidth: 0, borderRadius: 3 },
      column: { borderWidth: 0, borderRadius: 3 },
    },
    xAxis: {
      tickWidth: 0,
      lineWidth: 1,
      gridLineColor: borderMuted,
      gridLineDashStyle: 'Dash',
      lineColor: borderDefault,
      labels: { style: { color: fgMuted, fontSize: '11px' } },
      title: { style: { color: fgMuted, fontSize: '12px' } },
    },
    yAxis: {
      tickWidth: 0,
      lineWidth: 0,
      gridLineColor: borderMuted,
      gridLineDashStyle: 'Dash',
      lineColor: borderDefault,
      labels: { style: { color: fgMuted, fontSize: '11px' } },
      title: { style: { color: fgMuted, fontSize: '12px' } },
    },
  };
}
