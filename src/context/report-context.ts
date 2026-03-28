import { createContext } from 'react';
import type { ParsedReport, ReportType, TimeBucket } from '../lib/types';

export interface DateRange {
  start: string;
  end: string;
}

interface ReportState {
  reports: ParsedReport[];
  activeReportIndex: number;
  groupByColumn: string;
  timeBucket: TimeBucket;
  periodKey: string;
  dateRange: DateRange | null;
  searchQuery: string;
  filters: Record<string, string[]>;
}

/** A group of same-type reports from the same enterprise (shared orgs) that can be combined */
export interface CombinedGroup {
  /** Negative index used as activeReportIndex: -1, -2, etc. */
  index: number;
  /** Tab label, e.g. "Premium Requests (Feb–Mar 2026)" */
  label: string;
  /** Report type shared by all reports in this group */
  type: ReportType;
  /** Global indices into reports[] that belong to this group */
  reportIndices: number[];
}

export interface ReportContextValue extends ReportState {
  /** Raw CSV content parallel to reports[], used for sharing */
  rawCsvs: string[];
  /** Whether cached CSVs are still loading from IndexedDB */
  isHydrating: boolean;
  /** Returns -1 if the report was added, or the index of the existing duplicate */
  addReport: (report: ParsedReport, rawCsv: string) => number;
  removeReport: (index: number) => void;
  clearAllReports: () => void;
  setActiveReport: (index: number) => void;
  setGroupByColumn: (column: string) => void;
  setTimeBucket: (bucket: TimeBucket) => void;
  setPeriodKey: (periodKey: string) => void;
  setDateRange: (range: DateRange | null) => void;
  setSearchQuery: (searchQuery: string) => void;
  setFilter: (column: string, values: string[]) => void;
  clearFilters: () => void;
  activeReport: ParsedReport | null;
  activeReportType: ReportType | null;
  visibleRows: ParsedReport['rows'];
  /** Enterprise-aware combined groups (only groups with 2+ reports) */
  combinedGroups: CombinedGroup[];
}

export const ReportContext = createContext<ReportContextValue | null>(null);
