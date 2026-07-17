import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchServerStatus,
  fetchServerReports,
  refreshServerReports,
  sendServerReport,
} from './server-data';

/** Build a minimal fetch Response stand-in. */
function res(
  body: unknown,
  { ok = true, status = 200, contentType = 'application/json' as string | null } = {},
) {
  return {
    ok,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchServerStatus', () => {
  it('returns parsed JSON on a 2xx application/json response', async () => {
    fetchMock.mockResolvedValueOnce(res({ mode: 'demo', database: 'sqlite' }));
    const status = await fetchServerStatus();
    expect(status?.mode).toBe('demo');
    // GET probe: no body, no content-type header.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/status');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('returns null on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 404 }));
    expect(await fetchServerStatus()).toBeNull();
  });

  it('returns null when the content-type is not JSON (no backend / static host)', async () => {
    fetchMock.mockResolvedValueOnce(res('<html>', { contentType: 'text/html' }));
    expect(await fetchServerStatus()).toBeNull();
  });

  it('returns null when fetch rejects (network error / abort)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await fetchServerStatus()).toBeNull();
  });

  it('returns null when content-type header is absent', async () => {
    fetchMock.mockResolvedValueOnce(res('x', { contentType: null }));
    expect(await fetchServerStatus()).toBeNull();
  });
});

describe('fetchServerReports', () => {
  it('returns null when the manifest is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 404 }));
    expect(await fetchServerReports()).toBeNull();
  });

  it('returns null when the manifest is malformed (reports not an array)', async () => {
    fetchMock.mockResolvedValueOnce(res({ source: 'demo' }));
    expect(await fetchServerReports()).toBeNull();
  });

  it('fetches each report CSV and drops any that fail', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/reports') {
        return Promise.resolve(
          res({
            source: 'demo',
            fetched_at: 1,
            age_seconds: 0,
            reports: [
              { name: 'a.csv', type: 'usage_report' },
              { name: 'b.csv', type: 'usage_report' },
            ],
          }),
        );
      }
      if (url === '/api/reports/a.csv') return Promise.resolve(res('date,net_amount\n', { contentType: 'text/csv' }));
      // b.csv fails -> filtered out
      return Promise.resolve(res('', { ok: false, status: 500, contentType: 'text/csv' }));
    });

    const data = await fetchServerReports();
    expect(data).not.toBeNull();
    expect(data!.manifest.source).toBe('demo');
    expect(data!.csvs).toHaveLength(1);
    expect(data!.csvs[0]).toEqual({ name: 'a.csv', content: 'date,net_amount\n' });
    // report name is URL-encoded in the path
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/a.csv', expect.anything());
  });

  it('returns null CSV content when a report fetch rejects', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/reports') {
        return Promise.resolve(res({ source: 'live', fetched_at: 1, age_seconds: 0, reports: [{ name: 'a.csv', type: 'x' }] }));
      }
      return Promise.reject(new Error('network'));
    });
    const data = await fetchServerReports();
    expect(data!.csvs).toHaveLength(0);
  });
});

describe('refreshServerReports', () => {
  it('POSTs JSON to /refresh then returns the refreshed reports', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/refresh') return Promise.resolve(res({ count: 1 }));
      if (url === '/api/reports') return Promise.resolve(res({ source: 'live', fetched_at: 2, age_seconds: 0, reports: [] }));
      return Promise.resolve(res(''));
    });
    const data = await refreshServerReports();
    expect(data!.manifest.source).toBe('live');
    // the POST carries an application/json content-type + a JSON body (CSRF-safe)
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/refresh')!;
    expect(post[1].method).toBe('POST');
    expect(post[1].headers['Content-Type']).toBe('application/json');
    expect(post[1].body).toBe('{}');
  });

  it('returns null when the refresh POST fails', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 502 }));
    expect(await refreshServerReports()).toBeNull();
  });
});

describe('sendServerReport', () => {
  it('POSTs selected channels', async () => {
    fetchMock.mockResolvedValueOnce(res({ status: 'ok', results: [] }));
    const result = await sendServerReport(['slack']);
    expect(result?.status).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/report/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ channels: ['slack'] });
  });

  it('POSTs an empty body when no channels are given', async () => {
    fetchMock.mockResolvedValueOnce(res({ status: 'skipped', reason: 'x' }));
    const result = await sendServerReport();
    expect(result?.status).toBe('skipped');
    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('returns null when the send fails', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 500 }));
    expect(await sendServerReport(['email'])).toBeNull();
  });
});
