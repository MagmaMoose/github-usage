import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Button, Dialog, Flash, FormControl, Text, TextInput } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { UploadIcon, LinkExternalIcon } from '@primer/octicons-react';
import { parseCSV } from '../lib/csv-parser';
import { useReport } from '../context/useReport';
import styles from './FileDropzone.module.css';

export function FileDropzone({ forceShow }: { forceShow?: boolean }) {
  const { addReport, reports } = useReport();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugDialogOpen, setSlugDialogOpen] = useState(false);
  const [slug, setSlug] = useState('');
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
          const dupeIndex = addReport(report, text);
          if (dupeIndex >= 0) {
            setError(`"${file.name}" is already loaded — switched to that report.`);
          }
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

  if (reports.length > 0 && !forceShow) return null;

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
          <Blankslate.Heading>Drop a CSV here</Blankslate.Heading>
          <Blankslate.Description>
            or click to browse
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

      <div className={styles.instructions}>
        <Text as="p" className={styles.instructionsTitle}>How to download your billing CSV</Text>
        <div className={styles.stepsGroup}>
          <ol className={styles.stepsList}>
            <li>
              Go to your{' '}
              <a
                href="https://github.com/settings/enterprises"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
                onClick={(e) => e.stopPropagation()}
              >
                enterprise <LinkExternalIcon size={12} />
              </a>
              {' '}or{' '}
              <a
                href="https://github.com/settings/organizations"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
                onClick={(e) => e.stopPropagation()}
              >
                organization <LinkExternalIcon size={12} />
              </a>
              {' '}on GitHub
            </li>
            <li>Navigate to <strong>Billing &amp; Licensing</strong> → <strong>Usage</strong> → <strong>Premium request analytics</strong></li>
          </ol>
          <div className={styles.skipRow}>
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setSlugDialogOpen(true);
              }}
            >
              Skip 1–2: Navigate for me
            </Button>
          </div>
        </div>
        <ol start={3} className={styles.stepsList}>
          <li>Click <strong>Get usage report</strong></li>
          <li>Select the date range and click <strong>Email me the report</strong></li>
          <li>Download the CSV from the link in your email</li>
        </ol>
        <div className={styles.instructionsFooter}>
          <a
            href="https://docs.github.com/en/billing/how-tos/products/view-productlicense-use#downloading-usage-reports"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            onClick={(e) => e.stopPropagation()}
          >
            Docs <LinkExternalIcon size={12} />
          </a>
        </div>
      </div>

      {slugDialogOpen && (
        <Dialog
          title="Enterprise billing"
          onClose={() => setSlugDialogOpen(false)}
          footerButtons={[
            {
              content: 'Cancel',
              onClick: () => setSlugDialogOpen(false),
            },
            {
              content: 'Open billing page',
              buttonType: 'primary',
              disabled: !slug.trim(),
              onClick: () => {
                window.open(
                  `https://github.com/enterprises/${slug.trim()}/billing/premium_requests_usage`,
                  '_blank',
                );
                setSlugDialogOpen(false);
              },
            },
          ]}
        >
          <FormControl>
            <FormControl.Label>Enterprise slug</FormControl.Label>
            <FormControl.Caption>
              The URL slug for your enterprise (e.g. <code className={styles.codeInline}>octodemo</code> from github.com/enterprises/<strong>octodemo</strong>)
            </FormControl.Caption>
            <TextInput
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-enterprise"
              autoFocus
              block
              onKeyDown={(e) => {
                if (e.key === 'Enter' && slug.trim()) {
                  window.open(
                    `https://github.com/enterprises/${slug.trim()}/billing/premium_requests_usage`,
                    '_blank',
                  );
                  setSlugDialogOpen(false);
                }
              }}
            />
          </FormControl>
        </Dialog>
      )}
    </div>
  );
}
