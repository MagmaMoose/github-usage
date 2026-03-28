import React from 'react';
import {
  ActionMenu,
  ActionList,
  Heading,
  IconButton,
  NavList,
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
  PAGE_TYPES,
  type PageType,
} from '../lib/report-schema';
import type { ParsedReport, UsageReportRow } from '../lib/types';
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
}
