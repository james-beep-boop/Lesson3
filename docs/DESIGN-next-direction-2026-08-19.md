# Next direction — deployment toggle, LAN resources, quizzes, public UI

**Status:** product direction agreed 2026-08-19 in planning discussion. No code written. `SPEC.md`
remains authoritative for the resulting architecture; this document separates what was decided from
what the build still owes. Several items below AMEND `SPEC.md` and must be folded into it before
the corresponding slice is built — they are not licence to drift.

Four features were proposed. Three of them already have foundations in the repo, which is the main
reason the sequencing below is not simply "hardest last".

| # | Feature | Difficulty | Rough size |
|---|---|---|---|
| 1 | Site-Admin local/cloud toggle | 2/5 | 1–2 sessions |
| 2 | Teacher-added links to LAN-local content | 3/5 | 2–4 sessions |
| 3 | Student quizzes with independent self-study | 5/5 | 10–20 sessions, phased |
| 4 | A better public interface | 3/5 | 3–4 sessions |

---

## D1 — The deployment toggle is two layers, AND'd (decided)

`PUBLIC_LIBRARY_ENABLED=1` (`lib/publicLibrary.ts`) already IS this switch, at deploy time: off means
no Explore action and a server-side 404 from every public route. The new work is a runtime control on
top of it, not a replacement.

- **`PUBLIC_LIBRARY_ENABLED` (env, boot) stays the capability ceiling** — "this deployment MAY be
  public". Unchanged semantics, unchanged boot refusal when set without `SERVER_URL`.
- **A new Site-Admin toggle (a Payload global) is the runtime switch INSIDE that ceiling** — "public
  discovery is live right now".

Off-by-env means the toggle is not rendered at all (SPEC §13 minimal UI) and the routes still 404. A
confused or compromised admin account on a school box therefore cannot put that school on the
internet; the cloud operator still gets a real take-it-down control.

⚑ **NOT one master switch labelled "offline mode".** Several things that make up "cloud mode" are
process-level and read at boot — `SERVER_URL` drives the CSRF allowlist and Secure cookies
(`lib/publicPosture.ts`), and Sentry/SMTP/Gotenberg are wired at startup. A toggle that implies it
controls network egress while actually controlling UI surfaces is exactly the reserved-word failure
SPEC §13 warns about: a label asserting something the code does not mean. Name it for what it does —
**Public library: live / off**.

**Two implementation notes.** This would be the first Payload global in the project (Payload-first:
globals are built in, no custom persistence). It is read on every public request, so it wants a
read-through cache with a short TTL — and across two app containers the toggle propagates with that
delay, which should be stated in the admin UI rather than discovered.

**Test matrix is the real cost:** env × toggle = four states, and the existing 404 boundary must not
weaken in any of them.

---

## D2 — LAN resource links: an overlay, not version content (decided)

Scope settled: the target is **content already hosted on a LAN box** (RACHEL, Kolibri, a NAS), not
files on the school server and **not** `file://` paths on a teacher's own machine. The stored value is
therefore an ordinary `http://` URL to another host, so nothing in the URL-scheme rules
(`ingest/resourceLinks.ts` plus the render-time re-check in `generator/vendor/aresResources.js`) has
to change. That is the cheap part; the following are not.

**Storage: a deployment-local overlay, joined at render time** — NOT inside the immutable bundle.

The decisive argument is re-ingest. A re-upload of a sub-strand attaches as the next MAJOR version
(SPEC §7), so links stored in version content would be silently stranded on the old version the first
time ARES refreshes the corpus — the feature would be built and then lose every teacher's work on the
next content update. An overlay keyed to plan + lesson survives that. It also keeps the canonical
bundle portable and ARES-clean, and means the cloud deployment simply renders none of these links
rather than rendering URLs that resolve nowhere.

⚑ **Accepted cost, stated plainly: generator output stops being a pure function of the stored
strings.** SPEC §4's "regeneration is byte-stable" gains an asterisk, and the artifact cache key must
include an overlay revision alongside `GENERATOR_RENDER_VERSION`. Both are bounded and mechanical, but
the fidelity gates and cache-invalidation reasoning must be updated to know about the second input.

⚑ **Keying the overlay across versions is the unsolved detail.** Lesson numbers are set by order and
can move between major versions, so plan + lesson-number is not a stable key. Settle this before
building — a wrong key silently reattaches a teacher's links to the wrong lesson, which is worse than
losing them.

**Picker: parse a directory index at a configured content root.** A browser cannot enumerate another
host's filesystem, so a picker needs something to read. The chosen shape is a server-side fetch and
parse of a directory index at one or more configured content roots. Per-source adapters (a Kolibri
REST adapter, a RACHEL modules adapter) are deliberately NOT in v1; add one only if the plain index
proves too thin in real use.

**Everything else this touches:**
- It is a **new field**, never `resourceLinks` — that map is ARES-owned, system-only, lossless and
  validated, and a teacher-editable link must not be smuggled into it.
- The field-split (`hooks/fieldSplit.ts` `*_PROSE`) and its drift test: a structured link is not a
  prose string and needs its own edit-permission class.
- Edit recovery captures prose only, so link edits are not backed up — the role-aware save-state
  indicator must say so rather than implying a generic "saved".
- The rendering change is a **generator** change: per SPEC §4 make it upstream in ARES, re-vendor,
  bump `GENERATOR_RENDER_VERSION`, rerun the DOCX/PDF fidelity and pagination gates.

**Batch this with the attribution footer** (`DESIGN-public-library.md` slice 7). Both are upstream
generator changes and they pay the re-vendor + gate + cache-bump toll once instead of twice.

---

## D3 — Quizzes are formative self-study, never graded assessment (decided)

The stated goal is students studying **on their own time, without teacher intervention**. That is the
requirement that shapes the whole feature, and it is not the same product as a proctored classroom
quiz — proctored mode is a useful early slice, not a first step toward the real thing.

Five consequences, all of which are cheap now and expensive to retrofit:

1. **Phone-first, and it inverts the editor rule.** SPEC §5 states explicitly that phones are not an
   editing device. A student studying at home is on a phone. The quiz surface is the first part of
   this product where 360 px is the PRIMARY target rather than a courtesy — do not reason about it
   from the editor's constraints.
2. **Every question carries an explanation, not just a correct answer.** With no teacher present the
   feedback is the teaching. Retrofitting this means re-authoring the entire bank.
3. **Every question carries a concept/objective tag, from the first one written.** The adaptive
   re-questioning the product wants ("new questions on topics the student did not understand") is a
   mastery model per (student, concept). Nearly free now; impossible to backfill.
4. **Formative only — never graded.** Correct answers are inspectable in whatever response the client
   receives, and defending against that is exam-security work: a discipline this project does not want
   and one that sits badly beside SPEC §1's "not an LMS". Deciding this now avoids the question ever
   being reopened under delivery pressure.
5. **SPEC §1 must be amended, explicitly.** Per-student attempt tracking with remediation IS an LMS
   feature. The non-goal was a real decision and overriding it is the operator's call — but it lands
   as an amendment with reasoning, not as drift discovered later.

### The student principal

⚑ **PREREQUISITE, and it is the sharpest landmine in this whole plan.** DECISIONS 2026-08-16 already
records it: a separate auth collection is **not** an authorization boundary. Payload's JWT strategy
reads the collection from the token, loads that document, and puts it in `req.user`, so a student is a
perfectly valid `req.user` and every `Boolean(user)` gate admits them — silently, with no type error,
because `req.user` is cast to `User` in hooks throughout the codebase.

There are **8 such sites**: `access/index.ts` (`authenticated`, `usersCollectionRead`),
`access/versioning.ts`, `collections/Messages.ts`, `collections/Favorites.ts`, `lib/versionCounts.ts`,
`components/AdminDashboard/index.tsx`. They convert to the allowlist shape
`user?.collection === 'users'`. This is roughly half a session of work **if it lands before any
student can log in**, and a silent cross-collection data leak if it lands after. It gets its own PR
with its own wire-level tests.

### Identity: open self-registration, no PII (decided)

Students self-register with a username and password. **No email, no name, no date of birth.** This
maximises reach — it matches "every Kenyan student", including students whose school has not
onboarded — and it keeps the system from holding named minors' records.

⚑ **Four costs, all real, none of them blocking, and each needing a deliberate answer before the
student-account slice ships:**

1. **No recovery path exists by default.** No email means no reset link. A lost password is a lost
   account and a permanently lost study history. The cheapest mitigation that preserves the no-PII
   property is a **one-time recovery code generated at signup** and shown once for the student to
   write down or screenshot. Not yet decided; decide it with the slice.
2. **The existing signup rate caps do not transfer.** `hooks/authRateLimit.ts` keys budgets on the
   requested email address plus a site-global cap. With no address there is no per-identifier key, so
   open student registration on the internet needs a different keying (IP plus global) or it is an
   open bot-registration surface.
3. **Students will type their real names into the username field.** This is near-certain, not a
   hypothetical. The no-PII property is therefore a design intent the interface has to actively
   protect: never display a username on any public or cross-user surface, warn at signup, and treat
   the field as potentially-identifying for retention and deletion purposes.
4. **No school acts as data controller.** The school-mediated roster option would have made the
   school the controller of the code→child mapping and this app a processor of pseudonymous data.
   Open registration forgoes that, so the data-protection posture rests entirely on genuinely
   collecting nothing identifying. Point 3 is what makes or breaks it.

**Two entities the data model still lacks: a roster and a school.** `SubjectGrade` is a taxonomy node
(subject + integer grade), not a roster of students — and `class` is a reserved word here precisely
because that confusion was already ruled on (SPEC §8, §13). ⚑ Note that **pure self-study needs
neither**: a student account enrolled in subject-grades, studying alone, works with zero new entities.
Roster and school become necessary only for teacher visibility into results. That is a phasing lever,
and it is the reason the plan below can ship self-study before either entity exists.

### Question authoring — OPEN

Not decided. Three candidate sources: upstream in the ARES JSON bundle, AI-generated with Subject-Admin
review, or hand-authored in-app. The model must therefore be **source-agnostic with a provenance
field**, so all three land in the same shape and the choice can be made later without a migration.

Scale for context: ~10 questions per 40-minute lesson, five options each. One subject-grade of 6
sub-strands × 8 lessons is ~480 questions.

A related modelling question, also open: questions inside the immutable version means a typo fix costs
a new version; a separate mutable collection keyed to (plan, lesson) avoids version churn but splits
the source of truth. Same key-stability problem as D2's overlay, and worth solving once for both.

---

## D4 — The public interface is already designed

Feature 4 is `docs/DESIGN-public-library.md` slices 4 and 6, which were specified in detail on
2026-08-14 and never started: mobile-first (360–390 px primary), the lesson-is-the-proof page, Open
Graph/WhatsApp cards, related lessons, share actions. `/explore` exists today as a real route with an
enforced boundary and placeholder content.

⚑ **The prerequisite that design doc already flags stands:** the **Official-pointer lock**. Every
public route resolves through a plan's current Official pointer, and that pointer has an open
read-then-write race — an Official version can be deleted during a concurrent promotion, nulling the
pointer via `ON DELETE SET NULL` and destroying an approved snapshot. Close it, with a real concurrent-
Postgres regression test, before building the public contract on top of it.

---

## Sequence

| Phase | Work | Why here |
|---|---|---|
| 0 | Official-pointer lock | Known prereq, small, unblocks the public track |
| 1 | Deployment toggle (D1) | Cheap, and it defines what "cloud mode" means before the cloud surface is built |
| 2 | Public read slice (D4) | The "attract interest" goal, already designed — cheapest path to visible value |
| 3 | LAN resource links (D2) + attribution footer | One generator change, one gate run |
| 4a | `Boolean(user)` allowlist hardening | Own PR, own tests. **Must precede any student login** |
| 4b | Question model — source-agnostic, concept tag + rationale from day one | Unblocks authoring in parallel |
| 4c | Teacher-proctored quiz view, no student accounts | Proves the content with zero identity work |
| 4d | Student accounts + self-study, phone-first | Needs 4a; needs the recovery-code decision |
| 4e | Mastery model + adaptive re-questioning | Needs 4b's concept tags and 4d's attempt history |

Public discovery precedes quizzes because the stated goal for the online version is attracting
interest, and the public library reaches it for roughly a quarter of the cost — while the quiz
feature's slowest input, question authoring, is resolved off the critical path.

## Open questions

- Which source authors the quiz questions (and does the answer differ for the ARES corpus versus
  teacher-contributed content)?
- The recovery-code mechanism for student accounts, or an accepted decision that lost accounts are
  simply lost.
- The stable cross-version key for both the D2 overlay and any per-lesson question set.
- Exact SPEC §1 amendment wording for the LMS non-goal.
- Content-root configuration format for the LAN index, and behaviour when the index host is
  unreachable.
- Whether teacher visibility into student results is wanted at all — it is the only thing that forces
  the roster and school entities into existence.
