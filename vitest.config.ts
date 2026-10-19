import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Keep real timers by default: cancellation/timeout tests must prove real
    // AbortSignal behavior, not simulated timer semantics.
    retry: 0,
  },
});
