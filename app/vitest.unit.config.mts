import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Pure unit tests — no DB, no Payload boot. Deliberately separate from vitest.config.mts so
// `test:int` semantics are untouched (that config only includes tests/int/**/*.int.spec.ts).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Default env is node (DB-free logic tests); component tests opt into jsdom per-file via a
    // `// @vitest-environment jsdom` docblock (e.g. favoriteToggle.spec.tsx).
    environment: 'node',
    include: ['tests/unit/**/*.spec.{ts,tsx}'],
  },
})
