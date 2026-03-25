/** Shared columns across Premium Request and Token Usage reports */
interface BaseReportRow {
  date: string;
  username: string;
  product: string;
  sku: string;
  model: string;
  quantity: number;
  unitType: string;
  appliedCostPerQuantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  exceedsQuota: boolean;
  totalMonthlyQuota: number;
  organization: string;
  costCenterName: string;
}

/** Premium Request Usage Report — includes TBB sidecar columns */
export interface PremiumRequestRow extends BaseReportRow {
  aicQuantity: number;
  aicGrossAmount: number;
}

/** Token Usage Report — includes raw token counts */
export interface TokenUsageRow extends BaseReportRow {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

/** General Usage Report — Actions, Copilot seats, LFS, Packages */
export interface UsageReportRow {
  date: string;
  product: string;
  sku: string;
  quantity: number;
  unitType: string;
  appliedCostPerQuantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  username: string;
  organization: string;
  repository: string;
  workflowPath: string;
  costCenterName: string;
}

export const REPORT_TYPES = {
  PREMIUM_REQUEST: 'premium_request',
  TOKEN_USAGE: 'token_usage',
  USAGE_REPORT: 'usage_report',
} as const;

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

export interface ParsedReport<T = PremiumRequestRow | TokenUsageRow | UsageReportRow> {
  type: ReportType;
  rows: T[];
  fileName: string;
  rowCount: number;
  dateRange: { start: string; end: string };
}

export type AnyReportRow = PremiumRequestRow | TokenUsageRow | UsageReportRow;

/** Groupable columns vary by report type */
export const GROUPABLE_COLUMNS = {
  premium_request: ['username', 'model', 'organization', 'sku', 'costCenterName'] as const,
  token_usage: ['username', 'model', 'organization', 'sku', 'costCenterName'] as const,
  usage_report: [
    'username',
    'product',
    'sku',
    'organization',
    'repository',
    'costCenterName',
  ] as const,
} as const;

export type GroupableColumn<T extends ReportType> = (typeof GROUPABLE_COLUMNS)[T][number];

/** Time bucket options for aggregation */
export type TimeBucket = 'daily' | 'weekly' | 'monthly';

/** Summary metrics for KPI cards */
export interface ReportSummary {
  totalGrossAmount: number;
  totalNetAmount: number;
  totalDiscountAmount: number;
  totalQuantity: number;
  uniqueUsers: number;
  uniqueModels: number;
  uniqueOrganizations: number;
  dateRange: { start: string; end: string };
}
