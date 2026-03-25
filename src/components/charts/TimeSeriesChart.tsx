import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { humanizeColumn } from '../../lib/formatters';
import { GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import type { AnyReportRow } from '../../lib/types';

export function TimeSeriesChart() {
  const { activeReport, groupByColumn, timeBucket, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    const groups = groupBy(rows, groupByColumn as keyof AnyReportRow & string);

    // Top 10 groups by total gross
    const topGroups = [...groups.entries()]
      .map(([key, groupRows]) => ({
        key,
        total: sumBy(groupRows, 'grossAmount' as keyof AnyReportRow & string),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Get all time buckets sorted
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];

    const series: Highcharts.SeriesOptionsType[] = topGroups.map((group, i) => {
      const data = categories.map((bucketKey) => {
        const bucketRowsForKey = buckets.get(bucketKey) ?? [];
        const groupRows = bucketRowsForKey.filter(
          (r) => String(r[groupByColumn as keyof AnyReportRow]) === group.key,
        );
        return sumBy(groupRows, 'grossAmount' as keyof AnyReportRow & string);
      });

      return {
        type: 'line' as const,
        name: group.key || '(empty)',
        data,
        color: GITHUB_COLORS_RESOLVED[i % GITHUB_COLORS_RESOLVED.length],
      };
    });

    return {
      title: { text: `Spend over time by ${humanizeColumn(groupByColumn)} (top 10)` },
      xAxis: { categories, crosshair: true },
      yAxis: {
        title: { text: 'Spend ($)' },
        labels: { format: '${value}' },
      },
      series,
      chart: { height: 400 },
    };
  }, [activeReport, groupByColumn, timeBucket, visibleRows]);

  if (!options) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
