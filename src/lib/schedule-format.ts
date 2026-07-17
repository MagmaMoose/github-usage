/**
 * Pure formatting/normalisation helpers for the scheduled-reports editor
 * (ScheduleDialog). Kept out of the component so they can be unit-tested without
 * mounting the Primer Dialog (which is awkward to drive in jsdom).
 */

/** Zero-pad a number to two digits ("9" -> "09"). */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "HH:MM" from an entry's hour/minute, for an <input type="time">. */
export function toTimeValue(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Parse an "HH:MM" time input back to numbers, or null if malformed or out of
 * range. (Note: `Number('')` is 0, so empty parts must be rejected explicitly.) */
export function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const [h, m] = parts;
  if (h === '' || m === '') return null;
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Format an ISO next-run timestamp into a short, local, human string. */
export function formatNextRun(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Fold an editing channel selection back to the API's "null = all enabled
 * channels" convention: an empty selection, or one that covers every configured
 * channel, is sent as null; otherwise the explicit subset (dropping any channel
 * that is no longer configured).
 */
export function normalizeChannels(selected: string[], enabled: string[]): string[] | null {
  const clean = selected.filter((c) => enabled.includes(c));
  if (clean.length === 0) return null;
  if (enabled.length > 0 && clean.length === enabled.length) return null;
  return clean;
}

/**
 * A small, sensible timezone shortlist; the operator's current tz is always
 * included, and the browser's full IANA list is appended when the runtime
 * exposes it (Intl.supportedValuesOf), so this stays useful without a huge
 * hardcoded set. De-duplicated, current-first.
 */
export function timezoneOptions(current: string): string[] {
  const base = [
    'UTC',
    'Europe/London',
    'Europe/Amsterdam',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Australia/Sydney',
  ];
  let all = base;
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof intl.supportedValuesOf === 'function') {
    try {
      all = intl.supportedValuesOf('timeZone');
    } catch {
      all = base;
    }
  }
  return Array.from(new Set<string>([current, ...base, ...all])).filter(Boolean);
}
