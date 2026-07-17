import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 30000,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // @primer/react ships an ESM `.css` import that Node can't load when the
    // dep is externalized; inline it so Vite transforms it for component tests.
    server: { deps: { inline: ['@primer/react'] } },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: [
        'src/lib/sample-data.ts', // dynamic imports only, untestable
        'src/lib/local-storage.ts', // IndexedDB not available in jsdom
        'src/lib/zip.ts', // File.arrayBuffer() not available in jsdom
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 74,
        functions: 67,
        statements: 72,
        branches: 64,
      },
    },
  },
});
