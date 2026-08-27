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
 * renaming one silently breaks a link that used to work. `versions` is deliberately not `saved` —
 * the same panel is titled "Candidate versions" for administrators and "My saved versions" for
 * Teachers with editing access, and an id must not encode one role's label.
 *
 * ⚑ THE TOP LEVEL WAS REGROUPED (operator decision 2026-08-18) from six sections to four boxes, and
 * again on 2026-08-27 from four to THREE, when `versions` was folded in as `plans.versions`. Between
 * them those changes RETIRED four ids and CHANGED the meaning of a fourth. Read this before concluding
 * a link is broken:
 *
 *   - `subjects` → `curriculum.subjects`, `subject-grades` → `curriculum.subject-grades`,
 *     `access` → `users.access`, and (2026-08-27) `versions` → `plans.versions`. The old spellings are
 *     retired: `parseOpen` drops ids outside this list, so an old bookmark lands on a normal Manage
 *     page with nothing opened and the parameter scrubbed. That is what retiring an entry in a URL
 *     contract is supposed to feel like from the outside, and it is now the THIRD time this vocabulary
 *     has done it (see `curriculum` below).
 *   - `users` now names the GROUP, not the accounts panel — which is `users.accounts`. So an old
 *     `?open=users` link still opens something, one level out from what it used to. That is the
 *     benign direction for a changed meaning, and it is only benign because the group CONTAINS the
 *     panel the link meant.
 *
 * ⚑ AND `curriculum` IS BACK, which the previous version of this comment told the next reader not to
 * do. The prohibition was specific and still holds in its own terms: it forbade re-adding the id **to
 * make an old link work**, i.e. resurrecting a panel the product no longer had. The product now has a
 * Curriculum group again, and it contains exactly what the old holding pen dissolved into (Subjects
 * and Subject grades), so an ancient `?open=curriculum` bookmark resolves to a superset of what it
 * originally pointed at. The id is being reused because the panel came back, not to rescue the link.
 * `tests/unit/panelState.spec.ts` pins the new meaning, where it used to pin the retirement.
 *
 * ⚑ `system` IS NAMED "System", not "System Administration" (operator decision 2026-08-21, after
 * proposing the longer form). Two reasons, and the second is the one that decided it: the other boxes
 * are `Users`, `Curriculum`, `Lesson plans` — plain nouns, so "System" is parallel and the longer form
 * would be the only category-of-activity label; and "System Administration" would sit inches from
 * **Site Administrator** and **Subject Administrator** on a page whose role vocabulary has already cost
 * this project rework twice ("Editor" as a user type, `draft`). D1 called the panel "Installation",
 * which is too narrow for the half that holds switches — turning outbound email off is not an
 * installation fact. Design: `docs/DESIGN-system-panel-2026-08-21.md`.
 *
 * ⚑ `versions` JOINED `plans` ON 2026-08-27 and is now `plans.versions`. This paragraph used to argue
 * the opposite — that it must stay top-level, because every non-administrator sees that panel and
 * nothing else (`showSaved` in `AdminDashboard`), so nesting it would put a teacher's entire page
 * behind a "Lesson plans" box offering them nothing else. That objection is answered rather than
 * dismissed: `initialOpen` opens a lone top-level panel AND its lone available child, so a teacher
 * still lands on their saved versions without a click. The operator reversed the decision after using
 * the page; see `docs/DECISIONS.md` 2026-08-27, which supersedes the 2026-08-18 entry.
 */
export const PANEL_IDS = [
  'users',
  'users.accounts',
  'users.access',
  'curriculum',
  'curriculum.subjects',
  'curriculum.subject-grades',
  'plans',
  'plans.upload',
  // ⚑ WAS TOP-LEVEL `versions` UNTIL 2026-08-27, and the reversal is deliberate: the 2026-08-18 entry
  // in DECISIONS argued it should stay top-level, and the operator has since used the page and judged
  // saved/candidate versions to be part of lesson-plan management. The dated entry stays as history;
  // a new one records the supersession. Do NOT "restore" the old shape from that older entry.
  //
  // ⚑ ONE id FOR EVERY ROLE. Role-dependent nesting was considered twice and refused both times: the
  // vocabulary is role-independent so a shared link means the same page for everyone. What differs by
  // role is the TITLE ("Candidate versions" for an administrator, "My saved versions" otherwise) and
  // whether the row is available at all — never where it lives.
  'plans.versions',
  'plans.delete',
  'plans.repair',
  'system',
  'system.deployment',
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
  const wanted = raw.flatMap((part) => part.split(',')).map((s) => s.trim())
  const allowed = new Set(available)
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
 *      reveal their only panel (a teacher with editing access's "My saved versions" is the whole page).
 *   3. Otherwise nothing is open. Multi-section roles start collapsed — that IS the redesign; the
 *      operator's brief was that the page grows long and unwieldy.
 *
 * ⚑ Nested panels are NEVER auto-opened — with ONE exception, added 2026-08-18 when the top level was
 * regrouped into boxes, and it is rule 2 restated one level down rather than a new idea: if a role's
 * single top-level panel has exactly one child available to them, that child opens too.
 *
 * Without it the regrouping quietly demoted the Subject Administrator. Their only panel is Roles &
 * Access; it used to be top-level, so rule 2 opened it and they landed on their work. Once it became
 * `users.access` their only top-level id is the GROUP, so rule 2 opened a box containing a single
 * collapsed row — one more click than before, to reveal the one thing they came for, inside a box
 * labelled for accounts they cannot administer. The general rule and the exception say the same thing:
 * nobody clicks to reveal their only panel.
 *
 * It stays deliberately narrow. `plans` with three children still opens closed (asserted below), so a
 * Site Admin's subtrees are unchanged, and "exactly one" is checked against `available` — the role
 * gate — not against `PANEL_IDS`, because the question is what THIS caller can see.
 */
export function initialOpen(search: string, available: readonly string[]): PanelId[] {
  const fromUrl = parseOpen(search, available)
  if (fromUrl.length > 0) return fromUrl
  const topLevel = available.filter((id) => parentOf(id) === null)
  if (topLevel.length !== 1) return []
  const children = available.filter((id) => parentOf(id) === topLevel[0])
  return inRenderOrder(children.length === 1 ? [topLevel[0], children[0]] : topLevel)
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
