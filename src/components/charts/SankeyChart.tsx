import { useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsSankey from 'highcharts/modules/sankey';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { buildColorMap, GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import { formatCompact, formatDisplayValue } from '../../lib/formatters';
import { REPORT_TYPES } from '../../lib/types';
import type { AnyReportRow, TokenUsageRow } from '../../lib/types';
import styles from './Charts.module.css';

if (typeof HighchartsSankey === 'function') (HighchartsSankey as (hc: typeof Highcharts) => void)(Highcharts);

interface SankeyNode {
  id: string;
  name: string;
  color?: string;
  column?: number;
  offset?: number;
}

/** Safely read a string field from a row, falling back to '(no org)' / '(empty)' */
function getField(row: AnyReportRow, field: string): string {
  const val = (row as unknown as Record<string, unknown>)[field];
  if (val === '' || val === null || val === undefined) {
    return field === 'organization' ? '(no org)' : '(empty)';
  }
  return String(val);
}

export function SankeyChart() {
  const { activeReport, visibleRows } = useReport();

  const result = useMemo((): { options: Highcharts.Options; title: string } | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    if (rows.length === 0) return null;

    const hasOrg = rows.some((r) => 'organization' in r);

    const isTokenReport = activeReport.type === REPORT_TYPES.TOKEN_USAGE;

    // Aggregate spend per (org, user) and (user, model)
    const orgUserSpend = new Map<string, number>();
    const userModelSpend = new Map<string, number>();
    const orgTotals = new Map<string, number>();
    const userTotals = new Map<string, number>();
    const modelTotals = new Map<string, number>();

    type TokenBucket = { input: number; output: number; cacheRead: number; cacheWrite: number };
    const emptyBucket = (): TokenBucket => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

    // Token breakdowns at every aggregation level
    const modelTokenTypes = new Map<string, TokenBucket>();
    const userTokenTypes = new Map<string, TokenBucket>();
    const orgTokenTypes = new Map<string, TokenBucket>();
    const userModelTokens = new Map<string, TokenBucket>();
    let grandTotalSpend = 0;
    const grandTotalTokens = emptyBucket();

    // Track unique user counts per org, and model counts per user
    const orgUsers = new Map<string, Set<string>>();
    const userModels = new Map<string, Set<string>>();
    const modelUsers = new Map<string, Set<string>>();

    for (const row of rows) {
      const user = getField(row, 'username');
      const model = getField(row, 'model');
      const amount = typeof row.grossAmount === 'number' ? row.grossAmount : 0;
      if (amount <= 0) continue;

      grandTotalSpend += amount;

      const umKey = `${user}\0${model}`;
      userModelSpend.set(umKey, (userModelSpend.get(umKey) ?? 0) + amount);
      userTotals.set(user, (userTotals.get(user) ?? 0) + amount);
      modelTotals.set(model, (modelTotals.get(model) ?? 0) + amount);

      if (!userModels.has(user)) userModels.set(user, new Set());
      userModels.get(user)!.add(model);
      if (!modelUsers.has(model)) modelUsers.set(model, new Set());
      modelUsers.get(model)!.add(user);

      if (hasOrg) {
        const org = getField(row, 'organization');
        const ouKey = `${org}\0${user}`;
        orgUserSpend.set(ouKey, (orgUserSpend.get(ouKey) ?? 0) + amount);
        orgTotals.set(org, (orgTotals.get(org) ?? 0) + amount);
        if (!orgUsers.has(org)) orgUsers.set(org, new Set());
        orgUsers.get(org)!.add(user);
      }

      // Accumulate token counts at every level
      if (isTokenReport) {
        const tRow = row as TokenUsageRow;
        const inp = tRow.totalInputTokens ?? 0;
        const out = tRow.totalOutputTokens ?? 0;
        const cr = tRow.totalCacheReadTokens ?? 0;
        const cw = tRow.totalCacheCreationTokens ?? 0;

        const addTo = (map: Map<string, TokenBucket>, key: string) => {
          const e = map.get(key) ?? emptyBucket();
          e.input += inp; e.output += out; e.cacheRead += cr; e.cacheWrite += cw;
          map.set(key, e);
        };
        addTo(modelTokenTypes, model);
        addTo(userTokenTypes, user);
        addTo(userModelTokens, umKey);
        grandTotalTokens.input += inp;
        grandTotalTokens.output += out;
        grandTotalTokens.cacheRead += cr;
        grandTotalTokens.cacheWrite += cw;

        if (hasOrg) {
          const org = getField(row, 'organization');
          addTo(orgTokenTypes, org);
        }
      }
    }

    const showOrgLevel = hasOrg && orgTotals.size > 1;

    const topOrgs = showOrgLevel
      ? [...orgTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)
      : [];
    const topOrgSet = new Set(topOrgs);

    const topUsers = [...userTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k]) => k);
    const topUserSet = new Set(topUsers);

    const topModels = [...modelTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);
    const topModelSet = new Set(topModels);

    // Build links
    const links: [string, string, number][] = [];

    if (showOrgLevel) {
      for (const [key, weight] of orgUserSpend) {
        const [org, user] = key.split('\0');
        if (!topOrgSet.has(org) || !topUserSet.has(user)) continue;
        if (weight < 0.01) continue;
        links.push([`org:${org}`, `user:${user}`, Math.round(weight * 100) / 100]);
      }
    }

    for (const [key, weight] of userModelSpend) {
      const [user, model] = key.split('\0');
      if (!topUserSet.has(user) || !topModelSet.has(model)) continue;
      if (weight < 0.01) continue;
      links.push([`user:${user}`, `model:${model}`, Math.round(weight * 100) / 100]);
    }

    // Add model → token type links for token usage reports
    // We use token counts as the weight here (not dollars), so the rightmost
    // column shows the proportional split of tokens consumed by each type.
    const showTokenTypes = isTokenReport && modelTokenTypes.size > 0;

    const TOKEN_TYPE_COLORS: Record<string, string> = {
      'Input': '#006edb',
      'Output': '#30a147',
      'Cache Read': '#b88700',
      'Cache Write': '#894ceb',
    };

    if (showTokenTypes) {
      for (const model of topModels) {
        const entry = modelTokenTypes.get(model);
        if (!entry) continue;
        const totalTokens = entry.input + entry.output + entry.cacheRead + entry.cacheWrite;
        if (totalTokens <= 0) continue;
        // Distribute the model's dollar spend proportionally across token types
        // so all links in the chart share the same unit (dollars)
        const modelSpend = modelTotals.get(model) ?? 0;
        const types: [string, number][] = [
          ['Input', entry.input],
          ['Output', entry.output],
          ['Cache Read', entry.cacheRead],
          ['Cache Write', entry.cacheWrite],
        ];
        for (const [typeName, count] of types) {
          if (count <= 0) continue;
          const proportionalSpend = (count / totalTokens) * modelSpend;
          if (proportionalSpend < 0.01) continue;
          links.push([`model:${model}`, `tokentype:${typeName}`, Math.round(proportionalSpend * 100) / 100]);
        }
      }
    }

    if (links.length === 0) return null;

    // Build color map for model nodes
    const modelColorMap = buildColorMap(topModels);

    // Assign explicit columns so the layout is clean and predictable
    const orgCol = 0;
    const userCol = showOrgLevel ? 1 : 0;
    const modelCol = showOrgLevel ? 2 : 1;
    const tokenTypeCol = modelCol + 1;

    const nodes: SankeyNode[] = [];

    for (let i = 0; i < topOrgs.length; i++) {
      const org = topOrgs[i];
      nodes.push({
        id: `org:${org}`,
        name: formatDisplayValue(org, 'organization') || org,
        column: orgCol,
        color: GITHUB_COLORS_RESOLVED[i % GITHUB_COLORS_RESOLVED.length],
      });
    }
    for (const user of topUsers) {
      nodes.push({
        id: `user:${user}`,
        name: formatDisplayValue(user, 'username') || user,
        column: userCol,
      });
    }
    for (const model of topModels) {
      nodes.push({
        id: `model:${model}`,
        name: formatDisplayValue(model, 'model') || model,
        column: modelCol,
        color: modelColorMap.get(model) ?? '#808fa3',
      });
    }

    if (showTokenTypes) {
      for (const typeName of ['Input', 'Output', 'Cache Read', 'Cache Write']) {
        // Only add the node if there are any links flowing into it
        const hasLinks = links.some(([, to]) => to === `tokentype:${typeName}`);
        if (!hasLinks) continue;
        nodes.push({
          id: `tokentype:${typeName}`,
          name: typeName,
          column: tokenTypeCol,
          color: TOKEN_TYPE_COLORS[typeName],
        });
      }
    }

    const titleParts = showOrgLevel ? ['Organization', 'User', 'Model'] : ['User', 'Model'];
    if (showTokenTypes) titleParts.push('Token Type');
    const chartTitle = `Spend flow: ${titleParts.join(' → ')}`;

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

            const $ = (v: number) => `$${v.toFixed(2)}`;
            const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0%';
            const tokenBar = (b: TokenBucket) => {
              const total = b.input + b.output + b.cacheRead + b.cacheWrite;
              if (total === 0) return '';
              const lines = [
                `<span style="color:#006edb">●</span> Input: <b>${formatCompact(b.input)}</b> (${pct(b.input, total)})`,
                `<span style="color:#30a147">●</span> Output: <b>${formatCompact(b.output)}</b> (${pct(b.output, total)})`,
              ];
              if (b.cacheRead > 0) lines.push(`<span style="color:#b88700">●</span> Cache Read: <b>${formatCompact(b.cacheRead)}</b> (${pct(b.cacheRead, total)})`);
              if (b.cacheWrite > 0) lines.push(`<span style="color:#894ceb">●</span> Cache Write: <b>${formatCompact(b.cacheWrite)}</b> (${pct(b.cacheWrite, total)})`);
              return `<br/><span style="color:#9198a1;font-size:10px">${formatCompact(total)} tokens</span><br/>` + lines.join('<br/>');
            };

            // Node tooltip
            if (point.isNode) {
              const id = point.id ?? '';
              const spend = point.sum ?? 0;
              const spendPct = pct(spend, grandTotalSpend);

              // Organization node
              if (id.startsWith('org:')) {
                const key = id.slice(4);
                const userCount = orgUsers.get(key)?.size ?? 0;
                const topLinks = (point.linksFrom ?? []).sort((a, b) => b.weight - a.weight).slice(0, 5);
                let html = `<b>${point.name}</b><br/>${$(spend)} <span style="color:#9198a1">(${spendPct} of total)</span><br/><span style="color:#9198a1">${userCount} users</span>`;
                if (topLinks.length > 0) {
                  html += '<br/><br/><span style="color:#9198a1;font-size:10px">Top users:</span>';
                  for (const l of topLinks) html += `<br/>  ${l.toNode.name}: ${$(l.weight)}`;
                }
                const tokens = orgTokenTypes.get(key);
                if (tokens) html += '<br/>' + tokenBar(tokens);
                return html;
              }

              // User node
              if (id.startsWith('user:')) {
                const key = id.slice(5);
                const modelCount = userModels.get(key)?.size ?? 0;
                const topLinks = (point.linksFrom ?? []).sort((a, b) => b.weight - a.weight).slice(0, 5);
                let html = `<b>${point.name}</b><br/>${$(spend)} <span style="color:#9198a1">(${spendPct} of total)</span><br/><span style="color:#9198a1">${modelCount} models</span>`;
                if (topLinks.length > 0) {
                  html += '<br/><br/><span style="color:#9198a1;font-size:10px">Top models:</span>';
                  for (const l of topLinks) html += `<br/>  ${l.toNode.name}: ${$(l.weight)}`;
                }
                const tokens = userTokenTypes.get(key);
                if (tokens) html += '<br/>' + tokenBar(tokens);
                return html;
              }

              // Model node
              if (id.startsWith('model:')) {
                const key = id.slice(6);
                const userCount = modelUsers.get(key)?.size ?? 0;
                let html = `<b>${point.name}</b><br/>${$(spend)} <span style="color:#9198a1">(${spendPct} of total)</span><br/><span style="color:#9198a1">${userCount} users</span>`;
                const tokens = modelTokenTypes.get(key);
                if (tokens) html += '<br/>' + tokenBar(tokens);
                return html;
              }

              // Token type node
              if (id.startsWith('tokentype:')) {
                const typeName = id.slice(10);
                const tokenField = typeName === 'Input' ? 'input' : typeName === 'Output' ? 'output' : typeName === 'Cache Read' ? 'cacheRead' : 'cacheWrite';
                const totalForType = [...modelTokenTypes.values()].reduce((s, b) => s + b[tokenField], 0);
                const grandTotal = grandTotalTokens.input + grandTotalTokens.output + grandTotalTokens.cacheRead + grandTotalTokens.cacheWrite;
                let html = `<b>${point.name}</b><br/>${$(spend)} <span style="color:#9198a1">(${spendPct} of total)</span>`;
                html += `<br/><span style="color:#9198a1">${formatCompact(totalForType)} tokens (${pct(totalForType, grandTotal)})</span>`;
                // Show per-model breakdown for this token type
                const modelBreak = topModels
                  .map(m => ({ name: formatDisplayValue(m, 'model') || m, count: modelTokenTypes.get(m)?.[tokenField] ?? 0 }))
                  .filter(x => x.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5);
                if (modelBreak.length > 0) {
                  html += '<br/><br/><span style="color:#9198a1;font-size:10px">By model:</span>';
                  for (const mb of modelBreak) html += `<br/>  ${mb.name}: ${formatCompact(mb.count)}`;
                }
                return html;
              }

              return `<b>${point.name}</b>: ${$(spend)}`;
            }

            // Link tooltip
            const fromId = point.fromNode?.id ?? '';
            const toId = point.toNode?.id ?? '';
            const from = point.fromNode?.name ?? '';
            const to = point.toNode?.name ?? '';
            const weight = point.weight ?? 0;
            const linkPct = pct(weight, grandTotalSpend);

            // user → model link: show token breakdown for that pair
            if (fromId.startsWith('user:') && toId.startsWith('model:')) {
              const umKey = `${fromId.slice(5)}\0${toId.slice(6)}`;
              const tokens = userModelTokens.get(umKey);
              let html = `${from} → ${to}<br/><b>${$(weight)}</b> <span style="color:#9198a1">(${linkPct})</span>`;
              if (tokens) html += tokenBar(tokens);
              return html;
            }

            // model → token type link: show token count + % of model
            if (fromId.startsWith('model:') && toId.startsWith('tokentype:')) {
              const modelKey = fromId.slice(6);
              const typeName = toId.slice(10);
              const tokenField = typeName === 'Input' ? 'input' : typeName === 'Output' ? 'output' : typeName === 'Cache Read' ? 'cacheRead' : 'cacheWrite';
              const modelBucket = modelTokenTypes.get(modelKey);
              const tokenCount = modelBucket?.[tokenField] ?? 0;
              const modelTotal = modelBucket ? modelBucket.input + modelBucket.output + modelBucket.cacheRead + modelBucket.cacheWrite : 0;
              return `${from} → ${to}<br/><b>${$(weight)}</b> <span style="color:#9198a1">(${linkPct})</span><br/><span style="color:#9198a1">${formatCompact(tokenCount)} tokens (${pct(tokenCount, modelTotal)} of model)</span>`;
            }

            // org → user link
            return `${from} → ${to}<br/><b>${$(weight)}</b> <span style="color:#9198a1">(${linkPct})</span>`;
          },
        },
        series: [
          {
            type: 'sankey' as const,
            name: 'Spend flow',
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
  }, [activeReport, visibleRows]);

  if (!result) return null;

  return (
    <div>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{result.title}</h3>
      </div>
      <HighchartsReact highcharts={Highcharts} options={result.options} immutable />
    </div>
  );
}
