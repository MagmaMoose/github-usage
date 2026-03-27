import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { buildColorMap } from '../../lib/chart-theme';
import { formatDisplayValue, bucketKeyToTimestamp } from '../../lib/formatters';
import type { AnyReportRow } from '../../lib/types';
import styles from './Charts.module.css';

export function CostBreakdownChart({ stackField = 'model' }: { stackField?: string }) {
  const { activeReport, timeBucket, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];

    // Find top groups by total spend across all buckets
    const stackGroups = groupBy(rows, stackField as keyof AnyReportRow & string);
    const rankedGroups = [...stackGroups.entries()]
      .map(([group, groupRows]) => ({ group, total: sumBy(groupRows, 'grossAmount' as keyof AnyReportRow & string) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const colorMap = buildColorMap(rankedGroups.map((g) => g.group));

    const series: Highcharts.SeriesOptionsType[] = rankedGroups.map((groupInfo) => {
      const data = categories.map((bucketKey) => {
        const bucketRowList = buckets.get(bucketKey) ?? [];
        const matchingRows = bucketRowList.filter((r) => String(r[stackField as keyof AnyReportRow]) === groupInfo.group);
        return [bucketKeyToTimestamp(bucketKey), Math.round(sumBy(matchingRows, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100] as [number, number];
      });

      return {
        type: 'column' as const,
        name: formatDisplayValue(groupInfo.group, stackField) || '(empty)',
        data,
        color: colorMap.get(groupInfo.group) ?? '#808fa3',
      };
    });

    return {
      chart: { type: 'column', height: 350 },
      title: { text: undefined },
      xAxis: { type: 'datetime', crosshair: true },
      yAxis: {
        title: { text: 'Amount ($)' },
        labels: { format: '${value}' },
      },
      tooltip: {
        shared: false,
        headerFormat: '<table style="min-width: 120px;"><tr><th colspan="2" style="color: var(--fgColor-muted, #59636e); font-weight: 600; padding-bottom: 2px; font-size: 12px;">{point.key}</th></tr>',
        pointFormat: '<tr><td><span style="color:{point.color}">●</span> {series.name}:&nbsp;</td><td style="text-align: right;"><b>${point.y:.2f}</b></td></tr>',
        footerFormat: '<tr style="border-top: 1px solid var(--borderColor-muted, #d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align: right;"><b>${point.total:.2f}</b></td></tr></table>',
      },
      plotOptions: { column: { stacking: 'normal' } },
      series,
    };
  }, [activeReport, timeBucket, visibleRows]);

  if (!options) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>Cost over Time</h3>
      </div>
      <HighchartsReact highcharts={Highcharts} options={options} immutable />
    </div>
  );
}
