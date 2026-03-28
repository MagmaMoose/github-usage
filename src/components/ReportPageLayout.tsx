import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FunctionComponent,
  type PropsWithChildren,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Heading,
  IconButton,
  Stack,
  Text,
  UnderlineNav,
} from '@primer/react';
import { PageHeader } from '@primer/react/experimental';
import type { IconProps } from '@primer/octicons-react';
import {
  ColumnsIcon,
  CopyIcon,
  CopilotIcon,
  DownloadIcon,
  GraphIcon,
  LinkIcon,
  OrganizationIcon,
  PackageIcon,
  PersonIcon,
  RepoIcon,
  ServerIcon,
  TableIcon,
  UploadIcon,
  WorkflowIcon,
  XIcon,
} from '@primer/octicons-react';
import { useReport } from '../context/useReport';
import { FilterBar } from './FilterBar';
import { FileDropzone } from './FileDropzone';
import { ReportTable } from './ReportTable';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import { GroupBreakdownChart } from './charts/ModelBreakdownChart';
import { CostBreakdownChart } from './charts/CostBreakdownChart';
import { SankeyChart } from './charts/SankeyChart';
import { PeriodSelector } from './PeriodSelector';
import { HeroCardsGrid } from './HeroCardsGrid';
import { useHighchartsInit } from './charts/useHighchartsInit';
import type { ReportSchema, MetricOption } from '../lib/report-schema';
import type { ReportType } from '../lib/types';
import { GROUPABLE_COLUMNS } from '../lib/types';
import { formatDateRange, formatDateRangeCompact } from '../lib/formatters';
import { computeSummary } from '../lib/aggregation';
import { parseCSV } from '../lib/csv-parser';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../lib/local-storage';
import { copyShareToClipboard } from '../lib/share-state';
import styles from '../App.module.css';

type ViewTab = 'charts' | 'table';

type FilterableField =
  | 'username'
  | 'model'
  | 'organization'
  | 'sku'
  | 'costCenterName'
  | 'product'
  | 'repository'
  | 'workflowPath';

const ALL_FILTERABLE_FIELDS: FilterableField[] = [
  'username', 'model', 'organization', 'sku', 'costCenterName', 'product', 'repository', 'workflowPath',
];

const FIELD_ICONS: Record<FilterableField, FunctionComponent<PropsWithChildren<IconProps>>> = {
  username: PersonIcon,
  model: GraphIcon,
  organization: OrganizationIcon,
  sku: ServerIcon,
  costCenterName: TableIcon,
  product: PackageIcon,
  repository: RepoIcon,
  workflowPath: WorkflowIcon,
};

const REPORT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  premium_request: CopilotIcon,
  token_usage: ServerIcon,
  usage_report: WorkflowIcon,
};

function downloadReportAsCsv(report: NonNullable<ReturnType<typeof useReport>['activeReport']>) {
  const rows = report.rows as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escapeValue = (value: unknown) => {
    const normalized = value == null ? '' : String(value);
    if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
      return `"${normalized.replaceAll('"', '""')}"`;
    }
    return normalized;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = report.fileName || 'usage-report.csv';
  link.click();
  URL.revokeObjectURL(objectUrl);
}

interface ReportPageLayoutProps {
  schema: ReportSchema;
  /** Only show reports whose type is in this list. Others are hidden for this page. */
  allowedReportTypes?: ReportType[];
  /** Override schema metricOptions (e.g., per-product metrics for usage reports) */
  metricOptions?: MetricOption[];
}

export function ReportPageLayout({ schema, allowedReportTypes, metricOptions }: ReportPageLayoutProps) {
  useHighchartsInit();
  const {
    reports: allReports,
    rawCsvs: allRawCsvs,
    activeReportIndex,
    setActiveReport,
    clearAllReports,
    activeReport: contextActiveReport,
    addReport,
    groupByColumn,
    setGroupByColumn,
    timeBucket,
    periodKey,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    clearFilters,
    visibleRows: contextVisibleRows,
  } = useReport();

  // Filter reports to only those matching the current page's allowed types
  const reports = useMemo(() => {
    if (!allowedReportTypes) return allReports;
    return allReports.filter((r) => allowedReportTypes.includes(r.type));
  }, [allReports, allowedReportTypes]);

  const rawCsvs = useMemo(() => {
    if (!allowedReportTypes) return allRawCsvs;
    return allRawCsvs.filter((_, i) => allowedReportTypes.includes(allReports[i]?.type));
  }, [allRawCsvs, allReports, allowedReportTypes]);

  // Active report is only valid if it matches this page's types
  const activeReport = useMemo(() => {
    if (!contextActiveReport) return null;
    if (allowedReportTypes && !allowedReportTypes.includes(contextActiveReport.type)) return null;
    return contextActiveReport;
  }, [contextActiveReport, allowedReportTypes]);

  // Use override metricOptions if provided, otherwise fall back to schema
  const effectiveMetrics = metricOptions ?? schema.metricOptions;

  // Page-level metric toggle (Spend vs Quantity/Minutes/etc.)
  const showMetricToggle = effectiveMetrics.length > 1;
  const [selectedMetricKey, setSelectedMetricKey] = useState('grossAmount');
  const activeMetric = effectiveMetrics.find((m) => m.key === selectedMetricKey) ?? effectiveMetrics[0];
  // Pass only the selected metric to charts so they don't render their own toggles
  const chartMetricOptions = showMetricToggle ? [activeMetric] : effectiveMetrics;

  const visibleRows = useMemo(
    () => (activeReport ? contextVisibleRows : []),
    [activeReport, contextVisibleRows],
  );

  const [activeTab, setActiveTabRaw] = useState<ViewTab>(() =>
    getStoredValue(STORAGE_KEYS.ACTIVE_TAB, 'charts') as ViewTab,
  );
  const setActiveTab = useCallback((tab: ViewTab) => {
    setActiveTabRaw(tab);
    setStoredValue(STORAGE_KEYS.ACTIVE_TAB, tab);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const handleReset = useCallback(() => {
    clearAllReports();
  }, [clearAllReports]);

  const handleAddFile = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        if (!file.name.endsWith('.csv')) continue;
        const text = await file.text();
        addReport(parseCSV(text, file.name), text);
      }
    },
    [addReport],
  );

  const summary = useMemo(() => {
    if (!activeReport || visibleRows.length === 0) return null;
    return computeSummary(visibleRows);
  }, [activeReport, visibleRows]);

  const getReportTabLabel = useCallback(
    (report: NonNullable<typeof activeReport>) => {
      const typeLabel = schema.label;
      const dateLabel = formatDateRangeCompact(report.dateRange.start, report.dateRange.end);
      return dateLabel ? `${typeLabel} (${dateLabel})` : typeLabel;
    },
    [schema.label],
  );

  const handleDownload = useCallback(() => {
    if (!activeReport) return;
    downloadReportAsCsv(activeReport);
  }, [activeReport]);

  const handleShare = useCallback(async () => {
    const csvs = reports.map((r, i) => ({ fileName: r.fileName, content: rawCsvs[i] }));
    const result = await copyShareToClipboard(
      { groupBy: groupByColumn, timeBucket, period: periodKey, search: searchQuery, filters },
      csvs,
    );
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
    if (result === 'csv') {
      console.info('Report data too large for URL — raw CSV copied to clipboard');
    }
  }, [reports, rawCsvs, groupByColumn, timeBucket, periodKey, searchQuery, filters]);

  // Filter fields available for the current report data
  const availableFilterFields = useMemo(() => {
    if (!activeReport) return schema.filterableFields as FilterableField[];

    const rowKeys = new Set(
      activeReport.rows.flatMap((row) => Object.keys(row as unknown as Record<string, unknown>)),
    );

    return ALL_FILTERABLE_FIELDS.filter(
      (field) => rowKeys.has(field) && schema.filterableFields.includes(field),
    );
  }, [activeReport, schema.filterableFields]);

  const filterValuesByField = useMemo(() => {
    const nextValues = new Map<FilterableField, string[]>();
    if (!activeReport) return nextValues;

    for (const field of availableFilterFields) {
      const values = [
        ...new Set(
          activeReport.rows
            .map((row) => String((row as unknown as Record<string, unknown>)[field] ?? '').trim())
            .filter(Boolean),
        ),
      ]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 100);
      nextValues.set(field, values);
    }
    return nextValues;
  }, [activeReport, availableFilterFields]);

  const applyAdvancedFilter = useCallback(
    (field: string, value: string) => {
      const nextValues = [...new Set([...(filters[field] ?? []), value])];
      setFilter(field, nextValues);
      setSearchQuery('');
    },
    [filters, setFilter, setSearchQuery],
  );

  const removeAdvancedFilter = useCallback(
    (field: string, value: string) => {
      const nextValues = (filters[field] ?? []).filter((v) => v !== value);
      setFilter(field, nextValues);
    },
    [filters, setFilter],
  );

  const clearAllToolbarFilters = useCallback(() => {
    clearFilters();
    setSearchQuery('');
  }, [clearFilters, setSearchQuery]);

  const groupableColumns = useMemo(() => {
    if (!activeReport) return schema.filterableFields;
    return [...(GROUPABLE_COLUMNS[activeReport.type] ?? schema.filterableFields)];
  }, [activeReport, schema.filterableFields]);

  const renderViewTabs = () => (
    <UnderlineNav aria-label="Usage viewer tabs" variant="flush" className={styles.primaryTabs}>
      <UnderlineNav.Item
        href="#"
        aria-current={activeTab === 'charts' ? 'page' : undefined}
        leadingVisual={<GraphIcon size={16} />}
        onSelect={(event) => { event.preventDefault(); setActiveTab('charts'); }}
      >
        Charts
      </UnderlineNav.Item>
      <UnderlineNav.Item
        href="#"
        aria-current={activeTab === 'table' ? 'page' : undefined}
        leadingVisual={<TableIcon size={16} />}
        onSelect={(event) => { event.preventDefault(); setActiveTab('table'); }}
      >
        Table
      </UnderlineNav.Item>
    </UnderlineNav>
  );

  // Empty state
  if (reports.length === 0) {
    return (
      <div className={styles.pageStack}>
        <PageHeader className={styles.pageHeader}>
          <PageHeader.TitleArea>
            <PageHeader.LeadingVisual>
              <GraphIcon size={24} />
            </PageHeader.LeadingVisual>
            <PageHeader.Title as="h1">{schema.emptyStateTitle}</PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Description>
            <span className={styles.pageDescription}>{schema.description}</span>
          </PageHeader.Description>
        </PageHeader>

        <section className={styles.emptyStateSurface} aria-labelledby="upload-report-heading">
          <div className={styles.emptyStateHeader}>
            <Heading as="h2" id="upload-report-heading" className={styles.surfaceTitle}>
              Get started
            </Heading>
            <Text as="p" className={styles.surfaceDescription}>
              {schema.emptyStateText}
            </Text>
          </div>
          <FileDropzone forceShow />
        </section>
      </div>
    );
  }

  const SchemaIcon = schema.icon;

  return (
    <div className={styles.pageStack}>
      <PageHeader className={styles.pageHeader}>
        <PageHeader.TitleArea>
          <PageHeader.LeadingVisual>
            <SchemaIcon size={24} />
          </PageHeader.LeadingVisual>
          <PageHeader.Title as="h1">
            {schema.label}
          </PageHeader.Title>
        </PageHeader.TitleArea>
        <PageHeader.Actions>
          <Stack direction="horizontal" gap="condensed">
            {showMetricToggle && (
              <ActionMenu>
                <ActionMenu.Button size="small">{activeMetric.label}</ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList selectionVariant="single">
                    {effectiveMetrics.map((opt) => (
                      <ActionList.Item
                        key={opt.key}
                        selected={activeMetric.key === opt.key}
                        onSelect={() => setSelectedMetricKey(opt.key)}
                      >
                        {opt.label}
                      </ActionList.Item>
                    ))}
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>
            )}
            <PeriodSelector />
            <Button size="small" leadingVisual={UploadIcon} onClick={() => fileInputRef.current?.click()}>
              Add file
            </Button>
            <Button size="small" variant="invisible" leadingVisual={XIcon} onClick={handleReset}>
              Clear
            </Button>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            className={styles.hiddenInput}
            onChange={(e) => {
              if (e.target.files) handleAddFile(e.target.files);
              e.target.value = '';
            }}
          />
        </PageHeader.Actions>
        <PageHeader.Description>
          <span className={styles.pageDescription}>
            Showing data from{' '}
            {activeReport
              ? formatDateRange(activeReport.dateRange.start, activeReport.dateRange.end)
              : ''}
          </span>
        </PageHeader.Description>
      </PageHeader>

      {summary && (
        <HeroCardsGrid
          schema={schema}
          summary={summary}
          visibleRows={visibleRows}
          reportType={activeReport!.type}
        />
      )}

      {reports.length > 1 && (() => {
        const typeCounts = new Map<string, number>();
        for (const r of reports) {
          typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
        }
        const hasMergeableReports = [...typeCounts.values()].some((c) => c >= 2);

        return (
          <UnderlineNav
            key={reports.length}
            aria-label="Uploaded reports"
            variant="flush"
            className={styles.reportTabs}
          >
            {hasMergeableReports && (
              <UnderlineNav.Item
                key="__combined__"
                href="#"
                aria-current={activeReportIndex === -1 ? 'page' : undefined}
                leadingVisual={<ColumnsIcon />}
                onSelect={(event) => { event.preventDefault(); setActiveReport(-1); }}
              >
                Combined
              </UnderlineNav.Item>
            )}
            {reports.map((report, i) => {
              const Icon = REPORT_TYPE_ICONS[report.type] ?? WorkflowIcon;
              return (
                <UnderlineNav.Item
                  key={report.fileName}
                  href="#"
                  aria-current={i === activeReportIndex ? 'page' : undefined}
                  leadingVisual={<Icon />}
                  onSelect={(event) => { event.preventDefault(); setActiveReport(i); }}
                >
                  {getReportTabLabel(report)}
                </UnderlineNav.Item>
              );
            })}
          </UnderlineNav>
        );
      })()}

      <section className={styles.contentSurface} aria-label="Usage viewer content">
        <div className={styles.surfaceTabsRow}>{renderViewTabs()}</div>

        <div className={styles.sectionToolbar}>
          <div className={styles.toolbarLeading}>
            <FilterBar
              availableFields={availableFilterFields}
              valuesByField={filterValuesByField}
              filters={filters}
              searchQuery={searchQuery}
              fieldIcons={FIELD_ICONS}
              groupByColumn={groupByColumn}
              groupableColumns={groupableColumns}
              onAddFilter={applyAdvancedFilter}
              onRemoveFilter={removeAdvancedFilter}
              onClearAll={clearAllToolbarFilters}
              onSearchChange={setSearchQuery}
              onGroupByChange={setGroupByColumn}
            />
          </div>
          <div className={styles.toolbarActions}>
            <IconButton
              aria-label={shareCopied ? 'Link copied!' : 'Copy share link'}
              icon={shareCopied ? CopyIcon : LinkIcon}
              size="small"
              variant="invisible"
              onClick={handleShare}
            />
            <IconButton
              aria-label="Download current report CSV"
              icon={DownloadIcon}
              size="small"
              variant="invisible"
              onClick={handleDownload}
            />
          </div>
        </div>

        <div role="tabpanel" className={styles.panelContent}>
          {visibleRows.length === 0 && (
            <div className={styles.emptyResultsState}>
              <Heading as="h3" className={styles.emptyResultsTitle}>
                No matching usage rows
              </Heading>
              <Text as="p" className={styles.surfaceDescription}>
                Try a different search term or clear the current period filter.
              </Text>
            </div>
          )}

          {activeTab === 'charts' && visibleRows.length > 0 && (
            <div className={styles.chartStack} key={activeReportIndex}>
              <div className={styles.chartSurface}>
                <TimeSeriesChart metricOptions={chartMetricOptions} />
              </div>
              <div className={styles.chartSurface}>
                <GroupBreakdownChart stackField={schema.breakdownStackField} metricOptions={chartMetricOptions} />
              </div>
              <div className={styles.chartSurface}>
                <CostBreakdownChart stackField={schema.breakdownStackField} metricOptions={chartMetricOptions} />
              </div>
              <div className={styles.chartSurface}>
                <SankeyChart hierarchy={schema.sankeyHierarchy} metricLabel={activeMetric.label} />
              </div>
            </div>
          )}

          {activeTab === 'table' && visibleRows.length > 0 && (
            <ReportTable />
          )}
        </div>
      </section>
    </div>
  );
}
