import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCompact,
  formatNumber,
  formatDate,
  formatDateRange,
  humanizeColumn,
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
