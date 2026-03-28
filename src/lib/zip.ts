/**
 * Create a ZIP archive from a map of filename → CSV content.
 * Returns a Blob ready for download.
 */
export async function createZipArchive(files: Record<string, string>): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const zipData: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    zipData[name] = strToU8(content);
  }
  const zipped = zipSync(zipData);
  return new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
}

/**
 * Extract CSV files from a ZIP archive.
 * Returns an array of { name, content } for each .csv file found.
 */
export async function extractCsvsFromZip(
  file: File,
): Promise<Array<{ name: string; content: string }>> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  const csvFiles: Array<{ name: string; content: string }> = [];

  for (const [path, data] of Object.entries(unzipped)) {
    // Skip directories and non-CSV files
    if (path.endsWith('/') || !path.toLowerCase().endsWith('.csv')) continue;
    // Use just the filename, not the full path inside the zip
    const name = path.split('/').pop() ?? path;
    csvFiles.push({ name, content: strFromU8(data) });
  }

  return csvFiles;
}

/** Check if a file is a ZIP archive based on extension */
export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}

/** Accepted file types for all file inputs */
export const ACCEPTED_FILE_TYPES = '.csv,.zip';
