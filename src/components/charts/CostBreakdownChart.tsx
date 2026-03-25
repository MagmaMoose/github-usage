import { useMemo } from 'react';
import Highcharts from 'highcharts';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { sumBy, timeBucket as bucketRows } from '../../lib/aggregation';
import type { AnyReportRow } from '../../lib/types';

export function CostBreakdownChart() {
  const { activeReport, timeBucket, visibleRows } = useReport();

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    const buckets = bucketRows(rows, timeBucket);
    const categories = [...buckets.keys()];

    const grossData: number[] = [];
    const discountData: number[] = [];
    const netData: number[] = [];

    for (const [, bucketRowList] of buckets) {
      grossData.push(
        Math.round(sumBy(bucketRowList, 'grossAmount' as keyof AnyReportRow & string) * 100) / 100,
      );
      discountData.push(
        Math.round(
          sumBy(bucketRowList, 'discountAmount' as keyof AnyReportRow & string) * 100,
        ) / 100,
      );
      netData.push(
        Math.round(sumBy(bucketRowList, 'netAmount' as keyof AnyReportRow & string) * 100) / 100,
      );
    }

    return {
      chart: { type: 'column', height: 350 },
      title: { text: 'Cost Breakdown over Time' },
      xAxis: { categories, crosshair: true },
      yAxis: {
        title: { text: 'Amount ($)' },
        labels: { format: '${value}' },
      },
      tooltip: {
        pointFormat:
          '<span style="color:{point.color}">●</span> {series.name}: <b>${point.y:.2f}</b><br/>',
      },
      series: [
        {
          type: 'column' as const,
          name: 'Gross',
          data: grossData,
          color: 'var(--data-blue-color-emphasis, #006edb)',
        },
        {
          type: 'column' as const,
          name: 'Discount',
          data: discountData,
          color: 'var(--data-green-color-emphasis, #30a147)',
        },
        {
          type: 'column' as const,
          name: 'Net',
          data: netData,
          color: 'var(--data-orange-color-emphasis, #eb670f)',
        },
      ],
    };
  }, [activeReport, timeBucket, visibleRows]);

  if (!options) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
