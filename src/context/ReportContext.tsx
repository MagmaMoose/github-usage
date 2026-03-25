import { useCallback, useState, type ReactNode } from 'react';
import type { ParsedReport, TimeBucket } from '../lib/types';
import { ReportContext } from './report-context';

interface ReportState {
  reports: ParsedReport[];
  activeReportIndex: number;
  groupByColumn: string;
  timeBucket: TimeBucket;
  periodKey: string;
  searchQuery: string;
  filters: Record<string, string[]>;
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReportState>({
    reports: [],
    activeReportIndex: 0,
    groupByColumn: 'username',
    timeBucket: 'daily',
    periodKey: 'all',
    searchQuery: '',
    filters: {},
  });

  const addReport = useCallback((report: ParsedReport) => {
    setState((prev) => ({
      ...prev,
      reports: [...prev.reports, report],
      activeReportIndex: prev.reports.length,
      periodKey: 'all',
      searchQuery: '',
    }));
  }, []);

  const removeReport = useCallback((index: number) => {
    setState((prev) => {
      const reports = prev.reports.filter((_, i) => i !== index);
      return {
        ...prev,
        reports,
        activeReportIndex: Math.min(prev.activeReportIndex, Math.max(0, reports.length - 1)),
      };
    });
  }, []);

  const setActiveReport = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      activeReportIndex: index,
      periodKey: 'all',
      searchQuery: '',
    }));
  }, []);

  const setGroupByColumn = useCallback((column: string) => {
    setState((prev) => ({ ...prev, groupByColumn: column }));
  }, []);

  const setTimeBucket = useCallback((bucket: TimeBucket) => {
    setState((prev) => ({ ...prev, timeBucket: bucket }));
  }, []);

  const setPeriodKey = useCallback((periodKey: string) => {
    setState((prev) => ({ ...prev, periodKey }));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    setState((prev) => ({ ...prev, searchQuery }));
  }, []);

  const setFilter = useCallback((column: string, values: string[]) => {
    setState((prev) => {
      const nextFilters = { ...prev.filters };

      if (values.length > 0) {
        nextFilters[column] = values;
      } else {
        delete nextFilters[column];
      }

      return {
        ...prev,
        filters: nextFilters,
      };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({ ...prev, filters: {} }));
  }, []);

  const activeReport = state.reports[state.activeReportIndex] ?? null;
  const activeReportType = activeReport?.type ?? null;
  const normalizedSearchQuery = state.searchQuery.trim().toLowerCase();

  const visibleRows = (activeReport?.rows ?? []).filter((row) => {
    const rowRecord = row as unknown as Record<string, unknown>;
    const matchesPeriod =
      state.periodKey === 'all' ||
      String(rowRecord.date ?? '').startsWith(state.periodKey);

    const matchesAdvancedFilters = Object.entries(state.filters).every(([field, values]) => {
      if (values.length === 0) return true;

      const currentValue = String(rowRecord[field] ?? '').toLowerCase();
      return values.some((value) => currentValue === value.toLowerCase());
    });

    if (!matchesPeriod || !matchesAdvancedFilters) return false;
    if (!normalizedSearchQuery) return true;

    return Object.values(rowRecord).some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(normalizedSearchQuery),
    );
  });

  return (
    <ReportContext.Provider
      value={{
        ...state,
        addReport,
        removeReport,
        setActiveReport,
        setGroupByColumn,
        setTimeBucket,
        setPeriodKey,
        setSearchQuery,
        setFilter,
        clearFilters,
        activeReport,
        activeReportType,
        visibleRows,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
