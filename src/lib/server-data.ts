/**
 * Client for the optional FastAPI backend (see backend/app/main.py).
 *
 * When the SPA is served by that backend, these endpoints exist and the
 * dashboard auto-loads GitHub usage on boot. When the SPA is served statically
 * (e.g. GitHub Pages) the endpoints 404 / fail to connect, every call here
 * resolves to `null`, and the app falls back to its drag-and-drop / demo flow.
 * Nothing here ever throws to the caller.
 */

import { setDisplayCurrency } from './formatters';

export interface ServerReportMeta {
  name: string;
  type: string;
}

export interface ServerManifest {
  source: 'live' | 'demo';
  fetched_at: number;
  age_seconds: number;
  /** Display currency (ISO 4217) for monetary amounts. Optional for back-compat. */
  currency?: string;
  reports: ServerReportMeta[];
}

export interface ServerStatus {
  mode: 'live' | 'demo';
  github: {
    org: string | null;
    enterprise: string | null;
    auth: string;
    api_base: string;
  };
  /** Display currency (ISO 4217) for monetary amounts. Optional for back-compat. */
  currency?: string;
  channels: string[];
  schedules: {
    daily: string | null;
    weekly: string | null;
    monthly: string | null;
    timezone: string;
    jobs: Array<{ id: string; next_run: string | null }>;
  };
  cache: {
    source: string | null;
    fetched_at?: number | null;
    age_seconds?: number | null;
    ttl_seconds?: number;
  };
}

export interface SendResult {
  status: 'ok' | 'partial' | 'error' | 'skipped';
  results?: Array<{ channel: string; ok: boolean; error?: string | null }>;
  reason?: string;
}

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduleEntry {
  enabled: boolean;
  hour: number;
  minute: number;
  /** Weekday for the weekly schedule, "mon".."sun". */
  day_of_week: string;
  /** Day of month (1–28) for the monthly schedule. */
  day_of_month: number;
  /** Advanced 5-field cron override; when set it wins over the fields above. */
  cron: string;
  /** Channels this schedule targets; null = every enabled channel. */
  channels: string[] | null;
}

/** The full editable schedule config plus the context the editor needs. */
export interface ScheduleConfig {
  timezone: string;
  entries: Record<Frequency, ScheduleEntry>;
  /** Channels that are actually configured and can deliver right now. */
  channels_enabled: string[];
  /** Allowed weekday tokens, in display order. */
  weekdays: string[];
  /** Live APScheduler jobs with their next fire time. */
  jobs: Array<{ id: string; next_run: string | null }>;
}

/** Just the mutable part of the config, sent on PUT. */
export interface SchedulePutBody {
  timezone: string;
  entries: Record<Frequency, ScheduleEntry>;
}

export type PutSchedulesResult =
  | { ok: true; config: ScheduleConfig }
  | { ok: false; error: string };

/** Same-origin API base. Absolute so it ignores the SPA's Vite `base` path. */
const API = '/api';

/** Short timeout so a missing backend doesn't stall the initial render. */
async function getJSON<T>(path: string, ms = 8000): Promise<T | null> {
  return request<T>('GET', path, undefined, ms);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  ms = 15000,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // Always send a JSON content-type on state-changing requests. The backend
    // requires it, which blocks cross-origin "simple" CSRF POSTs (they can't set
    // application/json without a CORS preflight the server never allows).
    const isMutation = method !== 'GET';
    const res = await fetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: isMutation ? { 'Content-Type': 'application/json' } : undefined,
      body: isMutation ? JSON.stringify(body ?? {}) : undefined,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    // Network error, abort, non-JSON — treat as "no backend".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe the backend. `null` => the dashboard is running standalone. */
export async function fetchServerStatus(): Promise<ServerStatus | null> {
  const status = await getJSON<ServerStatus>('/status');
  if (status?.currency) setDisplayCurrency(status.currency);
  return status;
}

/**
 * Fetch the manifest, then each report's raw CSV. Returns `{ name, content }`
 * entries ready for the existing `importRawCSVs` pipeline, plus the manifest
 * metadata. `null` when no backend is present.
 */
export async function fetchServerReports(): Promise<
  { manifest: ServerManifest; csvs: Array<{ name: string; content: string }> } | null
> {
  const manifest = await getJSON<ServerManifest>('/reports');
  if (!manifest || !Array.isArray(manifest.reports)) return null;
  if (manifest.currency) setDisplayCurrency(manifest.currency);

  const csvs = await Promise.all(
    manifest.reports.map(async (r) => {
      const content = await fetchReportCsv(r.name);
      return content ? { name: r.name, content } : null;
    }),
  );
  return { manifest, csvs: csvs.filter((c): c is { name: string; content: string } => c !== null) };
}

async function fetchReportCsv(name: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API}/reports/${encodeURIComponent(name)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Force a fresh GitHub pull, then return the refreshed CSVs (or null). */
export async function refreshServerReports(): Promise<
  { manifest: ServerManifest; csvs: Array<{ name: string; content: string }> } | null
> {
  // /refresh does a synchronous GitHub pull that can take a while for large
  // enterprises — allow generously more than the read-only probe timeout.
  const ok = await request<{ count: number }>('POST', '/refresh', undefined, 120000);
  if (ok === null) return null;
  return fetchServerReports();
}

/** Trigger an on-demand report send. Omit `channels` to use all enabled ones. */
export function sendServerReport(channels?: string[]): Promise<SendResult | null> {
  return request<SendResult>('POST', '/report/send', channels ? { channels } : {});
}

/** Read the current scheduled-report configuration. `null` if no backend. */
export function getSchedules(): Promise<ScheduleConfig | null> {
  return getJSON<ScheduleConfig>('/schedules');
}

/**
 * Save the scheduled-report configuration. Resolves to:
 *   - `{ ok: true, config }`   on success (config includes recomputed next runs),
 *   - `{ ok: false, error }`   when the backend rejects the input (validation),
 *   - `null`                    when no backend is reachable.
 * Unlike the other mutations this surfaces the server's validation message so
 * the editor can show *why* a save was rejected.
 */
export async function putSchedules(body: SchedulePutBody): Promise<PutSchedulesResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API}/schedules`, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const config = (await res.json()) as ScheduleConfig;
      return { ok: true, config };
    }
    if (res.status === 400) {
      // Surface the human-readable validation message from the backend.
      const detail = await res.json().catch(() => null);
      const error =
        detail && typeof detail.detail === 'string' ? detail.detail : 'Invalid schedule';
      return { ok: false, error };
    }
    if (res.status === 503) return { ok: false, error: 'No notification channels configured' };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
