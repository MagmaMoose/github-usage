/** Format a number as USD currency */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a number with abbreviation (K, M, B) */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Format a number with commas */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** Format a date string (YYYY-MM-DD) to a human-readable format */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.length === 7) {
    // YYYY-MM (monthly bucket)
    const [year, month] = dateStr.split('-');
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a date range */
export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return '';
  if (start === end) return formatDate(start);
  return `${formatDate(start)} — ${formatDate(end)}`;
}

/** Compact date range for tab labels — e.g. "Mar 2026" or "Feb–Mar 2026" */
export function formatDateRangeCompact(start: string, end: string): string {
  if (!start || !end) return '';
  const [sY, sM] = start.split('-').map(Number);
  const [eY, eM] = end.split('-').map(Number);
  const fmt = (y: number, m: number) =>
    new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (sY === eY && sM === eM) return fmt(sY, sM);
  if (sY === eY) {
    const sMonth = new Date(sY, sM - 1).toLocaleDateString('en-US', { month: 'short' });
    return `${sMonth}–${fmt(eY, eM)}`;
  }
  return `${fmt(sY, sM)}–${fmt(eY, eM)}`;
}

/** Human-readable display names for raw SKU codes */
const SKU_DISPLAY_NAMES: Record<string, string> = {
  copilot_premium_request: 'Copilot PRUs',
  coding_agent_premium_request: 'Coding Agent PRUs',
  spark_premium_request: 'Spark PRUs',
  copilot_ai_unit: 'Copilot AI Credits',
  coding_agent_ai_unit: 'Coding Agent AI Credits',
  spark_ai_unit: 'Spark AI Credits',
  copilot_enterprise: 'Copilot Enterprise',
  copilot_for_business: 'Copilot Business',
  actions_linux: 'Actions Linux',
  actions_linux_4_core: 'Actions Linux 4-core',
  actions_linux_8_core: 'Actions Linux 8-core',
  actions_linux_16_core: 'Actions Linux 16-core',
  actions_linux_32_core: 'Actions Linux 32-core',
  actions_linux_64_core: 'Actions Linux 64-core',
  actions_linux_arm: 'Actions Linux ARM',
  actions_linux_slim: 'Actions Linux Slim',
  actions_windows: 'Actions Windows',
  actions_macos: 'Actions macOS',
  actions_self_hosted_linux: 'Actions Self-Hosted Linux',
  actions_self_hosted_windows: 'Actions Self-Hosted Windows',
  actions_custom_image_storage: 'Actions Custom Image Storage',
  actions_storage: 'Actions Storage',
  git_lfs_bandwidth: 'Git LFS Bandwidth',
  git_lfs_storage: 'Git LFS Storage',
  packages_bandwidth: 'Packages Bandwidth',
  packages_storage: 'Packages Storage',
};

/** Human-readable display names for raw product codes */
const PRODUCT_DISPLAY_NAMES: Record<string, string> = {
  copilot: 'GitHub Copilot',
  spark: 'GitHub Spark',
  actions: 'GitHub Actions',
  git_lfs: 'Git LFS',
  packages: 'GitHub Packages',
};

/**
 * Format a raw grouping value (sku, product, etc.) into a human-readable label.
 * Falls through to the raw value when no mapping exists (e.g. usernames, model names).
 */
export function formatDisplayValue(value: string, column?: string): string {
  if (!value) return value;
  if (column === 'sku') return SKU_DISPLAY_NAMES[value] ?? value;
  if (column === 'product') return PRODUCT_DISPLAY_NAMES[value] ?? value;
  // For unknown columns, check both maps as a best-effort fallback
  return SKU_DISPLAY_NAMES[value] ?? PRODUCT_DISPLAY_NAMES[value] ?? value;
}

/** Humanize a column name (camelCase → Title Case) */
export function humanizeColumn(column: string): string {
  const MAP: Record<string, string> = {
    username: 'User',
    model: 'Model',
    organization: 'Organization',
    sku: 'SKU',
    costCenterName: 'Cost Center',
    product: 'Product',
    repository: 'Repository',
    grossAmount: 'Gross Amount',
    netAmount: 'Net Amount',
    discountAmount: 'Discount',
    quantity: 'Quantity',
    aicQuantity: 'AI Credits',
    aicGrossAmount: 'AI Credit Cost',
    totalInputTokens: 'Input Tokens',
    totalOutputTokens: 'Output Tokens',
    totalCacheCreationTokens: 'Cache Creation',
    totalCacheReadTokens: 'Cache Reads',
    unitType: 'Unit Type',
    exceedsQuota: 'Exceeds Quota',
    totalMonthlyQuota: 'Monthly Quota',
    workflowPath: 'Workflow',
    appliedCostPerQuantity: 'Unit Cost',
    date: 'Date',
  };
  return MAP[column] ?? column.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
