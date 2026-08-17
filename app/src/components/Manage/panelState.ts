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
 * Editors, and an id must not encode one role's label.
 *
 * `curriculum` is transitional: PRs 2b/3 dissolve it into `users`, `subjects` and `subject-grades`
 * as those panels replace the three links it holds today. When that lands, a stale
 * `?open=curriculum` degrades to "nothing opened" through the scrub rule below rather than erroring
 * — which is exactly why the scrub rule exists.
 */
export const PANEL_IDS = [
  'curriculum',
  'access',
  'plans',
  'plans.upload',
  'plans.delete',
  'plans.repair',
  'versions',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** The query parameter carrying open state. */
export const OPEN_PARAM = 'open'
/** The query parameter naming a nested target to reveal + focus on arrival, then scrubbed (D7a). */
export const AT_PARAM = 'at'

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
  return inRenderOrder(
    [...open].filter((id) => id !== closing && !id.startsWith(prefix)),
  )
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
 *      reveal their only panel (an Editor's "My saved versions" is the whole page).
 *   3. Otherwise nothing is open. Multi-section roles start collapsed — that IS the redesign; the
 *      operator's brief was that the page grows long and unwieldy.
 *
 * ⚑ Nested panels are NEVER auto-opened, including `plans.upload`. Uniform-closed costs a Site Admin
 * one extra click to reach Upload; the alternative is a special case that has to be re-justified
 * every time a child is added.
 */
export function initialOpen(search: string, available: readonly string[]): PanelId[] {
  const fromUrl = parseOpen(search, available)
  if (fromUrl.length > 0) return fromUrl
  const topLevel = available.filter((id) => parentOf(id) === null)
  if (topLevel.length === 1) return inRenderOrder(topLevel)
  return []
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
  return { open: initialOpen(search, available), at: params.get(AT_PARAM) }
}
