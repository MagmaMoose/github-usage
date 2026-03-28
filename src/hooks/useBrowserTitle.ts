import { useEffect } from 'react';
import type { ParsedReport } from '../lib/types';
import { getReportSchema } from '../lib/report-schema';
import { formatDateRangeCompact } from '../lib/formatters';

/** Sync the browser tab title with the active report */
export function useBrowserTitle(activeReport: ParsedReport | null): void {
  useEffect(() => {
    if (!activeReport) {
      document.title = 'TBB — GitHub Billing Dashboard';
      return;
    }
    const schema = getReportSchema(activeReport.type);
    const dateLabel = formatDateRangeCompact(activeReport.dateRange.start, activeReport.dateRange.end);
    const label = dateLabel ? `${schema.label} (${dateLabel})` : schema.label;
    document.title = `${label} — TBB | GitHub Billing Dashboard`;
  }, [activeReport]);
}
