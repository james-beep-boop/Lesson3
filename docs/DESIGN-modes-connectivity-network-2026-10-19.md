# Standard/Advanced mode, connectivity, and the school network — direction (2026-10-19)

**Status: DIRECTION AGREED, NOT A BUILD PLAN.** Everything below came out of an operator discussion on
2026-10-18/19. It records decisions and the reasoning behind them so a later session can turn each
part into its own plan. **Nothing here is approved for implementation** except where §8 says so, and
each part still needs a proposal → operator approval → build, like any other change.

**Sequencing (operator, 2026-10-19): Combine phase 4 is completed first.** The main work in this
document waits. §8 lists the two small items worth doing alongside phase 4 now.

Read with: `SPEC.md` §5/§6 (drafts, Combine), §8 (the three user types), `docs/DESIGN-insert-link-ares-
2026-10-18.md` (ARES links, `ares.local`), `docs/DESIGN-update-draft-2026-10-19.md` (phase 4), and
`globals/SystemSettings.ts` + `lib/systemFlagNames.ts` (the existing settings switchboard).

---

## 1. The problems

1. **Feature accumulation.** Combine versions, Download as JSON, Insert link, Email documents and
   more are useful to a few teachers and clutter the screen for most. The editor toolbar already had
   to be fixed for wrapping at 1280px.
2. **Installations differ by internet access, and much depends on it:** links, backups, the Microsoft
   fonts, how new ARES releases of the lesson plans arrive (ARES is still iterating v1.0.0, currently
   about every two weeks), whether email works, app updates, and collaboration beyond one school.
   **Most schools will have no internet at all except teachers' mobile phones.**

## 2. Standard / Advanced mode

### Decisions
- **Advanced mode adds a "More ▾" menu; Standard mode hides it.** Each teacher-facing screen has its
  own More menu (editor toolbar, lesson page, catalogue rows, personal Manage sections). Everyday
  actions stay in the main row in both modes.
- **Display only, never authorization.** The More menu shows only actions the person may already
  perform. A hidden action still works through the API; permissions are unchanged.
- **Scope: everything teachers use.** Administrator tools (Roles & Access, uploads, users, system
  settings) are **never** hidden by the mode — they are already role-gated, and hiding them from an
  administrator who chose Standard would only confuse. The personal Manage sections (Your Drafts, My
  saved versions) **do** follow the mode.
- **Who sets it — most specific wins:** a person's own choice → their subject-grade's → the site's.
  - Site Administrator sets the **site default (Standard)** on the Manage switchboard.
  - A Subject-grade administrator may override it for their subject-grade.
  - Each person may override it for themselves (account menu).
  - Every level has a third value, **"use the default"**, so "I chose Standard" differs from "I never
    chose". **No locks at first** (a later option: "no overrides below this level").
- **Context rule:** on a lesson's pages, **that lesson's subject-grade** setting applies (a teacher in
  two subject-grades may see different modes in each). Pages spanning subject-grades (the catalogue,
  Messages) use the person's own choice or the site default.
- **Say where the setting comes from**, e.g. account menu: "Advanced — set by the Biology Grade 10
  administrator. Change for yourself."

### Design constraints for the build
- **One registry**: a single module maps each action → `everyday | more`. Screens ask it; nothing
  reads the three levels directly except one resolver (`effectiveMode(user, subjectGrade?)`).
  Otherwise the mode becomes scattered `if`s and every test runs twice.
- Storage: three small values — a field on the `system-settings` global, one on `SubjectGrade`, one
  on `User`. The SubjectGrade field is writable by that subject-grade's administrator (existing
  per-subject-grade access), the User field by the user. Changes on the switchboard keep its
  existing audit trail (`flagChanges`).
- The Guide and USER_GUIDE describe the More menu once ("If you don't see an action, ask your
  administrator or switch on advanced tools in your account menu"), not two versions of every page.

### Inventory — operator to mark up before the plan
Suggested placement in **bold**; `?` = operator decision needed. "Net" = needs internet.

| Screen | Action | Suggested | Net |
|---|---|---|---|
| Lesson page | Edit / Continue editing | **everyday** | – |
| Lesson page | PDF, Word (primary document) | **everyday** | – |
| Lesson page | Add to favorites | **everyday** | – |
| Lesson page | Request editing access | **everyday** | – |
| Lesson page | Make Official (administrators) | **everyday** (admin role-gated) | – |
| Lesson page | Compare / versions chip | **more** `?` | – |
| Lesson page › Share | Download all — Word / PDF (.zip) | **everyday** `?` | – |
| Lesson page › Share | Download one document | **everyday** | – |
| Lesson page › Share | Download as JSON | **more** | – |
| Lesson page › Share | Email all — Word / PDF | **more** | yes (SMTP) |
| Lesson page › Share | Message a colleague | **everyday** `?` | – (local) |
| Lesson page › Share | Discuss this version | **everyday** (if Discussions on) | – (local) |
| Editor toolbar | Save as new version / Save as draft / Discard changes | **everyday** | – |
| Editor toolbar | Quick preview, Formatted PDF | **everyday** | – |
| Editor toolbar | Help, jump-to-section | **everyday** | – |
| Editor toolbar | Show details | **more** | – |
| Editor toolbar | Insert link | `?` — everyday on ARES machines may be right | – |
| Editor | Combine versions (and "Combine with {version}") | **more** | – |
| Catalogue row | PDF, Word, favorite, versions chip | **everyday** | – |
| Manage › My saved versions | open / delete | **everyday** | – |

The inventory must be re-checked against the code when the plan is written (search the screens for
buttons/links); this table was taken from `lessons/[id]/page.tsx`, `ShareMenu.tsx`, `EditActions.tsx`,
`LessonControls/index.tsx`, `DocButtons.tsx` and the catalogue components on 2026-10-19.

## 3. Connectivity and exposure — two separate settings

### Decision: never fold these into one toggle
- **Connectivity** — can this server reach the internet? Governs email, fetching ARES releases and
  app updates, cloud backup, and sync with the hub.
- **Exposure** — who can reach this server? School network only, or the public internet. Governs
  link addresses (`ares.local` vs public, Plan A+ in the Insert link design), the public library, and
  security posture. **This already exists** as the public-posture switch (`SERVER_URL`, see
  `docs/OPS.md` "Going public").

A school machine with full internet is *connected* but *school-only* and still wants `ares.local`
links; one combined toggle would get that machine wrong.

### Connectivity levels
| Level | Internet | Behaviour |
|---|---|---|
| **Offline** (default) | Never at runtime | Everything local. Updates and ARES releases arrive by USB or a one-off tethered download. All network features hidden. |
| **Occasional** | Sometimes — typically a phone hotspot, or overnight | Outgoing changes and messages queue; sync runs when **a person starts it** ("Sync now"). |
| **Online** | Always | As Occasional, plus an optional **automatic sync** setting (off by default) for schools with good, cheap internet. |

- **"Internet only at install" is an installation procedure, not a level.** A technician tethers to
  a phone once to download the release bundle (app + Microsoft fonts + current ARES content) and the
  machine is then Offline. The release bundle and installer must support exactly that: one download,
  sized for a phone connection, then nothing. (Fonts are built into the Gotenberg image at build
  time; an offline machine must receive a pre-built image — the published release containers already
  do this.)
- **Offline-first principle:** every core feature works with no internet; internet only adds. So
  "occasional" is not a third architecture — it is online features that queue, retry, and say they
  are waiting.
- **Clocks:** an offline machine's clock may be badly wrong (no NTP; a flat clock battery after a power
  cut). Sync must never decide "which is newer" by timestamp — only by ids and recorded ancestry.
  Messages and posts show the hub's time where known.
- **Mobile data is expensive.** Sync sends only changes, compressed, resumable after a dropped
  connection, and shows its size before starting. **App updates (hundreds of MB of container images)
  never download automatically over a phone connection** — USB bundle, or an explicit "Download
  update (N MB)".

## 4. Home access and the hub

### Decisions
- **Near term — option A:** a school machine *with internet* may be made reachable from home through a
  tunnel run **by the server** (Cloudflare Tunnel or Tailscale Funnel). **Nothing is installed on
  teachers' phones** — they use a normal web address. Unreliable availability is acceptable ("these
  teachers are used to unreliable internet"). Requires the public security posture (OPS "Going
  public"), and `ares.local` links will not work from home unless ARES content is also reachable
  (Plan A+).
- **Long term — option B, a central hub:** the operator will run one online Lesson3 in a **hub role**.
  It is **not** in every install. School machines sync with it when they have internet (person-started
  by default, automatic where configured). It serves home access (the hub's copy as of the last sync),
  collaboration between schools, the ARES content feed, and the app update feed.
- **One machine per school.** For the hub, a machine *is* a school. ("Mesh" means the school's own
  Wi-Fi, not links between schools — schools never sync with each other directly.)
- **Using phones:** the recommended route is **the phone as the server's internet connection** (a
  hotspot, then "Sync now"). A phone acting as a courier (store-and-carry) is a possible later
  addition, not the plan — it needs an app or offline web app and is fragile on iPhones.
- **Machine enrolment:** each school machine gets its own hub credentials once (an enrolment code the
  technician enters at install), revocable if the machine is stolen. Separate from teachers' accounts.
- **Everything network-related is hidden until the site administrator enrols the machine** with the
  hub. Enrolment is also when the privacy notice and consent appear (§7). This is a second, separate
  layer of hiding from Standard/Advanced.

### Sharing between schools
- **Only what a school chooses to share** goes to the hub.
- **Who may share:** teachers with editing access in that subject-grade.
- **How shared versions arrive:** as **Not Official** versions in the same lesson plan, labelled with
  the school they came from. The subject-grade administrator decides whether to make one Official or
  combine it. They never become Official automatically.
- If the receiving school lacks that lesson plan, the hub supplies the ARES original it was built on
  (content fingerprint — §5 — makes that safe).
- At an offline school, "bring in" is queued and arrives at the next sync; the screen says so.

### The "All schools" forum
- Lives on the hub; school machines hold a copy; posts written offline go out at the next sync.
- **Separate from each school's own Discussions** — "This school" vs "All schools" — so a teacher
  always knows who can read what they write.
- A topic can point at a shared version; a reader with editing access may **bring it straight into
  their school** (same rules as receiving a shared version).
- **Both "useful" votes and moderator-featured posts** to surface the best lessons.
- **Moderation:** **network moderators** appointed by the operator can hide posts everywhere, and each
  school's Site Administrator can hide a post on their own machine. ⚑ This is a new kind of authority
  beyond the three user types (SPEC §8) and must be added to SPEC deliberately, not slipped in.
- People appear by **name and school, never email**.
- **Messages between schools:** person to person only.

## 5. Identity — worldwide unique, planned now

Today versions are identified by per-server serial numbers, and ancestry (`sourceVersion`,
`mergedFrom`, `lineage`) is stored as those numbers. Sync and cross-school Combine need ids that mean
the same thing everywhere. Decisions:

- **Versions created from an ARES file** (1.0.0 and re-uploads): identity **derived from the content**
  (a fingerprint of the canonical ARES JSON). Two schools uploading the same ARES release then agree
  it is the same version without communicating — which is what gives their later edits a common
  ancestor for Combine.
- **Versions teachers create:** a random UUID.
- **Ancestry recorded by those ids**, not by local numbers.
- **Lesson plans:** the natural key `(subject-grade, META.substrand_id)` (already used for re-ingest
  matching). **Subjects/subject-grades:** subject name + integer grade.
- **People:** a permanent worldwide id, with **email as the sign-in** (operator decision) — not as the
  identity, because addresses change.
- **Version numbers stay for display only.** 1.0.1 at two schools are different versions; shared
  views show the school.
- **Do soon (before data spreads):** worldwide ids and content fingerprints on versions and plans,
  ancestry by those ids. People, sync and the hub can wait.

## 6. Accounts across servers

- **One account everywhere** (operator decision), email as the sign-in.
- ⚑ **The hub links a school account to a hub account only after verifying the email itself** (a code
  sent when the school machine is online, or an administrator vouching). An offline machine cannot
  verify email, so without this rule anyone could create a local account with someone else's address
  and take over their work across the network. Until linked, a local account works locally only.
- **Passwords:** the hub is the authority; school machines hold password-hash copies, refreshed at
  sync, so one password works everywhere (a change at home reaches the school at the next sync).
  Accepted by the operator — note it raises the stakes of a stolen machine.
- **Roles stay per school.** A subject-grade administrator at one school is nobody's administrator
  elsewhere. The hub has a notion of "school" (= machine).

## 7. Privacy

Names, emails, messages and posts leaving a school for the hub fall under Kenya's Data Protection Act
(2019). **No policy exists yet; one must be created** before the hub carries personal data. Minimum:
consent when a teacher links their account to the hub, a short privacy notice at enrolment, and a way
to delete one's data from the hub. Offline installations (the default) never send anything, and show
none of this.

## 8. Do now, alongside Combine phase 4 — the two small items

New ARES releases arrive about every two weeks and are mostly reworded. Bringing a school's edits onto
a new release is exactly what Combine (and phase 4) is for — but two blockers make Combine fall back
to "everything is a conflict" or refuse outright for that case. Both are small, local, useful with or
without a network, and directly serve phase 4. **These are the items to do now.**

1. **Record each re-upload's predecessor.** A re-ingested release (the next major, e.g. 2.0.0) is
   created with **no `sourceVersion`** (`app/src/ingest/index.ts` ~line 428: "No sourceVersion (this
   is an ingest, not a fork)"). So it shares no ancestor with a teacher's 1.0.3 (from 1.0.0), and
   Combine runs two-way: every reworded paragraph and every teacher edit becomes a conflict.
   **Proposal:** on re-ingest, record the plan's previous ingested release as the new release's
   predecessor — so lineage (`stampVersionLineage`) makes 1.0.0 the common ancestor and ARES
   rewordings merge with teacher edits paragraph by paragraph. Decide in the plan: (a) predecessor =
   the latest *ingested* release (not the latest teacher version) — recommended, since the release
   is ARES's line of descent; (b) whether to use `sourceVersion` or a distinct `previousRelease` field
   (a distinct field avoids implying "a teacher forked this"; `stampVersionLineage` would read both);
   (c) whether to backfill existing re-ingested majors (find the prior ingested major of the same
   plan). Wire/int tests: re-ingest records the predecessor; a three-way Combine of a teacher edit
   with the next release finds the release base.
2. **Let Combine take resource links from whichever side changed.** Combine refuses whenever the
   lessons' `resourceLinks` differ (`app/src/lib/combine/engine.ts` ~line 218, refusal `system`:
   "These versions come from different uploads of the lesson plan"). ARES's recommender changes
   links between releases, so this refuses almost every time. Teachers can never edit resource links
   (system-only fields), so a teacher's version always has its original's links. **Proposal:** when
   a common ancestor exists, apply the same rule as administrator fields — if only one side differs
   from the ancestor, take that side; refuse only when both changed (cannot happen from teacher
   edits). Without an ancestor (two-way), keep refusing. Update SPEC §6, the refusal wording only if
   it changes, and the engine's unit tests (one-side-changed takes it; both-changed still refuses;
   two-way still refuses).

Together these make "bring my edits onto the new ARES release" automatic except where a teacher and
ARES edited the same paragraph. Stable row identity (phase 5) can stay deferred while ARES releases
mostly reword; revisit if releases start restructuring lessons.

## 9. Proposed order after phase 4 (each its own plan and approval)

1. Worldwide ids and content fingerprints (§5) — cheapest before data spreads.
2. Standard/Advanced mode (§2) — after the operator marks up the inventory.
3. Connectivity setting and offline behaviour: email hidden/explained offline, the single
   phone-sized install bundle, update procedures (§3).
4. Home access option A as a documented deployment option (§4) — mostly configuration.
5. The hub, in stages: (a) ARES content and app-update feed; (b) sharing versions; (c) the "All
   schools" forum with network moderators; (d) person-to-person messages between schools;
   (e) linked accounts and home access through the hub. Privacy policy (§7) before (b).

## 10. Open items

- Operator to mark up the inventory (§2).
- Privacy policy wording and consent flow (§7) — to be created.
- Network moderators as a SPEC §8 addition (§4).
- Whether `ares.edu` (seen in some ARES demo menus) counts as an ARES address (Insert link design).
- Sync data limits: what size of sync is acceptable on a phone connection, and who pays (§3).
- Whether locks ("no overrides below this level") are wanted for the mode, later (§2).
