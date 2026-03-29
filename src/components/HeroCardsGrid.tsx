import { useMemo } from 'react';
import { HeroCard } from './HeroCard';
import type { ReportSchema } from '../lib/report-schema';
import type { ReportSummary, AnyReportRow, TokenUsageRow } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';
import { formatCurrency, formatCompact, formatDisplayValue, getSkuIcon } from '../lib/formatters';
import { topN } from '../lib/aggregation';
import styles from '../App.module.css';

interface HeroCardsGridProps {
  schema: ReportSchema;
  summary: ReportSummary;
  visibleRows: AnyReportRow[];
  reportType: string;
}

function formatValue(value: number, format: 'currency' | 'compact' | 'number'): string {
  if (format === 'currency') return formatCurrency(value);
  if (format === 'compact') return formatCompact(value);
  return value.toLocaleString();
}

export function HeroCardsGrid({ schema, summary, visibleRows, reportType }: HeroCardsGridProps) {
  const tokenBreakdown = useMemo(() => {
    if (reportType !== REPORT_TYPES.TOKEN_USAGE) return null;
    const rows = visibleRows as TokenUsageRow[];
    const input = rows.reduce((s, r) => s + r.totalInputTokens, 0);
    const output = rows.reduce((s, r) => s + r.totalOutputTokens, 0);
    const cacheCreate = rows.reduce((s, r) => s + r.totalCacheCreationTokens, 0);
    const cacheRead = rows.reduce((s, r) => s + r.totalCacheReadTokens, 0);
    return { input, output, cacheCreate, cacheRead };
  }, [reportType, visibleRows]);

  return (
    <div className={styles.heroCardsGrid}>
      {schema.heroCards.map((card) => {
        // Skip cards that are only for a specific report type
        if (card.onlyForType && card.onlyForType !== reportType) return null;

        // Resolve the main value from summary
        const summaryRecord = summary as unknown as Record<string, number>;
        const rawValue = summaryRecord[card.valueField] ?? 0;

        // Skip cards with zero value (e.g., storage card when there's no storage data)
        if (rawValue === 0 && (card.valueField === 'totalMinutes' || card.valueField === 'totalStorageGBH')) {
          return null;
        }

        return (
          <HeroCard key={card.id} title={card.title} value={formatValue(rawValue, card.format)}>
            <div className={styles.heroCardBreakdown}>
              {/* Dynamic breakdown from topN */}
              {card.breakdownGroupField && card.breakdownMetricField && (() => {
                // For the "requests" card in copilot, show users + models counts + top user
                if (card.id === 'requests') {
                  const topUser = topN(visibleRows, 'username' as keyof AnyReportRow & string, 'quantity' as keyof AnyReportRow & string, 1)[0];
                  return <>
                    <span><span>Users</span><span>{summary.uniqueUsers}</span></span>
                    <span><span>Models</span><span>{summary.uniqueModels}</span></span>
                    {topUser && <span><span>Top user</span><span>{topUser.key}</span></span>}
                  </>;
                }
                // Default: show top 3 by breakdown field
                const top3 = topN(
                  visibleRows,
                  card.breakdownGroupField as keyof AnyReportRow & string,
                  card.breakdownMetricField as keyof AnyReportRow & string,
                  3,
                );
                return top3.map((m) => {
                  const label = formatDisplayValue(m.key, card.breakdownGroupField!);
                  const isSkuBreakdown = card.breakdownGroupField === 'sku';
                  const SkuIcon = isSkuBreakdown ? getSkuIcon(m.key) : null;
                  return (
                    <span key={m.key}>
                      <span>{SkuIcon && <SkuIcon size={14} />}{label}</span>
                      <span>{card.format === 'currency' ? formatCurrency(m.value) : formatCompact(m.value)}</span>
                    </span>
                  );
                });
              })()}

              {/* Static breakdown entries */}
              {card.staticBreakdown?.map((entry) => (
                <span key={entry.label}>
                  <span>{entry.label}</span>
                  <span>
                    {entry.prefix ?? ''}{formatValue(summaryRecord[entry.valueField] ?? 0, entry.format)}
                  </span>
                </span>
              ))}

              {/* Token breakdown (special case for token usage) */}
              {card.id === 'tokens' && tokenBreakdown && (
                <>
                  <span><span>Input</span><span>{formatCompact(tokenBreakdown.input)}</span></span>
                  <span><span>Output</span><span>{formatCompact(tokenBreakdown.output)}</span></span>
                  <span><span>Cache create</span><span>{formatCompact(tokenBreakdown.cacheCreate)}</span></span>
                  <span><span>Cache read</span><span>{formatCompact(tokenBreakdown.cacheRead)}</span></span>
                </>
              )}
            </div>
          </HeroCard>
        );
      })}
    </div>
  );
}
