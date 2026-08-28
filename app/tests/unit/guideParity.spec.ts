/**
 * Guide parity guard — the in-app `/guide` page and `USER_GUIDE.md` must state the same rules.
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
  {
    what: 'the shared ARES Education and Seavuria credit',
    claim: 'Lesson Plans by ARES Education and Seavuria',
  },
  {
    what: 'the panel path, renamed from "Editing access" on 2026-08-18 and regrouped under Users',
    claim: 'Manage → Users → Roles & Access',
  },
  {
    what: 'a handover cannot be undone by the person who made it (D6a, amended 2026-08-19)',
    claim: 'only a Site administrator can give it back',
  },
  {
    what: "the successor must already hold editing access — the operator's blast-radius narrowing",
    claim: 'must already have editing access there',
  },
  {
    what: 'removal is Site-Admin-only, and nobody may resign',
    claim: 'the only ones who can remove a Subject-grade administrator',
  },
  {
    what: 'the SPEC §8 email carve-out — the claim that was outright false until 2026-08-21',
    claim: 'the addresses of the people listed',
  },
  {
    what: 'a teacher on an email-less installation is NOT locked out — reveal-reset-link (D5) exists, and the guide said only "emails you a reset link" until 2026-08-22',
    claim: 'they can create a reset link and give it to you directly',
  },
  {
    what: 'the Site-Admin capability that rescues the case above, previously undocumented for users',
    claim: 'Reset a password by hand',
  },
  // ⚑ Edit recovery had NO guide coverage at all until 2026-08-25 — a teacher met that dialog with no
  // prior explanation, and it is the one place outside version-compare showing red/green diff
  // colours. These four are the facts they could act on and be wrong about.
  {
    what: 'recovery is OFFERED, never silently applied (SPEC §5) — the guarantee that makes the whole feature safe to have',
    claim: 'never applied automatically',
  },
  {
    what: 'the capture is per-user, so a shared computer does not leak one teacher’s prose to the next',
    claim: 'nobody else can see it',
  },
  {
    what: 'the panel lists only DIFFERENCES, not the whole document (operator decision 2026-08-23)',
    claim: 'only what differs from the saved version',
  },
  {
    what: 'a stale capture is read-only — it can be copied out but not restored, which is why the prose is still shown in full',
    claim: 'cannot be put back automatically',
  },
  {
    what: 'discarding is irreversible, and the dialog offers it as a plain button',
    claim: 'discarding cannot be undone',
  },
]

const RETIRED = ['Manage → Editing access']

describe('the in-app guide and USER_GUIDE.md state the same rules', () => {
  const md = flatten(read(GUIDE_MD, 'The repo-root bind mount from scripts/in-deps.sh is missing.'))
  const page = flatten(read(GUIDE_PAGE, 'The /guide page moved?'))

  // Proves the fixtures are the files we think they are, so a claim can never pass against an empty
  // string — the way a mis-resolved path would otherwise read as "no contradiction found".
  it('reads both guides', () => {
    expect(md).toContain('ARES Lesson Library')
    expect(page).toContain('Subject-grade administrators')
  })

  for (const { what, claim } of CLAIMS) {
    it(`states in BOTH: ${what}`, () => {
      expect(md, `USER_GUIDE.md is missing: "${claim}"`).toContain(claim)
      expect(page, `/guide is missing: "${claim}"`).toContain(claim)
    })
  }

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
