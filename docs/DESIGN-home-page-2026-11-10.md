# A friendlier Lessons home page — design options (2026-11-10)

**Status:** proposal for review. Nothing is built. The operator asked for design ideas and wants an
outside (GPT) review before choosing. `SPEC.md` is unchanged until an option is chosen.

## Why

The operator wants the app to feel easier and more welcoming, and wants this to work for **every
installation, including offline schools**. The earlier plan for an inviting front page
(`docs/DESIGN-public-library.md`, `/explore`) only reaches signed-out visitors on internet
deployments. Offline school teachers never see it. Their first impression is the sign-in page,
followed by a long search-and-filter catalogue.

## Constraints the operator set (2026-11-10)

1. **Keep today's look on every page.** It is consistent, professional and business-like (black,
   white, grey and a few blue accents), and that seriousness is wanted. No "loud" landing or sign-in
   page, no hero banner, illustrations, new colours or new fonts. Friendliness has to come from
   **wording, structure and saving people steps**, not decoration.
2. **Make things easy.** The idea the operator liked best was **"Pick up where you left off"**.
3. **Works offline.** Nothing may depend on internet assets.

Standing rules this must respect: SPEC §13 role-tailored minimal UI (show only what a user can do),
§13 shared computers (**never persist user content in browser storage**), desktop is the primary
interface (phones must still work), and the `draft` vocabulary (a draft is a private, unnumbered
edit-recovery copy, never a version).

## The mockups

All mockups use the app's real stylesheets (`app-tokens.scss`, `app-chrome.scss`, `app-dialog.scss`,
`(frontend)/styles.css`) and the real class names. The few additions are layout only, and every
value in them is an existing token. They are static HTML: the example data is invented.
Images are in `docs/design-mockups/home-page-2026-11-10/`, each at desktop (1280 px) and phone
(390 px); `build-mockups.py` regenerates the HTML.

| File | What it shows |
|---|---|
| `0-current-home-*.png` | Today's Lessons page, for comparison |
| `A-home-*.png` | **Option A:** one "Pick up where you left off" panel added above today's page |
| `B-home-*.png` | **Option B:** a short home section (welcome, pick up, your subjects, recently updated), then the full catalogue |
| `B-home-new-teacher-*.png` | Option B on a new teacher's first visit (empty states) |
| `C-home-*.png` | **Option C:** subjects first; the catalogue opens one subject and grade at a time |
| `login-current-*.png`, `login-proposed-*.png` | Sign-in today, and with one welcome sentence and a note for new teachers |

### Option A: one panel above today's page

Adds a "Pick up where you left off" section (section-heading size, the existing row style) between
the school name and the search box, showing up to three items. Everything else is unchanged.

- For: the smallest change; nothing a current user relies on moves.
- Against: the page still opens as a long catalogue, and the panel pushes search down.

### Option B: a home section, then the catalogue (recommended)

- The page title becomes **"Welcome back, {name}"** (first visit: "Welcome, {name}"), with the
  school name and product name underneath.
- **Search stays first.**
- Two columns on desktop (one on phones):
  - **Pick up where you left off** (up to three items, see below).
  - **Your subjects:** up to four subject and grade shortcut buttons. Each sets the existing
    subject and grade filters and scrolls to the catalogue. They come from the user's favorites,
    recent lessons and editing access. There is no new settings screen.
  - **Recently updated:** the two or three plans whose Official version changed most recently.
- **All lesson plans** follows: today's filters, My favorites and catalogue, unchanged.
- A new teacher sees short, helpful empty states instead of blank space (`B-home-new-teacher`).

- For: the clearest "easy" win while keeping the catalogue teachers already know. It also gives a
  natural place for the future `/explore` to reuse the same sections for signed-out visitors.
- Against: more to build. "Recently updated" needs a reliable "became Official at" time (see below).

### Option C: subjects first

The catalogue is replaced by subject and grade cards (plan and strand counts, plus the user's
favorite count). A card opens that subject and grade's strand list. Pick up and search stay on top.

- For: scales best as the library grows. The first screen is short and calm.
- Against: the biggest change. It adds a click for teachers who scroll today, and it breaks
  in-page find (Ctrl+F) across the whole library. It also changes a page shape that SPEC §13
  describes (strand-first browse).

### Sign-in page

It keeps the form first and adds just two things: one welcome sentence ("Welcome. Sign in to find
this term's lesson plans, ready to print or download.") and, under the links, a muted line for new
teachers: "New teacher? Choose Sign up, and your administrator will approve your account." The
second line should follow the existing email/no-email sign-up wording rules.

## "Pick up where you left off": where the items come from

Show up to three items, newest first, each with a plain reason and one action.

| Item | Source | Exists today? |
|---|---|---|
| Your draft ("Continue editing") | edit-recovery rows for this user that have not been retired | **Yes** (Manage → Your drafts already lists them) |
| A version you saved | the user's own saved versions | **Yes** (Manage → Your saved versions) |
| A lesson plan you opened ("Open") | **new:** a per-user, server-side "recently opened" record | **No** |

**"Recently opened" is the one new piece of data.** Browser storage is ruled out by SPEC §13 (shared
machines). The proposal:

- A small collection, for example `recent-lessons`: `user`, `lessonPlan`, `openedAt`. One row per
  (user, plan), upserted when the lesson page renders for that user. Keep at most about 10 per user
  and prune older rows.
- Access: **the user only**. No administrator view, no counts and no reporting. It is a convenience,
  not analytics, and that keeps it out of data-protection questions.
- It is deleted with the user. When a plan is deleted, its rows are removed via cascade.
- It is written for viewing only, never for downloads. "Opened" is the one reason shown.

## "Recently updated": what it needs

Today there is no stored time for when a plan's Official version last changed. `lesson_plans.updatedAt`
also moves for other edits. Two choices:

1. Add an `officialSince` timestamp, set by the existing promote hook (one migration, backfilled
   from the Official version's `createdAt`).
2. Drop "Recently updated" from the first build.

## Questions for the reviewer

1. Is Option B the right balance, or is A (smaller) or C (bigger) better for this audience: mostly
   teachers on shared desktop machines, many offline?
2. Is the `recent-lessons` design right: server-side, self-only, capped, pruned? Is there an existing
   Payload feature that does this instead (SPEC §13 "Payload-first")?
3. Should a first-time user's greeting replace the existing Welcome dialog, or sit alongside it?
4. Do "Your subjects" shortcuts belong on this page, or do they duplicate the filters?
5. Any accessibility or phone-layout problems in the mockups?
6. Does anything here break the role-tailored rule? For example, "Continue editing" must appear
   only for users who can still edit that plan.

## If chosen: rough build outline (for later, not now)

1. Amend SPEC §13 (home page shape) and record the decision in DECISIONS.
2. `recent-lessons` collection plus migration, with access tests (`tests/http` 401/403 and the
   self-only read) and cascade tests.
3. Home sections as server components on `/`, reusing the existing row, button and empty-state
   styles. No new tokens.
4. Optional `officialSince` with migration and backfill.
5. Guide and `USER_GUIDE.md` updates. Browser check at desktop and phone widths.
