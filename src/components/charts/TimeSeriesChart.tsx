import { useCallback, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { ActionList, ActionMenu, SegmentedControl } from '@primer/react';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import { humanizeColumn, formatDisplayValue, formatCompact, bucketKeyToTimestamp } from '../../lib/formatters';
import { buildColorMap } from '../../lib/chart-theme';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../../lib/local-storage';
import { REPORT_TYPES } from '../../lib/types';
import type { AnyReportRow } from '../../lib/types';
import styles from './Charts.module.css';

const LINE_MODES = ['raw', 'rolling', 'cumulative'] as const;
type LineMode = (typeof LINE_MODES)[number];

const LINE_MODE_LABELS: Record<LineMode, string> = {
  raw: 'Raw',
  rolling: 'Rolling Avg',
  cumulative: 'Cumulative',
};

const METRIC_OPTIONS = [
  { key: 'grossAmount', label: 'Spend', isCurrency: true },
  { key: 'totalInputTokens', label: 'Input Tokens', isCurrency: false },
  { key: 'totalOutputTokens', label: 'Output Tokens', isCurrency: false },
  { key: 'totalCacheCreationTokens', label: 'Cache Creation', isCurrency: false },
  { key: 'totalCacheReadTokens', label: 'Cache Reads', isCurrency: false },
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number]['key'];

/** Compute a moving average with expanding window for early points */
function rollingAverage(data: number[], window: number): number[] {
  return data.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += data[j];
    return sum / (i - start + 1);
  });
}

/** Compute cumulative (running) sum */
function cumulativeSum(data: number[]): number[] {
  let total = 0;
  return data.map((v) => {
    total += v;
    return total;
  });
}

function isValidLineMode(value: unknown): value is LineMode {
  return typeof value === 'string' && LINE_MODES.includes(value as LineMode);
}

export function TimeSeriesChart() {
  const { activeReport, activeReportType, groupByColumn, timeBucket, visibleRows } = useReport();
  const isTokenReport = activeReportType === REPORT_TYPES.TOKEN_USAGE;

  const [lineMode, setLineModeRaw] = useState<LineMode>(() => {
    // Migrate old boolean rolling-avg preference
    const stored = getStoredValue<unknown>(STORAGE_KEYS.LINE_MODE, null);
    if (isValidLineMode(stored)) return stored;
    const legacyRolling = getStoredValue(STORAGE_KEYS.ROLLING_AVG, false);
    return legacyRolling ? 'rolling' : 'cumulative';
  });

  const setLineMode = useCallback((mode: LineMode) => {
    setLineModeRaw(mode);
    setStoredValue(STORAGE_KEYS.LINE_MODE, mode);
  }, []);

  const [metricKey, setMetricKeyRaw] = useState<MetricKey>('grossAmount');
  // Reset to spend when switching away from token reports
  const effectiveMetricKey = isTokenReport ? metricKey : 'grossAmount';
  const activeMetric = METRIC_OPTIONS.find((m) => m.key === effectiveMetricKey) ?? METRIC_OPTIONS[0];
  const setMetricKey = useCallback((key: MetricKey) => setMetricKeyRaw(key), []);

  // Window size adapts to the bucket granularity
  const rollingWindow = timeBucket === 'daily' ? 7 : timeBucket === 'weekly' ? 4 : 3;

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    const groups = groupBy(rows, groupByColumn as keyof AnyReportRow & string);

    // Top 10 groups by total metric
    const topGroups = [...groups.entries()]
      .map(([key, groupRows]) => ({
        key,
        total: sumBy(groupRows, effectiveMetricKey as keyof AnyReportRow & string),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Get all time buckets sorted
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];
    const timestamps = categories.map(bucketKeyToTimestamp);

    // Build a deterministic color map from the ranked group names
    const colorMap = buildColorMap(topGroups.map((g) => g.key));
    const series: Highcharts.SeriesOptionsType[] = [];

    for (let i = 0; i < topGroups.length; i++) {
      const group = topGroups[i];
      const color = colorMap.get(group.key) ?? '#808fa3';

      const rawData = categories.map((bucketKey) => {
        const bucketRowsForKey = buckets.get(bucketKey) ?? [];
        const groupRows = bucketRowsForKey.filter(
          (r) => String(r[groupByColumn as keyof AnyReportRow]) === group.key,
        );
        return sumBy(groupRows, effectiveMetricKey as keyof AnyReportRow & string);
      });

      let chartData: number[];
      let smoothed = false;

      switch (lineMode) {
        case 'rolling':
          chartData = rollingAverage(rawData, rollingWindow);
          smoothed = true;
          break;
        case 'cumulative':
          chartData = cumulativeSum(rawData);
          smoothed = true;
          break;
        default:
          chartData = rawData;
          break;
      }

      series.push({
        type: 'line' as const,
        name: formatDisplayValue(group.key, groupByColumn) || '(empty)',
        data: timestamps.map((t, j) => [t, chartData[j]] as [number, number]),
        color,
        ...(smoothed && {
          lineWidth: 2.5,
          marker: { enabled: false },
        }),
        tooltip: activeMetric.isCurrency
          ? { valuePrefix: '$', valueDecimals: 2 }
          : {
              pointFormatter: function (this: Highcharts.Point) {
                return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${formatCompact(this.y ?? 0)}</b><br/>`;
              },
            },
      });
    }

    const windowLabel =
      timeBucket === 'daily'
        ? '7-day'
        : timeBucket === 'weekly'
          ? '4-week'
          : '3-month';

    const yAxisTitle = activeMetric.isCurrency
      ? lineMode === 'cumulative' ? 'Cumulative Spend ($)' : 'Spend ($)'
      : lineMode === 'cumulative' ? `Cumulative ${activeMetric.label}` : activeMetric.label;

    return {
      title: { text: undefined },
      xAxis: { type: 'datetime', crosshair: true },
      yAxis: {
        title: { text: yAxisTitle },
        labels: activeMetric.isCurrency
          ? { format: '${value}' }
          : {
              formatter: function (this: Highcharts.AxisLabelsFormatterContextObject) {
                return formatCompact(this.value as number);
              },
            },
      },
      series,
      chart: { height: 400 },
    };
  }, [activeReport, groupByColumn, timeBucket, visibleRows, lineMode, rollingWindow, effectiveMetricKey, activeMetric]);

  const windowLabel =
    timeBucket === 'daily'
      ? '7-day'
      : timeBucket === 'weekly'
        ? '4-week'
        : '3-month';

  const metricLabel = activeMetric.isCurrency ? 'Spend' : activeMetric.label;
  const titleMap: Record<LineMode, string> = {
    raw: `${metricLabel} over time by ${humanizeColumn(groupByColumn)} (top 10)`,
    rolling: `${metricLabel} over time by ${humanizeColumn(groupByColumn)} (${windowLabel} avg, top 10)`,
    cumulative: `Cumulative ${metricLabel.toLowerCase()} by ${humanizeColumn(groupByColumn)} (top 10)`,
  };

  if (!options) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{titleMap[lineMode]}</h3>
        <div className={styles.chartControls}>
          {isTokenReport && (
            <ActionMenu>
              <ActionMenu.Button size="small">{activeMetric.label}</ActionMenu.Button>
              <ActionMenu.Overlay>
                <ActionList selectionVariant="single">
                  {METRIC_OPTIONS.map((opt) => (
                    <ActionList.Item
                      key={opt.key}
                      selected={metricKey === opt.key}
                      onSelect={() => setMetricKey(opt.key)}
                    >
                      {opt.label}
                    </ActionList.Item>
                  ))}
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          )}
          <SegmentedControl
          aria-label="Line mode"
          size="small"
          onChange={(index) => setLineMode(LINE_MODES[index])}
        >
          {LINE_MODES.map((mode) => (
            <SegmentedControl.Button
              key={mode}
              selected={lineMode === mode}
              aria-label={LINE_MODE_LABELS[mode]}
            >
              {LINE_MODE_LABELS[mode]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        </div>
      </div>
      <HighchartsReact key={lineMode} highcharts={Highcharts} options={options} immutable />
    </div>
  );
}
