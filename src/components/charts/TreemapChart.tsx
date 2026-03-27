import { useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsTreemap from 'highcharts/modules/treemap';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { groupBy, sumBy } from '../../lib/aggregation';
import { buildColorMap } from '../../lib/chart-theme';
import { humanizeColumn } from '../../lib/formatters';
import type { AnyReportRow } from '../../lib/types';

if (typeof HighchartsTreemap === 'function') (HighchartsTreemap as (hc: typeof Highcharts) => void)(Highcharts);

export function TreemapChart() {
  const { activeReport, groupByColumn, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    if (rows.length === 0) return null;

    const topGroups = groupBy(rows, groupByColumn as keyof AnyReportRow & string);

    // Rank groups by total spend, keep top 20
    const rankedGroups = [...topGroups.entries()]
      .map(([name, groupRows]) => ({
        name,
        total: sumBy(groupRows, 'grossAmount' as keyof AnyReportRow & string),
        rows: groupRows,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    // Collect all unique model names for color mapping
    const allModels = new Set<string>();
    for (const group of rankedGroups) {
      const modelGroups = groupBy(group.rows, 'model' as keyof AnyReportRow & string);
      for (const model of modelGroups.keys()) {
        allModels.add(model);
      }
    }
    const colorMap = buildColorMap([...allModels]);

    const data: Highcharts.PointOptionsObject[] = [];

    for (const group of rankedGroups) {
      const parentId = `group-${group.name}`;

      // Level 1: group parent
      data.push({
        id: parentId,
        name: group.name || '(empty)',
        value: Math.round(group.total * 100) / 100,
      });

      // Level 2: models within group
      const modelGroups = groupBy(group.rows, 'model' as keyof AnyReportRow & string);
      for (const [model, modelRows] of modelGroups) {
        const value = Math.round(sumBy(modelRows, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100;
        if (value <= 0) continue;

        data.push({
          name: model || '(empty)',
          parent: parentId,
          value,
          color: colorMap.get(model) ?? '#808fa3',
        });
      }
    }

    return {
      chart: { type: 'treemap', height: 500 },
      title: { text: `Spend distribution by ${humanizeColumn(groupByColumn)}` },
      series: [
        {
          type: 'treemap' as const,
          layoutAlgorithm: 'squarified',
          levels: [
            {
              level: 1,
              dataLabels: {
                enabled: true,
                style: {
                  fontSize: '14px',
                  color: '#ffffff',
                  textOutline: '2px #000000',
                  fontWeight: '700',
                },
              },
              borderWidth: 3,
            },
            {
              level: 2,
              dataLabels: {
                enabled: true,
                style: {
                  fontSize: '11px',
                  color: '#ffffff',
                  textOutline: '1px #000000',
                  fontWeight: '400',
                },
              },
              borderWidth: 1,
            },
          ],
          data,
        },
      ],
      tooltip: {
        pointFormat: '<b>{point.name}</b><br/>${point.value:,.2f}',
      },
    };
  }, [activeReport, groupByColumn, visibleRows]);

  if (!options) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} immutable />;
}
