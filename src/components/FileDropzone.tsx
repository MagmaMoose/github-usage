import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button, Dialog, Flash, FormControl, Text, TextInput } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { UploadIcon, LinkExternalIcon } from '@primer/octicons-react';
import { parseCSV } from '../lib/csv-parser';
import { useReport } from '../context/useReport';
import { REPORT_TYPES, type ReportType } from '../lib/types';
import styles from './FileDropzone.module.css';

// ─── Per-report-type instruction config ────────────────────────────────────────

interface InstructionConfig {
  title: string;
  /** Ordered steps rendered as <li> elements. First N steps can be grouped with skipButton. */
  steps: ReactNode[];
  /** Number of leading steps to group in the "skip" box (with enterprise slug shortcut). 0 = no skip box. */
  skippableSteps: number;
  /** URL to open when the user enters an enterprise slug. `{slug}` is replaced at runtime. */
  skipUrl?: string;
  /** Docs link shown at the bottom */
  docsUrl: string;
  docsLabel?: string;
}

const INSTRUCTION_CONFIGS: Record<ReportType, InstructionConfig> = {
  [REPORT_TYPES.PREMIUM_REQUEST]: {
    title: 'How to download your billing CSV',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}or{' '}<a href="https://github.com/settings/organizations" target="_blank" rel="noopener noreferrer">organization <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Billing &amp; Licensing</strong> → <strong>Usage</strong> → <strong>Premium request analytics</strong></>,
      <>Click <strong>Get usage report</strong></>,
      <>Select the date range and click <strong>Email me the report</strong></>,
      <>Download the CSV from the link in your email</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/billing/premium_requests_usage',
    docsUrl: 'https://docs.github.com/en/billing/how-tos/products/view-productlicense-use#downloading-usage-reports',
  },
  [REPORT_TYPES.TOKEN_USAGE]: {
    title: 'How to download your billing CSV',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}or{' '}<a href="https://github.com/settings/organizations" target="_blank" rel="noopener noreferrer">organization <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Billing &amp; Licensing</strong> → <strong>Usage</strong> → <strong>Premium request analytics</strong></>,
      <>Click <strong>Get usage report</strong></>,
      <>Select the date range and click <strong>Email me the report</strong></>,
      <>Download the CSV from the link in your email</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/billing/premium_requests_usage',
    docsUrl: 'https://docs.github.com/en/billing/how-tos/products/view-productlicense-use#downloading-usage-reports',
  },
  [REPORT_TYPES.USAGE_REPORT]: {
    title: 'How to download your metered usage CSV',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}or{' '}<a href="https://github.com/settings/organizations" target="_blank" rel="noopener noreferrer">organization <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Billing &amp; Licensing</strong> → <strong>Usage</strong> → <strong>Metered Usage</strong></>,
      <>Click <strong>Get usage report</strong></>,
      <>Select the date range and click <strong>Email me the report</strong></>,
      <>Download the CSV from the link in your email</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/billing/usage',
    docsUrl: 'https://docs.github.com/en/billing/how-tos/products/download-license-use',
  },
  [REPORT_TYPES.GHAS_ACTIVE_COMMITTERS]: {
    title: 'How to download your GHAS committers CSV',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Licensing</strong></>,
      <>Scroll to <strong>GitHub Advanced Security</strong> and click <strong>Download CSV Report</strong></>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/licensing',
    docsUrl: 'https://docs.github.com/en/billing/reference/license-reports',
  },
  [REPORT_TYPES.DORMANT_USERS]: {
    title: 'How to export dormant users',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Settings</strong> → <strong>Compliance</strong></>,
      <>Click <strong>Export</strong> to download the dormant users CSV</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/settings/compliance',
    docsUrl: 'https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/exporting-membership-information-for-your-enterprise',
  },
  [REPORT_TYPES.COPILOT_SEAT_ACTIVITY]: {
    title: 'How to download Copilot seat activity',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>AI Controls</strong> → <strong>Copilot</strong> → <strong>Access Management</strong></>,
      <>Click <strong>Download CSV report</strong> to export the seat activity data</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/licensing/copilot',
    docsUrl: 'https://docs.github.com/en/copilot/how-tos/administer-copilot/download-activity-report',
  },
  [REPORT_TYPES.ENTERPRISE_MEMBERS]: {
    title: 'How to download enterprise membership',
    steps: [
      <>Go to your{' '}<a href="https://github.com/settings/enterprises" target="_blank" rel="noopener noreferrer">enterprise <LinkExternalIcon size={12} /></a>{' '}on GitHub</>,
      <>Navigate to <strong>Licensing</strong></>,
      <>Click the <strong>Export</strong> button next to <strong>GitHub Enterprise</strong> to download the CSV</>,
    ],
    skippableSteps: 2,
    skipUrl: 'https://github.com/enterprises/{slug}/licensing',
    docsUrl: 'https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/exporting-membership-information-for-your-enterprise',
  },
};

export function FileDropzone({ forceShow, reportType = REPORT_TYPES.PREMIUM_REQUEST }: { forceShow?: boolean; reportType?: ReportType }) {
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

  const config = INSTRUCTION_CONFIGS[reportType];

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
        <Text as="p" className={styles.instructionsTitle}>{config.title}</Text>
        {config.skippableSteps > 0 ? (
          <>
            <div className={styles.stepsGroup}>
              <ol className={styles.stepsList}>
                {config.steps.slice(0, config.skippableSteps).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {config.skipUrl && (
                <div className={styles.skipRow}>
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlugDialogOpen(true);
                    }}
                  >
                    Skip 1–{config.skippableSteps}: Navigate for me
                  </Button>
                </div>
              )}
            </div>
            <ol start={config.skippableSteps + 1} className={styles.stepsList}>
              {config.steps.slice(config.skippableSteps).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        ) : (
          <ol className={styles.stepsList}>
            {config.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        <div className={styles.instructionsFooter}>
          <a
            href={config.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            onClick={(e) => e.stopPropagation()}
          >
            {config.docsLabel ?? 'Docs'} <LinkExternalIcon size={12} />
          </a>
        </div>
      </div>

      {slugDialogOpen && config.skipUrl && (
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
                const url = config.skipUrl!.replace('{slug}', slug.trim());
                window.open(url, '_blank');
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
                  const url = config.skipUrl!.replace('{slug}', slug.trim());
                  window.open(url, '_blank');
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
