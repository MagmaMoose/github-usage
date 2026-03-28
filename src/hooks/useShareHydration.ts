import { useEffect } from 'react';
import type { ParsedReport, TimeBucket } from '../lib/types';
import { parseCSV } from '../lib/csv-parser';
import { readShareData, clearShareHash } from '../lib/share-state';

interface ShareHydrationDeps {
  addReport: (report: ParsedReport, rawCsv: string) => number;
  setGroupByColumn: (column: string) => void;
  setTimeBucket: (bucket: TimeBucket) => void;
  setPeriodKey: (key: string) => void;
  setSearchQuery: (query: string) => void;
  setFilter: (column: string, values: string[]) => void;
}

/** Hydrate reports and filter state from a compressed share URL on mount */
export function useShareHydration({
  addReport,
  setGroupByColumn,
  setTimeBucket,
  setPeriodKey,
  setSearchQuery,
  setFilter,
}: ShareHydrationDeps): void {
  useEffect(() => {
    (async () => {
      const shareData = await readShareData();
      if (!shareData) return;

      for (const csv of shareData.c) {
        try {
          addReport(parseCSV(csv.data, csv.name), csv.data);
        } catch {
          // Skip corrupted share entries
        }
      }

      if (shareData.s.groupBy) setGroupByColumn(shareData.s.groupBy);
      if (shareData.s.timeBucket) setTimeBucket(shareData.s.timeBucket as TimeBucket);
      if (shareData.s.period) setPeriodKey(shareData.s.period);
      if (shareData.s.search) setSearchQuery(shareData.s.search);
      if (shareData.s.filters) {
        for (const [field, values] of Object.entries(shareData.s.filters)) {
          setFilter(field, values);
        }
      }

      clearShareHash();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
