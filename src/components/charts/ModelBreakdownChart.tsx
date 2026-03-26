import { useCallback, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { SegmentedControl } from '@primer/react';
import { CopilotIcon, CreditCardIcon } from '@primer/octicons-react';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy, topN } from '../../lib/aggregation';
import { humanizeColumn, formatCompact } from '../../lib/formatters';
import { buildColorMap, getModelIconUrl } from '../../lib/chart-theme';
import { REPORT_TYPES } from '../../lib/types';
import type { AnyReportRow, TokenUsageRow } from '../../lib/types';
import styles from './Charts.module.css';

type ViewMode = 'spend' | 'tokens';

export function ModelBreakdownChart() {
  const { activeReport, groupByColumn, visibleRows } = useReport();
  const isTokenReport = activeReport?.type === REPORT_TYPES.TOKEN_USAGE;
  const [viewMode, setViewMode] = useState<ViewMode>('spend');
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  const toggleModel = useCallback((modelName: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  }, []);

  const spendOptions = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];

    // Get top users/groups by total gross spend
    const top = topN(rows, groupByColumn as keyof AnyReportRow & string, 'grossAmount' as keyof AnyReportRow & string, 15);
    if (top.length === 0) return null;

    // Collect all models across those top groups, ranked by total spend
    const allTopRows = top.flatMap((item) => item.rows);
    const modelGroups = groupBy(allTopRows, 'model' as keyof AnyReportRow & string);
    const rankedModels = [...modelGroups.entries()]
      .map(([model, modelRows]) => ({ model, total: sumBy(modelRows, 'grossAmount' as keyof AnyReportRow & string) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Build deterministic color map from ranked model names
    const colorMap = buildColorMap(rankedModels.map((m) => m.model));

    // Only count spend from models that actually have a bar (in rankedModels AND not hidden)
    const visibleModelNames = new Set(
      rankedModels.map((m) => m.model).filter((m) => !hiddenModels.has(m)),
    );

    // Re-sort groups by visible bar spend only
    const sorted = [...top]
      .map((item) => {
        const chartRows = item.rows
          .filter((r) => visibleModelNames.has(String(r['model' as keyof AnyReportRow])));
        const visibleSpend = Math.round(sumBy(chartRows, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100;
        return { ...item, visibleSpend };
      })
      .sort((a, b) => b.visibleSpend - a.visibleSpend);

    const categories = sorted.map((item) => formatDisplayValue(item.key, groupByColumn) || '(empty)');

    // Build a stacked series per model
    const series: Highcharts.SeriesOptionsType[] = rankedModels.map((modelInfo) => {
      const isHidden = hiddenModels.has(modelInfo.model);
      const data = sorted.map((item) => {
        const modelRows = item.rows.filter((r) => String(r['model' as keyof AnyReportRow]) === modelInfo.model);
        return Math.round(sumBy(modelRows, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100;
      });

      return {
        type: 'bar' as const,
        name: modelInfo.model || '(empty)',
        data,
        color: colorMap.get(modelInfo.model) ?? '#808fa3',
        visible: !isHidden,
        events: {
          legendItemClick: function () {
            toggleModel(modelInfo.model);
            return false; // prevent default Highcharts toggle — we handle it via state
          },
        },
      };
    });

    return {
      chart: { type: 'bar', height: Math.max(300, sorted.length * 40) },
      title: { text: `Top ${humanizeColumn(groupByColumn)} by Spend` },
      xAxis: {
        categories,
        crosshair: false,
        labels: {
          useHTML: true,
          formatter: function () {
            const name = typeof this.value === 'string' ? this.value : String(this.value);
            const isAvatar = groupByColumn === 'username' || groupByColumn === 'organization';
            const isModel = groupByColumn === 'model';
            if (isAvatar && name) {
              return `<span style="display:inline-flex;align-items:center;gap:6px;">${name}<img src="https://github.com/${encodeURIComponent(name)}.png?size=40" width="16" height="16" style="border-radius:50%;" loading="lazy" /></span>`;
            }
            if (isModel && name) {
              return `<span style="display:inline-flex;align-items:center;gap:6px;">${name}<img src="${getModelIconUrl(name)}" width="16" height="16" style="border-radius:50%;" loading="lazy" /></span>`;
            }
            return name || '(empty)';
          },
        },
      },
      yAxis: {
        title: { text: 'Spend ($)' },
        labels: { format: '${value}' },
      },
      tooltip: {
        shared: false,
        headerFormat: '<table style="min-width: 120px;"><tr><th colspan="2" style="color: var(--fgColor-muted, #59636e); font-weight: 600; padding-bottom: 2px; font-size: 12px;">{point.key}</th></tr>',
        pointFormat: '<tr><td><span style="color:{point.color}">●</span> {series.name}:&nbsp;</td><td style="text-align: right;"><b>${point.y:.2f}</b></td></tr>',
        footerFormat: '<tr style="border-top: 1px solid var(--borderColor-muted, #d1d9e0b3);"><td><b>Total:&nbsp;</b></td><td style="text-align: right;"><b>${point.total:.2f}</b></td></tr></table>',
      },
      plotOptions: { bar: { stacking: 'normal' } },
      series,
    };
  }, [activeReport, groupByColumn, visibleRows, hiddenModels, toggleModel]);

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

    const categories = enriched.map((item) => item.key || '(empty)');

    return {
      chart: { type: 'bar', height: Math.max(350, enriched.length * 40) },
      title: { text: `Token Usage by ${humanizeColumn(groupByColumn)} (Top 10)` },
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
  if (!activeOptions) return null;

  return (
    <div>
      {isTokenReport && (
        <div className={styles.chartControlsRow}>
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
        </div>
      )}
      <HighchartsReact key={`${viewMode}-${[...hiddenModels].sort().join(',')}`} highcharts={Highcharts} options={activeOptions} immutable />
    </div>
  );
}
