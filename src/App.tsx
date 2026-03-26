import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FunctionComponent,
  type PropsWithChildren,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Autocomplete,
  Button,
  Heading,
  IconButton,
  NavList,
  PageLayout,
  Stack,
  Text,
  Token,
  UnderlineNav,
} from '@primer/react';
import { PageHeader } from '@primer/react/experimental';
import type { IconProps } from '@primer/octicons-react';
import {
  CopilotIcon,
  DownloadIcon,
  FilterIcon,
  GraphIcon,
  MeterIcon,
  SearchIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  TableIcon,
  UploadIcon,
  ServerIcon,
  WorkflowIcon,
  XIcon,
} from '@primer/octicons-react';
import { ReportProvider } from './context/ReportContext';
import { useReport } from './context/useReport';
import { FileDropzone } from './components/FileDropzone';
import { ReportTable } from './components/ReportTable';
import { TimeSeriesChart } from './components/charts/TimeSeriesChart';
import { ModelBreakdownChart } from './components/charts/ModelBreakdownChart';
import { CostBreakdownChart } from './components/charts/CostBreakdownChart';
import { useHighchartsInit } from './components/charts/useHighchartsInit';
import { PeriodSelector } from './components/PeriodSelector';
import { REPORT_TYPES } from './lib/types';
import type { TokenUsageRow } from './lib/types';
import { formatCurrency, formatCompact, formatDateRange, formatDateRangeCompact, humanizeColumn } from './lib/formatters';
import { computeSummary, topN } from './lib/aggregation';
import { parseCSV } from './lib/csv-parser';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from './lib/local-storage';
import styles from './App.module.css';

type ViewTab = 'charts' | 'table';
type FilterableField =
  | 'username'
  | 'model'
  | 'organization'
  | 'sku'
  | 'costCenterName'
  | 'product'
  | 'repository';

type AutocompleteSuggestion = {
  id: string;
  text?: string;
  leadingVisual?: FunctionComponent<PropsWithChildren<IconProps>>;
  metadata:
    | { type: 'field'; field: FilterableField }
    | { type: 'value'; field: FilterableField; value: string };
};

interface InsightNavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  current?: boolean;
  disabled?: boolean;
}

const INSIGHTS_NAV_ITEMS: InsightNavItem[] = [
  { label: 'Copilot usage', icon: CopilotIcon, current: true },
  { label: 'GitHub Actions usage', icon: MeterIcon, disabled: true },
];

const TIME_BUCKET_OPTIONS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
] as const;

const FILTERABLE_FIELDS: FilterableField[] = [
  'username',
  'model',
  'organization',
  'sku',
  'costCenterName',
  'product',
  'repository',
];

const FIELD_ICONS: Record<FilterableField, FunctionComponent<PropsWithChildren<IconProps>>> = {
  username: CopilotIcon,
  model: GraphIcon,
  organization: MeterIcon,
  sku: ServerIcon,
  costCenterName: TableIcon,
  product: WorkflowIcon,
  repository: WorkflowIcon,
};

function parseAdvancedFilter(value: string) {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex === -1) return null;

  const field = value.slice(0, separatorIndex).trim() as FilterableField;
  const filterValue = value.slice(separatorIndex + 1).trim();

  if (!FILTERABLE_FIELDS.includes(field) || !filterValue) return null;

  return { field, value: filterValue };
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  [REPORT_TYPES.PREMIUM_REQUEST]: 'Premium Requests',
  [REPORT_TYPES.TOKEN_USAGE]: 'Token Usage',
  [REPORT_TYPES.USAGE_REPORT]: 'Usage Report',
};

const REPORT_TYPE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  [REPORT_TYPES.PREMIUM_REQUEST]: CopilotIcon,
  [REPORT_TYPES.TOKEN_USAGE]: ServerIcon,
  [REPORT_TYPES.USAGE_REPORT]: WorkflowIcon,
};

/** Hero card — mimics @github-ui/data-card DataCard */
function HeroCard({
  title,
  value,
  description,
  children,
}: {
  title: string;
  value: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.heroCard}>
      <div className={styles.heroCardInner}>
        <h3 className={styles.heroCardTitle}>{title}</h3>
        <div className={styles.heroCardValue}>{value}</div>
        {description && <p className={styles.heroCardDescription}>{description}</p>}
        {children}
      </div>
    </div>
  );
}

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
  link.download = report.fileName || 'copilot-usage-report.csv';
  link.click();

  URL.revokeObjectURL(objectUrl);
}

function AppContent() {
  useHighchartsInit();
  const {
    reports,
    activeReportIndex,
    setActiveReport,
    clearAllReports,
    activeReport,
    addReport,
    groupByColumn,
    setGroupByColumn,
    timeBucket,
    setTimeBucket,
    periodKey,
    setPeriodKey,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    clearFilters,
    visibleRows,
  } = useReport();
  const [activeTab, setActiveTabRaw] = useState<ViewTab>(() =>
    getStoredValue(STORAGE_KEYS.ACTIVE_TAB, 'charts') as ViewTab,
  );
  const setActiveTab = useCallback((tab: ViewTab) => {
    setActiveTabRaw(tab);
    setStoredValue(STORAGE_KEYS.ACTIVE_TAB, tab);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState(() =>
    getStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, false),
  );
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedRaw(collapsed);
    setStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed);
  }, []);
  const [filterInput, setFilterInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** Unique organization names from the active report */
  const uniqueOrgs = useMemo(() => {
    if (!activeReport) return [];
    const orgs = new Set<string>();
    for (const row of activeReport.rows) {
      const org = (row as unknown as Record<string, unknown>).organization;
      if (org && typeof org === 'string' && org.trim()) orgs.add(org);
    }
    return Array.from(orgs).sort();
  }, [activeReport]);

  /** Build a nice tab label like "Premium Requests (Mar 2026)" */
  const getReportTabLabel = useCallback(
    (report: NonNullable<typeof activeReport>) => {
      const typeLabel = REPORT_TYPE_LABELS[report.type] ?? report.type;
      const dateLabel = formatDateRangeCompact(report.dateRange.start, report.dateRange.end);
      return dateLabel ? `${typeLabel} (${dateLabel})` : typeLabel;
    },
    [],
  );

  // Sync browser tab title with active report
  useEffect(() => {
    document.title = activeReport
      ? `${getReportTabLabel(activeReport)} — TBB`
      : 'Copilot Usage Viewer — TBB';
  }, [activeReport, getReportTabLabel]);

  const tokenBreakdown = useMemo(() => {
    if (!activeReport || activeReport.type !== REPORT_TYPES.TOKEN_USAGE)
      return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 };
    const rows = visibleRows as TokenUsageRow[];
    const input = rows.reduce((s, r) => s + r.totalInputTokens, 0);
    const output = rows.reduce((s, r) => s + r.totalOutputTokens, 0);
    const cacheCreate = rows.reduce((s, r) => s + r.totalCacheCreationTokens, 0);
    const cacheRead = rows.reduce((s, r) => s + r.totalCacheReadTokens, 0);
    return { input, output, cacheCreate, cacheRead, total: input + output + cacheCreate + cacheRead };
  }, [activeReport, visibleRows]);
  const totalTokens = tokenBreakdown.total;

  const availablePeriods = useMemo(() => {
    if (!activeReport) return [];

    return [
      ...new Set(
        activeReport.rows.map((row) =>
          String(((row as unknown as Record<string, unknown>).date ?? '')).slice(0, 7),
        ),
      ),
    ]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [activeReport]);

  useEffect(() => {
    if (availablePeriods.length === 1 && periodKey === 'all') {
      setPeriodKey(availablePeriods[0]);
      return;
    }

    if (availablePeriods.length > 1 && periodKey !== 'all' && !availablePeriods.includes(periodKey)) {
      setPeriodKey('all');
    }
  }, [availablePeriods, periodKey, setPeriodKey]);

  const handleDownload = useCallback(() => {
    if (!activeReport) return;
    downloadReportAsCsv(activeReport);
  }, [activeReport]);

  const availableFilterFields = useMemo(() => {
    if (!activeReport) return FILTERABLE_FIELDS;

    const rowKeys = new Set(
      activeReport.rows.flatMap((row) => Object.keys(row as unknown as Record<string, unknown>)),
    );

    return FILTERABLE_FIELDS.filter((field) => rowKeys.has(field));
  }, [activeReport]);

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

  const activeAdvancedFilters = useMemo(
    () =>
      Object.entries(filters).flatMap(([field, values]) =>
        values.map((value) => ({ field: field as FilterableField, value })),
      ),
    [filters],
  );

  const autocompleteSuggestions = useMemo<AutocompleteSuggestion[]>(() => {
    const trimmedInput = filterInput.trim();

    if (!trimmedInput) {
      return availableFilterFields.slice(0, 8).map((field) => ({
        id: `field:${field}`,
        text: `${humanizeColumn(field)}…`,
        leadingVisual: FIELD_ICONS[field],
        metadata: { type: 'field' as const, field },
      }));
    }

    const advancedFilter = parseAdvancedFilter(trimmedInput);

    if (advancedFilter) {
      return (filterValuesByField.get(advancedFilter.field) ?? [])
        .filter((value) => value.toLowerCase().includes(advancedFilter.value.toLowerCase()))
        .filter((value) => !(filters[advancedFilter.field] ?? []).includes(value))
        .slice(0, 8)
        .map((value) => ({
          id: `${advancedFilter.field}:${value}`,
          text: `${humanizeColumn(advancedFilter.field)}: ${value}`,
          leadingVisual: FIELD_ICONS[advancedFilter.field],
          metadata: { type: 'value' as const, field: advancedFilter.field, value },
        }));
    }

    const normalizedInput = trimmedInput.toLowerCase();
    const fieldMatches = availableFilterFields
      .filter(
        (field) =>
          field.toLowerCase().includes(normalizedInput) ||
          humanizeColumn(field).toLowerCase().includes(normalizedInput),
      )
      .slice(0, 5)
      .map((field) => ({
        id: `field:${field}`,
        text: `${humanizeColumn(field)}…`,
        leadingVisual: FIELD_ICONS[field],
        metadata: { type: 'field' as const, field },
      }));

    const valueMatches = availableFilterFields.flatMap((field) =>
      (filterValuesByField.get(field) ?? [])
        .filter((value) => value.toLowerCase().includes(normalizedInput))
        .filter((value) => !(filters[field] ?? []).includes(value))
        .slice(0, 3)
        .map((value) => ({
          id: `${field}:${value}`,
          text: `${humanizeColumn(field)}: ${value}`,
          leadingVisual: FIELD_ICONS[field],
          metadata: { type: 'value' as const, field, value },
        })),
    );

    return [...fieldMatches, ...valueMatches].slice(0, 10);
  }, [availableFilterFields, filterInput, filterValuesByField, filters]);

  const applyAdvancedFilter = useCallback(
    (field: FilterableField, value: string) => {
      const nextValues = [...new Set([...(filters[field] ?? []), value])];
      setFilter(field, nextValues);
      setFilterInput('');
      setSearchQuery('');
    },
    [filters, setFilter, setSearchQuery],
  );

  const removeAdvancedFilter = useCallback(
    (field: FilterableField, value: string) => {
      const nextValues = (filters[field] ?? []).filter((currentValue) => currentValue !== value);
      setFilter(field, nextValues);
    },
    [filters, setFilter],
  );

  const clearAllToolbarFilters = useCallback(() => {
    clearFilters();
    setSearchQuery('');
    setFilterInput('');
  }, [clearFilters, setSearchQuery]);

  const handleFilterInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFilterInput(nextValue);

      if (nextValue.includes(':')) {
        setSearchQuery('');
        return;
      }

      setSearchQuery(nextValue);
    },
    [setSearchQuery],
  );

  const handleAutocompleteSelection = useCallback(
    (selectedItem: AutocompleteSuggestion | AutocompleteSuggestion[]) => {
      if (Array.isArray(selectedItem)) return;

      if (selectedItem.metadata.type === 'field') {
        setFilterInput(`${selectedItem.metadata.field}:`);
        setSearchQuery('');
        return;
      }

      applyAdvancedFilter(selectedItem.metadata.field, selectedItem.metadata.value);
    },
    [applyAdvancedFilter, setSearchQuery],
  );

  const handleFilterInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;

      const advancedFilter = parseAdvancedFilter(filterInput.trim());
      if (advancedFilter) {
        event.preventDefault();
        applyAdvancedFilter(advancedFilter.field, advancedFilter.value);
      }
    },
    [applyAdvancedFilter, filterInput],
  );

  const activeFilterCount = activeAdvancedFilters.length + (searchQuery.trim() ? 1 : 0);

  const renderInsightsSidebar = () => (
    <div className={styles.sidebarContent}>
      <div className={styles.sidebarHeader}>
        <Heading as="h2" className={styles.sidebarHeading}>
          Insights
        </Heading>
        <IconButton
          aria-label="Collapse sidebar"
          icon={SidebarCollapseIcon}
          variant="invisible"
          size="small"
          onClick={() => setSidebarCollapsed(true)}
        />
      </div>
      <NavList aria-label="Insights navigation">
        {INSIGHTS_NAV_ITEMS.map(({ label, icon: Icon, current, disabled }) => (
          <NavList.Item
            key={label}
            href={disabled ? undefined : '#'}
            aria-current={current ? 'page' : undefined}
            aria-disabled={disabled ? 'true' : undefined}
            className={disabled ? styles.sidebarItemDisabled : undefined}
            onClick={(event) => event.preventDefault()}
          >
            <NavList.LeadingVisual>
              <Icon />
            </NavList.LeadingVisual>
            {label}
            {disabled ? (
              <NavList.TrailingVisual>
                <span className={styles.sidebarStatusPill}>Coming soon</span>
              </NavList.TrailingVisual>
            ) : null}
          </NavList.Item>
        ))}
      </NavList>
    </div>
  );

  const renderViewTabs = () => (
    <UnderlineNav aria-label="Usage viewer tabs" variant="flush" className={styles.primaryTabs}>
      <UnderlineNav.Item
        href="#"
        aria-current={activeTab === 'charts' ? 'page' : undefined}
        leadingVisual={<GraphIcon size={16} />}
        onSelect={(event) => {
          event.preventDefault();
          setActiveTab('charts');
        }}
      >
        Charts
      </UnderlineNav.Item>
      <UnderlineNav.Item
        href="#"
        aria-current={activeTab === 'table' ? 'page' : undefined}
        leadingVisual={<TableIcon size={16} />}
        onSelect={(event) => {
          event.preventDefault();
          setActiveTab('table');
        }}
      >
        Table
      </UnderlineNav.Item>
    </UnderlineNav>
  );



  // ── Empty state ──
  if (reports.length === 0) {
    return (
      <PageLayout containerWidth="full" padding="none" rowGap="none" columnGap="none">
        {!sidebarCollapsed && (
          <PageLayout.Pane
            position="start"
            padding="normal"
            divider="line"
            aria-label="Insights sidebar"
            className={styles.sidebarPane}
            hidden={{ narrow: true, regular: false, wide: false }}
          >
            {renderInsightsSidebar()}
          </PageLayout.Pane>
        )}
        <PageLayout.Content width="xlarge" padding="normal" className={styles.pageContent}>
          <div className={styles.pageStack}>
            <PageHeader className={styles.pageHeader}>
              <PageHeader.TitleArea>
                {sidebarCollapsed && (
                  <PageHeader.LeadingAction>
                    <IconButton
                      aria-label="Expand sidebar"
                      icon={SidebarExpandIcon}
                      variant="invisible"
                      size="small"
                      onClick={() => setSidebarCollapsed(false)}
                    />
                  </PageHeader.LeadingAction>
                )}
                <PageHeader.LeadingVisual>
                  <GraphIcon size={24} />
                </PageHeader.LeadingVisual>
                <PageHeader.Title as="h1">Copilot Usage Viewer</PageHeader.Title>
              </PageHeader.TitleArea>
              <PageHeader.Description>
                <span className={styles.pageDescription}>Token-Based Billing Report Explorer</span>
              </PageHeader.Description>
            </PageHeader>

            <section className={styles.emptyStateSurface} aria-labelledby="upload-report-heading">
              <div className={styles.emptyStateHeader}>
                <Heading as="h2" id="upload-report-heading" className={styles.surfaceTitle}>
                  Upload usage data
                </Heading>
                <Text as="p" className={styles.surfaceDescription}>
                  Drag in a billing export to inspect spend, requests, and token consumption with GitHub-native chrome.
                </Text>
              </div>
              <FileDropzone />
            </section>
          </div>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout containerWidth="full" padding="none" rowGap="none" columnGap="none">
      {!sidebarCollapsed && (
        <PageLayout.Pane
          position="start"
          padding="normal"
          divider="line"
          aria-label="Insights sidebar"
          className={styles.sidebarPane}
          hidden={{ narrow: true, regular: false, wide: false }}
        >
          {renderInsightsSidebar()}
        </PageLayout.Pane>
      )}
      <PageLayout.Content width="xlarge" padding="normal" className={styles.pageContent}>
        <div className={styles.pageStack}>
          <PageHeader className={styles.pageHeader}>
            <PageHeader.TitleArea>
              {sidebarCollapsed && (
                <PageHeader.LeadingAction>
                  <IconButton
                    aria-label="Expand sidebar"
                    icon={SidebarExpandIcon}
                    variant="invisible"
                    size="small"
                    onClick={() => setSidebarCollapsed(false)}
                  />
                </PageHeader.LeadingAction>
              )}
              <PageHeader.LeadingVisual>
                <CopilotIcon size={24} />
              </PageHeader.LeadingVisual>
              <PageHeader.Title as="h1">
                {REPORT_TYPE_LABELS[activeReport?.type ?? ''] ?? 'Copilot Usage Viewer'}
              </PageHeader.Title>
            </PageHeader.TitleArea>
            <PageHeader.Actions>
              <Stack direction="horizontal" gap="condensed">
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
                style={{ display: 'none' }}
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
                {uniqueOrgs.length > 0 && (
                  <>
                    {' · '}
                    {uniqueOrgs.length <= 3
                      ? uniqueOrgs.join(', ')
                      : `${uniqueOrgs.slice(0, 3).join(', ')} +${uniqueOrgs.length - 3} more`}
                  </>
                )}
              </span>
            </PageHeader.Description>
          </PageHeader>

          {summary && (
            <div className={styles.heroCardsGrid}>
              <HeroCard
                title="Gross amount"
                value={formatCurrency(summary.totalGrossAmount)}
              >
                <div className={styles.heroCardBreakdown}>
                  {(() => {
                    const top3 = topN(visibleRows as never[], 'model' as never, 'grossAmount' as never, 3) as { key: string; value: number }[];
                    return top3.map((m) => (
                      <span key={m.key}><span>{m.key}</span><span>{formatCurrency(m.value)}</span></span>
                    ));
                  })()}
                </div>
              </HeroCard>
              <HeroCard
                title="Net amount"
                value={formatCurrency(summary.totalNetAmount)}
              >
                <div className={styles.heroCardBreakdown}>
                  <span><span>Discount</span><span>−{formatCurrency(summary.totalDiscountAmount)}</span></span>
                </div>
              </HeroCard>
              <HeroCard
                title="Total requests"
                value={formatCompact(summary.totalQuantity)}
              >
                <div className={styles.heroCardBreakdown}>
                  {(() => {
                    const topUser = topN(visibleRows, 'username', 'quantity', 1)[0];
                    return <>
                      <span><span>Users</span><span>{summary.uniqueUsers}</span></span>
                      <span><span>Models</span><span>{summary.uniqueModels}</span></span>
                      {topUser && <span><span>Top user</span><span>{topUser.key}</span></span>}
                    </>;
                  })()}
                </div>
              </HeroCard>
              {activeReport?.type === REPORT_TYPES.TOKEN_USAGE && (
                <HeroCard
                  title="Total tokens"
                  value={formatCompact(totalTokens)}
                >
                  <div className={styles.heroCardBreakdown}>
                    <span><span>Input</span><span>{formatCompact(tokenBreakdown.input)}</span></span>
                    <span><span>Output</span><span>{formatCompact(tokenBreakdown.output)}</span></span>
                    <span><span>Cache create</span><span>{formatCompact(tokenBreakdown.cacheCreate)}</span></span>
                    <span><span>Cache read</span><span>{formatCompact(tokenBreakdown.cacheRead)}</span></span>
                  </div>
                </HeroCard>
              )}
            </div>
          )}

          {reports.length > 1 && (
            <UnderlineNav
              key={reports.length}
              aria-label="Uploaded reports"
              variant="flush"
              className={styles.reportTabs}
            >
              {reports.map((report, i) => {
                const Icon = REPORT_TYPE_ICONS[report.type] ?? WorkflowIcon;

                return (
                  <UnderlineNav.Item
                    key={report.fileName}
                    href="#"
                    aria-current={i === activeReportIndex ? 'page' : undefined}
                    leadingVisual={<Icon />}
                    onSelect={(event) => {
                      event.preventDefault();
                      setActiveReport(i);
                    }}
                  >
                    {getReportTabLabel(report)}
                  </UnderlineNav.Item>
                );
              })}
            </UnderlineNav>
          )}

          <section className={styles.contentSurface} aria-label="Usage viewer content">
            <div className={styles.surfaceTabsRow}>{renderViewTabs()}</div>

            <div className={styles.sectionToolbar}>
              <div className={styles.toolbarLeading}>
                <ActionMenu>
                  <ActionMenu.Button size="small" leadingVisual={FilterIcon}>
                    {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : 'Filter'}
                  </ActionMenu.Button>
                  <ActionMenu.Overlay width="medium" align="start">
                    <ActionList selectionVariant="single">
                      <ActionList.Group title="Advanced filter">
                        {availableFilterFields.map((field) => (
                          <ActionList.Item
                            key={`advanced-${field}`}
                            onSelect={() => {
                              setFilterInput(`${field}:`);
                              setSearchQuery('');
                            }}
                          >
                            {humanizeColumn(field)}
                          </ActionList.Item>
                        ))}
                      </ActionList.Group>
                      <ActionList.Divider />
                      <ActionList.Group title="Group by">
                        {availableFilterFields.map((key) => (
                            <ActionList.Item
                              key={key}
                              selected={groupByColumn === key}
                              onSelect={() => setGroupByColumn(key)}
                            >
                              {humanizeColumn(key)}
                            </ActionList.Item>
                          ))}
                      </ActionList.Group>
                      <ActionList.Divider />
                      <ActionList.Group title="Time bucket">
                        {TIME_BUCKET_OPTIONS.map((option) => (
                          <ActionList.Item
                            key={option.value}
                            selected={timeBucket === option.value}
                            onSelect={() => setTimeBucket(option.value)}
                          >
                            {option.label}
                          </ActionList.Item>
                        ))}
                      </ActionList.Group>
                      {(activeAdvancedFilters.length > 0 || searchQuery.trim()) && (
                        <>
                          <ActionList.Divider />
                          <ActionList.Item variant="danger" onSelect={clearAllToolbarFilters}>
                            Clear all filters
                          </ActionList.Item>
                        </>
                      )}
                    </ActionList>
                  </ActionMenu.Overlay>
                </ActionMenu>
                <div className={styles.toolbarSearchArea}>
                  {activeAdvancedFilters.length > 0 && (
                    <div className={styles.activeFilterTokens}>
                      {activeAdvancedFilters.map(({ field, value }) => (
                        <Token
                          key={`${field}:${value}`}
                          text={`${humanizeColumn(field)}: ${value}`}
                          size="medium"
                          onRemove={() => removeAdvancedFilter(field, value)}
                        />
                      ))}
                    </div>
                  )}

                  <div className={styles.toolbarSearch}>
                    <Autocomplete>
                      <Autocomplete.Input
                        id="usage-filter-input"
                        aria-label="Search or filter report rows"
                        value={filterInput}
                        onChange={handleFilterInputChange}
                        onKeyDown={handleFilterInputKeyDown}
                        placeholder="Search or filter"
                        leadingVisual={SearchIcon}
                        block
                      />
                      <Autocomplete.Overlay>
                        <Autocomplete.Menu
                          aria-labelledby="usage-filter-input"
                          items={autocompleteSuggestions as never}
                          selectedItemIds={[]}
                          onSelectedChange={handleAutocompleteSelection as never}
                          emptyStateText={
                            filterInput.includes(':')
                              ? 'No matching values'
                              : 'Type to search or add an advanced filter'
                          }
                        />
                      </Autocomplete.Overlay>
                    </Autocomplete>
                  </div>
                </div>
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
                    Try a different search term or clear the current period filter.
                  </Text>
                </div>
              )}

              {activeTab === 'charts' && visibleRows.length > 0 && (
                <div className={styles.chartStack} key={activeReportIndex}>
                  <div className={styles.chartSurface}>
                    <TimeSeriesChart />
                  </div>

                  <div className={styles.chartSurface}>
                    <ModelBreakdownChart />
                  </div>

                  <div className={styles.chartSurface}>
                    <CostBreakdownChart />
                  </div>
                </div>
              )}

              {activeTab === 'table' && visibleRows.length > 0 && <ReportTable />}
            </div>
          </section>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

export default function App() {
  return (
    <ReportProvider>
      <AppContent />
    </ReportProvider>
  );
}
