import { useEffect } from 'react';
import Highcharts from 'highcharts';
import { buildGitHubChartTheme } from '../../lib/chart-theme';

/** Apply the GitHub Highcharts theme using live CSS variable values */
function applyTheme() {
  Highcharts.setOptions(buildGitHubChartTheme());
  // Re-render all active charts so they pick up the new theme colors
  Highcharts.charts.forEach((chart) => {
    if (chart) {
      chart.update(buildGitHubChartTheme(), true, true);
    }
  });
}

/** Initialize Highcharts with GitHub theme + accessibility module.
 *  Also watches for color scheme changes and re-applies the theme. */
export function useHighchartsInit() {
  useEffect(() => {
    // Load accessibility module
    import('highcharts/modules/accessibility').then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const init = (mod as any).default ?? mod;
      if (typeof init === 'function') init(Highcharts);
    });

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
