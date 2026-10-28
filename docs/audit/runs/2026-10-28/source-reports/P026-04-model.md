# P026-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

**Scope (read from the supplied text only; no tools run)**
- `app/src/hooks/lessonPlan.ts:1-400` and `:401-517`: fully read.
- `app/src/hooks/loginPasswordWork.ts:1-53`: fully read.
- Not assessed: imported modules (`../access`, `publicLibrary`, `publicSlug` helpers, `prewarmVersionArtifacts`, `relId`, bundle-version hooks), the slug index definition, Payload internals (`findByID`, login), and all callers. Policy excerpts were treated as context only.

**Purpose and invariants (summary)**
The lesson-plan hooks make the subject-grade immutable after create; require the Official pointer to exist and to belong to the plan and subject-grade; enforce publication slug rules (published means slugged, frozen once published, well-formed, unique via probe plus index); cascade-delete versions; and prewarm artifacts and re-point follower favorites on Official moves. The login hook equalises PBKDF2 work for existing and absent accounts and clears legacy lockout fields.

**Candidates**

1. **Private-path slug write skips the uniqueness probe and normalisation.** Confirmed local reasoning; medium.
   - `lessonPlan.ts:254-256, 274-277`.
   - Precondition: plan is `private` and the submitted slug equals one held by another plan.
   - Expected: a field-scoped slug error, or a unique slug (invariant 3; the publish path probes at `:306`).
   - Actual: line 276 assigns the value verbatim, so the write fails as a raw unique-index error (the index is the authority per `:229`).
   - Whitespace-only input: `nextSlug` becomes `''`, so line 276 never runs and `data.publicSlug` keeps the raw `"   "`. Expected a normalised empty value; actual raw whitespace, which can also collide between two private plans.
   - Repro: two private plans; set B's slug to A's → expect a slug error. Set a private plan's slug to `"   "` → expect empty/null stored.

2. **Derived-slug scan never tests the base slug.** Lead, depends on unread `suffixedPublicSlug`; medium.
   - `lessonPlan.ts:359-361, 374`; the comment at `:346-347` says the base is checked.
   - Precondition: `suffixedPublicSlug(base, 1)` returns `base-2`, which the `i + 1` mapping suggests.
   - Expected: a free `base` is chosen.
   - Actual: candidates start at suffix 2, so a free base is never tested. The only place `base` is returned is the `?? base` fallback at `:374`.
   - Repro: title "Fractions", no collisions → expect `fractions`; actual `fractions-2` if the lead holds.

3. **Follower re-point is documented as best-effort but rethrows.** Confirmed local contradiction; intent unresolved; low.
   - Docblock `:434-435` says a favorites hiccup "must never fail a promotion". The catch at `:495-513` rethrows every non-`NotFound` error, failing `make-official`.
   - The inner comment (`:495-505`) says this is deliberate. Either the docblock is stale or the contract needs deciding.

4. **Nonexistent Official id may bypass the field-scoped message.** Lead; low.
   - `:181-188` vs `:159-162`.
   - Precondition: numeric `officialVersion` naming no existing version.
   - Expected: "Official version must reference a saved lesson-plan version."
   - Actual: `findByID` has no `disableErrors`; if Payload throws `NotFound` (unverified), the caller gets a non-field error.

5. **System create skips plan-ownership check.** Lead; low.
   - `:190-194`: `planId` is undefined on create, so the ownership check is skipped.
   - Precondition: a no-`req.user` create carrying another plan's version id.
   - Actual: only the subject-grade check at `:196-200` runs. The comment at `:112-117` assumes system paths never do this; nothing here enforces it.

6. **Whitespace-only password skips equalisation.** Lead; low.
   - `loginPasswordWork.ts:21-22`.
   - Precondition: Payload proceeds to verification for a whitespace-only password.
   - Expected: no existence-dependent timing (the hook's stated goal, lines 6-8).
   - Actual: no dummy work runs, so an existing account's real verification is measurably slower than an absent one. This holds only if Payload does not reject blanks first, which is unverified.

**Unresolved questions**
- Does `suffixedPublicSlug(base, 1)` return `base` or `base-2`?
- Is the slug index unique across all rows, including private, null and `''` values?
- Does `findByID` throw `NotFound` by default here?
- Does Payload reject blank passwords before verification?
- What is the intended failure contract for follower re-pointing?
- Can a published plan's stored slug ever be non-normalised? If so, a title edit would reach `:306` and silently rewrite a frozen slug.

No tests were run. All items are read-only leads except #1 and #3's contradiction, which follow from the supplied text.
