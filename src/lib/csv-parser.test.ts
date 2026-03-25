import { describe, it, expect } from 'vitest';
import { detectReportType, parseCSV } from './csv-parser';
import { REPORT_TYPES } from './types';
import type { PremiumRequestRow, TokenUsageRow, UsageReportRow } from './types';

describe('detectReportType', () => {
  it('detects premium request report from headers', () => {
    const headers = [
      'date',
      'username',
      'product',
      'sku',
      'model',
      'quantity',
      'unit_type',
      'applied_cost_per_quantity',
      'gross_amount',
      'discount_amount',
      'net_amount',
      'exceeds_quota',
      'total_monthly_quota',
      'organization',
      'cost_center_name',
      'aic_quantity',
      'aic_gross_amount',
    ];
    expect(detectReportType(headers)).toBe(REPORT_TYPES.PREMIUM_REQUEST);
  });

  it('detects token usage report from headers', () => {
    const headers = [
      'date',
      'username',
      'product',
      'sku',
      'model',
      'quantity',
      'unit_type',
      'applied_cost_per_quantity',
      'gross_amount',
      'discount_amount',
      'net_amount',
      'exceeds_quota',
      'total_monthly_quota',
      'organization',
      'cost_center_name',
      'total_input_tokens',
      'total_output_tokens',
      'total_cache_creation_tokens',
      'total_cache_read_tokens',
    ];
    expect(detectReportType(headers)).toBe(REPORT_TYPES.TOKEN_USAGE);
  });

  it('detects general usage report from headers', () => {
    const headers = [
      'date',
      'product',
      'sku',
      'quantity',
      'unit_type',
      'applied_cost_per_quantity',
      'gross_amount',
      'discount_amount',
      'net_amount',
      'username',
      'organization',
      'repository',
      'workflow_path',
      'cost_center_name',
    ];
    expect(detectReportType(headers)).toBe(REPORT_TYPES.USAGE_REPORT);
  });

  it('handles case-insensitive headers', () => {
    const headers = ['Date', 'AIC_QUANTITY', 'AIC_Gross_Amount', 'username'];
    expect(detectReportType(headers)).toBe(REPORT_TYPES.PREMIUM_REQUEST);
  });

  it('throws on unknown headers', () => {
    expect(() => detectReportType(['foo', 'bar', 'baz'])).toThrow('Unknown report type');
  });
});

describe('parseCSV — Premium Request', () => {
  const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","exceeds_quota","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-03-01","siddjoshi","copilot","copilot_premium_request","Claude Opus 4.6","366","requests","0.04","14.64","14.64","0","False","1000","octodemo","","0","0"
"2026-03-01","tsviz","copilot","copilot_premium_request","Claude Sonnet 4.6","246","requests","0.04","9.84","9.84","0","False","1000","octodemo-resources","","0","0"`;

  it('parses premium request CSV correctly', () => {
    const report = parseCSV(csv, 'test.csv');
    expect(report.type).toBe(REPORT_TYPES.PREMIUM_REQUEST);
    expect(report.rowCount).toBe(2);
    expect(report.fileName).toBe('test.csv');
  });

  it('maps columns to camelCase properties', () => {
    const report = parseCSV(csv, 'test.csv');
    const row = report.rows[0] as PremiumRequestRow;
    expect(row.date).toBe('2026-03-01');
    expect(row.username).toBe('siddjoshi');
    expect(row.model).toBe('Claude Opus 4.6');
    expect(row.quantity).toBe(366);
    expect(row.grossAmount).toBe(14.64);
    expect(row.exceedsQuota).toBe(false);
    expect(row.totalMonthlyQuota).toBe(1000);
    expect(row.aicQuantity).toBe(0);
    expect(row.aicGrossAmount).toBe(0);
  });

  it('calculates date range', () => {
    const report = parseCSV(csv, 'test.csv');
    expect(report.dateRange.start).toBe('2026-03-01');
    expect(report.dateRange.end).toBe('2026-03-01');
  });
});

describe('parseCSV — Token Usage', () => {
  const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","exceeds_quota","total_monthly_quota","organization","cost_center_name","total_input_tokens","total_output_tokens","total_cache_creation_tokens","total_cache_read_tokens"
"2026-02-01","gmondello","copilot","copilot_premium_request","Claude Opus 4.5","111","requests","0.04","4.44","4.44","0","False","1000","emea-avo-waffle","greg-test","44897","11976","1395060","1443242"`;

  it('parses token usage CSV correctly', () => {
    const report = parseCSV(csv, 'tokens.csv');
    expect(report.type).toBe(REPORT_TYPES.TOKEN_USAGE);
    expect(report.rowCount).toBe(1);
  });

  it('maps token columns correctly', () => {
    const report = parseCSV(csv, 'tokens.csv');
    const row = report.rows[0] as TokenUsageRow;
    expect(row.totalInputTokens).toBe(44897);
    expect(row.totalOutputTokens).toBe(11976);
    expect(row.totalCacheCreationTokens).toBe(1395060);
    expect(row.totalCacheReadTokens).toBe(1443242);
  });
});

describe('parseCSV — Usage Report', () => {
  const csv = `"date","product","sku","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","username","organization","repository","workflow_path","cost_center_name"
"2026-02-01","actions","actions_linux","3","minutes","0.006","0.018","0.018","0","github-advanced-security[bot]","octodemo-test","release-glowing-journey","dynamic/github-code-scanning/codeql",""`;

  it('parses usage report CSV correctly', () => {
    const report = parseCSV(csv, 'usage.csv');
    expect(report.type).toBe(REPORT_TYPES.USAGE_REPORT);
    expect(report.rowCount).toBe(1);
  });

  it('maps usage report columns correctly', () => {
    const report = parseCSV(csv, 'usage.csv');
    const row = report.rows[0] as UsageReportRow;
    expect(row.product).toBe('actions');
    expect(row.sku).toBe('actions_linux');
    expect(row.repository).toBe('release-glowing-journey');
    expect(row.workflowPath).toBe('dynamic/github-code-scanning/codeql');
  });
});

describe('parseCSV — edge cases', () => {
  it('handles empty numeric fields as 0', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","exceeds_quota","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-03-01","user1","copilot","sku1","model1","","requests","","","","","False","","org1","","",""`;
    const report = parseCSV(csv, 'test.csv');
    const row = report.rows[0] as PremiumRequestRow;
    expect(row.quantity).toBe(0);
    expect(row.grossAmount).toBe(0);
    expect(row.aicQuantity).toBe(0);
  });

  it('throws on completely invalid CSV', () => {
    expect(() => parseCSV('', 'empty.csv')).toThrow();
  });
});
