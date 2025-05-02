import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['github-app.test.ts', 'oauth-flow-test.ts'],
  },
});
