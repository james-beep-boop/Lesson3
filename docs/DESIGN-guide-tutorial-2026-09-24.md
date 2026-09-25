# Guide tutorial redesign — 2026-09-24

## Goal

Make `/guide` a task-oriented tutorial that helps a signed-in user find the steps relevant to their
work without hiding the existence of other roles. Keep `USER_GUIDE.md` as the complete, unscoped
reference for offline reading and printing. Both surfaces carry the same load-bearing facts.

## Information structure

The guide has five top-level accordion sections. Their heading and one-line subtitle remain visible
while the section is collapsed:

1. **Teachers** — account, browse and read, favorites, documents, messages, and editing requests.
2. **Editing** — open and edit, save a version, find versions, recover unsaved work, compare, and
   writing rules.
3. **Subject-grade administrators** — promote versions, manage structure, review candidates, grant
   or remove editing access, and hand over administration.
4. **Site administrators** — first account setup, accounts and passwords, roles, curriculum,
   upload, repair, delete, and installation status.
5. **Role notes** — shared scope, Official-version, and email-visibility definitions.

Detailed tasks are a second accordion level, with nesting capped at two levels. Role notes stay one
level deep. Every top-level overview is available to every signed-in user. Detailed task panels are
rendered only when the user has the capability needed to perform the task. Editing access is treated
as a capability, not a user type; Subject-grade and Site administrators also receive editing tasks.
The self-demotion handover task is specific to Subject-grade administrators. Site administrators
use separate appoint, replace, and remove controls.
No role is force-opened. The guide starts collapsed, while explicit `open` links can open an allowed
panel and its parent.

## Interaction and links

- Use a guide-specific, closed panel-ID vocabulary. Manage's `panelState.ts` remains Manage-specific;
  the guide does not generalize its state machinery.
- Incoming `?open=` values open only known, available panels. `?at=` may focus a known, available
  task trigger after the page hydrates. Accordion toggles remain local state and do not rewrite the URL.
- The editing-access request area links to the Editing overview in a new tab. Editor Help links to
  the writing task in a new tab so an in-progress edit remains open.
- Do not add full-text search. Use concise task headings and contextual links from the screens where
  each task begins.
- Omit screenshots. Keep the walkthroughs focused on concise written steps and task headings; users
  can follow contextual links into the relevant screens.

## Content integrity

`USER_GUIDE.md` is the complete offline reference and may contain details omitted from a user's
role-tailored page. The parity test pins the important facts that must appear on both surfaces; it
does not require identical outlines or imply that every Markdown paragraph must appear in each
user's rendered page. Rendered visibility is covered separately by guide access tests.

The existing factual corrections remain part of this change: editing-request limits are per
subject-grade per day per teacher; automatic sign-out is described on both surfaces; and `/guide`
contains the subject-grade and Official-version role notes. The sticky table of contents is removed,
so its old measured five-link wrap invariant no longer applies.

## Verification

- Unit tests cover Teacher, Subject-grade administrator, and Site administrator rendered task access.
- Shared factual claims remain checked between `/guide` source and `USER_GUIDE.md`.
- The guide CSS tests check that subtitles stay outside collapsed panels, accordion state remains
  exposed accessibly, and triggers use the shared touch-height token.
- Run the focused guide unit tests, full unit suite, formatter check, typecheck, and lint.
