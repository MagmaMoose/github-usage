import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCompact,
  formatNumber,
  formatDate,
  formatDateRange,
  formatDatetime,
  formatBucketLabels,
  bucketKeyToTimestamp,
  formatDateRangeCompact,
  formatDisplayValue,
  humanizeColumn,
  isBot,
  getAvatarUrl,
  formatWorkflowPath,
  classifyWorkflowPath,
} from './formatters';

describe('formatCurrency', () => {
  it('formats positive amounts', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats small amounts', () => {
    expect(formatCurrency(0.04)).toBe('$0.04');
  });

  it('formats large amounts', () => {
    expect(formatCurrency(34214.32)).toBe('$34,214.32');
  });
});

describe('formatCompact', () => {
  it('formats billions', () => {
    expect(formatCompact(1_500_000_000)).toBe('1.5B');
  });

  it('formats millions', () => {
    expect(formatCompact(2_300_000)).toBe('2.3M');
  });

  it('formats thousands', () => {
    expect(formatCompact(44_897)).toBe('44.9K');
  });

  it('formats small numbers as-is', () => {
    expect(formatCompact(42)).toBe('42');
  });

  it('formats zero', () => {
    expect(formatCompact(0)).toBe('0');
  });

  it('formats fractional values with precision', () => {
    expect(formatCompact(0.035714)).toBe('0.036');
    expect(formatCompact(0.5)).toBe('0.50');
    expect(formatCompact(0.001)).toBe('0.0010');
  });
});

describe('formatNumber', () => {
  it('formats with commas', () => {
    expect(formatNumber(1395060)).toBe('1,395,060');
  });

  it('formats small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatDate', () => {
  it('formats YYYY-MM-DD dates', () => {
    const result = formatDate('2026-03-01');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/2026/);
  });

  it('formats YYYY-MM (monthly bucket)', () => {
    const result = formatDate('2026-03');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/2026/);
  });

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('');
  });
});

describe('formatDateRange', () => {
  it('formats a range', () => {
    const result = formatDateRange('2026-03-01', '2026-03-16');
    expect(result).toContain('—');
  });

  it('returns single date when start equals end', () => {
    const result = formatDateRange('2026-03-01', '2026-03-01');
    expect(result).not.toContain('—');
  });

  it('returns empty for empty inputs', () => {
    expect(formatDateRange('', '')).toBe('');
  });
});

describe('humanizeColumn', () => {
  it('maps known columns', () => {
    expect(humanizeColumn('username')).toBe('User');
    expect(humanizeColumn('grossAmount')).toBe('Gross Amount');
    expect(humanizeColumn('aicQuantity')).toBe('AI Credits');
    expect(humanizeColumn('totalInputTokens')).toBe('Input Tokens');
  });

  it('falls back to title case for unknown columns', () => {
    expect(humanizeColumn('fooBarBaz')).toBe('Foo Bar Baz');
  });
});

describe('formatDatetime', () => {
  it('formats ISO datetime string', () => {
    const result = formatDatetime('2026-03-28T06:54:33Z');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/28/);
    expect(result).toMatch(/2026/);
  });

  it('returns dash for None', () => {
    expect(formatDatetime('None')).toBe('—');
  });

  it('returns dash for empty string', () => {
    expect(formatDatetime('')).toBe('—');
  });

  it('returns raw value for invalid date', () => {
    expect(formatDatetime('not-a-date')).toBe('not-a-date');
  });
});

describe('formatBucketLabels', () => {
  it('formats daily keys within same year', () => {
    const labels = formatBucketLabels(['2026-03-01', '2026-03-15']);
    expect(labels).toEqual(['3/1', '3/15']);
  });

  it('formats daily keys across years', () => {
    const labels = formatBucketLabels(['2025-12-31', '2026-01-01']);
    expect(labels).toEqual(['12/31/25', '1/1/26']);
  });

  it('formats monthly keys within same year', () => {
    const labels = formatBucketLabels(['2026-02', '2026-03']);
    expect(labels[0]).toMatch(/Feb/);
    expect(labels[1]).toMatch(/Mar/);
    expect(labels[0]).not.toMatch(/2026/);
  });

  it('formats monthly keys across years', () => {
    const labels = formatBucketLabels(['2025-12', '2026-01']);
    expect(labels[0]).toMatch(/Dec/);
    expect(labels[0]).toMatch(/2025/);
    expect(labels[1]).toMatch(/Jan/);
    expect(labels[1]).toMatch(/2026/);
  });

  it('returns empty array for empty input', () => {
    expect(formatBucketLabels([])).toEqual([]);
  });
});

describe('bucketKeyToTimestamp', () => {
  it('converts daily key to UTC timestamp', () => {
    const ts = bucketKeyToTimestamp('2026-03-15');
    const d = new Date(ts);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // 0-indexed
    expect(d.getUTCDate()).toBe(15);
  });

  it('converts monthly key to first of month', () => {
    const ts = bucketKeyToTimestamp('2026-02');
    const d = new Date(ts);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(1);
  });
});

describe('formatDateRangeCompact', () => {
  it('returns single month when same month', () => {
    const result = formatDateRangeCompact('2026-03-01', '2026-03-28');
    expect(result).toMatch(/Mar 2026/);
    expect(result).not.toContain('–');
  });

  it('returns range when different months same year', () => {
    const result = formatDateRangeCompact('2026-02-01', '2026-03-28');
    expect(result).toContain('Feb');
    expect(result).toContain('Mar');
    expect(result).toContain('–');
  });

  it('returns range with years when different years', () => {
    const result = formatDateRangeCompact('2025-12-01', '2026-03-01');
    expect(result).toContain('2025');
    expect(result).toContain('2026');
  });

  it('returns empty for empty inputs', () => {
    expect(formatDateRangeCompact('', '')).toBe('');
  });
});

describe('formatDisplayValue', () => {
  it('formats SKU codes to human-readable names', () => {
    expect(formatDisplayValue('copilot_premium_request', 'sku')).toBe('Copilot PRUs');
    expect(formatDisplayValue('actions_linux', 'sku')).toBe('Actions Linux');
    expect(formatDisplayValue('actions_macos', 'sku')).toBe('Actions macOS');
  });

  it('formats product codes to display names', () => {
    expect(formatDisplayValue('copilot', 'product')).toBe('GitHub Copilot');
    expect(formatDisplayValue('actions', 'product')).toBe('GitHub Actions');
    expect(formatDisplayValue('git_lfs', 'product')).toBe('Git LFS');
  });

  it('passes through unknown values', () => {
    expect(formatDisplayValue('unknown_sku', 'sku')).toBe('unknown_sku');
    expect(formatDisplayValue('some-user', 'username')).toBe('some-user');
  });

  it('formats boolean values', () => {
    expect(formatDisplayValue('true')).toBe('Yes');
    expect(formatDisplayValue('false')).toBe('No');
  });

  it('returns empty for empty input', () => {
    expect(formatDisplayValue('')).toBe('');
  });

  it('formats workflow paths when column is workflowPath', () => {
    expect(formatDisplayValue('.github/workflows/ci.yml', 'workflowPath')).toBe('ci.yml');
  });
});

describe('isBot', () => {
  it('returns true for bot usernames', () => {
    expect(isBot('dependabot[bot]')).toBe(true);
    expect(isBot('github-actions[bot]')).toBe(true);
    expect(isBot('custom-app[bot]')).toBe(true);
  });

  it('returns false for regular usernames', () => {
    expect(isBot('jmarquez')).toBe(false);
    expect(isBot('alex42')).toBe(false);
    expect(isBot('')).toBe(false);
  });
});

describe('getAvatarUrl', () => {
  it('returns ghost avatar for empty username', () => {
    expect(getAvatarUrl('')).toContain('ghost.png');
    expect(getAvatarUrl('(empty)')).toContain('ghost.png');
  });

  it('returns cached URL for known bots', () => {
    const url = getAvatarUrl('dependabot[bot]');
    expect(url).toContain('avatars.githubusercontent.com');
  });

  it('returns .png shortcut for unknown bots', () => {
    const url = getAvatarUrl('my-custom-app[bot]');
    expect(url).toContain('github.com/my-custom-app.png');
  });

  it('returns github avatar URL for regular users', () => {
    const url = getAvatarUrl('jmarquez');
    expect(url).toContain('github.com/jmarquez.png');
  });

  it('includes size parameter', () => {
    const url = getAvatarUrl('test-user', 80);
    expect(url).toContain('size=80');
  });
});

describe('formatWorkflowPath', () => {
  it('extracts filename from standard workflow path', () => {
    expect(formatWorkflowPath('.github/workflows/ci.yml')).toBe('ci.yml');
    expect(formatWorkflowPath('.github/workflows/deploy.yml')).toBe('deploy.yml');
  });

  it('extracts name from dynamic paths', () => {
    expect(formatWorkflowPath('dynamic/github-code-scanning/codeql')).toBe('codeql');
    expect(formatWorkflowPath('dynamic/dependabot/dependabot-updates')).toBe('dependabot-updates');
  });

  it('extracts filename from required workflow paths', () => {
    expect(formatWorkflowPath('required/123/.github/workflows/dependency-review.yml')).toBe('dependency-review.yml');
  });

  it('returns (empty) for empty path', () => {
    expect(formatWorkflowPath('')).toBe('(empty)');
  });

  it('returns raw path for unrecognized format', () => {
    expect(formatWorkflowPath('some/random/path')).toBe('some/random/path');
  });
});

describe('classifyWorkflowPath', () => {
  it('classifies standard workflow paths', () => {
    expect(classifyWorkflowPath('.github/workflows/ci.yml')).toBe('standard');
  });

  it('classifies dynamic/managed paths', () => {
    expect(classifyWorkflowPath('dynamic/github-code-scanning/codeql')).toBe('managed');
  });

  it('classifies required paths', () => {
    expect(classifyWorkflowPath('required/123/.github/workflows/review.yml')).toBe('required');
  });

  it('returns null for empty path', () => {
    expect(classifyWorkflowPath('')).toBeNull();
  });

  it('returns null for unrecognized path', () => {
    expect(classifyWorkflowPath('something/else')).toBeNull();
  });
});
