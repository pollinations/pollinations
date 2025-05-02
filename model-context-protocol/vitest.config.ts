import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable global test APIs like describe, it, expect
    globals: true,
    // Environment to run tests in
    environment: 'node',
    // Timeout for tests in milliseconds
    testTimeout: 60000,
    // Include files matching these patterns
    include: ['tests/integration/**/*.test.{js,ts}'],
    // Exclude files matching these patterns
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
