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
