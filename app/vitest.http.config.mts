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
    // ⚑ ONE database, therefore ONE file at a time — the rule the rest of the repo already follows.
    //
    // The binding reason is NOT this suite's triggers; it is `setupRoleFixture`, which opens with a
    // NAMESPACE-WIDE `purgeMarked(payload, MARK_BASE)` sweep for crashed-run leftovers. That sweep
    // reaches a concurrent run's rows, so two spec files running at once destroy each other's
    // fixtures whatever else they do. `tests/helpers/fixtures.ts` documents this on `MARK` and is the
    // authority; read it before changing anything here.
    //
    // ⚑ This config was simply the one place MISSING the setting. `vitest.config.mts` (int) has had
    // `fileParallelism: false` all along, and `playwright.config.ts` pins `workers: 1`, both for this
    // same reason. An earlier version of this comment claimed the int suite "does not need this"
    // because it has its own database — that is wrong, and the wrong version invites someone to
    // "restore" parallelism there.
    //
    // How it surfaced, which is a detection story rather than the cause: a Postgres trigger installed
    // by `saveAsNewRecovery.http.spec.ts` to fault a retirement (matrix case 19) fired inside
    // `recovery.http.spec.ts`'s discard test in another worker. That trigger is now scoped to its own
    // row as well — an independent fix, because neither one covers the other's failure mode.
    //
    // Before re-enabling parallelism, follow the remedy `fixtures.ts` names: age-bound the sweep or
    // move it to a `globalSetup` that runs once.
    fileParallelism: false,
  },
})
