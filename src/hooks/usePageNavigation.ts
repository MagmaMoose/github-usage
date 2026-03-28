import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedReport } from '../lib/types';
import {
  PAGE_TYPES,
  PAGE_REPORT_TYPES,
  pageTypeForReport,
  type PageType,
} from '../lib/report-schema';
import { readURLFilterState, writeURLFilterState } from '../lib/url-state';

interface PageNavigationDeps {
  reports: ParsedReport[];
  activeReport: ParsedReport | null;
  setActiveReport: (index: number) => void;
  setFilter: (column: string, values: string[]) => void;
  groupByColumn: string;
  timeBucket: string;
  periodKey: string;
  searchQuery: string;
  filters: Record<string, string[]>;
}

interface PageNavigationReturn {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
}

/** Page navigation state with auto-switching on report changes */
export function usePageNavigation({
  reports,
  activeReport,
  setActiveReport,
  setFilter,
  groupByColumn,
  timeBucket,
  periodKey,
  searchQuery,
  filters,
}: PageNavigationDeps): PageNavigationReturn {
  const [activePage, setActivePageRaw] = useState<PageType>(() => {
    const urlState = readURLFilterState();
    if (urlState.page === 'usage') return PAGE_TYPES.USAGE;
    return PAGE_TYPES.COPILOT;
  });

  const setActivePage = useCallback((page: PageType) => {
    setActivePageRaw(page);
    setFilter('product', []);
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
    if (activeReport && allowedTypes.includes(activeReport.type)) return;
    const matchIndex = reports.findIndex((r) => allowedTypes.includes(r.type));
    if (matchIndex !== -1) {
      setActiveReport(matchIndex);
    }
  }, [reports, activePage, activeReport, setActiveReport]);

  // Auto-switch page when a NEW report is added (skip initial hydration)
  const prevReportCountRef = useRef(reports.length);
  const isInitialHydrationRef = useRef(true);
  useEffect(() => {
    if (reports.length > prevReportCountRef.current) {
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

  return { activePage, setActivePage };
}
