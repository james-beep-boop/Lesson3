/**
 * Manage accordion — the URL⇄open-state projection (`components/Manage/panelState.ts`, D7a).
 *
 * These are the rules a browser test cannot pin cheaply: what a stale or hostile `?open=` does, that
 * serialisation is stable, and that the initial-open decision is the one the design records rather
 * than whatever `useState` an implementer typed. The DOM behaviour they underwrite is asserted in
 * `tests/e2e/manage.e2e.spec.ts`.
 *
 * ⚑ This file also owns PR 1's half of the cross-panel-jump contract. §7 assigned PR 1 an E2E
 * assertion that "a jump adds exactly one history entry", but the only jump D7a specifies is
 * Users → Roles & Access, and the Users panel does not exist until PR 2b — so PR 1 cannot honestly
 * drive that in a browser without inventing a transitional affordance. The serialisation half is
 * pinned here; the history-entry half belongs to 2b, where the jump becomes real.
 */
import { describe, it, expect } from 'vitest'

import {
  PANEL_IDS,
  initialOpen,
  parentOf,
  parseOpen,
  resolveServerPanelState,
  serialiseOpen,
  withAncestors,
  withoutDescendants,
} from '../../src/components/Manage/panelState'

/** Everything a Site Admin's page can render, which is the widest `available` in the product. */
const SITE_ADMIN = [
  'users',
  'users.accounts',
  'users.access',
  'curriculum',
  'curriculum.subjects',
  'curriculum.subject-grades',
  'plans',
  'plans.upload',
  'plans.versions',
  'plans.delete',
  'plans.repair',
]

describe('parentOf', () => {
  it('reads the one level of nesting the grammar allows', () => {
    expect(parentOf('plans')).toBeNull()
    expect(parentOf('plans.upload')).toBe('plans')
  })
})

describe('parseOpen', () => {
  it('keeps ids that are both known and available', () => {
    expect(parseOpen('?open=plans,plans.versions', SITE_ADMIN)).toEqual(['plans', 'plans.versions'])
  })

  it('drops ids that are not in the closed vocabulary', () => {
    expect(parseOpen('?open=plans,nonsense', SITE_ADMIN)).toEqual(['plans'])
  })

  it('drops ids the CALLER cannot see, even though they are valid ids', () => {
    // The Subject Admin case: `curriculum` is a real panel, just not one this page rendered. It must
    // vanish silently — an error or an empty panel would tell them something was withheld. Their own
    // panel arrives WITH its ancestor, since a child is only meaningfully open inside an open parent.
    expect(
      parseOpen('?open=curriculum,users.access', ['users', 'users.access', 'plans.versions']),
    ).toEqual(['users', 'users.access'])
  })

  /**
   * ⚑ A RETIRED id, which is a different case from an unknown one and from an inaccessible one — and
   * the only one of the three that a REAL bookmark can hit. The vocabulary is a URL contract, and this
   * is what retiring an entry in it is supposed to feel like from the outside: a normal Manage page
   * with nothing opened, not an error and not a resurrected panel.
   *
   * ⚑ THE IDS HERE CHANGED ON 2026-08-18 and the previous ones are worth naming, because this case has
   * now happened twice. Round one: `curriculum` shipped as a holding-pen panel and PR 3 dissolved it
   * into `subjects` + `subject-grades`. Round two: the four-box regrouping retired those two in turn
   * (they became `curriculum.subjects` / `curriculum.subject-grades`) along with top-level `access`.
   * Pinned because the tempting "fix" for a broken old link is to re-add the id it names.
   */
  it('drops a RETIRED id, so an old bookmark degrades instead of erroring', () => {
    expect(parseOpen('?open=subjects', SITE_ADMIN)).toEqual([])
    expect(parseOpen('?open=subject-grades', SITE_ADMIN)).toEqual([])
    expect(parseOpen('?open=access,plans', SITE_ADMIN)).toEqual(['plans'])
  })

  /**
   * ⚑ AND THE OTHER HALF OF THAT CHANGE, which is not a retirement: `curriculum` came BACK as the
   * group whose children are what it originally dissolved into, and `users` was RE-POINTED from the
   * accounts panel to the group containing it. So both of those ancient bookmarks resolve again — one
   * to a superset of what it meant, one to a box containing what it meant.
   *
   * This is pinned rather than left to inference because the file it guards spent two months telling
   * the next reader not to re-add `curriculum`. That prohibition was about resurrecting a panel the
   * product no longer had; the product has one again.
   */
  it('re-uses `curriculum` and re-points `users`, deliberately', () => {
    expect(parseOpen('?open=curriculum', SITE_ADMIN)).toEqual(['curriculum'])
    expect(parseOpen('?open=users', SITE_ADMIN)).toEqual(['users'])
  })

  it('is order-stable, so a parsed value re-serialises to itself', () => {
    // Otherwise `?open=plans,access` and `?open=access,plans` would keep rewriting each other's URL.
    expect(parseOpen('?open=plans.versions,plans', SITE_ADMIN)).toEqual(
      parseOpen('?open=plans,plans.versions', SITE_ADMIN),
    )
  })

  it('tolerates whitespace, empty entries and a missing parameter', () => {
    expect(parseOpen('?open= plans.versions , ,plans ', SITE_ADMIN)).toEqual(['plans', 'plans.versions'])
    expect(parseOpen('', SITE_ADMIN)).toEqual([])
    expect(parseOpen('?other=1', SITE_ADMIN)).toEqual([])
  })

  it('opens the ancestors of anything nested, without being asked', () => {
    // The ancestor step lives INSIDE parseOpen rather than at its call sites, so a third caller
    // cannot forget it. Forgetting it fails silently: a child rendered inside a hidden parent shows
    // nothing while the URL still claims it is open.
    expect(parseOpen('?open=plans.delete', SITE_ADMIN)).toEqual(['plans', 'plans.delete'])
  })

  it('does not open an ancestor the caller may not see', () => {
    // Belt-and-braces: a role that renders a child always renders its parent today, so this holds by
    // coincidence as well as by rule — and a rule that holds only by coincidence is the kind that
    // stops holding quietly.
    expect(parseOpen('?open=plans.delete', ['plans.delete', 'plans.versions'])).toEqual([])
  })
})

describe('resolveServerPanelState', () => {
  it('reads Next’s searchParams record directly, so the page component does no plumbing', () => {
    expect(resolveServerPanelState({ open: 'plans.delete', at: 'sg-12' }, SITE_ADMIN)).toEqual({
      open: ['plans', 'plans.delete'],
      at: 'sg-12',
    })
  })

  it('handles a repeated parameter, an absent record, and an absent `at`', () => {
    // Next gives `string[]` when a key repeats; dropping the extras silently would be the kind of
    // lossy flattening nobody notices until a URL stops working.
    expect(resolveServerPanelState({ open: ['plans.versions', 'plans'] }, SITE_ADMIN).open).toEqual([
      'plans',
      'plans.versions',
    ])
    expect(resolveServerPanelState(undefined, SITE_ADMIN)).toEqual({ open: [], at: null })
    expect(resolveServerPanelState({ open: 'plans' }, SITE_ADMIN).at).toBeNull()
  })

  it('ignores malformed dynamic jump targets before a focus consumer can receive them', () => {
    expect(resolveServerPanelState({ at: 'sg-12' }, SITE_ADMIN).at).toBe('sg-12')
    expect(resolveServerPanelState({ at: '' }, SITE_ADMIN).at).toBeNull()
    expect(resolveServerPanelState({ at: 'sg 12' }, SITE_ADMIN).at).toBeNull()
    expect(resolveServerPanelState({ at: 'x'.repeat(65) }, SITE_ADMIN).at).toBeNull()
  })

  it('applies the single-section auto-expand when the query says nothing', () => {
    expect(resolveServerPanelState({}, ['plans', 'plans.versions']).open).toEqual([
      'plans',
      'plans.versions',
    ])
  })
})

describe('withAncestors / withoutDescendants', () => {
  it('opening a nested panel opens its parent', () => {
    // A child inside a hidden parent renders as nothing while the URL claims it is open.
    expect(withAncestors(['plans.delete'])).toEqual(['plans', 'plans.delete'])
  })

  it('closing a parent closes its subtree', () => {
    // ⚑ `plans.versions` is a descendant NOW, where the retired top-level `versions` was not — which is
    // the substantive consequence of the 2026-08-22 renesting: closing "Lesson plans" also closes a
    // teacher's saved versions, because it is inside the box rather than beside it.
    expect(withoutDescendants(['curriculum', 'plans', 'plans.delete', 'plans.versions'], 'plans')).toEqual([
      'curriculum',
    ])
  })

  it('closing a parent leaves unrelated panels alone', () => {
    expect(withoutDescendants(['curriculum', 'plans', 'plans.upload'], 'plans')).toEqual([
      'curriculum',
    ])
  })
})

describe('serialiseOpen', () => {
  it('writes the open list and drops the parameter entirely when nothing is open', () => {
    expect(serialiseOpen('/admin', '', ['plans', 'plans.versions'])).toBe(
      '/admin?open=plans%2Cplans.versions',
    )
    expect(serialiseOpen('/admin', '?open=plans', [])).toBe('/admin')
  })

  it('always drops `at`, which is a one-shot instruction', () => {
    // Leaving it would re-fire the jump (scroll + focus move) on every reload.
    expect(serialiseOpen('/admin', '?open=users.access&at=sg-12', ['users.access'])).not.toContain(
      'at=',
    )
  })

  it('preserves unrelated query parameters', () => {
    // A URL is shared state; silently dropping something a colleague appended is a loss that is only
    // noticed once.
    expect(serialiseOpen('/admin', '?ref=email&open=plans', ['versions'])).toContain('ref=email')
  })
})

describe('initialOpen', () => {
  it('a valid deep link wins outright', () => {
    expect(initialOpen('?open=plans', SITE_ADMIN)).toEqual(['plans'])
  })

  it('a deep link to a nested panel brings its ancestor with it', () => {
    expect(initialOpen('?open=plans.delete', SITE_ADMIN)).toEqual(['plans', 'plans.delete'])
  })

  it('a role with exactly ONE top-level section gets it expanded', () => {
    // A Site Admin whose only available child is upload (no plans, no candidates): the box opens, and
    // the lone-child rule below opens the child too.
    expect(initialOpen('', ['plans', 'plans.upload'])).toEqual(['plans', 'plans.upload'])
  })

  /**
   * ⚑ THE TEACHER CASE AFTER THE 2026-08-22 RENESTING, and the reason that reversal was acceptable.
   * "My saved versions" used to be a top-level panel, so rule 2 opened it and the teacher landed on
   * their work. It is now `plans.versions`, so their only top-level id is the GROUP — and without the
   * lone-child exception they would click once more to reveal the one thing they came for, inside a box
   * named for operations they cannot perform. That is precisely the demotion the exception was written
   * to prevent for the Subject Administrator; this pins that it covers the teacher too.
   */
  it('a teacher with editing access still lands on their saved versions, not a closed box', () => {
    expect(initialOpen('', ['plans', 'plans.versions'])).toEqual(['plans', 'plans.versions'])
  })

  it('a role with several sections starts fully collapsed', () => {
    // The redesign's point: the page grows long and unwieldy. Pinned as a decision (round 5's lesson
    // — an unstated default is still a decision, made by whoever types the code first).
    expect(initialOpen('', SITE_ADMIN)).toEqual([])
  })

  /**
   * ⚑ THE ONE EXCEPTION to "nested panels are never auto-opened" (2026-08-18), and it exists because
   * the four-box regrouping silently demoted the Subject Administrator. Roles & Access is their only
   * panel; while it was top-level, rule 2 opened it and they landed on their work. As `users.access`
   * their only top-level id is the GROUP, so rule 2 alone would open a box containing one collapsed
   * row — an extra click to reveal the one thing they came for, inside a box named for accounts they
   * cannot administer. The exception says exactly what rule 2 says: nobody clicks to reveal their
   * only panel.
   */
  it('a lone top-level box with a lone available child opens both (the Subject Admin case)', () => {
    expect(initialOpen('', ['users', 'users.access'])).toEqual(['users', 'users.access'])
  })

  it('…but two top-level boxes still start collapsed, even when each holds one child', () => {
    // The same Subject Admin once they have candidate versions to review: two sections is the
    // multi-section case, and the exception above must not leak into it.
    expect(initialOpen('', ['users', 'users.access', 'plans', 'plans.versions'])).toEqual([])
  })

  it('nested panels do not count toward "only one section"', () => {
    // A Site Admin whose only top-level panel is `plans` still has three children; the auto-expand
    // rule is about SECTIONS, and counting children would open a subtree nobody asked for. This is
    // also the boundary of the lone-child exception above: TWO children is not one.
    expect(initialOpen('', ['plans', 'plans.upload', 'plans.delete'])).toEqual(['plans'])
  })

  it('an entirely stale deep link falls back to the default rather than erroring', () => {
    expect(initialOpen('?open=nonsense', SITE_ADMIN)).toEqual([])
  })
})

describe('the id vocabulary', () => {
  it('is a closed list with no duplicates', () => {
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length)
  })

  it('caps nesting at two levels', () => {
    // D7's "two levels maximum" — a second dot is not a deeper panel, it is a typo.
    for (const id of PANEL_IDS) expect(id.split('.').length).toBeLessThanOrEqual(2)
  })

  it('names a parent for every nested id', () => {
    // A child whose parent is not itself a panel could never be opened, since opening it opens an
    // ancestor that does not exist.
    for (const id of PANEL_IDS) {
      const parent = parentOf(id)
      if (parent) expect(PANEL_IDS).toContain(parent as (typeof PANEL_IDS)[number])
    }
  })
})
