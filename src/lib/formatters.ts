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
  if (value !== 0 && Math.abs(value) < 1) return value.toPrecision(2);
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

/**
 * Format an array of time bucket keys (YYYY-MM-DD or YYYY-MM) into display labels.
 * Uses compact numeric format: "3/5" for daily, "Mar" for monthly.
 * Includes year only when data spans multiple years.
 */
export function formatBucketLabels(keys: string[]): string[] {
  if (keys.length === 0) return [];

  const years = new Set(keys.map((k) => k.slice(0, 4)));
  const sameYear = years.size === 1;

  return keys.map((key) => {
    if (!key) return '';

    if (key.length === 7) {
      // Monthly: YYYY-MM
      const [year, month] = key.split('-').map(Number);
      const d = new Date(year, month - 1);
      return sameYear
        ? d.toLocaleDateString('en-US', { month: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    // Daily/weekly: YYYY-MM-DD → "3/5" or "3/5/26"
    const [year, month, day] = key.split('-').map(Number);
    return sameYear
      ? `${month}/${day}`
      : `${month}/${day}/${String(year).slice(2)}`;
  });
}

/** Convert a bucket key (YYYY-MM-DD or YYYY-MM) to a UTC timestamp for Highcharts datetime axes */
export function bucketKeyToTimestamp(key: string): number {
  if (key.length === 7) {
    const [y, m] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, 1);
  }
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
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
  if (column === 'workflowPath') return formatWorkflowPath(value);
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

/** Check if a username is a bot (ends with [bot]) */
export function isBot(username: string): boolean {
  return username.endsWith('[bot]');
}

/** Runtime cache of resolved bot avatar URLs (seeded with known bots, filled by API) */
const botAvatarCache = new Map<string, string>([
  ['dependabot[bot]', 'https://avatars.githubusercontent.com/in/29110?v=4'],
  ['github-actions[bot]', 'https://avatars.githubusercontent.com/in/65916?v=4'],
  ['renovate[bot]', 'https://avatars.githubusercontent.com/in/29139?v=4'],
  ['github-advanced-security[bot]', 'https://avatars.githubusercontent.com/in/37929?v=4'],
  ['copilot-swe-agent[bot]', 'https://avatars.githubusercontent.com/in/198982?v=4'],
]);

/** In-flight fetch promises to avoid duplicate API calls */
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Resolve a bot's avatar URL from the GitHub API and cache it.
 * Returns the avatar_url or null if the lookup fails.
 */
export async function resolveBotAvatar(username: string): Promise<string | null> {
  if (botAvatarCache.has(username)) return botAvatarCache.get(username)!;
  if (!isBot(username)) return null;

  // Deduplicate in-flight requests
  const existing = pendingFetches.get(username);
  if (existing) return existing;

  const promise = fetch(`https://api.github.com/users/${encodeURIComponent(username)}`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<{ avatar_url?: string }>;
    })
    .then((data) => {
      const url = data?.avatar_url ?? null;
      if (url) botAvatarCache.set(username, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pendingFetches.delete(username));

  pendingFetches.set(username, promise);
  return promise;
}

/**
 * Pre-warm the avatar cache for all bot usernames in a dataset.
 * Call this when reports load. Returns a promise that resolves
 * when all lookups are complete (for triggering re-renders).
 */
export async function preloadBotAvatars(usernames: string[]): Promise<void> {
  const bots = usernames.filter((u) => isBot(u) && !botAvatarCache.has(u));
  if (bots.length === 0) return;
  await Promise.allSettled(bots.map(resolveBotAvatar));
}

/** Get the GitHub avatar URL for a username, handling bot accounts correctly.
 *  Returns cached bot URLs instantly; unknown bots get a best-effort URL. */
export function getAvatarUrl(username: string, size = 40): string {
  // Check the cache first (covers hardcoded + API-resolved bots)
  const cached = botAvatarCache.get(username);
  if (cached) {
    return cached + (cached.includes('?') ? `&s=${size}` : `?s=${size}`);
  }
  if (isBot(username)) {
    // Unknown bot not yet resolved: strip [bot] and try the .png shortcut
    const base = username.replace('[bot]', '');
    return `https://github.com/${encodeURIComponent(base)}.png?size=${size}`;
  }
  return `https://github.com/${encodeURIComponent(username)}.png?size=${size}`;
}

/**
 * Format a workflow path for display.
 * - `.github/workflows/ci.yml` → `ci.yml`
 * - `dynamic/dependabot/dependabot-updates` → `dependabot-updates`
 * - `required/123/.github/workflows/review.yml` → `review.yml`
 * Returns the full path unchanged if no pattern matches.
 */
export function formatWorkflowPath(path: string): string {
  if (!path) return '(empty)';

  // Standard: .github/workflows/name.yml
  const stdMatch = path.match(/\.github\/workflows\/([^/]+)$/);
  if (stdMatch) return stdMatch[1];

  // Dynamic: dynamic/service/name
  const dynMatch = path.match(/^dynamic\/[^/]+\/(.+)$/);
  if (dynMatch) return dynMatch[1];

  // Required: required/{id}/.github/workflows/name.yml
  const reqMatch = path.match(/^required\/[^/]+\/\.github\/workflows\/([^/]+)$/);
  if (reqMatch) return reqMatch[1];

  return path;
}

/** Classify a workflow path type for badge display */
export function classifyWorkflowPath(path: string): 'standard' | 'managed' | 'required' | null {
  if (!path) return null;
  if (path.startsWith('dynamic/')) return 'managed';
  if (path.startsWith('required/')) return 'required';
  if (path.includes('.github/workflows/')) return 'standard';
  return null;
}
