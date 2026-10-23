/**
 * Manage accordion — the pure URL⇄open-state projection (D7a).
 *
 * Split out of `useOpenPanels.ts` for the reason `recoveryParse.ts` and `previewParse.ts` were split
 * out of their endpoints: the serialisation rules are the part worth pinning, and they can be
 * asserted in the unit suite without a DOM, a router or a served app. Nothing here touches
 * `window` — the hook owns every side effect.
 *
 * ⚑ The id vocabulary is CLOSED and lives here alone. D7a requires unknown, stale or
 * role-inaccessible ids to be ignored silently and scrubbed from the URL, and that rule is only
 * enforceable while one list decides what "known" means. A Subject Admin following a link carrying
 * `open=users` must land on a normal page — not an error, and not an empty panel implying something
 * was withheld.
 */

/**
 * Every panel id the accordion may carry, in render order. A nested panel is `parent.child`, which
 * is the whole nesting grammar — D7 caps the tree at two levels, so a second dot is not a deeper
 * panel, it is a typo.
 *
 * ⚑ These are a URL CONTRACT, not internal names: they appear in bookmarks and shared links, so
 * renaming one silently breaks a link that used to work. An id must not encode one role's label:
 * `plans.versions` is not `plans.cleanup` because it once carried a teacher's list too (see below).
 *
 * ⚑ THE TOP LEVEL WAS REGROUPED (operator decision 2026-08-18) from six flat sections into groups of
 * nested panels, and again on 2026-08-27 when `versions` was folded in as `plans.versions`. Between
 * them those changes RETIRED four ids and CHANGED the meaning of a fifth. Read this before concluding
 * a link is broken:
 *
 *   - `subjects` → `curriculum.subjects`, `subject-grades` → `curriculum.subject-grades`,
 *     `access` → `users.access`, and (2026-08-27) `versions` → `plans.versions`. The old spellings are
 *     retired: `parseOpen` drops ids outside this list, so an old bookmark lands on a normal Manage
 *     page with nothing opened and the parameter scrubbed. That is what retiring an entry in a URL
 *     contract is supposed to feel like from the outside, and it is now the THIRD time this vocabulary
 *     has done it (see `curriculum` below).
 *   - `curriculum.subjects` and `curriculum.subject-grades` were RETIRED on 2026-10-16 when the two
 *     nested panels were replaced by the unified SubjectsAndGradesPanel matrix. `curriculum` itself
 *     remains and is now a leaf rather than a group. Old links carrying the child ids are silently
 *     dropped; links carrying `curriculum` still open that panel as before.
 *   - `users` now names the GROUP, not the accounts panel — which is `users.accounts`. So an old
 *     `?open=users` link still opens something, one level out from what it used to. That is the
 *     benign direction for a changed meaning, and it is only benign because the group CONTAINS the
 *     panel the link meant.
 *
 * ⚑ AND `curriculum` IS BACK, which the previous version of this comment told the next reader not to
 * do. The prohibition was specific and still holds in its own terms: it forbade re-adding the id **to
 * make an old link work**, i.e. resurrecting a panel the product no longer had. The product now has a
 * Subjects and grades group again, and it contains exactly what the old holding pen dissolved into (Subjects
 * and Subject grades), so an ancient `?open=curriculum` bookmark resolves to a superset of what it
 * originally pointed at. The id is being reused because the panel came back, not to rescue the link.
 * `tests/unit/panelState.spec.ts` pins the new meaning, where it used to pin the retirement.
 *
 * ⚑ `system` IS NAMED "System", not "System Administration" (operator decision 2026-08-21, after
 * proposing the longer form). Two reasons, and the second is the one that decided it: the other boxes
 * are `Users`, `Subjects and grades`, `Lesson plans` — plain nouns, so "System" is parallel and the longer form
 * would be the only category-of-activity label; and "System Administration" would sit inches from
 * **Site Administrator** and **Subject Administrator** on a page whose role vocabulary has already cost
 * this project rework twice ("Editor" as a user type, `draft`). D1 called the panel "Installation",
 * which is too narrow for the half that holds switches — turning outbound email off is not an
 * installation fact. Design: `docs/DESIGN-system-panel-2026-08-21.md`.
 *
 * ⚑ `versions` IS NOW `plans.versions` (2026-08-27, superseding the 2026-08-18 decision to keep it
 * top-level — `docs/DECISIONS.md`).
 *
 * ⚑ AND `plans.versions` IS NOW ADMINISTRATOR-ONLY (Proposal B, 2026-10-22,
 * `docs/PLAN-forum-dialogs-and-manage-personal-work-2026-10-22.md`). Every role's OWN work moved to
 * `plans.mine` ("Your saved versions") and `plans.drafts` ("Your drafts"), so each id now has one
 * meaning for everyone, and `plans.versions` is only ever "Delete individual versions". It is not
 * retired: it stays valid for administrators. For a teacher, `parseOpen` reads their old
 * `plans.versions` as `plans.mine` (`MOVED_FOR_CALLERS_WITHOUT`), so both bookmark forms —
 * `?open=plans.versions` and the canonical `?open=plans,plans.versions` — still land on their saved
 * versions.
 */
export const PANEL_IDS = [
  'users',
  'users.accounts',
  'users.access',
  // ⚑ `curriculum.subjects` and `curriculum.subject-grades` were RETIRED when the two-panel design
  // was replaced by the unified SubjectsAndGradesPanel matrix. Old links carrying those ids are
  // silently dropped by `parseOpen` — they were valid as of 2026-08-18, retired 2026-10-16.
  'curriculum',
  'plans',
  // The caller's own work, first in the box for every role (Proposal B, 2026-10-22). `plans.mine` is
  // first on purpose: it is the child `initialOpen`'s first-child rule opens for a teacher.
  'plans.mine',
  'plans.drafts',
  'plans.upload',
  'plans.delete',
  // Administrators only: other people's deletable versions, a cleanup queue ("Delete individual versions").
  'plans.versions',
  'plans.repair',
  'system',
  'system.features',
  'system.deployment',
  'system.backups',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** The query parameter carrying open state. */
export const OPEN_PARAM = 'open'
/** The query parameter naming a nested target to reveal + focus on arrival, then scrubbed (D7a). */
export const AT_PARAM = 'at'

/**
 * `at` is a dynamic DOM target rather than a panel id, so it cannot use the closed vocabulary
 * above. Keep it to the id fragment PR 4's focus consumer can safely accept; malformed values are
 * ignored just like unknown panel ids rather than handed to a future selector or focus lookup.
 */
const AT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The `at` anchor for one subject-grade's Editing-access group.
 *
 * ⚑ THE GRAMMAR IS DECIDED HERE, not spelled inline at each end. The widget WRITES this id onto its
 * group heading and the Users panel's grant rows LINK to it, in different component trees — so the
 * literal `sg-${id}` was a contract held together by two files agreeing on a template string. It
 * fails silently in exactly one direction: a renamed prefix leaves the jump landing on nothing, with
 * no error and a URL that still looks right. It belongs beside `AT_PATTERN`, which is the other half
 * of the same grammar, and its output is deliberately within that pattern.
 */
export const subjectGradeAnchor = (subjectGradeId: number): string => `sg-${subjectGradeId}`

/** Parse a one-shot nested target from a query string, rejecting unsafe or unbounded ids. */
export function parseAt(search: string): string | null {
  const at = new URLSearchParams(search).get(AT_PARAM)
  return at !== null && AT_PATTERN.test(at) ? at : null
}

/** A panel's parent, or null for a top-level panel. `plans.upload` → `plans`. */
export function parentOf(id: string): string | null {
  const dot = id.indexOf('.')
  return dot === -1 ? null : id.slice(0, dot)
}

/**
 * Canonicalise any collection of ids into render order, dropping anything outside the vocabulary.
 *
 * ⚑ ORDER FOLLOWS `PANEL_IDS`, NEVER THE INPUT, and that is a correctness property rather than a
 * tidiness one: it makes serialisation stable, so `?open=plans,access` and `?open=access,plans`
 * describe the same page instead of endlessly rewriting each other's URL. Every function below
 * routes through here so the invariant is stated once.
 */
function inRenderOrder(ids: Iterable<string>): PanelId[] {
  const set = new Set(ids)
  return PANEL_IDS.filter((id) => set.has(id))
}

/**
 * Add each open panel's ancestors. A nested panel is only meaningfully open while its parent is: a
 * hidden parent hides the whole subtree, so an `?open=plans.upload` without `plans` would render as
 * nothing at all and then survive in the URL as state the page does not reflect.
 */
export function withAncestors(open: readonly string[]): PanelId[] {
  const set = new Set<string>(open)
  for (const id of open) {
    const parent = parentOf(id)
    if (parent) set.add(parent)
  }
  return inRenderOrder(set)
}

/**
 * Ids whose CONTENT moved for callers who no longer have them, read as the panel that now holds it.
 *
 * ⚑ `plans.versions` → `plans.mine` (Proposal B, 2026-10-22; Codex review of #434). Until then a
 * teacher's saved versions lived at `plans.versions`, and the accordion canonicalised their page to
 * `?open=plans,plans.versions` — the form their bookmarks actually hold. Simply dropping the obsolete
 * child left `plans` valid, so `initialOpen` honoured the URL and they landed on a bare Lesson plans
 * box with Your saved versions closed: worse than the landing the bookmark was made from. Applied ONLY
 * when the caller cannot see the old id and can see the new one, so an administrator's
 * `plans.versions` (their cleanup queue, a different panel) is untouched.
 */
const MOVED_FOR_CALLERS_WITHOUT: Readonly<Record<string, PanelId>> = {
  'plans.versions': 'plans.mine',
}

/**
 * Read open state out of a query string, keeping only ids that are BOTH in the closed vocabulary and
 * available to this caller (the role gate — `available` is what the server actually rendered), and
 * opening the ancestors of anything nested.
 *
 * ⚑ The ancestor step is INSIDE this function rather than at its call sites. Both callers wanted it
 * and both used to apply it by hand, which made a correctness rule into something a third caller
 * could forget — and the failure mode is silent (a child rendered inside a hidden parent, i.e.
 * nothing on screen, with the URL still claiming it is open).
 */
export function parseOpen(search: string, available: readonly string[]): PanelId[] {
  // `getAll`, not `get`: a repeated `?open=a&open=b` is a legitimate way to write the same intent,
  // and `get` silently returns only the first — which would drop half a shared link's panels with no
  // sign anything was lost. Next hands the server `string[]` for exactly this case.
  const raw = new URLSearchParams(search).getAll(OPEN_PARAM)
  if (raw.length === 0) return []
  const allowed = new Set(available)
  const wanted = raw
    .flatMap((part) => part.split(','))
    .map((part) => {
      const id = part.trim()
      const moved = MOVED_FOR_CALLERS_WITHOUT[id]
      return moved && !allowed.has(id) && allowed.has(moved) ? moved : id
    })
  const gated = inRenderOrder(wanted.filter((id) => allowed.has(id)))
  // A panel is only openable if its whole ancestry is too: a child lives INSIDE its parent's panel
  // element, so an id whose parent this caller cannot see could never appear on screen — keeping it
  // would put state in the URL that the page cannot reflect. Drop the orphan rather than the rule.
  return withAncestors(gated).filter(
    (id) => allowed.has(id) && (parentOf(id) === null || allowed.has(parentOf(id)!)),
  )
}

/**
 * Closing a parent closes its descendants, so reopening it does not spring back to a subtree the
 * user last saw several interactions ago.
 */
export function withoutDescendants(open: readonly string[], closing: string): PanelId[] {
  const prefix = `${closing}.`
  return inRenderOrder([...open].filter((id) => id !== closing && !id.startsWith(prefix)))
}

/**
 * Serialise open state back into a path + query, PRESERVING any unrelated query parameters the page
 * was loaded with. Manage does not read others today, but a URL is shared state — silently dropping
 * a parameter someone appended is the kind of loss that is only noticed once.
 *
 * `at` is always dropped: it is a one-shot instruction consumed on arrival (D7a), and leaving it in
 * the address bar would re-fire the jump on every reload.
 */
export function serialiseOpen(pathname: string, search: string, open: readonly string[]): string {
  const params = new URLSearchParams(search)
  params.delete(AT_PARAM)
  if (open.length === 0) params.delete(OPEN_PARAM)
  else params.set(OPEN_PARAM, open.join(','))
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * The initial open set for a fresh render (D7, pinned as a decision rather than left to whichever
 * `useState` an implementer typed first — the round-5 lesson).
 *
 *   1. A valid `?open=` wins outright: a deep link or a reload restores exactly what was open.
 *   2. Otherwise, a role seeing exactly ONE top-level section gets it expanded, so nobody clicks to
 *      reveal their only panel (a teacher with editing access sees only Lesson plans).
 *   3. Otherwise nothing is open. Multi-section roles start collapsed — that IS the redesign; the
 *      operator's brief was that the page grows long and unwieldy.
 *
 * ⚑ Nested panels are NEVER auto-opened — with ONE exception, added 2026-08-18 when the top level was
 * regrouped into boxes, and it is rule 2 restated one level down rather than a new idea: when a role's
 * single top-level panel opens, its FIRST available child opens too.
 *
 * ⚑ "FIRST", NOT "ONLY" (Proposal B, operator decision 2026-10-22). Until then it read "if it has
 * exactly one child". Bringing a teacher's drafts into Lesson plans gave their one box two children
 * (`plans.mine`, `plans.drafts`), and "exactly one" would have closed both, putting their saved
 * versions behind a click. The operator chose saved versions open and drafts closed. "First child"
 * gives that structurally — `plans.mine` is first in `PANEL_IDS` — with no role check, and agrees with
 * the old rule wherever there is one child. Drafts never open on the strength of existing (decided).
 *
 * Without it the regrouping quietly demoted the Subject Administrator. Their only panel is Roles &
 * Access; it used to be top-level, so rule 2 opened it and they landed on their work. Once it became
 * `users.access` their only top-level id is the GROUP, so rule 2 opened a box containing a single
 * collapsed row — one more click than before, to reveal the one thing they came for, inside a box
 * labelled for accounts they cannot administer. The general rule and the exception say the same thing:
 * nobody clicks to reveal their only panel. (Since Proposal B a Subject Administrator always has two
 * boxes, Users and Lesson plans with their own work, so they land all-closed — operator decision
 * 2026-10-22, the plan's Q7. Teachers with editing access are now the rule's only beneficiaries.)
 *
 * It stays deliberately narrow: it applies only when a role has ONE top-level box, which no
 * administrator has, so their subtrees are unchanged. "First" is checked against `available` — the
 * role gate — not against `PANEL_IDS`, because the question is what THIS caller can see.
 */
export function initialOpen(search: string, available: readonly string[]): PanelId[] {
  const fromUrl = parseOpen(search, available)
  if (fromUrl.length > 0) return fromUrl
  const topLevel = available.filter((id) => parentOf(id) === null)
  if (topLevel.length !== 1) return []
  const children = available.filter((id) => parentOf(id) === topLevel[0])
  // `inRenderOrder`, so "first" means first on the page whatever order `available` arrived in.
  const [first] = inRenderOrder(children)
  return inRenderOrder(first ? [topLevel[0], first] : topLevel)
}

/**
 * The SERVER's entry point: resolve both pieces of accordion state straight from Next's
 * `searchParams` record.
 *
 * This exists so the query-string plumbing lives in the module that owns the parameter names rather
 * than being open-coded in a page component. `AdminDashboard` previously flattened the record into a
 * string inline and then parsed it twice — once here, once again for `at` — which put `AT_PARAM`
 * knowledge outside this file and left the next custom admin view a nested-ternary flatMap to copy.
 */
export function resolveServerPanelState(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  available: readonly string[],
): { open: PanelId[]; at: string | null } {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value == null) continue
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one)
  }
  const search = params.toString()
  return {
    open: initialOpen(search, available),
    at: parseAt(search),
  }
}
