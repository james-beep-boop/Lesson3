# P070-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read as supplied:** `app/src/components/Manage/RolesAccessPanel.tsx:401-579`, `app/src/components/Manage/SubjectsAndGradesPanel.tsx:1-295`, `app/src/components/Manage/SystemFactsPanel.tsx:1-60`.
- **Not assessed:** `RolesAccessPanel.tsx` lines 1-400 and 580-end. Also not assessed: definitions of `mayVacate`, `subjectAdminControl`, `appointable`, `handoverable`, `addable`, `admins`, `editors`, the action handlers, `SUBJECT_ADMIN`, and `personLabel`; `GRADE_LEVELS`; `useTaxonomyActions`; `deleteConsequences`; `SystemFact` and `lib/systemFacts.ts`; server endpoints. No callers or runtime behavior were checked.

## Purpose and invariants

- **RolesAccessPanel (401-579):** renders each subject-grade group with an administrator list (Remove; Appoint/Replace in `full` mode; Hand over in `handover` mode) and an editing-access list (Remove; Grant). Visible controls depend on mode and gating props defined outside the range.
- **SubjectsAndGradesPanel:** subject rename/delete, a SubjectGrade checkbox matrix, locally pending grade columns, and add-subject. The client delegates guards (orphaned plans, near-miss names, delete counts) to the server.
- **SystemFactsPanel:** a presentational, read-only list. It renders no controls.

## Candidates

No confirmed defect in the supplied ranges. Leads, none verified:

1. **RolesAccessPanel.tsx:419-421 (low, uncertain).** The panel labels and lists every administrator row, and pluralises at `admins.length > 1`. The policy's roles table says a subject-grade has *at most one* Subject Administrator. If storage can hold two, the UI presents a forbidden state as normal.
   - Precondition: two administrator assignments for one subject-grade. Whether this is storable is unseen.
   - Expected (policy): at most one administrator row. Actual (in range): plural list.
   - Test: render a group with `admins=[A,B]` and assert the state is unreachable from the store, or that the server rejects it.

2. **RolesAccessPanel.tsx:428 (potentially high, unverified).** Policy D6a says a Subject Administrator may not remove an administrator, including their own row. The Remove button renders on `mayVacate`, which is defined outside the range.
   - Precondition: `subjectAdminControl === 'handover'` and the viewer is the sole administrator, with `mayVacate` evaluated to true.
   - Expected: no Remove button. Actual: depends on `mayVacate`.
   - Test: render in `handover` mode with the viewer's own admin row and assert no Remove control.

3. **SubjectsAndGradesPanel.tsx:69 and :190 (low, unverified).** Client-side rename and add perform no near-miss check. The policy's "never differ only by letter case or whitespace" rule appears in the upload section, so it is unclear whether it applies to these Manage paths.
   - Test: rename or add `"BIOLOGY"` or `"Biology "` with the server unseen, and check whether the server refuses.

4. **SystemFactsPanel.tsx:8-9 vs :46 (low, doc/behavior mismatch).** The header says "each names the environment variable." The code renders the env line only when `fact.envVar` is set.
   - Test: a fact with no `envVar` renders no "Server setting" line. Whether that is intended for host-recorded facts is unknown.

## Ruled out

- `SubjectsAndGradesPanel.tsx:64-67` (state resync) and `:82-93` (toggle logic) are consistent with their comments.
- `RolesAccessPanel.tsx:536` hides the grant control only when there are editors and no addable options.
- The handover empty state (`:505-509`) is accurate.
- The "editing access" wording (`:507`, `:514`, `:540`, `:547`) matches the policy vocabulary note.

## Unresolved questions

- What `mayVacate` and `subjectAdminControl` evaluate to for each role, and does `handover` mode block Remove on the viewer's own row? (Lead 2.)
- Can a subject-grade hold more than one administrator? (Lead 1.)
- Does the server enforce the near-miss rule on rename and create? (Lead 3.)
- Does `GRADE_LEVELS` match the policy's Grade 1-12 range?
- Is the editing-access Remove button (`:521-530`) visible only to users with scope? That depends on where the panel mounts.

Authorization and integrity claims here are unreviewed until independent review. These ranges contain only UI gating, and the policy places authoritative checks on the server.
