import { useEffect } from 'react';
import Highcharts from 'highcharts';
import { buildGitHubChartTheme } from '../../lib/chart-theme';

/** Apply the GitHub Highcharts theme using live CSS variable values */
function applyTheme() {
  const theme = buildGitHubChartTheme();
  Highcharts.setOptions(theme);

  // Re-apply visual styles (colors, backgrounds) to existing charts
  // without clobbering per-chart options like title, series, etc.
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
    // Apply theme initially
    applyTheme();

    // Watch for OS color scheme changes (light ↔ dark)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Small delay to let Primer's theme CSS vars update first
      setTimeout(applyTheme, 50);
    };
    mediaQuery.addEventListener('change', handleChange);

    // Also watch for Primer's data-color-mode attribute changes
    const observer = new MutationObserver(() => {
      setTimeout(applyTheme, 50);
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
