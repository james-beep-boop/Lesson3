import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/audit/expiry-race.audit.spec.tsx', 'tests/audit/restore-marker.audit.spec.ts'],
  },
})
