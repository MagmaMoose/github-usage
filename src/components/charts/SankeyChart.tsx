import { useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsSankey from 'highcharts/modules/sankey';
import { HighchartsReact } from 'highcharts-react-official';
import { useReport } from '../../context/useReport';
import { buildColorMap, GITHUB_COLORS_RESOLVED } from '../../lib/chart-theme';
import { formatDisplayValue } from '../../lib/formatters';
import type { AnyReportRow } from '../../lib/types';

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

  const options = useMemo((): Highcharts.Options | null => {
    if (!activeReport) return null;

    const rows = visibleRows as AnyReportRow[];
    if (rows.length === 0) return null;

    const hasOrg = rows.some((r) => 'organization' in r);

    // Aggregate spend per (org, user) and (user, model)
    const orgUserSpend = new Map<string, number>();
    const userModelSpend = new Map<string, number>();
    const orgTotals = new Map<string, number>();
    const userTotals = new Map<string, number>();
    const modelTotals = new Map<string, number>();

    for (const row of rows) {
      const user = getField(row, 'username');
      const model = getField(row, 'model');
      const amount = typeof row.grossAmount === 'number' ? row.grossAmount : 0;
      if (amount <= 0) continue;

      const umKey = `${user}\0${model}`;
      userModelSpend.set(umKey, (userModelSpend.get(umKey) ?? 0) + amount);
      userTotals.set(user, (userTotals.get(user) ?? 0) + amount);
      modelTotals.set(model, (modelTotals.get(model) ?? 0) + amount);

      if (hasOrg) {
        const org = getField(row, 'organization');
        const ouKey = `${org}\0${user}`;
        orgUserSpend.set(ouKey, (orgUserSpend.get(ouKey) ?? 0) + amount);
        orgTotals.set(org, (orgTotals.get(org) ?? 0) + amount);
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

    if (links.length === 0) return null;

    // Build color map for model nodes
    const modelColorMap = buildColorMap(topModels);

    // Assign explicit columns so the layout is clean and predictable
    const orgCol = 0;
    const userCol = showOrgLevel ? 1 : 0;
    const modelCol = showOrgLevel ? 2 : 1;

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

    const title = showOrgLevel
      ? 'Spend flow: Organization → User → Model'
      : 'Spend flow: User → Model';

    return {
      chart: {
        height: 600,
        zooming: { type: 'xy' },
        panning: { enabled: true, type: 'xy' },
        panKey: 'shift',
      },
      title: { text: title },
      tooltip: {
        headerFormat: undefined,
        pointFormat: '{point.fromNode.name} \u2192 {point.toNode.name}: <b>${point.weight:.2f}</b>',
        // nodeFormat is valid for sankey but not in base TS types
        ...({ nodeFormat: '<b>{point.name}</b>: ${point.sum:.2f}' } as Highcharts.TooltipOptions),
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
    };
  }, [activeReport, visibleRows]);

  if (!options) return null;

  return <HighchartsReact highcharts={Highcharts} options={options} immutable />;
}
