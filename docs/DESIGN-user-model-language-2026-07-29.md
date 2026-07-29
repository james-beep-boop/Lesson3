# Design — reframe "Editor" as editing access (language/UI, not security)

**Status:** implemented 2026-07-29 (see `docs/DECISIONS.md`). Presentation only — no schema/authz change.
**Type:** presentation / terminology change. **No** schema, data-migration, or authorization-logic change.
**Origin:** a partner/tester suggested the product needs only three user types — Teacher, subject-grade
admin, site admin — with teachers starting without editing rights and being *granted* them. This
document works that idea into a concrete, phased plan.

Read alongside: `SPEC.md` §5 (field permissions) and §8 (users/roles); `CLAUDE.md` "Authorization
model"; the shipped plain-language editor batch (`docs/DESIGN-editor-usability-2026-07-25.md`, PR #157),
whose plain-language goal this change continues.

---

## 1. Principle & guardrails (the decisions this plan commits to)

- **The change is presentational. The authorization model does not change.** No edits to the *logic*
  in `access/*.ts`, no schema change, no data migration, no new/changed endpoints, no touch to the
  ≤1-subject-admin invariant or the promote/demote transaction.
- **Three displayed types:** *Teacher*, *Subject-grade administrator*, *Site administrator*. **"Editor"
  ceases to be a type.** A person whose only grant is `editor` displays as **Teacher**, with a
  separate **"Editing access: …"** line.
- **Editing access is shown as a separate attribute, never a compound type label.** No "Teacher with
  editing access" as a formal type — type on one line, access scope on its own line. Normal prose may
  still refer to "teachers with editing access."
- **Use the accurate title "Subject-grade administrator."** The grant applies to one subject-grade,
  not to every grade in a subject. The adjacent scope ("Biology · Grade 10") reinforces that limit,
  but the title must remain truthful in guides, controls, messages, and other places where the scope
  is not shown beside it.
- **Keep the internal `assignments[].role === 'editor'` value.** It is storage, not UI. Renaming it
  would force a migration for zero user benefit.

### Why this cut is principled (and where it stops)

*Editor* is a **capability** — it means exactly one thing: "may edit prose here." *Subject-grade
administrator* and *Site administrator* are **governance roles**: they decide things about *other
people and Official versions* (approve the Official pointer, grant access, promote/demote).
Capabilities should display as **access**; governance should display as **type**. That is why "Editor"
dissolves into a Teacher type plus a separate editing-access line, while Subject-grade/Site
administrator stay named types — and it is the boundary that keeps the change from over-reaching.

---

## 2. The core defect being fixed

`userTypeLabel()` — `app/src/access/index.ts:97` — collapses a multi-grant person into a single
"highest role wins" string:

```
Site Administrator > Subject Administrator > Editor > Teacher   // pick the highest
```

…rendered as their identity in `UserMenu` (`app/src/components/UserMenu/index.tsx:88`). That is the
untruth: "Editor" is a *per-subject-grade grant* shown as if it were *who they are*, and all scope is
hidden. Internally the model is already assignment-based and multi-scope — a person can be a subject
admin for Biology · Grade 10, an editor for Chemistry · Grade 11, and a plain viewer everywhere else.
The interface simply doesn't say so.

---

## 3. Work, in three shippable phases

### Phase 1 — Fix the one lie (high value, low risk, self-contained)

**Goal:** every user, every login, sees a truthful type plus their actual access scope.

1. **New display helpers in `access/index.ts`** (pure functions, unit-testable, no logic change):
   - `userTypeLabel()` → returns only
     `'Teacher' | 'Subject-grade administrator' | 'Site administrator'`.
     The Editor branch is removed; an editor-only user falls through to Teacher. *(This also moves the
     admin titles to sentence case; that casing is now approved and should be applied globally.)*
   - `adminScopeLabels(user)` → display names of subject-grades where `role === 'subjectAdmin'`.
   - `editingAccessLabels(user)` → display names where `role === 'editor'`. Disjoint from admin scopes
     by construction (a subject-admin row has role `subjectAdmin`, not a second `editor` row), so a
     subject admin's own subject-grade shows under "Administrator:" and is **not** double-listed under
     editing access.

2. **Resolve the scope display names — the one real engineering wrinkle (see §6).** The scope lines
   need each `assignments[].subjectGrade`'s `displayName` ("Biology · Grade 10"). The session/JWT
   `user` most likely carries `subjectGrade` as an **id**, not a populated object. Options:
   - **(a) Populate at render** — where `AppNav` builds the menu (a server component), resolve the
     handful of assignment subject-grades to depth 1 with a batched `payload.find`/`findByID`.
   - (b) Denormalize a label onto the assignment row (rejected: schema + migration + drift risk).

   **Recommend (a).** Assignments per user are few; no schema/migration. This is the only non-trivial
   implementation decision in the whole plan — everything else is copy.

3. **`AppNav`** — `app/src/components/AppNav/index.tsx:43`: compute and pass the type plus the two
   scope label lists to `UserMenu`.

4. **`UserMenu`** — `app/src/components/UserMenu/index.tsx`: render the type on line 1; beneath it, up
   to two lines — `Administrator: <scopes>` and `Editing access: <scopes>` — each omitted when empty.
   A site admin shows the type only (or an explicit "Full access" — see §6). Add the small CSS for the
   scope lines (`.user-menu__type` already exists as the hook).

   Example renderings:
   ```
   Teacher
   Editing access: Biology · Grade 10, Chemistry · Grade 11
   ```
   ```
   Subject-grade administrator
   Administrator: Biology · Grade 10
   Editing access: Chemistry · Grade 11
   ```

5. **Tests:** add a `userTypeLabel`/scope-helper unit spec covering: a plain teacher; an editor-only
   user (→ "Teacher" + an editing-access line); a subject admin; a site admin; and a **mixed**
   subjectAdmin-here / editor-there user (→ both scope lines, no double-listing). Confirm by grep that
   no existing test asserts the old `'Editor'` return before landing (current grep: none does).

*Phase 1 is independently shippable and delivers the large majority of the value.*

### Phase 2 — Management-surface copy (the grant flow)

6. **Assignment field** — `app/src/collections/Users.ts`: the role dropdown option
   `{ label: 'Editor', value: 'editor' }` (≈ lines 103/213) → **`label: 'Editing access'`**, value
   unchanged. The field label ("Subject-grade roles") and its description ("Assign Editor or Subject
   Administrator access for each subject and grade.") → editing-access wording.
   **⚠ That description is asserted in `app/tests/unit/editorPlainLanguage.spec.ts` — update the
   assertion in the same commit.**

7. **EditorsWidget / AdminDashboard** — `app/src/components/AdminDashboard/EditorsWidget.tsx` and
   `app/src/components/AdminDashboard/index.tsx:205`: user-facing copy → "Editing access" /
   "Grant editing access" / "Remove editing access". Internal identifiers (`EditorsWidget`,
   `assignEditorEndpoint`, `unassignEditorEndpoint`) may stay — this is copy only. *(Optional later
   tidy: rename the component/endpoints; not required and not recommended for this batch.)*

8. **Request-editing email** — `app/src/endpoints/requestEditing.ts:105`: "(Sent from the lesson page —
   grant via Manage → Editors.)" → "…grant via Manage → Editing access." Keep in step with the widget's
   new name. The teacher-facing button already reads "Request editing access"
   (`app/src/components/RequestEditingButton.tsx`), so this closes the loop consistently.

### Phase 3 — Docs & guide

9. **In-app guide** — `app/src/app/(frontend)/guide/page.tsx`: the `#editors` section (`<h2>Editors</h2>`,
   the nav anchor, "Appoint Editors: Manage → Editors promotes a Teacher to Editor", "Subject
   Administrators can do everything Editors can do…") reframed to editing access. Recommend retitling
   the section to "Editing" for consistency **but keeping the `#editors` anchor id** (or adding a
   redirect) so existing links don't break.

10. **`USER_GUIDE.md`** — the same reframe, kept in step with the in-app guide.

11. **`SPEC.md`** — update the §5/§8 vocabulary: state that *Editor* is a capability surfaced to users
    as "editing access," while the authorization primitives (the `editor` assignment value and the
    access functions) are unchanged. This is the canonical record that the *model* did not change —
    only its *presentation*.

12. **`docs/DECISIONS.md`** — dated entry capturing the §1 principle (capability-vs-governance), the
    separate access line, the precise "Subject-grade administrator" title, and the hard boundary
    (no logic / schema / migration).

---

## 4. Why this is safe

The project's standing rule — every authz-affecting change ships with wire-level authz tests
(`tests/http` 401/403/404 + happy path) — means the **security gates are pinned by tests, not by
wording**. Renaming "Editor" across the UI cannot loosen who-can-edit: the existing coverage still
proves Teachers can't edit and out-of-scope editors get 403. This is a copy/label pass on top of an
unchanged, test-guarded gate. The risk of "accidentally widening permissions while renaming" is already
fenced off.

---

## 5. Verification

- **Local (Node 22 — `/opt/homebrew/opt/node@22/bin`; the default Node 25 breaks the tsx loader):**
  `tsc`, `npm run test:unit` (incl. the new label spec), `eslint` on changed files.
- **CI gate:** int / http / **e2e** + `next build`. The browser e2e job cannot run on the dev Mac
  (`next dev` does not start locally), so it is a CI/Rock check — see the note below.
- **Post-deploy Rock eyeball**, across **all three of**: an editor-only account (→ "Teacher" +
  editing-access line), a mixed subjectAdmin-here / editor-there account (→ both scope lines), and a
  site admin. Confirm the user menu type + scope lines, and that the grant widget and request-editing
  email both read "editing access."
- **App-level, no migration** — same `scripts/deploy.sh` path as the last two batches; a Rock
  `generate:types` should produce no diff.

---

## 6. Open questions — resolved at implementation (2026-07-29)

- **Scope-name resolution (§3.2) — settled: populate-at-render.** The type + scope lines are resolved
  once in `lib/accessScopes.ts` (`resolveAccessSummary`) and shared by the user menu (`AppNav`) and
  the Manage page. One batched `payload.find`; skipped entirely for plain teachers (no assignments)
  and for site admins (short-circuit), so the nav hot path adds no query for the common cases.
- **Admin-title casing — settled:** sentence case everywhere ("Subject-grade administrator", "Site
  administrator"), including `userTypeLabel` and the assignment dropdown labels.
- **Site-admin scope line — settled: one "All subjects and grades" line on BOTH surfaces.** The
  shared resolver special-cases site admins, so the menu and Manage agree (an earlier split, where the
  menu had no site-admin case and would show per-grant lines for a site admin holding assignment rows,
  was the defect this consolidation fixed). Per-grant scopes are also enforced **disjoint** in the
  resolver — a same-subject-grade `subjectAdmin`+`editor` pair lists once, under Administrator.
- **Guide section heading/anchor — settled:** retitled "Editors" → "Editing", keeping the `#editors`
  anchor id so existing links don't break.
- **Phase 2 depth — settled: copy-only.** The `EditorsWidget` component and the assign/unassign
  endpoints keep their names; only user-facing strings changed.

---

## 7. Surface inventory (grounding — every place the current model surfaces to users)

| Concern | File | Note |
|---|---|---|
| Type label logic | `app/src/access/index.ts:97` (`userTypeLabel`) | Remove Editor branch; add scope helpers |
| Menu render | `app/src/components/UserMenu/index.tsx:88` | Add scope lines |
| Menu wiring | `app/src/components/AppNav/index.tsx:43` | Pass type + scopes |
| Assignment dropdown | `app/src/collections/Users.ts` ≈103/213 | `Editor` → `Editing access` label; value stays |
| Assignment field copy | `app/src/collections/Users.ts` ≈76–79 | Description reworded (test asserts it) |
| Grant widget | `app/src/components/AdminDashboard/EditorsWidget.tsx`, `index.tsx:205` | Copy → editing access |
| Request-editing email | `app/src/endpoints/requestEditing.ts:105` | "Manage → Editing access" |
| Request button (already correct) | `app/src/components/RequestEditingButton.tsx` | "Request editing access" — no change |
| In-app guide | `app/src/app/(frontend)/guide/page.tsx` (`#editors`) | Reframe section |
| Static guide | `USER_GUIDE.md` | Reframe |
| Spec | `SPEC.md` §5/§8 | Record: presentation only |
| Decisions | `docs/DECISIONS.md` | Record the approved language and presentation boundary |
| Unit test to update | `app/tests/unit/editorPlainLanguage.spec.ts` | Assignment description assertion |

**Explicit non-goals:** no change to `access/*.ts` *logic*, `hooks/userRoles.ts`, the `editor` stored
value, the ≤1-subject-admin invariant, endpoints, or the DB. If any of those seem necessary, stop — the
plan has drifted out of "presentation only."
