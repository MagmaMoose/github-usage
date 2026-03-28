/** Read/write filter state to URL search params + path-based page routing */

export interface URLFilterState {
  page?: string;
  groupBy?: string;
  timeBucket?: string;
  period?: string;
  search?: string;
  tab?: string;
  metric?: string;
  filters?: Record<string, string[]>;
}

const BASE_PATH = import.meta.env.BASE_URL || '/';
const DEFAULT_PAGE = 'copilot';

/** Extract the page segment from the pathname (after the base path) */
function getPageFromPath(): string | undefined {
  const path = window.location.pathname;
  const afterBase = path.startsWith(BASE_PATH)
    ? path.slice(BASE_PATH.length)
    : path.slice(1);
  const segment = afterBase.replace(/\/$/, '');
  return segment || undefined;
}

/** Build the pathname for a given page */
export function buildPathForPage(page: string | undefined): string {
  if (!page || page === DEFAULT_PAGE) return BASE_PATH;
  return `${BASE_PATH}${page}`;
}

/** Parse filter state from current URL path + search params */
export function readURLFilterState(): URLFilterState {
  const params = new URLSearchParams(window.location.search);
  const state: URLFilterState = {};

  // Read page from path first, fall back to ?page= for backward compat
  const pathPage = getPageFromPath();
  const queryPage = params.get('page');
  if (pathPage) {
    state.page = pathPage;
  } else if (queryPage) {
    state.page = queryPage;
  }

  const groupBy = params.get('groupBy');
  if (groupBy) state.groupBy = groupBy;

  const timeBucket = params.get('timeBucket');
  if (timeBucket) state.timeBucket = timeBucket;

  const period = params.get('period');
  if (period) state.period = period;

  const search = params.get('search');
  if (search) state.search = search;

  const tab = params.get('tab');
  if (tab) state.tab = tab;

  const metric = params.get('metric');
  if (metric) state.metric = metric;

  // Filters are encoded as repeated `filter.{field}={value}` params
  const filters: Record<string, string[]> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith('filter.')) {
      const field = key.slice(7); // strip 'filter.'
      if (!filters[field]) filters[field] = [];
      filters[field].push(value);
    }
  }

  if (Object.keys(filters).length > 0) state.filters = filters;
  return state;
}

/** Write filter state to URL path + search params without triggering navigation.
 *  Page goes in the path, everything else in query params. */
export function writeURLFilterState(state: URLFilterState): void {
  const params = new URLSearchParams(window.location.search);

  // Remove legacy ?page= param if present
  params.delete('page');

  // Scalar params (excluding page, which goes in the path)
  const SCALAR_DEFAULTS: Record<string, string> = {
    groupBy: 'username',
    timeBucket: 'daily',
    period: 'all',
    tab: 'charts',
    metric: 'grossAmount',
  };

  for (const [param, defaultVal] of Object.entries(SCALAR_DEFAULTS)) {
    const value = state[param as keyof URLFilterState] as string | undefined;
    if (value === undefined) continue; // not provided by this caller, leave existing
    if (value && value !== defaultVal) {
      params.set(param, value);
    } else {
      params.delete(param);
    }
  }

  // Search: set or clear
  if (state.search !== undefined) {
    if (state.search) {
      params.set('search', state.search);
    } else {
      params.delete('search');
    }
  }

  // Filters: replace all filter.* params when filters object is provided
  if (state.filters !== undefined) {
    // Remove existing filter params
    for (const key of [...params.keys()]) {
      if (key.startsWith('filter.')) params.delete(key);
    }
    // Write new ones
    for (const [field, values] of Object.entries(state.filters)) {
      for (const value of values) {
        params.append(`filter.${field}`, value);
      }
    }
  }

  const search = params.toString();
  const pagePath = buildPathForPage(state.page);
  const newURL = search ? `${pagePath}?${search}` : pagePath;

  window.history.replaceState(null, '', newURL);
}
