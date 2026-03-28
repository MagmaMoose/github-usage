import { useMemo } from 'react';
import { IconButton, PageLayout } from '@primer/react';
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
