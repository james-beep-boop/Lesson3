# Next direction — deployment profiles, LAN resources, quizzes, public UI

**Status:** product direction agreed 2026-08-19; **materially amended 2026-08-20** after the operator
described the three real deployment contexts and after a closer reading of the Data Protection Act
2019; **consolidated 2026-08-21** into the single authority for the deployment model, after an operator
review tightened four contracts. ⚑ **"No code written" is no longer true** — D1's System panel shipped
its first slice (#265, corrected in #266, writer boundary in #268), so read the "where the shipped code
diverges" checklist in `docs/DESIGN-system-panel-2026-08-21.md` before treating this document as a
description of the code. Everything else here is still design. `SPEC.md` remains authoritative for the
resulting architecture; this document
separates what was decided from what the build still owes. Several items below AMEND `SPEC.md` and
must be folded into it before the corresponding slice is built — they are not licence to drift.

⚑ **One decision here SUPERSEDES an earlier one in this same file.** The 2026-08-19 identity model was
"open self-registration, no PII"; it is replaced by the two-tier model in D3, and the superseded
reasoning is kept there because the reason it fails is counterintuitive.

Four features were proposed. Three of them already have foundations in the repo, which is the main
reason the sequencing below is not simply "hardest last".

| # | Feature | Difficulty | Rough size |
|---|---|---|---|
| 1 | Deployment profiles + Manage panel | 2.5/5 | 2–3 sessions |
| 2 | Teacher-added links to LAN-local content | 3/5 | 2–4 sessions |
| 3a | Quizzes, tier 1 — anonymous practice | 3/5 | 3–5 sessions |
| 3b | Quizzes, tier 2 — on-prem roster accounts | 5/5 | 8–15 sessions |
| 4 | A better public interface | 3/5 | 3–4 sessions |

⚑ **The tier split is the single biggest change from the 2026-08-19 draft**, and it cuts the cost of
reaching a usable, publicly-launchable quiz product by roughly two thirds — tier 1 carries no identity
model, and a **much smaller** compliance surface than accounts would (⚑ not "none": see the anonymity
caveat under D3 — online identifiers count toward identifiability in Kenyan law, so logging, telemetry
and rate-limit keys are in scope and need review before launch).

---

## D1 — Deployment: an env ceiling and capability flags (decided; expanded 2026-08-20, presets DEFERRED 2026-08-21)

### The three deployment contexts (operator input, 2026-08-20)

| | ARES schools | SeaVuria schools | Online |
|---|---|---|---|
| Internet | **None at all** | Limited | High-speed |
| Hardware | Intel/Ubuntu, 8–16 GB RAM, 500 GB | Same | Server |
| Devices | ~20 school laptops per school; teachers may bring their own | Same | Teachers' own |
| Students | 100–1000 on roll; **≤50 concurrent** | Same | Open |
| Student phones | Generally none — teachers only. Changing in urban areas (basic phones, possibly hundreds) | Same | Yes |
| Power | Unreliable | Unreliable | Reliable |

Teachers' phones carry very limited, personally-charged data — adequate for WhatsApp and email, not
for document downloads. **Plan for schools with more tablets and higher-capacity servers**; the
architecture does not change, only the sizing.

### The model: capabilities are the truth; school types may later become presets

`PUBLIC_LIBRARY_ENABLED=1` (`lib/publicLibrary.ts`) already IS a deploy-time switch: off means no
Explore action and a server-side 404 from every public route. The new work sits on top of it.

- **`PUBLIC_LIBRARY_ENABLED` (env, boot) stays the capability ceiling** — "this deployment MAY be
  public". Unchanged semantics, unchanged boot refusal when set without `SERVER_URL`.
- **Runtime capability flags** (a Payload global) are the truth about what this installation offers.
- **If presets are introduced, the three school types become presets over those flags**, not a mode
  enum. Selecting one would seed the flags; the flags would stay individually visible and overridable;
  the label would read **Custom** once an operator deviates. Presets are deferred below.

⚑ **Why any future presets must beat a three-way enum.** The operator has already said some schools want some
features and not others, and "SeaVuria: limited internet" is not a third mode — it is
mostly-offline-with-some-egress, where *which* egress (email, updates, AI, backups) are separate
answers. An enum accumulates exceptions until it means nothing. A bare grid of a dozen checkboxes is
the opposite failure: it invites incoherent combinations. A preset that seeds visible, overridable
flags is the shape that survives both.

⚑ **Any future preset must never be a security boundary.** Selecting "Online school" on a box with no
`SERVER_URL` must not enable public discovery, and must not enable student roster login (see D3). The
profile is a convenience over runtime flags, strictly inside the env ceiling.

⚑ **NOT one master switch labelled "offline mode".** Several things that make up "cloud mode" are
process-level and read at boot — `SERVER_URL` drives the CSRF allowlist and Secure cookies
(`lib/publicPosture.ts`), and Sentry/SMTP/Gotenberg are wired at startup. A toggle that implies it
controls network egress while actually controlling UI surfaces is exactly the reserved-word failure
SPEC §13 warns about: a label asserting something the code does not mean.

### ⚑ THE FIVE LAYERS (operator, 2026-08-21 — this is the model everything below serves)

Every capability question in this project is one of five, and confusing two of them is how a label ends
up asserting something the code does not mean:

| Layer | Example | Authority |
|---|---|---|
| **Capability present** | SMTP configured, Gotenberg installed | Packaging / console |
| **Hard ceiling** | `PUBLIC_LIBRARY_ENABLED` | Environment + restart |
| **Operator intent** | `publicLibraryLive` | System settings |
| **Observed condition** | PDF engine reachable, backup last success | Probe / operational record |
| **Enforcement** | Public route, email-send boundary | Server code |

Read the panel's two halves as: *observed condition + capability present + hard ceiling* on top,
*operator intent* below, and **enforcement is never in the panel at all** — it is server code that reads
the intent. ⚑ The System panel is an **observation-and-control surface, never a deployment
orchestrator**: it does not install, start, build or fetch anything (see F).

### The Manage panel has two parts, because the settings differ in kind

⚑ **THE PANEL IS CALLED "System"** (operator decision 2026-08-21; this section said "Installation"
until then). "Installation" is too narrow for the half that holds switches — turning outbound email off
is not an installation fact — and "System Administration" was rejected because it would sit inches from
**Site Administrator** and **Subject Administrator** on a page whose role vocabulary has already cost
this project rework twice ("Editor" as a user type, `draft`). The other boxes are `Users`, `Curriculum`,
`Lesson plans`; "System" is parallel with them.

The ids are therefore `system`, `system.deployment`, `system.features` in `PANEL_IDS`
(`components/Manage/panelState.ts`), a flat registry with `parent.child` nesting — the closed-vocabulary
parsing and `?open=` handling come for free, and they are a URL contract once shipped.

1. **Deployment — read-only, and never operator-authored here.** Base URL, public-library capability,
   email configured, error tracking, PDF engine reachable, artifact-cache usage, backup last success and
   destination. ⚑ A toggle that silently does nothing until restart is worse than no toggle; this is the
   half that cannot be runtime-switched, and it must look like it — so each row names the env var that
   decides it. ⚑ **"Read-only" is the rule, NOT "computed"** (corrected 2026-08-21): some rows are
   computed live from env plus a probe, and others — backup last success above all — are *recorded
   operational state* that cannot be reconstructed from the current environment. Both belong here; what
   none of them may be is written by an operator on this screen.
2. **Features — real toggles, and only where there is something to toggle.** ⚑ **One flag is real
   today:** public library live/off. The general email flag is DECIDED ABSENT: #268 dropped its
   speculative column, `SMTP_HOST` remains the deployment ceiling, auth-critical mail is not
   operator-switchable, and any future optional-email control must be capability-specific. **Student access and AI/translation get no column and no working
   switch** — they are not built anywhere, which is the "not built" state in D, distinct from "present
   but off". ⚑ They render as **disabled rows in this Features half, carrying the true reason**, which
   is D's treatment for that state — not as Deployment facts. (Corrected 2026-08-21: this said "they
   appear as facts", contradicting the four-state table two sections down. The table is right: a
   Deployment fact is for a capability that is BUILT but absent from this box, which an operator can
   act on; "not built anywhere" is a roadmap statement and belongs where the switch would be.)

⚑ **PRESETS ARE DEFERRED** (operator decision 2026-08-21). The three school types remain the right
shape *once there are enough flags for a preset to mean anything*; with two usable switches a preset
adds vocabulary without adding value, and "Custom" would be the label almost every installation carried.
Revisit when the flag set grows — the reasoning for presets-over-enum above is unchanged and still
applies then.

### The contracts this rests on (folded in from the 2026-08-21 amendments, accepted 2026-08-21)

**A — the flags are a security surface.** ⚑ **NO ORDINARY WRITE IS PERMITTED AT ALL, Site
Administrators included** (corrected 2026-08-21; this said "Site-Administrator-only", which is what
part 1 shipped and what the operator's review rejected). A settings write must carry password
re-authentication, a freshness token, an acknowledgement and provenance, and a plain REST call carries
none of them — so `access.update` is `() => false` and the custom Save endpoint is the sole writer,
using trusted internal access after doing its own authorization. ✓ **Implemented in #268**, with the
wire test's load-bearing case being a **Site Administrator** refused; and ⚑ note that on that trusted
internal path `overrideAccess: true` bypasses FIELD access too, so provenance is protected by the
`beforeChange` hook alone — field rules do nothing there.
⚑ **The route is `POST /api/globals/system-settings`, not PATCH.** Measured: POST → 403, PATCH → 404,
PUT → 404. Payload routes a global update as POST, so a PATCH-based test probes a route that does not
exist and passes for the wrong reason. Reads stay Site-Admin-only, and omitting the panel is not a
boundary because a global is reachable through its own REST/GraphQL routes. Reads for the public path
go through a server-only module. **Fail closed:** the
route asks "is discovery live right now?", and absence, a read error, a never-created global, or a
cached `true` past its TTL all mean **no** — a read-through cache that serves its last value on error
converts a database blip into an indefinite public exposure no operator action ended. On a read error,
return off *without* caching it. ⚑ **And emit a structured operational error** (added 2026-08-21):
otherwise a database or configuration failure is indistinguishable from a deliberate off. The TTL is
the exposure window and must be **a stated number** in the admin copy; ⚑ a TTL is not a take-down —
the hard kill stays the env ceiling, the only control that still works when the database is the thing
misbehaving.

**B — do not read the global in Next middleware.** `src/middleware.ts` mints the CSP nonce with Web
Crypto and declares no runtime, so it is Edge and cannot reach Postgres. A node-runtime middleware
exists on Next 16, but switching moves the Phase 5 A3 strict-nonce path (pinned by `tests/http`) onto a
different runtime. Resolve the flag in the route handler beside the existing `lib/publicLibrary.ts`
gate, which is where the 404 boundary already lives.

**C — no `mode: 'offline' | 'online'`.** Refused by name because it will be proposed again. It
contradicts the ceiling, presets-over-enum and not-one-master-switch decisions above, and a DB-stored
`mode` writable from the admin UI means one compromised Site-Admin account can put a school on the
internet.

**D — capabilities have FOUR states, and a toggle may express only one.**

| State | Means | Where it belongs | How it changes |
|---|---|---|---|
| **Not built** | no code exists anywhere | Features, disabled, with the true reason | a future PR |
| **Absent** | built, but not on this box | **Deployment facts**, with an instruction | operator action at the console |
| **Present, off** | on disk, gated | Features, toggle off | Site Admin flips it |
| **Present, on** | running | Features, toggle on | — |

⚑ **Never render a toggle for something absent** — a switch that does nothing when flipped is the same
failure as the master switch C refuses. ⚑ **And a toggle only renders when its ceiling is present**
(added 2026-08-21): no `publicLibraryLive` switch without `PUBLIC_LIBRARY_ENABLED`, no email switch
without SMTP. Those rows appear as facts instead.

**E — ONE APPLICATION ARTIFACT, not build variants** (narrowed from "one image" 2026-08-21, because the
deployment separately carries `app`, `migrate` and `gotenberg` images, and school boxes run font-less
while the online tier does not). The online deployment is the superset; school deployments are subsets
of the same application build. Two build variants double the test matrix and fail as "works in the
cloud build, broken in the school build", discovered in a school with no internet to report it. Compose
profiles add sidecars; conditional Payload registration is available if routes must be absent too —
⚑ but **codegen must always run with every feature ON**, because `migrate:create` diffs live config
against the committed snapshot and would emit a migration that DROPS the tables of anything switched
off.

**F — the app must NEVER be able to start containers.** Mounting the Docker socket is root on the host:
a web-app RCE becomes host compromise, on a machine in a school with nobody to notice. The toggle
records intent; an operator or a privileged reconciler outside the app acts on it. On an air-gapped box
"install" cannot mean "download" anyway.

**G — two gaps this section still has.** ⚑ **The online tier is unsized**: every number in D1 is
per-school (~50 concurrent, 8–16 GB) while the online deployment is now the primary product, and the
jobs queue runs `autoRun` in-process on one container, Gotenberg is capped at 2 CPUs, and the
rate-limit budgets were sized for a school. ⚑ **Student access needs its own env ceiling**
(`STUDENT_ACCESS_ENABLED`), so no UI flip can put a school into student mode.

**Test matrix is the real cost:** env × flags, and the existing 404 boundary must not weaken in any
combination — plus the failure and authorization axes, which is where a fail-closed design is actually
decided: global absent; read throws; a cached `true` past its TTL with the DB down; ⚑ **a SITE ADMINISTRATOR's direct `POST /api/globals/system-settings`
refused at the wire** — the case that matters, because every other role failing only proves ordinary
access control works; the same POST attempted by a Teacher and by a Subject Administrator;
unauthenticated read of the global's REST endpoint; and the flag flipped off taking effect within the
stated TTL.

### Four consequences of the hardware picture that were not in the original plan

1. ⚑ **On an ARES school, every ARES resource link is dead.** `resourceLinks` renders YouTube and web
   URLs into every Section C cell of every generated document. With no internet they all fail — and
   these are a headline feature of the lesson plans, not a cosmetic detail. **This reframes D2: LAN
   links are not an enhancement for offline schools, they are the replacement.** It also suggests an
   offline deployment should render ARES links as plain text with a note rather than as dead
   hyperlinks — the same render-time seam, and another argument for the overlay.
2. **Backups offline — SOLVED IN SPEC §11, with one piece outstanding** (updated 2026-08-21; this
   said "no story offline… an unacknowledged gap", which was true when written and is no longer). §11
   now defines it: encryption and retention are constant and only the DESTINATION varies — offline
   schools back up to a **rotated removable drive** via rclone's local backend, so `age` encryption,
   GFS retention and pruning are unchanged; "off-site" is a property of the drive's location, so the
   guarantee comes from rotation, which is a human process the school owns; a missing drive must FAIL
   rather than silently create a directory on the root filesystem; and schools hold only the `age`
   PUBLIC key. ⚑ **Resolved and built 2026-08-21:** `backup-db.sh` atomically writes the authoritative
   last-success record after upload; the app reads it through a read-only mount and surfaces it in
   Manage → System. It is recorded state, not something a probe can compute.
3. **Unreliable power + Postgres.** Postgres is crash-safe by default (`fsync`, `full_page_writes`),
   but consumer SSDs that lie about flush can still corrupt on hard cuts. **A small UPS is the
   highest-value item on the bill of materials.** Also needed: unattended clean restart, and a decision
   on in-flight jobs.
4. **RAM is the constraint, not disk, and quizzes are not what strains it.** 500 GB is enormous for
   text. ≤50 concurrent quiz users is trivial — small JSON, no document generation. The competition is
   Gotenberg/LibreOffice (0.4–1 GB, CPU-spiky) against Node + Postgres + OS on 8 GB. **The sizing rule
   for small boxes: pre-warm artifacts at ingest and keep on-demand PDF generation off the box during
   class hours.**

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

There are **six such gates**, and two dependent paths that must be named separately because they do
NOT convert the same way:

- **Six direct `Boolean(user)` gates**, all of which become the allowlist shape
  `user?.collection === 'users'`: `access/index.ts` (`authenticated`, `usersCollectionRead`),
  `access/versioning.ts` (`lessonPlanRead`, `lessonBundleVersionRead`), `collections/Messages.ts`
  (`access.create`) and `collections/Favorites.ts` (`access.create`).
- ⚑ **`lib/versionCounts.ts` has no gate to convert.** `versionCountsByPlan(payload)` takes **no user
  parameter at all** and runs an unscoped raw-SQL aggregate, so a conversion pass that sweeps for
  `Boolean(user)` walks straight past it. It needs its own boundary, enforced by its caller before the
  query — which is a different piece of work from a find-and-replace.
- `components/AdminDashboard/index.tsx` sits behind `adminPanelAccess` (`collections/Users.ts`), not a
  direct gate. Listed only so nobody "converts" it and concludes the panel was the exposure.

This is roughly half a session of work **if it lands before any student can log in**, and a silent
cross-collection data leak if it lands after. It gets its own PR with its own wire-level tests.

⚑ *Corrected 2026-08-21: this paragraph said "8 such sites" and listed six files, conflating the gates
with the dependent paths. Verified against the code rather than recounted from the list — the
`versionCounts.ts` entry is the one the original framing would have mishandled.*

### Identity: a two-tier model (decided 2026-08-20 — SUPERSEDES the open-self-registration decision)

⚑ **THE ANONYMITY CLAIM IS A DESIGN INTENT, NOT A LEGAL CONCLUSION** (operator correction 2026-08-21).
Earlier drafts of this section said the Act "never engages", that aggregates are "genuinely anonymous",
and that tier 1 carries "no legal exposure". Those absolutes are removed. Kenyan law includes **online
identifiers** in what makes a person identifiable, so IP logs, session identifiers, rate-limit keys,
analytics and sufficiently granular event records can matter even with no accounts — and §33 of the
Data Protection Act 2019 requires parental or guardian consent and age-verification mechanisms where
children's personal data is processed (see the ODPC's guidance note on children's data). The claim this
document makes is therefore:

> Tier 1 is **designed** to avoid per-person persistence. Whether it is anonymous in law depends on the
> complete logging, telemetry, rate-limiting and aggregation implementation, and requires review before
> public launch.

⚑ Note the interaction with §D1's rate limiting: the abuse controls tier 1 needs are exactly the thing
that would create per-person identifiers, so the limiter's keying and retention are part of this review
rather than a separate concern.

⚑ **This replaces the 2026-08-19 decision recorded here, which was "open self-registration, no PII".**
That decision rested on the premise that collecting no name or email keeps the system out of scope.
A closer reading of the Data Protection Act 2019 shows it does not, and the reasoning is worth keeping
because it is counterintuitive to anyone reasoning from US or EU norms:

- **Kenya defines a child as anyone under 18** (Constitution Art. 260; Children Act) and the DPA has
  **no digital-consent step-down age** — no GDPR 13–16, no COPPA under-13. Every primary and secondary
  student is a child and **s.33 applies to all of them**.
- **s.33 requires parental/guardian consent, best-interests processing, and age-verification
  mechanisms.** An anonymous self-registration flow has no parent to ask and no way to verify age; it
  fails both statutory mechanisms by construction.
- **Pseudonymity is not anonymity.** The DPA covers data relating to an *identified or identifiable*
  person. A persistent account — or a written-down code a student re-enters — singles out an individual
  over time, which is what makes data personal. **The name is not what puts you in scope; the
  persistent identifier is.**

**The model is therefore two tiers, and the split is by deployment:**

| Tier | Where | Data held | Compliance posture |
|---|---|---|---|
| **Anonymous practice** | Everywhere, incl. public internet | None per person. Aggregate counters only | Designed to avoid per-person persistence — see the caveat below |
| **Roster accounts** | On-premises installations ONLY | Persistent progress, cross-session adaptivity, teacher visibility | School obtains s.33 consent and is the controller; ARES is a processor |

**Tier 1 — anonymous practice.** No account, no login. Quiz state lives in the page for one sitting;
the server stores nothing per person. It still delivers the full question set, immediate right/wrong,
the explanation, and **in-session adaptivity** ("three wrong on photosynthesis → here are more on
photosynthesis, now"). What is lost is strictly *cross-session*: history, long-term progress, and
adaptivity informed by earlier sittings.

This tier is also the **growth surface**. Zero signup friction, and a quiz is a few KB of JSON — by far
the cheapest thing this product can distribute over the metered phone connections Kenyan teachers
actually have, and much cheaper than a PDF. ⚑ Honest trade-off: with no account there is no return
mechanism, so distribution has to come from sharing and content rather than a habit loop. A
score-and-share mechanic works — **keep it to numbers**, because any nickname field re-introduces a
user-supplied identifier and puts the tier back in scope.

Aggregate statistics ("43% missed Q7") are intended to carry nothing per person, are the shape to collect, and are
independently valuable: they tell ARES which questions are broken.

**Tier 2 — roster accounts, on-premises only.** Schools enrol students; the school obtains parental
consent and acts as data controller; the data lives on the school's own box and never reaches the
internet. ARES/Lesson3 is a **processor**, whose duties are materially lighter than a controller's:
security, breach notification to the controller, and acting only on the school's instructions.

⚑ **Note the inversion for shared devices.** ARES/SeaVuria schools run ~20 laptops for 100–1000
students, so lab machines turn over every 40 minutes. SPEC §13's shared-machine rules apply to students
with full force — session expiry must clear the screen. And because client-side persistence is
forbidden there, a roster account matters MORE on a shared laptop, not less: without one there is no
way to resume, and the browser cannot be trusted to remember.

### Enforcing "roster data never reaches the internet" (decided 2026-08-20)

**The boundary is posture, not the profile toggle.** Roster accounts require a **non-public posture**:
if `SERVER_URL` is set, student login is refused **server-side in the access functions**, regardless of
any admin toggle. Hanging this on the school-type profile would make a product convenience into a
security boundary — the same mistake D1 exists to prevent.

⚑ This handles SeaVuria correctly, which is why posture is the right primitive: limited internet *at
the school* is not internet exposure *of the app*. A SeaVuria box keeps its roster.

⚑ **Plus a boot refusal**, in the same fail-loud shape as `firstUserBootRefusal` (`lib/publicPosture.ts`):
setting `SERVER_URL` on an installation that still holds student data must **refuse to boot**, naming
the remedy. That is what makes the guarantee structural rather than aspirational.

**Switching an installation to a public posture: export-then-erase, never archive-in-place.**

⚑ "Archive but otherwise delete" was the initial proposal and it does not survive contact with the
DPA: **archiving IS retention.** An archive of student records is still children's personal data, held
without a defined purpose or period. The defensible disposal is an **encrypted export handed to the
school** — the controller, and the only party with a legitimate reason to keep it — followed by a hard
delete from the app.

⚑ **And the mode switch must BLOCK, never ACT.** Coupling destruction to a toggle puts a thousand
study histories one misclick away, including from an admin who only wanted to see what cloud mode looks
like. The sequence is:

1. Admin selects a public posture → **refused** while student data exists, with the reason stated;
2. Admin runs an explicit, separately-confirmed **Export and erase student data** action;
3. Only then does the posture change complete.

Same guarantee, no destructive side effect, and the erasure becomes a deliberate act with a record —
which is also what a regulator would expect to see. Note this is a rare **guard** case rather than a
workflow: nobody converts a school's Intel box into a cloud server, so the realistic triggers are
decommissioning and misunderstanding. Do not over-engineer it.

### Compliance work that does not need a lawyer (2026-08-20)

There is no counsel engaged. The two-tier design is what makes that tolerable: the online deployment
holds nothing per person by design — though whether that amounts to no personal data in law depends on
the identifiers the implementation actually keeps (see the caveat under D3) — and for on-prem rosters
the **school** carries
the controller's duties.

Doable in-house: a data-processing agreement template for schools; a parental-consent form template the
school administers (supply it, or the consent will not happen); a written retention policy for quiz
data, extending SPEC §11's existing retention discipline; and a short DPIA (s.31 — large-scale
processing of children's data is a textbook trigger).

⚑ **Three questions genuinely need a professional** — hours, not a retainer — and **none of them block
phases 0–3**, which touch no student data at all:

1. Must ARES itself register with the ODPC? (The Registration Regulations 2021 exempt entities under
   KES 5m turnover *and* fewer than 10 employees, but mandatory categories override the threshold;
   education is likely among them — **verify**.)
2. Is education within the s.50 localisation schedule? If it is, the online deployment **must** be
   hosted on servers in Kenya — not a documentation exercise but a hard constraint. ⚑ Tier 1 is
   designed to reduce this issue, but "holding no personal data" is not established until the required
   implementation review has covered identifiers, logging, telemetry, rate-limit keys and aggregation;
   it remains decisive for any future roster-on-cloud configuration.
3. Does the controller/processor split hold as described above?

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
| 1 | System panel (D1) — env facts and capability flags (⚑ presets DEFERRED 2026-08-21) | Cheap, and it defines what each deployment IS before anything branches on it |
| 2 | Public read slice (D4) | The "attract interest" goal, already designed — cheapest path to visible value |
| 3 | LAN resource links (D2) + attribution footer | One generator change, one gate run |
| 4a | `Boolean(user)` allowlist hardening | Own PR, own tests. **Must precede any student login** |
| 4b | Question model — source-agnostic, concept tag + rationale from day one | Unblocks authoring in parallel |
| 4c | **Tier 1: anonymous practice** — no accounts, in-session adaptivity | Zero identity work; much smaller compliance surface (not zero — pre-launch review of identifiers/logging required). Also the growth surface |
| 4d | Teacher-proctored classroom view | Rides 4c's engine; still no student accounts |
| 4e | **Tier 2: roster accounts**, on-prem only, posture-gated + boot refusal | Needs 4a. The only phase that processes children's data |
| 4f | Cross-session mastery model + adaptivity | Needs 4b's concept tags and 4e's attempt history |

⚑ **Phases 0–3 touch no student data at all**, so they proceed regardless of how the compliance
questions resolve. That is convenient rather than accidental — it was a reason for this ordering.

⚑ **4c now precedes the roster work rather than following it.** The anonymous tier was originally
framed as a warm-up; the two-tier decision makes it a shipping product in its own right — the public
growth surface — and it needs no identity model. It may launch without a per-user consent flow only if
the pre-launch review of identifiers, logging, telemetry and rate limiting concludes that the
implementation processes no children's personal data; otherwise the consent and age-verification
requirements described above apply.
Public discovery still precedes it because the library is already designed and question authoring is
the slowest input in the whole plan.

## Open questions

**Product**
- Which source authors the quiz questions (and does the answer differ for the ARES corpus versus
  teacher-contributed content)?
- The stable cross-version key for both the D2 overlay and any per-lesson question set.
- Content-root configuration format for the LAN index, and behaviour when the index host is
  unreachable.
- Whether teacher visibility into student results is wanted — it is the only thing that forces the
  roster and school entities into existence.
- Exact SPEC §1 amendment wording for the LMS non-goal.

**Operations**
- ~~The offline backup mechanism~~ — **resolved 2026-08-21; built in the backup-status follow-up.**
  Rotated removable drive, same `age` encryption and GFS retention (`rclone`'s local backend takes a
  mounted path). The script requires a separately backed mount plus a regular non-symlink sentinel,
  holds the destination directory open, and rechecks its mount identity around upload so a missing
  drive FAILS rather than silently writing to the root filesystem. The System panel reads the local
  last-success record (there is no healthcheck ping offline), and `docs/OPS.md` carries the runbook.
- UPS is in place at schools with unreliable power (operator, 2026-08-20), so hard-cut corruption is
  a residual risk rather than an expected event. Unattended clean restart still wants verifying.
- In-flight job behaviour across hard power loss.

**Legal — needs a professional; blocks nothing before phase 4e**
- Must ARES register with the ODPC?
- Is education within the s.50 localisation schedule? (Decisive only for a roster-on-cloud
  configuration, which the current design excludes.)
- Does the controller/processor split hold as described in D3?

**Resolved 2026-08-20, recorded so they are not reopened by accident**
- ~~Recovery-code mechanism for student accounts~~ — moot for tier 1 (no accounts); tier 2 accounts
  are school-issued, so reissue is the school's action.
- ~~Whether "no PII" exempts open self-registration from s.33~~ — it does not; see D3.
- ~~Roster accounts on the cloud deployment~~ — excluded by design; posture-gated and boot-refused.
