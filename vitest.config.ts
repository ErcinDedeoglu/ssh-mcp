import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    fileParallelism: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.config.ts', '**/*.d.ts'],
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', 'tests/e2e/**'],
  },
});
