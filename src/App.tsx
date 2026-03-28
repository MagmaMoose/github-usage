import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionMenu,
  ActionList,
  Heading,
  IconButton,
  NavList,
  PageLayout,
} from '@primer/react';
import {
  CopilotIcon,
  DatabaseIcon,
  FileIcon,
  MarkGithubIcon,
  MoonIcon,
  PackageIcon,
  QuestionIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  SparkleIcon,
  SunIcon,
  ZapIcon,
} from '@primer/octicons-react';
import { ReportProvider } from './context/ReportContext';
import { useReport } from './context/useReport';
import { useColorMode } from './context/theme-context';
import { ReportPageLayout } from './components/ReportPageLayout';
import {
  getReportSchema,
  NAV_PAGES,
  PAGE_TYPES,
  PAGE_REPORT_TYPES,
  pageTypeForReport,
  PRODUCT_METRIC_OPTIONS,
  MIXED_METRIC_OPTIONS,
  type PageType,
} from './lib/report-schema';
import { REPORT_TYPES } from './lib/types';
import type { UsageReportRow } from './lib/types';
import { formatDisplayValue } from './lib/formatters';
import { parseCSV } from './lib/csv-parser';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from './lib/local-storage';
import { readShareData, clearShareHash } from './lib/share-state';
import { readURLFilterState, writeURLFilterState } from './lib/url-state';
import { formatDateRangeCompact } from './lib/formatters';
import { OnboardingProvider, useOnboardingContext } from './components/onboarding';
import styles from './App.module.css';

/** Storage SKUs are billed in GB-Hours, not minutes */
const ACTIONS_STORAGE_SKUS = ['actions_storage', 'actions_custom_image_storage'] as const;

/** Icons for each product in the sidebar sub-nav */
const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  actions: <ZapIcon />,
  copilot: <CopilotIcon />,
  spark: <SparkleIcon />,
  git_lfs: <FileIcon />,
  packages: <PackageIcon />,
};

function AppContent() {
  const { colorMode, setColorMode } = useColorMode();
  const onboarding = useOnboardingContext();
  const {
    reports,
    activeReport,
    addReport,
    setActiveReport,
    setGroupByColumn,
    setTimeBucket,
    setPeriodKey,
    setSearchQuery,
    setFilter,
    timeBucket,
    periodKey,
    searchQuery,
    filters,
    groupByColumn,
  } = useReport();

  const [activePage, setActivePageRaw] = useState<PageType>(() => {
    const urlState = readURLFilterState();
    if (urlState.page === 'usage') return PAGE_TYPES.USAGE;
    return PAGE_TYPES.COPILOT;
  });

  const setActivePage = useCallback((page: PageType) => {
    setActivePageRaw(page);
    // Clear product filter when switching pages
    setFilter('product', []);
    // Auto-select the first report matching the new page type
    const allowedTypes = PAGE_REPORT_TYPES[page];
    const matchIndex = reports.findIndex((r) => allowedTypes.includes(r.type));
    if (matchIndex !== -1) {
      setActiveReport(matchIndex);
    }
  }, [setFilter, reports, setActiveReport]);

  // Sync active page to URL
  useEffect(() => {
    writeURLFilterState({
      page: activePage,
      groupBy: groupByColumn,
      timeBucket,
      period: periodKey,
      search: searchQuery,
      filters,
    });
  }, [activePage, groupByColumn, timeBucket, periodKey, searchQuery, filters]);

  // Auto-select a report matching the current page when reports load or page changes
  useEffect(() => {
    if (reports.length === 0) return;
    const allowedTypes = PAGE_REPORT_TYPES[activePage];
    if (activeReport && allowedTypes.includes(activeReport.type)) return; // already valid
    const matchIndex = reports.findIndex((r) => allowedTypes.includes(r.type));
    if (matchIndex !== -1) {
      setActiveReport(matchIndex);
    }
  }, [reports, activePage, activeReport, setActiveReport]);

  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState(() =>
    getStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, true),
  );
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedRaw(collapsed);
    setStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed);
  }, []);

  // Hydrate from share URL on mount
  useEffect(() => {
    const shareData = readShareData();
    if (!shareData) return;

    for (const csv of shareData.c) {
      try {
        addReport(parseCSV(csv.data, csv.name), csv.data);
      } catch {
        // Skip corrupted share entries
      }
    }

    if (shareData.s.groupBy) setGroupByColumn(shareData.s.groupBy);
    if (shareData.s.timeBucket) setTimeBucket(shareData.s.timeBucket as 'daily' | 'weekly' | 'monthly');
    if (shareData.s.period) setPeriodKey(shareData.s.period);
    if (shareData.s.search) setSearchQuery(shareData.s.search);
    if (shareData.s.filters) {
      for (const [field, values] of Object.entries(shareData.s.filters)) {
        setFilter(field, values);
      }
    }

    clearShareHash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-switch page when a NEW report is added that matches a different page type
  const prevReportCountRef = useRef(reports.length);
  const isInitialHydrationRef = useRef(true);
  useEffect(() => {
    if (reports.length > prevReportCountRef.current) {
      // Skip auto-switch on initial hydration (respect URL page param)
      if (isInitialHydrationRef.current) {
        isInitialHydrationRef.current = false;
      } else if (activeReport) {
        const reportPage = pageTypeForReport(activeReport.type);
        if (reportPage !== activePage) {
          setActivePage(reportPage);
        }
      }
    }
    prevReportCountRef.current = reports.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length]);

  // Auto-set period when only one period available
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

  // Sync browser tab title
  useEffect(() => {
    if (!activeReport) {
      document.title = 'TBB — GitHub Billing Dashboard';
      return;
    }
    const schema = getReportSchema(activeReport.type);
    const dateLabel = formatDateRangeCompact(activeReport.dateRange.start, activeReport.dateRange.end);
    const label = dateLabel ? `${schema.label} (${dateLabel})` : schema.label;
    document.title = `${label} — TBB | GitHub Billing Dashboard`;
  }, [activeReport]);

  // Determine the active schema from the page
  const activeSchema = useMemo(() => {
    const pageReportTypes = PAGE_REPORT_TYPES[activePage];
    // If we have a loaded report that matches this page, use its specific type
    if (activeReport && pageReportTypes.includes(activeReport.type)) {
      return getReportSchema(activeReport.type);
    }
    // Otherwise, use the default schema for the active page
    return getReportSchema(pageReportTypes[0]);
  }, [activeReport, activePage]);

  // Compute available products for usage report sub-navigation
  const availableProducts = useMemo(() => {
    if (activePage !== PAGE_TYPES.USAGE || !activeReport) return [];
    if (activeReport.type !== REPORT_TYPES.USAGE_REPORT) return [];

    const products = [
      ...new Set(
        (activeReport.rows as UsageReportRow[]).map((r) => r.product).filter(Boolean),
      ),
    ].sort();

    return products;
  }, [activePage, activeReport]);

  // Current product filter (from filters state)
  const activeProductFilter = filters.product?.[0] ?? null;
  const activeSkuFilter = filters.sku ?? [];

  /** Detect sub-view: 'compute' | 'storage' | null */
  const actionsSubView = useMemo(() => {
    if (activeProductFilter !== 'actions' || activeSkuFilter.length === 0) return null;
    if (ACTIONS_STORAGE_SKUS.some((s) => activeSkuFilter.includes(s))) return 'storage' as const;
    return 'compute' as const;
  }, [activeProductFilter, activeSkuFilter]);

  // Compute effective metric options based on product filter
  const effectiveMetricOptions = useMemo(() => {
    if (activePage !== PAGE_TYPES.USAGE) return activeSchema.metricOptions;
    if (!activeProductFilter) return MIXED_METRIC_OPTIONS;
    // Storage sub-view shows GB-Hours instead of Minutes
    if (activeProductFilter === 'actions' && actionsSubView === 'storage') {
      return PRODUCT_METRIC_OPTIONS['actions_storage'] ?? MIXED_METRIC_OPTIONS;
    }
    return PRODUCT_METRIC_OPTIONS[activeProductFilter] ?? MIXED_METRIC_OPTIONS;
  }, [activePage, activeProductFilter, actionsSubView, activeSchema.metricOptions]);

  const handleProductSelect = useCallback(
    (product: string | null, subView?: 'compute' | 'storage') => {
      if (product) {
        setFilter('product', [product]);
        if (product === 'actions' && subView === 'storage') {
          setFilter('sku', [...ACTIONS_STORAGE_SKUS]);
        } else if (product === 'actions' && subView === 'compute') {
          const allActionSkus = activeReport
            ? [...new Set((activeReport.rows as UsageReportRow[]).filter(r => r.product === 'actions').map(r => r.sku))]
            : [];
          const computeSkus = allActionSkus.filter(s => !(ACTIONS_STORAGE_SKUS as readonly string[]).includes(s));
          setFilter('sku', computeSkus);
        } else {
          setFilter('sku', []);
        }
      } else {
        setFilter('product', []);
        setFilter('sku', []);
      }
    },
    [setFilter, activeReport],
  );

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
        {NAV_PAGES.map(({ id, label, icon: Icon }) => {
          const isUsagePage = id === PAGE_TYPES.USAGE;
          const showSubNav = isUsagePage && availableProducts.length > 1;

          return (
            <NavList.Item
              key={id}
              href="#"
              aria-current={activePage === id && !activeProductFilter ? 'page' : undefined}
              defaultOpen={isUsagePage && activePage === PAGE_TYPES.USAGE}
              onClick={(event) => {
                event.preventDefault();
                setActivePage(id);
                if (isUsagePage) handleProductSelect(null);
              }}
            >
              <NavList.LeadingVisual>
                <Icon />
              </NavList.LeadingVisual>
              {label}
              {showSubNav && (
                <NavList.SubNav>
                  <NavList.Item
                    href="#"
                    aria-current={activePage === PAGE_TYPES.USAGE && !activeProductFilter ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setActivePage(PAGE_TYPES.USAGE);
                      handleProductSelect(null);
                    }}
                  >
                    All products
                  </NavList.Item>
                  {availableProducts.map((product) => {
                    // Split Actions into Compute + Storage sub-entries
                    if (product === 'actions') {
                      const hasStorageSkus = activeReport
                        ? (activeReport.rows as UsageReportRow[]).some(
                            (r) => r.product === 'actions' && (ACTIONS_STORAGE_SKUS as readonly string[]).includes(r.sku),
                          )
                        : false;

                      if (hasStorageSkus) {
                        return (
                          <React.Fragment key={product}>
                            <NavList.Item
                              href="#"
                              aria-current={activeProductFilter === 'actions' && actionsSubView === 'compute' ? 'page' : undefined}
                              onClick={(event) => {
                                event.preventDefault();
                                setActivePage(PAGE_TYPES.USAGE);
                                handleProductSelect('actions', 'compute');
                              }}
                            >
                              <NavList.LeadingVisual><ZapIcon /></NavList.LeadingVisual>
                              Actions Compute
                            </NavList.Item>
                            <NavList.Item
                              href="#"
                              aria-current={activeProductFilter === 'actions' && actionsSubView === 'storage' ? 'page' : undefined}
                              onClick={(event) => {
                                event.preventDefault();
                                setActivePage(PAGE_TYPES.USAGE);
                                handleProductSelect('actions', 'storage');
                              }}
                            >
                              <NavList.LeadingVisual><DatabaseIcon /></NavList.LeadingVisual>
                              Actions Storage
                            </NavList.Item>
                          </React.Fragment>
                        );
                      }
                    }

                    return (
                      <NavList.Item
                        key={product}
                        href="#"
                        aria-current={activeProductFilter === product && !actionsSubView ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          setActivePage(PAGE_TYPES.USAGE);
                          handleProductSelect(product);
                        }}
                      >
                        <NavList.LeadingVisual>{PRODUCT_ICONS[product] ?? <PackageIcon />}</NavList.LeadingVisual>
                        {formatDisplayValue(product, 'product')}
                      </NavList.Item>
                    );
                  })}
                </NavList.SubNav>
              )}
            </NavList.Item>
          );
        })}
      </NavList>
      <div className={styles.sidebarFooter}>
        <ActionMenu>
          <ActionMenu.Button
            size="small"
            variant="invisible"
            leadingVisual={colorMode === 'night' ? MoonIcon : colorMode === 'day' ? SunIcon : SunIcon}
          >
            {colorMode === 'night' ? 'Dark' : colorMode === 'day' ? 'Light' : 'System'}
          </ActionMenu.Button>
          <ActionMenu.Overlay width="auto">
            <ActionList selectionVariant="single">
              <ActionList.Item selected={colorMode === 'auto'} onSelect={() => setColorMode('auto')}>
                System
              </ActionList.Item>
              <ActionList.Item selected={colorMode === 'day'} onSelect={() => setColorMode('day')}>
                <ActionList.LeadingVisual><SunIcon /></ActionList.LeadingVisual>
                Light
              </ActionList.Item>
              <ActionList.Item selected={colorMode === 'night'} onSelect={() => setColorMode('night')}>
                <ActionList.LeadingVisual><MoonIcon /></ActionList.LeadingVisual>
                Dark
              </ActionList.Item>
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
        <IconButton
          as="a"
          href="https://github.com/austenstone/tbb"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          icon={MarkGithubIcon}
          variant="invisible"
          size="small"
        />
        <IconButton
          aria-label="Restart feature tour"
          icon={QuestionIcon}
          variant="invisible"
          size="small"
          onClick={onboarding.restart}
        />
      </div>
    </div>
  );

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
        {sidebarCollapsed && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1 }}>
              <IconButton
                aria-label="Expand sidebar"
                icon={SidebarExpandIcon}
                variant="invisible"
                size="small"
                onClick={() => setSidebarCollapsed(false)}
              />
          </div>
        )}
        <ReportPageLayout schema={activeSchema} allowedReportTypes={PAGE_REPORT_TYPES[activePage]} metricOptions={effectiveMetricOptions} />
      </PageLayout.Content>
    </PageLayout>
  );
}

export default function App() {
  return (
    <ReportProvider>
      <OnboardingProvider>
        <AppContent />
      </OnboardingProvider>
    </ReportProvider>
  );
}
