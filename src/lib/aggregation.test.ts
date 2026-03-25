import { describe, it, expect } from 'vitest';
import { groupBy, sumBy, timeBucket, getTimeBucketKey, topN, computeSummary } from './aggregation';
import type { PremiumRequestRow } from './types';

function makeRow(overrides: Partial<PremiumRequestRow> = {}): PremiumRequestRow {
  return {
    date: '2026-03-01',
    username: 'user1',
    product: 'copilot',
    sku: 'copilot_premium_request',
    model: 'Claude Opus 4.6',
    quantity: 10,
    unitType: 'requests',
    appliedCostPerQuantity: 0.04,
    grossAmount: 0.4,
    discountAmount: 0.4,
    netAmount: 0,
    exceedsQuota: false,
    totalMonthlyQuota: 1000,
    organization: 'octodemo',
    costCenterName: '',
    aicQuantity: 0,
    aicGrossAmount: 0,
    ...overrides,
  };
}

describe('groupBy', () => {
  it('groups rows by a column', () => {
    const rows = [
      makeRow({ username: 'alice' }),
      makeRow({ username: 'bob' }),
      makeRow({ username: 'alice' }),
    ];
    const groups = groupBy(rows, 'username');
    expect(groups.size).toBe(2);
    expect(groups.get('alice')?.length).toBe(2);
    expect(groups.get('bob')?.length).toBe(1);
  });

  it('handles empty column values as "(empty)"', () => {
    const rows = [makeRow({ username: '' })];
    const groups = groupBy(rows, 'username');
    expect(groups.has('(empty)')).toBe(true);
  });

  it('handles single row', () => {
    const groups = groupBy([makeRow()], 'model');
    expect(groups.size).toBe(1);
  });

  it('handles empty array', () => {
    const groups = groupBy([], 'username');
    expect(groups.size).toBe(0);
  });
});

describe('sumBy', () => {
  it('sums a numeric column', () => {
    const rows = [makeRow({ grossAmount: 10 }), makeRow({ grossAmount: 20 })];
    expect(sumBy(rows, 'grossAmount')).toBe(30);
  });

  it('returns 0 for empty array', () => {
    expect(sumBy([], 'grossAmount')).toBe(0);
  });

  it('ignores non-numeric columns gracefully', () => {
    const rows = [makeRow()];
    expect(sumBy(rows, 'username')).toBe(0);
  });
});

describe('getTimeBucketKey', () => {
  it('returns date as-is for daily bucket', () => {
    expect(getTimeBucketKey('2026-03-15', 'daily')).toBe('2026-03-15');
  });

  it('returns YYYY-MM for monthly bucket', () => {
    expect(getTimeBucketKey('2026-03-15', 'monthly')).toBe('2026-03');
  });

  it('returns Monday of the week for weekly bucket', () => {
    // March 15, 2026 is a Sunday → Monday is March 9
    expect(getTimeBucketKey('2026-03-15', 'weekly')).toBe('2026-03-09');
  });

  it('handles Monday correctly for weekly bucket', () => {
    // March 9, 2026 is a Monday → should return itself
    expect(getTimeBucketKey('2026-03-09', 'weekly')).toBe('2026-03-09');
  });

  it('returns "(unknown)" for empty date', () => {
    expect(getTimeBucketKey('', 'daily')).toBe('(unknown)');
  });
});

describe('timeBucket', () => {
  it('groups rows by month', () => {
    const rows = [
      makeRow({ date: '2026-02-01' }),
      makeRow({ date: '2026-02-15' }),
      makeRow({ date: '2026-03-01' }),
    ];
    const groups = timeBucket(rows, 'monthly');
    expect(groups.size).toBe(2);
    expect(groups.get('2026-02')?.length).toBe(2);
    expect(groups.get('2026-03')?.length).toBe(1);
  });

  it('returns sorted entries', () => {
    const rows = [makeRow({ date: '2026-03-01' }), makeRow({ date: '2026-01-01' })];
    const groups = timeBucket(rows, 'monthly');
    const keys = [...groups.keys()];
    expect(keys[0]).toBe('2026-01');
    expect(keys[1]).toBe('2026-03');
  });
});

describe('topN', () => {
  it('returns top N groups by metric', () => {
    const rows = [
      makeRow({ username: 'alice', grossAmount: 100 }),
      makeRow({ username: 'bob', grossAmount: 50 }),
      makeRow({ username: 'charlie', grossAmount: 200 }),
      makeRow({ username: 'alice', grossAmount: 50 }),
    ];
    const top = topN(rows, 'username', 'grossAmount', 2);
    expect(top.length).toBe(2);
    expect(top[0].key).toBe('charlie');
    expect(top[0].value).toBe(200);
    expect(top[1].key).toBe('alice');
    expect(top[1].value).toBe(150);
  });

  it('handles N larger than groups', () => {
    const rows = [makeRow({ username: 'alice' })];
    const top = topN(rows, 'username', 'grossAmount', 10);
    expect(top.length).toBe(1);
  });
});

describe('computeSummary', () => {
  it('computes all summary metrics', () => {
    const rows = [
      makeRow({ username: 'alice', grossAmount: 10, netAmount: 2, discountAmount: 8, quantity: 5, model: 'GPT-5', organization: 'org1', date: '2026-03-01' }),
      makeRow({ username: 'bob', grossAmount: 20, netAmount: 5, discountAmount: 15, quantity: 10, model: 'Claude Opus 4.6', organization: 'org2', date: '2026-03-05' }),
    ];
    const summary = computeSummary(rows);
    expect(summary.totalGrossAmount).toBe(30);
    expect(summary.totalNetAmount).toBe(7);
    expect(summary.totalDiscountAmount).toBe(23);
    expect(summary.totalQuantity).toBe(15);
    expect(summary.uniqueUsers).toBe(2);
    expect(summary.uniqueModels).toBe(2);
    expect(summary.uniqueOrganizations).toBe(2);
    expect(summary.dateRange.start).toBe('2026-03-01');
    expect(summary.dateRange.end).toBe('2026-03-05');
  });
});
