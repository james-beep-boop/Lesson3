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

## D. Capabilities have FOUR states, not two — and a toggle may only ever express one of them

Extended 2026-08-21 after the operator observed that some of this belongs at *deployment* time: most
ARES schools will stay offline for years, and there is no reason to ship functions they will never use.
That is right, and it makes the model four-state:

| State | Means | Where it belongs | How it changes |
|---|---|---|---|
| **Not built** | no code exists anywhere | Features, disabled, with the true reason | a future PR |
| **Absent** | built, but the bits are not on this box | **Deployment facts**, with an instruction | operator action at the console |
| **Present, off** | on disk, gated | Features, toggle off | Site Admin flips it |
| **Present, on** | running | Features, toggle on | — |

⚑ **NEVER RENDER A TOGGLE FOR SOMETHING ABSENT.** A switch that does nothing when flipped is the same
failure as the master switch section C refuses — a label asserting something the code does not mean.
Absent capabilities are facts, not controls.

⚑ **And "not built" must not be dressed as "coming soon."** `studentAccess` today is not built anywhere
*and* would need its own env ceiling; the honest label says a student would currently be a valid
`req.user` for six authorization gates (D3), so the switch cannot exist yet.

## E. ONE image, not build variants — and the codegen rule that makes it safe

The online deployment is the superset; school deployments are subsets. Both are served from one
codebase, so:

- **One artifact.** Two build variants double the test matrix, and the failure mode is "works in the
  cloud build, broken in the school build" — discovered in a school with no internet to report it. The
  gate tests one artifact today; keep it that way.
- **Compose profiles for sidecars.** None are in use yet, so the mechanism is clean and available:
  `docker compose --profile <x> up -d` adds a process without touching the app image.
- **Conditional Payload registration is available if routes/collections must be absent too** —
  `collections` is a flat array, so it is a one-line spread.
  - ⚑ **BUT CODEGEN MUST ALWAYS RUN WITH EVERY FEATURE ON.** `migrate:create` diffs the live config
    against the committed snapshot, so generating a migration on a box with a feature switched off
    emits one that **DROPS** its tables. Same hazard for `generate:types`. One canonical configuration,
    always.
  - Migration *files* apply unconditionally regardless of what is registered, so an unregistered
    collection's table simply exists and is unreachable. That is a feature: enabling later is an env
    flip and a restart, with no schema change on a box nobody can reach remotely.

## F. ⚑ The app must NEVER be able to start containers

A toggle that "installs" a feature implies the app can act on Docker. Mounting `/var/run/docker.sock`
into the app container is effectively root on the host: a web-app RCE becomes host compromise, on a
machine sitting in a school with nobody to notice. Nothing in `app/src` touches Docker today.

The permitted shape: **the toggle records intent; an operator (or a privileged reconciler outside the
app) acts on it.** And on an air-gapped box "install" cannot mean "download" anyway — the bits must
already be present or arrive on media, which collapses most of the apparent flexibility.

## G. Two gaps this section still has

⚑ **The online tier is unsized.** Every number in D1 is per-school — ~50 concurrent, 8–16 GB — and the
online deployment is now the primary product (the operator's goal is national reach, with schools
self-hosting as the secondary case). Three things were sized for a school and are not obviously right
for the country: the jobs queue runs `autoRun` **in-process on one long-running container**; Gotenberg
is capped at 2 CPUs with a 120 s timeout; and the rate-limit budgets. See SPEC §9 for the measured
limits.

⚑ **Student access needs its own env ceiling** (`STUDENT_ACCESS_ENABLED`, decided 2026-08-21), mirroring
`PUBLIC_LIBRARY_ENABLED`. D1 already says the preset must never be a security boundary and must not
enable student roster login; a ceiling is what makes that true rather than intended — no UI flip on a
school box can put that school into student mode.

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
