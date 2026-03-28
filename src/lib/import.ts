/**
 * Shared utility for importing CSV/ZIP files into the report store.
 * Centralizes the parse → addReport flow so it's not duplicated
 * across ReportPageLayout, CsvManager, and sample data loaders.
 */
import { parseCSV } from './csv-parser';
import { extractCsvsFromZip, isZipFile } from './zip';
import type { ParsedReport } from './types';

export interface ImportResult {
  succeeded: number;
  failed: string[];
}

/**
 * Import a list of File objects (CSV or ZIP) into the report store.
 * Handles ZIP extraction, CSV parsing, and error recovery per-file.
 */
export async function importFiles(
  files: File[],
  addReport: (report: ParsedReport, rawCsv: string) => number,
): Promise<ImportResult> {
  const result: ImportResult = { succeeded: 0, failed: [] };

  for (const file of files) {
    try {
      if (isZipFile(file)) {
        const csvFiles = await extractCsvsFromZip(file);
        for (const { name, content } of csvFiles) {
          try {
            addReport(parseCSV(content, name), content);
            result.succeeded++;
          } catch {
            result.failed.push(name);
          }
        }
        continue;
      }
      if (!file.name.endsWith('.csv')) continue;
      const text = await file.text();
      addReport(parseCSV(text, file.name), text);
      result.succeeded++;
    } catch {
      result.failed.push(file.name);
    }
  }

  return result;
}

/**
 * Import raw CSV strings (used by sample data loader and share hydration).
 * Each entry is { name, content }. Set isSample=true to mark as demo data.
 */
export function importRawCSVs(
  csvs: Array<{ name: string; content: string }>,
  addReport: (report: ParsedReport, rawCsv: string) => number,
  options?: { isSample?: boolean },
): ImportResult {
  const result: ImportResult = { succeeded: 0, failed: [] };

  for (const { name, content } of csvs) {
    try {
      const report = parseCSV(content, name);
      if (options?.isSample) report.isSample = true;
      addReport(report, content);
      result.succeeded++;
    } catch {
      result.failed.push(name);
    }
  }

  return result;
}
