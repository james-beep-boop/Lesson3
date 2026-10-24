# C20 — Browser and API observations

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Disposable ARM64 production stack, Node 24.22.1, Playwright 1.64.1; Chromium and WebKit. Public-library discovery disabled, SMTP captured internally, discussions enabled. The browser runner is capped at four CPUs / 8 GiB, one worker and no retries.

## Run outcomes

- Initial route crawl: **18 passed, two failed**. Both Chromium unauthenticated cases encountered a harness navigation race across admin redirects.
- First focused follow-up: **two failed** because its exact login-URL matcher omitted legitimate redirect query parameters. These outcomes and private diagnostics remain preserved.
- Corrected focused follow-up: **two passed** after isolating route tabs and matching final login origin/path. Combined coverage uses the 18 unaffected original records plus these two corrected records; it is not one green full-suite run.
- Manage supplement: **16 passed** using the cached Chromium/WebKit states for all eight verified accounts. Three deep-link groups request every one of the 15 current panel identifiers; inaccessible panels remain gated.

Combined usable evidence: **20 role/browser cases, 360 route visits and 420 explicit API reads/probes**, plus **48 Manage visits**. No page/navigation errors remain in those records; no external HTTP(S) destinations were attempted. This does not prove egress safety for unvisited actions.

UI navigation may perform normal read-marker/preference writes. One synthetic discussion topic was created with a persisted submission key and reconciled before any retry. There were no save-as-new, promotion, upload, moderation, settings, or account-administration actions in this crawl.

## Explicit API-read status matrix

The values below are observations, not policy verdicts. Every role/browser executes 16 collection lists (`limit=1`, `depth=0`), two globals, `/api/access`, and GET/POST GraphQL probes. Bodies, row ownership and hidden-field filtering require C22 assertions; a 200 does not prove disclosure or compliance. Both browser projects agree on each cell.

| Request | Anonymous | Unverified | Teacher | Peer teacher | Editing access A | Peer editing access A | Editing access B | SA A + editing access B | SA B | Site Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| `GET /api/lesson-plans` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/lesson-bundle-versions` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/subjects` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/subject-grades` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/users` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/favorites` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/messages` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/edit-recovery` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/discussion-topics` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/discussion-replies` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/discussion-participation` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/payload-kv` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/payload-jobs` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 200 |
| `GET /api/payload-locked-documents` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/payload-preferences` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/payload-migrations` | 501 | 501 | 501 | 501 | 501 | 501 | 501 | 501 | 501 | 501 |
| `GET /api/globals/system-settings` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 200 |
| `GET /api/globals/payload-jobs-stats` | 403 | 403 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/access` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/graphql` | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |
| `POST /api/graphql` | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |

All GraphQL probes returned 404. `payload-migrations` list returned 501 for every actor: treat this as disabled-surface behavior to reconcile with the framework, not an authorization grant inferred from a default guard. Native locks, preferences and job statistics need content/operation checks under C21/C22.

## Observed API route reconciliation

This table unions explicit API reads and browser document/fetch/XHR observations, with query values removed. Parameter patterns are candidate matches against the ordered registry, not proof of which handler dispatched. Duplicate/shadowed descriptors are retained in the static inventory. Non-API frontend documents and Next server-component requests belong to the page inventory.

| Method / observed pattern | Statuses | Registry match |
|---|---|---|
| `GET /api/access` | 200 | yes |
| `GET /api/discussion-participation` | 200, 403 | yes |
| `GET /api/discussion-replies` | 200, 403 | yes |
| `GET /api/discussion-topics` | 200, 403 | yes |
| `GET /api/edit-recovery` | 403 | yes |
| `GET /api/favorites` | 200, 403 | yes |
| `GET /api/globals/payload-jobs-stats` | 200, 403 | yes |
| `GET /api/globals/system-settings` | 200, 403 | yes |
| `GET /api/graphql` | 404 | outside registry; explicit disabled/absent-surface probe |
| `GET /api/lesson-bundle-versions` | 200, 403 | yes |
| `GET /api/lesson-plans` | 200, 403 | yes |
| `GET /api/lesson-plans/:id` | 200 | yes |
| `GET /api/messages` | 200, 403 | yes |
| `GET /api/payload-jobs` | 200, 403 | yes |
| `GET /api/payload-kv` | 403 | yes |
| `GET /api/payload-locked-documents` | 200, 403 | yes |
| `GET /api/payload-migrations` | 501 | outside registry; explicit disabled/absent-surface probe |
| `GET /api/payload-preferences` | 200, 403 | yes |
| `GET /api/payload-preferences/:key` | 200 | yes |
| `GET /api/server-time` | 200 | yes |
| `GET /api/subject-grades` | 200, 403 | yes |
| `GET /api/subjects` | 200, 403 | yes |
| `GET /api/users` | 200, 403 | yes |
| `GET /api/users/me` | 200 | yes |
| `GET /api/users/search` | 200 | yes |
| `POST /api/graphql` | 404 | outside registry; explicit disabled/absent-surface probe |
| `POST /api/users/login` | 200, 403 | yes |

## Coverage limits and next actions

- All 15 Next page patterns have representative visits in both browsers; `/admin/[[...segments]]` is sampled, not exhaustively crawled. Account-token success pages use the earlier C01 flow evidence; C20 visits their no-token states.
- All 15 Manage identifiers were requested through three deep links; this inventories lazy reads and role gating, without submitting controls. Standard/Advanced tools, small viewports, filter combinations and every menu/dialog interaction remain C22–C24/C60–C63 work.
- Reconcile every custom handler with its source guards in `rbac-implemented.md`. Exercise every method, IDs/ownership, bulk/default routes, depth/select/where, jobs and field writes in C22. The 263 registered descriptors were not all exercised here.
- Public-enabled discovery/resource sharing, no-SMTP posture and deployed proxy/header behavior remain separately labelled checks. C00 no-SMTP auth controls do not establish full browser coverage in that posture.
- Raw logs, cookies, cached states, traces, fixtures and detailed diagnostics remain outside Git. Keep original failures alongside corrected evidence.

No defect, security verdict or reviewed finding is claimed by this inventory.
