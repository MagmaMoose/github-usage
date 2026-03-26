import { useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { ToggleSwitch } from '@primer/react';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { humanizeColumn } from '../../lib/formatters';
import { GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import type { AnyReportRow } from '../../lib/types';

/** Compute a moving average — uses expanding window for early points so there's no gap */
function rollingAverage(data: number[], window: number): number[] {
  return data.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += data[j];
    return sum / (i - start + 1);
  });
}

export function TimeSeriesChart() {
  const { activeReport, groupByColumn, timeBucket, visibleRows } = useReport();
  const [showRollingAvg, setShowRollingAvg] = useState(false);

  // Window size adapts to the bucket granularity
  const rollingWindow = timeBucket === 'daily' ? 7 : timeBucket === 'weekly' ? 4 : 3;

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

    const series: Highcharts.SeriesOptionsType[] = [];

    for (let i = 0; i < topGroups.length; i++) {
      const group = topGroups[i];
      const color = GITHUB_COLORS_RESOLVED[i % GITHUB_COLORS_RESOLVED.length];

      const data = categories.map((bucketKey) => {
        const bucketRowsForKey = buckets.get(bucketKey) ?? [];
        const groupRows = bucketRowsForKey.filter(
          (r) => String(r[groupByColumn as keyof AnyReportRow]) === group.key,
        );
        return sumBy(groupRows, 'grossAmount' as keyof AnyReportRow & string);
      });

      if (showRollingAvg) {
        // Rolling average as the primary line
        series.push({
          type: 'line' as const,
          name: `${group.key || '(empty)'}`,
          data: rollingAverage(data, rollingWindow),
          color,
          lineWidth: 2.5,
          marker: { enabled: false },
          tooltip: {
            valuePrefix: '$',
            valueDecimals: 2,
          },
        });
      } else {
        series.push({
          type: 'line' as const,
          name: group.key || '(empty)',
          data,
          color,
        });
      }
    }

    const windowLabel =
      timeBucket === 'daily'
        ? '7-day'
        : timeBucket === 'weekly'
          ? '4-week'
          : '3-month';

    return {
      title: {
        text: showRollingAvg
          ? `Spend over time by ${humanizeColumn(groupByColumn)} (${windowLabel} avg, top 10)`
          : `Spend over time by ${humanizeColumn(groupByColumn)} (top 10)`,
      },
      xAxis: { categories, crosshair: true },
      yAxis: {
        title: { text: 'Spend ($)' },
        labels: { format: '${value}' },
      },
      series,
      chart: { height: 400 },
    };
  }, [activeReport, groupByColumn, timeBucket, visibleRows, showRollingAvg, rollingWindow]);

  if (!options) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--fgColor-muted, #656d76)' }}>Rolling avg</span>
        <ToggleSwitch
          size="small"
          checked={showRollingAvg}
          onClick={() => setShowRollingAvg((v) => !v)}
          aria-labelledby="rolling-avg-label"
        />
      </div>
      <HighchartsReact key={showRollingAvg ? 'avg' : 'raw'} highcharts={Highcharts} options={options} />
    </div>
  );
}
