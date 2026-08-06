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
    // ⚑ ONE database, ONE running app, therefore ONE file at a time.
    //
    // Every spec here seeds through the Local API into the SAME database the app serves — that is the
    // defining property of this suite (see the note above). Running files in parallel therefore races
    // shared mutable state, and it is not hypothetical: `saveAsNewRecovery.http.spec.ts` installs a
    // Postgres trigger to fault an edit-recovery retirement (matrix case 19), and with parallel files
    // that trigger fired inside `recovery.http.spec.ts`'s discard test running concurrently in
    // another worker — failing a spec that had nothing to do with it, only when the whole suite ran.
    //
    // Serial costs a few seconds across three files. Parallel costs a class of failures that appear
    // only in full runs, which is the worst place to find them. The `tests/int` suite does not need
    // this: `vitest.setup.ts` points it at its own `lesson3_test` database.
    fileParallelism: false,
  },
})
