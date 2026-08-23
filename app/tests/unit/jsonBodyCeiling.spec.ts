/**
 * The shared JSON body ceiling — `readJsonBody` (`src/endpoints/respond.ts`) and the rule that every
 * endpoint reading a body goes through it.
 *
 * WHY THIS FILE EXISTS. "No request may make the process allocate an unbounded body" was opt-in:
 * an author had to know to call `assertDeclaredBodyWithin` before `req.json()`. Two endpoints did
 * not — `emailVersion` (a body read after only the rate bucket) and `userAssignments` (a body read
 * before ANY authorization beyond "signed in", and with no rate bucket at all). Both were live for a
 * year and survived an audit. `markMessagesRead.ts` even carried a hand-written survey of which
 * siblings were guarded, and that survey was WRONG on the day it was written — which is the whole
 * argument for a structural guard over a documented one (`docs/NEXT-SESSION.md`).
 *
 * ⚑ THE LOAD-BEARING ASSERTION IS THAT THE BODY IS NEVER READ, not that a 413 comes back. A 413
 * returned after `req.json()` had already materialised the payload costs exactly the memory the
 * guard exists to refuse, while looking correct from the outside. Every ceiling case below asserts
 * the reader was not called.
 *
 * ⚑ WHAT NONE OF THIS PROVES: this bounds the DECLARED `Content-Length`. A request that omits the
 * header, sends a chunked body, or simply lies reaches the parse untouched. That boundary belongs to
 * the reverse proxy (`docs/OPS.md`), and `recoveryParse.ts`'s constant carries the full caveat. Do
 * not read a green run here as a memory bound.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import ts from 'typescript'

import { MAX_CONTROL_BODY_BYTES, readJsonBody } from '../../src/endpoints/respond.js'
import { MAX_MARK_READ_BODY_BYTES, readMarkReadIds } from '../../src/endpoints/markMessagesRead.js'
import { readEmailRecipient } from '../../src/endpoints/emailVersion.js'
import { readAssignmentBody } from '../../src/endpoints/userAssignments.js'
import { bodylessReq, jsonReq, statusOf } from '../helpers/fakeReq.js'

describe('readJsonBody — the ceiling', () => {
  it('413s when Content-Length exceeds the cap, WITHOUT reading the body', async () => {
    let read = false
    const req = jsonReq(async () => {
      read = true
      return {}
    }, 1025)

    expect(await statusOf(() => readJsonBody(req, 1024))).toBe(413)
    expect(read, 'the body must never be read once the header disqualifies it').toBe(false)
  })

  it('allows a body exactly AT the cap', async () => {
    await expect(
      readJsonBody(
        jsonReq(async () => ({ a: 1 }), 1024),
        1024,
      ),
    ).resolves.toEqual({ a: 1 })
  })

  it('parses when the header is absent — declaring a length is not a requirement', async () => {
    await expect(
      readJsonBody(
        jsonReq(async () => ({ a: 1 })),
        1024,
      ),
    ).resolves.toEqual({ a: 1 })
  })

  it('carries the caller’s message on the 413', async () => {
    await expect(
      readJsonBody(
        jsonReq(async () => ({}), 99),
        1,
        'Upload too large',
      ),
    ).rejects.toThrow('Upload too large')
  })
})

describe('readJsonBody — an unreadable body is null, never a throw', () => {
  it('is null when the parse rejects', async () => {
    await expect(
      readJsonBody(
        jsonReq(async () => {
          throw new Error('malformed JSON')
        }),
        1024,
      ),
    ).resolves.toBeNull()
  })

  /**
   * ⚑ THE HOLE IN THE THREE HAND-ROLLED COPIES THIS REPLACES. They all wrote
   * `req.json().catch(() => null)`, which handles a REJECTED promise and nothing else — a `json()`
   * that throws synchronously escapes it and 500s the endpoint. `try`/`catch` covers both, and this
   * case is why the helper does not simply inline the old expression.
   */
  it('is null when the parse throws SYNCHRONOUSLY', async () => {
    const req = jsonReq((): never => {
      throw new Error('sync boom')
    })
    await expect(readJsonBody(req, 1024)).resolves.toBeNull()
  })

  it('is null when the request has no json() at all', async () => {
    await expect(readJsonBody(bodylessReq(), 1024)).resolves.toBeNull()
  })

  it('is null for a body of literal null, so `body?.field` stays safe', async () => {
    await expect(
      readJsonBody(
        jsonReq(async () => null),
        1024,
      ),
    ).resolves.toBeNull()
  })
})

/**
 * Every endpoint body reader, asserted through its own entry point rather than through the helper.
 *
 * The point is the WIRING: a reader that stopped calling `readJsonBody` — or called it after the
 * parse — passes the helper's own tests and fails here. `readMarkReadIds` is covered in more depth
 * by `markReadBody.spec.ts`; it is repeated in this table because a table with a hole in it is how
 * the missing guards survived the last audit.
 */
describe('every endpoint body reader refuses an oversized body before reading it', () => {
  const READERS: [string, (req: never) => Promise<unknown>, number][] = [
    ['readMarkReadIds', readMarkReadIds, MAX_MARK_READ_BODY_BYTES],
    ['readEmailRecipient', readEmailRecipient, MAX_CONTROL_BODY_BYTES],
    ['readAssignmentBody', readAssignmentBody, MAX_CONTROL_BODY_BYTES],
  ]

  it.each(READERS)('%s 413s without reading', async (_name, read, cap) => {
    let touched = false
    const req = jsonReq(async () => {
      touched = true
      return {}
    }, cap + 1)

    expect(await statusOf(() => read(req))).toBe(413)
    expect(touched, 'the body must never be read once the header disqualifies it').toBe(false)
  })

  it.each(READERS)('%s accepts a body exactly AT its cap', async (_name, read, cap) => {
    let touched = false
    const req = jsonReq(async () => {
      touched = true
      return {}
    }, cap)

    // The value is each reader's own business (a 400 for a missing field is a perfectly good
    // outcome); what this asserts is that the ceiling did not fire, so the body WAS reached.
    await statusOf(() => read(req))
    expect(touched, 'a body at the cap must be read, not refused').toBe(true)
  })
})

/**
 * The extracted readers still answer as their endpoints did — the guard was added around the
 * existing validation, not in place of it.
 */
describe('the extracted readers keep their 400s', () => {
  it('readEmailRecipient rejects a missing or malformed recipient', async () => {
    expect(await statusOf(() => readEmailRecipient(jsonReq(async () => ({}))))).toBe(400)
    expect(
      await statusOf(() => readEmailRecipient(jsonReq(async () => ({ to: 'a@b.test\nBcc: c@d' })))),
    ).toBe(400)
  })

  it('readEmailRecipient returns the parsed address', async () => {
    await expect(
      readEmailRecipient(jsonReq(async () => ({ to: 'teacher@school.test' }))),
    ).resolves.toBe('teacher@school.test')
  })

  it('readAssignmentBody rejects a missing subjectGradeId, then a missing consent token', async () => {
    expect(await statusOf(() => readAssignmentBody(jsonReq(async () => ({}))))).toBe(400)
    expect(
      await statusOf(() => readAssignmentBody(jsonReq(async () => ({ subjectGradeId: 7 })))),
    ).toBe(400)
  })

  it('readAssignmentBody returns both fields when both are well formed', async () => {
    const at = '2026-08-15T10:00:00.000Z'
    await expect(
      readAssignmentBody(jsonReq(async () => ({ subjectGradeId: '7', expectedUpdatedAt: at }))),
    ).resolves.toEqual({ subjectGradeId: 7, expectedUpdatedAt: at })
  })
})

/**
 * ⚑ THE DRIFT GUARD — the only assertion here that constrains code not yet written.
 *
 * Everything above proves today's readers are guarded. It does nothing about the endpoint someone
 * adds next quarter, which is precisely how `emailVersion` and `userAssignments` came to be
 * unguarded: the rule lived in reviewers' heads and in a docblock survey that was already wrong.
 *
 * The rule enforced: inside `src/endpoints`, a member call named `json()` — i.e. a raw body read —
 * may appear only in the files below, each of which must itself call `assertDeclaredBodyWithin`.
 * Everyone else goes through `readJsonBody`, where the ceiling is not optional.
 *
 * AST rather than a regex, per `envTemplateParity.spec.ts`, whose header records three successive
 * regex versions each shipping a bypass. Parse only — no type checker — so it stays fast and DB-free.
 *
 * ⚑ STATED HONESTLY: this is a SYNTACTIC rule and sees only a direct `something.json()`. A request
 * aliased into another variable, destructured (`const { json } = req`), or handed to a helper outside
 * this directory is beyond its reach. It raises the floor for the ordinary case; it is not a proof.
 */
describe('no endpoint reads a body outside the guarded readers', () => {
  const ENDPOINTS_DIR = new URL('../../src/endpoints/', import.meta.url).pathname

  /**
   * `respond.ts` IS the guarded reader. The other two are the strict readers, which throw
   * `400 Invalid JSON body` rather than returning null and so keep their own `req.json()`; both are
   * already guarded, which the last case in this block asserts rather than assumes.
   */
  const ALLOWED = ['respond.ts', 'recoveryParse.ts', 'forgotPassword.ts']

  const parse = (file: string) =>
    ts.createSourceFile(
      file,
      readFileSync(join(ENDPOINTS_DIR, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )

  /** Every function called in the file, by the name at the call site (`f()` and `x.f()` alike). */
  const callsIn = (src: ts.SourceFile): string[] => {
    const found: string[] = []
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        if (ts.isPropertyAccessExpression(callee)) found.push(callee.name.text)
        else if (ts.isIdentifier(callee)) found.push(callee.text)
      }
      ts.forEachChild(node, walk)
    }
    walk(src)
    return found
  }

  /**
   * Object names whose `.json()` writes a response instead of reading a request. Kept as an explicit
   * list rather than a capitalisation heuristic: a new builder makes this file go red ONCE, visibly,
   * which is the right direction for a guard to fail in.
   */
  const RESPONSE_BUILDERS = ['Response', 'NextResponse']

  /**
   * Raw body reads: a MEMBER call named `json` — `req.json()`, `req.json?.()`, `req?.json()` — on
   * anything that is not a response builder.
   *
   * Two distinctions are load-bearing, and both were found by this test failing rather than by
   * reasoning:
   *   - member vs identifier: `json(...)` imported from `respond.ts` is how nearly every handler here
   *     returns its response, so matching the bare name would flag all of them;
   *   - the builder exclusion: `Response.json(...)` is a static that SENDS, and `uploadBundles.ts`
   *     uses it twice.
   *
   * Deliberately broad otherwise. Any other `x.json()` is reported, even if `x` turns out not to be a
   * request — a false positive costs one line on this list, a false negative costs an unbounded read.
   */
  const rawBodyReadsIn = (src: ts.SourceFile): string[] => {
    const found: string[] = []
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = ts.isNonNullExpression(node.expression)
          ? node.expression.expression
          : node.expression
        if (
          (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
          nameOfAccess(callee) === 'json' &&
          !(
            ts.isIdentifier(callee.expression) && RESPONSE_BUILDERS.includes(callee.expression.text)
          )
        ) {
          found.push(callee.getText())
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(src)
    return found
  }

  const nameOfAccess = (node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string =>
    ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : ''

  const FILES = readdirSync(ENDPOINTS_DIR).filter((f) => f.endsWith('.ts'))

  it('finds the endpoint sources at all', () => {
    // Guards the guard: a moved directory would otherwise make every case below vacuously pass.
    expect(FILES.length).toBeGreaterThan(10)
    expect(FILES).toEqual(expect.arrayContaining(ALLOWED))
  })

  it.each(FILES.filter((f) => !ALLOWED.includes(f)))('%s does not call json() directly', (file) => {
    expect(
      rawBodyReadsIn(parse(file)),
      `${file} reads a raw body — use readJsonBody(req, max) so the ceiling is not optional`,
    ).toEqual([])
  })

  it.each(ALLOWED.filter((f) => f !== 'respond.ts'))(
    '%s is allowed its own read only because it guards it',
    (file) => {
      expect(
        callsIn(parse(file)),
        `${file} is on the raw-read allowlist and must call assertDeclaredBodyWithin`,
      ).toContain('assertDeclaredBodyWithin')
    },
  )
})
