import type { AnyReportRow, BillingRow, TimeBucket, ReportSummary, UsageReportRow, TokenUsageRow, DormantUsersRow, CopilotSeatActivityRow, EnterpriseMemberRow } from './types';

/** Group rows by a column value, returning a map of group key → rows */
export function groupBy<T extends AnyReportRow>(
  rows: T[],
  column: keyof T & string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const raw = row[column];
    const key = raw === '' || raw === null || raw === undefined ? '(empty)' : String(raw);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return groups;
}

/** Sum a numeric column across rows. Special key '_count' returns the row count. */
export function sumBy<T extends AnyReportRow>(rows: T[], column: string): number {
  if (column === '_count') return rows.length;
  return rows.reduce((sum, row) => {
    const val = (row as Record<string, unknown>)[column];
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);
}

/** Get the time bucket key for a date string */
export function getTimeBucketKey(dateStr: string, bucket: TimeBucket): string {
  if (!dateStr) return '(unknown)';

  switch (bucket) {
    case 'daily':
      // Already YYYY-MM-DD
      return dateStr.slice(0, 10);

    case 'weekly': {
      const d = new Date(dateStr);
      // ISO week: Monday-based, return the Monday of that week
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      return monday.toISOString().slice(0, 10);
    }

    case 'monthly':
      return dateStr.slice(0, 7); // YYYY-MM
  }
}

/** Group rows by time bucket, returning sorted entries */
export function timeBucket<T extends BillingRow>(
  rows: T[],
  bucket: TimeBucket,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = getTimeBucketKey(row.date, bucket);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  // Sort by key (date string)
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Get the top N groups by a summed metric */
export function topN<T extends AnyReportRow>(
  rows: T[],
  groupColumn: keyof T & string,
  metricColumn: string,
  n: number,
): Array<{ key: string; value: number; rows: T[] }> {
  const groups = groupBy(rows, groupColumn);
  const ranked = [...groups.entries()]
    .map(([key, groupRows]) => ({
      key,
      value: sumBy(groupRows, metricColumn),
      rows: groupRows,
    }))
    .sort((a, b) => b.value - a.value);

  return ranked.slice(0, n);
}

/** Type guard for rows with billing fields */
function isBillingRow(row: AnyReportRow): row is BillingRow {
  return 'date' in row && 'grossAmount' in row;
}

/** Compute summary metrics for a set of rows */
export function computeSummary(rows: AnyReportRow[]): ReportSummary {
  const billingRows = rows.filter(isBillingRow);
  const dates = billingRows.map((r) => r.date).filter(Boolean).sort();
  const users = new Set<string>();
  const organizations = new Set<string>();
  const models = new Set<string>();
  const repositories = new Set<string>();
  const products = new Set<string>();

  let totalGrossAmount = 0;
  let totalNetAmount = 0;
  let totalDiscountAmount = 0;
  let totalQuantity = 0;
  let totalMinutes = 0;
  let totalStorageGBH = 0;
  let totalTokens = 0;

  for (const row of billingRows) {
    totalGrossAmount += row.grossAmount;
    totalNetAmount += row.netAmount;
    totalDiscountAmount += row.discountAmount;
    totalQuantity += row.quantity;

    if ('username' in row && row.username) users.add(row.username);
    if ('organization' in row && row.organization) organizations.add(row.organization);
    if ('model' in row) models.add(row.model);
    const usageRow = row as UsageReportRow;
    if ('repository' in row && usageRow.repository) repositories.add(usageRow.repository);
    if ('product' in row && row.product) products.add(String(row.product));

    // Accumulate unit-type-specific totals for usage reports
    if ('unitType' in row) {
      const u = row as UsageReportRow;
      if (u.unitType === 'minutes') totalMinutes += u.quantity;
      if (u.unitType === 'gigabyte-hours') totalStorageGBH += u.quantity;
    }

    // Accumulate token totals
    if ('totalInputTokens' in row) {
      const t = row as TokenUsageRow;
      totalTokens += (t.totalInputTokens ?? 0) + (t.totalOutputTokens ?? 0)
        + (t.totalCacheCreationTokens ?? 0) + (t.totalCacheReadTokens ?? 0);
    }
  }

  // Flat report types: extract users, orgs, repos from non-billing rows
  for (const row of rows) {
    if (isBillingRow(row)) continue;
    const r = row as Record<string, unknown>;
    if (r.userLogin) users.add(String(r.userLogin));
    if (r.login) users.add(String(r.login));
    if (r.organization) organizations.add(String(r.organization));
    if (r.repository) repositories.add(String(r.repository));
  }

  // Flat date ranges
  const flatDates = rows
    .filter((r) => !isBillingRow(r))
    .map((r) => {
      const rec = r as Record<string, unknown>;
      return String(rec.lastPushedDate ?? rec.lastActivityAt ?? rec.createdAt ?? '').slice(0, 10);
    })
    .filter(Boolean)
    .sort();
  const allDates = [...dates, ...flatDates].filter(Boolean).sort();

  // Flat report specific summaries
  let totalMembers = 0;
  let twoFactorCount = 0;
  let totalSeats = 0;
  let activeSeats = 0;
  let totalLicenses = 0;
  let ghasLicenseCount = 0;

  for (const row of rows) {
    if (isBillingRow(row)) continue;
    // Dormant users
    if ('twoFactorEnabled' in row) {
      totalMembers++;
      if ((row as DormantUsersRow).twoFactorEnabled) twoFactorCount++;
    }
    // Seat activity
    if ('lastActivityAt' in row) {
      totalSeats++;
      if ((row as CopilotSeatActivityRow).lastActivityAt && (row as CopilotSeatActivityRow).lastActivityAt !== 'None') {
        activeSeats++;
      }
    }
    // Enterprise members
    if ('licenseType' in row) {
      totalLicenses++;
      if ((row as EnterpriseMemberRow).advancedSecurityUser) ghasLicenseCount++;
    }
  }

  return {
    totalGrossAmount,
    totalNetAmount,
    totalDiscountAmount,
    totalQuantity,
    uniqueUsers: users.size,
    uniqueModels: models.size,
    uniqueOrganizations: organizations.size,
    uniqueRepositories: repositories.size,
    uniqueProducts: products.size,
    totalMinutes,
    totalStorageGBH,
    totalTokens,
    totalMembers,
    twoFactorCount,
    totalSeats,
    activeSeats,
    totalLicenses,
    ghasLicenseCount,
    dateRange: {
      start: allDates[0] ?? '',
      end: allDates[allDates.length - 1] ?? '',
    },
  };
}
