# C5.12 fields and editor grammar — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). The reviewed scope is
`app/src/fields/*` and the field-level grammar and editor tests. The contract is that editable prose
is plain text, newline-separated paragraphs are preserved, `- ` lines represent bullets, inline
markup is not accepted as a field grammar, `phase` is controlled, and resource rows/lesson numbers
remain system-owned.

The source review covered `bundleFields.ts`, `identity.ts`, `lessonContent.ts`, `phases.ts`, the
resource-row definitions, admin-only structure fields, and the editor/link field helpers. The
field split is consistent with `access/bundle.ts`: editing access can change prose; Subject Admins
can change structure and answer-key fields; system-only resource and numbering fields return false
from field access. The review found no new authorization or grammar candidate.

The pinned dependency-container run passed **112/112** assertions in nine focused unit files:

| Area | Assertions |
|---|---:|
| editor plain language | 4 |
| resource row drift | 5 |
| prose whitelist drift | 9 |
| subject select options | 4 |
| insert link | 25 |
| plan details panel | 3 |
| phase select field | 2 |
| generator upgrade | 49 |
| prose links | 11 |

The exact private runner hash is
`70eae4d2eeb50f24980ac3409eece4b051d8aadc425cfabbca454dc52795ec91`; its raw log hash is
`85fad78c9e7f30a10a30f6e5776eb62434029e0e8894e13ad89416a08643d612`. The only stderr was the
expected generator warning for the intentionally absent `/dev/null/lesson3-no-ares-content-db`.
The existing ingest, preview, save-as-new, export, and rich-prose sink checks provide runtime
coverage of the same fields. This chunk is covered for the named grammar and field-access contract;
full component review remains in C5.11.

**Exit:** field definitions, grammar boundaries, system-only rows, and focused tests were reviewed;
112/112 passed; no C5.12 finding is accepted.
