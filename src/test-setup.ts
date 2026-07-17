import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// --- jsdom gaps that Primer components touch during render ------------------
// These are no-ops for the pure-lib tests and only matter when a component test
// mounts Primer UI (e.g. the schedule dialog).

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (!('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Primer's TooltipV2 loads @oddbird/popover-polyfill, which crashes in jsdom
// (`adoptedStyleSheets` isn't iterable). Reporting native popover support makes
// the polyfill short-circuit, which is what we want under test.
if (typeof HTMLElement !== 'undefined' && !('popover' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'popover', {
    value: null,
    writable: true,
    configurable: true,
  });
}
