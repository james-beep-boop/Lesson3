/**
 * Guide parity guard — every pinned load-bearing rule must appear on both surfaces. The in-app
 * guide is capability-scoped; USER_GUIDE.md remains the complete, unscoped offline reference.
 *
 * ⚑ THIS EXISTS BECAUSE A DOCUMENTED OBLIGATION HAS FAILED TWICE. `USER_GUIDE.md`'s own header says
 * "This file mirrors the in-app guide at `/guide`; keep the two in step when either changes", and
 * `docs/DESIGN-editor-usability-2026-07-25.md` says "`/guide` and `USER_GUIDE.md` move in the same PR.
 * Guide drift has been caught in review here before". Twice was not enough:
 *
 *   - `docs/archive/BUILD-HISTORY-2026-06-TO-07.md`: "USER_GUIDE / in-app guide contradicted each
 *     other and the code on Teacher version access."
 *   - Found 2026-08-21: `USER_GUIDE.md` still said "Email addresses are visible only to the account
 *     owner and Site administrators" — false since the SPEC §8 carve-out of 2026-08-02 — while the
 *     page said nothing at all. One file wrong, the other silent, which is the worst pairing: a
 *     reviewer comparing them sees no contradiction to catch.
 *
 * So the rule is enforced rather than asked for. A prose-mirroring rule cannot be checked by diffing
 * two files that are deliberately different formats, so what is pinned is the set of LOAD-BEARING
 * CLAIMS — the sentences a user could act on and be wrong about. Wording is free; these facts are not.
 *
 * ⚑ WHY NOT SKIP WHEN THE FILE IS MISSING. `USER_GUIDE.md` lives at the repo root, outside the `app/`
 * workspace the container mounts, so it arrives via one bind mount in `scripts/in-deps.sh` — the same
 * mechanism, and for the same reason, as the root `.env.example` that `envTemplateParity.spec.ts`
 * needs (ONE file, never the workspace: a workspace mount would put `.git`, and the GITHUB_TOKEN a
 * checkout persists in it, inside a container running third-party dev dependencies). If that mount is
 * absent this suite FAILS with a named error rather than skipping. A guard that quietly does nothing in
 * CI is worse than no guard, because its green tick is read as coverage.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const APP_DIR = join(__dirname, '..', '..')
/** Mirrors `envTemplateParity.spec.ts`: the mount point in the container, the parent dir locally. */
const REPO_DIR = process.env.LESSON3_REPO_ROOT ?? join(APP_DIR, '..')

const GUIDE_MD = join(REPO_DIR, 'USER_GUIDE.md')
const GUIDE_PAGE = join(APP_DIR, 'src', 'app', '(frontend)', 'guide', 'page.tsx')

function read(path: string, hint: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `guideParity: cannot read ${path}. ${hint} (see this spec's docblock — do not "fix" this by skipping.)`,
    )
  }
}

/**
 * Flatten either format to comparable prose.
 *
 * The two files say the same things in different markup, so a claim has to survive JSX tags, JSX
 * entities, Markdown emphasis, and the line wrapping both use at ~100 columns. Whitespace is
 * collapsed last so a claim can span a wrapped line — which every interesting one does.
 */
function flatten(source: string): string {
  return source
    .replace(/\{' '\}/g, ' ') // JSX explicit space
    .replace(/<[^>]+>/g, ' ') // JSX/HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown links → their visible labels
    .replace(/\*\*|__|\*|_/g, '') // Markdown emphasis
    .replace(/\s+/g, ' ')
}

/**
 * The claims. Each one is a fact a user could act on and be wrong about — not a phrasing preference.
 * Adding a rule to one file and not the other is exactly what this list refuses.
 */
const CLAIMS: { what: string; claim: string }[] = [
  { what: 'school name setting and clearing', claim: 'Leave School name empty to hide it' },
  {
    what: 'school name never changes top bar or documents',
    claim: 'It never appears in the top bar or generated documents',
  },
  { what: 'release date missing from an upload', claim: 'ARES release: not stated' },
  {
    what: 'long upload summary message is shortened',
    claim: 'the full list is in the upload report',
  },
  {
    what: 'Combine suggestion dismissal is temporary',
    claim: 'Not now hides the suggestion until you reload the page',
  },
  {
    what: 'combined upload confirmation',
    claim: 'Missing subjects and grades appear in the same confirmation round',
  },
  {
    what: 'upload preserves a teacher Official',
    claim: 'A teacher’s Official stays unchanged, waiting for the subject-grade administrator',
  },
  {
    what: 'upload skips older releases',
    claim: 'A release dated earlier than the newest one already here is not imported',
  },
  { what: 'search does not search reply bodies', claim: 'Search covers titles only' },
  {
    what: 'immutable posts and administrator thread deletion',
    claim: 'Posts cannot be edited. Only a Site administrator can delete a thread',
  },
  { what: 'the version discussion entry point', claim: 'Discuss this version' },
  { what: 'the after-save discussion entry point', claim: 'Post about these changes' },
  // SPEC §5 Drafts (2026-10-17): the retention a teacher plans around, stated identically on both.
  {
    what: 'how long a draft is kept',
    claim: 'A draft is kept for 30 days after you last worked on',
  },
  { what: 'the dot changes only on navigation', claim: 'The dot updates on navigation or reload' },
  { what: 'forum drafts are not persisted', claim: 'Your forum text stays only in the form' },
  { what: 'the switch defaults on', claim: 'Discussions are on by default' },
  {
    what: 'Save requires the administrator password',
    claim: 'Review the change and enter your password',
  },
  {
    what: 'redaction does not purge backups',
    claim: 'Existing backups keep the text until they age out',
  },
  {
    what: 'the limited off-state moderation view',
    claim: 'This view has no search, posting, pinning or unread tracking',
  },
  {
    what: 'the shared ARES Education and Seavuria credit',
    claim: 'Lesson Plans by ARES Education and Seavuria',
  },
  {
    // ⚑ The two files CONTRADICTED each other here until 2026-08-29, found by an independent review.
    // `/guide` said unavailable fields "are shown but marked read-only"; `USER_GUIDE.md` said the
    // editor shows "only the fields you may change". The Markdown was right — `adminOnly` applies an
    // `admin.condition`, so those fields are not rendered at all. A teacher reading the in-app guide
    // would have gone looking for read-only boxes that do not exist. ⚑ This is the exact pairing the
    // file header calls the worst kind: one surface wrong, the other correct, so a reviewer comparing
    // them sees a difference and cannot tell which way it should resolve.
    what: 'the editor shows a teacher only the fields they may change, not disabled ones',
    claim: 'showing only the fields you may change',
  },
  {
    what: 'the panel path, renamed from "Editing access" on 2026-08-18 and regrouped under Users',
    claim: 'Manage → Users → Roles & Access',
  },
  {
    what: 'a handover cannot be undone by the person who made it (D6a, amended 2026-08-19)',
    claim: 'Only a Site administrator can make you an administrator again',
  },
  {
    what: "the successor must already hold editing access — the operator's blast-radius narrowing",
    claim: 'someone who already has editing access',
  },
  {
    what: 'removal is Site-Admin-only, and nobody may resign',
    claim:
      'Only a Site administrator can appoint, replace, or remove a Subject-grade administrator',
  },
  {
    // ⚑ Added 2026-08-30 with the lesson page's own PDF/Word pair. Both guides said "on a lesson
    // page, all downloads live in the Share menu" — true from 2026-07-17 until that change, and the
    // exact shape of claim this list exists to catch: a reader who believes it goes hunting through
    // a menu for two buttons now sitting in front of them.
    what: 'the lesson page carries its own PDF/Word for the lesson plan, not only the Share menu',
    claim: 'its own PDF and Word buttons for the lesson plan',
  },
  {
    // ⚑ Added 2026-10-07 with the student/teacher split. Until then the single Final explanation printed
    // the exemplar answers under a "Student Assessment Document" title — handing it out gave students the
    // answers. The new split only helps if teachers know which document is which.
    what: 'the Teacher key carries the answers and must not be given to students',
    claim: 'the Teacher key has the exemplar answers and is not for students',
  },
  {
    what: 'the SPEC §8 email carve-out — the claim that was outright false until 2026-08-21',
    claim: 'addresses only for people listed',
  },
  {
    what: 'a teacher on an email-less installation is NOT locked out — reveal-reset-link (D5) exists, and the guide said only "emails you a reset link" until 2026-08-22',
    claim: 'create a reset link and give it to you directly',
  },
  {
    what: 'the Site-Admin capability that rescues the case above, previously undocumented for users',
    claim: 'create a password-reset link and give it to the person',
  },
  {
    what: 'a fresh installation has no factory account or password',
    claim: 'There is no default username or password',
  },
  {
    what: 'on a no-email installation, new accounts wait for a Site administrator to approve them',
    claim: 'teachers who sign up cannot sign in until you approve them',
  },
  {
    what: 'Combine and Show details are Advanced tools (2026-10-20), so a teacher knows whom to ask',
    claim: 'Combine versions and Show details appear when Advanced tools is switched on',
  },
  {
    what: 'Standard never strands a Combine that was already under way',
    claim: 'An unfinished combination can still be restored and saved when Advanced tools is off',
  },
  {
    what: 'Email all needs both Advanced tools and a site that can send email',
    claim: 'Email all only when the site can send email',
  },
  {
    what: 'the switch is display only',
    claim: 'Advanced tools is off by default',
  },
  {
    what: 'the backup status distinguishes successful transport from demonstrated recovery',
    claim: 'does not prove the backup can be restored',
  },
  {
    what: 'Manage reports backup state but cannot perform a backup or restore',
    claim: 'reports status only; it cannot start a backup or restore data',
  },
  {
    what: 'school setup has one resumable operator command',
    claim: 'scripts/setup-school-backups.sh',
  },
  {
    what: 'the written backup password is never persisted',
    claim: 'The password is never saved in a file or log',
  },
  {
    what: 'password recovery requires the encrypted identity as well as the backup',
    claim: 'and the password from the recovery sheet',
  },
  {
    what: 'the recovery-key status describes the off-box school key accurately',
    claim: 'new backups are encrypted for a recovery key held by the school',
  },
  {
    what: 'Site Administrator is an application role, not server or private-key access',
    claim:
      'Being a Site administrator in Lesson Plan Editor does not give you a server login or a recovery key',
  },
  {
    what: 'recovery prerequisites are named before attempting a restore',
    claim:
      'the matching private key on the machine where the restore will run (not on the Lesson Plan Editor server)',
  },
  {
    what: 'recovery instructions branch by the reported key state',
    claim: 'Recovery needs ARES',
  },
  {
    what: 'the manual backup command is available to the server operator',
    claim: 'cd /srv/lesson3 && scripts/backup-db.sh',
  },
  {
    what: 'the backup-list command is available to the server operator',
    claim: 'cd /srv/lesson3 && scripts/restore-db.sh --list',
  },
  {
    // Design A5 (2026-10-21): the backup statements live on their own box, and freshness is judged by
    // the data a backup holds — the fact an operator would otherwise misread from an upload time.
    what: 'backup freshness is judged by what the data covers, on Manage → System → Backups',
    claim:
      'Backup up to date is judged by when the backup’s data was taken, not by when it was copied.',
  },
  {
    what: 'full recovery is reported as untested until Phase B shows it works',
    claim: 'Full recovery reads “Not yet tested” until rebuilding the installation',
  },
  {
    what: 'the school agrees the limits; unset means "Not agreed", and a week means a week of lost work',
    claim: 'A limit of one week means accepting the loss of up to a week’s work.',
  },
  {
    // Operator decision 2026-10-27: the drive normally stays plugged in, so the nightly backup reaches it.
    what: 'the overdue-USB action line',
    claim: 'Plug the drive back in; the next nightly backup copies to it',
  },
  {
    // Design A1 (2026-10-21): a live restore is staged and reversible until the previous database is
    // discarded — and undoing it loses work saved since, which an operator must know before choosing.
    what: 'a live restore is checked first, keeps the previous database, and undoing loses later work',
    claim:
      'It checks the backup in a separate database first, stops the application itself, and keeps the previous database until you discard it, so the restore can be undone until then. Work saved after the restore is lost if you undo it.',
  },
  // ⚑ Edit recovery had NO guide coverage at all until 2026-08-25 — a teacher met that dialog with no
  // prior explanation, and it is the one place outside version-compare showing red/green diff
  // colours. These four are the facts they could act on and be wrong about.
  {
    what: 'recovery is OFFERED, never silently applied (SPEC §5) — the guarantee that makes the whole feature safe to have',
    claim: 'never restores a draft unless you choose to',
  },
  {
    what: 'the capture is per-user, so a shared computer does not leak one teacher’s prose to the next',
    claim: 'Only you can see your drafts',
  },
  {
    what: 'the panel lists only DIFFERENCES, not the whole document (operator decision 2026-08-23)',
    claim: 'shows only what your draft changes',
  },
  {
    what: 'an older draft can be saved as a version before combining it with newer work',
    claim:
      'To bring a draft together with a newer version, save the draft as a version, then use Combine versions',
  },
  {
    what: 'discarding is irreversible, and the dialog offers it as a plain button',
    claim: 'Discarding cannot be undone',
  },
  {
    // ⚑ Found 2026-09-24, reviewing a guide-rewrite plan. `USER_GUIDE.md` said "per subject-grade"
    // (missing that the limit is per teacher, not shared across everyone requesting that
    // subject-grade); `/guide` said "per subject" (wrong unit entirely) and also missing "per
    // teacher". `requestEditing.ts`'s own docblock is unambiguous: the throttle bucket is keyed
    // `${userId}:${sgId}` — one request per user per subject-grade per day. Neither guide said that.
    what: 'the editing-request throttle is per user AND per subject-grade, not shared or subject-wide',
    claim: 'once a day for each subject and grade. The limit applies separately to each teacher',
  },
  {
    what: 'a subject-grade is subject + grade together, e.g. Biology Grade 10 vs. Biology Grade 11',
    claim: 'access to Biology Grade 10 does not include Biology Grade 11',
  },
  {
    what: 'Official is the default and trust marker, not an access boundary — a direct link to any version opens for any signed-in user',
    claim: 'It does not control who can open other saved versions',
  },
  {
    what: 'any signed-in user can open a saved version when they have its link',
    claim: 'who is signed in can open a saved version if they have its link',
  },
]

const RETIRED = ['Manage → Editing access']

describe('the in-app guide and USER_GUIDE.md preserve shared rules', () => {
  const md = flatten(read(GUIDE_MD, 'The repo-root bind mount from scripts/in-deps.sh is missing.'))
  const page = flatten(read(GUIDE_PAGE, 'The /guide page moved?'))

  // Proves the fixtures are the files we think they are, so a claim can never pass against an empty
  // string — the way a mis-resolved path would otherwise read as "no contradiction found".
  it('reads both guides', () => {
    expect(md).toContain('Lesson Plan Editor')
    expect(page).toContain('Subject-grade administrators')
  })

  for (const { what, claim } of CLAIMS) {
    it(`states on both surfaces: ${what}`, () => {
      expect(md, `USER_GUIDE.md is missing: "${claim}"`).toContain(claim)
      expect(page, `/guide is missing: "${claim}"`).toContain(claim)
    })
  }

  it('does not publish an incomplete restore command — recovery is handed off to docs/OPS.md', () => {
    const md = read(GUIDE_MD, 'USER_GUIDE.md missing')
    const page = read(GUIDE_PAGE, 'The /guide page moved?')
    const incomplete = /AGE_IDENTITY=.*restore-db\.sh/
    expect(md, 'USER_GUIDE.md must not contain an incomplete restore command').not.toMatch(
      incomplete,
    )
    expect(page, '/guide must not contain an incomplete restore command').not.toMatch(incomplete)
    expect(md).toContain('docs/OPS.md')
    expect(page).toContain('docs/OPS.md')
  })

  /**
   * ⚑ NO HTML CHARACTER ENTITIES IN THE PAGE, except `&amp;` — and this is a MEASURED toolchain
   * defect, not a style preference. Verified in the browser 2026-08-21 against the running dev server:
   * when a JSX text run CONTAINS an entity and BEGINS with a space (i.e. it follows `</em>` or
   * `</strong>` on the same line), that leading space is dropped from the rendered DOM. The words weld
   * together — "☆ Favoritebutton", "Messagesfrom the menu", "N versionschip", "over:in the same panel".
   *
   * Four of those were live on the deployed site and had been for months; the fifth was introduced in
   * this very change and is what led to finding the others. Neither `tsc`, ESLint nor Prettier sees it,
   * and reading the source does not reveal it — the space is right there in the file.
   *
   * Banning the entities outright is the guard, because the defect REQUIRES one: literal characters
   * (`’`, `—`, `☆` — already used throughout this file) render correctly in every position. `&amp;` is
   * exempt and safe: verified that "Roles &amp; Access" keeps its surrounding spaces, because the
   * entity sits inside the element rather than in the text run that owns the space.
   */
  it('uses literal characters, not HTML entities (an entity silently eats a leading space)', () => {
    const raw = read(GUIDE_PAGE, 'The /guide page moved?')
    const entities = [...raw.matchAll(/&[a-zA-Z]+;/g)].map((m) => m[0]).filter((e) => e !== '&amp;')
    expect(
      entities,
      `Use the literal character instead. Entities found: ${entities.join(', ')}`,
    ).toEqual([])
  })

  it('links both organizations and their separate donation destinations', () => {
    const rawPage = read(GUIDE_PAGE, 'The /guide page moved?')
    const rawMd = read(GUIDE_MD, 'The repo-root bind mount from scripts/in-deps.sh is missing.')

    for (const href of [
      'https://areseducation.org',
      'https://areseducation.org/donate.html',
      'https://www.seavuria.org',
      'https://www.seavuria.org/donate',
    ]) {
      expect(rawPage, `/guide is missing ${href}`).toContain(href)
      expect(rawMd, `USER_GUIDE.md is missing ${href}`).toContain(href)
    }
  })

  for (const retired of RETIRED) {
    it(`no longer says "${retired}" anywhere`, () => {
      expect(md, `USER_GUIDE.md still says "${retired}"`).not.toContain(retired)
      expect(page, `/guide still says "${retired}"`).not.toContain(retired)
    })
  }
})
