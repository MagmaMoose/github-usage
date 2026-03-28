import { useEffect } from 'react';

let initialized = false;

/** Apply the GitHub Highcharts theme using live CSS variable values */
async function initAndApplyTheme() {
  const [{ default: Highcharts }, { buildGitHubChartTheme }] = await Promise.all([
    import('highcharts'),
    import('../../lib/chart-theme'),
  ]);

  // Allow data: URIs in Highcharts HTML labels (AST sanitizer blocks them by default)
  if (!Highcharts.AST.allowedReferences.includes('data:')) {
    Highcharts.AST.allowedReferences.push('data:');
  }

  const theme = buildGitHubChartTheme();
  Highcharts.setOptions(theme);

  // Disable animations globally for snappy filter/page transitions
  Highcharts.setOptions({
    chart: { animation: false },
    plotOptions: { series: { animation: false } },
  });

  // Re-apply visual styles (colors, backgrounds) to existing charts
  // without clobbering per-chart options like title, series, etc.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { title: _t, subtitle: _s, series: _sr, ...safeTheme } = theme;
  Highcharts.charts.forEach((chart) => {
    if (chart) {
      chart.update(safeTheme, true, true);
    }
  });
}

/** Initialize Highcharts with GitHub theme + accessibility module.
 *  Also watches for color scheme changes and re-applies the theme. */
export function useHighchartsInit() {
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      initAndApplyTheme();
    }

    // Watch for OS color scheme changes (light ↔ dark)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Small delay to let Primer's theme CSS vars update first
      setTimeout(() => { initAndApplyTheme(); }, 50);
    };
    mediaQuery.addEventListener('change', handleChange);

    // Also watch for Primer's data-color-mode attribute changes
    const observer = new MutationObserver(() => {
      setTimeout(() => { initAndApplyTheme(); }, 50);
    });
    const primerRoot = document.querySelector('[data-color-mode]');
    if (primerRoot) {
      observer.observe(primerRoot, { attributes: true, attributeFilter: ['data-color-mode', 'data-light-theme', 'data-dark-theme'] });
    }

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      observer.disconnect();
    };
  }, []);
}
