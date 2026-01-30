import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    include: ['tests/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules/', 'dist/'],
    globalSetup: ['./tests/e2e/global-setup.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
