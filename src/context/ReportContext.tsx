import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ParsedReport, TimeBucket } from '../lib/types';
import { ReportContext } from './report-context';
import type { DateRange } from './report-context';
import { parseCSV } from '../lib/csv-parser';
import { getCachedCSVs, setCachedCSVs, clearCachedCSVs } from '../lib/local-storage';
import { readURLFilterState, writeURLFilterState } from '../lib/url-state';

interface ReportState {
  reports: ParsedReport[];
  /** Raw CSV content parallel to reports[], used for localStorage caching */
  rawCsvs: string[];
  activeReportIndex: number;
  groupByColumn: string;
  timeBucket: TimeBucket;
  periodKey: string;
  dateRange: DateRange | null;
  searchQuery: string;
  filters: Record<string, string[]>;
}

function buildInitialState(): ReportState {
  const urlState = readURLFilterState();
  return {
    reports: [],
    rawCsvs: [],
    activeReportIndex: 0,
    groupByColumn: urlState.groupBy ?? 'username',
    timeBucket: (urlState.timeBucket as TimeBucket) ?? 'daily',
    periodKey: urlState.period ?? 'all',
    dateRange: null,
    searchQuery: urlState.search ?? '',
    filters: urlState.filters ?? {},
  };
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReportState>(() => {
    const initial = buildInitialState();

    // Restore cached CSVs from localStorage on mount
    const cached = getCachedCSVs();
    if (cached.length === 0) return initial;

    const restoredReports: ParsedReport[] = [];
    for (const entry of cached) {
      try {
        restoredReports.push(parseCSV(entry.content, entry.fileName));
      } catch {
        // Skip corrupted cache entries
      }
    }

    if (restoredReports.length > 0) {
      return {
        ...initial,
        reports: restoredReports,
        rawCsvs: cached.map((c) => c.content),
        activeReportIndex: 0,
      };
    }

    return initial;
  });

  // Sync filter state to URL params whenever it changes
  useEffect(() => {
    // Only sync URL params when we have reports loaded (avoid clearing URL on initial empty state)
    if (state.reports.length === 0) return;

    writeURLFilterState({
      groupBy: state.groupByColumn,
      timeBucket: state.timeBucket,
      period: state.periodKey,
      search: state.searchQuery,
      filters: state.filters,
    });
  }, [
    state.groupByColumn,
    state.timeBucket,
    state.periodKey,
    state.searchQuery,
    state.filters,
    state.reports.length,
  ]);

  const addReport = useCallback((report: ParsedReport, rawCsv: string) => {
    setState((prev) => {
      const nextReports = [...prev.reports, report];
      const nextRawCsvs = [...prev.rawCsvs, rawCsv];

      // Persist all CSVs to localStorage
      setCachedCSVs(
        nextRawCsvs.map((content, i) => ({
          fileName: nextReports[i].fileName,
          content,
          cachedAt: new Date().toISOString(),
        })),
      );

      return {
        ...prev,
        reports: nextReports,
        rawCsvs: nextRawCsvs,
        activeReportIndex: prev.reports.length,
        periodKey: 'all',
        dateRange: null,
        searchQuery: '',
      };
    });
  }, []);

  const removeReport = useCallback((index: number) => {
    setState((prev) => {
      const reports = prev.reports.filter((_, i) => i !== index);
      const rawCsvs = prev.rawCsvs.filter((_, i) => i !== index);

      // Sync localStorage with remaining CSVs
      if (reports.length === 0) {
        clearCachedCSVs();
      } else {
        setCachedCSVs(
          rawCsvs.map((content, i) => ({
            fileName: reports[i].fileName,
            content,
            cachedAt: new Date().toISOString(),
          })),
        );
      }

      return {
        ...prev,
        reports,
        rawCsvs,
        activeReportIndex: Math.min(prev.activeReportIndex, Math.max(0, reports.length - 1)),
      };
    });
  }, []);

  const clearAllReports = useCallback(() => {
    clearCachedCSVs();
    setState((prev) => ({
      ...prev,
      reports: [],
      rawCsvs: [],
      activeReportIndex: 0,
    }));
  }, []);

  const setActiveReport = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      activeReportIndex: index,
      periodKey: 'all',
      dateRange: null,
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
    setState((prev) => ({ ...prev, periodKey, dateRange: null }));
  }, []);

  const setDateRange = useCallback((dateRange: DateRange | null) => {
    setState((prev) => ({ ...prev, dateRange, periodKey: dateRange ? 'custom' : 'all' }));
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
      (state.dateRange
        ? String(rowRecord.date ?? '') >= state.dateRange.start &&
          String(rowRecord.date ?? '') <= state.dateRange.end
        : String(rowRecord.date ?? '').startsWith(state.periodKey));

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
        clearAllReports,
        setActiveReport,
        setGroupByColumn,
        setTimeBucket,
        setPeriodKey,
        setDateRange,
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
