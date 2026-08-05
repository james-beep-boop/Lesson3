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
    // `envTemplateParity.spec.ts` parses the source with the TypeScript compiler API. Left to Vite,
    // that pulls the multi-MB `typescript.js` through the transform pipeline, which then logs a
    // sourcemap-not-found warning on every run (TypeScript ships no `.js.map`). Loading it externally
    // skips the transform: no warning, and a faster run. Behaviour is unchanged either way.
    server: { deps: { external: ['typescript'] } },
  },
})
