/**
 * `save-as-new` × edit recovery, over the WIRE — the acceptance cases that only a real endpoint
 * transaction can express. `docs/DESIGN-working-drafts.md` §7 owns which case sits at which layer.
 *
 *   C7   a token-bearing save retires the capture — content cleared, marker kept, revision advanced
 *   LEG  a save with NO token behaves exactly as before and retires nothing (the PR-1 contract)
 *   C19  a REAL database failure during retirement rolls the whole save back — no orphan version
 *   C20  a capture landing WHILE the save is in flight: 409, not retried, newer capture survives
 *   DEL  with `deleteSource=true`, retirement happens BEFORE the cascade removes the row
 *   C29  revision chaining — start → capture → capture → save, each adopting the returned token
 *
 * ⚑ **Every Postgres object this file installs is named `lesson3_san_*`** — one prefix per spec file,
 * so two specs installing test DDL can never collide or demolish each other's teardown. Row-level
 * triggers are additionally `WHEN`-scoped to their own row. A `FOR EACH STATEMENT` trigger cannot
 * carry a `WHEN` clause at all, so where one is used (C20's counter) the baseline is taken
 * immediately before the measured window instead — see the comment at that site.
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'
import { formDoc, recoveryRow } from '../helpers/editRecovery.js'
import type { RecoveryToken } from '../../src/lib/editRecovery/kernel.js'
import { login, url } from '../helpers/httpWire.js'

let fx: RoleFixture
let editorToken: string

const auth = () => ({ Authorization: `JWT ${editorToken}` })

/** The drizzle handle, for the trigger DDL these tests install. */
const db = () => drizzleOf(fx.payload)

beforeAll(async () => {
  fx = await setupRoleFixture()
  editorToken = await login(fx.users.editor.email, fx.password)
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

/**
 * A fresh candidate version owned by this plan, so each test gets its own recovery row.
 *
 * ⚑ Semvers are spaced by MINOR, and each caller takes the next one from a counter rather than
 * naming it. `save-as-new` mints the next PATCH for the plan, so fixed neighbouring patches
 * (`3.1.1`, `3.1.2`, …) collide with what the endpoint under test generates — the second fixture
 * then dies on the `(lessonPlan, semver)` unique index and reads as a product failure. Stepping the
 * minor leaves every patch in between free for the endpoint to consume.
 */
let nextMinor = 0
const nextSemver = () => `3.${++nextMinor}.0`

async function makeVersion() {
  const semver = nextSemver()
  return (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}SAN-${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as { id: number; updatedAt: string; lessons?: unknown[] }
}

const recovery = (versionId: number, path = '', method = 'POST', body?: unknown) =>
  fetch(url(`/api/lesson-bundle-versions/${versionId}/recovery${path}`), {
    method,
    headers: { 'Content-Type': 'application/json', ...auth() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

/** Start a session and capture some prose, returning the CURRENT token. */
async function seedCapture(versionId: number, title: string) {
  const started = await recovery(versionId, '/start')
  expect(started.status, 'fixture: start must succeed').toBe(200)
  const t = await tokenOf(started)

  const cap = await recovery(versionId, '', 'POST', {
    generation: t.generation,
    expectedRevision: t.revision,
    document: formDoc(title),
  })
  expect(cap.status, 'fixture: capture must succeed').toBe(200)
  return tokenOf(cap)
}

/** The multipart body `save-as-new` takes, optionally carrying the recovery token. */
function saveForm(
  version: { updatedAt: string; lessons?: unknown[] },
  prose: string,
  token?: { generation: number; revision: number },
): FormData {
  const lessons = ((version.lessons ?? []) as { overview?: string }[]).map((l, i) =>
    i === 0 ? { ...l, overview: `${MARK}${prose}` } : l,
  )
  const f = new FormData()
  f.set('data', JSON.stringify({ ...version, lessons }))
  if (token) {
    f.set('recoveryGeneration', String(token.generation))
    f.set('recoveryExpectedRevision', String(token.revision))
  }
  return f
}

/** The advanced token a recovery write returns. Written out five times before this existed. */
const tokenOf = async (res: Response): Promise<{ generation: number; revision: number }> =>
  ((await res.json()) as { token: { generation: number; revision: number } }).token

const saveAsNew = (versionId: number, body: FormData, query = '') =>
  fetch(url(`/api/lesson-bundle-versions/${versionId}/save-as-new${query}`), {
    method: 'POST',
    headers: auth(),
    body,
  })

/**
 * The recovery row as the database holds it — the only way to see a tombstone.
 *
 * ⚑ Uses the SHARED `recoveryRow`. `tests/helpers/editRecovery.ts` exists because two sibling specs
 * had once defined `rawRow` with the same name and SWAPPED parameters; a third local copy here would
 * be that drift re-forming.
 */
const rawRow = (versionId: number) => recoveryRow(fx.payload, versionId, fx.users.editor.id)

const versionExists = async (id: number): Promise<boolean> => {
  const { totalDocs } = await fx.payload.count({
    collection: 'lesson-bundle-versions',
    where: { id: { equals: id } },
    overrideAccess: true,
  })
  return totalDocs > 0
}

/**
 * A NON-TRANSACTIONAL counter, for observing things that happen inside a transaction that then rolls
 * back. `nextval` is explicitly exempt from rollback, which is the only reason these tests can see a
 * statement that a `ROLLBACK` erased every other trace of. Names are literals in this file, so
 * `sql.raw` carries no injection surface.
 */
const seqCreate = (name: string) => db().execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${name}`))
const seqDrop = (name: string) => db().execute(sql.raw(`DROP SEQUENCE IF EXISTS ${name}`))
const seqValue = async (name: string): Promise<number> => {
  const rows = rowsOf<{ last_value: unknown; is_called: unknown }>(
    await db().execute(sql.raw(`SELECT last_value, is_called FROM ${name}`)),
  )
  // A never-called sequence reports last_value 1 with is_called false; normalise both to a count.
  return rows[0]?.is_called ? Number(rows[0].last_value) : 0
}

describe('C7 — a successful token-bearing save retires the capture', () => {
  it('clears the content, keeps the marker, advances the revision, leaves the generation', async () => {
    const v = await makeVersion()
    const token = await seedCapture(v.id, 'unsaved work about to be saved')
    const before = await rawRow(v.id)
    expect(before?.retired_at, 'precondition: the capture is ACTIVE').toBeNull()

    const res = await saveAsNew(v.id, saveForm(v, 'C7-saved', token))
    expect(res.status).toBe(200)
    const out = (await res.json()) as {
      id: number
      recoveryToken?: { generation: number; revision: number }
    }

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the capture is retired').not.toBeNull()
    expect(after?.content, 'its content is cleared').toBeNull()
    expect(Number(after?.revision), 'the revision advanced').toBe(Number(before?.revision) + 1)
    // ⚑ Retirement advances the REVISION only. The generation identifies the editing SESSION and
    // moves only when a new one begins (SPEC §5, amended 2026-08-06; case 22 depends on this).
    expect(Number(after?.generation), 'the generation did NOT move').toBe(
      Number(before?.generation),
    )

    // The advanced token comes back so the client adopts it rather than keeping the superseded pair.
    expect(out.recoveryToken?.revision).toBe(Number(after?.revision))

    // And the restore prompt no longer offers anything.
    const got = (await (await recovery(v.id, '', 'GET')).json()) as { capture: null }
    expect(got.capture, 'a retired row is offered to nobody').toBeNull()
  })
})

describe('LEG — a save with NO token is unchanged, and retires nothing', () => {
  it('succeeds, returns no recoveryToken, and leaves the capture ACTIVE', async () => {
    const v = await makeVersion()
    await seedCapture(v.id, 'still unsaved')

    const res = await saveAsNew(v.id, saveForm(v, 'LEG-saved'))
    expect(res.status, 'the legacy path is untouched').toBe(200)
    const out = (await res.json()) as { id: number; recoveryToken?: unknown }
    expect(out.recoveryToken, 'no token in, no token out').toBeUndefined()

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'nothing was retired').toBeNull()
    expect(after?.content, 'the capture is intact').not.toBeNull()
  })

  it('400 when only ONE half of the token is sent — never a silent no-op', async () => {
    const v = await makeVersion()
    const token = await seedCapture(v.id, 'half a token')

    const half = saveForm(v, 'HALF-saved')
    half.set('recoveryGeneration', String(token.generation))
    const res = await saveAsNew(v.id, half)
    expect(res.status).toBe(400)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'a rejected save retires nothing').toBeNull()
  })
})

/**
 * ⚑ C19 — a REAL failing statement, not a mocked throw.
 *
 * A Postgres trigger raises on the retirement UPDATE, so the failure originates in the database
 * inside the endpoint's own transaction, exactly as a genuine fault would. A mocked throw would prove
 * only that the mock was called.
 *
 * ⚑ **The fault is PROVEN to have fired, not assumed.** An earlier version accepted any status >= 400,
 * which a validation error thrown BEFORE the retirement statement would also satisfy — with the
 * version count and the capture equally untouched, and the test equally green, while testing nothing.
 * The trigger now bumps a non-transactional sequence before raising, and the count is asserted at
 * exactly one.
 *
 * ⚑ Scoped by `WHEN` to this test's own row: a database-wide RAISE trigger is a landmine regardless
 * of what the runner does.
 */
describe('C19 — a real database failure during retirement rolls the whole save back', () => {
  const FAULT_SEQ = 'lesson3_san_fault_calls'

  // One command per `execute`: binding a parameter moves drizzle onto the prepared-statement path,
  // which rejects multi-command SQL. Splitting keeps that from mattering.
  const installTrigger = async (sourceVersionId: number) => {
    if (!Number.isSafeInteger(sourceVersionId)) throw new Error(`bad version id ${sourceVersionId}`)
    await seqCreate(FAULT_SEQ)
    await db().execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION lesson3_san_block_retire() RETURNS trigger AS $$
        BEGIN
          PERFORM nextval('${FAULT_SEQ}');
          RAISE EXCEPTION 'lesson3-test: simulated storage fault during retirement';
        END;
        $$ LANGUAGE plpgsql
      `),
    )
    // Defensive: an interrupted earlier run would otherwise leave this behind and fail the CREATE.
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_block_retire_trg ON edit_recovery`)
    await db().execute(
      sql.raw(`
        CREATE TRIGGER lesson3_san_block_retire_trg
          BEFORE UPDATE ON edit_recovery
          FOR EACH ROW
          WHEN (NEW.source_version_id = ${sourceVersionId}
                AND NEW.retired_at IS NOT NULL AND OLD.retired_at IS NULL)
          EXECUTE FUNCTION lesson3_san_block_retire()
      `),
    )
  }

  const dropTrigger = async () => {
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_block_retire_trg ON edit_recovery`)
    await db().execute(sql`DROP FUNCTION IF EXISTS lesson3_san_block_retire()`)
    await seqDrop(FAULT_SEQ)
  }

  afterAll(dropTrigger)

  it('the fault fires, and leaves NO orphan version and an intact capture', async () => {
    const v = await makeVersion()
    const token = await seedCapture(v.id, 'work that must survive a failed save')
    const before = await rawRow(v.id)

    const versionsBefore = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })

    // No try/finally: `afterAll(dropTrigger)` above is the cleanup, `dropTrigger` is IF EXISTS
    // throughout, and nothing below this point can trip a trigger scoped to a null→not-null
    // `retired_at` transition. C20 differs — its barrier MUST be released even on failure.
    await installTrigger(v.id)
    const faultsBefore = await seqValue(FAULT_SEQ)
    const res = await saveAsNew(v.id, saveForm(v, 'C19-should-not-persist', token))
    const faults = (await seqValue(FAULT_SEQ)) - faultsBefore

    // ⚑ Proof the injected failure is what failed the save. Without this, a validation error before
    // the retirement statement passes every other assertion in this test.
    expect(faults, 'the retirement statement ran and the injected fault fired, exactly once').toBe(
      1,
    )
    expect(
      res.status,
      'a storage fault is a server error, not a client one',
    ).toBeGreaterThanOrEqual(500)

    // No orphan. The create ran BEFORE the retirement, so a missing rollback would leave a version
    // behind for a save that never completed.
    const versionsAfter = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })
    expect(versionsAfter.totalDocs, 'no version survived the failed save').toBe(
      versionsBefore.totalDocs,
    )

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the retirement rolled back too').toBeNull()
    expect(after?.content, 'the unsaved work survived').not.toBeNull()
    expect(Number(after?.revision)).toBe(Number(before?.revision))

    // The session still works afterwards — the failure left no half-state behind.
    const got = (await (await recovery(v.id, '', 'GET')).json()) as { capture: unknown }
    expect(got.capture, 'the capture is still offered').not.toBeNull()
  })
})

/**
 * ⚑ C20 — the CONCURRENCY case, executed as one.
 *
 * The matrix specifies an interleaving: a save is in flight, a second tab's capture lands, and only
 * THEN does retirement evaluate its compare-and-set. An earlier version of this test performed the
 * second capture to completion BEFORE calling save-as-new at all — which proves a stale token 409s, a
 * worthwhile but different property, and never exercises the endpoint's transaction against a
 * concurrent writer. Case 20 exists precisely because the two can differ.
 *
 * The interleaving is made DETERMINISTIC with a database barrier rather than with timing:
 *
 *   1. a BEFORE INSERT trigger on `lesson_bundle_versions`, scoped to this save's `source_version_id`,
 *      parks the save inside its own transaction at candidate creation — after authorisation and the
 *      no-op guard, before retirement
 *   2. it announces arrival by bumping a non-transactional sequence, so the test knows the save is
 *      parked rather than merely slow
 *   3. the second capture lands on a different connection (nothing the save holds blocks it — the
 *      save has not touched `edit_recovery` yet)
 *   4. the barrier opens, retirement runs, and its CAS now meets a revision that advanced WHILE the
 *      save was in flight
 *
 * ⚑ "Not retried" is asserted DIRECTLY by counting retirement statements. The outcome cannot
 * distinguish one attempt from five: the token is fixed at request time, so every retry re-runs the
 * same failing precondition and leaves identical evidence. Verified by mutation — making the conflict
 * retryable fails only the count.
 */
describe('C20 — a capture landing DURING the save is never silently retired', () => {
  const RETIRE_SEQ = 'lesson3_san_retire_calls'
  const HOLD_SEQ = 'lesson3_san_hold_calls'

  const installCounter = async () => {
    await seqCreate(RETIRE_SEQ)
    await db().execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION lesson3_san_count_retire() RETURNS trigger AS $$
        BEGIN
          PERFORM nextval('${RETIRE_SEQ}');
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
      `),
    )
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_count_retire_trg ON edit_recovery`)
    // STATEMENT-level: a refused retirement matches ZERO rows, so a row-level trigger would never
    // fire for the very case under test.
    await db().execute(sql`
      CREATE TRIGGER lesson3_san_count_retire_trg
        AFTER UPDATE ON edit_recovery
        FOR EACH STATEMENT EXECUTE FUNCTION lesson3_san_count_retire()
    `)
  }

  /** Park the save inside its transaction at candidate creation, until `openBarrier()`. */
  const installBarrier = async (sourceVersionId: number) => {
    if (!Number.isSafeInteger(sourceVersionId)) throw new Error(`bad version id ${sourceVersionId}`)
    await seqCreate(HOLD_SEQ)
    await db().execute(
      sql`CREATE TABLE IF NOT EXISTS lesson3_san_barrier (id int PRIMARY KEY, is_open boolean NOT NULL)`,
    )
    await db().execute(sql`
      INSERT INTO lesson3_san_barrier (id, is_open) VALUES (1, false)
      ON CONFLICT (id) DO UPDATE SET is_open = false
    `)
    // ⚑ Each SELECT in a plpgsql loop takes a FRESH snapshot under READ COMMITTED, which is what lets
    // this observe a commit made by another connection while this transaction stays open. The loop
    // bound is there so a failed test cannot park a request forever.
    await db().execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION lesson3_san_hold() RETURNS trigger AS $$
        DECLARE waited int := 0;
        BEGIN
          PERFORM nextval('${HOLD_SEQ}');
          WHILE waited < 100 LOOP
            IF (SELECT is_open FROM lesson3_san_barrier WHERE id = 1) THEN EXIT; END IF;
            PERFORM pg_sleep(0.05);
            waited := waited + 1;
          END LOOP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `),
    )
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_hold_trg ON lesson_bundle_versions`)
    await db().execute(
      sql.raw(`
        CREATE TRIGGER lesson3_san_hold_trg
          BEFORE INSERT ON lesson_bundle_versions
          FOR EACH ROW
          WHEN (NEW.source_version_id = ${sourceVersionId})
          EXECUTE FUNCTION lesson3_san_hold()
      `),
    )
  }

  const openBarrier = () =>
    db().execute(sql`UPDATE lesson3_san_barrier SET is_open = true WHERE id = 1`)

  const dropAll = async () => {
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_hold_trg ON lesson_bundle_versions`)
    await db().execute(sql`DROP FUNCTION IF EXISTS lesson3_san_hold()`)
    await db().execute(sql`DROP TABLE IF EXISTS lesson3_san_barrier`)
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_san_count_retire_trg ON edit_recovery`)
    await db().execute(sql`DROP FUNCTION IF EXISTS lesson3_san_count_retire()`)
    await seqDrop(HOLD_SEQ)
    await seqDrop(RETIRE_SEQ)
  }

  afterAll(dropAll)

  it('409s mid-flight, retires nothing, and runs the retirement statement EXACTLY ONCE', async () => {
    const v = await makeVersion()
    const stale = await seedCapture(v.id, 'first tab')

    const versionsBefore = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })

    await installCounter()
    await installBarrier(v.id)

    let res: Response
    let attempts: number
    try {
      const holdsBefore = await seqValue(HOLD_SEQ)

      // The token is CURRENT as this request is issued. It goes stale mid-flight.
      const inFlight = saveAsNew(v.id, saveForm(v, 'C20-should-409', stale))

      // Park confirmed — the save is inside its transaction, past authorisation, before retirement.
      // `vi.waitUntil` rather than a hand-rolled poll loop: same 50 ms cadence, and this file already
      // imports vitest. Wrapped only to keep a message that names what we are waiting for.
      await vi
        .waitUntil(async () => (await seqValue(HOLD_SEQ)) > holdsBefore, {
          timeout: 15_000,
          interval: 50,
        })
        .catch(() => {
          throw new Error('timed out waiting for the save to reach candidate creation')
        })

      // NOW the second tab types, on its own connection. The save holds nothing this needs.
      const newer = await recovery(v.id, '', 'POST', {
        generation: stale.generation,
        expectedRevision: stale.revision,
        document: formDoc('SECOND TAB newer work'),
      })
      expect(newer.status, 'fixture: the concurrent capture must land while the save waits').toBe(
        200,
      )
      await tokenOf(newer)

      // ⚑ Baseline taken HERE, not before the save. The counter is a STATEMENT-level trigger on the
      // whole table, so it also counts the concurrent capture's own UPDATE — reading it earlier
      // measured "capture + retirement" and reported 2. Everything after this point is the save's.
      const retiresBefore = await seqValue(RETIRE_SEQ)

      await openBarrier()
      res = await inFlight
      attempts = (await seqValue(RETIRE_SEQ)) - retiresBefore
    } finally {
      // Open first: a failure before this point would leave the request parked until the loop bound.
      await openBarrier().catch(() => {})
      await dropAll()
    }

    expect(res.status, 'a recovery conflict is a 409').toBe(409)
    // ⚑ THE ASSERTION THIS TEST EXISTS FOR. A retrying loop shows 2..5 while everything else stays green.
    expect(
      attempts,
      'the retirement statement ran once — a recovery conflict is never retried',
    ).toBe(1)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the capture that landed mid-save was NOT retired').toBeNull()
    expect(JSON.stringify(after?.content), 'and it still holds the newer prose').toContain(
      'SECOND TAB newer work',
    )
    // Derived, not read back: start → 1, the seed capture → 2, the concurrent capture → 3. Asserting
    // the absolute value pins the increment; comparing against a number read from the same write
    // would only prove the row agrees with itself.
    expect(Number(after?.revision), 'exactly one write landed after the stale token').toBe(
      stale.revision + 1,
    )

    const versionsAfter = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })
    expect(versionsAfter.totalDocs, 'no version persisted from the refused save').toBe(
      versionsBefore.totalDocs,
    )
  })
})

/**
 * DEL — ordering against the source cascade.
 *
 * `deleteSource=true` removes the source version, and the parent cascade removes its recovery rows
 * with it. Retirement must therefore run BEFORE the delete: afterwards there would be no row, the
 * precondition would fail, and a perfectly good save would 409.
 */
describe('DEL — retirement precedes the source cascade', () => {
  it('a token-bearing save WITH deleteSource succeeds and removes both', async () => {
    // The editor must be the author for `deleteSource` to be permitted.
    const source = await makeVersion()
    await fx.payload.update({
      collection: 'lesson-bundle-versions',
      id: source.id,
      data: { author: fx.users.editor.id } as never,
      overrideAccess: true,
    })
    const fresh = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: source.id,
      overrideAccess: true,
    })) as { id: number; updatedAt: string; lessons?: unknown[] }

    const token = await seedCapture(source.id, 'about to be saved and deleted')

    const res = await saveAsNew(
      source.id,
      saveForm(fresh, 'DEL-saved', token),
      '?deleteSource=true',
    )
    // ⚑ If retirement ran after the cascade this would be a 409 — the row would already be gone.
    expect(res.status, 'retirement found its row before the cascade removed it').toBe(200)
    const out = (await res.json()) as { id: number; sourceDeleted: boolean }
    expect(out.sourceDeleted).toBe(true)

    expect(await versionExists(source.id), 'the source is gone').toBe(false)
    expect(await versionExists(out.id), 'the new candidate persisted').toBe(true)
    expect(await rawRow(source.id), 'the recovery row went with its parent').toBeUndefined()
  })
})

/**
 * C29 — revision chaining. start → capture → capture → save, each call using the token the PREVIOUS
 * call returned.
 *
 * This is the end-to-end proof of §4's token rule: every write returns an ADVANCED token and the
 * client must adopt it. A caller that keeps the pair it sent 409s against a conflict it caused
 * itself — a failure needing no concurrency at all, just an ordinary single-tab session, which is
 * what makes it worth pinning end to end rather than per statement.
 */
describe('C29 — a single session chaining tokens never conflicts with itself', () => {
  it('start → capture → capture → save all succeed, each adopting the returned token', async () => {
    const v = await makeVersion()

    const started = await recovery(v.id, '/start')
    expect(started.status).toBe(200)
    let token = ((await started.json()) as { token: { generation: number; revision: number } })
      .token
    expect(token).toMatchObject({ generation: 1, revision: 1 })

    for (const prose of ['first keystrokes', 'second keystrokes']) {
      const res = await recovery(v.id, '', 'POST', {
        generation: token.generation,
        expectedRevision: token.revision,
        document: formDoc(prose),
      })
      expect(res.status, `capture "${prose}" must not conflict with its own predecessor`).toBe(200)
      const next = await tokenOf(res)
      expect(next.revision, 'each write advances the revision by exactly one').toBe(
        token.revision + 1,
      )
      expect(next.generation, 'and never the generation').toBe(token.generation)
      token = next
    }

    // The save closes the chain with the token the LAST capture returned.
    const res = await saveAsNew(v.id, saveForm(v, 'C29-chained', token))
    expect(res.status, 'the save must not conflict with the chain that preceded it').toBe(200)
    const out = (await res.json()) as { recoveryToken?: RecoveryToken }
    // ⚑ BOTH counters, not just the revision. The rule governs them together, so a save returning a
    // correct revision beside a wrong generation would satisfy a revision-only assertion while
    // handing the client a token that fences it out of its own session.
    //
    // `toMatchObject`, not `toEqual`: `RecoveryToken` is a TRIPLE — it also carries `updatedAt`, a
    // server timestamp no test can predict. An earlier version asserted the whole object exactly and
    // failed on the one field it could never have supplied, while both counters were in fact correct.
    expect(
      out.recoveryToken,
      'retirement advances the revision by one and leaves the generation alone',
    ).toMatchObject({
      generation: token.generation,
      revision: token.revision + 1,
    })
    expect(
      Number.isNaN(Date.parse(String(out.recoveryToken?.updatedAt))),
      'and the token carries a usable timestamp',
    ).toBe(false)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the chain ends retired').not.toBeNull()
    expect(after?.content).toBeNull()
  })
})
