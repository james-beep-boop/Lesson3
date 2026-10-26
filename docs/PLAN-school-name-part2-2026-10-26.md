# Part 2 — School name (implementation plan)

**Status: APPROVED by the operator, 2026-10-26. Ready to build. No code is written yet.** Build part 2 of
`docs/DESIGN-school-commissioning-and-updates-2026-10-26.md` (§11). One small PR. Needs no test machine.

## What it does

Each installation can carry the name of the place it serves, e.g. *Kisumu Boys High School*, or on the
hub *Kenya Lessons · all schools*. It is shown in small type in a few fixed places so a teacher or
technician always knows which machine they are on. It is **never** in the top bar (phone width), **never**
a logo (operator decision), and **never** on generated DOCX/PDF, which reproduce ARES's layout.

Unset (today's installations, and any school that never sets it) shows nothing at all: no placeholder.

## Decisions already made (operator, 2026-10-25/26)

- Places: the **sign-in page** (a large heading), the **browser tab title**, the **top of the avatar
  menu**, and in small type **under the page headings "Lesson Plans", "Discussions" and "Manage"**.
- Not in the top bar; no logo; not on generated documents.
- The hub shows *Kenya Lessons · all schools* in the same places (it is simply that installation's name).

## Existing pieces it uses (checked against `main` at `879cba0`)

- The `system-settings` global (`globals/SystemSettings.ts`), already the home of installation-wide
  settings and the Installation ID. Its `access.update` is `() => false`; the **only** writer is
  `POST /api/globals/system-settings/save` (`endpoints/systemSettingsSave.ts`), which authorizes a Site
  Administrator, validates an explicit allowlist, re-checks the caller's password, and writes in one
  transaction with a stale-edit check.
- `lib/systemFlags.ts`'s render-cached reader pattern (`systemFlagsForRender`) for server components.
- Headings: `app/(frontend)/page.tsx` ("Lesson Plans"), the Discussions page, and
  `components/AdminDashboard` ("Manage"). The sign-in heading is in `app/(frontend)/login/page.tsx`; the
  tab title is the frontend layout's `metadata` (today "ARES Lesson Plans"). The avatar menu is the
  client component `components/UserMenu`, rendered by `components/AppNav`.

## The change

1. **Field.** `schoolName` on the `system-settings` global: text, optional, at most **80 characters**,
   trimmed, plain text only (no line breaks; rendered as text, never HTML, like every other prose field).
   **Migration:** one nullable column; no backfill.
2. **Reading it.** `lib/schoolName.ts`: one render-cached server reader that selects only `schoolName`
   with `overrideAccess` (the sign-in page has no user, and the global's other fields stay
   Site-Administrator-only). It never throws: a failed read shows nothing, as an unset name does.
3. **Writing it.**
   - **Manage → System switchboard:** a "School name" text box beside the existing switches, saved by
     the existing Save with its password re-check. The endpoint's allowlist gains `schoolName`
     (string, trimmed, 0–80 characters, no control characters; empty clears it). Every other rule of
     that endpoint is unchanged.
   - **Command line** (for commissioning, part 5): `scripts/set-school-name.ts`, run through the
     `migrate` service like `reset-installation-id.ts`, with the same validation. A trusted operator
     path, exactly as the other operator scripts are.
4. **Showing it** — one small server component, `SchoolName`, used everywhere so wording and styling
   live in one place:
   - **Sign-in page:** the school name as the heading, with today's "ARES Lesson Plans" beneath it.
     Unset: unchanged.
   - **Tab title:** "Kisumu Boys High School — ARES Lesson Plans" on frontend pages; unchanged when
     unset.
   - **Avatar menu:** a small, muted first line above the person's name. The server layout passes the
     name to `UserMenu` as a prop; the menu does not fetch it.
   - **Under "Lesson Plans", "Discussions" and "Manage":** one line of small, muted text directly under
     the heading.
5. **Not touched:** the top bar, generated documents, emails (a later decision if wanted), the public
   Explore pages (they have their own heading and stay as they are).

## Tests

- **Unit:** validation (trim, length, control characters, empty clears); `SchoolName` renders nothing when
  unset and plain text when set (no HTML interpretation).
- **Wire (`tests/http`, per CLAUDE.md):** the save endpoint with `schoolName` — 401 signed out; 403 for a
  Teacher and a Subject-grade administrator; 400 for over-long or control characters; wrong password 401;
  happy path; stale `expectedUpdatedAt` 409. The global's REST read still withholds the other settings
  from non-administrators.
- **Browser:** the name appears in the five places at desktop and at 375 px; the top bar is unchanged at
  375 px (no wrap, no overflow — the existing visual matrix covers this); nothing appears when unset.
- **Guide parity:** the Guide and `USER_GUIDE.md` say where the name is set and shown.

## SPEC and docs in the same PR

SPEC §11 (system settings: the school name, who may set it, where it shows, and that it never appears on
generated documents) and `docs/DESIGN-system-panel-2026-08-21.md`'s field list.

## Decided (operator, 2026-10-26)

1. **No change history for the school name.** It is a label set once at commissioning; unlike the
   switches, its changes are not recorded (who/when). The database keeps when settings were last saved.

## Size

About a day, including tests and the Guide.
