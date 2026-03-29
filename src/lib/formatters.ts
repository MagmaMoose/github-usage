import type { ComponentType } from 'react';
import { AiModelIcon, ContainerIcon, CopilotIcon, DatabaseIcon, FileIcon, PackageIcon, PlayIcon, TagIcon } from '@primer/octicons-react';

type OcticonComponent = ComponentType<{ size?: number; className?: string }>;

// Octicon 16×16 SVG paths for inline HTML (Highcharts legends, tooltips)
const SVG_PATHS = {
  play: 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.005-2.757a.75.75 0 0 1 .77-.027l5 3a.75.75 0 0 1 0 1.268l-5 3A.75.75 0 0 1 5 11.75v-6a.75.75 0 0 1 .505-.507Z',
  copilot: 'M7.998 15.035c-4.405 0-7.998-3.196-7.998-7 0-2.52 1.52-4.768 3.712-5.99C4.227 1.988 4.658 2 5.123 2c1.16 0 1.283.693 2.01 1.071C7.57 3.312 7.772 3.5 8 3.5c.228 0 .43-.188.867-.429C9.594 2.693 9.717 2 10.877 2c.465 0 .896-.012 1.41.045C14.478 3.267 15.998 5.515 15.998 8.035c0 3.804-3.593 7-7.998 7ZM5.5 7c-.276 0-.5.224-.5.5v2c0 .276.224.5.5.5s.5-.224.5-.5v-2c0-.276-.224-.5-.5-.5Zm5 0c-.276 0-.5.224-.5.5v2c0 .276.224.5.5.5s.5-.224.5-.5v-2c0-.276-.224-.5-.5-.5Z',
  aiModel: 'M8.5.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0ZM4.927 3.784l-.924-.924a.75.75 0 1 0-1.06 1.06l.924.924a.75.75 0 0 0 1.06-1.06Zm7.206 1.06.924-.924a.75.75 0 0 0-1.06-1.06l-.924.924a.75.75 0 0 0 1.06 1.06ZM3 8a5 5 0 1 1 10 0 5 5 0 0 1-10 0Zm6.5 5.25a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0ZM3.784 12.133l-.924.924a.75.75 0 1 0 1.06 1.06l.924-.924a.75.75 0 0 0-1.06-1.06Zm9.492 1.06.924-.924a.75.75 0 1 0-1.06-1.06l-.924.924a.75.75 0 0 0 1.06 1.06Z',
  package: 'M8.878.392a1.75 1.75 0 0 0-1.756 0l-5.25 3.045A1.75 1.75 0 0 0 1 4.951v6.098c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 0 0 1.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V4.951c0-.624-.332-1.2-.872-1.514L8.878.392Z',
  database: 'M1.75 3h12.5c0-1.105-2.798-2-6.25-2S1.75 1.895 1.75 3ZM1.75 5.5V8c0 1.105 2.798 2 6.25 2s6.25-.895 6.25-2V5.5c-1.078.63-3.397 1-6.25 1s-5.172-.37-6.25-1Zm0 5V13c0 1.105 2.798 2 6.25 2s6.25-.895 6.25-2v-2.5c-1.078.63-3.397 1-6.25 1s-5.172-.37-6.25-1Z',
  container: 'M8.5 1.75v3H15v-3a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1Zm-1 3v-3a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v3Zm-6.5 1v6.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25V5.75Z',
  file: 'M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z',
  tag: 'M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Z',
  repo: 'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
} as const;

function svgIcon(path: string, color?: string): string {
  const fill = color ?? 'currentColor';
  return `<svg width="12" height="12" viewBox="0 0 16 16" fill="${fill}" style="vertical-align:middle;margin-right:3px;display:inline-block;"><path d="${path}"/></svg>`;
}

/** Get an inline SVG string for a SKU (for Highcharts legend/tooltip HTML) */
export function getSkuIconSvg(rawValue: string, color?: string): string {
  const v = rawValue.toLowerCase();
  if (v.includes('custom_image')) return svgIcon(SVG_PATHS.container, color);
  if (v.includes('storage') && v.startsWith('actions')) return svgIcon(SVG_PATHS.database, color);
  if (v.startsWith('actions')) return svgIcon(SVG_PATHS.play, color);
  if (v.includes('premium_request') || v.includes('ai_unit')) return svgIcon(SVG_PATHS.aiModel, color);
  if (v.startsWith('copilot') || v.startsWith('coding_agent') || v.startsWith('spark')) return svgIcon(SVG_PATHS.copilot, color);
  if (v.startsWith('packages')) return svgIcon(SVG_PATHS.package, color);
  if (v.startsWith('git_lfs')) return svgIcon(SVG_PATHS.repo, color);
  return '';
}
/** Map a raw SKU key to the product-relevant Octicon */
export function getSkuIcon(rawValue: string): OcticonComponent {
  const v = rawValue.toLowerCase();
  if (v.includes('custom_image')) return ContainerIcon;
  if (v.includes('storage') && v.startsWith('actions')) return DatabaseIcon;
  if (v.startsWith('actions')) return PlayIcon;
  if (v.includes('premium_request') || v.includes('ai_unit')) return AiModelIcon;
  if (v.startsWith('copilot') || v.startsWith('coding_agent') || v.startsWith('spark')) return CopilotIcon;
  if (v.startsWith('packages')) return PackageIcon;
  if (v.startsWith('git_lfs')) return FileIcon;
  return TagIcon;
}

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

/** Format an ISO datetime string (e.g. 2026-03-28T06:54:33Z) to a compact display */
export function formatDatetime(value: string): string {
  if (!value || value === 'None') return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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

/** Human-readable display names for raw SKU codes (icon provides product context) */
const SKU_DISPLAY_NAMES: Record<string, string> = {
  copilot_premium_request: 'PRUs',
  coding_agent_premium_request: 'Agent PRUs',
  spark_premium_request: 'Spark PRUs',
  copilot_ai_unit: 'AI Credits',
  coding_agent_ai_unit: 'Agent AI Credits',
  spark_ai_unit: 'Spark AI Credits',
  copilot_enterprise: 'Enterprise',
  copilot_for_business: 'Business',
  actions_linux: 'Linux',
  actions_linux_4_core: 'Linux 4-core',
  actions_linux_8_core: 'Linux 8-core',
  actions_linux_16_core: 'Linux 16-core',
  actions_linux_32_core: 'Linux 32-core',
  actions_linux_64_core: 'Linux 64-core',
  actions_linux_arm: 'Linux ARM',
  actions_linux_slim: 'Linux Slim',
  actions_windows: 'Windows',
  actions_macos: 'macOS',
  actions_self_hosted_linux: 'Self-Hosted Linux',
  actions_self_hosted_windows: 'Self-Hosted Windows',
  actions_custom_image_storage: 'Custom Image Storage',
  actions_storage: 'Storage',
  git_lfs_bandwidth: 'Bandwidth',
  git_lfs_storage: 'Storage',
  packages_bandwidth: 'Bandwidth',
  packages_storage: 'Storage',
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
  // Boolean-style field display
  if (value === 'true') return 'Yes';
  if (value === 'false') return 'No';
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
    // GHAS
    userLogin: 'User',
    lastPushedDate: 'Last Pushed',
    lastPushedEmail: 'Email',
    // Dormant users
    login: 'Login',
    role: 'Role',
    createdAt: 'Created',
    memberId: 'ID',
    lastLoggedIp: 'Last IP',
    twoFactorEnabled: '2FA',
    outsideCollaborator: 'Outside Collab',
    // Seat activity
    reportTime: 'Report Time',
    lastAuthenticatedAt: 'Last Authenticated',
    lastActivityAt: 'Last Activity',
    lastSurfaceUsed: 'Surface',
  };
  return MAP[column] ?? column.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Check if a username is a bot (ends with [bot]) */
export function isBot(username: string): boolean {
  return username.endsWith('[bot]');
}

/** Runtime cache of resolved bot avatar URLs (seeded with known bots, filled by API) */
const botAvatarCache = new Map<string, string>([
  // GitHub native bots
  ['dependabot[bot]', 'https://avatars.githubusercontent.com/in/29110?v=4'],
  ['github-actions[bot]', 'https://avatars.githubusercontent.com/in/65916?v=4'],
  ['github-advanced-security[bot]', 'https://avatars.githubusercontent.com/in/37929?v=4'],
  ['github-pages[bot]', 'https://avatars.githubusercontent.com/in/23105?v=4'],
  ['stale[bot]', 'https://avatars.githubusercontent.com/in/1724?v=4'],
  // AI coding agents
  ['copilot-swe-agent[bot]', 'https://avatars.githubusercontent.com/in/198982?v=4'],
  ['copilot-workspace[bot]', 'https://avatars.githubusercontent.com/in/406526?v=4'],
  ['anthropic-code-agent[bot]', 'https://avatars.githubusercontent.com/in/2246796?v=4'],
  ['devin-ai-integration[bot]', 'https://avatars.githubusercontent.com/in/878771?v=4'],
  ['coderabbitai[bot]', 'https://avatars.githubusercontent.com/in/480007?v=4'],
  // CI/CD & deployment
  ['vercel[bot]', 'https://avatars.githubusercontent.com/in/8546?v=4'],
  ['netlify[bot]', 'https://avatars.githubusercontent.com/in/13473?v=4'],
  ['azure-pipelines[bot]', 'https://avatars.githubusercontent.com/in/36174?v=4'],
  ['percy[bot]', 'https://avatars.githubusercontent.com/in/6400?v=4'],
  // Code quality & security
  ['codecov[bot]', 'https://avatars.githubusercontent.com/in/254?v=4'],
  ['sonarcloud[bot]', 'https://avatars.githubusercontent.com/in/12168?v=4'],
  ['socket-security[bot]', 'https://avatars.githubusercontent.com/in/206747?v=4'],
  ['sentry-io[bot]', 'https://avatars.githubusercontent.com/in/4141?v=4'],
  ['deepsource-autofix[bot]', 'https://avatars.githubusercontent.com/in/57168?v=4'],
  ['pre-commit-ci[bot]', 'https://avatars.githubusercontent.com/in/68672?v=4'],
  ['allstar-app[bot]', 'https://avatars.githubusercontent.com/in/119816?v=4'],
  // Dependency management
  ['renovate[bot]', 'https://avatars.githubusercontent.com/in/29139?v=4'],
  ['mend-bolt-for-github[bot]', 'https://avatars.githubusercontent.com/in/16809?v=4'],
  ['depfu[bot]', 'https://avatars.githubusercontent.com/in/7046?v=4'],
  // PR & workflow automation
  ['mergify[bot]', 'https://avatars.githubusercontent.com/in/10562?v=4'],
  ['kodiakhq[bot]', 'https://avatars.githubusercontent.com/in/29196?v=4'],
  ['imgbot[bot]', 'https://avatars.githubusercontent.com/in/4706?v=4'],
  ['changeset-bot[bot]', 'https://avatars.githubusercontent.com/in/43218?v=4'],
  ['linear[bot]', 'https://avatars.githubusercontent.com/in/60376?v=4'],
  ['graphite-app[bot]', 'https://avatars.githubusercontent.com/in/168040?v=4'],
  ['gitpod-io[bot]', 'https://avatars.githubusercontent.com/in/23396?v=4'],
  ['trunk-io[bot]', 'https://avatars.githubusercontent.com/in/174498?v=4'],
]);

// Hydrate runtime cache from localStorage (persisted API lookups survive reloads)
const AVATAR_STORAGE_KEY = 'tbb:bot-avatars';
try {
  const stored = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) ?? '{}') as Record<string, string>;
  for (const [k, v] of Object.entries(stored)) {
    if (!botAvatarCache.has(k)) botAvatarCache.set(k, v);
  }
} catch { /* noop */ }

/** Persist API-resolved avatars to localStorage */
function persistAvatarCache(): void {
  try {
    // Only persist entries not in the hardcoded list (those are already in code)
    const extras: Record<string, string> = {};
    const stored = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) ?? '{}') as Record<string, string>;
    for (const [k, v] of botAvatarCache.entries()) {
      // Keep anything that was either previously stored or resolved at runtime
      if (stored[k] || !HARDCODED_BOTS.has(k)) {
        extras[k] = v;
      }
    }
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(extras));
  } catch { /* storage full or unavailable */ }
}

/** Set of hardcoded bot names (skip persisting these) */
const HARDCODED_BOTS = new Set(botAvatarCache.keys());

/** In-flight fetch promises to avoid duplicate API calls */
const pendingFetches = new Map<string, Promise<string | null>>();

/** Simple throttle: max concurrent GitHub API requests */
const MAX_CONCURRENT_FETCHES = 3;
let activeFetchCount = 0;
const fetchQueue: Array<() => void> = [];

function runNextFetch(): void {
  if (fetchQueue.length > 0 && activeFetchCount < MAX_CONCURRENT_FETCHES) {
    activeFetchCount++;
    const next = fetchQueue.shift()!;
    next();
  }
}

function throttledFetch(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const execute = () => {
      fetch(url)
        .then(resolve, reject)
        .finally(() => {
          activeFetchCount--;
          runNextFetch();
        });
    };

    if (activeFetchCount < MAX_CONCURRENT_FETCHES) {
      activeFetchCount++;
      execute();
    } else {
      fetchQueue.push(execute);
    }
  });
}

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

  const promise = throttledFetch(`https://api.github.com/users/${encodeURIComponent(username)}`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<{ avatar_url?: string }>;
    })
    .then((data) => {
      const url = data?.avatar_url ?? null;
      if (url) {
        botAvatarCache.set(username, url);
        persistAvatarCache();
      }
      return url;
    })
    .catch(() => null)
    .finally(() => pendingFetches.delete(username));

  pendingFetches.set(username, promise);
  return promise;
}

/**
 * Pre-warm the avatar cache for all bot usernames in a dataset.
 * Returns true if any new avatars were resolved (for triggering re-renders).
 * Caps at 10 API lookups per batch to avoid rate limits.
 */
export async function preloadBotAvatars(usernames: string[]): Promise<boolean> {
  const bots = usernames.filter((u) => isBot(u) && !botAvatarCache.has(u));
  if (bots.length === 0) return false;
  // Cap lookups to avoid hammering the API with many unknown bots
  const batch = bots.slice(0, 10);
  const results = await Promise.allSettled(batch.map(resolveBotAvatar));
  return results.some((r) => r.status === 'fulfilled' && r.value !== null);
}

/** Get the GitHub avatar URL for a username, handling bot accounts correctly.
 *  Returns cached bot URLs instantly; unknown bots get a best-effort URL. */
export function getAvatarUrl(username: string, size = 40): string {
  // Empty/missing usernames get the GitHub ghost (octocat silhouette)
  if (!username || username === '(empty)') {
    return `https://github.com/ghost.png?size=${size}`;
  }
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
