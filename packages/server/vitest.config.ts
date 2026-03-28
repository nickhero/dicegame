import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // E2E tests share module-level singletons (gameEngine, aiTurnRunner),
    // so they must run sequentially to avoid cross-file contamination.
    fileParallelism: false,
  },
});
