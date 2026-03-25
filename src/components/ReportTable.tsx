import { useMemo } from 'react';
import { DataTable, Table } from '@primer/react/experimental';
import { useReport } from '../context/useReport';
import { groupBy, sumBy } from '../lib/aggregation';
import { formatCurrency, formatCompact, humanizeColumn } from '../lib/formatters';
import type { AnyReportRow } from '../lib/types';

interface TableRow {
  id: string;
  group: string;
  count: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  quantity: number;
}

export function ReportTable() {
  const { activeReport, groupByColumn, visibleRows } = useReport();

  const tableData = useMemo(() => {
    if (!activeReport) return [];
    const groups = groupBy(visibleRows as AnyReportRow[], groupByColumn as keyof AnyReportRow & string);
    return [...groups.entries()].map(([key, rows]) => ({
      id: key,
      group: key,
      count: rows.length,
      grossAmount: sumBy(rows, 'grossAmount' as keyof AnyReportRow & string),
      discountAmount: sumBy(rows, 'discountAmount' as keyof AnyReportRow & string),
      netAmount: sumBy(rows, 'netAmount' as keyof AnyReportRow & string),
      quantity: sumBy(rows, 'quantity' as keyof AnyReportRow & string),
    }));
  }, [activeReport, groupByColumn, visibleRows]);

  if (!activeReport || tableData.length === 0) return null;

  return (
    <Table.Container>
      <Table.Title as="h2" id="report-table">
        Usage by {humanizeColumn(groupByColumn)}
      </Table.Title>
      <Table.Subtitle id="report-table-subtitle">
        {visibleRows.length.toLocaleString()} filtered rows across {tableData.length} groups
      </Table.Subtitle>
      <DataTable
        aria-labelledby="report-table"
        data={tableData}
        columns={[
          {
            header: humanizeColumn(groupByColumn),
            field: 'group',
            sortBy: 'alphanumeric',
            renderCell: (row: TableRow) => <span title={row.group}>{row.group || '(empty)'}</span>,
          },
          {
            header: 'Rows',
            field: 'count',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCompact(row.count),
          },
          {
            header: 'Quantity',
            field: 'quantity',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCompact(row.quantity),
          },
          {
            header: 'Gross',
            field: 'grossAmount',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCurrency(row.grossAmount),
          },
          {
            header: 'Discount',
            field: 'discountAmount',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCurrency(row.discountAmount),
          },
          {
            header: 'Net',
            field: 'netAmount',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCurrency(row.netAmount),
          },
        ]}
      />
    </Table.Container>
  );
}
