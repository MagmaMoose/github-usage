import { useCallback, useState } from 'react';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../lib/local-storage';

interface SidebarCollapseReturn {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/** Sidebar collapse state persisted to localStorage */
export function useSidebarCollapse(): SidebarCollapseReturn {
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState(() =>
    getStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, true),
  );

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedRaw(collapsed);
    setStoredValue(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed);
  }, []);

  return { sidebarCollapsed, setSidebarCollapsed };
}
