import { useEffect, useMemo } from 'react';
import type { ParsedReport } from '../lib/types';

/** Auto-set period filter when only one period is available in the data */
export function usePeriodInference(
  activeReport: ParsedReport | null,
  periodKey: string,
  setPeriodKey: (key: string) => void,
): string[] {
  const availablePeriods = useMemo(() => {
    if (!activeReport) return [];
    return [
      ...new Set(
        activeReport.rows.map((row) =>
          String(((row as unknown as Record<string, unknown>).date ?? '')).slice(0, 7),
        ),
      ),
    ]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [activeReport]);

  useEffect(() => {
    if (availablePeriods.length === 1 && periodKey === 'all') {
      setPeriodKey(availablePeriods[0]);
      return;
    }
    if (availablePeriods.length > 1 && periodKey !== 'all' && !availablePeriods.includes(periodKey)) {
      setPeriodKey('all');
    }
  }, [availablePeriods, periodKey, setPeriodKey]);

  return availablePeriods;
}
