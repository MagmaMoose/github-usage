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
import { Avatar, Button, SelectPanel } from '@primer/react';
import { Table as PrimerTable } from '@primer/react/experimental';
import { ColumnsIcon, CreditCardIcon, PackageIcon, RepoIcon, WorkflowIcon } from '@primer/octicons-react';
import { OnboardingBubble, ONBOARDING_STEPS } from './onboarding';
import { type ActionListItemInput } from '@primer/react/deprecated';
import { useReport } from '../context/useReport';
import { groupBy, sumBy } from '../lib/aggregation';
import { formatCurrency, formatCompact, humanizeColumn, formatDisplayValue, getAvatarUrl, formatDatetime } from '../lib/formatters';
import type { AnyReportRow, TokenUsageRow, UsageReportRow, CopilotSeatActivityRow, DormantUsersRow, GhasActiveCommittersRow } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';
import { getModelIconUrl } from '../lib/chart-theme';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../lib/local-storage';
import styles from './ReportTable.module.css';

/** Icon to show next to non-avatar, non-model group values */
const COLUMN_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  sku: PackageIcon,
  product: PackageIcon,
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
  // Seat activity columns (flat rows)
  reportTime: string;
  login: string;
  lastAuthenticatedAt: string;
  lastActivityAt: string;
  lastSurfaceUsed: string;
  organization: string;
  // Dormant users columns (flat rows)
  role: string;
  createdAt: string;
  memberId: number;
  lastLoggedIp: string;
  twoFactorEnabled: string;
  outsideCollaborator: string;
  // GHAS columns (flat rows)
  userLogin: string;
  repository: string;
  lastPushedDate: string;
  lastPushedEmail: string;
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
  const isSeatActivity = reportType === REPORT_TYPES.COPILOT_SEAT_ACTIVITY;
  const isDormantUsers = reportType === REPORT_TYPES.DORMANT_USERS;
  const isGhas = reportType === REPORT_TYPES.GHAS_ACTIVE_COMMITTERS;
  const isFlatReport = isSeatActivity || isDormantUsers || isGhas;

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

  const emptyRow: Omit<TableRow, 'id' | 'group'> = {
    count: 0, grossAmount: 0, discountAmount: 0, netAmount: 0, quantity: 0,
    totalInputTokens: 0, totalOutputTokens: 0, totalCacheCreationTokens: 0, totalCacheReadTokens: 0,
    totalMinutes: 0, totalStorageGBH: 0,
    reportTime: '', login: '', lastAuthenticatedAt: '', lastActivityAt: '', lastSurfaceUsed: '', organization: '',
    role: '', createdAt: '', memberId: 0, lastLoggedIp: '', twoFactorEnabled: '', outsideCollaborator: '',
    userLogin: '', repository: '', lastPushedDate: '', lastPushedEmail: '',
  };

  const tableData = useMemo(() => {
    if (!activeReport) return [];

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
        const first = rows[0] as Record<string, unknown>;
        const base: TableRow = {
          ...emptyRow,
          id: key,
          group: key,
          count: rows.length,
        };
        // Copy all string/number fields from the first row for display
        for (const [field, val] of Object.entries(first)) {
          if (field in base) {
            if (typeof val === 'boolean') {
              (base as Record<string, unknown>)[field] = val ? 'Yes' : 'No';
            } else if (typeof val === 'string' || typeof val === 'number') {
              (base as Record<string, unknown>)[field] = val;
            }
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
  }, [activeReport, groupByColumn, visibleRows, isTokenReport, isUsageReport, isSeatActivity, isDormantUsers, isGhas]);

  const activeFilterValues = filters[groupByColumn] ?? [];

  const handleGroupClick = useCallback(
    (value: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Toggle: if already filtered to this value, clear the filter
      const isActive = activeFilterValues.some((v) => v.toLowerCase() === value.toLowerCase());
      setFilter(groupByColumn, isActive ? [] : [value]);
      if (!isActive) onGroupClick?.();
    },
    [groupByColumn, activeFilterValues, setFilter, onGroupClick],
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
          const ColumnIcon = COLUMN_ICONS[groupByColumn];
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

    // Token columns (token usage reports only)
    if (isTokenReport) {
      cols.push(
        columnHelper.accessor('totalInputTokens', {
          header: 'Input tokens',
          cell: (info) => formatCompact(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
        columnHelper.accessor('totalOutputTokens', {
          header: 'Output tokens',
          cell: (info) => formatCompact(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
        columnHelper.accessor('totalCacheCreationTokens', {
          header: 'Cache create',
          cell: (info) => formatCompact(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
        columnHelper.accessor('totalCacheReadTokens', {
          header: 'Cache read',
          cell: (info) => formatCompact(info.getValue()),
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
      );
    }

    // Usage report columns (metered usage only)
    if (isUsageReport) {
      cols.push(
        columnHelper.accessor('totalMinutes', {
          header: 'Minutes',
          cell: (info) => {
            const v = info.getValue();
            return v > 0 ? formatCompact(v) : '—';
          },
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
        columnHelper.accessor('totalStorageGBH', {
          header: 'Storage (GB·h)',
          cell: (info) => {
            const v = info.getValue();
            return v > 0 ? formatCompact(v) : '—';
          },
          meta: { align: 'end' },
        }) as ColumnDef<TableRow, unknown>,
      );
    }

    // Helper to build flat columns, skipping the one used as the group column
    const flatCol = (key: keyof TableRow, header: string, fmt?: 'datetime' | 'end') => {
      if (key === groupByColumn) return null;
      return columnHelper.accessor(key, {
        header,
        cell: (info) => {
          const v = info.getValue();
          if (fmt === 'datetime') return formatDatetime(String(v));
          return String(v ?? '') || '\u2014';
        },
        ...(fmt === 'end' && { meta: { align: 'end' as const } }),
      }) as ColumnDef<TableRow, unknown>;
    };

    // Seat activity columns
    if (isSeatActivity) {
      [
        flatCol('login', 'Login'),
        flatCol('reportTime', 'Report Time', 'datetime'),
        flatCol('lastAuthenticatedAt', 'Last Authenticated', 'datetime'),
        flatCol('lastActivityAt', 'Last Activity', 'datetime'),
        flatCol('lastSurfaceUsed', 'Surface'),
        flatCol('organization', 'Organization'),
      ].forEach((c) => c && cols.push(c));
    }

    // Dormant users columns
    if (isDormantUsers) {
      [
        flatCol('login', 'Login'),
        flatCol('memberId', 'ID', 'end'),
        flatCol('role', 'Role'),
        flatCol('createdAt', 'Created', 'datetime'),
        flatCol('lastLoggedIp', 'Last IP'),
        flatCol('twoFactorEnabled', '2FA'),
        flatCol('outsideCollaborator', 'Outside Collab'),
      ].forEach((c) => c && cols.push(c));
    }

    // GHAS columns
    if (isGhas) {
      [
        flatCol('userLogin', 'User'),
        flatCol('organization', 'Organization'),
        flatCol('repository', 'Repository'),
        flatCol('lastPushedDate', 'Last Pushed'),
        flatCol('lastPushedEmail', 'Email'),
      ].forEach((c) => c && cols.push(c));
    }

    return cols;
  }, [groupByColumn, isTokenReport, isUsageReport, isFlatReport, isSeatActivity, isDormantUsers, isGhas, handleGroupClick]);

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

  if (!activeReport || tableData.length === 0) return null;

  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    <div className={styles.tableContainer}>
      <div className={styles.headerBar}>
        <div className={styles.titleGroup}>
          <h2 className={styles.tableTitle} id="report-table">
            Usage by {humanizeColumn(groupByColumn)}
            <span className={styles.rowCount}>{totalRows.toLocaleString()}</span>
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
