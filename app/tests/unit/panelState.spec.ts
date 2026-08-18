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
  'subjects',
  'subject-grades',
  'access',
  'plans',
  'plans.upload',
  'plans.delete',
  'plans.repair',
  'versions',
]

describe('parentOf', () => {
  it('reads the one level of nesting the grammar allows', () => {
    expect(parentOf('plans')).toBeNull()
    expect(parentOf('plans.upload')).toBe('plans')
  })
})

describe('parseOpen', () => {
  it('keeps ids that are both known and available', () => {
    expect(parseOpen('?open=access,plans', SITE_ADMIN)).toEqual(['access', 'plans'])
  })

  it('drops ids that are not in the closed vocabulary', () => {
    expect(parseOpen('?open=access,nonsense', SITE_ADMIN)).toEqual(['access'])
  })

  it('drops ids the CALLER cannot see, even though they are valid ids', () => {
    // The Subject Admin case: `subjects` is a real panel, just not one this page rendered. It must
    // vanish silently — an error or an empty panel would tell them something was withheld.
    expect(parseOpen('?open=subjects,access', ['access', 'versions'])).toEqual(['access'])
  })

  /**
   * ⚑ A RETIRED id, which is a different case from an unknown one and from an inaccessible one — and
   * the only one of the three that a REAL bookmark can hit. `curriculum` shipped as a panel id, so
   * links carrying it exist; PR 3 dissolved it into `subjects` and `subject-grades`. The vocabulary
   * is a URL contract, and this is what retiring an entry in it is supposed to feel like from the
   * outside: a normal Manage page with nothing opened, not an error and not a resurrected panel.
   *
   * Pinned because the tempting "fix" for a broken old link is to re-add the id, and doing that would
   * quietly reintroduce a panel the product no longer has.
   */
  it('drops a RETIRED id, so an old bookmark degrades instead of erroring', () => {
    expect(parseOpen('?open=curriculum', SITE_ADMIN)).toEqual([])
    expect(parseOpen('?open=curriculum,access', SITE_ADMIN)).toEqual(['access'])
  })

  it('is order-stable, so a parsed value re-serialises to itself', () => {
    // Otherwise `?open=plans,access` and `?open=access,plans` would keep rewriting each other's URL.
    expect(parseOpen('?open=plans,access', SITE_ADMIN)).toEqual(
      parseOpen('?open=access,plans', SITE_ADMIN),
    )
  })

  it('tolerates whitespace, empty entries and a missing parameter', () => {
    expect(parseOpen('?open= access , ,plans ', SITE_ADMIN)).toEqual(['access', 'plans'])
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
    expect(parseOpen('?open=plans.delete', ['plans.delete', 'versions'])).toEqual([])
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
    expect(resolveServerPanelState({ open: ['access', 'plans'] }, SITE_ADMIN).open).toEqual([
      'access',
      'plans',
    ])
    expect(resolveServerPanelState(undefined, SITE_ADMIN)).toEqual({ open: [], at: null })
    expect(resolveServerPanelState({ open: 'access' }, SITE_ADMIN).at).toBeNull()
  })

  it('ignores malformed dynamic jump targets before a focus consumer can receive them', () => {
    expect(resolveServerPanelState({ at: 'sg-12' }, SITE_ADMIN).at).toBe('sg-12')
    expect(resolveServerPanelState({ at: '' }, SITE_ADMIN).at).toBeNull()
    expect(resolveServerPanelState({ at: 'sg 12' }, SITE_ADMIN).at).toBeNull()
    expect(resolveServerPanelState({ at: 'x'.repeat(65) }, SITE_ADMIN).at).toBeNull()
  })

  it('applies the single-section auto-expand when the query says nothing', () => {
    expect(resolveServerPanelState({}, ['versions']).open).toEqual(['versions'])
  })
})

describe('withAncestors / withoutDescendants', () => {
  it('opening a nested panel opens its parent', () => {
    // A child inside a hidden parent renders as nothing while the URL claims it is open.
    expect(withAncestors(['plans.delete'])).toEqual(['plans', 'plans.delete'])
  })

  it('closing a parent closes its subtree', () => {
    expect(withoutDescendants(['access', 'plans', 'plans.delete'], 'plans')).toEqual(['access'])
  })

  it('closing a parent leaves unrelated panels alone', () => {
    expect(withoutDescendants(['subjects', 'plans', 'plans.upload'], 'plans')).toEqual(['subjects'])
  })
})

describe('serialiseOpen', () => {
  it('writes the open list and drops the parameter entirely when nothing is open', () => {
    expect(serialiseOpen('/admin', '', ['access', 'plans'])).toBe('/admin?open=access%2Cplans')
    expect(serialiseOpen('/admin', '?open=access', [])).toBe('/admin')
  })

  it('always drops `at`, which is a one-shot instruction', () => {
    // Leaving it would re-fire the jump (scroll + focus move) on every reload.
    expect(serialiseOpen('/admin', '?open=access&at=sg-12', ['access'])).not.toContain('at=')
  })

  it('preserves unrelated query parameters', () => {
    // A URL is shared state; silently dropping something a colleague appended is a loss that is only
    // noticed once.
    expect(serialiseOpen('/admin', '?ref=email&open=access', ['plans'])).toContain('ref=email')
  })
})

describe('initialOpen', () => {
  it('a valid deep link wins outright', () => {
    expect(initialOpen('?open=access', SITE_ADMIN)).toEqual(['access'])
  })

  it('a deep link to a nested panel brings its ancestor with it', () => {
    expect(initialOpen('?open=plans.delete', SITE_ADMIN)).toEqual(['plans', 'plans.delete'])
  })

  it('a role with exactly ONE top-level section gets it expanded', () => {
    // A teacher with editing access: "My saved versions" is the whole page, so nobody clicks to reveal their only panel.
    expect(initialOpen('', ['versions'])).toEqual(['versions'])
  })

  it('a role with several sections starts fully collapsed', () => {
    // The redesign's point: the page grows long and unwieldy. Pinned as a decision (round 5's lesson
    // — an unstated default is still a decision, made by whoever types the code first).
    expect(initialOpen('', SITE_ADMIN)).toEqual([])
  })

  it('nested panels do not count toward "only one section"', () => {
    // A Site Admin whose only top-level panel is `plans` still has three children; the auto-expand
    // rule is about SECTIONS, and counting children would open a subtree nobody asked for.
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
