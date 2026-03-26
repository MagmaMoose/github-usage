import { useCallback, useMemo, useState } from 'react';
import { ActionList, ActionMenu, Button } from '@primer/react';
import { CalendarIcon } from '@primer/octicons-react';
import { useReport } from '../context/useReport';
import type { DateRange } from '../context/report-context';
import styles from './PeriodSelector.module.css';

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatRangeLabel(range: DateRange): string {
  const fmt = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

export function PeriodSelector() {
  const { periodKey, dateRange, setPeriodKey, setDateRange, activeReport } = useReport();
  const [showCustom, setShowCustom] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateBounds = useMemo(() => {
    if (!activeReport) return { min: '', max: '' };
    return {
      min: activeReport.dateRange.start,
      max: activeReport.dateRange.end,
    };
  }, [activeReport]);

  // Auto-detect available months from report data
  const availableMonths = useMemo(() => {
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

  const buttonLabel = useMemo(() => {
    if (periodKey === 'custom' && dateRange) {
      return formatRangeLabel(dateRange);
    }
    if (periodKey === 'all' || !periodKey) return 'All data';
    return getMonthLabel(periodKey);
  }, [periodKey, dateRange]);

  const handleSelectAll = useCallback(() => {
    setPeriodKey('all');
    setShowCustom(false);
    setMenuOpen(false);
  }, [setPeriodKey]);

  const handleSelectMonth = useCallback(
    (month: string) => {
      setPeriodKey(month);
      setShowCustom(false);
      setMenuOpen(false);
    },
    [setPeriodKey],
  );

  const handleOpenCustom = useCallback(() => {
    setShowCustom(true);
    if (dateRange) {
      setCustomStart(dateRange.start);
      setCustomEnd(dateRange.end);
    } else if (dateBounds.min) {
      setCustomStart(dateBounds.min);
      setCustomEnd(dateBounds.max);
    }
  }, [dateRange, dateBounds]);

  const handleCustomApply = useCallback(() => {
    if (customStart && customEnd && customStart <= customEnd) {
      setDateRange({ start: customStart, end: customEnd });
      setShowCustom(false);
      setMenuOpen(false);
    }
  }, [customStart, customEnd, setDateRange]);

  if (!activeReport) return null;

  return (
    <ActionMenu open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) setShowCustom(false); }}>
      <ActionMenu.Button size="small" leadingVisual={CalendarIcon}>
        {buttonLabel}
      </ActionMenu.Button>
      <ActionMenu.Overlay width="medium" align="end">
        <ActionList selectionVariant="single">
          <ActionList.Item
            selected={periodKey === 'all'}
            onSelect={handleSelectAll}
          >
            All data
          </ActionList.Item>
          {availableMonths.map((month) => (
            <ActionList.Item
              key={month}
              selected={periodKey === month}
              onSelect={() => handleSelectMonth(month)}
            >
              {getMonthLabel(month)}
            </ActionList.Item>
          ))}
          <ActionList.Divider />
          <ActionList.Item
            selected={periodKey === 'custom'}
            onSelect={(e) => { e.preventDefault(); handleOpenCustom(); }}
          >
            Custom
          </ActionList.Item>
        </ActionList>

        {showCustom && (
          <div className={styles.customRange}>
            <div className={styles.dateInputs}>
              <label className={styles.dateLabel}>
                <span className={styles.dateLabelText}>Start</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={customStart}
                  min={dateBounds.min}
                  max={customEnd || dateBounds.max}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className={styles.dateLabel}>
                <span className={styles.dateLabelText}>End</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={customEnd}
                  min={customStart || dateBounds.min}
                  max={dateBounds.max}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.customActions}>
              <Button size="small" variant="invisible" onClick={() => setShowCustom(false)}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="primary"
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd || customStart > customEnd}
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
