import Papa from 'papaparse';
import type {
  PremiumRequestRow,
  TokenUsageRow,
  UsageReportRow,
  ParsedReport,
  ReportType,
} from './types';
import { REPORT_TYPES } from './types';

/** CSV header → report type mapping. Order matters — check most specific first. */
const HEADER_SIGNATURES: Record<ReportType, string[]> = {
  [REPORT_TYPES.TOKEN_USAGE]: ['total_input_tokens', 'total_output_tokens'],
  [REPORT_TYPES.PREMIUM_REQUEST]: ['aic_quantity', 'aic_gross_amount'],
  [REPORT_TYPES.USAGE_REPORT]: ['repository', 'workflow_path'],
};

/** Detect report type from CSV headers */
export function detectReportType(headers: string[]): ReportType {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [type, signatures] of Object.entries(HEADER_SIGNATURES)) {
    if (signatures.every((sig) => lowerHeaders.includes(sig))) {
      return type as ReportType;
    }
  }

  throw new Error(`Unknown report type. Headers: ${headers.join(', ')}`);
}

/** Parse a boolean value from CSV string */
function parseBool(value: string): boolean {
  return value.toLowerCase() === 'true';
}

/** Parse a number, defaulting to 0 for empty/invalid values */
function parseNum(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/** Map raw CSV row to PremiumRequestRow */
function mapPremiumRequestRow(raw: Record<string, string>): PremiumRequestRow {
  return {
    date: raw['date'] ?? '',
    username: raw['username'] ?? '',
    product: raw['product'] ?? '',
    sku: raw['sku'] ?? '',
    model: raw['model'] ?? '',
    quantity: parseNum(raw['quantity']),
    unitType: raw['unit_type'] ?? '',
    appliedCostPerQuantity: parseNum(raw['applied_cost_per_quantity']),
    grossAmount: parseNum(raw['gross_amount']),
    discountAmount: parseNum(raw['discount_amount']),
    netAmount: parseNum(raw['net_amount']),
    exceedsQuota: parseBool(raw['exceeds_quota'] ?? 'false'),
    totalMonthlyQuota: parseNum(raw['total_monthly_quota']),
    organization: raw['organization'] ?? '',
    costCenterName: raw['cost_center_name'] ?? '',
    aicQuantity: parseNum(raw['aic_quantity']),
    aicGrossAmount: parseNum(raw['aic_gross_amount']),
  };
}

/** Map raw CSV row to TokenUsageRow */
function mapTokenUsageRow(raw: Record<string, string>): TokenUsageRow {
  return {
    date: raw['date'] ?? '',
    username: raw['username'] ?? '',
    product: raw['product'] ?? '',
    sku: raw['sku'] ?? '',
    model: raw['model'] ?? '',
    quantity: parseNum(raw['quantity']),
    unitType: raw['unit_type'] ?? '',
    appliedCostPerQuantity: parseNum(raw['applied_cost_per_quantity']),
    grossAmount: parseNum(raw['gross_amount']),
    discountAmount: parseNum(raw['discount_amount']),
    netAmount: parseNum(raw['net_amount']),
    exceedsQuota: parseBool(raw['exceeds_quota'] ?? 'false'),
    totalMonthlyQuota: parseNum(raw['total_monthly_quota']),
    organization: raw['organization'] ?? '',
    costCenterName: raw['cost_center_name'] ?? '',
    totalInputTokens: parseNum(raw['total_input_tokens']),
    totalOutputTokens: parseNum(raw['total_output_tokens']),
    totalCacheCreationTokens: parseNum(raw['total_cache_creation_tokens']),
    totalCacheReadTokens: parseNum(raw['total_cache_read_tokens']),
  };
}

/** Map raw CSV row to UsageReportRow */
function mapUsageReportRow(raw: Record<string, string>): UsageReportRow {
  return {
    date: raw['date'] ?? '',
    product: raw['product'] ?? '',
    sku: raw['sku'] ?? '',
    quantity: parseNum(raw['quantity']),
    unitType: raw['unit_type'] ?? '',
    appliedCostPerQuantity: parseNum(raw['applied_cost_per_quantity']),
    grossAmount: parseNum(raw['gross_amount']),
    discountAmount: parseNum(raw['discount_amount']),
    netAmount: parseNum(raw['net_amount']),
    username: raw['username'] ?? '',
    organization: raw['organization'] ?? '',
    repository: raw['repository'] ?? '',
    workflowPath: raw['workflow_path'] ?? '',
    costCenterName: raw['cost_center_name'] ?? '',
  };
}

/** Parse CSV text into a typed report */
export function parseCSV(csvText: string, fileName: string): ParsedReport {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parse error: ${result.errors[0]?.message ?? 'Unknown error'}`);
  }

  const headers = result.meta.fields ?? [];
  const type = detectReportType(headers);

  let rows: PremiumRequestRow[] | TokenUsageRow[] | UsageReportRow[];

  switch (type) {
    case REPORT_TYPES.PREMIUM_REQUEST:
      rows = result.data.map(mapPremiumRequestRow);
      break;
    case REPORT_TYPES.TOKEN_USAGE:
      rows = result.data.map(mapTokenUsageRow);
      break;
    case REPORT_TYPES.USAGE_REPORT:
      rows = result.data.map(mapUsageReportRow);
      break;
  }

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const dateRange = {
    start: dates[0] ?? '',
    end: dates[dates.length - 1] ?? '',
  };

  return {
    type,
    rows,
    fileName,
    rowCount: rows.length,
    dateRange,
  };
}
