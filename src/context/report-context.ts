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

export interface ReportContextValue extends ReportState {
  addReport: (report: ParsedReport) => void;
  removeReport: (index: number) => void;
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
}

export const ReportContext = createContext<ReportContextValue | null>(null);
