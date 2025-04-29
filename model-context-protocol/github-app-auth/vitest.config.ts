import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'miniflare',
    environmentOptions: {
      // Miniflare options
      bindings: {
        // Mock bindings for D1 database
        DB: {
          type: 'd1',
          database: 'github_auth',
        },
      },
    },
  },
});
