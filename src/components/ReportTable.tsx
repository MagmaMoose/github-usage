import { useMemo } from 'react';
import { DataTable, Table } from '@primer/react/experimental';
import { useReport } from '../context/useReport';
import { groupBy, sumBy } from '../lib/aggregation';
import { formatCurrency, formatCompact, humanizeColumn } from '../lib/formatters';
import type { AnyReportRow, TokenUsageRow } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';

interface TableRow {
  id: string;
  group: string;
  count: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  quantity: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

export function ReportTable() {
  const { activeReport, groupByColumn, visibleRows } = useReport();

  const isTokenReport = activeReport?.type === REPORT_TYPES.TOKEN_USAGE;

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
      totalInputTokens: isTokenReport ? (rows as TokenUsageRow[]).reduce((s, r) => s + (r.totalInputTokens ?? 0), 0) : 0,
      totalOutputTokens: isTokenReport ? (rows as TokenUsageRow[]).reduce((s, r) => s + (r.totalOutputTokens ?? 0), 0) : 0,
      totalCacheCreationTokens: isTokenReport ? (rows as TokenUsageRow[]).reduce((s, r) => s + (r.totalCacheCreationTokens ?? 0), 0) : 0,
      totalCacheReadTokens: isTokenReport ? (rows as TokenUsageRow[]).reduce((s, r) => s + (r.totalCacheReadTokens ?? 0), 0) : 0,
    }));
  }, [activeReport, groupByColumn, visibleRows, isTokenReport]);

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
          ...(isTokenReport ? [
            {
              header: 'Input tokens',
              field: 'totalInputTokens' as const,
              sortBy: 'basic' as const,
              align: 'end' as const,
              renderCell: (row: TableRow) => formatCompact(row.totalInputTokens),
            },
            {
              header: 'Output tokens',
              field: 'totalOutputTokens' as const,
              sortBy: 'basic' as const,
              align: 'end' as const,
              renderCell: (row: TableRow) => formatCompact(row.totalOutputTokens),
            },
            {
              header: 'Cache create',
              field: 'totalCacheCreationTokens' as const,
              sortBy: 'basic' as const,
              align: 'end' as const,
              renderCell: (row: TableRow) => formatCompact(row.totalCacheCreationTokens),
            },
            {
              header: 'Cache read',
              field: 'totalCacheReadTokens' as const,
              sortBy: 'basic' as const,
              align: 'end' as const,
              renderCell: (row: TableRow) => formatCompact(row.totalCacheReadTokens),
            },
          ] : []),
          {
            header: 'Rows',
            field: 'count',
            sortBy: 'basic',
            align: 'end',
            renderCell: (row: TableRow) => formatCompact(row.count),
          },
        ] as unknown as Parameters<typeof DataTable>[0]['columns']}
      />
    </Table.Container>
  );
}
