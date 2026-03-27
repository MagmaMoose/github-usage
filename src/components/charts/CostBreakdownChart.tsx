import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { buildColorMap } from '../../lib/chart-theme';
import { formatDisplayValue, bucketKeyToTimestamp } from '../../lib/formatters';
import type { AnyReportRow } from '../../lib/types';

export function CostBreakdownChart() {
  const { activeReport, timeBucket, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];

    // Find top models by total spend across all buckets
    const modelGroups = groupBy(rows, 'model' as keyof AnyReportRow & string);
    const rankedModels = [...modelGroups.entries()]
      .map(([model, modelRows]) => ({ model, total: sumBy(modelRows, 'grossAmount' as keyof AnyReportRow & string) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const colorMap = buildColorMap(rankedModels.map((m) => m.model));

    const series: Highcharts.SeriesOptionsType[] = rankedModels.map((modelInfo) => {
      const data = categories.map((bucketKey) => {
        const bucketRowList = buckets.get(bucketKey) ?? [];
        const modelRows = bucketRowList.filter((r) => String(r['model' as keyof AnyReportRow]) === modelInfo.model);
        return [bucketKeyToTimestamp(bucketKey), Math.round(sumBy(modelRows, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100] as [number, number];
      });

      return {
        type: 'column' as const,
        name: formatDisplayValue(modelInfo.model, 'model') || '(empty)',
        data,
        color: colorMap.get(modelInfo.model) ?? '#808fa3',
      };
    });

    return {
      chart: { type: 'column', height: 350 },
      title: { text: 'Cost over Time' },
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

  return <HighchartsReact highcharts={Highcharts} options={options} immutable />;
}
