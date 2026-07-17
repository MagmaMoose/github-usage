/**
 * Client for the optional FastAPI backend (see backend/app/main.py).
 *
 * When the SPA is served by that backend, these endpoints exist and the
 * dashboard auto-loads GitHub usage on boot. When the SPA is served statically
 * (e.g. GitHub Pages) the endpoints 404 / fail to connect, every call here
 * resolves to `null`, and the app falls back to its drag-and-drop / demo flow.
 * Nothing here ever throws to the caller.
 */

export interface ServerReportMeta {
  name: string;
  type: string;
}

export interface ServerManifest {
  source: 'live' | 'demo';
  fetched_at: number;
  age_seconds: number;
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
export function fetchServerStatus(): Promise<ServerStatus | null> {
  return getJSON<ServerStatus>('/status');
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
