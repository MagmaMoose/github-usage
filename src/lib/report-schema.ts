import type { ComponentType } from 'react';
import type { ReportType } from './types';
import { REPORT_TYPES } from './types';
import {
  CopilotIcon,
  GraphIcon,
  ServerIcon,
  WorkflowIcon,
} from '@primer/octicons-react';

// Metric option displayed in TimeSeriesChart metric toggle
export interface MetricOption {
  key: string;
  label: string;
  isCurrency: boolean;
  /** When key differs from the actual row field (e.g. key='seats' but data lives in 'quantity') */
  valueField?: string;
  /** Optional row filter applied before aggregation (e.g. filter to seat-only rows) */
  rowFilter?: (row: Record<string, unknown>) => boolean;
}

// Hero card configuration — drives what cards render per report type
export interface HeroCardConfig {
  id: string;
  title: string;
  /** Field to sum for the main value. Special values: 'totalTokens', 'totalMinutes', 'totalStorageGBH' are computed in HeroCardsGrid. */
  valueField: string;
  /** 'currency' | 'compact' | 'number' */
  format: 'currency' | 'compact' | 'number';
  /** Field to topN for the breakdown below the value */
  breakdownGroupField?: string;
  /** Field to sum for each breakdown entry */
  breakdownMetricField?: string;
  /** Static breakdown entries (e.g., discount line) */
  staticBreakdown?: Array<{ label: string; valueField: string; format: 'currency' | 'compact'; prefix?: string }>;
  /** Only show this card when report.type matches */
  onlyForType?: ReportType;
}

// Full schema that drives all report-type-aware rendering
export interface ReportSchema {
  type: ReportType;
  label: string;
  pluralLabel: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  description: string;
  emptyStateTitle: string;
  emptyStateText: string;
  /** Primary dimension for breakdown stacking (model for copilot, sku for usage) */
  primaryDimension: string;
  /** Default groupBy column */
  defaultGroupBy: string;
  /** Metric options for TimeSeriesChart toggle */
  metricOptions: MetricOption[];
  /** Field to stack bars by in breakdown/cost charts */
  breakdownStackField: string;
  /** Sankey hierarchy levels */
  sankeyHierarchy: string[];
  /** Hero card configurations */
  heroCards: HeroCardConfig[];
  /** Filterable fields for FilterBar */
  filterableFields: string[];
}

// ─── Schema Definitions ────────────────────────────────────────────────────────

const COPILOT_METRIC_OPTIONS: MetricOption[] = [
  { key: 'grossAmount', label: 'Spend', isCurrency: true },
  { key: 'totalInputTokens', label: 'Input Tokens', isCurrency: false },
  { key: 'totalOutputTokens', label: 'Output Tokens', isCurrency: false },
  { key: 'totalCacheCreationTokens', label: 'Cache Creation', isCurrency: false },
  { key: 'totalCacheReadTokens', label: 'Cache Reads', isCurrency: false },
];

const COPILOT_HERO_CARDS: HeroCardConfig[] = [
  {
    id: 'gross',
    title: 'Gross amount',
    valueField: 'totalGrossAmount',
    format: 'currency',
    breakdownGroupField: 'model',
    breakdownMetricField: 'grossAmount',
  },
  {
    id: 'net',
    title: 'Net amount',
    valueField: 'totalNetAmount',
    format: 'currency',
    staticBreakdown: [{ label: 'Discount', valueField: 'totalDiscountAmount', format: 'currency', prefix: '−' }],
  },
  {
    id: 'requests',
    title: 'Total requests',
    valueField: 'totalQuantity',
    format: 'compact',
    breakdownGroupField: 'username',
    breakdownMetricField: 'quantity',
  },
  {
    id: 'tokens',
    title: 'Total tokens',
    valueField: 'totalTokens',
    format: 'compact',
    onlyForType: REPORT_TYPES.TOKEN_USAGE,
  },
];

const COPILOT_FILTERABLE_FIELDS = [
  'username', 'model', 'organization', 'sku', 'costCenterName', 'product',
];

const PREMIUM_REQUEST_SCHEMA: ReportSchema = {
  type: REPORT_TYPES.PREMIUM_REQUEST,
  label: 'Premium Requests',
  pluralLabel: 'Premium Request Reports',
  icon: CopilotIcon,
  description: 'Token-Based Billing Report Explorer',
  emptyStateTitle: 'Copilot Usage Viewer',
  emptyStateText: 'Upload a GitHub billing CSV to visualize Copilot spend, premium requests, and token usage.',
  primaryDimension: 'model',
  defaultGroupBy: 'username',
  metricOptions: [COPILOT_METRIC_OPTIONS[0]], // spend only for premium requests
  breakdownStackField: 'model',
  sankeyHierarchy: ['organization', 'username', 'model'],
  heroCards: COPILOT_HERO_CARDS.filter((c) => c.id !== 'tokens'),
  filterableFields: COPILOT_FILTERABLE_FIELDS,
};

const TOKEN_USAGE_SCHEMA: ReportSchema = {
  type: REPORT_TYPES.TOKEN_USAGE,
  label: 'Token Usage',
  pluralLabel: 'Token Usage Reports',
  icon: ServerIcon,
  description: 'Token-Based Billing Report Explorer',
  emptyStateTitle: 'Copilot Usage Viewer',
  emptyStateText: 'Upload a GitHub billing CSV to visualize Copilot spend, premium requests, and token usage.',
  primaryDimension: 'model',
  defaultGroupBy: 'username',
  metricOptions: COPILOT_METRIC_OPTIONS,
  breakdownStackField: 'model',
  sankeyHierarchy: ['organization', 'username', 'model'],
  heroCards: COPILOT_HERO_CARDS,
  filterableFields: COPILOT_FILTERABLE_FIELDS,
};

const USAGE_REPORT_SCHEMA: ReportSchema = {
  type: REPORT_TYPES.USAGE_REPORT,
  label: 'Usage Report',
  pluralLabel: 'Metered Usage Reports',
  icon: WorkflowIcon,
  description: 'GitHub Actions, Packages, LFS & Copilot Seats',
  emptyStateTitle: 'Metered Usage Viewer',
  emptyStateText: 'Upload a GitHub metered usage CSV to visualize Actions minutes, storage, and product spend.',
  primaryDimension: 'sku',
  defaultGroupBy: 'sku',
  metricOptions: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'quantity', label: 'Quantity', isCurrency: false },
  ],
  breakdownStackField: 'sku',
  sankeyHierarchy: ['organization', 'repository', 'sku'],
  heroCards: [
    {
      id: 'gross',
      title: 'Gross amount',
      valueField: 'totalGrossAmount',
      format: 'currency',
      breakdownGroupField: 'sku',
      breakdownMetricField: 'grossAmount',
    },
    {
      id: 'net',
      title: 'Net amount',
      valueField: 'totalNetAmount',
      format: 'currency',
      staticBreakdown: [{ label: 'Discount', valueField: 'totalDiscountAmount', format: 'currency', prefix: '−' }],
    },
    {
      id: 'minutes',
      title: 'Total minutes',
      valueField: 'totalMinutes',
      format: 'compact',
    },
    {
      id: 'storage',
      title: 'Storage (GB·h)',
      valueField: 'totalStorageGBH',
      format: 'compact',
    },
  ],
  filterableFields: [
    'username', 'product', 'sku', 'organization', 'repository', 'workflowPath', 'costCenterName',
  ],
};

// ─── Schema Registry ───────────────────────────────────────────────────────────

const SCHEMA_REGISTRY: Record<string, ReportSchema> = {
  [REPORT_TYPES.PREMIUM_REQUEST]: PREMIUM_REQUEST_SCHEMA,
  [REPORT_TYPES.TOKEN_USAGE]: TOKEN_USAGE_SCHEMA,
  [REPORT_TYPES.USAGE_REPORT]: USAGE_REPORT_SCHEMA,
};

/** Get the schema for a report type. Falls back to premium request for unknown types. */
export function getReportSchema(type: ReportType | string): ReportSchema {
  return SCHEMA_REGISTRY[type] ?? PREMIUM_REQUEST_SCHEMA;
}

/** All available schemas (for sidebar nav generation) */
export function getAllSchemas(): ReportSchema[] {
  return Object.values(SCHEMA_REGISTRY);
}

/** Sidebar nav page identifiers derived from report types */
export const PAGE_TYPES = {
  COPILOT: 'copilot',
  USAGE: 'usage',
} as const;

export type PageType = (typeof PAGE_TYPES)[keyof typeof PAGE_TYPES];

/** Map page type to matching report types */
export const PAGE_REPORT_TYPES: Record<PageType, ReportType[]> = {
  [PAGE_TYPES.COPILOT]: [REPORT_TYPES.PREMIUM_REQUEST, REPORT_TYPES.TOKEN_USAGE],
  [PAGE_TYPES.USAGE]: [REPORT_TYPES.USAGE_REPORT],
};

/** Sidebar nav configuration */
export interface NavPageConfig {
  id: PageType;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
}

export const NAV_PAGES: NavPageConfig[] = [
  { id: PAGE_TYPES.COPILOT, label: 'Copilot usage', icon: CopilotIcon },
  { id: PAGE_TYPES.USAGE, label: 'Metered usage', icon: GraphIcon },
];

/** Infer the page type from a report type */
export function pageTypeForReport(reportType: ReportType): PageType {
  for (const [page, types] of Object.entries(PAGE_REPORT_TYPES)) {
    if (types.includes(reportType)) return page as PageType;
  }
  return PAGE_TYPES.COPILOT;
}

// ─── Product-Specific Metric Options ───────────────────────────────────────────

/** Per-product metric options for the usage report. When a product filter is active,
 *  charts use these instead of the generic schema metricOptions. */
export const PRODUCT_METRIC_OPTIONS: Record<string, MetricOption[]> = {
  actions: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'quantity', label: 'Minutes', isCurrency: false },
  ],
  copilot: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'seats', label: 'Seats', isCurrency: false, valueField: 'quantity', rowFilter: (r) => r.unitType === 'user-months' },
    { key: 'usage', label: 'Usage (PRUs)', isCurrency: false, valueField: 'quantity', rowFilter: (r) => r.unitType === 'requests' },
  ],
  spark: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'quantity', label: 'Requests', isCurrency: false },
  ],
  git_lfs: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'quantity', label: 'Storage (GB)', isCurrency: false },
  ],
  packages: [
    { key: 'grossAmount', label: 'Spend', isCurrency: true },
    { key: 'quantity', label: 'Storage (GB)', isCurrency: false },
  ],
};

/** Spend-only metrics (used when "All" products are shown or product not recognized) */
export const MIXED_METRIC_OPTIONS: MetricOption[] = [
  { key: 'grossAmount', label: 'Spend', isCurrency: true },
];
