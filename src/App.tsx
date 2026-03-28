import {
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
  MarkGithubIcon,
  MoonIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  SunIcon,
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
import styles from './App.module.css';

function AppContent() {
  const { colorMode, setColorMode } = useColorMode();
  const {
    reports,
    activeReport,
    addReport,
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
  }, [setFilter]);

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
  useEffect(() => {
    // Only auto-switch when reports are added, not on every render
    if (reports.length > prevReportCountRef.current && activeReport) {
      const reportPage = pageTypeForReport(activeReport.type);
      if (reportPage !== activePage) {
        setActivePage(reportPage);
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

  // Compute effective metric options based on product filter
  const effectiveMetricOptions = useMemo(() => {
    if (activePage !== PAGE_TYPES.USAGE) return activeSchema.metricOptions;
    if (!activeProductFilter) return MIXED_METRIC_OPTIONS;
    return PRODUCT_METRIC_OPTIONS[activeProductFilter] ?? MIXED_METRIC_OPTIONS;
  }, [activePage, activeProductFilter, activeSchema.metricOptions]);

  const handleProductSelect = useCallback(
    (product: string | null) => {
      if (product) {
        setFilter('product', [product]);
      } else {
        setFilter('product', []);
      }
    },
    [setFilter],
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
                  {availableProducts.map((product) => (
                    <NavList.Item
                      key={product}
                      href="#"
                      aria-current={activeProductFilter === product ? 'page' : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        setActivePage(PAGE_TYPES.USAGE);
                        handleProductSelect(product);
                      }}
                    >
                      {formatDisplayValue(product, 'product')}
                    </NavList.Item>
                  ))}
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
      <AppContent />
    </ReportProvider>
  );
}
