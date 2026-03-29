import { useCallback, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { ActionList, ActionMenu, SegmentedControl } from '@primer/react';
import { CopilotIcon, CreditCardIcon } from '@primer/octicons-react';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, topN } from '../../lib/aggregation';
import { humanizeColumn, formatCompact, formatDisplayValue, getGroupIconSvg, columnHasIcons } from '../../lib/formatters';
import { buildColorMap } from '../../lib/chart-theme';
import { REPORT_TYPES } from '../../lib/types';
import type { MetricOption } from '../../lib/report-schema';
import type { AnyReportRow, TokenUsageRow } from '../../lib/types';
import styles from './Charts.module.css';

type ViewMode = 'spend' | 'tokens';

interface GroupBreakdownChartProps {
  stackField?: string;
  metricOptions?: MetricOption[];
}

export function GroupBreakdownChart({ stackField = 'model', metricOptions }: GroupBreakdownChartProps) {
  const { activeReport, groupByColumn, visibleRows } = useReport();
  const isTokenReport = activeReport?.type === REPORT_TYPES.TOKEN_USAGE;
  const showTokensView = isTokenReport && stackField === 'model';
  const [viewMode, setViewMode] = useState<ViewMode>('spend');
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [metricKey, setMetricKey] = useState('grossAmount');

  // Resolve metric from options
  const resolvedMetrics = metricOptions ?? [{ key: 'grossAmount', label: 'Spend', isCurrency: true }];
  const showMetricToggle = resolvedMetrics.length > 1 && !showTokensView;
  const effectiveMetricKey = resolvedMetrics.some((m) => m.key === metricKey) ? metricKey : resolvedMetrics[0].key;
  const activeMetric = resolvedMetrics.find((m) => m.key === effectiveMetricKey) ?? resolvedMetrics[0];
  const dataField = activeMetric.valueField ?? activeMetric.key;

  const toggleGroup = useCallback((groupName: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const spendOptions = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const allRows = visibleRows as AnyReportRow[];
    const rows = activeMetric.rowFilter
      ? allRows.filter((r) => activeMetric.rowFilter!(r as unknown as Record<string, unknown>))
      : allRows;

    // Get top users/groups by total metric
    const top = topN(rows, groupByColumn as keyof AnyReportRow & string, dataField as keyof AnyReportRow & string, 15);
    if (top.length === 0) return null;

    // Collect all stack groups across those top groups, ranked by total metric
    const allTopRows = top.flatMap((item) => item.rows);
    const stackGroups = groupBy(allTopRows, stackField as keyof AnyReportRow & string);
    const rankedStacks = [...stackGroups.entries()]
      .map(([stack, stackRows]) => ({ stack, total: sumBy(stackRows, dataField as keyof AnyReportRow & string) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Build deterministic color map from ranked stack names
    const colorMap = buildColorMap(rankedStacks.map((m) => m.stack), stackField === 'model');

    // Only count from stacks that actually have a bar (in rankedStacks AND not hidden)
    const visibleStackNames = new Set(
      rankedStacks.map((m) => m.stack).filter((m) => !hiddenGroups.has(m)),
    );

    // Re-sort groups by visible bar metric only
    const sorted = [...top]
      .map((item) => {
        const chartRows = item.rows
          .filter((r) => visibleStackNames.has(String(r[stackField as keyof AnyReportRow])));
        const visibleMetric = Math.round(sumBy(chartRows, dataField as keyof AnyReportRow & string) * 100) / 100;
        return { ...item, visibleSpend: visibleMetric };
      })
      .sort((a, b) => b.visibleSpend - a.visibleSpend);

    const categories = sorted.map((item) => formatDisplayValue(item.key, groupByColumn) || ' ');

    // Build a stacked series per stack group
    const series: Highcharts.SeriesOptionsType[] = rankedStacks.map((stackInfo) => {
      const isHidden = hiddenGroups.has(stackInfo.stack);
      const data = sorted.map((item) => {
        const stackRows = item.rows.filter((r) => String(r[stackField as keyof AnyReportRow]) === stackInfo.stack);
        return Math.round(sumBy(stackRows, dataField as keyof AnyReportRow & string) * 100) / 100;
      });

      const seriesColor = colorMap.get(stackInfo.stack) ?? '#808fa3';
      const displayName = formatDisplayValue(stackInfo.stack, stackField) || ' ';
      const hasIcons = columnHasIcons(stackField);
      const iconHtml = hasIcons ? getGroupIconSvg(stackInfo.stack, stackField, seriesColor) : '';
      return {
        type: 'bar' as const,
        name: iconHtml
          ? `<span style="display:flex;align-items:center;gap:4px">${iconHtml}${displayName}</span>`
          : displayName,
        data,
        color: seriesColor,
        visible: !isHidden,
        custom: { rawStack: stackInfo.stack },
        events: {
          legendItemClick: function () {
            toggleGroup(stackInfo.stack);
            return false; // prevent default Highcharts toggle — we handle it via state
          },
        },
      };
    });

    return {
      chart: { type: 'bar', height: Math.max(300, sorted.length * 40) },
      title: { text: undefined },
      xAxis: {
        categories,
        crosshair: false,
        labels: {
          useHTML: true,
          formatter: function () {
            const name = typeof this.value === 'string' ? this.value : String(this.value);
            if (!name || !columnHasIcons(groupByColumn)) return name || ' ';
            // Resolve the raw key from sorted data for proper icon lookup
            const rawKey = sorted[typeof this.pos === 'number' ? this.pos : 0]?.key ?? name;
            const icon = getGroupIconSvg(rawKey, groupByColumn);
            return icon
              ? `<span style="display:inline-flex;align-items:center;gap:6px;">${name}${icon}</span>`
              : name;
          },
        },
      },
      yAxis: {
        title: { text: undefined },
        labels: activeMetric.isCurrency
          ? { format: '${value}' }
          : {
              formatter: function () {
                return formatCompact(this.value as number);
              },
            },
      },
      tooltip: {
        shared: false,
        useHTML: true,
        formatter: function () {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pt = this as unknown as { point: { y: number; total: number; color: string }; series: { name: string; userOptions?: { custom?: { rawStack?: string } } }; x: string };
          const val = pt.point.y ?? 0;
          const total = pt.point.total ?? val;
          // Header: groupBy entity with icon
          const key = String(pt.x ?? '');
          const rawKey = sorted.find((s) => formatDisplayValue(s.key, groupByColumn) === key)?.key ?? key;
          const headerIcon = columnHasIcons(groupByColumn) ? getGroupIconSvg(rawKey, groupByColumn) : '';
          const headerHtml = headerIcon
            ? `<span style="display:inline-flex;align-items:center;gap:4px;">${headerIcon}${key}</span>`
            : key;
          // Row: stack value with icon
          const hasStackIcons = columnHasIcons(stackField);
          const rawStack = pt.series.userOptions?.custom?.rawStack ?? '';
          const indicator = hasStackIcons && rawStack
            ? getGroupIconSvg(rawStack, stackField, String(pt.point.color))
            : `<span style="color:${pt.point.color}">●</span>`;
          const displayName = formatDisplayValue(rawStack, stackField) || pt.series.name;
          const formatted = activeMetric.isCurrency
            ? `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : formatCompact(val);
          const totalStr = activeMetric.isCurrency
            ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : formatCompact(total);
          return `<table style="min-width:120px;"><tr><th colspan="2" style="color:var(--fgColor-muted,#59636e);font-weight:600;padding-bottom:2px;font-size:12px;">${headerHtml}</th></tr>` +
            `<tr><td>${indicator} ${displayName}:&nbsp;</td><td style="text-align:right;"><b>${formatted}</b></td></tr>` +
            `<tr style="border-top:1px solid var(--borderColor-muted,#d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align:right;"><b>${totalStr}</b></td></tr></table>`;
        },
      },
      plotOptions: { bar: { stacking: 'normal' } },
      legend: columnHasIcons(stackField)
        ? { symbolWidth: 0, symbolHeight: 0, symbolPadding: 0 }
        : { symbolWidth: 16, symbolHeight: 12, symbolPadding: 5 },
      series,
    };
  }, [activeReport, groupByColumn, stackField, visibleRows, hiddenGroups, toggleGroup, activeMetric, dataField]);

  const tokenOptions = useMemo((): Highcharts.Options | null => {
    if (!activeReport || !isTokenReport) return null;

    const rows = visibleRows as TokenUsageRow[];
    const top = topN(rows, groupByColumn as keyof TokenUsageRow, 'totalInputTokens', 10);
    if (top.length === 0) return null;

    const enriched = top
      .map((item) => {
        const input = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalInputTokens, 0);
        const output = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalOutputTokens, 0);
        const cacheCreate = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalCacheCreationTokens, 0);
        const cacheRead = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalCacheReadTokens, 0);
        return { key: item.key, input, output, cacheCreate, cacheRead, total: input + output + cacheCreate + cacheRead };
      })
      .sort((a, b) => b.total - a.total);

    const categories = enriched.map((item) => formatDisplayValue(item.key, groupByColumn) || ' ');

    return {
      chart: { type: 'bar', height: Math.max(350, enriched.length * 40) },
      title: { text: undefined },
      xAxis: { categories },
      yAxis: {
        title: { text: 'Tokens' },
        labels: {
          formatter: function () {
            return formatCompact(this.value as number);
          },
        },
      },
      tooltip: {
        shared: false,
        headerFormat: '<table><tr><td colspan="2"><b>{point.key}</b></td></tr>',
        pointFormatter: function () {
          return `<tr><td><span style="color:${this.color}">●</span> ${this.series.name}:&nbsp;</td><td style="text-align: right;"><b>${formatCompact(this.y ?? 0)}</b></td></tr>`;
        },
        footerFormat: '<tr style="border-top: 1px solid var(--borderColor-muted, #d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align: right;"><b>{point.total:,.0f}</b></td></tr></table>',
        useHTML: true,
      },
      plotOptions: { bar: { stacking: 'normal' } },
      series: [
        { type: 'bar' as const, name: 'Input Tokens', data: enriched.map((d) => d.input), color: 'var(--data-blue-color-emphasis, #006edb)' },
        { type: 'bar' as const, name: 'Output Tokens', data: enriched.map((d) => d.output), color: 'var(--data-green-color-emphasis, #30a147)' },
        { type: 'bar' as const, name: 'Cache Creation', data: enriched.map((d) => d.cacheCreate), color: 'var(--data-orange-color-emphasis, #eb670f)' },
        { type: 'bar' as const, name: 'Cache Reads', data: enriched.map((d) => d.cacheRead), color: 'var(--data-teal-color-emphasis, #179b9b)' },
      ],
    };
  }, [activeReport, groupByColumn, isTokenReport, visibleRows]);

  const activeOptions = viewMode === 'tokens' ? tokenOptions : spendOptions;
  const chartTitle = viewMode === 'tokens'
    ? `Token Usage by ${humanizeColumn(groupByColumn)} (Top 10)`
    : `Top ${humanizeColumn(groupByColumn)} by ${activeMetric.label}`;
  if (!activeOptions) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{chartTitle}</h3>
        <div className={styles.chartControls}>
          {showMetricToggle && (
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
          )}
          {showTokensView && (
            <SegmentedControl aria-label="View mode" size="small">
              <SegmentedControl.IconButton
                aria-label="Spend"
                icon={CreditCardIcon}
                selected={viewMode === 'spend'}
                onClick={() => setViewMode('spend')}
              />
              <SegmentedControl.IconButton
                aria-label="Tokens"
                icon={CopilotIcon}
                selected={viewMode === 'tokens'}
                onClick={() => setViewMode('tokens')}
              />
            </SegmentedControl>
          )}
        </div>
      </div>
      <HighchartsReact key={`${viewMode}-${effectiveMetricKey}-${[...hiddenGroups].sort().join(',')}`} highcharts={Highcharts} options={activeOptions} />
    </div>
  );
}
