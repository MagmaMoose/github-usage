import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { topN } from '../../lib/aggregation';
import { humanizeColumn } from '../../lib/formatters';
import { GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import type { AnyReportRow } from '../../lib/types';

export function ModelBreakdownChart() {
  const { activeReport, groupByColumn, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const top = topN(
      visibleRows as AnyReportRow[],
      groupByColumn as keyof AnyReportRow & string,
      'grossAmount' as keyof AnyReportRow & string,
      15,
    );

    if (top.length === 0) return null;

    const categories = top.map((item) => item.key || '(empty)');
    const data = top.map((item, i) => ({
      y: Math.round(item.value * 100) / 100,
      color: GITHUB_COLORS_RESOLVED[i % GITHUB_COLORS_RESOLVED.length],
    }));

    return {
      chart: { type: 'bar', height: Math.max(300, top.length * 35) },
      title: { text: `Top ${humanizeColumn(groupByColumn)} by Spend` },
      xAxis: { categories, crosshair: false },
      yAxis: {
        title: { text: 'Spend ($)' },
        labels: { format: '${value}' },
      },
      legend: { enabled: false },
      series: [
        {
          type: 'bar' as const,
          name: 'Spend',
          data,
          tooltip: { pointFormat: '<b>${point.y:.2f}</b>' },
        },
      ],
    };
  }, [activeReport, groupByColumn, visibleRows]);

  if (!options) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
