const STORAGE_PREFIX = 'tbb:';

/** Type-safe localStorage wrapper with JSON serialization */
export function getStoredValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setStoredValue<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Storage full or unavailable, silently ignore
  }
}

export function removeStoredValue(key: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // noop
  }
}

// Storage keys
export const STORAGE_KEYS = {
  SIDEBAR_COLLAPSED: 'sidebar-collapsed',
  CACHED_CSVS: 'cached-csvs',
} as const;

/** Cached CSV entry stored in localStorage */
export interface CachedCSV {
  fileName: string;
  content: string;
  /** ISO timestamp when cached */
  cachedAt: string;
}

export function getCachedCSVs(): CachedCSV[] {
  return getStoredValue<CachedCSV[]>(STORAGE_KEYS.CACHED_CSVS, []);
}

export function setCachedCSVs(csvs: CachedCSV[]): void {
  setStoredValue(STORAGE_KEYS.CACHED_CSVS, csvs);
}

export function clearCachedCSVs(): void {
  removeStoredValue(STORAGE_KEYS.CACHED_CSVS);
}
