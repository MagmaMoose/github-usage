import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildPathForPage, readURLFilterState, writeURLFilterState } from './url-state';

// Helper to set up window.location for testing
function setLocation(path: string, search = '', hash = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname: path, search, hash, href: `http://localhost${path}${search}${hash}` },
    writable: true,
  });
}

describe('buildPathForPage', () => {
  it('returns base path for undefined page', () => {
    const result = buildPathForPage(undefined);
    expect(result).toMatch(/\/$/);
  });

  it('returns base path for default "usage" page', () => {
    const result = buildPathForPage('usage');
    expect(result).toMatch(/\/$/);
  });

  it('appends page segment for non-default pages', () => {
    const result = buildPathForPage('copilot');
    expect(result).toContain('copilot');
  });

  it('handles ghas page', () => {
    const result = buildPathForPage('ghas');
    expect(result).toContain('ghas');
  });
});

describe('readURLFilterState', () => {
  const replaceStateSpy = vi.fn();

  beforeEach(() => {
    window.history.replaceState = replaceStateSpy;
    replaceStateSpy.mockClear();
  });

  it('reads groupBy from search params', () => {
    setLocation('/', '?groupBy=model');
    const state = readURLFilterState();
    expect(state.groupBy).toBe('model');
  });

  it('reads timeBucket from search params', () => {
    setLocation('/', '?timeBucket=weekly');
    const state = readURLFilterState();
    expect(state.timeBucket).toBe('weekly');
  });

  it('reads period from search params', () => {
    setLocation('/', '?period=2026-03');
    const state = readURLFilterState();
    expect(state.period).toBe('2026-03');
  });

  it('reads search from search params', () => {
    setLocation('/', '?search=alex');
    const state = readURLFilterState();
    expect(state.search).toBe('alex');
  });

  it('reads tab from search params', () => {
    setLocation('/', '?tab=table');
    const state = readURLFilterState();
    expect(state.tab).toBe('table');
  });

  it('reads metric from search params', () => {
    setLocation('/', '?metric=quantity');
    const state = readURLFilterState();
    expect(state.metric).toBe('quantity');
  });

  it('reads filter.* params into filters object', () => {
    setLocation('/', '?filter.model=GPT-5&filter.model=Claude&filter.org=acme');
    const state = readURLFilterState();
    expect(state.filters).toEqual({
      model: ['GPT-5', 'Claude'],
      org: ['acme'],
    });
  });

  it('returns empty state for no params', () => {
    setLocation('/');
    const state = readURLFilterState();
    expect(state.groupBy).toBeUndefined();
    expect(state.timeBucket).toBeUndefined();
    expect(state.filters).toBeUndefined();
  });

  it('reads page from legacy ?page= param', () => {
    setLocation('/', '?page=copilot');
    const state = readURLFilterState();
    expect(state.page).toBe('copilot');
  });
});

describe('writeURLFilterState', () => {
  const replaceStateSpy = vi.fn();

  beforeEach(() => {
    setLocation('/');
    window.history.replaceState = replaceStateSpy;
    replaceStateSpy.mockClear();
  });

  it('writes groupBy when not default', () => {
    writeURLFilterState({ groupBy: 'model' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).toContain('groupBy=model');
  });

  it('omits groupBy when default (username)', () => {
    writeURLFilterState({ groupBy: 'username' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).not.toContain('groupBy');
  });

  it('writes period when not default', () => {
    writeURLFilterState({ period: '2026-03' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).toContain('period=2026-03');
  });

  it('omits period when default (all)', () => {
    writeURLFilterState({ period: 'all' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).not.toContain('period');
  });

  it('writes search param', () => {
    writeURLFilterState({ search: 'test-query' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).toContain('search=test-query');
  });

  it('clears search when empty', () => {
    setLocation('/', '?search=old');
    writeURLFilterState({ search: '' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).not.toContain('search');
  });

  it('writes filter.* params', () => {
    writeURLFilterState({ filters: { model: ['GPT-5', 'Claude'] } });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).toContain('filter.model=GPT-5');
    expect(url).toContain('filter.model=Claude');
  });

  it('clears old filter params when filters is empty object', () => {
    setLocation('/', '?filter.model=old');
    writeURLFilterState({ filters: {} });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).not.toContain('filter.');
  });

  it('writes tab when not default', () => {
    writeURLFilterState({ tab: 'table' });
    const url = replaceStateSpy.mock.calls[0][2] as string;
    expect(url).toContain('tab=table');
  });
});
