# P144-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/tests/int/discussions3b.int.spec.ts`

**Partial assessment.** I read the supplied ranges `:1-400` and `:401-434` (the whole file, 434 lines). I did not read the helpers it imports, the handlers it drives, or the schema. Nothing below is checked against implementation behaviour.

**Not assessed:** `tests/helpers/fixtures.js`, `helpers/db.js`, `helpers/discussions.js`, `helpers/rowLocks.js`, `src/endpoints/discussionActions.ts`, `src/lib/discussions.ts`, `src/payload-types.ts`. The policy excerpts were read as context only; none of them states search matching, `fromSeq` rules, or lock order.

### Purpose and asserted invariants

The file is a real-database integration spec for discussion mark-read, pin, redaction, unread queries and title search. It asserts that:

- The read pointer never moves backwards, and a non-contiguous range writes nothing (`:177-188`).
- Reading never subscribes a user (`:190-198`).
- Pin waits for and preserves a concurrent reply or redaction, and the `(topic, seq)` sequence stays contiguous (`:252-296`).
- A redaction is single-shot per field (409 on repeat), and the topic update path stays closed to content changes (`:300-352`).
- The admin-redaction vs. account-deletion path does not deadlock (`:362-381`).
- Title search treats `%`, `_` and `\` literally and excludes redacted titles (`:401-433`).
- The forum-off gate applies to each endpoint (`:160-167`, `:216-222`, `:241-245`, `:328-333`, `:428-432`).

### Candidates

**None confirmed.** Within the supplied text I found no concrete mismatch between the spec's stated expectations and a product defect. Every failure mode I could construct depends on handler or helper behaviour I did not read.

### Uncertain leads (test-side, low severity)

1. **`:370-379` redaction status not asserted.** Both promises are checked only for `fulfilled`, which accepts any HTTP status. The body check at `:379` partly covers this.
2. **`:155` mark-read status not asserted.** A non-200 response would only surface through the later `lastReadSeq` check.
3. **`:312` assumes the default opening body is `'Opening post'`.** This depends on `createTopicAs`, which I did not read. A different default would fail the test without any product defect.
4. **`:396-398` encodes prefix matching (`'fract'` matches `Fractions`).** The test title says "matches every word in any order" and does not mention prefixes. Whether prefix matching is intended policy is unresolved, because the policy excerpts do not cover search.
5. **`:114-128`, `:177-188`, `:200-207` depend on the `fromSeq` rule.** The expectations imply a rule such as `fromSeq ≤ lastRead + 1`, while `:184` implies `fromSeq` must not skip. Neither rule is stated in the supplied material, and the handler is unread, so I cannot confirm which one applies.
6. **`:263` vs `:288-289` type handling.** `:263` compares `topic.lastSeq` directly to the number `2`, while `:288` wraps the same field in `Number()`. If the field is a string at runtime, `:263` fails. This is a type-consistency question, not a confirmed defect.
7. **`:362-381` lock ordering.** The test's comment states the intended order (admin user row before post). I could not verify that the implementation takes locks in that order.

### Unresolved questions

- What is the authoritative rule for `fromSeq` acceptance and for whether the opening post occupies a seq?
- Is prefix matching the intended title-search policy?
- Does `createTopicAs` default the body to `'Opening post'`?
- Do the `discussionActions` handlers take the locks in the order the deadlock test documents?

Answering these needs `src/endpoints/discussionActions.ts`, `src/lib/discussions.ts` and `tests/helpers/`. Security and integrity claims in this file remain unreviewed until independent review.
