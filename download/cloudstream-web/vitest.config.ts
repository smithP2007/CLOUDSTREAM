import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .tsx test files (player + app UI component suites) MUST be collected;
    // the previous pattern `*.test.ts` silently excluded them.
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: false,
    // Keep real timers by default: cancellation/timeout tests must prove real
    // AbortSignal behavior, not simulated timer semantics.
    retry: 0,
  },
});
