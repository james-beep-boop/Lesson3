# SUPERSEDED — folded into D1 on 2026-08-22

⚑ **Do not read this file as current. It has no content left.** Everything it proposed now lives in
`docs/DESIGN-next-direction-2026-08-19.md` **§D1**, which is the single authority for the deployment
model, the System panel and the capability flags.

## Why it is a stub rather than a deletion

It existed for four days as a *proposal* against a document that was then uncommitted work in progress,
and the System panel design was built on it. Two problems followed, both flagged in the operator's
design review of 2026-08-22:

- It was **titled "Three additions"** while its body had grown to sections **A–G**, several of which the
  System design depended on. A proposal document had quietly become a decision document.
- With D1, this file, `docs/DESIGN-system-panel-2026-08-21.md`, `docs/NEXT-SESSION.md` and `SPEC.md` all
  describing the panel, there were **three incompatible authorities** — D1 said "Installation",
  `installation.*`, three presets and student/AI flags; the System design said "System", `system.*`, two
  flags and no presets; and this file called itself optional while carrying decisions neither could work
  without.

Leaving two live models is the failure. The pointer stays so that a link to this filename — from the
handoff, from PR #262/#263, or from a commit message — lands somewhere that says where to go, instead of
404ing or, worse, still reading as current.

## What happened to each section

| Was | Now |
|---|---|
| A — access, fail-closed semantics, TTL, emergency path | **Accepted**, in D1 "The contracts this rests on", plus a new requirement to emit a structured operational error on a failed read |
| B — do not read the global in Next middleware | **Accepted** verbatim |
| C — refuse `mode: 'offline' \| 'online'` | **Accepted** verbatim |
| D — the four capability states | **Accepted**, plus "a toggle only renders when its ceiling is present" |
| E — one image, and the codegen-always-full rule | **Accepted with an amendment**: "one **application artifact**", because the deployment separately carries `app`, `migrate` and `gotenberg` images, and school boxes run font-less while the online tier does not |
| F — the app must never start containers | **Accepted** verbatim |
| G — the online tier is unsized; student access needs its own ceiling | **Accepted** as open gaps, recorded in D1 |

The five-layer model that frames all of it — *capability present / hard ceiling / operator intent /
observed condition / enforcement* — was the operator's, from the same review, and is now stated at the
top of D1's panel section.
