import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { topN } from '../../lib/aggregation';
import { formatCompact } from '../../lib/formatters';
import { REPORT_TYPES } from '../../lib/types';
import type { TokenUsageRow } from '../../lib/types';

export function TokenBreakdownChart() {
  const { activeReport, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport || activeReport.type !== REPORT_TYPES.TOKEN_USAGE) return null;

    const rows = visibleRows as TokenUsageRow[];
    const top = topN(rows, 'username', 'totalInputTokens', 10);
    if (top.length === 0) return null;

    // Compute all token totals per user, then sort by combined total (descending)
    const enriched = top.map((item) => {
      const input = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalInputTokens, 0);
      const output = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalOutputTokens, 0);
      const cacheCreate = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalCacheCreationTokens, 0);
      const cacheRead = item.rows.reduce((s: number, r: TokenUsageRow) => s + r.totalCacheReadTokens, 0);
      return { key: item.key, input, output, cacheCreate, cacheRead, total: input + output + cacheCreate + cacheRead };
    }).sort((a, b) => b.total - a.total);

    const categories = enriched.map((item) => item.key || '(empty)');
    const inputData = enriched.map((item) => item.input);
    const outputData = enriched.map((item) => item.output);
    const cacheCreateData = enriched.map((item) => item.cacheCreate);
    const cacheReadData = enriched.map((item) => item.cacheRead);

    return {
      chart: { type: 'bar', height: Math.max(350, top.length * 40) },
      title: { text: 'Token Usage by User (Top 10)' },
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
        pointFormatter: function () {
          return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${formatCompact(this.y ?? 0)}</b><br/>`;
        },
      },
      plotOptions: {
        bar: { stacking: 'normal' },
      },
      series: [
        {
          type: 'bar' as const,
          name: 'Input Tokens',
          data: inputData,
          color: 'var(--data-blue-color-emphasis, #006edb)',
        },
        {
          type: 'bar' as const,
          name: 'Output Tokens',
          data: outputData,
          color: 'var(--data-green-color-emphasis, #30a147)',
        },
        {
          type: 'bar' as const,
          name: 'Cache Creation',
          data: cacheCreateData,
          color: 'var(--data-orange-color-emphasis, #eb670f)',
        },
        {
          type: 'bar' as const,
          name: 'Cache Reads',
          data: cacheReadData,
          color: 'var(--data-teal-color-emphasis, #179b9b)',
        },
      ],
    };
  }, [activeReport, visibleRows]);

  if (!activeReport || activeReport.type !== REPORT_TYPES.TOKEN_USAGE) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
