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
  ACTIVE_TAB: 'active-tab',
  ROLLING_AVG: 'rolling-avg',
  LINE_MODE: 'line-mode',
  COLUMN_VISIBILITY: 'column-visibility',
} as const;

/** Cached CSV entry stored in IndexedDB */
import type { ParsedReport } from './types';

const IDB_NAME = 'tbb-cache';
const IDB_VERSION = 3;
const STORE_PARSED = 'parsed';
const STORE_RAW = 'raw';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Clean slate on upgrade
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore(STORE_PARSED, { keyPath: 'fileName' });
      db.createObjectStore(STORE_RAW, { keyPath: 'fileName' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a single CSV: parsed report in one store, raw content in another */
export async function setCachedCSV(fileName: string, content: string, parsed: ParsedReport): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PARSED, STORE_RAW], 'readwrite');
    tx.objectStore(STORE_PARSED).put({ fileName, parsed, cachedAt: new Date().toISOString() });
    tx.objectStore(STORE_RAW).put({ fileName, content });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable
  }
}

/** Remove a single cached CSV by filename */
export async function removeCachedCSV(fileName: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PARSED, STORE_RAW], 'readwrite');
    tx.objectStore(STORE_PARSED).delete(fileName);
    tx.objectStore(STORE_RAW).delete(fileName);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // noop
  }
}

/** Get only parsed reports (no raw content, for fast hydration) */
export async function getCachedParsedReports(): Promise<{ fileName: string; parsed: ParsedReport }[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PARSED, 'readonly');
    const req = tx.objectStore(STORE_PARSED).getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Get raw CSV content for a single file (for sharing/export) */
export async function getCachedRawCSV(fileName: string): Promise<string | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RAW, 'readonly');
    const req = tx.objectStore(STORE_RAW).get(fileName);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result?.content ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Clear all cached CSVs */
export async function clearCachedCSVs(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PARSED, STORE_RAW], 'readwrite');
    tx.objectStore(STORE_PARSED).clear();
    tx.objectStore(STORE_RAW).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // noop
  }
}
