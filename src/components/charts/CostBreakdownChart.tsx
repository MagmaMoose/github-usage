import { useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { ActionList, ActionMenu } from '@primer/react';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { buildColorMap } from '../../lib/chart-theme';
import { formatDisplayValue, formatCompact, bucketKeyToTimestamp, getSkuIconSvg } from '../../lib/formatters';
import type { MetricOption } from '../../lib/report-schema';
import type { AnyReportRow, BillingRow } from '../../lib/types';
import styles from './Charts.module.css';

interface CostBreakdownChartProps {
  stackField?: string;
  metricOptions?: MetricOption[];
}

export function CostBreakdownChart({ stackField = 'model', metricOptions }: CostBreakdownChartProps) {
  const { activeReport, timeBucket, visibleRows } = useReport();

  const resolvedMetrics = metricOptions ?? [{ key: 'grossAmount', label: 'Spend', isCurrency: true }];
  const showMetricToggle = resolvedMetrics.length > 1;
  const [metricKey, setMetricKey] = useState('grossAmount');
  const effectiveMetricKey = resolvedMetrics.some((m) => m.key === metricKey) ? metricKey : resolvedMetrics[0].key;
  const activeMetric = resolvedMetrics.find((m) => m.key === effectiveMetricKey) ?? resolvedMetrics[0];
  const dataField = activeMetric.valueField ?? activeMetric.key;

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const allRows = visibleRows as BillingRow[];
    const rows = activeMetric.rowFilter
      ? allRows.filter((r) => activeMetric.rowFilter!(r as unknown as Record<string, unknown>))
      : allRows;
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];

    // Find top groups by total metric across all buckets
    const stackGroups = groupBy(rows, stackField as keyof AnyReportRow & string);
    const rankedGroups = [...stackGroups.entries()]
      .map(([group, groupRows]) => ({ group, total: sumBy(groupRows, dataField as keyof AnyReportRow & string) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const colorMap = buildColorMap(rankedGroups.map((g) => g.group), stackField === 'model');

    const series: Highcharts.SeriesOptionsType[] = rankedGroups.map((groupInfo) => {
      const data = categories.map((bucketKey) => {
        const bucketRowList = buckets.get(bucketKey) ?? [];
        const matchingRows = bucketRowList.filter((r) => String(r[stackField as keyof AnyReportRow]) === groupInfo.group);
        return [bucketKeyToTimestamp(bucketKey), Math.round(sumBy(matchingRows, dataField as keyof AnyReportRow & string) * 100) / 100] as [number, number];
      });

      const seriesColor = colorMap.get(groupInfo.group) ?? '#808fa3';
      return {
        type: 'column' as const,
        name: stackField === 'sku'
          ? `<span style="display:flex;align-items:center;gap:4px">${getSkuIconSvg(groupInfo.group, seriesColor)}${formatDisplayValue(groupInfo.group, stackField) || ' '}</span>`
          : formatDisplayValue(groupInfo.group, stackField) || ' ',
        data,
        color: seriesColor,
      };
    });

    return {
      chart: { type: 'column', height: 350 },
      title: { text: undefined },
      xAxis: { type: 'datetime', crosshair: true },
      yAxis: {
        title: { text: activeMetric.isCurrency ? 'Amount ($)' : activeMetric.label },
        labels: activeMetric.isCurrency
          ? { format: '${value}' }
          : {
              formatter: function (this: Highcharts.AxisLabelsFormatterContextObject) {
                return formatCompact(this.value as number);
              },
            },
      },
      tooltip: {
        shared: false,
        headerFormat: '<table style="min-width: 120px;"><tr><th colspan="2" style="color: var(--fgColor-muted, #59636e); font-weight: 600; padding-bottom: 2px; font-size: 12px;">{point.key}</th></tr>',
        pointFormat: activeMetric.isCurrency
          ? '<tr><td><span style="color:{point.color}">●</span> {series.name}:&nbsp;</td><td style="text-align: right;"><b>${point.y:.2f}</b></td></tr>'
          : '<tr><td><span style="color:{point.color}">●</span> {series.name}:&nbsp;</td><td style="text-align: right;"><b>{point.y:,.0f}</b></td></tr>',
        footerFormat: activeMetric.isCurrency
          ? '<tr style="border-top: 1px solid var(--borderColor-muted, #d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align: right;"><b>${point.total:.2f}</b></td></tr></table>'
          : '<tr style="border-top: 1px solid var(--borderColor-muted, #d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align: right;"><b>{point.total:,.0f}</b></td></tr></table>',
      },
      plotOptions: { column: { stacking: 'normal' } },
      ...(stackField === 'sku' && { legend: { symbolWidth: 0, symbolHeight: 0, symbolPadding: 0 } }),
      series,
    };
  }, [activeReport, timeBucket, visibleRows, stackField, activeMetric, dataField]);

  if (!options) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{activeMetric.label} over Time</h3>
        {showMetricToggle && (
          <div className={styles.chartControls}>
            <ActionMenu>
              <ActionMenu.Button size="small">{activeMetric.label}</ActionMenu.Button>
              <ActionMenu.Overlay>
                <ActionList selectionVariant="single">
                  {resolvedMetrics.map((opt) => (
                    <ActionList.Item
                      key={opt.key}
                      selected={effectiveMetricKey === opt.key}
                      onSelect={() => setMetricKey(opt.key)}
                    >
                      {opt.label}
                    </ActionList.Item>
                  ))}
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          </div>
        )}
      </div>
      <HighchartsReact key={effectiveMetricKey} highcharts={Highcharts} options={options} />
    </div>
  );
}
