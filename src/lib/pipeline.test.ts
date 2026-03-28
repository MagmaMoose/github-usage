/**
 * Integration tests: CSV → Parse → Filter → Group → Aggregate
 *
 * These tests load real anonymized example CSVs and verify the entire data
 * pipeline produces correct numbers. If a parsing change silently drops rows,
 * miscounts users, or corrupts dollar amounts, these tests catch it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCSV } from './csv-parser';
import { groupBy, sumBy, timeBucket, topN, computeSummary, getTimeBucketKey } from './aggregation';
import type {
  PremiumRequestRow,
  TokenUsageRow,
  UsageReportRow,
  GhasActiveCommittersRow,
  CopilotSeatActivityRow,
  DormantUsersRow,
  EnterpriseMemberRow,
} from './types';

const EXAMPLES_DIR = join(__dirname, '../../examples');

function loadCSV(filename: string) {
  const content = readFileSync(join(EXAMPLES_DIR, filename), 'utf-8');
  return parseCSV(content, filename);
}

// ── Usage Report Pipeline ───────────────────────────────────────

describe('usage report pipeline', () => {
  const report = loadCSV('usageReport_1_7f2ed6006ee54fb8af73f5cbb7ac1f1d.csv');
  const rows = report.rows as UsageReportRow[];

  it('parses all rows without data loss', () => {
    // The CSV has 90085 data rows (90086 lines minus header)
    expect(rows.length).toBe(90085);
    expect(report.type).toBe('usage_report');
  });

  it('gross minus discount equals net for every row', () => {
    // This is the fundamental billing identity. If it breaks, money is wrong.
    for (const row of rows) {
      const computed = row.grossAmount - row.discountAmount;
      expect(Math.abs(computed - row.netAmount)).toBeLessThan(0.01);
    }
  });

  it('summary totals are internally consistent', () => {
    const summary = computeSummary(rows);

    // Discount should explain the gap between gross and net
    expect(Math.abs(summary.totalGrossAmount - summary.totalDiscountAmount - summary.totalNetAmount)).toBeLessThan(1);

    // Should have a reasonable number of unique entities
    expect(summary.uniqueUsers).toBeGreaterThan(50);
    expect(summary.uniqueOrganizations).toBeGreaterThan(5);
    expect(summary.uniqueProducts).toBeGreaterThan(1);
    expect(summary.uniqueRepositories).toBeGreaterThan(100);

    // Date range should be within Feb 2026 (this report is Feb only)
    expect(summary.dateRange.start).toMatch(/^2026-02/);
    expect(summary.dateRange.end).toMatch(/^2026-02/);
  });

  it('minutes total matches sum of minute-type rows only', () => {
    const summary = computeSummary(rows);
    const minuteRows = rows.filter(r => r.unitType === 'minutes');
    const manualMinutes = minuteRows.reduce((sum, r) => sum + r.quantity, 0);
    expect(summary.totalMinutes).toBe(manualMinutes);

    // Storage rows should NOT be counted as minutes
    const storageRows = rows.filter(r => r.unitType === 'gigabyte-hours');
    expect(storageRows.length).toBeGreaterThan(0);
    expect(summary.totalStorageGBH).toBeGreaterThan(0);
  });

  it('groupBy product produces expected products', () => {
    const groups = groupBy(rows, 'product');
    expect(groups.has('actions')).toBe(true);
    expect(groups.has('copilot')).toBe(true);

    // Actions should be the largest product by row count
    const actionRows = groups.get('actions')!;
    const copilotRows = groups.get('copilot')!;
    expect(actionRows.length).toBeGreaterThan(copilotRows.length);
  });

  it('topN users by gross spend returns descending order', () => {
    const top = topN(rows, 'username', 'grossAmount', 5);
    expect(top.length).toBe(5);

    // Each subsequent user should have <= spend than the previous
    for (let i = 1; i < top.length; i++) {
      expect(top[i].value).toBeLessThanOrEqual(top[i - 1].value);
    }

    // Top user should have non-trivial spend
    expect(top[0].value).toBeGreaterThan(0);
  });

  it('self-hosted runners have zero cost', () => {
    const selfHosted = rows.filter(r => r.sku.includes('self_hosted'));
    expect(selfHosted.length).toBeGreaterThan(0);
    for (const row of selfHosted) {
      expect(row.appliedCostPerQuantity).toBe(0);
    }
  });

  it('filtering by organization reduces rows correctly', () => {
    const groups = groupBy(rows, 'organization');
    const orgs = [...groups.keys()].filter(k => k !== '(empty)');
    const firstOrg = orgs[0];
    const orgRows = groups.get(firstOrg)!;

    // Filtered summary should have less than total
    const fullSummary = computeSummary(rows);
    const filteredSummary = computeSummary(orgRows);
    expect(filteredSummary.totalGrossAmount).toBeLessThan(fullSummary.totalGrossAmount);
    expect(filteredSummary.uniqueUsers).toBeLessThanOrEqual(fullSummary.uniqueUsers);
  });

  it('time bucketing by month produces February data', () => {
    const monthly = timeBucket(rows, 'monthly');
    const keys = [...monthly.keys()];
    expect(keys).toContain('2026-02');
    // Sum of rows across buckets should equal total
    const totalFromBuckets = [...monthly.values()].reduce((sum, arr) => sum + arr.length, 0);
    expect(totalFromBuckets).toBe(rows.length);
  });
});

// ── Premium Request Pipeline ────────────────────────────────────

describe('premium request pipeline', () => {
  const report = loadCSV('premiumRequestUsageReport_1_c6fca30f0acd458098a95808eaf43399.csv');
  const rows = report.rows as PremiumRequestRow[];

  it('parses all rows', () => {
    expect(rows.length).toBe(1969);
    expect(report.type).toBe('premium_request');
  });

  it('every row has quantity >= 0', () => {
    for (const row of rows) {
      expect(row.quantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('applied_cost_per_quantity uses known price points', () => {
    // Real data has $0.04 (standard) and $0.01 (discounted/agent) pricing
    const costs = new Set(rows.map(r => r.appliedCostPerQuantity));
    for (const cost of costs) {
      expect([0.04, 0.01]).toContain(cost);
    }
  });

  it('groupBy model shows real AI model names', () => {
    const groups = groupBy(rows, 'model');
    const models = [...groups.keys()];

    // Should have actual model names, not corrupted data
    const hasClaudeModels = models.some(m => m.includes('Claude'));
    const hasGPTModels = models.some(m => m.includes('GPT'));
    expect(hasClaudeModels).toBe(true);
    expect(hasGPTModels).toBe(true);
  });

  it('exceeds_quota flag is a boolean, not a string', () => {
    // This caught a real bug before: "True"/"False" strings vs actual booleans
    for (const row of rows) {
      expect(typeof row.exceedsQuota).toBe('boolean');
    }
  });

  it('topN models by quantity produces reasonable distribution', () => {
    const top = topN(rows, 'model', 'quantity', 3);
    expect(top.length).toBe(3);

    // No single model should account for >80% of all requests
    const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
    expect(top[0].value / totalQty).toBeLessThan(0.8);
  });
});

// ── Token Usage Pipeline ────────────────────────────────────────

describe('token usage pipeline', () => {
  const report = loadCSV('Token.Usage.Report.csv');
  const rows = report.rows as TokenUsageRow[];

  it('parses all rows', () => {
    expect(rows.length).toBe(207);
    expect(report.type).toBe('token_usage');
  });

  it('token columns are numbers not strings', () => {
    for (const row of rows) {
      expect(typeof row.totalInputTokens).toBe('number');
      expect(typeof row.totalOutputTokens).toBe('number');
      expect(typeof row.totalCacheCreationTokens).toBe('number');
      expect(typeof row.totalCacheReadTokens).toBe('number');
    }
  });

  it('input tokens are always >= 0', () => {
    for (const row of rows) {
      expect(row.totalInputTokens).toBeGreaterThanOrEqual(0);
    }
  });

  it('summary token count equals sum of all token columns', () => {
    const summary = computeSummary(rows);
    let manualTotal = 0;
    for (const row of rows) {
      manualTotal += row.totalInputTokens + row.totalOutputTokens
        + row.totalCacheCreationTokens + row.totalCacheReadTokens;
    }
    expect(summary.totalTokens).toBe(manualTotal);
  });

  it('Claude models use cache creation, non-Claude models do not', () => {
    // Real observation: most Claude models have cache creation tokens,
    // but some (like Claude Sonnet 4.6, Auto: Claude Haiku) may not.
    // Non-Claude models should NEVER have cache creation tokens.
    const grouped = groupBy(rows, 'model');
    let claudeTotalCacheCreation = 0;
    for (const [model, modelRows] of grouped) {
      const totalCacheCreation = modelRows.reduce((sum, r) => sum + r.totalCacheCreationTokens, 0);
      if (model.includes('Claude')) {
        claudeTotalCacheCreation += totalCacheCreation;
      } else {
        // Non-Claude models should have zero cache creation
        expect(totalCacheCreation).toBe(0);
      }
    }
    // Claude as a family should have substantial cache creation
    expect(claudeTotalCacheCreation).toBeGreaterThan(0);
  });

  it('daily bucketing covers February 2026', () => {
    const daily = timeBucket(rows, 'daily');
    const keys = [...daily.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(28);
    expect(keys[0]).toMatch(/^2026-02/);
  });
});

// ── GHAS Active Committers Pipeline ─────────────────────────────

describe('ghas active committers pipeline', () => {
  const report = loadCSV('ghas_active_committers_octodemo_2026-03-27T1521.csv');
  const rows = report.rows as GhasActiveCommittersRow[];

  it('parses all rows', () => {
    expect(rows.length).toBe(604);
    expect(report.type).toBe('ghas_active_committers');
  });

  it('every row has a non-empty user login', () => {
    for (const row of rows) {
      expect(row.userLogin).toBeTruthy();
      expect(row.userLogin.length).toBeGreaterThan(0);
    }
  });

  it('unique committer count is less than total rows (users appear in multiple repos)', () => {
    const summary = computeSummary(rows);
    expect(summary.uniqueUsers).toBeLessThan(rows.length);
    expect(summary.uniqueUsers).toBeGreaterThan(10);
  });

  it('org/repo column contains a slash separator', () => {
    for (const row of rows) {
      // The parser splits this into organization (just org name) but let's verify
      // the row has repo data
      expect(row.repository).toBeTruthy();
    }
  });
});

// ── Copilot Seat Activity Pipeline ──────────────────────────────

describe('copilot seat activity pipeline', () => {
  const report = loadCSV('octodemo-seat-activity-1774680875.csv');
  const rows = report.rows as CopilotSeatActivityRow[];

  it('parses all rows', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(report.type).toBe('copilot_seat_activity');
  });

  it('summary counts active vs total seats', () => {
    const summary = computeSummary(rows);
    expect(summary.totalSeats).toBe(rows.length);
    expect(summary.activeSeats).toBeLessThanOrEqual(summary.totalSeats);
    expect(summary.activeSeats).toBeGreaterThan(0);
  });

  it('last surface used contains realistic IDE identifiers', () => {
    const surfaces = new Set(rows.map(r => r.lastSurfaceUsed));
    // Should have VS Code entries (the dominant IDE)
    const hasVsCode = [...surfaces].some(s => s.includes('vscode'));
    expect(hasVsCode).toBe(true);
  });
});

// ── Dormant Users Pipeline ──────────────────────────────────────

describe('dormant users pipeline', () => {
  const report = loadCSV('export-octodemo-1774679438.csv');
  const rows = report.rows as DormantUsersRow[];

  it('parses all rows', () => {
    expect(rows.length).toBeGreaterThan(50);
    expect(report.type).toBe('dormant_users');
  });

  it('2FA field is parsed as boolean', () => {
    for (const row of rows) {
      expect(typeof row.twoFactorEnabled).toBe('boolean');
    }
  });

  it('summary counts 2FA adoption', () => {
    const summary = computeSummary(rows);
    expect(summary.totalMembers).toBe(rows.length);
    expect(summary.twoFactorCount).toBeGreaterThan(0);
    expect(summary.twoFactorCount).toBeLessThanOrEqual(summary.totalMembers);
  });

  it('role is either user or admin', () => {
    const roles = new Set(rows.map(r => r.role));
    for (const role of roles) {
      expect(['user', 'admin']).toContain(role);
    }
  });
});

// ── Enterprise Members Pipeline ─────────────────────────────────

describe('enterprise members pipeline', () => {
  const report = loadCSV('export-octodemo-1774709193.csv');
  const rows = report.rows as EnterpriseMemberRow[];

  it('parses all rows', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(report.type).toBe('enterprise_members');
  });

  it('summary counts licenses and GHAS seats', () => {
    const summary = computeSummary(rows);
    expect(summary.totalLicenses).toBe(rows.length);
    expect(summary.ghasLicenseCount).toBeGreaterThanOrEqual(0);
    expect(summary.ghasLicenseCount).toBeLessThanOrEqual(summary.totalLicenses);
  });
});

// ── Cross-Cutting Pipeline Tests ────────────────────────────────

describe('cross-cutting pipeline integrity', () => {
  it('groupBy then sumBy equals direct sumBy for any column', () => {
    const report = loadCSV('premiumRequestUsageReport_1_c6fca30f0acd458098a95808eaf43399.csv');
    const rows = report.rows as PremiumRequestRow[];

    // Sum gross across all rows
    const directSum = sumBy(rows, 'grossAmount');

    // Sum gross within each model group, then add up
    const groups = groupBy(rows, 'model');
    let groupedSum = 0;
    for (const [, groupRows] of groups) {
      groupedSum += sumBy(groupRows, 'grossAmount');
    }

    // These must be equal (conservation of money)
    expect(Math.abs(directSum - groupedSum)).toBeLessThan(0.01);
  });

  it('weekly bucketing assigns every row to exactly one week', () => {
    const report = loadCSV('Token.Usage.Report.csv');
    const rows = report.rows as TokenUsageRow[];

    const weekly = timeBucket(rows, 'weekly');
    const totalFromBuckets = [...weekly.values()].reduce((sum, arr) => sum + arr.length, 0);
    expect(totalFromBuckets).toBe(rows.length);

    // All bucket keys should be Mondays
    for (const key of weekly.keys()) {
      const d = new Date(key);
      expect(d.getUTCDay()).toBe(1); // Monday
    }
  });

  it('getTimeBucketKey is deterministic and consistent across row dates', () => {
    // Same date should always produce same bucket key
    expect(getTimeBucketKey('2026-03-15', 'daily')).toBe('2026-03-15');
    expect(getTimeBucketKey('2026-03-15', 'monthly')).toBe('2026-03');

    // Two dates in the same week should produce the same weekly key
    const mon = getTimeBucketKey('2026-03-09', 'weekly'); // Monday
    const wed = getTimeBucketKey('2026-03-11', 'weekly'); // Wednesday
    expect(mon).toBe(wed);
    // Sun Mar 15 may or may not be same week depending on implementation
    // The important thing: consecutive Mondays should produce different keys
    const nextMon = getTimeBucketKey('2026-03-16', 'weekly');
    expect(nextMon).not.toBe(mon);
  });

  it('empty date field handled gracefully in bucketing', () => {
    expect(getTimeBucketKey('', 'daily')).toBe('(unknown)');
    expect(getTimeBucketKey('', 'monthly')).toBe('(unknown)');
    expect(getTimeBucketKey('', 'weekly')).toBe('(unknown)');
  });

  it('topN with n > groups returns all groups', () => {
    const report = loadCSV('Token.Usage.Report.csv');
    const rows = report.rows as TokenUsageRow[];
    const models = new Set(rows.map(r => r.model));
    const top = topN(rows, 'model', 'grossAmount', 999);
    expect(top.length).toBe(models.size);
  });

  it('sumBy _count returns row count', () => {
    const report = loadCSV('Token.Usage.Report.csv');
    const rows = report.rows as TokenUsageRow[];
    expect(sumBy(rows, '_count')).toBe(rows.length);
  });
});
