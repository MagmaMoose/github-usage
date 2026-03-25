import { useMemo } from 'react';
import { SegmentedControl, ActionMenu, ActionList } from '@primer/react';
import { useReport } from '../context/useReport';
import { GROUPABLE_COLUMNS } from '../lib/types';
import { humanizeColumn } from '../lib/formatters';
import type { TimeBucket } from '../lib/types';
import styles from './GroupByControls.module.css';

export function GroupByControls() {
  const { activeReportType, groupByColumn, setGroupByColumn, timeBucket, setTimeBucket } =
    useReport();

  const columns = useMemo(() => {
    if (!activeReportType) return [];
    return [...GROUPABLE_COLUMNS[activeReportType]];
  }, [activeReportType]);

  if (!activeReportType) return null;

  const buckets: TimeBucket[] = ['daily', 'weekly', 'monthly'];
  const bucketIndex = buckets.indexOf(timeBucket);

  return (
    <div className={styles.controls}>
      <ActionMenu>
        <ActionMenu.Button>Group by: {humanizeColumn(groupByColumn)}</ActionMenu.Button>
        <ActionMenu.Overlay width="auto">
          <ActionList selectionVariant="single">
            {columns.map((col) => (
              <ActionList.Item
                key={col}
                selected={col === groupByColumn}
                onSelect={() => setGroupByColumn(col)}
              >
                {humanizeColumn(col)}
              </ActionList.Item>
            ))}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>

      <SegmentedControl
        aria-label="Time bucket"
        onChange={(index) => setTimeBucket(buckets[index])}
        size="small"
      >
        {buckets.map((b, i) => (
          <SegmentedControl.Button key={b} selected={i === bucketIndex}>
            {b.charAt(0).toUpperCase() + b.slice(1)}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
    </div>
  );
}
