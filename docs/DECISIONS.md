# Decisions & Lessons

Durable, team-visible record of decisions made during the build and lessons learned
from corrections. Committed to git (unlike the assistant's private cross-session memory).

- **SPEC.md** remains canonical for *architecture and domain rules*. This file is for
  build-time decisions and corrections that don't rise to the level of spec changes.
- **Newest entries on top.** Each entry: date, one-line title, then the decision/lesson
  and the reasoning. When a correction teaches a general rule, capture the rule, not just
  the incident.

---

## 2026-06-08 — Resources deferred (recommender out of scope); audience-driven priority note

**Decision (firm):** the ARES **Resource column is not populated** for the foreseeable future,
and the **Python recommender is not integrated at all** — not live *and not at ingest*. This
formalises the Phase-0 omission of `aresResources.js`. It is **within SPEC**, not a spec change:
§3/§4/§5/§7 already mark resources **optional and "undetermined… may be omitted entirely,"** and
the recommender path was always conditional ("if the column is enabled"). We are exercising the
already-specified "off" branch.

**What we keep (the future seam):** the optional `framework[].resources` field in
`LessonBundles.ts` stays. Removing it would be the one move that forecloses the future; keeping
it costs nothing (it already tolerates empty).

**Why (three distinct audiences, user-provided):**
- **A — schools with their own ARES server** (~10–60): links resolve to local content; genuinely useful.
- **B — schools using the online ARES demo** (hundreds): links useful if online.
- **C — little/intermittent internet** (thousands — the **largest** group): links are useless.

So links add value only for a minority, while the majority is best served by a self-contained
lesson-plan document (high-fidelity DOCX/PDF, no live links). This **aligns with** the existing
SPEC non-goal "not an offline content-distribution platform (Kolibri/RACHEL serve that need)."

**Future sourcing (no live recommender):** resources do **not** live in the ARES data files —
upstream they exist only in the *rendered* DOCX (computed at build time from `aresKeywords`). So
if links are wanted later, the path is to **extract them from the ARES-produced documents** and
attach to `framework[].resources` — or, if the ARES team later embeds resources in the data
files, ingest simply carries them through. Either way, the same optional field absorbs it.

**Fidelity impact:** none. We already diff "everything-except-resources." The approved DOCX still
contain the column, so we keep excluding it; only a *structural* removal of the column would force
new baselines, and we are not doing that (that's the generator/format owner's call, not a fork).

**Flagged for a later deliberate SPEC pass (NOT changed now):** SPEC line 25 calls offline a
**"secondary goal."** The audience sizing above suggests the *exported documents* standing alone
offline is actually the majority case (distinct from running the *app* on an offline box, which
remains secondary infra). Before editing SPEC, firm up the audience numbers and think through the
downstream nudge toward **print/PDF/offline fidelity over interactive links**. Captured here as an
open question rather than a reactive spec edit.

---

## 2026-06-08 — Generator embedding (Phase 0): vendor pristine, omit Python, mirror the SHA

Starting the bio_1_4 end-to-end fidelity proof (NEXT-SESSION.md). Phase 0 vendors the ARES
Node generator into Lesson3. Decisions (all confirmed with the user at plan time):

- **Vendor pristine, not submodule/npm-dep.** The source lives on an **unmerged `claude/*`
  bot branch** (`markknit/cbe-generation-system@212da91…`), which can be rebased/force-pushed/
  deleted on merge — so any approach that points *live* at that ref (submodule SHA, npm
  git-ref) is fragile, and submodules add friction to the Rock's bind-mount Docker flow.
  **Decision:** copy the three lib files **byte-verbatim** into `app/src/generator/vendor/lib/`
  and never edit them; all integration lives in `app/src/generator/` (ours). Provenance +
  exact SHA in `vendor/PROVENANCE.md` and `docs/EXTERNAL-DEPENDENCIES.md`; one-command re-sync
  via `scripts/vendor-generator.sh`. **Pinned at `529be40`** (branch tip). *Process note:* the
  SHA was first taken as `212da91` from a **stale local fork**; the real tip was four commits
  ahead (`529be40`). Re-pinned after verifying the four intervening commits touched only
  docs/content/output DOCX — the three vendored lib files are **byte-identical** at both
  commits and the fidelity gate still passes. **Lesson:** `git fetch` before resolving a pin;
  don't trust a local clone's `origin`. **Rule:** because a generator change *also* ripples into
  our schema/adapter/approved-DOCX, an upgrade is never a silent SHA bump — the **fidelity
  regression is the acceptance gate** for adopting any new version. Vendoring makes that change
  visible and tested; a submodule's transparent bump would hide it.
- **Buffers need ZERO generator modification.** `build_docs.js` exports the three builders
  (`buildSoW`/`buildFinalExplanation`/`buildSummaryTable`), each returning a `docx` `Document`.
  Our wrapper calls them + `Packer.toBuffer()`. The NEXT-SESSION assumption that we'd "refactor
  `run()` to return Buffers" was unnecessary — `run()` stays untouched (disk-write parity only).
  This is what makes pristine vendoring cheap: no local patches to carry across upstream changes.
- **`aresResources.js` intentionally NOT vendored (deviation from NEXT-SESSION, rule-driven).**
  It `execSync`s `python3` against a SQLite DB for the Section-C Resource column. Single-runtime
  / "never invoke the Python recommender live" (SPEC §0) forbids that. `sections.js` already
  `try`-requires `../aresResources` and falls back to no-ops when absent — so **omitting the
  file** exercises that documented fallback, guaranteeing zero Python and a deterministic
  (empty) Resource column. The fidelity diff excludes the Resource column anyway.
- **CJS-in-ESM boundary.** The vendored files are CommonJS; the app is `"type":"module"`.
  Added `vendor/package.json` = `{"type":"commonjs"}` so Node parses them correctly without
  editing them; Lesson3 imports the builders from ESM via `createRequire`. (Smoke-tested: a
  builder produces a valid PK-zip docx Buffer.)
- **Pinned `docx@9.6.1` exact** (the version the generator was authored against) + **`mammoth@1.12.0`**
  (devDep, for DOCX→text diffing) in `app/package.json`.
- **Mirror tag pushed:** `lesson3-vendor-212da91` on `james-beep-boop/cbe-generation-system`,
  insurance against the upstream bot branch disappearing.
- **Export gate (confirmed, ties to the deferred Codex finding below):** generation is
  restricted to **published/official** (validated) versions; drafts are never exported.

---

## 2026-06-08 — External review (Codex) on versioning: read boundary + secure-by-default

Codex reviewed the deployed versioning work. Four findings; two acted on now (deployed,
`verify-rbac.ts` **36/36**), two recorded for the relevant upcoming phase.

- **[FIXED — security] Teacher read boundary.** `lessonBundleRead` was `Boolean(user)`, so
  with drafts enabled any authenticated Teacher could pull unpublished work via `?draft=true`
  and enumerate history via the versions endpoint. Not exploitable yet (only the Site Admin
  exists) but live the moment Teacher accounts do. **Decision (locked):** Teachers read only
  **published/official** bundles; **Editors/Subject Admins** additionally read any-status
  bundles (incl. drafts) **within their subject-grades**; Site Admins all. Implemented as a
  query-returning `read` plus a mirrored **`readVersions`** (`version._status` /
  `version.subjectGrade` paths — verified working against the live DB) so the version-history
  endpoint can't leak drafts. `verify-rbac.ts` covers teacher-sees-published,
  teacher-blocked-from-draft (list + by-id + versions), editor-sees-own-SG-draft.
- **[FIXED — secure-by-default] Top-level whitelist gap.** The hook's claim that "a new
  admin/system field is protected automatically" held for *array subfields* (overlayRows
  rebuilds each row from the original) but **not for top-level fields** — the Editor branch
  only restored enumerated keys (`title`/`subjectGrade`/`meta`/`unit`/`_status`), so a future
  top-level field added without access/hook handling would pass through an Editor update.
  **Fix:** invert to a true allow-list — restore EVERY top-level key from the original except
  the content containers (`lessons`/`finalExplanation`/`summaryTable`), the hook-set version
  fields (`semver`/`bumpType`/`lockVersion`), and Payload's `updatedAt`. New top-level fields
  are now protected by default. **Rule:** "secure by default" means *restore-all-except-known*,
  never *restore-known*; the latter silently rots as the schema grows.
- **[DEFERRED — export phase, SPEC §6/§9] Draft validity vs bulletproof export.** Enabling
  drafts relaxed DB `NOT NULL` and `draft:true` skips required validation, so an invalid draft
  snapshot can exist. SPEC says "any version regenerates on demand" — so **generation/export
  must validate the exact snapshot first, and/or only official/validated versions are
  exportable.** Honor this when the generator integration lands; not a bug today.
- **[DEFERRED — low] CodeRabbit migration notes.** `numeric` for integer-ish columns is the
  db-postgres default for `number` fields (style, not a bug); the down-migration `SET NOT NULL`
  only fails if you roll back after creating null-bearing drafts. Both downgraded; no action.

## 2026-06-08 — Versioning DEPLOYED + hard-won Payload/Docker lessons

Bundle versioning is merged and **deployed on the Rock** (migration
`20260608_224715_bundle_versioning` applied; `verify-rbac.ts` **30/30** against the live DB).
Getting there surfaced several non-obvious traps — recorded so the next schema change and the
public-production host don't re-hit them:

- **Regenerate `payload-types.ts` BEFORE building, after any schema change.** `next build`
  type-checks the whole tree; the generated `LessonBundle` type won't know new fields
  (`semver`/`bumpType`/`lockVersion`/`_status`) until regenerated, so the build fails on
  `verify-rbac.ts` (and would fail on the hook/collection too). It can't be regenerated
  locally here (no `node_modules`), so it's done on the Rock via the **deps image with the
  source bind-mounted** (anon volume preserves the image's node_modules):
  `docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app lesson3-deps npx payload generate:types`.
- **`migrate:create` needs a bind mount AND the compose network.** `docker compose run --rm
  migrate npx payload migrate:create` writes the migration file *inside* the ephemeral
  container (the builder stage `COPY . .`'d the source; there's no volume) — `--rm` then
  deletes it. Run it via the deps image with `-v /srv/lesson3/app:/app` (so the file lands on
  the host) **and** `--network lesson3_default --env-file .env` (migrate:create connects to
  Postgres to diff the schema). The exact workflow is in `docs/NEXT-SESSION.md`.
- **Publishing is `_status: 'published'` in *data*, not the `draft` op param.** Verified in
  installed source (`collections/operations/create.js`/`update*.js`): `draft: true` only forces
  draft status + skips required-field validation; the persisted `_status` otherwise comes from
  `data._status` (default `'draft'`). So **marking official = passing `_status: 'published'`**;
  `draft: false` alone does nothing. Publishing also **enforces required fields**, so a publish
  update must carry a valid doc (e.g. `framework[].phase`). The whitelist hook *preserves*
  `_status` for Editors, which both blocks an Editor from publishing a draft AND stops an
  Editor's edit from accidentally unpublishing an official bundle — both now covered by
  `verify-rbac.ts`.
- **`lockDocuments: true` is not a valid literal** (the option type is `false | { duration }`);
  document locking is **on by default** in Payload 3, so we leave it unset. An explicit `true`
  breaks the build type-check.
- **Test hygiene:** the versioning checks initially reused the suite's already-mutated bundle
  (semver long past its initial value) — they now create a **fresh** bundle. General rule:
  exact-value assertions need a fixture untouched by earlier steps.
- **`enforceBundleStructure` now treats `!req.user` as trusted** (system / `overrideAccess`),
  bypassing the Editor whitelist — so ingest/migrations can set all fields and publish.
  Unauthenticated updates are already denied at collection access, so this only frees genuine
  system calls. Matches the `guardPasswordChange` `!actor` convention.

## 2026-06-08 — Bundle versioning: implementation decisions (SPEC §6)

Implemented `versions: { drafts: true, maxPerDoc: 100 }` on `lesson-bundles` plus three
sidebar fields (`semver`, `bumpType`, `lockVersion`) and versioning logic in
`enforceBundleStructure`. Key decisions:

- **Payload drafts as the "official version" mechanism.** Payload's single published
  document per collection naturally enforces "≤1 official version per bundle" (SPEC §6).
  Publishing (`_status: 'published'`) = marking official. The whitelist hook preserves
  `_status` for Editors (`d._status = orig._status ?? 'draft'`), so only Subject Admins
  can publish.
- **bumpType is Editor-accessible.** SPEC §6 says "user may choose patch/minor/major" without
  restricting who. The `bumpType` field passes through the whitelist for all users; Editors
  can signal a minor/major bump when their change warrants it. The hook consumes and resets
  it to `'patch'` after every save.
- **Versioning logic runs before the admin early-return.** The semver bump and lockVersion
  increment are in the outer scope of `enforceBundleStructure` (before `if (isSubjectAdminFor)
  return data`), so all users get version stamps on every save. Subject Admins also get the
  whitelist bypassed (correct).
- **Restore interaction.** Version restore in Payload calls `update` with the old version's
  data, which goes through `enforceBundleStructure`. For Editors: the whitelist applies —
  only prose fields from the restored version are written; admin fields are preserved from
  the current document. For Subject Admins: the full restored data is written. The semver
  always bumps on restore (treated as a write), which is correct.
- **Optimistic concurrency: `lockVersion` counter + Payload's `lockDocuments`.** True
  server-side OCC (reject-if-stale) can't safely distinguish a restore (submitted old
  `lockVersion`) from a concurrent edit without Payload exposing a restore context flag.
  Implemented: `lockVersion` increments on every save (clients can use it to detect races);
  Payload 3 **document locking is on by default** (guards concurrent admin-UI edits) — note
  there is no `lockDocuments: true` literal (the option type is `false | { duration }`), so we
  leave it at the default rather than setting it explicitly. Server-side reject-if-stale can
  be added when building custom API endpoints — at that point callers can pass
  `_expectedLockVersion` and the hook can enforce it.

---

## 2026-06-08 — Admin login loop on Safari: serverURL forces strict CSRF

After a Rock reboot, browser login looped (enter password → flicker → back to login),
specifically on **Safari**. Diagnosed against the running stack (not guessed): app healthy,
account not locked, password valid, and **header auth (`Authorization: JWT`) worked while
cookie auth failed** — login POST set the cookie but the follow-up GET wasn't authenticated.

Root cause in installed source (`auth/extractJWT.js` + `config/sanitize.js`): setting
**`serverURL`** makes sanitize **push it onto `config.csrf`** (`if (serverURL !== '')`), and a
non-empty `csrf` makes Payload honor a cookie token on a request with **no `Origin`** only if
it carries `Sec-Fetch-Site: same-origin|same-site|none`. Browsers omit `Origin` on same-origin
GETs; **older Safari also omits `Sec-Fetch-Site`** → the admin's auth-check GET is rejected →
bounce to login. (Reproduced exactly: cookie + correct `Origin` ✓; cookie + no `Origin`/no
`Sec-Fetch-Site` ✗; cookie + `Sec-Fetch-Site: same-origin` ✓.)

**Fix:** default `serverURL` to `''` (empty → NOT pushed to csrf → cookie auth honored for all
browsers; CSRF still covered by the `SameSite=Lax` cookie, which blocks cross-site
POST/subrequests). The password-reset email base moved to a separate **`ADMIN_URL`** env via a
custom `forgotPassword.generateEmailHTML` (serverURL is no longer available for it). Env-driven:
a public **HTTPS** host may set `SERVER_URL` to opt into strict CSRF (modern browsers over HTTPS
send `Sec-Fetch-Site`, so they're fine). **Rule:** don't set `serverURL` on a plain-HTTP/internal
host that older browsers hit — it silently breaks their cookie login; use `ADMIN_URL` for email
links instead. Gotcha: `serverURL` must be the empty string, not `undefined` (undefined is still
pushed to csrf).

**Session policy (same session):** set `auth.tokenExpiration: 900` (15-min inactivity window).
With `admin.autoRefresh` off (Payload default), the admin shows a "Stay logged in?" prompt ~1 min
before expiry and **force-logs-out an unattended session at expiry even with the tab open** —
addressing the shared-device "someone sits down later" concern (cookie persistence alone wouldn't).
Avoided very short windows (e.g. 1 min): the prompt fires at `expiry − min(60s, lifetime/2)`, so a
1-min window nags every ~30s and logs you out on any brief pause, risking lost unsaved edits.
"Log Out" is always immediate. Note Payload has **no native session-cookie / "clear on tab/browser
close"** option (cookie carries `Expires` = tokenExpiration, and tabs aren't cookie-scoped), so the
inactivity window is the supported lever. Tune `tokenExpiration` (`app/src/collections/Users.ts`) if
15 min proves tight for real editing.

## 2026-06-08 — Bundle field protection: blacklist → whitelist (secure by default)

Follow-up to the audit below. The first fix made `enforceBundleStructure` restore an
*enumerated* list of admin-only fields from the original (a **blacklist**). That is
insecure-by-default: a new admin-only field added inside an editable array that someone
forgets to add to the hook would be silently Editor-editable. **Inverted to a WHITELIST**
(commit `2059156`, deployed, `verify-rbac.ts` **19/19** against the deployed image): for a
non-admin Editor the hook writes the *original* document with only the Editor-editable
**prose** fields overlaid from the submission. Everything else is preserved.

- **Why this is the right default:** forgetting to whitelist a field can only make it
  non-editable by Editors (a visible annoyance, caught in use) — never silently editable
  (a security hole). New admin/system fields are protected automatically.
- **Standing rules for anyone adding bundle fields (see the LessonBundles docstring):**
  1. A new field is **admin-only by default**. To make it Editor-editable, add it to the
     matching prose-whitelist constant in `hooks/bundleIntegrity.ts` (and use `prose()`).
     The cross-container regression test in `verify-rbac.ts` guards the contract.
  2. Field-level `access` is **not** the authority for the Editor/admin split — the hook is.
     (`prose()`/`proseAdmin()`/`structureText()` carry only grammar hints + UI/create access.)
  3. **Array edits must submit the full array** (same rows/order): the hook rejects
     cardinality/order changes by Editors. Fine for the Payload admin UI; required to know
     before building custom API/editor flows.
- **UNIT.overview** is admin-only (SPEC §5 does not list UNIT) — modeled with `proseAdmin`
  and preserved wholesale by the hook; it is intentionally not in the prose whitelist.
- Field-level access is still kept on groups (META/UNIT), `phase`, the `rubric` array, and
  top-level `title`/`subjectGrade` as harmless defense-in-depth, but the hook is the
  single source of truth.

## 2026-06-08 — External audit (Codex + CodeRabbit) triage + fixes

Second external pass on the auth/bundle work (already merged to `main`). Six findings; all
valid. Triage (live now / next-task / future) and resolution below.

**Status:** landed over two commits on `main`, both deployed to the Rock (rebuilt via
`docker compose up -d --build`, migrate exit 0, app running) and verified against the
deployed image (not bind-mounted): `eba6157` (the fixes below) verified 17/17, then
`2059156` (the whitelist inversion + cross-container test, see the dedicated entry above)
verified **19/19**. The current design point is the whitelist hook.

- **[live-when-roles-exist, FIXED] Subject Admins could reset any user's password.**
  Verified in installed source (`collections/operations/utilities/update.js`): Payload saves
  `data.password` with NO password-specific access check — only collection `update` gates it,
  and Subject Admins have collection update on all users (needed for assignment mgmt). Added
  `guardPasswordChange` (beforeChange): only self or Site Admin may change a password; `!actor`
  is treated as a trusted system/override call (unauthenticated REST is already denied at
  collection access, and the token reset writes hash/salt directly, never via this path).
  Not exploitable today (only the Site Admin exists) but mandatory before assigning Subject Admins.
- **[authz-correctness, FIXED] Editors could edit `sections[].exemplar` (an answer key).**
  SPEC §5 makes exemplar Subject-Admin-only. Fixing this surfaced a **deeper Payload
  limitation (the important lesson):** field-level access reliably retains denied values for
  **groups** and **required** array subfields, but **NULLS optional admin-only subfields inside
  open arrays** when a non-admin submits the array — and nulls them at *write* time even when
  the parent is merely *omitted* from the update (hook injection of an omitted field does NOT
  persist; only modifications to *submitted* fields do). Net effect: with field access, an
  Editor's ordinary save would **wipe** `exemplar`, `sections[].title`, and (pre-existing, missed
  by everyone) `lessons[].duration/substrand/aresKeywords`. **Resolution:** remove field-level
  access from those optional admin array subfields and make `enforceBundleStructure` the single
  enforcement point — it overwrites admin-only values from the original for non-admins (omitted
  parents are then retained intact by Payload's merge; submitted changes are corrected by the
  hook). **Rule:** do not rely on Payload field-level `access` to protect optional admin-only
  subfields inside shared/open arrays; enforce those in a hook. *(This hook was then inverted
  from this blacklist to a secure-by-default whitelist — see the entry above.)*
- **[future, DOCUMENTED—not changed] FK `ON DELETE SET NULL` on NOT NULL columns**
  (`subject_grades.subject_id`, `users_assignments.subject_grade_id`, `lesson_bundles.subject_grade_id`).
  Verified Payload 3.85 / db-postgres exposes **no `onDelete` config** — it hardcodes SET NULL
  for relationships. Practically, SET NULL on a NOT NULL column *prevents* deleting a referenced
  parent (the delete errors), so there's no orphaning/data-corruption risk today — only a less
  friendly error and a schema smell. Hand-forcing RESTRICT in a corrective migration would
  diverge from Payload's generated schema snapshot and fight `migrate:create`. **Decision:** keep
  Payload's default; when taxonomy *delete workflows* are built, add app-level `beforeDelete`
  guards on Subject/SubjectGrade that block deletion when dependents exist (clear message),
  rather than fighting the FK DDL. No delete workflows exist now; deferred deliberately.
- **[live dev harness, FIXED]** `playwright.config.ts` `webServer.command` was `pnpm dev` →
  `npm run dev` (`npm run test:e2e -- --list` now works; 4 tests listed).
- **[future-correctness, FIXED]** `SubjectGrade` uniqueness `beforeValidate` lookup omitted
  `req` → added (transaction-consistent, per the rule below). DB-level composite unique index
  still deferred (app-level check acceptable at this scale; documented).
- **[next-task, DONE] Coverage.** `verify-rbac.ts` extended to 17 checks incl. password-guard
  (subject-admin-blocked / self-allowed / assignment-mgmt-still-works) and exemplar
  (editor-blocked / admin-allowed / prompt-still-editable) and admin-array-subfield anti-wipe.

## 2026-06-08 — Code-review (high) follow-ups + a Payload transaction lesson

A correctness-focused review pass (complementing the security review) on the auth branch.
No High bugs; the access hooks held up. Actioned:

- **M1 (fixed) — denormalized title went stale.** `SubjectGrade.displayName` ("<Subject> —
  Grade N") is stored at write time; renaming the parent `Subject` left it stale. Added a
  `Subject` afterChange hook that refreshes dependent SubjectGrade titles on rename.
- **L3 (fixed) — duplicated access helpers consolidated.** Exported a shared `Assignment` type
  and a single `subjectGradeIdsByRole` from `access/index.ts`; removed the near-duplicate copies
  in `access/bundle.ts` and `hooks/userRoles.ts`. Behavior-preserving.
- **Transaction-consistency bug surfaced while fixing M1 (the real lesson).** The rename hook
  *looked* correct but the title still didn't update. Root cause, found by instrumenting:
  (1) Payload **merges existing field values into `data`** on update, so a `beforeChange` that
  guards on `data.grade == null` still runs its recompute even when you only passed one field;
  and (2) `SubjectGrade.beforeChange`'s subject lookup **omitted `req`**, so it read *outside the
  current transaction* and recomputed the title from the pre-rename name, clobbering the refresh.
  **Rule:** always thread `req` into nested `payload.find/findByID/update` inside hooks — not just
  for writes (atomicity) but for **reads**, or they see pre-transaction state. Don't assume a
  partial update means other fields are absent in `beforeChange`.
- **Verification:** `verify-rbac.ts` extended with a rename check; full gate green on the Rock
  (9/9), test data self-cleaned. Tooling note: `/code-review` resolved to the CodeRabbit plugin
  (name collision); the high-effort correctness pass was done inline instead.

## 2026-06-08 — Product model: authorization entities + sub-strand bundle

Modeled the authorization entities and the sub-strand bundle as **native Payload nested fields**
(SPEC §3, §5, §8), plus the Codex scaffold-hygiene fixes. Collections: `subjects`,
`subject-grades`, role-bearing `users`, and `lesson-bundles`. Verified locally as far as a
DB-less host allows — `generate:types`, config sanitization, `tsc --noEmit`, and `eslint` all
clean; the migration + true end-to-end run happen on the Rock. Decisions and the non-obvious
traps:

- **Content model grounded in real data, not memory.** Shapes were read from the
  fidelity-proven `~/Desktop/ares-docx-fidelity-demo/bio_1_4_data.js` (matches SPEC §3 exactly):
  `rubric[]` = `{criterion, excellent, proficient, developing}`; `sections[]` =
  `{title, prompt, exemplar}`; `framework[].resources` is **absent** in real data → modeled
  optional. `UNIT` is `{}` there → modeled minimally as a single optional `overview` pending a
  populated example.
- **Conflict resolved — admin-panel access.** NEXT-SESSION said "panel = Site Admins only";
  **SPEC §5 (canonical) has Editors/Subject Admins editing via the admin edit screen in Phase 1.**
  SPEC wins: `access.admin` (`adminPanelAccess`) allows **siteAdmin OR subjectAdmin OR editor**,
  excludes plain Teachers. General rule: when NEXT-SESSION (staged plan) and SPEC (canonical)
  disagree, SPEC governs; surface the conflict rather than silently following either.
- **Conflict flagged — phase vocabulary.** The local `cbe-generation-system` checkout is the
  older **Python** generator, so the authoritative Node `docx_kit.js` phase→colour map isn't
  available. The `framework[].phase` dropdown uses the **five phase strings from `bio_1_4`**
  (`Predict Phase`, `Observe Phase`, `Explain Phase`, `Driving Question Board (DQB) Creation`,
  `Model Building Phase`). **TODO: reconcile against the Node generator's colour-map keys when
  the generator integration / ingest lands** — an unknown phase silently degrades output (SPEC §4).
- **Field access gates *values*; a hook gates *structure*.** Payload field-level `update: false`
  silently keeps a field's existing value, but field access **cannot** stop add/remove/reorder of
  array rows. So SPEC §5 is enforced in two layers: per-field access (prose = Editor+, META /
  phase / duration / answer keys = Subject Admin+, resource column + lesson `number` = system-only),
  **plus** `enforceBundleStructure` (beforeChange) which rejects cardinality/order changes by
  non-admins and re-derives lesson numbers from order. Highest-risk surface → security-review.
- **≤1 Subject Admin per subject-grade.** `autoDemotePriorSubjectAdmins` (afterChange) demotes any
  prior holder to Editor in the **same transaction** (`req` threaded) guarded by a `context` flag.
  Scoped role management for Subject Admins is enforced by `enforceAssignmentScope` (beforeChange):
  a non-site-admin may only touch assignment rows for subject-grades they administer.
- **`req.user` carries full role data.** Confirmed in installed source: the JWT strategy
  re-fetches the user via `findByID` (`auth/strategies/jwt.js`), so `roles` and `assignments` are
  always present in access functions; relationships come back as raw IDs at the default auth depth
  (helpers normalize ID-or-object via `toId`).
- **Two Payload-3 gotchas (trust installed source).** (1) A **virtual** field can be `useAsTitle`
  *only* if it maps to a relationship field — so `SubjectGrade.displayName` ("<Subject> — Grade N")
  is a **stored** field maintained by a beforeChange hook, not virtual. (2) `payload generate:types`
  runs **without a DB** (pure config parse) and is a fast local correctness gate; `next build` and
  migrations do need the DB → run on the Rock.
- **Field naming.** Top-level groups are camelCase (`meta`, `unit`, `lessons`, `finalExplanation`,
  `summaryTable`) to avoid uppercase-column oddities; the generator adapter will map them back to
  `META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE`. Inner keys already match the ARES data verbatim.
- **ESLint fix.** `eslint-config-next` 16 ships native flat-config arrays; wrapping them via
  `FlatCompat.extends('next/...')` double-wraps the flat plugin config and crashes the legacy
  validator ("circular structure"). Fix: import `eslint-config-next/core-web-vitals` and
  `/typescript` and spread them directly (no FlatCompat).
- **Security-review finding (fixed) — don't backfill `name` from `email`.** The first migration
  backfilled the new, publicly-readable `users.name` from the private `email`. Because `name` is
  *intentionally* public (attribution — SPEC §8) while `email` is gated by `emailReadAccess`,
  copying email into name leaked it to any authenticated user for pre-existing rows. Fix: backfill
  with a neutral `'User ' || id` placeholder, not email. **Rule:** when adding a public field to a
  table with rows, never backfill it from a private column — fix the *data*, not the field's
  visibility (locking down `name`'s read would break required attribution). The migration had
  already applied on the Rock, so the data was corrected in place (admin `name` set to "Site
  Administrator") and the committed migration amended for the not-yet-deployed production host;
  amending an applied migration is acceptable here because only the pre-existing-row backfill
  changed — the schema snapshot is untouched and the Rock won't replay it.
- **Admin-panel lockout + bootstrap (fixed).** Gating `access.admin` on siteAdmin/assignment
  (correct per SPEC §5) locked out the *existing* Rock admin, whose `roles` was `[]` — login API
  returned 200 but `/admin` refused entry. Fixed in place (granted siteAdmin). The deeper bug:
  on a *fresh* deploy Payload's first-user creation also yields `roles: []`, so the new admin
  would be locked out too — a bootstrap deadlock. Fix: `grantSiteAdminToFirstUser` (beforeChange)
  forces `roles: ['siteAdmin']` when creating the first user (user count 0). **Rule:** any time
  panel/admin access is gated on a role, ensure the *first* user is granted that role
  automatically, or the system is un-bootstrappable. Lesson on testing: `verify-rbac.ts` passed
  because it created users *with* roles; it didn't cover the role-less pre-existing/first user —
  exercise the bootstrap path, not just the happy path.
- **Email adapter (operations).** Password resets silently no-op'd ("Email attempted without
  being configured") because no email adapter was set. Added a conditional `nodemailerAdapter`
  (enabled when `SMTP_HOST` is set; console fallback otherwise; `skipVerify` so boot isn't
  coupled to SMTP reachability). Gmail SMTP needs a 16-char **App Password** (2FA required), not
  the account password. SPEC §11 wants real email/observability before real users.

## 2026-06-08 — External review (Codex) triaged into the build plan

Codex audited the scaffold against the root docs. Its code reads were accurate and it ran the
real `lint`/`test`/`build` commands (caught genuine tooling breakage). Its weakness was
**urgency calibration**: it reviewed code-vs-root-docs without weighting the staged plan
(this file + `NEXT-SESSION.md`), so "no product model yet" was reported as a defect when it's
the intended scaffold state. Outcome:

- **Actionable items folded into `NEXT-SESSION.md`:** a "scaffold-hygiene" pre-flight
  (npm/pnpm drift in the `test` script; int-test DB host; ESLint flat-config; finish dep
  pinning; Media default-private), plus the security items attached to the auth task
  (`access.admin`; `username` + field-level `email` read). None is a live exploit today
  (only the admin user exists) — they're requirements for the imminent roles work.
- **Prompting lesson for cross-model review:** give the reviewer the plan/stage
  (`SPEC.md` + `DECISIONS.md` + `NEXT-SESSION.md`); ask it to classify findings as
  (a) live risk now / (b) requirement of the next planned task / (c) future, and to check
  exploitability before assigning P1; have it separate scaffold defaults from designed
  choices. Keep leaning on it for running the deterministic commands and (later) security
  review of the access functions.
- Reviews stay **advisory**; the deterministic gate (golden-file diff, type-check, CI) is the
  arbiter — consistent with the 2026-06-07 multi-agent decision.

## 2026-06-08 — Scaffold deployed on Rock 5B; build & DB-init gotchas resolved

Got the Payload + Postgres stack building and running in Docker on the Rock 5B
(`/srv/lesson3`, named volume `lesson3_pgdata`), co-tenant with nanoclaw, `/admin`
serving, first admin user created. Several non-obvious traps, recorded so the
public-production host (identical stack) doesn't re-hit them:

- **`npm ci` failed: "Missing yjs/monaco/@testing-library/... from lock file."**
  Root cause was **not** Node/npm version (that was a red herring that cost time — a
  pinned-npm "fix" was tried and reverted). The scaffold's **`app/.npmrc` sets
  `legacy-peer-deps=true`** (Payload 3 / React 19 / Next 16 peer conflicts), but the
  generated Dockerfile's `COPY` line **didn't include `.npmrc`** — so `npm ci` ran in
  strict-peer mode in the image and rejected the legacy-peer-authored lock. **Fix:**
  add `.npmrc` to the deps-stage `COPY`. Lesson: `.npmrc` must travel into the build;
  when install passes locally but `npm ci` fails only in Docker, suspect a missing
  `.npmrc`/config, not versions.
- **Build then failed at `COPY /app/public`:** the blank Payload template ships no
  `public/` dir but the generated Dockerfile assumes one. **Fix:** committed
  `app/public/.gitkeep`.
- **App ran but `/admin` 500'd: `relation "users" does not exist`.** Production builds
  do **not** auto-push the schema (push is dev-only); production needs **migrations**.
  Verified against installed Payload source: prod default `push:false`, CLI is
  `payload migrate*`, default `migrationDir = src/migrations`.
- **Migrations can't run from the prod image** (minimal Next standalone, no Payload CLI).
  Generated + applied the initial migration from a one-off container built off the
  Dockerfile **`builder`** stage, on the compose network. Initial migration committed
  (`app/src/migrations/*`).
- **Wired migrate-on-deploy:** added a one-shot **`migrate`** service to
  `docker-compose.yml` (builds `target: builder`, runs `npx payload migrate`), gated on
  a new Postgres **healthcheck**; `app` now `depends_on` it via
  `service_completed_successfully`. So `docker compose up -d --build` applies pending
  migrations before the app starts. Idempotent.
- **Open follow-up — schema-change workflow:** generating a *new* migration still needs
  the `builder`/tools image (or local dev) to run `payload migrate:create`; only the
  *apply* step is automated. Document the create step when we first change collections.
- **Latent risk:** dev Mac runs **Node 25**, the build image runs **Node 22** (LTS).
  Regenerate lockfiles in the Node-22 toolchain (or align local dev to Node 22) to avoid
  tree-resolution drift. Not yet fixed.

## 2026-06-07 — Multi-agent review: deferred, with a concrete trigger

Considered bringing in a second agent (OpenAI Codex, and/or **Hermes** — the Nous Research
always-on agent daemon on the MacBook Air, GPT-5.x-capable) to review/test alongside Claude
Code. **Decision: defer. Claude codes; the human is the arbiter; deterministic checks are the
gate.** Rationale and the rules we settled on:

- **Independent cross-model review is valuable** (uncorrelated blind spots), but the *verdict*
  stays deterministic — golden-file DOCX diff, type-check, eventual test suite + CI — never a
  model's opinion. Reviews are advisory input, not a merge gate; never auto-apply a reviewer's edits.
- **One writer, one reviewer, integrate at the PR.** Never two agents editing the same tree.
  Shared constitution: `SPEC.md` is canonical; `CLAUDE.md` (Claude) and `AGENTS.md` (Codex)
  both defer to it — keep the pointers in sync.
- **Do NOT use Hermes as a per-change reviewer** — it has no native git/PR pipeline, so that
  path is glue-building = complexity for no gain (Codex/CodeRabbit/`security-review` cover
  per-change review with full repo context already).
- **Hermes's real niche is out-of-loop, always-on scheduled jobs** (daemon + cron + cross-session
  memory + messaging): nightly fidelity-regression diff with notification, scheduled async GPT-5.x
  review of the day's diff, dependency/backup watches. Nothing else in the stack does this well.
- **Trigger to revisit:** once there is feature code, a test suite, and **CI** (the deterministic
  gate) — *then* Hermes is justified as the async layer that schedules regressions/reviews and
  pings on failure. Not before. CI (GitHub Actions) is the prerequisite and the next infra piece.
- **Cautions for that day:** (1) Hermes's *self-improving skills* cut against a verification
  role's need for consistency — pin/review skill changes, don't let them auto-evolve. (2) Hermes
  overlaps nanoclaw; if adopted it should *replace* a role, not add a fifth standing agent layer.

## 2026-06-07 — Tooling: Payload skill installed; connectors trimmed

- **Payload skill installed** at `.claude/skills/payload/` (`SKILL.md` + `reference/`),
  pulled from `payloadcms/payload@3.x` `tools/claude-plugin/skills/payload/`. This is the
  structural fix for the CLAUDE.md "Knowledge currency" worry (stale Payload 3 APIs) — prefer
  it over memory when working on collections, fields, hooks, access control, versioning.
  Re-pull the same path if it needs refreshing.
- **`laravel-boost` MCP server removed** from `~/Library/Application Support/Claude/claude_desktop_config.json`
  — it pointed at Lesson2's PHP `artisan` (irrelevant to this single-runtime Node project) and
  was failing to connect. Restorable from the Lesson2 repo if ever needed there.
- **Account-level connectors** (trivago, B12, website generators, mcp-registry, etc.) are **not**
  in local config — they're synced from the Claude account and toggled in the app's
  **Settings → Connectors**, not by editing files. Keep computer-use, Claude-in-Chrome/Preview,
  and pdf-viewer (planned uses: DOCX visual-fidelity checks, admin-UI verification, PDF export).
- **Permission allowlist:** committed `.claude/settings.json` holds only read-only MCP entries;
  most frequent Bash commands are already auto-allowed by Claude Code, and the rest are mutating
  or arbitrary-execution and were deliberately left out.

## 2026-06-07 — Scaffold layout, env var, and `output: 'standalone'`

- **Payload scaffolded into `./app`**, not the repo root, to preserve the committed root
  docs and co-tenancy `docker-compose.yml`. `docker-compose.yml` `build:` points at `./app`.
- **Standardized on `DATABASE_URI`.** `create-payload-app`'s blank template (v3.85.0) reads
  `process.env.DATABASE_URL`; changed `app/src/payload.config.ts` to `DATABASE_URI` to match
  the project convention and the committed `.env.example`.
- **Added `output: 'standalone'`** to `app/next.config.ts` — the generated Dockerfile copies
  `.next/standalone` and fails without it.
- **`create-payload-app` is fully scriptable** despite the abbreviated `--help`: the hidden
  flags `--db`, `--db-connection-string`, `--secret`, `--no-git`, `--no-agent` make it
  non-interactive. (The prior session's interactive/PTY blocker was avoidable.)

## 2026-06-07 — bio_1_4 fidelity proof passed

Regenerating the three DOCX from stored data reproduced the stakeholder-approved set
exactly, except the per-phase Resource column (which needs the absent Python recommender).
Validates the core architecture: edit the data, regenerate byte-stable documents.
See assistant memory `fidelity-proof-passed` for the diff detail.
