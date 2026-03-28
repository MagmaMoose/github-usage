import React, { useState, useCallback } from 'react';
import {
  ActionMenu,
  ActionList,
  Heading,
  IconButton,
  NavList,
  Dialog,
  Text,
  Button,
  Spinner,
  Stack,
} from '@primer/react';
import {
  CopilotIcon,
  DatabaseIcon,
  FileIcon,
  MarkGithubIcon,
  MoonIcon,
  PackageIcon,
  QuestionIcon,
  SidebarExpandIcon,
  SparkleIcon,
  SunIcon,
  ZapIcon,
} from '@primer/octicons-react';
import { useColorMode } from '../context/theme-context';
import { useOnboardingContext } from './onboarding';
import {
  NAV_PAGES,
  UTILITY_NAV_PAGES,
  PAGE_TYPES,
  type PageType,
} from '../lib/report-schema';
import type { ParsedReport, UsageReportRow } from '../lib/types';
import { parseCSV } from '../lib/csv-parser';
import { useReport } from '../context/useReport';
import { formatDisplayValue } from '../lib/formatters';
import { ACTIONS_STORAGE_SKUS, type ActionsSubView } from '../hooks/useProductNavigation';
import styles from '../App.module.css';

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  actions: <ZapIcon />,
  copilot: <CopilotIcon />,
  spark: <SparkleIcon />,
  git_lfs: <FileIcon />,
  packages: <PackageIcon />,
};

interface InsightsSidebarProps {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
  availableProducts: string[];
  activeProductFilter: string | null;
  actionsSubView: ActionsSubView | null;
  handleProductSelect: (product: string | null, subView?: ActionsSubView) => void;
  activeReport: ParsedReport | null;
  onCollapse: () => void;
}

export function InsightsSidebar({
  activePage,
  setActivePage,
  availableProducts,
  activeProductFilter,
  actionsSubView,
  handleProductSelect,
  activeReport,
  onCollapse,
}: InsightsSidebarProps) {
  const { colorMode, setColorMode } = useColorMode();
  const onboarding = useOnboardingContext();
  const { reports, addReport } = useReport();
  const [showSamplePrompt, setShowSamplePrompt] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const handleTourRestart = useCallback(() => {
    if (reports.length === 0) {
      setShowSamplePrompt(true);
    } else {
      onboarding.restart();
    }
  }, [reports.length, onboarding]);

  const handleLoadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const { loadSampleData } = await import('../lib/sample-data');
      const samples = await loadSampleData();
      for (const { name, content } of samples) {
        addReport(parseCSV(content, name), content);
      }
      onboarding.restart();
    } finally {
      setLoadingSamples(false);
      setShowSamplePrompt(false);
    }
  }, [addReport, onboarding]);

  return (
    <div className={styles.sidebarContent}>
      <div className={styles.sidebarHeader}>
        <Heading as="h2" className={styles.sidebarHeading}>
          Reports
        </Heading>
        <IconButton
          aria-label="Collapse sidebar"
          icon={SidebarExpandIcon}
          variant="invisible"
          size="small"
          onClick={onCollapse}
        />
      </div>
      <NavList aria-label="Reports navigation">
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
        <NavList.Divider />
        {UTILITY_NAV_PAGES.map(({ id, label, icon: Icon }) => (
          <NavList.Item
            key={id}
            href="#"
            aria-current={activePage === id ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              setActivePage(id);
            }}
          >
            <NavList.LeadingVisual>
              <Icon />
            </NavList.LeadingVisual>
            {label}
          </NavList.Item>
        ))}
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
          <ActionMenu.Overlay width="auto" side="outside-top" align="start">
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
        <IconButton
          as="a"
          href="https://github.com/austenstone/github-actions-usage-report"
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
          onClick={handleTourRestart}
        />
        </span>
      </div>

      {showSamplePrompt && (
        <Dialog
          title="Load sample data?"
          onClose={() => setShowSamplePrompt(false)}
        >
          <Text as="p">
            No reports are loaded yet. Would you like to load sample CSV data so you can explore the feature tour with real charts and tables?
          </Text>
          <Stack direction="horizontal" justify="end" gap="condensed" style={{ marginTop: 16 }}>
            <Button
              onClick={() => {
                setShowSamplePrompt(false);
                onboarding.restart();
              }}
            >
              No, just start tour
            </Button>
            <Button
              variant="primary"
              onClick={handleLoadSamples}
              disabled={loadingSamples}
              leadingVisual={loadingSamples ? Spinner : undefined}
            >
              {loadingSamples ? 'Loading...' : 'Yes, load sample data'}
            </Button>
          </Stack>
        </Dialog>
      )}
    </div>
  );
}
