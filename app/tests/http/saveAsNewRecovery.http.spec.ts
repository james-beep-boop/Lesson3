/**
 * `save-as-new` × edit recovery, over the WIRE — matrix cases 7, 19 and 20 (design §7).
 *
 * These three cannot be kernel tests and the design says so explicitly: they are about the SAVE, and
 * say nothing unless they run through the real `endpoints/versionEdit.ts` transaction and its
 * semver-retry loop. The kernel half (retire inside a transaction, rolled back, capture intact) is
 * already proven in `tests/int/editRecoveryRetire.int.spec.ts`; what is proven HERE is that the
 * endpoint wires it correctly and that the retry loop treats the two conflict kinds differently.
 *
 *   C7   a token-bearing save retires the capture — content cleared, marker kept, revision advanced
 *   LEG  a save with NO token behaves exactly as before and retires nothing (the PR-1 contract)
 *   C19  a REAL database failure during retirement rolls the whole save back — no orphan version
 *   C20  a second tab's capture lands first ⇒ 409, NOT retried, and the newer capture survives
 *   DEL  with `deleteSource=true`, retirement happens BEFORE the cascade removes the row
 *
 * ⚑ **C19 uses a real failing statement, never a mocked throw.** A Postgres trigger is installed for
 * the duration of that one test and raises on the retirement UPDATE. The failure therefore originates
 * in the database, inside the endpoint's own transaction, exactly as a genuine fault would — which is
 * what the design demands, because a mocked throw proves only that the mock was called.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'
import { recoveryRow } from '../helpers/editRecovery.js'
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
  const t = ((await started.json()) as { token: { generation: number; revision: number } }).token

  const cap = await recovery(versionId, '', 'POST', {
    generation: t.generation,
    expectedRevision: t.revision,
    document: { lessons: [{ id: 'L1', title }] },
  })
  expect(cap.status, 'fixture: capture must succeed').toBe(200)
  return ((await cap.json()) as { token: { generation: number; revision: number } }).token
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
 * The trigger below is installed on `edit_recovery` and raises on the retirement UPDATE, so the
 * failure comes from Postgres inside the endpoint's own transaction. What must hold afterwards: the
 * new version does NOT exist (the whole save rolled back with it) and the capture is untouched.
 *
 * ⚑ **It is SCOPED to this test's own row via a `WHEN` clause**, and that is not tidiness. The first
 * version fired on every row in the table; with vitest running http files in parallel it faulted the
 * discard test in `recovery.http.spec.ts` from another worker, failing a spec it had no relationship
 * with — and only when the whole suite ran, never when either file ran alone. `fileParallelism` is
 * now off for this suite as well, so this scoping is the second of two independent fixes: a
 * database-wide RAISE trigger is a landmine to leave lying around whatever the runner does.
 */
describe('C19 — a real database failure during retirement rolls the whole save back', () => {
  /**
   * ⚑ ONE COMMAND PER `execute`, and the id inlined rather than bound.
   *
   * A bound `${id}` makes drizzle send this as a PREPARED statement, and Postgres rejects a prepared
   * statement carrying multiple commands — "cannot insert multiple commands into a prepared
   * statement". The unparameterised version worked only because it took the simple-query path, so
   * adding the `WHEN` clause broke it in a way that had nothing to do with the clause itself.
   * Splitting the DDL keeps each statement single-command; the id is validated and interpolated,
   * which is also what lets the `WHEN` clause exist at all.
   */
  const installTrigger = async (sourceVersionId: number) => {
    if (!Number.isSafeInteger(sourceVersionId)) throw new Error(`bad version id ${sourceVersionId}`)
    await db().execute(sql`
      CREATE OR REPLACE FUNCTION lesson3_test_block_retire() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'lesson3-test: simulated storage fault during retirement';
      END;
      $$ LANGUAGE plpgsql
    `)
    // Defensive: an interrupted earlier run would otherwise leave this behind and fail the CREATE.
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_test_block_retire_trg ON edit_recovery`)
    await db().execute(
      sql.raw(`
        CREATE TRIGGER lesson3_test_block_retire_trg
          BEFORE UPDATE ON edit_recovery
          FOR EACH ROW
          WHEN (NEW.source_version_id = ${sourceVersionId}
                AND NEW.retired_at IS NOT NULL AND OLD.retired_at IS NULL)
          EXECUTE FUNCTION lesson3_test_block_retire()
      `),
    )
  }

  const dropTrigger = async () => {
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_test_block_retire_trg ON edit_recovery`)
    await db().execute(sql`DROP FUNCTION IF EXISTS lesson3_test_block_retire()`)
  }

  afterAll(dropTrigger)

  it('leaves NO orphan version and an intact capture', async () => {
    const v = await makeVersion()
    const token = await seedCapture(v.id, 'work that must survive a failed save')
    const before = await rawRow(v.id)

    const versionsBefore = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })

    await installTrigger(v.id)
    let res: Response
    try {
      res = await saveAsNew(v.id, saveForm(v, 'C19-should-not-persist', token))
    } finally {
      await dropTrigger()
    }

    expect(res.status, 'the save fails rather than half-applying').toBeGreaterThanOrEqual(400)

    // ⚑ The assertion that matters: no orphan. The create ran BEFORE the retirement, so a missing
    // rollback would leave a version behind for a save that never completed.
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
 * ⚑ C20 — the conflict that must NEVER be retried.
 *
 * A second tab captures after this save's token was minted, advancing the revision, so the save's
 * retirement precondition fails.
 *
 * ⚑ **"Not retried" is asserted DIRECTLY, by counting retirement statements — not inferred from the
 * surviving row.** The first version of this test checked only the 409 and the intact capture, and
 * would have passed a loop that retried five times: the token is fixed at request time, so every
 * retry re-runs the SAME failing precondition and leaves the same evidence behind. The outcome
 * assertions cannot distinguish one attempt from five, and a test that cannot see the property it
 * names is not testing it.
 *
 * Counting needs two tricks, both forced by the situation:
 *   - a STATEMENT-level trigger, because a failed retirement matches ZERO rows and a row-level
 *     trigger would never fire for the case under test
 *   - a SEQUENCE as the counter, because the save's transaction rolls back and a counter table would
 *     roll back with it; `nextval` is explicitly non-transactional and survives
 */
describe('C20 — a second tab’s newer capture is never silently retired', () => {
  // One command per `execute` — see the note on C19's `installTrigger` for why multi-command DDL is
  // a trap here even when it happens to work today.
  const installCounter = async () => {
    await db().execute(sql`CREATE SEQUENCE IF NOT EXISTS lesson3_test_retire_calls`)
    await db().execute(sql`
      CREATE OR REPLACE FUNCTION lesson3_test_count_retire() RETURNS trigger AS $$
      BEGIN
        PERFORM nextval('lesson3_test_retire_calls');
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `)
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_test_count_retire_trg ON edit_recovery`)
    await db().execute(sql`
      CREATE TRIGGER lesson3_test_count_retire_trg
        AFTER UPDATE ON edit_recovery
        FOR EACH STATEMENT EXECUTE FUNCTION lesson3_test_count_retire()
    `)
  }

  const dropCounter = async () => {
    await db().execute(sql`DROP TRIGGER IF EXISTS lesson3_test_count_retire_trg ON edit_recovery`)
    await db().execute(sql`DROP FUNCTION IF EXISTS lesson3_test_count_retire()`)
    await db().execute(sql`DROP SEQUENCE IF EXISTS lesson3_test_retire_calls`)
  }

  const counter = async (): Promise<number> => {
    const rows = rowsOf<{ last_value: unknown; is_called: unknown }>(
      await db().execute(sql`SELECT last_value, is_called FROM lesson3_test_retire_calls`),
    )
    // A never-called sequence reports last_value 1 with is_called false; normalise both to a count.
    return rows[0]?.is_called ? Number(rows[0].last_value) : 0
  }

  afterAll(dropCounter)

  it('409s, retires nothing, and runs the retirement statement EXACTLY ONCE', async () => {
    const v = await makeVersion()
    const stale = await seedCapture(v.id, 'first tab')

    // The second tab types again — same user, same version, so the SAME row advances.
    const newer = await recovery(v.id, '', 'POST', {
      generation: stale.generation,
      expectedRevision: stale.revision,
      document: { lessons: [{ id: 'L1', title: 'SECOND TAB newer work' }] },
    })
    expect(newer.status, 'fixture: the second capture must land').toBe(200)
    const newerToken = ((await newer.json()) as { token: { revision: number } }).token

    const versionsBefore = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
      overrideAccess: true,
    })

    // Count only the statements this save issues — the trigger goes on after the fixture captures.
    await installCounter()
    let res: Response
    let attempts: number
    try {
      const before = await counter()
      // The save carries the STALE token the first tab minted.
      res = await saveAsNew(v.id, saveForm(v, 'C20-should-409', stale))
      attempts = (await counter()) - before
    } finally {
      await dropCounter()
    }

    expect(res.status, 'a recovery conflict is a 409').toBe(409)
    // ⚑ THE ASSERTION THIS TEST EXISTS FOR. A retrying loop would show 2..5 here while every other
    // assertion below stayed green.
    expect(
      attempts,
      'the retirement statement ran once — a recovery conflict is never retried',
    ).toBe(1)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the newer capture was NOT retired').toBeNull()
    expect(JSON.stringify(after?.content), 'and it still holds the newer prose').toContain(
      'SECOND TAB newer work',
    )
    expect(Number(after?.revision), 'nothing advanced it further').toBe(newerToken.revision)

    // The rollback also took the candidate version with it.
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
    // The editor must be the author for `deleteSource` to be permitted, so create through the API.
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
