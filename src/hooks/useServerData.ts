/**
 * Auto-loads GitHub usage from the optional FastAPI backend on first mount, and
 * exposes actions to refresh from GitHub and send an on-demand report.
 *
 * Feature-detected: if no backend is reachable (static hosting), `available`
 * stays false, nothing is imported, and the app behaves exactly as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedReport } from '../lib/types';
import { importRawCSVs } from '../lib/import';
import {
  fetchServerReports,
  fetchServerStatus,
  refreshServerReports,
  sendServerReport,
  type SendResult,
  type ServerStatus,
} from '../lib/server-data';

interface UseServerDataArgs {
  addReport: (report: ParsedReport, rawCsv: string) => number;
  /** True once the report store has finished hydrating from IndexedDB. */
  ready: boolean;
}

export interface ServerDataState {
  available: boolean;
  status: ServerStatus | null;
  source: 'live' | 'demo' | null;
  fetchedAt: number | null;
  loading: boolean;
  refreshing: boolean;
  sending: boolean;
  sendResult: SendResult | null;
  error: string | null;
  refresh: () => Promise<void>;
  send: (channels?: string[]) => Promise<void>;
}

export function useServerData({ addReport, ready }: UseServerDataArgs): ServerDataState {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [source, setSource] = useState<'live' | 'demo' | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true; // guard React 18 StrictMode double-invoke

    let cancelled = false;
    (async () => {
      const st = await fetchServerStatus();
      if (cancelled) return;
      if (!st) {
        setAvailable(false);
        return;
      }
      setAvailable(true);
      setStatus(st);
      setLoading(true);
      const data = await fetchServerReports();
      if (cancelled) return;
      if (data) {
        setSource(data.manifest.source);
        setFetchedAt(data.manifest.fetched_at);
        importRawCSVs(data.csvs, addReport);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, addReport]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshServerReports();
      if (data) {
        setSource(data.manifest.source);
        setFetchedAt(data.manifest.fetched_at);
        importRawCSVs(data.csvs, addReport);
        // Re-read status so schedule/cache metadata stays current.
        const st = await fetchServerStatus();
        if (st) setStatus(st);
      } else {
        setError('Refresh failed');
      }
    } finally {
      setRefreshing(false);
    }
  }, [addReport]);

  const send = useCallback(async (channels?: string[]) => {
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const result = await sendServerReport(channels);
      if (result) setSendResult(result);
      else setError('Send failed');
    } finally {
      setSending(false);
    }
  }, []);

  return {
    available,
    status,
    source,
    fetchedAt,
    loading,
    refreshing,
    sending,
    sendResult,
    error,
    refresh,
    send,
  };
}
