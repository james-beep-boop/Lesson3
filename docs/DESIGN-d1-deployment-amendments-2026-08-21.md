# Proposed D1 amendments — drafted 2026-08-21, NOT applied

Three additions to `docs/DESIGN-next-direction-2026-08-19.md` § **D1** (deployment: the env ceiling,
capability flags and the three presets). Nothing here changes a decision already in that section; two
of them fill gaps, and the third writes down a rejection so it does not have to be re-argued.

⚑ **STATUS: a proposal, not a decision.** It is committed as its own file rather than spliced into D1
because that document was uncommitted work-in-progress at the time of writing and is the operator's to
edit. Splice it in, amend it, or reject it — but if D1 changes in a way that contradicts anything below,
this file is the stale one and should be deleted rather than left to be read as current.

⚑ **What prompted it.** A tooling suggestion on 2026-08-20 proposed a `deployment-settings` global with
a `mode (offline|online)` field driving a landing-page rewrite in Next middleware, plus feature gating
off the same global. Section C refuses the `mode` shape; section B refuses the middleware placement;
section A supplies the part the suggestion did not address at all, which is what happens when the read
fails.

Suggested placement: all three go after the existing **Implementation notes** paragraph, before
**Test matrix is the real cost**. The test-matrix line then absorbs the additions listed at the end.

---

## A. The runtime flags are a security surface, so define access and failure

**Who may write them.** The global's `access.update` is Site-Administrator-only, asserted
server-side. ⚑ **Omitting the panel from the UI is not an authorization boundary** — the same rule as
D6a's picker: a Payload global is reachable through its own REST/GraphQL endpoints, so a flag that is
merely un-rendered for a Teacher is still writable by one. Reads for the public path go through a
server-only module (the `lib/publicLibrary.ts` pattern), never a client fetch.

**Fail CLOSED, and say so at the read site.** The public route asks one question — "is discovery live
right now?" — and every failure to answer it means **no**:

| Situation | Answer | Why |
|---|---|---|
| Global read succeeds, `publicLibraryLive: true` | live | the only way to be public |
| Global read succeeds, flag false | 404 | ordinary off |
| Global has never been created (fresh install) | 404 | absence is not consent |
| DB unreachable, cache empty | 404 | ⚑ never infer "probably still on" |
| DB unreachable, cache holds a `true` **past** its TTL | 404 | a stale yes is the one answer that cannot be given |

The last row is the whole point of writing this down: a read-through cache that returns its last
known value on error converts a database blip into an indefinite public exposure that no operator
action ended. On a read error, return off **without caching the off** — so the next request retries
rather than extending the outage into a second failure mode.

**The exposure window is the TTL, and it must be a stated number.** With TTL = *N* seconds and two app
containers, switching the flag off takes up to *N* seconds to be effective everywhere. Pick *N* (30s
is the suggestion — a public directory index is not latency-critical) and put the number in the admin
copy, per the existing note that propagation delay "should be stated in the admin UI rather than
discovered". A range or "shortly" is not a stated number.

⚑ **A cache TTL is not a take-down, and the emergency path must not depend on the database.** The hard
kill stays the env ceiling: unset `PUBLIC_LIBRARY_ENABLED`, restart, and every public route 404s at
boot with no global read involved. That is the only control that still works when the reason you want
it is that the database or the admin UI is the thing misbehaving. Document it beside the toggle as
*the* emergency procedure; the toggle is the ordinary one.

## B. ⚑ The obvious implementation is blocked: do not read the global in Next middleware

`app/src/middleware.ts` mints the per-request CSP nonce with Web Crypto and declares no runtime, so it
runs on the **edge** runtime — where the Postgres adapter cannot reach. Next 16.2.12 does support a
node-runtime middleware, but switching it moves the strict-nonce CSP path (Phase 5 A3, pinned by
`tests/http/endpoints.http.spec.ts`) onto a different runtime. That is a consequence to accept
deliberately, not a config line.

**Resolve the flag where Payload's Local API already lives** — the public route handler / server
component, next to the existing `lib/publicLibrary.ts` gate that already produces the server-side 404.
The check belongs beside the boundary it defends, not one layer out from it, and this keeps middleware
doing the one thing only middleware can do.

## C. ⚑ Do not reintroduce `mode: 'offline' | 'online'`

Proposed once by tooling on 2026-08-20 and worth refusing by name, because it will be proposed again:
a single `mode` enum on the global, with the landing page and every external feature gated on it.

It contradicts three decisions already made in this section — the env **capability ceiling**, *presets
over flags rather than a three-way enum*, and *NOT one master switch labelled "offline mode"* — and it
gives up the property the ceiling exists for. A DB-stored `mode` writable from the admin UI means one
compromised or confused Site-Admin account on a school box can put that school on the internet, which
is precisely what "off-by-env means the routes still 404" was written to prevent. The preset mechanism
already delivers the ergonomics an enum was reaching for, without being a boundary.

---

## Additions to the test matrix

The existing line is "env × flags, and the existing 404 boundary must not weaken in any combination."
Add the failure and authorization axes, which are where a fail-closed design actually gets decided:

- global **absent** (fresh install) → 404, in both env states
- global read **throws** → 404, and the failure is not cached
- a cached `true` **past its TTL** with the DB down → 404
- `update` attempted by a Teacher and by a Subject Administrator → refused at the wire, not merely
  absent from the UI
- unauthenticated read of the global's REST endpoint → refused
- flag flipped off → public routes 404 within the stated TTL

⚑ Every one of these is a case where the wrong behaviour is *silent and open*, which is the pairing
that has cost this project the most (see DECISIONS 2026-08-20). Each wants a test that has been seen
to fail, not a reasoned paragraph.
