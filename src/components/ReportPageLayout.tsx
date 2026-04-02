import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type FunctionComponent,
  type PropsWithChildren,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Heading,
  IconButton,
  RelativeTime,
  Spinner,
  Stack,
  Text,
  UnderlineNav,
} from '@primer/react';
import { PageHeader } from '@primer/react/experimental';
import type { IconProps } from '@primer/octicons-react';
import {
  AiModelIcon,
  AppsIcon,
  ColumnsIcon,
  CopilotIcon,
  CpuIcon,
  CreditCardIcon,
  DeviceDesktopIcon,
  DownloadIcon,
  FileIcon,
  GraphIcon,
  IdBadgeIcon,
  OrganizationIcon,
  PersonIcon,
  RepoIcon,
  ShieldIcon,
  TableIcon,
  TagIcon,
  UploadIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import { useReport } from '../context/useReport';
import { FilterBar } from './FilterBar';
import { FileDropzone } from './FileDropzone';
import { ReportTable } from './ReportTable';
// Lazy-load chart components: Highcharts (365 KB) + Sankey module (23 KB) are
// only needed when data is loaded AND the Charts tab is active.
const TimeSeriesChart = lazy(() => import('./charts/TimeSeriesChart').then(m => ({ default: m.TimeSeriesChart })));
const GroupBreakdownChart = lazy(() => import('./charts/ModelBreakdownChart').then(m => ({ default: m.GroupBreakdownChart })));
const CostBreakdownChart = lazy(() => import('./charts/CostBreakdownChart').then(m => ({ default: m.CostBreakdownChart })));
const SankeyChart = lazy(() => import('./charts/SankeyChart').then(m => ({ default: m.SankeyChart })));
import { LazyChart } from './charts/LazyChart';
import { PeriodSelector } from './PeriodSelector';
import { HeroCardsGrid } from './HeroCardsGrid';
import { useHighchartsInit } from './charts/useHighchartsInit';
import { getReportSchema, type ReportSchema, type MetricOption } from '../lib/report-schema';
import type { ReportType } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';
import { formatDateRangeCompact, preloadBotAvatars, formatDate } from '../lib/formatters';
import { computeSummary } from '../lib/aggregation';
import { importFiles } from '../lib/import';
import { ACCEPTED_FILE_TYPES } from '../lib/zip';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../lib/local-storage';
import { readURLFilterState, writeURLFilterState } from '../lib/url-state';
import { OnboardingBubble, ONBOARDING_STEPS } from './onboarding';
import styles from '../App.module.css';

type ViewTab = 'charts' | 'table';

type FilterableField = string;

/** Fields excluded from groupBy/filter dropdowns (high-cardinality or numeric/metric values) */
const EXCLUDED_FIELD_PATTERNS = [
  // Unique/high-cardinality identifiers
  /url$/i,           // profileUrl
  /email$/i,         // lastPushedEmail, visualStudioSubscriptionEmail
  /^id$/i,           // numeric IDs
  /ip$/i,            // lastLoggedIp
  /path$/i,          // workflowPath (keep in preferred if schema says so)
  // Timestamps
  /^date$/i,         // raw date column
  /^created/i,       // createdAt
  /^report\s*time/i, // reportTime
  /^last.*at$/i,     // lastAuthenticatedAt, lastActivityAt
  /^last.*date$/i,   // lastPushedDate
  // Numeric/metric fields
  /amount$/i,        // grossAmount, netAmount, discountAmount, aicGrossAmount
  /quantity$/i,      // quantity, aicQuantity
  /quota$/i,         // totalMonthlyQuota
  /cost/i,           // appliedCostPerQuantity, aicGrossAmount
  /^total/i,         // totalInputTokens, totalOutputTokens, totalUserAccounts, etc.
  /tokens?$/i,       // totalInputTokens, totalOutputTokens
  /^exceeds/i,       // exceedsQuota
  /^unitType$/i,     // unitType (minutes, requests, etc.)
  /^count$/i,        // count fields
];

/** Returns true if a field should be excluded from filter/groupBy (unless it's in the schema's preferred list) */
function isExcludedField(field: string): boolean {
  return EXCLUDED_FIELD_PATTERNS.some((p) => p.test(field));
}

const FIELD_ICONS: Record<string, FunctionComponent<PropsWithChildren<IconProps>>> = {
  username: PersonIcon,
  model: AiModelIcon,
  organization: OrganizationIcon,
  sku: TagIcon,
  costCenterName: CreditCardIcon,
  product: AppsIcon,
  repository: RepoIcon,
  workflowPath: WorkflowIcon,
  login: PersonIcon,
  userLogin: PersonIcon,
  licenseType: IdBadgeIcon,
  enterpriseRoles: ShieldIcon,
  role: ShieldIcon,
  lastSurfaceUsed: DeviceDesktopIcon,
};

const REPORT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  premium_request: CopilotIcon,
  token_usage: CpuIcon,
  usage_report: GraphIcon,
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
    activeReportIndex,
    setActiveReport,
    activeReport: contextActiveReport,
    addReport,
    groupByColumn,
    setGroupByColumn,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    clearFilters,
    visibleRows: contextVisibleRows,
    isHydrating,
    combinedGroups: allCombinedGroups,
  } = useReport();

  // Filter reports to only those matching the current page's allowed types,
  // preserving a mapping from filtered index → global index so tab clicks
  // activate the correct report in the context.
  const { reports, globalIndexMap } = useMemo(() => {
    if (!allowedReportTypes) {
      return {
        reports: allReports,
        globalIndexMap: allReports.map((_, i) => i),
      };
    }
    const filtered: typeof allReports = [];
    const indexMap: number[] = [];
    for (let i = 0; i < allReports.length; i++) {
      if (allowedReportTypes.includes(allReports[i].type)) {
        filtered.push(allReports[i]);
        indexMap.push(i);
      }
    }
    return { reports: filtered, globalIndexMap: indexMap };
  }, [allReports, allowedReportTypes]);

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
  const [selectedMetricKey, setSelectedMetricKeyRaw] = useState(() => {
    const urlState = readURLFilterState();
    return urlState.metric ?? 'grossAmount';
  });
  const setSelectedMetricKey = useCallback((key: string) => {
    setSelectedMetricKeyRaw(key);
    writeURLFilterState({ metric: key });
  }, []);
  const activeMetric = effectiveMetrics.find((m) => m.key === selectedMetricKey) ?? effectiveMetrics[0];
  // Pass only the selected metric to charts so they don't render their own toggles
  const chartMetricOptions = showMetricToggle ? [activeMetric] : effectiveMetrics;

  const visibleRows = useMemo(
    () => (activeReport ? contextVisibleRows : []),
    [activeReport, contextVisibleRows],
  );

  // Pre-warm the avatar cache for any bot usernames in the current data
  useEffect(() => {
    const usernames = visibleRows
      .map((r) => (r as unknown as Record<string, unknown>).username as string)
      .filter(Boolean);
    if (usernames.length === 0) return;
    preloadBotAvatars(usernames);
  }, [visibleRows]);

  const [activeTab, setActiveTabRaw] = useState<ViewTab>(() => {
    const urlState = readURLFilterState();
    return (urlState.tab as ViewTab) ?? getStoredValue(STORAGE_KEYS.ACTIVE_TAB, 'charts') as ViewTab;
  });
  const setActiveTab = useCallback((tab: ViewTab) => {
    setActiveTabRaw(tab);
    setStoredValue(STORAGE_KEYS.ACTIVE_TAB, tab);
    writeURLFilterState({ tab });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleAddFile = useCallback(
    async (files: FileList) => {
      await importFiles(Array.from(files), addReport);
    },
    [addReport],
  );

  const summary = useMemo(() => {
    if (!activeReport || visibleRows.length === 0) return null;
    return computeSummary(visibleRows);
  }, [activeReport, visibleRows]);

  // Pure function: no deps needed, no memoization benefit
  const getReportTabLabel = (report: NonNullable<typeof activeReport>) => {
    const typeLabel = getReportSchema(report.type).label;
    const dateLabel = formatDateRangeCompact(report.dateRange.start, report.dateRange.end);
    return dateLabel ? `${typeLabel} (${dateLabel})` : typeLabel;
  };

  const handleDownload = useCallback(() => {
    if (!activeReport) return;
    downloadReportAsCsv(activeReport);
  }, [activeReport]);

  // Filter fields available for the current report data — derived from actual row keys.
  // schema.filterableFields controls ordering (preferred fields first).
  // Non-categorical fields (URLs, IPs, timestamps) are excluded unless explicitly preferred.
  // Derive available fields from row keys, with schema-preferred fields first.
  // Used for both filter dropdowns and groupBy column selection.
  const availableFields = useMemo(() => {
    if (!activeReport || activeReport.rows.length === 0) return schema.filterableFields;

    const rowKeys = new Set(
      Object.keys(activeReport.rows[0] as unknown as Record<string, unknown>),
    );

    const preferred = schema.filterableFields.filter((f) => rowKeys.has(f));
    const preferredSet = new Set(preferred);
    const rest = [...rowKeys]
      .filter((k) => !preferredSet.has(k) && !isExcludedField(k))
      .sort();
    return [...preferred, ...rest];
  }, [activeReport, schema.filterableFields]);

  const filterValuesByField = useMemo(() => {
    const nextValues = new Map<FilterableField, string[]>();
    if (!activeReport) return nextValues;

    for (const field of availableFields) {
      const values = [
        ...new Set(
          activeReport.rows
            .map((row) => String((row as unknown as Record<string, unknown>)[field] ?? '').trim())
            .filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right));
      nextValues.set(field, values);
    }
    return nextValues;
  }, [activeReport, availableFields]);

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
    if (isHydrating) {
      return (
        <div className={styles.pageStack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Spinner size="large" srText="Loading cached reports" delay="short" />
        </div>
      );
    }
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
          <FileDropzone forceShow reportType={schema.type} />
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
          <Stack direction="horizontal" gap="condensed" align="center">
            {reports.length > 1 && (() => {
              const combinedGroups = allowedReportTypes
                ? allCombinedGroups.filter((g) => allowedReportTypes.includes(g.type))
                : allCombinedGroups;

              // Label for the current selection
              const currentLabel = activeReport
                ? getReportTabLabel(activeReport)
                : 'Select report';

              return (
                <ActionMenu>
                  <ActionMenu.Button size="small" leadingVisual={FileIcon}>
                    {currentLabel}
                  </ActionMenu.Button>
                  <ActionMenu.Overlay width="auto">
                    <ActionList selectionVariant="single">
                      {combinedGroups.map((group) => (
                        <ActionList.Item
                          key={`__combined_${group.index}__`}
                          selected={activeReportIndex === group.index}
                          onSelect={() => setActiveReport(group.index)}
                        >
                          <ActionList.LeadingVisual><ColumnsIcon /></ActionList.LeadingVisual>
                          {group.label}
                        </ActionList.Item>
                      ))}
                      {combinedGroups.length > 0 && <ActionList.Divider />}
                      {reports.map((report, i) => {
                        const globalIdx = globalIndexMap[i];
                        const Icon = REPORT_TYPE_ICONS[report.type] ?? WorkflowIcon;
                        return (
                          <ActionList.Item
                            key={`${report.fileName}_${globalIdx}`}
                            selected={globalIdx === activeReportIndex}
                            onSelect={() => setActiveReport(globalIdx)}
                          >
                            <ActionList.LeadingVisual><Icon /></ActionList.LeadingVisual>
                            {getReportTabLabel(report)}
                          </ActionList.Item>
                        );
                      })}
                    </ActionList>
                  </ActionMenu.Overlay>
                </ActionMenu>
              );
            })()}
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
            <OnboardingBubble step={ONBOARDING_STEPS.ADD_FILE} alignRight>
              <Button size="small" variant="primary" leadingVisual={UploadIcon} onClick={() => fileInputRef.current?.click()}>
                Add file
              </Button>
            </OnboardingBubble>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
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
            {activeReport && activeReport.dateRange.start && activeReport.dateRange.end && /^\d{4}-\d{2}-\d{2}/.test(activeReport.dateRange.end) && (
              <>
                {formatDate(activeReport.dateRange.start)} —{' '}
                <RelativeTime
                  datetime={activeReport.dateRange.end + 'T00:00:00'}
                  prefix=""
                  threshold="P30D"
                  tense="past"
                  noTitle
                />
              </>
            )}
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

      <section className={styles.contentSurface} aria-label="Usage viewer content">
        <div className={styles.surfaceTabsRow}>
          <OnboardingBubble step={ONBOARDING_STEPS.VIEW_TABS}>
            {renderViewTabs()}
          </OnboardingBubble>
        </div>

        <div className={styles.sectionToolbar}>
          <div className={styles.toolbarLeading}>
            <OnboardingBubble step={ONBOARDING_STEPS.FILTER_BAR}>
              <FilterBar
                availableFields={availableFields}
                valuesByField={filterValuesByField}
                filters={filters}
                searchQuery={searchQuery}
                fieldIcons={FIELD_ICONS}
                groupByColumn={groupByColumn}
                groupableColumns={availableFields}
                onAddFilter={applyAdvancedFilter}
                onRemoveFilter={removeAdvancedFilter}
                onClearAll={clearAllToolbarFilters}
                onSearchChange={setSearchQuery}
                onGroupByChange={setGroupByColumn}
              />
            </OnboardingBubble>
          </div>
          <div className={styles.toolbarActions}>
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
                {Object.keys(filters).length > 0
                  ? `Active filters (${Object.entries(filters).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}) may not apply to this report.`
                  : 'Try a different search term or clear the current period filter.'}
              </Text>
              {Object.keys(filters).length > 0 && (
                <Button variant="default" size="small" onClick={clearAllToolbarFilters} style={{ marginTop: 8 }}>
                  Clear all filters
                </Button>
              )}
            </div>
          )}

          {activeTab === 'charts' && (() => {
            const hasData = visibleRows.length > 0;
            const isFlatReport = activeReport?.type === REPORT_TYPES.GHAS_ACTIVE_COMMITTERS
              || activeReport?.type === REPORT_TYPES.DORMANT_USERS
              || activeReport?.type === REPORT_TYPES.COPILOT_SEAT_ACTIVITY
              || activeReport?.type === REPORT_TYPES.ENTERPRISE_MEMBERS;
            return (
              /* No outer Suspense here — each LazyChart has its own Suspense boundary
                 so React's hideInstance only affects individual charts, not the entire stack. */
              <div className={styles.chartStack} key={activeReportIndex} style={hasData ? undefined : { visibility: 'hidden' }}>
                {!isFlatReport && (
                  <div className={styles.chartSurface}>
                    <Suspense fallback={null}>
                      <TimeSeriesChart metricOptions={chartMetricOptions} />
                    </Suspense>
                  </div>
                )}
                <LazyChart className={styles.chartSurface}>
                  <GroupBreakdownChart stackField={schema.breakdownStackField} metricOptions={chartMetricOptions} />
                </LazyChart>
                {!isFlatReport && (
                  <LazyChart className={styles.chartSurface}>
                    <CostBreakdownChart stackField={schema.breakdownStackField} metricOptions={chartMetricOptions} />
                  </LazyChart>
                )}
                <LazyChart className={styles.chartSurface}>
                  <SankeyChart hierarchy={schema.sankeyHierarchy} metric={activeMetric} />
                </LazyChart>
              </div>
            );
          })()}

          {activeTab === 'table' && visibleRows.length > 0 && (
            <ReportTable />
          )}
        </div>
      </section>
    </div>
  );
}
