import { useCallback, useMemo } from 'react';
import type { ParsedReport, UsageReportRow } from '../lib/types';
import { REPORT_TYPES } from '../lib/types';
import { PAGE_TYPES, type PageType } from '../lib/report-schema';

/** Storage SKUs are billed in GB-Hours, not minutes */
export const ACTIONS_STORAGE_SKUS = ['actions_storage', 'actions_custom_image_storage'] as const;

export type ActionsSubView = 'compute' | 'storage';

interface ProductNavigationDeps {
  activePage: PageType;
  activeReport: ParsedReport | null;
  filters: Record<string, string[]>;
  setFilter: (column: string, values: string[]) => void;
}

interface ProductNavigationReturn {
  availableProducts: string[];
  activeProductFilter: string | null;
  actionsSubView: ActionsSubView | null;
  handleProductSelect: (product: string | null, subView?: ActionsSubView) => void;
}

/** Product-level navigation for the Usage page (Actions compute/storage split) */
export function useProductNavigation({
  activePage,
  activeReport,
  filters,
  setFilter,
}: ProductNavigationDeps): ProductNavigationReturn {
  const availableProducts = useMemo(() => {
    if (activePage !== PAGE_TYPES.USAGE || !activeReport) return [];
    if (activeReport.type !== REPORT_TYPES.USAGE_REPORT) return [];
    return [
      ...new Set(
        (activeReport.rows as UsageReportRow[]).map((r) => r.product).filter(Boolean),
      ),
    ].sort();
  }, [activePage, activeReport]);

  const activeProductFilter = filters.product?.[0] ?? null;

  const actionsSubView = useMemo((): ActionsSubView | null => {
    const skuFilter = filters.sku ?? [];
    if (activeProductFilter !== 'actions' || skuFilter.length === 0) return null;
    if (ACTIONS_STORAGE_SKUS.some((s) => skuFilter.includes(s))) return 'storage';
    if (ACTIONS_STORAGE_SKUS.some((s) => skuFilter.includes(`!${s}`))) return 'compute';
    return null;
  }, [activeProductFilter, filters.sku]);

  const handleProductSelect = useCallback(
    (product: string | null, subView?: ActionsSubView) => {
      if (product) {
        setFilter('product', [product]);
        if (product === 'actions' && subView === 'storage') {
          setFilter('sku', [...ACTIONS_STORAGE_SKUS]);
        } else if (product === 'actions' && subView === 'compute') {
          setFilter('sku', ACTIONS_STORAGE_SKUS.map((s) => `!${s}`));
        } else {
          setFilter('sku', []);
        }
      } else {
        setFilter('product', []);
        setFilter('sku', []);
      }
    },
    [setFilter],
  );

  return { availableProducts, activeProductFilter, actionsSubView, handleProductSelect };
}
