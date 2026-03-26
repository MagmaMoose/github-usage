import Highcharts from 'highcharts';

/**
 * GitHub's internal Highcharts theme — adapted from github/github-ui chart-card.
 *
 * CSS var() strings DON'T work in Highcharts because it renders to SVG attributes,
 * not CSS properties. We resolve vars at runtime by reading computed styles from the DOM.
 */

/** Resolved fallback colors for Highcharts (used in chart components for series colors) */
export const GITHUB_COLORS_RESOLVED = [
  '#006edb', '#30a147', '#eb670f', '#ce2c85', '#b88700',
  '#df0c24', '#894ceb', '#9d615c', '#179b9b', '#808fa3',
  '#d43511', '#527a29', '#a830e8', '#167e53', '#866e04',
  '#64762d', '#856d4c',
];

/**
 * Brand base colors for AI model families used in GitHub Copilot.
 * Each brand gets a base hue, then individual models are shaded via Highcharts.color().
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

// Track how many models we've seen per brand family so we can shade each one differently
const brandCounters = new Map<string, number>();

/**
 * Get a branded, uniquely-shaded color for a model name.
 * Models in the same family (e.g. all Claude variants) get the same base hue
 * but are brightened/darkened so each variant is visually distinct.
 */
export function getModelColor(modelName: string, index: number): string {
  const lower = modelName.toLowerCase();

  for (const { match, base } of MODEL_BRAND_BASES) {
    if (lower.includes(match)) {
      const count = brandCounters.get(match) ?? 0;
      brandCounters.set(match, count + 1);

      // Spread shades from -0.15 (darker) to +0.25 (lighter) across variants
      const brightenAmount = -0.15 + count * 0.10;
      return Highcharts.color(base).brighten(brightenAmount).get() as string;
    }
  }

  return GITHUB_COLORS_RESOLVED[index % GITHUB_COLORS_RESOLVED.length];
}

/** Reset brand shade counters (call before building a new chart) */
export function resetModelColors(): void {
  brandCounters.clear();
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
export function buildGitHubChartTheme(): Highcharts.Options {
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
      text: undefined,
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
      align: 'left',
      verticalAlign: 'top',
      x: -8,
      y: -12,
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
