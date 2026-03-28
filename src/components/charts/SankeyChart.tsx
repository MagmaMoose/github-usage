import { useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsSankey from 'highcharts/modules/sankey';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { buildColorMap, GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import { formatCompact, formatDisplayValue } from '../../lib/formatters';
import { REPORT_TYPES } from '../../lib/types';
import type { AnyReportRow, TokenUsageRow } from '../../lib/types';
import type { MetricOption } from '../../lib/report-schema';
import styles from './Charts.module.css';

if (typeof HighchartsSankey === 'function') (HighchartsSankey as (hc: typeof Highcharts) => void)(Highcharts);

interface SankeyNode {
  id: string;
  name: string;
  color?: string;
  column?: number;
  offset?: number;
}

/** Safely read a string field from a row, falling back to '(no org)' / blank */
function getField(row: AnyReportRow, field: string): string {
  const val = (row as unknown as Record<string, unknown>)[field];
  if (val === '' || val === null || val === undefined) {
    return field === 'organization' ? '(no org)' : ' ';
  }
  return String(val);
}

const DEFAULT_METRIC: MetricOption = { key: 'grossAmount', label: 'Spend', isCurrency: true };

export function SankeyChart({ hierarchy, metric }: { hierarchy?: string[]; metric?: MetricOption }) {
  const { activeReport, visibleRows } = useReport();
  const activeMetric = metric ?? DEFAULT_METRIC;

  const result = useMemo((): { options: Highcharts.Options; title: string } | null => {
    if (!activeReport) return null;

    const allRows = visibleRows as AnyReportRow[];
    const rows = activeMetric.rowFilter
      ? allRows.filter((r) => activeMetric.rowFilter!(r as unknown as Record<string, unknown>))
      : allRows;
    if (rows.length === 0) return null;

    const isTokenReport = activeReport.type === REPORT_TYPES.TOKEN_USAGE;

    // Determine hierarchy levels: use prop or fall back to defaults
    const levels = hierarchy ?? (isTokenReport ? ['organization', 'username', 'model'] : ['organization', 'username', 'model']);

    // Filter out levels where all values are empty
    const activeLevels = levels.filter((field) =>
      rows.some((r) => {
        const val = (r as unknown as Record<string, unknown>)[field];
        return val !== '' && val !== null && val !== undefined;
      }),
    );

    // For org level, only show if there are multiple orgs
    const filteredLevels = activeLevels.filter((field) => {
      if (field === 'organization') {
        const orgValues = new Set(rows.map((r) => getField(r, 'organization')).filter((v) => v !== '(no org)'));
        return orgValues.size > 1;
      }
      return true;
    });

    if (filteredLevels.length < 2) return null;

    // Generic N-level Sankey aggregation
    // Build spend totals per value at each level, and pairwise link spend between adjacent levels
    const levelTotals: Array<Map<string, number>> = filteredLevels.map(() => new Map());
    const levelLinks: Array<Map<string, number>> = []; // one fewer than levels
    for (let i = 0; i < filteredLevels.length - 1; i++) levelLinks.push(new Map());

    // Track unique child counts per parent at each level
    const levelChildren: Array<Map<string, Set<string>>> = [];
    for (let i = 0; i < filteredLevels.length - 1; i++) levelChildren.push(new Map());

    let grandTotal = 0;
    const valueKey = activeMetric.valueField ?? activeMetric.key;

    // Token-specific tracking (only when hierarchy ends at 'model' and report is token type)
    type TokenBucket = { input: number; output: number; cacheRead: number; cacheWrite: number };
    const emptyBucket = (): TokenBucket => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    const showTokenTypes = isTokenReport && filteredLevels[filteredLevels.length - 1] === 'model';
    const modelTokenTypes = new Map<string, TokenBucket>();
    const grandTotalTokens = emptyBucket();

    for (const row of rows) {
      const rowRecord = row as unknown as Record<string, unknown>;
      const amount = typeof rowRecord[valueKey] === 'number' ? rowRecord[valueKey] as number : 0;
      if (amount <= 0) continue;

      grandTotal += amount;

      const values = filteredLevels.map((field) => getField(row, field));

      // Accumulate per-level totals
      for (let i = 0; i < values.length; i++) {
        levelTotals[i].set(values[i], (levelTotals[i].get(values[i]) ?? 0) + amount);
      }

      // Accumulate pairwise link spend and child tracking
      for (let i = 0; i < values.length - 1; i++) {
        const linkKey = `${values[i]}\0${values[i + 1]}`;
        levelLinks[i].set(linkKey, (levelLinks[i].get(linkKey) ?? 0) + amount);

        if (!levelChildren[i].has(values[i])) levelChildren[i].set(values[i], new Set());
        levelChildren[i].get(values[i])!.add(values[i + 1]);
      }

      // Token breakdown at model level
      if (showTokenTypes && 'totalInputTokens' in row) {
        const tRow = row as TokenUsageRow;
        const model = values[values.length - 1];
        const e = modelTokenTypes.get(model) ?? emptyBucket();
        e.input += tRow.totalInputTokens ?? 0;
        e.output += tRow.totalOutputTokens ?? 0;
        e.cacheRead += tRow.totalCacheReadTokens ?? 0;
        e.cacheWrite += tRow.totalCacheCreationTokens ?? 0;
        modelTokenTypes.set(model, e);
        grandTotalTokens.input += tRow.totalInputTokens ?? 0;
        grandTotalTokens.output += tRow.totalOutputTokens ?? 0;
        grandTotalTokens.cacheRead += tRow.totalCacheReadTokens ?? 0;
        grandTotalTokens.cacheWrite += tRow.totalCacheCreationTokens ?? 0;
      }
    }

    // Determine top N at each level
    const TOP_COUNTS = [10, 20, 10, 10]; // topN per level
    const topSets: Set<string>[] = filteredLevels.map((_, i) => {
      const sorted = [...levelTotals[i].entries()].sort((a, b) => b[1] - a[1]);
      return new Set(sorted.slice(0, TOP_COUNTS[i] ?? 10).map(([k]) => k));
    });

    // Build links between adjacent levels (only for top entries)
    const links: [string, string, number][] = [];
    for (let i = 0; i < levelLinks.length; i++) {
      const prefix1 = `L${i}:`;
      const prefix2 = `L${i + 1}:`;
      for (const [key, weight] of levelLinks[i]) {
        const [from, to] = key.split('\0');
        if (!topSets[i].has(from) || !topSets[i + 1].has(to)) continue;
        if (weight < 0.01) continue;
        links.push([`${prefix1}${from}`, `${prefix2}${to}`, Math.round(weight * 100) / 100]);
      }
    }

    // Token type links from last level (model → token type)
    const TOKEN_TYPE_COLORS: Record<string, string> = {
      'Input': '#006edb',
      'Output': '#30a147',
      'Cache Read': '#b88700',
      'Cache Write': '#894ceb',
    };

    if (showTokenTypes) {
      const lastIdx = filteredLevels.length - 1;
      const prefix = `L${lastIdx}:`;
      for (const model of topSets[lastIdx]) {
        const entry = modelTokenTypes.get(model);
        if (!entry) continue;
        const totalTokens = entry.input + entry.output + entry.cacheRead + entry.cacheWrite;
        if (totalTokens <= 0) continue;
        const modelSpend = levelTotals[lastIdx].get(model) ?? 0;
        const types: [string, number][] = [
          ['Input', entry.input], ['Output', entry.output],
          ['Cache Read', entry.cacheRead], ['Cache Write', entry.cacheWrite],
        ];
        for (const [typeName, count] of types) {
          if (count <= 0) continue;
          const proportionalSpend = (count / totalTokens) * modelSpend;
          if (proportionalSpend < 0.01) continue;
          links.push([`${prefix}${model}`, `tokentype:${typeName}`, Math.round(proportionalSpend * 100) / 100]);
        }
      }
    }

    if (links.length === 0) return null;

    // Build nodes with explicit columns
    const nodes: SankeyNode[] = [];

    for (let i = 0; i < filteredLevels.length; i++) {
      const field = filteredLevels[i];
      const prefix = `L${i}:`;
      const topEntries = [...topSets[i]];

      // Color map: use branded colors only for model/sku levels
      const useBranding = field === 'model';
      const colorMap = i === filteredLevels.length - 1
        ? buildColorMap(topEntries, useBranding)
        : new Map<string, string>();

      for (let j = 0; j < topEntries.length; j++) {
        const value = topEntries[j];
        nodes.push({
          id: `${prefix}${value}`,
          name: formatDisplayValue(value, field) || value,
          column: i,
          color: colorMap.get(value) ?? GITHUB_COLORS_RESOLVED[j % GITHUB_COLORS_RESOLVED.length],
        });
      }
    }

    // Token type nodes
    if (showTokenTypes) {
      const tokenCol = filteredLevels.length;
      for (const typeName of ['Input', 'Output', 'Cache Read', 'Cache Write']) {
        const hasLinks = links.some(([, to]) => to === `tokentype:${typeName}`);
        if (!hasLinks) continue;
        nodes.push({
          id: `tokentype:${typeName}`,
          name: typeName,
          column: tokenCol,
          color: TOKEN_TYPE_COLORS[typeName],
        });
      }
    }

    // Build title
    const titleParts = filteredLevels.map((f) => {
      const MAP: Record<string, string> = {
        organization: 'Organization', username: 'User', model: 'Model',
        repository: 'Repository', sku: 'SKU', product: 'Product',
        workflowPath: 'Workflow', costCenterName: 'Cost Center',
      };
      return MAP[f] ?? f;
    });
    if (showTokenTypes) titleParts.push('Token Type');
    const flowLabel = activeMetric.key !== 'grossAmount' ? `${activeMetric.label} flow` : 'Spend flow';
    const chartTitle = `${flowLabel}: ${titleParts.join(' \u2192 ')}`;

    const fmtVal = activeMetric.isCurrency
      ? (v: number) => `$${v.toFixed(2)}`
      : (v: number) => formatCompact(v);
    const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0%';

    return {
      title: chartTitle,
      options: {
        chart: {
          height: 600,
          zooming: { type: 'xy' },
          panning: { enabled: true, type: 'xy' },
          panKey: 'shift',
        },
        title: { text: undefined },
        tooltip: {
          headerFormat: undefined,
          useHTML: true,
          style: { pointerEvents: 'none' },
          formatter: function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const point = (this as any).point as {
              fromNode?: { name: string; id?: string };
              toNode?: { name: string; id?: string };
              weight?: number;
              name?: string;
              sum?: number;
              id?: string;
              isNode?: boolean;
              color?: string;
              linksFrom?: Array<{ toNode: { name: string }; weight: number }>;
              linksTo?: Array<{ fromNode: { name: string }; weight: number }>;
            };

            // Node tooltip
            if (point.isNode) {
              const id = point.id ?? '';
              const spend = point.sum ?? 0;
              const spendPct = pct(spend, grandTotal);

              // Find the level index for this node
              const levelMatch = id.match(/^L(\d+):/);

              if (levelMatch) {
                const levelIdx = parseInt(levelMatch[1]);
                const field = filteredLevels[levelIdx];
                const key = id.slice(levelMatch[0].length);

                const childCount = levelChildren[levelIdx]?.get(key)?.size ?? 0;
                const childField = filteredLevels[levelIdx + 1];
                const childLabel = childField ? titleParts[levelIdx + 1]?.toLowerCase() + 's' : '';

                const topLinks = (point.linksFrom ?? []).sort((a, b) => b.weight - a.weight).slice(0, 5);
                let html = `<b>${point.name}</b><br/>${fmtVal(spend)} <span style="color:#9198a1">(${spendPct} of total)</span>`;

                if (childCount > 0) {
                  html += `<br/><span style="color:#9198a1">${childCount} ${childLabel}</span>`;
                }

                if (topLinks.length > 0 && childField) {
                  html += `<br/><br/><span style="color:#9198a1;font-size:10px">Top ${childLabel}:</span>`;
                  for (const l of topLinks) html += `<br/>  ${l.toNode.name}: ${fmtVal(l.weight)}`;
                }

                // Token breakdown for model nodes
                if (showTokenTypes && field === 'model') {
                  const tokens = modelTokenTypes.get(key);
                  if (tokens) {
                    const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
                    if (total > 0) {
                      html += `<br/><span style="color:#9198a1;font-size:10px">${formatCompact(total)} tokens</span>`;
                      html += `<br/><span style="color:#006edb">●</span> Input: <b>${formatCompact(tokens.input)}</b> (${pct(tokens.input, total)})`;
                      html += `<br/><span style="color:#30a147">●</span> Output: <b>${formatCompact(tokens.output)}</b> (${pct(tokens.output, total)})`;
                      if (tokens.cacheRead > 0) html += `<br/><span style="color:#b88700">●</span> Cache Read: <b>${formatCompact(tokens.cacheRead)}</b> (${pct(tokens.cacheRead, total)})`;
                      if (tokens.cacheWrite > 0) html += `<br/><span style="color:#894ceb">●</span> Cache Write: <b>${formatCompact(tokens.cacheWrite)}</b> (${pct(tokens.cacheWrite, total)})`;
                    }
                  }
                }

                return html;
              }

              // Token type node
              if (id.startsWith('tokentype:')) {
                return `<b>${point.name}</b><br/>${fmtVal(spend)} <span style="color:#9198a1">(${spendPct} of total)</span>`;
              }

              return `<b>${point.name}</b>: ${fmtVal(spend)}`;
            }

            // Link tooltip
            const from = point.fromNode?.name ?? '';
            const to = point.toNode?.name ?? '';
            const weight = point.weight ?? 0;
            const linkPct = pct(weight, grandTotal);
            return `${from} \u2192 ${to}<br/><b>${fmtVal(weight)}</b> <span style="color:#9198a1">(${linkPct})</span>`;
          },
        },
        series: [
          {
            type: 'sankey' as const,
            name: flowLabel,
            keys: ['from', 'to', 'weight'],
            data: links,
            nodes,
            nodeWidth: 20,
            nodePadding: 14,
            linkOpacity: 0.4,
            curveFactor: 0.5,
            dataLabels: {
              enabled: true,
              style: {
                fontSize: '11px',
                fontWeight: '500',
                color: 'var(--fgColor-default, #f0f6fc)',
                textOutline: '1px var(--bgColor-default, #0d1117)',
              },
              nodeFormat: '{point.name}',
            },
          },
        ],
      },
    };
  }, [activeReport, visibleRows, hierarchy, activeMetric]);

  if (!result) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{result.title}</h3>
      </div>
      <HighchartsReact highcharts={Highcharts} options={result.options} />
    </div>
  );
}
