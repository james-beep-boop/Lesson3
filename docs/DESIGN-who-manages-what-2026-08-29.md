# "Who manages what" — plan (2026-08-29)

Operator request, discussed and **deliberately not built**. Extracted from `docs/NEXT-SESSION.md`
on 2026-08-29: it is back-burner work gated on a SPEC amendment, and 50 lines of it sat between the
handoff and the actual work list, which made the next session harder to start. The reasoning is
unchanged — only its location is.

**Status: BACK BURNER. Do not start until the SPEC §8 amendment is made.** The build is small; the
gating item is the amendment, not the code.

---

⚑ **BACK BURNER WITH A PLAN, so it is not re-derived: "WHO MANAGES WHAT."** Operator request
2026-08-29, discussed and deliberately NOT built. A tree/list of who administers each subject-grade
and who holds editing access there, with a message button beside each person. The build is small; the
**gating item is a SPEC §8 amendment that has not been made** — do not start until it is.

- ⚑ **THE FINDING THAT REFRAMES IT: teachers cannot currently know who the administrators are, and
  that is deliberate.** `endpoints/requestEditing.ts` says so in its own docblock — "the roster is
  deliberately names-only (SPEC §8), so a teacher CANNOT know who the admins are; resolving the
  recipients is this endpoint's one privileged step" (DECISIONS 2026-07-08). A teacher-visible view of
  this is a **reversal of that specific decision**, not a new screen against existing rules.
- **What is and is not already disclosed** (SPEC §8, `collections/Users.ts`): display **names** are
  readable by every authenticated user (the 2026-07-02 relaxation, for messaging's picker) — so names
  cost nothing. **Emails** stay Site-Admin-or-self plus the Manage carve-out. **`roles`/`assignments`
  are field-hidden from non-admins** — so the *mapping* name → role → subject-grade is the whole of
  what a teacher-facing view would newly disclose. That mapping is the amendment.
- **The recommended split — do not make one widget serve both audiences.** Teachers get the
  **administrator tier only**: subject-grade → its administrator, names only, no addresses, one
  message button per row. Administrators get the **full tree** including teachers with editing access,
  mounted in Manage → Roles & Access beside the existing list, sharing the component. Excluding the
  editing-access tier from the teacher view keeps the new projection small, keeps the disclosure
  small, and drops the social friction of publishing who was granted what.
- ⚑ **DO NOT NAME THE SITE ADMINISTRATORS.** Three reasons, worth not re-arguing: it makes them the
  front door for escalations the per-subject-grade structure exists to distribute (`request-editing`
  already notifies them as a *backstop*); it names the do-anything account inside a system with
  built-in messaging; and it is **not true** — no reporting line exists in the data, so a named root
  node asserts an org structure the system does not have.
- **Subject-grades with NO administrator are the most valuable rows on the page** and must be
  included. Their escalation affordance is a button that messages the site-admin set **without naming
  it** — `resolveRecipients` in `endpoints/requestEditing.ts` already does exactly that and is the
  pattern to reuse, not to reinvent.
- **Collapsed by default, and search is the primary entry** (operator, 2026-08-29). The thing gets
  large; the Manage mount inherits collapse from the accordion, a teacher-facing page needs its own
  wrapper. Typing a name or a grade should open to that branch — the token-AND search in
  `Manage/RolesAccessPanel.tsx` is reuse, not new work.
- ⚑ **IT IS A DAG, NOT A TREE.** Someone with editing access in several subject-grades appears as a
  leaf under each, so leaves ≠ people. Root it on the **subject-grade** (which is also the honest
  shape); the person-rooted pivot shows each person once but loses "who works on Grade 7 Maths",
  which is the question the view exists to answer.
- **Cost.** Admin-facing tree: ~half a day, purely presentational — `buildRolesAccess`
  (`lib/editorGroups.ts`) already returns roster + per-group `subjectAdminIds`/`editorIds`, so no new
  query and no new privacy boundary. Teacher-facing half: ~a day, because it needs a **third trusted
  projection** (subject-grade → administrator name) beside `buildRolesAccess` — ⚑ it CANNOT be done by
  widening `assignmentsReadField`, which would expose the whole assignment graph over REST — plus
  `tests/http` authz coverage per the standing endpoint rule. A `?to=<userId>` handoff for
  `(frontend)/messages` (which today takes only `?plan=`/`?version=`) is ~20 lines and serves both.
- **Naming:** "Who manages what" was preferred over "User Tree Diagram" (names the widget, not the
  job) and "Contact Users" (overstates messaging). Tier label is **"Teachers with editing access"**.
- **Left open rather than guessed:** (a) whether the teacher view is a nav destination of its own or a
  section of `/messages`; (b) whether a Subject Administrator should see *other* subject-grades'
  administrators — the cross-view is the one genuinely new thing for them, and `buildRolesAccess`
  rules 1–2 currently hand them only their own; (c) whether message buttons belong on every leaf or
  only on administrators.
