import type { URLFilterState } from './url-state';

/** Payload compressed into the URL hash for sharing */
interface SharePayload {
  /** Filter/view state */
  s: URLFilterState;
  /** CSV content(s) — array to support multiple files */
  c: { name: string; data: string }[];
}

const HASH_PREFIX = 'data=';

/** Max URL length we'll attempt — above this, fall back to clipboard-only */
const MAX_URL_LENGTH = 8_000;

/**
 * Compress current state + CSV data into a shareable URL.
 * Returns the full URL string, or null if the data is too large.
 */
export async function buildShareURL(
  filterState: URLFilterState,
  csvs: { fileName: string; content: string }[],
): Promise<string | null> {
  const LZString = (await import('lz-string')).default;
  const payload: SharePayload = {
    s: filterState,
    c: csvs.map((csv) => ({ name: csv.fileName, data: csv.content })),
  };

  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${window.location.origin}${window.location.pathname}#${HASH_PREFIX}${compressed}`;

  if (url.length > MAX_URL_LENGTH) return null;
  return url;
}

/**
 * Check the current URL hash for compressed share data.
 * Returns the decoded payload or null if nothing is present.
 */
export async function readShareData(): Promise<SharePayload | null> {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null;

  const compressed = hash.slice(1 + HASH_PREFIX.length);
  if (!compressed) return null;

  try {
    const LZString = (await import('lz-string')).default;
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    return JSON.parse(json) as SharePayload;
  } catch {
    return null;
  }
}

/** Strip the share hash from the URL without triggering navigation */
export function clearShareHash(): void {
  if (!window.location.hash.startsWith(`#${HASH_PREFIX}`)) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * Copy a shareable URL to the clipboard.
 * If the compressed URL fits in MAX_URL_LENGTH, copies that.
 * Otherwise, copies just the CSV data as plain text (fallback).
 * Returns 'url' if the full URL was copied, 'csv' if raw CSV was copied.
 */
export async function copyShareToClipboard(
  filterState: URLFilterState,
  csvs: { fileName: string; content: string }[],
): Promise<'url' | 'csv'> {
  const url = await buildShareURL(filterState, csvs);

  if (url) {
    await navigator.clipboard.writeText(url);
    return 'url';
  }

  // Fallback: copy raw CSV data
  const csvText = csvs.map((c) => `--- ${c.fileName} ---\n${c.content}`).join('\n\n');
  await navigator.clipboard.writeText(csvText);
  return 'csv';
}
