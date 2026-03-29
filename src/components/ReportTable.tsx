import { useMemo, useState, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnDef,
  type VisibilityState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import { Avatar, Button, CounterLabel, SelectPanel } from '@primer/react';
import { Table as PrimerTable } from '@primer/react/experimental';
import { AppsIcon, ColumnsIcon, CreditCardIcon, RepoIcon, TagIcon, WorkflowIcon } from '@primer/octicons-react';
import { OnboardingBubble, ONBOARDING_STEPS } from './onboarding';
import { type ActionListItemInput } from '@primer/react/deprecated';
import { useReport } from '../context/useReport';
import { groupBy, sumBy } from '../lib/aggregation';
import { formatCurrency, formatCompact, humanizeColumn, formatDisplayValue, getAvatarUrl, formatDatetime, getSkuIcon } from '../lib/formatters';
import type { AnyReportRow, TokenUsageRow, UsageReportRow } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';
import { getModelIconUrl } from '../lib/chart-theme';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../lib/local-storage';
import styles from './ReportTable.module.css';

/** Icon to show next to non-avatar, non-model group values */
const COLUMN_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  sku: TagIcon,
  product: AppsIcon,
  costCenterName: CreditCardIcon,
  repository: RepoIcon,
  workflowPath: WorkflowIcon,
};



// Extend TanStack's ColumnMeta to support our align property
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'start' | 'end';
  }
}

interface TableRow {
  id: string;
  group: string;
  count: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  quantity: number;
  // Token usage columns (copilot reports only)
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  // Usage report columns
  totalMinutes: number;
  totalStorageGBH: number;
  // Dynamic flat-report fields are stored here
  [key: string]: unknown;
}

const columnHelper = createColumnHelper<TableRow>();

function ColumnVisibilityPanel({ table }: { table: TanstackTable<TableRow> }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const savedRef = useRef<ActionListItemInput[]>([]);

  const allColumns = table.getAllLeafColumns();

  const items: ActionListItemInput[] = allColumns.map((col) => ({
    text: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
    id: col.id,
  }));

  const selected = items.filter((item) => {
    const col = allColumns.find((c) => c.id === item.id);
    return col?.getIsVisible();
  });

  const filteredItems = filter
    ? items.filter((item) => item.text?.toLowerCase().includes(filter.toLowerCase()))
    : items;

  const handleSelectedChange = (newSelected: ActionListItemInput[]) => {
    const selectedIds = new Set(newSelected.map((s) => s.id));
    const visibility: VisibilityState = {};
    for (const col of allColumns) {
      visibility[col.id] = selectedIds.has(col.id);
    }
    table.setColumnVisibility(visibility);
  };

  return (
    <SelectPanel
      renderAnchor={({ ...anchorProps }) => (
        <Button {...anchorProps} leadingVisual={ColumnsIcon} aria-haspopup="dialog">
          Columns
        </Button>
      )}
      placeholder="Columns"
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          savedRef.current = selected;
        }
        setOpen(isOpen);
      }}
      items={filteredItems}
      selected={selected}
      onSelectedChange={handleSelectedChange}
      onFilterChange={setFilter}
      onCancel={() => {
        handleSelectedChange(savedRef.current);
        setOpen(false);
      }}
    />
  );
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (direction === 'asc') {
    return (
      <svg className={styles.sortIcon} viewBox="0 0 16 16" fill="currentColor">
        <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z" />
      </svg>
    );
  }
  if (direction === 'desc') {
    return (
      <svg className={styles.sortIcon} viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.927 13.427a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.25a.75.75 0 0 1 1.5 0V10h2.25a.25.25 0 0 1 .177.427l-3 3ZM0 3.75A.75.75 0 0 1 .75 3h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75ZM0 7.75A.75.75 0 0 1 .75 7h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75Zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Z" />
      </svg>
    );
  }
  return (
    <svg className={styles.sortIconHidden} viewBox="0 0 16 16" fill="currentColor">
      <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z" />
    </svg>
  );
}

function TableBody({
  table,
}: {
  table: ReturnType<typeof useReactTable<TableRow>>;
}) {
  return (
    <tbody className={styles.tbody}>
      {table.getRowModel().rows.map((row) => (
        <tr key={row.id} className={styles.tr}>
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              className={styles.td}
              data-align={cell.column.columnDef.meta?.align}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface ReportTableProps {
  onGroupClick?: () => void;
}

export function ReportTable({ onGroupClick }: ReportTableProps) {
  const { activeReport, groupByColumn, visibleRows, setFilter, filters } = useReport();
  const reportType = activeReport?.type;
  const isTokenReport = reportType === REPORT_TYPES.TOKEN_USAGE;
  const isUsageReport = reportType === REPORT_TYPES.USAGE_REPORT;
  const isFlatReport = reportType != null
    && reportType !== REPORT_TYPES.PREMIUM_REQUEST
    && reportType !== REPORT_TYPES.TOKEN_USAGE
    && reportType !== REPORT_TYPES.USAGE_REPORT;

  const [sorting, setSorting] = useState<SortingState>([{ id: isFlatReport ? 'count' : 'netAmount', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');

  const defaultVisibility: VisibilityState = {
    grossAmount: false,
    discountAmount: false,
    count: false,
    ...(isUsageReport && { quantity: false }),
    ...(isFlatReport && { count: true }),
  };
  const [columnVisibility, setColumnVisibilityRaw] = useState<VisibilityState>(() =>
    getStoredValue(STORAGE_KEYS.COLUMN_VISIBILITY, defaultVisibility),
  );

  // No need for effectiveVisibility overrides; columns are only added when relevant
  const setColumnVisibility = useCallback((updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    setColumnVisibilityRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setStoredValue(STORAGE_KEYS.COLUMN_VISIBILITY, next);
      return next;
    });
  }, []);

  const tableData = useMemo(() => {
    if (!activeReport) return [];

    const emptyRow = {
      count: 0, grossAmount: 0, discountAmount: 0, netAmount: 0, quantity: 0,
      totalInputTokens: 0, totalOutputTokens: 0, totalCacheCreationTokens: 0, totalCacheReadTokens: 0,
      totalMinutes: 0, totalStorageGBH: 0,
    };

    // Helper to resolve a display value for group labels
    const resolveGroupLabel = (val: unknown): string => {
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      return String(val ?? '(empty)');
    };

    // Flat report types: aggregate by groupByColumn, show count + first-row values
    if (isFlatReport) {
      const groups = new Map<string, AnyReportRow[]>();
      for (const row of visibleRows as AnyReportRow[]) {
        const raw = (row as unknown as Record<string, unknown>)[groupByColumn];
        const key = raw === '' || raw === null || raw === undefined ? '(empty)' : resolveGroupLabel(raw);
        const arr = groups.get(key);
        if (arr) arr.push(row);
        else groups.set(key, [row]);
      }

      return [...groups.entries()].map(([key, rows]) => {
        const first = rows[0] as unknown as Record<string, unknown>;
        const base: TableRow = {
          ...emptyRow,
          id: key,
          group: key,
          count: rows.length,
        };
        // Copy all fields from the first row for display
        for (const [field, val] of Object.entries(first)) {
          if (typeof val === 'boolean') {
            (base as Record<string, unknown>)[field] = val ? 'Yes' : 'No';
          } else if (typeof val === 'string' || typeof val === 'number') {
            (base as Record<string, unknown>)[field] = val;
          }
        }
        return base;
      });
    }

    // Aggregated rendering for billing report types
    const groups = groupBy(
      visibleRows as AnyReportRow[],
      groupByColumn as keyof AnyReportRow & string,
    );
    return [...groups.entries()].map(([key, rows]) => {
      const base: TableRow = {
        ...emptyRow,
        id: key,
        group: key,
        count: rows.length,
        grossAmount: sumBy(rows, 'grossAmount' as keyof AnyReportRow & string),
        discountAmount: sumBy(rows, 'discountAmount' as keyof AnyReportRow & string),
        netAmount: sumBy(rows, 'netAmount' as keyof AnyReportRow & string),
        quantity: sumBy(rows, 'quantity' as keyof AnyReportRow & string),
      };

      if (isTokenReport) {
        const tokenRows = rows as TokenUsageRow[];
        base.totalInputTokens = tokenRows.reduce((s, r) => s + (r.totalInputTokens ?? 0), 0);
        base.totalOutputTokens = tokenRows.reduce((s, r) => s + (r.totalOutputTokens ?? 0), 0);
        base.totalCacheCreationTokens = tokenRows.reduce((s, r) => s + (r.totalCacheCreationTokens ?? 0), 0);
        base.totalCacheReadTokens = tokenRows.reduce((s, r) => s + (r.totalCacheReadTokens ?? 0), 0);
      }

      if (isUsageReport) {
        const usageRows = rows as unknown as UsageReportRow[];
        base.totalMinutes = usageRows
          .filter((r) => r.unitType === 'minutes')
          .reduce((s, r) => s + r.quantity, 0);
        base.totalStorageGBH = usageRows
          .filter((r) => r.unitType === 'gigabyte-hours')
          .reduce((s, r) => s + r.quantity, 0);
      }

      return base;
    });
  }, [activeReport, groupByColumn, visibleRows, isTokenReport, isUsageReport, isFlatReport]);

  // For flat reports: detect which row fields have at least one non-empty value
  const fieldsWithValues = useMemo(() => {
    if (!activeReport || !isFlatReport) return new Set<string>();
    const populated = new Set<string>();
    for (const row of visibleRows) {
      for (const [key, val] of Object.entries(row as unknown as Record<string, unknown>)) {
        if (populated.has(key)) continue;
        if (val !== '' && val !== null && val !== undefined) populated.add(key);
      }
    }
    return populated;
  }, [activeReport, isFlatReport, visibleRows]);

  const handleGroupClick = useCallback(
    (value: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentFilterValues = filters[groupByColumn] ?? [];
      const isActive = currentFilterValues.some((v) => v.toLowerCase() === value.toLowerCase());
      setFilter(groupByColumn, isActive ? [] : [value]);
      if (!isActive) onGroupClick?.();
    },
    [groupByColumn, filters, setFilter, onGroupClick],
  );

  const columns = useMemo<ColumnDef<TableRow, unknown>[]>(() => {
    const isAvatarGroup = groupByColumn === 'username' || groupByColumn === 'organization' || groupByColumn === 'login' || groupByColumn === 'userLogin';
    const isModelGroup = groupByColumn === 'model';

    const cols: ColumnDef<TableRow, unknown>[] = [
      columnHelper.accessor('group', {
        header: humanizeColumn(groupByColumn),
        cell: (info) => {
          const value = info.getValue();
          if (isAvatarGroup && value) {
            return (
              <button
                type="button"
                className={styles.cellClickable}
                onClick={(e) => handleGroupClick(value, e)}
                title={`Filter to ${value}`}
              >
                <Avatar src={getAvatarUrl(value)} size={20} alt={`@${value}`} />
                <span>{value}</span>
              </button>
            );
          }
          if (isModelGroup && value) {
            return (
              <button
                type="button"
                className={styles.cellClickable}
                onClick={(e) => handleGroupClick(value, e)}
                title={`Filter to ${value}`}
              >
                <img
                  src={getModelIconUrl(value)}
                  alt=""
                  width={20}
                  height={20}
                  className={styles.modelIconBadge}
                />
                <span>{value}</span>
              </button>
            );
          }
          const displayValue = formatDisplayValue(value, groupByColumn);
          if (groupByColumn === 'repository' && value) {
            return (
              <button
                type="button"
                className={styles.cellClickable}
                onClick={(e) => handleGroupClick(value, e)}
                title={`Filter to ${value}`}
              >
                <RepoIcon size={16} className={styles.columnIcon} />
                {value}
              </button>
            );
          }
          const ColumnIcon = groupByColumn === 'sku' ? getSkuIcon(value) : COLUMN_ICONS[groupByColumn];
          return (
            <button
              type="button"
              className={styles.cellClickable}
              onClick={(e) => handleGroupClick(value, e)}
              title={`Filter to ${displayValue || ''}`}
            >
              {ColumnIcon && <ColumnIcon size={16} className={styles.columnIcon} />}
              {displayValue || ''}
            </button>
          );
        },
        sortingFn: 'alphanumeric',
      }) as ColumnDef<TableRow, unknown>,
    ];

    // Count/Rows column — always 2nd (right after group)
    cols.push(
      columnHelper.accessor('count', {
        header: isFlatReport ? 'Count' : 'Rows',
        cell: (info) => formatCompact(info.getValue()),
        meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>,
    );

    // Shared financial columns (billing report types only)
    if (!isFlatReport) {
      cols.push(
        columnHelper.accessor('quantity', {
          header: 'Quantity',
          cell: (info) => formatCompact(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
        columnHelper.accessor('grossAmount', {
          header: 'Gross',
          cell: (info) => formatCurrency(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
      columnHelper.accessor('discountAmount', {
        header: 'Discount',
        cell: (info) => formatCurrency(info.getValue()),
        meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>,
      columnHelper.accessor('netAmount', {
        header: 'Net',
        cell: (info) => formatCurrency(info.getValue()),
        meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>,
    );
    }

    // Token columns (only if data has non-zero values)
    if (isTokenReport) {
      const hasInput = tableData.some((r) => r.totalInputTokens > 0);
      const hasOutput = tableData.some((r) => r.totalOutputTokens > 0);
      const hasCacheCreate = tableData.some((r) => r.totalCacheCreationTokens > 0);
      const hasCacheRead = tableData.some((r) => r.totalCacheReadTokens > 0);

      if (hasInput) cols.push(columnHelper.accessor('totalInputTokens', {
        header: 'Input tokens', cell: (info) => formatCompact(info.getValue()), meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
      if (hasOutput) cols.push(columnHelper.accessor('totalOutputTokens', {
        header: 'Output tokens', cell: (info) => formatCompact(info.getValue()), meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
      if (hasCacheCreate) cols.push(columnHelper.accessor('totalCacheCreationTokens', {
        header: 'Cache create', cell: (info) => formatCompact(info.getValue()), meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
      if (hasCacheRead) cols.push(columnHelper.accessor('totalCacheReadTokens', {
        header: 'Cache read', cell: (info) => formatCompact(info.getValue()), meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
    }

    // Usage report columns (only if data has non-zero values)
    if (isUsageReport) {
      const hasMinutes = tableData.some((r) => r.totalMinutes > 0);
      const hasStorage = tableData.some((r) => r.totalStorageGBH > 0);

      if (hasMinutes) cols.push(columnHelper.accessor('totalMinutes', {
        header: 'Minutes',
        cell: (info) => { const v = info.getValue(); return v > 0 ? formatCompact(v) : '\u2014'; },
        meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
      if (hasStorage) cols.push(columnHelper.accessor('totalStorageGBH', {
        header: 'Storage (GB\u00B7h)',
        cell: (info) => { const v = info.getValue(); return v > 0 ? formatCompact(v) : '\u2014'; },
        meta: { align: 'end' },
      }) as ColumnDef<TableRow, unknown>);
    }

    // Helper to build flat columns, skipping the one used as the group column
    const flatCol = (key: string, header: string, fmt?: 'datetime' | 'end') => {
      if (key === groupByColumn) return null;
      return columnHelper.accessor(key as string & keyof TableRow, {
        header,
        cell: (info) => {
          const v = info.getValue();
          if (fmt === 'datetime') return formatDatetime(String(v));
          return String(v ?? '') || '\u2014';
        },
        ...(fmt === 'end' && { meta: { align: 'end' as const } }),
      }) as ColumnDef<TableRow, unknown>;
    };

    // Dynamic flat-report columns: enumerate all row keys that have at least one value
    if (isFlatReport && activeReport && activeReport.rows.length > 0) {
      const rowKeys = Object.keys(activeReport.rows[0] as unknown as Record<string, unknown>);
      for (const key of rowKeys) {
        if (key === groupByColumn) continue;
        if (!fieldsWithValues.has(key)) continue;

        // Detect format from sample value
        const sample = (activeReport.rows[0] as unknown as Record<string, unknown>)[key];
        const isNumeric = typeof sample === 'number';
        const isDatetime = typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}[T ]/.test(sample);

        const col = flatCol(key, humanizeColumn(key), isDatetime ? 'datetime' : isNumeric ? 'end' : undefined);
        if (col) cols.push(col);
      }
    }

    return cols;
  }, [groupByColumn, isTokenReport, isUsageReport, isFlatReport, activeReport, fieldsWithValues, tableData, handleGroupClick]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
    getRowId: (row) => row.id,
  });

  // Compute totals across ALL table data (not just current page)
  const totals = useMemo(() => {
    if (tableData.length === 0) return null;
    const sums: Record<string, number> = {};
    const visibleCols = table.getVisibleLeafColumns();
    for (const col of visibleCols) {
      const key = col.id;
      if (key === 'group') continue;
      const firstVal = (tableData[0] as Record<string, unknown>)[key];
      if (typeof firstVal !== 'number') continue;
      sums[key] = tableData.reduce((acc, row) => acc + (Number((row as Record<string, unknown>)[key]) || 0), 0);
    }
    return sums;
  }, [tableData, table]);

  if (!activeReport || tableData.length === 0) return null;

  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    <div className={styles.tableContainer}>
      <div className={styles.headerBar}>
        <div className={styles.titleGroup}>
          <h2 className={styles.tableTitle} id="report-table">
            Usage by {humanizeColumn(groupByColumn)}
            {' '}<CounterLabel>{totalRows.toLocaleString()}</CounterLabel>
          </h2>
          <div className={styles.tableSubtitle} id="report-table-subtitle">
            {visibleRows.length.toLocaleString()} filtered rows across{' '}
            {tableData.length.toLocaleString()} groups
          </div>
        </div>
        <div className={styles.controlsRow}>
          <OnboardingBubble step={ONBOARDING_STEPS.COLUMNS} alignRight>
            <ColumnVisibilityPanel table={table} />
          </OnboardingBubble>
        </div>
      </div>

      <div
        className={styles.scrollWrapper}
      >
        <table className={styles.table} role="table" aria-labelledby="report-table">
          <thead className={styles.thead}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={styles.tr}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={styles.th}
                    data-align={header.column.columnDef.meta?.align}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <button type="button" className={styles.sortButton}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon direction={header.column.getIsSorted()} />
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <TableBody table={table} />
          {totals && (
            <tfoot className={styles.tfoot}>
              <tr className={styles.tr}>
                {table.getVisibleLeafColumns().map((col) => {
                  const key = col.id;
                  if (key === 'group') {
                    return (
                      <td key={key} className={styles.tfootCell}>
                        Total
                      </td>
                    );
                  }
                  const val = totals[key];
                  if (val === undefined) {
                    return <td key={key} className={styles.tfootCell} data-align={col.columnDef.meta?.align} />;
                  }
                  // Format based on column type
                  const isCurrency = key.toLowerCase().includes('amount') || key.toLowerCase().includes('gross') || key.toLowerCase().includes('net') || key.toLowerCase().includes('discount');
                  return (
                    <td key={key} className={styles.tfootCell} data-align={col.columnDef.meta?.align}>
                      {isCurrency ? formatCurrency(val) : formatCompact(val)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalRows > 0 && (
        <PrimerTable.Pagination
          aria-label="Pagination for report table"
          pageSize={table.getState().pagination.pageSize}
          totalCount={totalRows}
          onChange={({ pageIndex: newPage }: { pageIndex: number }) => {
            table.setPageIndex(newPage);
          }}
        />
      )}
    </div>
  );
}
