import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconButton, PageLayout, Spinner, Text } from '@primer/react';
import { SidebarCollapseIcon } from '@primer/octicons-react';
import { ReportProvider } from './context/ReportContext';
import { useReport } from './context/useReport';
import { ReportPageLayout } from './components/ReportPageLayout';
import { CsvManager } from './components/CsvManager';
import { InsightsSidebar } from './components/InsightsSidebar';
import { OnboardingProvider } from './components/onboarding';
import {
  getReportSchema,
  PAGE_TYPES,
  PAGE_REPORT_TYPES,
  PRODUCT_METRIC_OPTIONS,
  MIXED_METRIC_OPTIONS,
} from './lib/report-schema';
import { useBrowserTitle } from './hooks/useBrowserTitle';
import { usePeriodInference } from './hooks/usePeriodInference';
import { useShareHydration } from './hooks/useShareHydration';
import { parseCSV } from './lib/csv-parser';
import { usePageNavigation } from './hooks/usePageNavigation';
import { useProductNavigation } from './hooks/useProductNavigation';
import { useSidebarCollapse } from './hooks/useSidebarCollapse';
import styles from './App.module.css';

function AppContent() {
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

  const { activePage, setActivePage } = usePageNavigation({
    reports,
    activeReport,
    setActiveReport,
    setFilter,
    setGroupByColumn,
    groupByColumn,
    timeBucket,
    periodKey,
    searchQuery,
    filters,
  });

  const { availableProducts, activeProductFilter, actionsSubView, handleProductSelect } =
    useProductNavigation({ activePage, activeReport, filters, setFilter });

  const { sidebarCollapsed, setSidebarCollapsed } = useSidebarCollapse();
  const [loadingSamples, setLoadingSamples] = useState(false);

  // Handle ?demo URL param at the app level so it works even when sidebar
  // is collapsed (default state). For demo=auto we load directly; for plain
  // ?demo we force-open the sidebar so its prompt dialog can mount.
  const handleLoadSamplesDirect = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const { loadSampleData } = await import('./lib/sample-data');
      const samples = await loadSampleData();
      for (const { name, content } of samples) {
        const report = parseCSV(content, name);
        report.isSample = true;
        addReport(report, content);
      }
      setActivePage(PAGE_TYPES.USAGE);
    } finally {
      setLoadingSamples(false);
    }
  }, [addReport, setActivePage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('demo')) return;
    if (reports.length > 0) return;

    if (params.get('demo') === 'auto') {
      handleLoadSamplesDirect();
      // Clean the param from URL so refresh doesn't re-trigger
      params.delete('demo');
      const clean = params.toString();
      const url = window.location.pathname + (clean ? `?${clean}` : '');
      window.history.replaceState({}, '', url);
    } else {
      // Force sidebar open so InsightsSidebar's prompt dialog can render
      setSidebarCollapsed(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useShareHydration({ addReport, setGroupByColumn, setTimeBucket, setPeriodKey, setSearchQuery, setFilter });
  useBrowserTitle(activeReport);
  usePeriodInference(activeReport, periodKey, setPeriodKey);

  // Schema and metric derivation stay here: they cascade from page + product + sub-view
  const activeSchema = useMemo(() => {
    const pageReportTypes = PAGE_REPORT_TYPES[activePage];
    if (!pageReportTypes || pageReportTypes.length === 0) {
      return getReportSchema('usage_report');
    }
    if (activeReport && pageReportTypes.includes(activeReport.type)) {
      return getReportSchema(activeReport.type);
    }
    return getReportSchema(pageReportTypes[0]);
  }, [activeReport, activePage]);

  const effectiveMetricOptions = useMemo(() => {
    if (activePage !== PAGE_TYPES.USAGE) return activeSchema.metricOptions;
    if (!activeProductFilter) return MIXED_METRIC_OPTIONS;
    if (activeProductFilter === 'actions' && actionsSubView === 'storage') {
      return PRODUCT_METRIC_OPTIONS['actions_storage'] ?? MIXED_METRIC_OPTIONS;
    }
    return PRODUCT_METRIC_OPTIONS[activeProductFilter] ?? MIXED_METRIC_OPTIONS;
  }, [activePage, activeProductFilter, actionsSubView, activeSchema.metricOptions]);

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
          <InsightsSidebar
            activePage={activePage}
            setActivePage={setActivePage}
            availableProducts={availableProducts}
            activeProductFilter={activeProductFilter}
            actionsSubView={actionsSubView}
            handleProductSelect={handleProductSelect}
            activeReport={activeReport}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </PageLayout.Pane>
      )}
      <PageLayout.Content width="xlarge" padding="normal" className={styles.pageContent}>
        {loadingSamples && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, background: 'var(--bgColor-default, var(--color-canvas-default))',
          }}>
            <Spinner size="large" />
            <Text as="p" style={{ color: 'var(--fgColor-muted)', fontSize: 14 }}>Loading sample data…</Text>
          </div>
        )}
        {sidebarCollapsed && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1 }}>
            <IconButton
              aria-label="Expand sidebar"
              icon={SidebarCollapseIcon}
              variant="invisible"
              size="small"
              onClick={() => setSidebarCollapsed(false)}
            />
          </div>
        )}
        {activePage === PAGE_TYPES.FILES ? (
          <CsvManager />
        ) : (
          <ReportPageLayout
            schema={activeSchema}
            allowedReportTypes={PAGE_REPORT_TYPES[activePage]}
            metricOptions={effectiveMetricOptions}
          />
        )}
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
