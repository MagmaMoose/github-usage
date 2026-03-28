import { useCallback, useRef, useMemo, useState } from 'react';
import {
  Button,
  PageHeader,
  Text,
  Dialog,
  Stack,
  IconButton,
} from '@primer/react';
import {
  DownloadIcon,
  FileIcon,
  TrashIcon,
  UploadIcon,
} from '@primer/octicons-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ColumnDef,
  type ColumnResizeMode,
} from '@tanstack/react-table';
import { useReport } from '../context/useReport';
import { getReportSchema } from '../lib/report-schema';
import { formatDateRange } from '../lib/formatters';
import { FileDropzone } from './FileDropzone';
import { parseCSV } from '../lib/csv-parser';
import styles from './CsvManager.module.css';
import tableStyles from './ReportTable.module.css';

interface FileRow {
  index: number;
  fileName: string;
  typeLabel: string;
  rowCount: number;
  rawSize: number;
  sizeLabel: string;
  dateStart: string;
  dateRange: string | null;
  Icon: React.ComponentType<{ size?: number }>;
}

const columnHelper = createColumnHelper<FileRow>();

function SortIcon({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (direction === 'asc') {
    return (
      <svg className={tableStyles.sortIcon} viewBox="0 0 16 16" fill="currentColor">
        <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z" />
      </svg>
    );
  }
  if (direction === 'desc') {
    return (
      <svg className={tableStyles.sortIcon} viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.927 13.427a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.25a.75.75 0 0 1 1.5 0V10h2.25a.25.25 0 0 1 .177.427l-3 3ZM0 3.75A.75.75 0 0 1 .75 3h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75ZM0 7.75A.75.75 0 0 1 .75 7h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75Zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Z" />
      </svg>
    );
  }
  return (
    <svg className={tableStyles.sortIconHidden} viewBox="0 0 16 16" fill="currentColor">
      <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z" />
    </svg>
  );
}

export function CsvManager() {
  const {
    reports,
    rawCsvs,
    addReport,
    removeReport,
    clearAllReports,
  } = useReport();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'fileName', desc: false }]);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const handleAddFile = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const text = await file.text();
        const parsed = parseCSV(text, file.name);
        addReport(parsed, text);
      }
    },
    [addReport],
  );

  const handleDownloadFile = useCallback(
    (index: number) => {
      const report = reports[index];
      const csv = rawCsvs[index];
      if (!report || !csv) return;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
    [reports, rawCsvs],
  );

  const handleDownloadAll = useCallback(() => {
    reports.forEach((_, i) => {
      setTimeout(() => handleDownloadFile(i), i * 200);
    });
  }, [reports, handleDownloadFile]);

  const handleDeleteFile = useCallback(
    (index: number) => {
      removeReport(index);
    },
    [removeReport],
  );

  const handleDeleteAll = useCallback(() => {
    clearAllReports();
    setConfirmDeleteAll(false);
  }, [clearAllReports]);

  const fileData = useMemo<FileRow[]>(() => {
    return reports.map((report, index) => {
      const schema = getReportSchema(report.type);
      const rawSize = rawCsvs[index]?.length ?? 0;
      const sizeLabel =
        rawSize > 1_000_000
          ? `${(rawSize / 1_000_000).toFixed(1)} MB`
          : rawSize > 1_000
            ? `${(rawSize / 1_000).toFixed(0)} KB`
            : `${rawSize} B`;

      return {
        index,
        fileName: report.fileName,
        typeLabel: schema.label,
        rowCount: report.rows.length,
        rawSize,
        dateStart: report.dateRange?.start ?? '',
        dateRange: report.dateRange
          ? formatDateRange(report.dateRange.start, report.dateRange.end)
          : null,
        sizeLabel,
        Icon: schema.icon,
      };
    });
  }, [reports, rawCsvs]);

  const columns = useMemo<ColumnDef<FileRow, unknown>[]>(() => [
    columnHelper.accessor('fileName', {
      header: 'Name',
      size: 300,
      minSize: 120,
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className={styles.nameCell}>
            <row.Icon size={16} />
            <span className={styles.truncate}>{info.getValue()}</span>
          </span>
        );
      },
      sortingFn: 'alphanumeric',
    }) as ColumnDef<FileRow, unknown>,
    columnHelper.accessor('typeLabel', {
      header: 'Type',
      size: 160,
      minSize: 100,
      sortingFn: 'alphanumeric',
    }) as ColumnDef<FileRow, unknown>,
    columnHelper.accessor('rowCount', {
      header: 'Rows',
      size: 80,
      minSize: 60,
      cell: (info) => info.getValue().toLocaleString(),
      meta: { align: 'end' },
    }) as ColumnDef<FileRow, unknown>,
    columnHelper.accessor('rawSize', {
      header: 'Size',
      size: 80,
      minSize: 60,
      cell: (info) => info.row.original.sizeLabel,
      meta: { align: 'end' },
    }) as ColumnDef<FileRow, unknown>,
    columnHelper.accessor('dateStart', {
      header: 'Date range',
      size: 180,
      minSize: 100,
      cell: (info) => info.row.original.dateRange ?? '—',
    }) as ColumnDef<FileRow, unknown>,
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className={styles.rowActions}>
            <IconButton
              size="small"
              variant="invisible"
              icon={DownloadIcon}
              aria-label="Download"
              onClick={() => handleDownloadFile(row.index)}
            />
            <IconButton
              size="small"
              variant="danger"
              icon={TrashIcon}
              aria-label="Delete"
              onClick={() => handleDeleteFile(row.index)}
            />
          </span>
        );
      },
      meta: { align: 'end' },
      enableResizing: false,
    }),
  ], [handleDownloadFile, handleDeleteFile]);

  const table = useReactTable({
    data: fileData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    columnResizeMode,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (reports.length === 0) {
    return (
      <div className={styles.pageStack}>
        <PageHeader className={styles.pageHeader}>
          <PageHeader.TitleArea>
            <PageHeader.LeadingVisual>
              <FileIcon size={24} />
            </PageHeader.LeadingVisual>
            <PageHeader.Title as="h1">Manage files</PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Description>
            <Text as="p" style={{ color: 'var(--fgColor-muted)' }}>
              Upload CSV reports to get started. You can manage, export, and delete them here.
            </Text>
          </PageHeader.Description>
        </PageHeader>
        <div className={styles.emptyState}>
          <FileDropzone forceShow reportType="usage_report" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack}>
      <PageHeader className={styles.pageHeader}>
        <PageHeader.TitleArea>
          <PageHeader.LeadingVisual>
            <FileIcon size={24} />
          </PageHeader.LeadingVisual>
          <PageHeader.Title as="h1">Manage files</PageHeader.Title>
        </PageHeader.TitleArea>
        <PageHeader.Actions>
          <Stack direction="horizontal" gap="condensed" align="center">
            <Button
              size="small"
              leadingVisual={DownloadIcon}
              onClick={handleDownloadAll}
            >
              Download all
            </Button>
            <Button
              size="small"
              variant="danger"
              leadingVisual={TrashIcon}
              onClick={() => setConfirmDeleteAll(true)}
            >
              Delete all
            </Button>
            <Button
              size="small"
              variant="primary"
              leadingVisual={UploadIcon}
              onClick={() => fileInputRef.current?.click()}
            >
              Add file
            </Button>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) handleAddFile(e.target.files);
              e.target.value = '';
            }}
          />
        </PageHeader.Actions>
        <PageHeader.Description>
          <Text as="p" style={{ color: 'var(--fgColor-muted)' }}>
            {reports.length} file{reports.length !== 1 ? 's' : ''} uploaded
          </Text>
        </PageHeader.Description>
      </PageHeader>

      <div className={tableStyles.scrollWrapper}>
        <table className={tableStyles.table} style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead className={tableStyles.thead}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={tableStyles.th}
                    data-align={header.column.columnDef.meta?.align}
                    style={{ width: header.getSize(), position: 'relative' }}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        className={tableStyles.sortButton}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {header.column.getCanResize() && (
                      <div
                        className={`${styles.resizer} ${header.column.getIsResizing() ? styles.isResizing : ''}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className={tableStyles.tbody}>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={tableStyles.tr}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={tableStyles.td}
                    data-align={cell.column.columnDef.meta?.align}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDeleteAll && (
        <Dialog
          title="Delete all files?"
          onClose={() => setConfirmDeleteAll(false)}
          footerButtons={[
            { content: 'Cancel', onClick: () => setConfirmDeleteAll(false) },
            { content: 'Delete all', onClick: handleDeleteAll, buttonType: 'danger' },
          ]}
        >
          <Text as="p">
            This will permanently remove all {reports.length} uploaded files and clear all cached data.
            This action cannot be undone.
          </Text>
        </Dialog>
      )}
    </div>
  );
}
