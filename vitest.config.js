import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds default timeout
    hookTimeout: 30000,
    include: ['**/test/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/test/**']
    }
  }
});