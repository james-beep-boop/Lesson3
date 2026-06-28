import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// HTTP endpoint/authz e2e (`tests/http`). UNLIKE `vitest.config.mts` (the Local-API int suite) this
// config loads NO `vitest.setup.ts`, so it does NOT override DATABASE_URI to the localhost test DB:
// these tests seed via the Local API into the SAME database the RUNNING app serves from, then drive
// the real HTTP endpoints over the wire. On the Rock that means `--env-file .env` (the live `lesson3`)
// and `E2E_BASE_URL=http://app:3000` (the app service on the compose network). See DECISIONS 2026-06-28.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['tests/http/**/*.http.spec.ts'],
    // The export handshake polls a background job; give the whole file room.
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
})
