import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Flash } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { UploadIcon } from '@primer/octicons-react';
import { parseCSV } from '../lib/csv-parser';
import { useReport } from '../context/useReport';
import styles from './FileDropzone.module.css';

export function FileDropzone() {
  const { addReport, reports } = useReport();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      for (const file of Array.from(files)) {
        if (!file.name.endsWith('.csv')) {
          setError(`"${file.name}" is not a CSV file.`);
          continue;
        }
        try {
          const text = await file.text();
          const report = parseCSV(text, file.name);
          addReport(report);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        }
      }
    },
    [addReport],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  if (reports.length > 0) return null;

  return (
    <div>
      {error && (
        <Flash variant="danger" className={styles.errorBanner}>
          {error}
        </Flash>
      )}
      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        }}
      >
        <Blankslate spacious>
          <Blankslate.Visual>
            <UploadIcon size={48} />
          </Blankslate.Visual>
          <Blankslate.Heading>Upload a usage report CSV</Blankslate.Heading>
          <Blankslate.Description>
            Drag and drop a GitHub billing CSV here, or click to browse. Supports Premium Request,
            Token Usage, and General Usage reports.
          </Blankslate.Description>
        </Blankslate>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className={styles.fileInput}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />
      </div>
    </div>
  );
}
