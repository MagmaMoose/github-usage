/** Read/write filter state to URL search params */

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

/** Parse filter state from current URL search params */
export function readURLFilterState(): URLFilterState {
  const params = new URLSearchParams(window.location.search);
  const state: URLFilterState = {};

  const page = params.get('page');
  if (page) state.page = page;

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

/** Write filter state to URL search params without triggering navigation.
 *  Merges with existing params so multiple callers don't clobber each other. */
export function writeURLFilterState(state: URLFilterState): void {
  // Start from current URL params to preserve values set by other callers
  const params = new URLSearchParams(window.location.search);

  // Scalar params: set if provided, use defaults to omit default values
  const SCALAR_DEFAULTS: Record<string, string> = {
    page: 'copilot',
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
  const newURL = search ? `${window.location.pathname}?${search}` : window.location.pathname;

  window.history.replaceState(null, '', newURL);
}
