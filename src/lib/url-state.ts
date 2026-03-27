/** Read/write filter state to URL search params */

export interface URLFilterState {
  page?: string;
  groupBy?: string;
  timeBucket?: string;
  period?: string;
  search?: string;
  tab?: string;
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

/** Write filter state to URL search params without triggering navigation */
export function writeURLFilterState(state: URLFilterState): void {
  const params = new URLSearchParams();

  if (state.page && state.page !== 'copilot') {
    params.set('page', state.page);
  }

  if (state.groupBy && state.groupBy !== 'username') {
    params.set('groupBy', state.groupBy);
  }

  if (state.timeBucket && state.timeBucket !== 'daily') {
    params.set('timeBucket', state.timeBucket);
  }

  if (state.period && state.period !== 'all') {
    params.set('period', state.period);
  }

  if (state.search) {
    params.set('search', state.search);
  }

  if (state.tab && state.tab !== 'charts') {
    params.set('tab', state.tab);
  }

  if (state.filters) {
    for (const [field, values] of Object.entries(state.filters)) {
      for (const value of values) {
        params.append(`filter.${field}`, value);
      }
    }
  }

  const search = params.toString();
  const newURL = search ? `${window.location.pathname}?${search}` : window.location.pathname;

  // Replace state to avoid polluting browser history on every keystroke
  window.history.replaceState(null, '', newURL);
}
