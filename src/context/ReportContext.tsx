import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ParsedReport, TimeBucket } from '../lib/types';
import { ReportContext } from './report-context';
import type { DateRange } from './report-context';
import { getCachedParsedReports, getCachedRawCSV, setCachedCSV, removeCachedCSV, clearCachedCSVs } from '../lib/local-storage';
import { readURLFilterState, writeURLFilterState } from '../lib/url-state';

/** Fast FNV-1a hash for dedup — not crypto-grade, just collision-resistant enough for CSV content */
function simpleHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

interface ReportState {
  reports: ParsedReport[];
  /** Raw CSV content parallel to reports[], used for localStorage caching */
  rawCsvs: string[];
  /** SHA-256 hashes of raw CSV content for dedup */
  fileHashes: Set<string>;
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
    fileHashes: new Set(),
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
  const [state, setState] = useState<ReportState>(buildInitialState);
  const [isHydrating, setIsHydrating] = useState(true);

  // Restore cached CSVs from IndexedDB on mount (async)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    getCachedParsedReports().then(async (cached) => {
      if (cached.length === 0) {
        setIsHydrating(false);
        return;
      }

      const restoredReports = cached.map((e) => e.parsed);

      if (restoredReports.length === 0) {
        setIsHydrating(false);
        return;
      }

      // Render immediately with parsed data (no raw CSVs yet)
      setState((prev) => {
        if (prev.reports.length > 0) return prev;

        const urlState = readURLFilterState();
        // Validate against ALL restored reports so cross-report filters survive
        const allRows = restoredReports.flatMap((r) => r.rows) as unknown as Record<string, unknown>[];

        let validPeriodKey = urlState.period ?? 'all';
        if (validPeriodKey !== 'all') {
          const availablePeriods = [
            ...new Set(allRows.map((row) => String(row.date ?? '').slice(0, 7))),
          ].filter(Boolean);
          if (!availablePeriods.includes(validPeriodKey)) {
            validPeriodKey = 'all';
          }
        }

        const validFilters: Record<string, string[]> = {};
        const rawFilters = urlState.filters ?? {};
        for (const [field, values] of Object.entries(rawFilters)) {
          const dataValues = new Set(allRows.map((r) => String(r[field] ?? '').toLowerCase()));
          const kept = values.filter((v) => dataValues.has(v.toLowerCase()));
          if (kept.length > 0) validFilters[field] = kept;
        }

        return {
          ...prev,
          reports: restoredReports,
          rawCsvs: cached.map(() => ''), // placeholder, backfilled below
          activeReportIndex: 0,
          periodKey: validPeriodKey,
          filters: validFilters,
        };
      });
      setIsHydrating(false);

      // Backfill raw CSVs in background (needed for dedup + re-export)
      const rawCsvs = await Promise.all(
        cached.map(async (e) => (await getCachedRawCSV(e.fileName)) ?? ''),
      );
      setState((prev) => ({
        ...prev,
        rawCsvs,
        fileHashes: new Set(rawCsvs.map((c) => simpleHash(c))),
      }));
    });
  }, []);

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

  const addReport = useCallback((report: ParsedReport, rawCsv: string): number => {
    let dupeIndex = -1;
    setState((prev) => {
      const hash = simpleHash(rawCsv);
      if (prev.fileHashes.has(hash)) {
        // Find the matching report index
        dupeIndex = prev.rawCsvs.findIndex((csv) => simpleHash(csv) === hash);
        // Navigate to the existing report and reset filters so data loads clean
        return {
          ...prev,
          activeReportIndex: dupeIndex,
          periodKey: 'all',
          dateRange: null,
          searchQuery: '',
          filters: {},
        };
      }
      const nextReports = [...prev.reports, report];
      const nextRawCsvs = [...prev.rawCsvs, rawCsv];
      const nextHashes = new Set(prev.fileHashes);
      nextHashes.add(hash);

      // Persist raw + parsed to IndexedDB by filename
      setCachedCSV(report.fileName, rawCsv, report);

      return {
        ...prev,
        reports: nextReports,
        rawCsvs: nextRawCsvs,
        fileHashes: nextHashes,
        activeReportIndex: prev.reports.length,
        periodKey: 'all',
        dateRange: null,
        searchQuery: '',
      };
    });
    return dupeIndex;
  }, []);

  const removeReport = useCallback((index: number) => {
    setState((prev) => {
      // Remove from localStorage by filename
      const removedReport = prev.reports[index];
      if (removedReport) removeCachedCSV(removedReport.fileName);

      const reports = prev.reports.filter((_, i) => i !== index);
      const rawCsvs = prev.rawCsvs.filter((_, i) => i !== index);

      // If in combined view and only 0-1 reports remain, snap to index 0
      let nextIndex = prev.activeReportIndex;
      if (nextIndex === -1 && reports.length <= 1) {
        nextIndex = 0;
      } else if (nextIndex >= 0) {
        nextIndex = Math.min(nextIndex, Math.max(0, reports.length - 1));
      }

      return {
        ...prev,
        reports,
        rawCsvs,
        fileHashes: new Set(rawCsvs.map(simpleHash)),
        activeReportIndex: nextIndex,
      };
    });
  }, []);

  const clearAllReports = useCallback(() => {
    clearCachedCSVs();
    setState((prev) => ({
      ...prev,
      reports: [],
      rawCsvs: [],
      fileHashes: new Set<string>(),
      activeReportIndex: 0,
    }));
  }, []);

  const setActiveReport = useCallback((index: number) => {
    setState((prev) => {
      // Combined view (-1) preserves filters so users can keep exploring
      if (index === -1) {
        return { ...prev, activeReportIndex: -1 };
      }
      return {
        ...prev,
        activeReportIndex: index,
        periodKey: 'all',
        dateRange: null,
        searchQuery: '',
      };
    });
  }, []);

  const setGroupByColumn = useCallback((column: string) => {
    setState((prev) => ({ ...prev, groupByColumn: column }));
  }, []);

  const setTimeBucket = useCallback((bucket: TimeBucket) => {
    setState((prev) => ({ ...prev, timeBucket: bucket }));
  }, []);

  const setPeriodKey = useCallback((periodKey: string) => {
    startTransition(() => setState((prev) => ({ ...prev, periodKey, dateRange: null })));
  }, []);

  const setDateRange = useCallback((dateRange: DateRange | null) => {
    startTransition(() => setState((prev) => ({ ...prev, dateRange, periodKey: dateRange ? 'custom' : 'all' })));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    startTransition(() => setState((prev) => ({ ...prev, searchQuery })));
  }, []);

  const setFilter = useCallback((column: string, values: string[]) => {
    startTransition(() => {
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
    });
  }, []);

  const clearFilters = useCallback(() => {
    startTransition(() => setState((prev) => ({ ...prev, filters: {} })));
  }, []);

  // Build a synthetic merged report when activeReportIndex === -1
  const activeReport = useMemo((): ParsedReport | null => {
    if (state.activeReportIndex !== -1) {
      return state.reports[state.activeReportIndex] ?? null;
    }

    if (state.reports.length < 2) return state.reports[0] ?? null;

    // Find the most common report type
    const typeCounts = new Map<string, number>();
    for (const r of state.reports) {
      typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    }
    let majorityType = state.reports[0].type;
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        majorityType = type as ParsedReport['type'];
        maxCount = count;
      }
    }

    const matchingReports = state.reports.filter((r) => r.type === majorityType);
    if (matchingReports.length < 2) return state.reports[0] ?? null;

    const allRows = matchingReports.flatMap((r) => r.rows);
    const starts = matchingReports.map((r) => r.dateRange.start).sort();
    const ends = matchingReports.map((r) => r.dateRange.end).sort();

    return {
      type: majorityType,
      rows: allRows,
      fileName: 'Combined View',
      rowCount: allRows.length,
      dateRange: {
        start: starts[0],
        end: ends[ends.length - 1],
      },
    };
  }, [state.reports, state.activeReportIndex]);

  const activeReportType = activeReport?.type ?? null;
  const normalizedSearchQuery = state.searchQuery.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    return (activeReport?.rows ?? []).filter((row) => {
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

        // Separate include vs exclude (negated with '!' prefix) values
        const excludes = values.filter((v) => v.startsWith('!')).map((v) => v.slice(1).toLowerCase());
        const includes = values.filter((v) => !v.startsWith('!')).map((v) => v.toLowerCase());

        // If any exclude matches, reject the row
        if (excludes.length > 0 && excludes.includes(currentValue)) return false;
        // If there are include values, the row must match one of them
        if (includes.length > 0 && !includes.some((v) => currentValue === v)) return false;

        return true;
      });

      if (!matchesPeriod || !matchesAdvancedFilters) return false;
      if (!normalizedSearchQuery) return true;

      return Object.values(rowRecord).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(normalizedSearchQuery),
      );
    });
  }, [activeReport, state.periodKey, state.dateRange, state.filters, normalizedSearchQuery]);

  return (
    <ReportContext.Provider
      value={{
        ...state,
        isHydrating,
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
