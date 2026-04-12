import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/templates/**',
        'src/ui/client/**',
        'src/**/*.d.ts',
        'bin/**',
      ],
      // Surface coverage numbers per-directory so gaps stay visible in CI.
      thresholds: {
        lines: 40,
        functions: 40,
        statements: 40,
        branches: 40,
      },
    },
  },
});
