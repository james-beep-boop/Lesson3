# Lesson3 discussion forum

Planning record started: 2026-10-08 (Asia/Tokyo).
Status: **design confirmed; technical validation pending; implementation not approved.** Section 16 is the current design and supersedes the open items in sections 4–7, 11, 15.3 and 15.6; sections 1–15 are the dated planning record.

This document records the product discussion before option research. User-confirmed
requirements take precedence over earlier suggestions. Research findings below include sources, dates, and limits on what has been verified. SPEC.md remains the
canonical specification for the existing application; this is a proposed feature plan.

## 1. Purpose and success

Provide a place for teachers to discuss lesson plans, recent updates, questions,
suggestions for improvements, and questions for administrators. There are no students
in this forum. All existing signed-in Lesson3 users can participate, including teachers
without lesson-editing access and administrators.

The central workflow is iterative improvement: a teacher saves changes to a lesson,
starts a discussion about those changes, receives colleagues' feedback, compares edits,
and uses that feedback to improve the lesson further. Forum participation does not grant
lesson-editing permissions.

Engagement and network effects matter. Desired outcomes include more teachers contributing,
returning to discussions, sharing improvements, and encouraging colleagues to join Lesson3
through its existing account workflow. A useful first step is reducing the effort needed
to move from a saved lesson edit into a conversation. No invitation or referral feature
has been approved.

## 2. Integration and access — confirmed

- A new discussion page and menu item within the existing Lesson3 app.
- Exactly the existing Lesson3 accounts and authentication; no separate forum accounts.
- Every signed-in user can read, start topics, and reply when the forum is enabled.
- No anonymous read or write access. Shared links still require Lesson3 sign-in.
- The same deployment. A separate hosted forum is not the requested product.
- Closely match the existing interface and reuse shared CSS, components, and code where practical.
- Preserve existing lesson, version, and comparison access rules; a forum reference must not
  expand access to the referenced material or expose restricted information.

## 3. Topics, replies, and search — confirmed

- One list of topics; no categories in the first release.
- Chronological replies within each thread, rather than nested replies.
- Order topics by most recent reply/activity, newest first.
- The Site Administrator can pin a topic above the ordinary topic list and unpin it.
- Search is required in the first release.
- Published titles, posts, and replies cannot be edited, including by administrators.
  System-managed pin, activity, and read metadata may still change.
- Only the Site Administrator can delete. Deletion removes the entire thread, including replies.
- Authors cannot delete their own topics or replies.
- No separate reply-deletion feature or other moderation workflow has been requested.
- Omit forum-specific posting restrictions, suspensions, and bans. The user withdrew the earlier
  request for restricting posting; existing account administration remains separate.

- Posts and replies use plain text with paragraphs and automatic safe, clickable links;
  no formatting editor.
- Deleting an account preserves its discussion contributions and other users' replies.
  Show the exact attribution “Deleted User” for the deleted account's contributions;
  do not retain/display the original name as fallback attribution.

Search across topic titles and post/reply text is a proposed default, not yet expressly
confirmed. Pin ordering, result ordering, pagination, text limits, and search-language
requirements need a later design decision.

## 4. Lesson and comparison references

### Confirmed direction

Offer another button after saving lesson changes that opens a forum topic form with the
saved lesson version automatically referenced. Saving a lesson must not automatically
publish a forum post. The teacher writes a title/message and explicitly submits it.

This is available to users who can already save the relevant lesson changes; it introduces
no new user type or lesson-editing capability.

Both topic and reply composers offer “Add lesson reference,” using the same saved-version
selection control. Teachers can attach lesson context without manually constructing a URL.

Reuse the existing comparison page if straightforward. The aim is simple navigation to
existing viewing/comparison functions, rather than building another comparison engine.

### Proposed reference behavior

- Render an ordinary hyperlink in the app's shared link styling; the user suggested light blue.
- Link to the saved version in Lesson3, rather than uploading a document copy or using an
  operating-system file picker.
- Generate the destination and label from lesson/version records, so teachers need not compose URLs.
- A label can show the lesson title and version number.
- Reference a particular saved version so later edits or Official-version changes do not silently
  change which edit the conversation concerns.
- General questions or administrative topics may have no lesson reference.
- Optionally provide an in-app searchable lesson selector when starting a topic from the
  discussion page. This was suggested but has not yet been explicitly confirmed.
- A comparison reference could link two version IDs through the existing comparison page.
  Its actual feasibility and eligible-version rules must be checked against current code.

The number of references allowed per topic/reply, how comparison versions are selected,
and what happens when a referenced lesson/version is deleted remain undecided. Linking
must always respect current server-side permissions. A saved version is not a promise of
permanent availability.

## 5. Unread discussion indicator

### Confirmed request

Show a small red or blue dot beside the discussion menu item when there are new forum
posts related to a discussion in which that user has posted. This is an in-app indicator;
email notifications, push notifications, and notification counts are not requested.
Refresh the dot on navigation only; no automatic polling or live updates while a page
remains open.

### Proposed simple semantics — still to confirm

- Use a small blue dot, with an accessible text description.
- Starting a topic or replying automatically makes that thread relevant to the user.
- A new reply from someone else in a relevant thread makes the dot appear.
- The user's own activity never creates an unread alert for that user.
- Opening a thread marks the replies actually included in that view as read.
- Opening the topic list alone does not clear unread state for other threads.
- The dot disappears when no relevant threads have unread replies.
- No subscription settings or separate notifications screen in the first release.

The meaning of “related,” behavior across tabs/devices, and read-marking for paginated
replies must be settled during technical planning. Do not accidentally mark
a reply as read if it arrives after the page's displayed data was fetched.

## 6. Administrator enable/disable switch — confirmed

Provide a Site Administrator setting to enable or disable the forum. When disabled:

- Hide its menu entry and unread dot.
- Hide every forum entry point, including the after-save discussion button and any lesson selector.
- Block direct forum page access and all forum API operations server-side, including search,
  unread queries, read-state writes, and generic collection APIs if these are exposed.
- Preserve forum data for re-enabling; disabling is not deletion.

The setting should live in the existing administrator interface. Initial default,
settings location, cache invalidation, and behavior for a form already open when the
setting changes remain to be designed. Blocking must apply to administrators as well
on the ordinary forum surface while preserving their ability to re-enable the setting.

## 7. Suggested labels — not yet final

| Surface | Suggested label |
| --- | --- |
| Menu | Discuss |
| Page title | Discussions |
| New topic action | Start a discussion |
| After-save action | Post about these changes |
| Comparison reference | Compare changes |

The user raised “Discuss” versus “Forum.” “Discuss” was recommended because it invites
participation. The user also suggested wording like “post about this in forum” for the
after-save action. Final wording and dot color are still open.

## 8. First-release boundaries

Keep the feature small and maintainable. No categories, nested replies, post editing,
author deletion, separate posting bans, attachments, reactions, accepted answers,
mentions, manual subscriptions, or email/push notification systems are currently approved.
Search, pinning, the in-app unread indicator, and an administrator kill switch are in scope.
A document upload is not needed merely to reference an existing Lesson3 lesson.

## 9. Verified technical context

Local checkout verified on 2026-10-08:

- Repository: https://github.com/james-beep-boop/Lesson3
- Actual workspace: /Users/jamesmcclelland/Developer/Lesson3 (the chat's older Documents/GitHub path
  no longer exists).
- Payload and @payloadcms packages: 3.90.2.
- Next.js: 16.4.0 in the current local checkout. An earlier remote-main inspection showed 16.3.6;
  the dated dependency update is recorded in docs/DECISIONS.md.
- React: 19.2.8.
- TypeScript / Node.js; Node 24.21.0 is pinned by the project.
- PostgreSQL via Payload's Postgres adapter.
- Existing immutable lesson-bundle versions, role-aware frontend, comparison page, shared
  styles/components, authentication, internal messages, and unread-message support.
- Project code license: MIT. Other permissive licenses require discussion before adoption.
- Existing architecture favors Payload collection configuration, access rules, hooks, and Local API
  over duplicating those mechanisms. Current repository instructions require deliberate pins,
  server-side access enforcement, and appropriate HTTP/browser verification before implementation ships.

Sources within the repo: app/package.json, app/package-lock.json, SPEC.md, AGENTS.md,
CLAUDE.md, and docs/DECISIONS.md. Dependency versions do not establish what any deployed server runs.

## 10. Planning and research sequence

1. Record and refine requirements before implementation (this document).
2. Research actively maintained open-source discussion projects, prioritizing MIT and examining
   maintenance evidence, releases, security process, architecture, integration, and upgrade effort.
3. Research Payload plugins, including official facilities and community discussion/comment/search
   plugins; verify Payload 3 compatibility rather than inferring it from their names.
4. Discuss other approaches, including a small feature built using native Payload facilities.
5. Choose an approach only after review, then plan data/access rules, integration, migrations,
   meaningful tests, rollout, and maintenance.

Evaluate candidates against exact existing accounts, one deployment, shared interface,
specific-version links, comparison links, whole-thread deletion, immutable posts, pins,
search, unread state, and complete disabling. A mature standalone forum may still be a
poor integration fit.

## 11. Open design questions and verification work

- Final menu/button wording and dot color.
- Confirm notification participation/read semantics and search scope.
- Reference selector details, number of references, comparison selection, and unavailable links.
  Both topics and replies offer the selector.
- Account-deletion cleanup must preserve discussion content and apply the confirmed
  “Deleted User” attribution; verify relationship cleanup rather than cascade discussions.
- Initial enabled/disabled setting, persistence, cache behavior, and in-flight writes on disabling.
- Anticipated user/topic volume and deployment connectivity; unread/search design should fit actual use.
- Transactional thread deletion, races between deletion and replies, and cleanup of read-state records.
- New replies during read-marking; keep unread state per user and independent of client clocks.
- Test plan covering all roles, anonymous requests, disabled routes/APIs, post immutability,
  admin-only whole-thread deletion and pins, linkage access, search, and unread behavior.

## 12. Research findings

The requirements above were saved before research began. The following first-pass
assessment was completed on 2026-10-08. Sources are project repositories, release records,
package manifests, and official documentation. Maintenance dates are GitHub UTC dates.

This is a source/documentation review, not a deployment trial, dependency audit, performance
benchmark, or proof that a project is error-free. Recent commits and releases are maintenance
signals; they do not establish fit or operational reliability by themselves. None of these
packages was installed, and no application code was changed.

### 12.1 Maintained open-source platforms

| Project | Code license | Verified maintenance evidence | Fit for Lesson3 |
| --- | --- | --- | --- |
| [Flarum](https://github.com/flarum/framework) | MIT | Stable [1.8.20](https://github.com/flarum/framework/releases/tag/v1.8.20), 2026-09-17; 2.0.0-rc.8 is a prerelease; substantive source changes on 2026-10-08. | Best-established MIT forum found in this review, but a separate PHP application rather than a Payload/React component. |
| [NodeBBS](https://github.com/aiprojecthub/nodebbs) | MIT | Repository created 2025-11-10; latest inspected commit prepares 2.4.0 on 2026-08-19; package manifests also say 2.4.0. No GitHub Releases returned. | Closer frontend stack, but still its own Next.js/Fastify application, authentication, Postgres schema, and Redis service. Maintenance history is shorter. |
| [Apache Answer](https://github.com/apache/answer) | Apache-2.0 | Stable [2.0.2](https://github.com/apache/answer/releases/tag/v2.0.2), 2026-07-21; 2.0.3-RC1 published 2026-09-23. | A maintained permissively licensed option, but optimized for questions/answers; introduces a Go backend and separate user/application machinery. License needs discussion. |
| [NodeBB](https://github.com/NodeBB/NodeBB) | GPL-3.0 | [4.16.2](https://github.com/NodeBB/NodeBB/releases/tag/v4.16.2), 2026-10-05; substantive commits on 2026-10-06. | Mature Node.js forum with PostgreSQL support, but an additional application and identity integration; license is copyleft rather than permissive. |
| [Discourse](https://github.com/discourse/discourse) | GPL-2.0 | Official [September 2026 release](https://meta.discourse.org/t/september-2026-monthly-release/413037), announced 2026-09-22; substantive source commits on 2026-10-08. | Established discussion platform with strong engagement facilities; separate Rails/Ember application and a copyleft license. |

**Flarum:** merits consideration if deploying a separate forum becomes acceptable. Its
[current installation documentation](https://docs.flarum.org/install/) is for 2.x, explicitly
labels that line a release candidate, and requires PHP. Do not confuse 2.x database/runtime
support with the stable 1.x line. Its extension and theming facilities do not remove the need
to integrate Lesson3 identities, session expiry, account deletion, navigation, unread state,
and administrator disabling. A PHP core service would also depart from Lesson3's existing
single-runtime convention. Keep as a mature MIT reference, rather than assume it can be
embedded directly.

**NodeBBS:** worth recording because its MIT license and Next.js/React frontend are closer
to Lesson3. The [project README](https://github.com/aiprojecthub/nodebbs#readme) describes
four deployment services and independent JWT/OAuth authentication. The inspected repository
tree and API/web package scripts did not show an automated test suite or test command; the
visible workflow publishes Docker images. This is weaker verification evidence than we want
for immediate adoption. Similar frontend technology would still leave backend, account,
styling, search, and unread behavior to integrate. Prefer it as a design/code reference until
maintenance, tests, and security behavior have been assessed more deeply.

**Apache Answer:** [official downloads](https://answer.apache.org/download/) confirm the
stable 2.0.2 release. Its Q&A model fits some teacher questions, but the requested chronological
conversations do not need voting or accepted-answer workflows. The extra runtime and identity
integration make it a weak match under the current requirements.

**NodeBB and Discourse:** useful mature benchmarks for discussion ordering and engagement,
but neither meets the permissive-license preference as shipped. They could run alongside
Lesson3 on the same host/Compose deployment; that is technically different from being a
feature inside the existing app. We have not evaluated a license change or endorsed copying
code from them into Lesson3.

A shared sign-in does not eliminate separate user records or session-lifecycle work.
[DiscourseConnect's official documentation](https://meta.discourse.org/t/setup-discourseconnect-official-single-sign-on-for-discourse-sso/13045)
shows how it delegates authentication while creating/mapping Discourse users. A comparable
integration would need to honor Lesson3 logout, expiry, account deletion, and the kill switch.
Using an iframe or a reverse-proxy path would not by itself meet these requirements.

**Assessment:** no reviewed complete platform is a direct, low-maintenance fit for the exact
existing accounts, shared interface, immutable posts, complete runtime disabling, and
version-specific lesson workflow. This is an integration assessment, not a claim that mature
standalone forums are poor products.

### 12.2 Payload plugins

The [official plugin catalog](https://payloadcms.com/docs/plugins/overview) lists Search,
other infrastructure plugins, and community discovery guidance. It does not list an official
forum/comments product. GitHub repository searches for Payload forum/discussion plugins and
comments plugins uncovered the candidates below. Search is not proof that no other plugin
exists.

| Plugin | License and currency | What it provides | Fit assessment |
| --- | --- | --- | --- |
| [FocusReactive comments](https://github.com/focusreactive/payload-plugins/tree/main/packages/payload-plugin-comments) | MIT; [1.11.2 release](https://github.com/focusreactive/payload-plugins/releases/tag/%40focus-reactive/payload-plugin-comments%401.11.2), 2026-10-06. | Document/field comments inside Payload admin; read records, mentions, and resolution. | Maintained and technically plausible, but different product/access semantics and substantial adaptation needed. |
| [navanem comments](https://github.com/navanem/payload-comments) | MIT; source package 0.4.1; release-preparation commit 2026-09-06. | Frontend comment widget, anonymous name/email submissions, reactions, nested replies, moderation, runtime collection switches. | Frontend reuse is attractive, but anonymous identity and feature model conflict with this brief. |
| [brachypelma comments](https://github.com/brachypelma/payload-plugin-comments) | Package declares MIT; 1.0.2; latest inspected commit 2024-01-21. | Blog/review comments and approval/email workflows. | Not a current Payload 3 candidate; manifest develops against Payload ^1.6.32 and Express. |
| [alborotogarcia comments-v3](https://github.com/alborotogarcia/payload-plugin-comments-v3) | MIT; inspected manifest is still a plugin template. | Repository name suggests v3, but README remains generic template documentation. | Manifest declares Payload ^2.0.0; the name does not establish v3 compatibility. |
| [Lexical collaboration](https://github.com/erreib/payload-lexical-collaboration) | MIT; source 1.0.4; latest recorded push 2025-04-17. | Comments on rich-text selections inside Lexical. | Wrong surface and content model for the requested forum and Lesson3's plain-string lesson editing. |
| [Official Payload Search](https://payloadcms.com/docs/plugins/search) | MIT; exact 3.90.2 source tag inspected. | Search projection collection and synchronization hooks. | Viable optional building block; does not supply topics, replies, pins, participation, or forum UI. |

A christopherpickering fork of brachypelma's plugin retains the same old package metadata;
it is not independent evidence of updated Payload 3 support.

#### FocusReactive: the maintained candidate, with material gaps

Its [package manifest](https://github.com/focusreactive/payload-plugins/blob/main/packages/payload-plugin-comments/package.json)
declares Payload ^3.0.0, React 18/19, and Next.js 14/15/16 peers, and develops against
Payload 3.90.1. Lesson3's versions are within the declared peer ranges; actual compatibility
with our production build has not been tested. The comments package has Vitest test files,
but those tests were not run here.

The [README](https://github.com/focusreactive/payload-plugins/blob/main/packages/payload-plugin-comments/README.md)
positions this as admin collaboration. Most Lesson3 teachers cannot enter Payload admin, so
its bundled UI would not deliver the required teacher forum. It injects comments into
collections/globals rather than presenting a general topic list. Its unread facility centers
on mentions, rather than every new reply in a thread the user participates in.

At the [1.11.2 collection source](https://github.com/focusreactive/payload-plugins/blob/%40focus-reactive/payload-plugin-comments%401.11.2/packages/payload-plugin-comments/src/collection/index.ts),
create/read/update/delete all use the same authenticated-user predicate. These defaults do
not implement immutable posts or Site-Administrator-only thread deletion. The plugin also
registers its own endpoints, so changing collection access alone would require verification
of those separate service paths.

The [plugin factory](https://github.com/focusreactive/payload-plugins/blob/main/packages/payload-plugin-comments/src/plugin.ts)
checks `enabled` while building configuration. That is not the requested per-request runtime
kill switch backed by administrator settings. Whole-thread structure, pinning, lesson-version
relationships, frontend UX, and participation-based unread state would still need design.

**Assessment:** a serious maintained plugin, but not a drop-in forum. Investigate only if we
want its existing collaboration model; adapting it may cost more than using Payload directly.

#### navanem: useful frontend widget, different identity model

The [manifest](https://github.com/navanem/payload-comments/blob/main/package.json) declares
Payload ^3.88.0 peers, so 3.90.2 is within range. Its inspected repository includes access,
service, hook, and validation tests plus a CI workflow; no tests were executed.

The [README](https://github.com/navanem/payload-comments#readme) explicitly targets anonymous
comments with entered names/emails, reactions, and three-level replies. Its runtime switch
rejects new submissions and closes the widget; unset settings enable collections. That does
not establish that all read/search/generic API surfaces become unavailable as our kill switch
requires. To adopt it, we would need authenticated attribution and a topic system, simplify
its interaction model, and independently prove disabling and deletion rules. Source version
0.4.1 is not confirmation of registry publication or a deployment test.

**Assessment:** worth knowing about, but not recommended as the basis for this first release.

#### Official Search: potentially useful, requires explicit access configuration

[Payload's search documentation](https://payloadcms.com/docs/plugins/search) describes a
search collection populated from chosen collections, with customizable fields and hooks.
At the [3.90.2 source](https://github.com/payloadcms/payload/blob/v3.90.2/packages/plugin-search/src/Search/index.ts),
its generated search collection defaults to `read: () => true`. We would have to override
read access to require sign-in and an enabled forum, secure mutation/reindex paths, and
remove indexed replies on thread deletion. Reply-body fields are not automatically our
required topic-level search result model.

[The matching package](https://github.com/payloadcms/payload/blob/v3.90.2/packages/plugin-search/package.json)
is MIT. Do not use upstream `main` to plan against our installed version: that manifest is
already 4.0.0-canary.38, whereas Lesson3 uses 3.90.2. No upgrade to a canary is proposed.
Compare this optional plugin with native collection queries once search semantics and scale
are settled; avoid adding a second data projection merely because a plugin exists.

### 12.3 Verified reuse opportunities inside Lesson3

| Existing code | Verified behavior | Implication |
| --- | --- | --- |
| `app/src/app/(frontend)/lessons/[id]/page.tsx` | `?version=<id>` selects a retained version; requires sign-in and readable plan/version data. | Reference a version in the existing lesson view rather than duplicate documents. |
| `app/src/app/(frontend)/lessons/[id]/compare/page.tsx` | Accepts `?from=<id>&to=<id>` and checks the plan's readable-version list. | A comparison link can reuse the current page. |
| `app/src/components/CompareToOfficialLink.tsx` | Already builds explicit pair URLs from plan, Official, and candidate IDs. | Reuse the link pattern; no new diff engine required. |
| `app/src/components/LessonControls/index.tsx` | Save creates a new version, then navigates to its admin page; the saved record has plan ID, version ID, title, and semver. | Add the discussion action on the saved-version surface, carrying the new version rather than the old source ID. |
| `app/src/components/AppNav/index.tsx` | Shared frontend/admin navigation; existing unread-message projection is server-rendered on page navigation. | Add the forum entry consistently across both surfaces; navigation-time unread refresh matches the confirmed forum behavior. |
| `app/src/endpoints/markMessagesRead.ts` | POST marks only displayed IDs belonging to the session user. | Reuse the access/read-marking pattern; do not reuse private-message data as forum replies. |
| `app/src/globals/SystemSettings.ts` | Existing runtime feature/provenance storage; generic updates are closed. | Extend the established administrator-settings design rather than introduce unrelated settings storage. |
| `app/src/collections/Users.ts` | Account deletion currently cleans up personal messages/favorites/recovery records. | Forum contributions need a separate preservation/attribution policy; copying personal-message cascades could destroy others' conversations. |

**Important reference edge case:** both the lesson view and comparison view currently fall
back to other versions when an explicit version ID is missing/unreadable. A forum reference
must not quietly become a different lesson revision or comparison after deletion. The design
needs strict reference resolution and an honest “Referenced version unavailable” result.
This is a real source-code finding, not a hypothetical reason to rebuild the comparison page.

The administrator-settings source also points to existing deployment and System-panel design
documents that must be read before implementation. Storage reuse does not establish that its
current reader/cache/update paths already support the new flag.

## 13. Preliminary assessment for the next planning discussion

The strongest candidate to investigate next is a small discussion feature built from native
Payload collections, access rules, hooks, and the existing Lesson3 frontend. This is an
engineering inference from the fit analysis, not an approved architecture or implementation.
Payload would continue to provide users, persistence, validation, ordinary APIs, migrations,
and administrator infrastructure; custom work would focus on the requested forum behavior.

| Approach | Reuse gained | Maintenance cost that remains | Current position |
| --- | --- | --- | --- |
| Standalone forum | Complete discussion machinery and mature community UX. | Identity/session integration, extra application upgrades, shared navigation/styling, unread bridge, and kill switch. | Weak fit under the current integration constraints. |
| Adapt a Payload comments plugin | Some comment persistence/UI/services. | Topic semantics, access corrections, disabled API coverage, frontend rewriting, and plugin upgrade compatibility. | Worth documenting, but no reviewed plugin provides the requested behavior directly. |
| Native Payload feature | Existing Lesson3 users, components, persistence, and framework access/migration machinery. | A small topic/reply/read-state model, careful hooks, search, and focused tests. | Best direction for a detailed design comparison; no implementation approved. |

The next planning step is to detail the native Payload approach clarified in section 14.
Settle search behavior, immutable references when versions are deleted, unread semantics,
and the complete disable boundary. Plain-text posts, “Deleted User” attribution,
navigation-only dot refresh, and references on both topics and replies are now confirmed
(see section 15.5). No websocket service, realtime broker, external search service, or additional
notification system has been justified by the first-release requirements.

For the next stage, propose a concrete data/access and user-flow design for review, explaining
which behavior Payload provides and any specific gap requiring custom code. Then plan meaningful
HTTP, database, and browser checks for the failure cases in section 11. Do not promise error-free
software on the strength of an open-source license, release frequency, or a short implementation.


## 14. Clarification of the proposed approach

Added 2026-10-08 after the user asked whether the recommendation meant using existing
Payload capabilities and shared Lesson3 UX without adopting an existing forum package.

Yes: the recommendation is a Lesson3 discussion feature built on the application's existing
Payload foundation. It does not include installing a standalone forum, adopting a community
comments plugin, or maintaining a fork of either. The research above remains useful evidence
for the recommendation, rather than a list of packages selected for implementation.

Reuse existing Payload authentication and user records, collection persistence, validation,
access controls, hooks, ordinary APIs, migrations, and administrator infrastructure. Reuse
Lesson3's shared CSS/design tokens, navigation, components, lesson viewing, and comparison
pages where their behavior fits. Preserve the existing session and lesson-access rules.

Write only the discussion-specific model and behavior that these foundations do not already
provide: topics/replies, pinning and activity ordering, participation/read tracking, search
behavior, forum enable/disable enforcement, and the UI connecting saved edits to discussions.
Prefer native Payload configuration over duplicating its framework machinery.

Existing open-source dependencies, including Payload itself, remain the foundation. No new
forum/comments dependency is proposed. The official Search plugin is a researched optional
building block, not an adopted dependency; first examine existing collection-query capabilities.
Any additional dependency should have a concrete benefit recorded in the design.

This clarification does not authorize implementation or settle the outstanding product
choices. The next document additions should be a reviewable data model, access matrix,
user flows, failure behavior, and verification plan. No additional user-facing features
are introduced by this clarification.

## 15. Proposed data, access, UX, and verification design

Discussion draft added 2026-10-08. Product choices confirmed in section 15.5 are requirements;
the remaining technical recommendations are for review. Implementation remains pending.

### 15.1 Data model

Use three native Payload collections, with explicit fields and relationships:

| Collection | Purpose | Proposed records/fields |
| --- | --- | --- |
| Discussion topics | Title, opening post, context, and topic-list ordering. | Title, opening text, author, created time, optional saved-version reference, optional comparison-from version, pin state, and system-maintained latest activity. |
| Discussion replies | Chronological contributions without rewriting the topic. | Topic relationship, text, author, optional saved-version reference, created time, and a server-assigned ordering/read position if needed. |
| Discussion participation | Relevant discussions and personal unread state. | User/topic relationship pair, participation start, and last displayed/read reply position. One row per pair, enforced by a database unique constraint. |

Creating a topic or reply establishes participation for its author. Merely reading a
thread does not subscribe the reader. A user can only read or advance their own read state,
including when they are a Site Administrator. This model avoids copying every reply into
each participant's inbox.

The opening post stays on the topic; later posts are reply records. Avoid an ever-growing
Payload array of replies: separate records permit pagination and reduce concurrent writes
to a shared content document. Topic-list activity metadata can still be updated atomically.

Topics and replies both offer the same “Add lesson reference” control. The proposed
quantity is one optional saved lesson version per contribution; that limit remains to be
confirmed. A topic may also have one optional earlier version of the same plan for comparison
(proposed). General discussions need no reference. Generate labels/URLs from records and
validate readability and same-plan relationships on the server.

Author relationships should allow the account to be deleted without deleting the discussion.
Require the authenticated author at creation through server validation/stamping rather than
a permanent NOT NULL foreign key that would prevent account deletion. The confirmed
fallback attribution is exactly “Deleted User”; do not retain/display a name snapshot as
fallback attribution. Preserve discussion content and other users' replies when an account
is deleted. Never expose account email addresses in the forum.

Published content remains immutable; pin/read/activity metadata and account-deletion cleanup
are system changes, not post editing. Child replies/read-state rows must be removed with
an administrator's whole-thread deletion in one transaction. Decide ordering/tie breakers,
transaction-safe activity updates, and read positions before writing hooks.

### 15.2 Access matrix (forum enabled)

| Action | Signed-in user | Site Administrator | Anonymous |
| --- | --- | --- | --- |
| Browse, search, read topics/replies | Allowed | Allowed | Denied |
| Start a topic or reply | Allowed | Allowed | Denied |
| Edit a published title/text | Denied | Denied | Denied |
| Delete an individual reply | Denied | Denied | Denied |
| Delete an entire thread | Denied | Allowed | Denied |
| Pin/unpin a topic | Denied | Allowed | Denied |
| Read/advance personal read state | Own records only | Own records only | Denied |
| Change forum enable setting | Denied | Allowed | Denied |

When the forum is disabled, forum reads/writes and entry points are unavailable for every
role, while the Site Administrator can still change the setting through the administrator
surface. Collection/field rules must enforce content immutability and protect authorship,
relationships, pin state, activity, and read metadata from crafted requests. Hiding buttons
or fields in the admin UI is not access control.

Use the normal Payload API and access/validation hooks where they meet the operation's needs.
If marking a read boundary or coordinating thread deletion genuinely needs a custom route,
record the specific gap and keep the route within the existing authorization/transaction
patterns. Do not select a broad collection-update permission merely to enable pinning.

### 15.3 User flows

**Discuss page:** shared Lesson3 header; search; Start a discussion; pinned topics followed
by topics ordered by latest activity. Each row shows title, author attribution, activity
time, reply count, and any lesson context. Pagination keeps reads bounded. Suggested initial
page size is 20 topics; exact size and ordering of multiple pins remain open.

**Thread:** title and opening post, generated lesson/comparison links where present, then
oldest-to-newest replies and a reply form. If replies are paginated, only replies included
in the visible page may be marked read. No post edit/delete actions for ordinary users.
The Site Administrator gets pin/unpin and whole-thread delete with a clear confirmation.
Suggested reply page size is 30; entry page and unread-page navigation need design so older
unread replies are not stranded behind pagination.

**After saving:** the existing Save path navigates to the newly saved version's admin page.
A discussion action on that clean saved-version surface opens the topic composer with that
version's context already selected. Add a comparison link only when an explicitly chosen
source version is still retained and readable. The form requires title/message and explicit
Post. No automatic forum announcement from a save hook.

**Writing:** confirmed plain text with paragraphs and automatic safe, clickable web links;
no formatting toolbar. No uploaded attachments are proposed. Keep lesson/version references
as structured context rather than arbitrary HTML. Text limits are not settled. Preserve form text in memory after a transient
submission error, prevent accidental duplicate submission, and obey existing expiry/logout
screen clearing. Do not put composer text in localStorage or other persistent browser storage
on the shared computers used by Lesson3.

**Unread dot:** propose participation-based alerts for later replies from other people, no
alert for one's own posts. Posting must not erase earlier unseen replies. Refresh on
navigation only, as confirmed; no polling, timer-based refresh, or live updates while idle.
Mark displayed replies via a state-changing authenticated operation;
never clear read state as a side effect of GET. Read advancement must not move backwards
across tabs or mark a newly arrived, undisplayed reply read. The dot is not an email/push
notification.

**Search:** propose case-insensitive keywords across titles, opening text, and replies, with
one result per matching topic and newest activity first. Search submit can use an ordinary
form rather than searching on every keystroke. Inspect native Payload query capability before
choosing any indexed SQL or search projection. Multi-word matching and performance at the
expected corpus size still need a decision; do not truncate intermediate reply matches and
silently lose topic results. No external search service is proposed.

**Disabling:** propose disabled by default until the Site Administrator enables it. Reuse
existing System-settings storage/design rather than add a separate settings area. Gate pages,
REST/GraphQL collections, search, unread queries, read writes, and posting. A composer opened
before disabling cannot submit a new accepted request afterward; existing rendered content
cannot be retroactively removed from a browser without a refresh mechanism. Decide what the
switch guarantees for requests already in flight and how writes coordinate with disabling.
Never delete data simply because the forum is disabled.

**Unavailable references:** keep the discussion readable, with an unavailable-reference label.
Do not generate a link that silently falls back to Official or to a different comparison.
Do not make discussion creation prevent the existing valid deletion of a saved lesson version.

### 15.4 Verification plan

Use the project's existing unit, disposable-database integration, HTTP, and browser suites.
No new test framework is proposed. Tests must check meaningful behavior rather than mirror
collection configuration. Include the built production app in verification, consistent with
recent project experience of behavior that differs from unbundled tests.

- Access tests for anonymous, Teacher with/without editing access, Subject Administrator,
  and Site Administrator; direct API attempts are included, not just visible buttons.
- All forum paths/APIs refuse access while disabled, and re-enabling restores existing data.
- Forged author/pin/read/context fields cannot bypass rules; published content stays immutable.
- Thread deletion removes all child replies/read state without deleting other threads or lessons.
- Account deletion preserves conversations and displays exactly “Deleted User”; source-version
  deletion produces unavailable links.
- Topics and replies share the lesson-reference control and preserve the selected saved version.
- Posts/replies preserve plain-text paragraphs and render safe links without executing HTML.
- The unread dot refreshes on navigation without polling or live updates while idle.
- Search finds title/opening/reply text once per topic, includes old matches, and is paginated.
- Pins sort correctly; replies/activity have stable ordering under simultaneous writes.
- A reply racing deletion cannot leave an orphan, and a failed reply transaction cannot advance
  the list's activity without the reply.
- Own replies do not trigger unread state or clear someone else's earlier unread reply; only
  displayed content is marked read; later replies remain unread; multi-tab marks are monotonic.
- Double-click/retry behavior avoids unintended duplicate posts and leaves honest error messages.
- Browser checks cover after-save references, comparison navigation, ordinary-user controls,
  administrator controls, shared styling, mobile layouts, accessible dot labels, and session expiry.

### 15.5 Product choices confirmed — 2026-10-08

| Choice | Confirmed behavior |
| --- | --- |
| Post formatting | Plain text with paragraphs and automatic safe, clickable links; no formatting editor. |
| Deleted accounts | Preserve discussion contributions and other users' replies. Attribute the deleted account's contributions to exactly “Deleted User,” without retaining/displaying the original name as fallback. |
| Dot refresh | Refresh on navigation only. No automatic polling or live updates while the page remains open. |
| Lesson references in replies | Replies also offer “Add lesson reference,” sharing the saved-version selector used for topics. |

### 15.6 Remaining product choices

- Final menu/button wording and dot color.
- Unread participation/read rules, including pagination and behavior across tabs/devices.
- Search scope and keyword matching.
- Initial enabled/disabled default.
- Reference quantity, selector details, comparison selection, and unavailable-reference behavior.
- Topic/reply page sizes and ordering of multiple pinned topics.

Technical details such as indexes, endpoint contracts, transactional ordering, and migration
backfill should follow the product choices. This update records planning decisions only;
it introduces no implementation changes.

## 16. Design — 2026-10-09

**Status: design confirmed; technical validation pending; implementation not approved.** This section is
the current design. Sections 1–15 are the dated planning record that led to it. Where they conflict, 16
wins. Every product choice (16.1) and default (16.2) is operator-confirmed. The technical contracts (16.3,
16.4) were reviewed by Claude and GPT, and are subject to the search spike's findings. The design adopts the
native-Payload approach of sections 13–14.

### 16.1 Operator-confirmed choices (2026-10-09)

| Choice | Decision |
| --- | --- |
| Labels | Menu **Discuss**; page **Discussions**; **Start a discussion**; after-save **Post about these changes**; **Compare changes**. Search box placeholder **Search discussion titles**. Title field hint **Name the lesson and the question or change.** (Discovery depends on titles; added after the search decision.) |
| Unread dot | **Blue**, with accessible text. |
| Initial state | **On by default.** The stored default of `forumEnabled` is `true`, following `publicLibraryLive`'s reasoning: fail-closed governs a failed *read* (absence or error), which means *off* and emits a structured operational error. It does not govern the stored default. |
| When notifications start | At **your first contribution**. Replies that existed before you joined stay readable but never light your dot (rule in 16.4). |
| Missing version, lesson page | When an explicit `?version=` does not resolve, show **"This version is no longer available"** with a separate **Open the Official version** button. **No substitute content** is rendered. This applies to every link (messages and bookmarks too), not only forum links. |
| Missing version, compare page | When an explicit `?from=` or `?to=` does not resolve, show the notice **and compute no substitute comparison**. |
| First appearance | **Release notes + a useful empty state + a Guide section.** The notes tell operators the forum is on, that Manage → System switches it off, and suggest the Site Administrator write and pin a welcome topic. The empty Discussions page invites a first post. No automatic system post (it would have no author and read "Deleted User") and no new announcement mechanism. |
| Who gets the dot | **Posters, plus the referenced version's author for a topic that references a lesson.** This widens section 5's "threads you posted in" to "threads you posted in, or that discuss your edit". Subject-grade administrators are **not** added automatically, so a busy subject-grade does not get a permanently lit dot. That is cheap to add later if questions go unanswered (revised 2026-10-09 after review; an earlier answer the same day included them). Mechanics are in 16.4. |
| Which discussions are unread | **Topic-list rows show the same blue marker** (with accessible text) on each discussion that has unread posts for you. There is no separate notifications screen. |
| Search matching | **Titles only** (decided 2026-10-09 after the search spike, 16.3 item 4). Every search word must appear in the topic title, in any order, case-insensitive substring; language-neutral (Swahili and mixed text work); newest activity first. Opening-post and reply text are **not** searched in this release. PostgreSQL full-text search is not built. |
| Scale target | **Up to ~100,000 replies per installation**, on ordinary indexes. A `pg_trgm` trigram index is the recorded next step if search slows. |
| Removing one bad reply | **Site Administrator redaction.** Replaces a single contribution's text (or a topic's title, independently) with "Removed by the administrator", erasing the original from the live database. This reverses section 3's "no separate reply-deletion feature" for this narrow case. Mechanics are in 16.4. |
| Entry points | **Three:** Post about these changes (after save), Start a discussion (Discussions page), and **Discuss this version** on the lesson page for every signed-in user. No shortcut on My saved versions. |
| Session expiry while composing | **The forum follows the rest of the frontend; there is no forum-specific rule.** Today no frontend page clears the screen at expiry (`IdleLogout` is admin-only), so the composer behaves like Messages: the text stays visible, and a submit after expiry says plainly that the session ended. When the frontend-wide fix lands, it applies to the forum composer unchanged. ⚑ This is **not** an exception to preserve: SPEC §13 records the frontend gap itself (revised 2026-10-09 after review; an earlier wording framed it as a forum decision). |
| Identical display names | **Accepted for now.** Posts show the author's *current* display name (no snapshot, consistent with "Deleted User"). Emails are never shown, so two users with the same name are indistinguishable. Revisit if confusion is reported. |
| Moderating while switched off | **A moderation-only view for the Site Administrator.** While the forum is off, the Site Administrator can still read threads, delete threads and redact, reached from a link beside the toggle in Manage → System. There is no posting, pinning, search, dot or nav entry, and every other user is refused as before. This amends section 6's "blocking must apply to administrators as well" for the Site Administrator only, so that a privacy problem can be fixed without re-exposing the forum. |
| Posting cap | **100 topics + replies combined, per user, per day.** New `discussionPost` bucket in `lib/rateLimit.ts`, overridable via `positiveIntEnv`. A clear 429 message when reached. This is abuse protection, not moderation (section 3's withdrawal of posting restrictions stands). |

### 16.2 Defaults (operator-confirmed 2026-10-09)

- **One lesson reference per contribution** (topic or reply), selected by saved version. `refPlan` is
  derived server-side from the version and is never trusted from the client.
- **The comparison is derived, not chosen.** Saved versions store `sourceVersion`. A reference shows
  **Compare changes** → `/lessons/<plan>/compare?from=<sourceVersion>&to=<version>` only when
  `sourceVersion` is non-null **and** both versions are readable at render time. Save can delete its source
  in the same transaction (`endpoints/versionEdit.ts`, `deleteSource`), which empties `sourceVersion`.
  In that case no link is shown. There is no picker and no stored comparison field.
- **Snapshot reference label.** `refLabel` (`<plan title> · v<semver>`) is system-written so that an
  unavailable reference can still say what it was. Plan titles are readable by every signed-in user. Links
  are generated only from current, readable records.
- **Text limits:** title 150 characters; post/reply 5000 (the same as `messages.body`).
- **Search (titles only; supersedes the earlier whole-discussion rule).** Every search word must appear in the
  title, in any order, case-insensitive, as a substring ("fract" finds "Fractions"). It is Payload's own
  `where: { title: { like } }`, whose `like` already splits on spaces and requires every word in the field. The
  only addition is escaping `\`, `%` and `_` before the call, because Payload does not escape them. One result
  per topic, newest activity first, paginated. Redacted titles do not match. The UI and the Guide say plainly that
  search looks at titles only ("Search discussion titles"), and the title field carries a short writing hint (16.1).
  - **Deferred, already measured:** adding opening posts is about five lines (a per-word
    `{ or: [title, body] }`) and no migration. Adding replies needs hand-written SQL plus `pg_trgm` (16.3 item 4).
- **Pages:** 20 topics and **50** replies (raised from 30, so that nearly every thread fits on one page; the
  pagination rules in 16.4 are still built and tested). Pinned topics come first, most-recently-pinned first, then by
  `lastActivityAt` desc and `id` desc.

### 16.3 Prerequisites found in code

1. **The System panel's Save path does not exist.** `globals/SystemSettings.ts` has storage and
   provenance, `update: () => false`, and no Save endpoint or reader. Nothing outside tests calls
   `findGlobal`/`updateGlobal`. `DESIGN-system-panel-2026-08-21.md` "PR 2" must be built:
   - a sole-writer Save endpoint (re-authentication; rate-limited per user and globally);
   - an atomic check-and-write, not only a freshness token;
   - a fail-closed reader;
   - wire tests.
   Per that design's rule against controls for absent features, the **visible toggle ships with the forum
   UI**, not with the Save infrastructure.
2. **No env ceiling for `forumEnabled`.** The panel design places flags inside deploy-time env ceilings.
   The forum exposes nothing beyond signed-in users and works offline, so a ceiling would add only
   install-time configuration. This is a deliberate deviation from the panel's pattern.
3. **Lesson/compare fallback.** `lessons/[id]/page.tsx` falls back to Official, and `compare/page.tsx`
   defaults both sides. 16.1's missing-version rows replace this for explicit parameters. A URL with *no*
   parameter keeps its current default behaviour.
4. **Search spike: DONE 2026-10-09.** Outcome: **search titles only, using Payload's own query.** Scripts
   and rerun instructions are in `docs/spikes/discussions-search-2026-10-09/`.

   **Method.**
   - Postgres 16.15 (the production image digest) in a disposable `--tmpfs` container, with a minimal Payload
     3.90.2 config of the planned collections (schema pushed by Payload).
   - Deterministic seed: 5,000 topics, 100,000 replies (48 MB), one 2,000-reply thread, a user in 500 discussions,
     and English/Swahili vocabulary.
   - Timings are `EXPLAIN ANALYZE` execution time, median of 10 after one warm-up, single user, unless marked
     "round trip". Hardware: Apple Silicon Mac, Docker arm64. **The Rock 5B has NOT been measured** (no access from
     the session that ran this). Every figure below is a development-machine baseline, not a Rock result, and not a
     measure of concurrent capacity.

   **Findings — measured:**

   | Question | Result |
   | --- | --- |
   | Can Payload's `where` express "each word anywhere in the discussion"? | **No.** A join-field path (`'replies.body'`) reuses ONE join alias, so every word must occur in the *same* reply: a thread whose words are in different replies was missed. The nested `contains` form produced invalid SQL (`id ILIKE '%[object Object]%'`). |
   | Hand-written SQL (`NOT EXISTS` over `unnest(words)`, `EXISTS` over replies) | Correct results, page counts and ordering, `%` escaped. **Too slow:** worst search page (list + count) ≈ 670 ms on the Mac, over the 500 ms budget before any Rock slowdown. |
   | Same query + `pg_trgm` GIN indexes | **No improvement.** The correlated form cannot use the index. |
   | Set-based rewrite (per-word topic sets) + `pg_trgm` | Worst ≈ 63 ms, identical results. The viable route **if** reply search is ever wanted: it needs the extension, three GIN indexes declared through the adapter's `extensions`/`afterSchemaInit`, and hand-written SQL. |
   | **Title only, Payload `like` (adopted)** | **≈ 5–8 ms per search page, round trip including the count.** Every word must be in the title, any order, case-insensitive, Swahili OK. |
   | Title + opening post, per-word `or` (deferred) | ≈ 22–45 ms round trip. A query split across title and opening post matches correctly. Roughly twice the matches for a common word. |
   | Nav dot (budget 25 ms) | ≤ 2.4 ms (worst: a user in 500 discussions with everything read). |
   | Per-row markers, one page (25 ms) | 0.4 ms. |
   | Topic list, pins first | 0.8 ms (page 1), 2.4 ms (last page). |
   | Thread page / first-unread lookup in the 2,000-reply thread | 0.02 ms / 0.01 ms (via `(topic, seq)`). |

   **Findings — schema facts observed in the pushed tables:**
   - Payload `number` fields are `numeric` columns.
   - Required relationships are `NOT NULL` columns with `ON DELETE SET NULL` FKs. So replies and participation
     MUST be deleted before their topic, and participation before its user (as 16.4 already plans), or the delete
     fails with 23502.
   - Optional relationships (`author`, `refVersion`) are nullable `SET NULL`, which gives "Deleted User" and
     unavailable references, as designed.
   - Payload's `like` does **not** escape `%`/`_`. Escape before calling.

   **Still to do:** run `measure.ts` and `titles.ts` on the Rock 5B against an isolated database, per the agreed
   method. With title-only search at ≈ 8 ms on the Mac against a 500 ms budget, a miss would need a slowdown of
   more than 60×. The run is a confirmation, not a gate on the design, and it does not delay PR 1. ⚑ These are
   **Mac results from a minimal Payload configuration**. The full-page response budget (1.5 s) and the relevant
   query timings are re-checked against the completed app in PR 4, and on the Rock.
5. **Row locks go through `lib/txDb.ts`.** `lockRows` with a required transaction exists because three
   hand-written locks once fell back to the pool and held nothing. `LockableTable` is a closed union;
   adding `discussion_topics` to it is a deliberate edit.

### 16.4 Data model and server rules

| Collection | Key fields | Access (every predicate also requires `isForumEnabled`, **except** the Site Administrator's read, delete and redact while off; see "Off switch") |
| --- | --- | --- |
| `discussion-topics` | `title`, `body`, `author` (optional rel, stamped), `refVersion` (optional rel), `refPlan` (derived), `refLabel` (snapshot), `pinnedAt` (null = unpinned), `lastActivityAt`, `replyCount`, `lastSeq`, `titleRedactedAt`/`titleRedactedBy`, `redactedAt`/`redactedBy` (opening post) | read/create: signed in; update: `() => false`; delete: Site Administrator |
| `discussion-replies` | `topic` (required rel), `seq` (unique with `topic`), `body`, `author`, `refVersion`, `refPlan`, `refLabel`, `redactedAt`, `redactedBy` | read/create: signed in; update/delete: `() => false` |
| `discussion-participation` | `user`, `topic` (unique pair), `lastReadSeq` (−1 = opening post unread) | read: own rows; create/update/delete: `() => false` (system writes only) |

- **Stamped fields.**
  - `author` comes from the session (the Messages pattern).
  - `refPlan`/`refLabel` are derived in `beforeValidate` from a `refVersion` the caller can read (the `validateContextLink` pattern via `findReadableVersion`).
  - `seq`, `pinnedAt`, `lastActivityAt`, `replyCount`, `lastSeq` and every `*RedactedAt`/`*RedactedBy`/`redacted*` field are system-written.
- **Immutability.** A `beforeChange` guard rejects any change on update to `title`, `body`, `author`,
  `ref*`, `topic` or `seq`. ⚑ This is required, not extra caution: `overrideAccess` bypasses field
  access (DECISIONS 2026-08-21), and the pin endpoint writes on that path. **The only permitted content change
  is redaction:** `title → ''` and/or `body → ''`, with the matching `*RedactedAt`/`*RedactedBy` set, on a part not
  already redacted, and only when the redact endpoint has set a server-side `req.context` marker for that row id
  and part. REST clients cannot set `req.context`.
- **Ordering, in one transaction.** Reply creation runs:
  1. `lockRows(req, 'discussion_topics', [topicId])`;
  2. `seq = lastSeq + 1`;
  3. update `lastSeq`, `replyCount`, `lastActivityAt`;
  4. upsert the author's participation.

  A failed reply therefore cannot advance activity, and a reply that races thread deletion fails
  cleanly instead of leaving an orphan. Seq 0 is the opening post.
- **Where unread tracking starts.**
  - Starting a topic creates participation with `lastReadSeq = 0`.
  - First replying to someone else's topic creates it with `lastReadSeq` = the topic's **`lastSeq` captured when the
    page holding the composer was rendered** (`joinedAtSeq`, sent with the reply; **rejected** with 400
    when it is not an integer, is negative, or exceeds `lastSeq`. `lastSeq` never decreases, so a larger value can only
    be forged). ⚑ **Not "the highest seq displayed".** That depends on pagination: replying from page 1 of a
    100-reply thread would make replies 31–100 light the dot even though they predate your participation
    (correction from GPT review, 2026-10-09). With the captured value, every reply that existed when you
    opened the page is outside your notifications, and any reply that arrived while you were typing stays unread.
  - **Invited participants (16.1 "Who gets the dot").** When a topic is created with a lesson reference, the same
    transaction adds the referenced version's `author`, unless that author is the topic's author, is null
    (uploaded versions, deleted accounts) or already has a row. They start at `lastReadSeq = −1`, so the
    opening post itself is unread for them. Subject-grade administrators are not added (16.1). Only the *topic's* reference invites people. A reference inside a reply
    does not, so nobody is pulled into a long thread partway through.
  - An existing participation row is never lowered or raised by posting.
- **Unread query.** The dot is lit when, for some participation row `p` of the user, either
  (a) `p.lastReadSeq < 0` and the topic's author `IS DISTINCT FROM` the user (the opening post is unread for an
  invited participant), or (b) a reply `r` exists with `r.topic = p.topic`, `r.seq > p.lastReadSeq` and
  **`r.author IS DISTINCT FROM user`**. An
  ordinary `<>` treats a deleted account's NULL author as *not different*, which would silently drop
  "Deleted User" replies from the dot. The test pins this.
- **Indexes (16.1 scale target):** replies `(topic, seq)` unique; participation `(user, topic)` unique; topics
  `lastActivityAt` and `pinnedAt`. Title-only search scans the topics table and measured ≈ 5–8 ms at 5,000 topics
  (16.3 item 4). No trigram or full-text index in this release.
- **Per-row marker.** The topic list evaluates the unread condition above only for the topic ids on the
  displayed page that have a participation row for the user, so the cost is bounded by the page size.
- **Mark-read.** `POST /api/discussion-topics/:id/mark-read { fromSeq, throughSeq }`. The values must be integers with
  `0 ≤ fromSeq ≤ throughSeq ≤ lastSeq`; anything else is a 400 and nothing is written.
  - It touches only your own row, using `GREATEST`, so the marker never moves backwards across tabs.
  - It advances only when `fromSeq ≤ lastReadSeq + 1`, i.e. the displayed range follows on directly from what was already read. A later page can never mark skipped replies as read.
  - A thread opens at the page holding the first unread reply.
  - It is a POST, never a GET side effect (the `markMessagesRead` precedent).
- **Pin.** `POST /api/discussion-topics/:id/pin { pinned }`, Site Administrator only, writes `pinnedAt` only.
- **Redact.** `POST /api/discussion-replies/:id/redact` and `POST /api/discussion-topics/:id/redact
  { title?: true, body?: true }`. The topic's **title and opening post are redactable independently**, offered as two
  checkboxes in one dialog. Site Administrator only, irreversible, with a confirmation dialog.
  - It blanks the chosen part and stamps its `*RedactedAt`/`*RedactedBy`. The UI renders "Removed by the
    administrator" for a post and "Title removed by the administrator" for a title.
  - Schema consequence: `title` and `body` cannot be plain `required: true`, because a redacted row would then fail
    validation on its own update. Require them **at create** instead, through a field `validate` that checks
    `operation`; whether Payload 3.90.2 passes `operation` to field validators is to be verified against installed
    source, with a `beforeValidate` check on create as the fallback.
  - Unchanged: `seq`, author attribution, unread state, the thread's place in the list, and the structured lesson reference.
  - A redacted title no longer matches in search (search covers titles only).
  - ⚑ "Erased" means from the live database. Existing backups keep the text until they age out, and the release
    notes and Guide must not claim more than that.
- **Delete.** Payload's normal REST delete, gated to the Site Administrator (also while off, per 16.1).
  `beforeDelete` takes the same topic lock, then deletes the topic's replies and participation rows in that
  transaction. These are system writes inside the delete, so they work while the forum is off, even though
  ordinary participation writes are refused then. Because nothing
  survives in the data, it emits a **structured log line**: actor, topic id, reply count.
- **Duplicate submissions.**
  - Each composer generates a random `submissionKey` when it opens. It is held in memory only, never in browser storage (SPEC §13).
  - The key is stored on the topic or reply, unique per `(author, submissionKey)`.
  - A retry whose response was lost hits the constraint. The client then looks the post up by key (its own rows) and
    navigates to it, so no duplicate is ever created.
  - ⚑ The client does not depend on error `data`: the Next.js 16.4 minifier issue (DECISIONS 2026-10-08) stripped exactly that.
  - The duplicate check runs **before** the rate-limit charge, so a retry after a lost response is not charged twice.
  - **Accepted limit (operator-confirmed 2026-10-09):** `consumeRateLimit` writes outside the post's transaction,
    so a *genuinely simultaneous* pair with the same key can both pass the check and both be charged, though the
    unique constraint still allows only one post. This costs at most one extra post from the daily 100, and needs
    two tabs or a script. No lock is added for it.
  - The submit button is disabled while a request is in flight. After a **successful** post, an open composer
    (e.g. the reply box) generates a **fresh** key. While a result is **uncertain** (network error or timeout), it
    **keeps** the old key, so a retry cannot create a second post.
- **Author exposure.** The `author` relationship has `maxDepth: 0` (the #258 lesson), and pages project the display
  name only. A wire test proves that a teacher's REST read of topics or replies never returns another user's email,
  roles or assignments.
- **Links in text.** Only `http`/`https` URLs are auto-linked, with trailing punctuation excluded. They render as
  text nodes and `<a rel="noopener noreferrer" target="_blank">`, never as HTML.
- **Request bodies.** The custom endpoints (mark-read, pin, redact) read through a size-capped body reader (the
  `readJsonBody` / `MAX_MARK_READ_BODY_BYTES` pattern). Topic and reply **creates use Payload's ordinary REST
  create, exactly like Messages**. Field `maxLength` bounds what is *stored*, but nothing bounds the request
  *read*: the app has no app-wide request-size limit (no middleware cap, and Next sets none for route handlers).
  That is a pre-existing, app-wide gap, recorded as a follow-up (16.6), not patched forum-only (operator-confirmed
  2026-10-09).
- **Lesson/version deletion.** `refVersion`/`refPlan` FKs must be `ON DELETE SET NULL`. This is verified in the
  generated migration, not assumed. Forum rows never block or cascade from lesson deletion.
- **Account deletion.** `author` is optional, so the FK is `SET NULL` and the post renders exactly "Deleted User".
  `Users.beforeDelete` cascades only the user's *participation* rows, alongside favorites and messages.
  Forum content is never cascaded.
- **Off switch.** `lib/discussions.ts` exports `isForumEnabled(req)` (fail-closed, memoised on
  `req.context`) and `requireForum()` for pages (the `requirePublicLibrary` idiom). Every collection access
  function, custom endpoint, page, nav projection and entry point consults it. GraphQL is already disabled,
  with its routes deleted. Admin views for all three collections stay `hidden`.
  - **Timing contract.** A request that *starts* after the switch is turned off is refused. A request already
    under way may finish (a reply mid-transaction may commit). An already-open screen disappears on the next
    navigation or reload, consistent with the confirmed absence of live updates. This holds only because the
    flag is **never cached across requests**; adding any cross-request cache would weaken it to "within the TTL"
    and needs a recorded decision.
  - **The one exception (16.1):** while off, a Site Administrator may still use the read, delete and redact paths
    through a `requireForumOrSiteAdminModeration()` gate. Posting, pinning, search, mark-read, the dot and
    participation writes stay refused for everyone, Site Administrator included.

### 16.5 Build order

The search spike is **done** (16.3 item 4: titles only, via Payload's own `like`). Only its Rock 5B confirmation run is outstanding, and that does not block PR 1.

| PR | Contents | Why separate |
| --- | --- | --- |
| 1 | **Missing-version notice** on the lesson and compare pages (16.1). | Independent of the forum and fixes message links today. Small, so its behaviour change to existing links is easy to review. |
| 2 | **System Save infrastructure**: `forumEnabled` column + migration, fail-closed reader, Save endpoint (authorize → rate-limit → re-authenticate → allowlist → atomic write → provenance). **API only, no visible toggle.** | Security-critical, with its own design doc and its own wire tests. Reviewed on its own and not buried in forum code. |
| 3 | **Forum server side**: three collections, migration, hooks (including invited participants and duplicate-submission keys), mark-read/pin/redact endpoints, the moderation-while-off gate, rate-limit bucket, account-deletion cascade. int + http tests only. | Concentrates the authorization, concurrency and immutability review. |
| 4 | **Forum UI**: `/discuss`, thread page, composers, the shared "Add lesson reference" selector, plain-text + safe auto-links, the **Discuss** nav item + blue dot, **Post about these changes** on the saved-version surface, **Discuss this version** on the lesson page, Site Administrator pin/redact/delete controls, the moderation-only view while off, the per-row unread marker, the empty state, the System panel toggle, the Guide/`USER_GUIDE.md`, a SPEC §10 bullet, release notes, and e2e. | Everything a user sees lands together, so no half-visible feature ever ships. |

**Guide and `USER_GUIDE.md` in PR 4** (operator-confirmed 2026-10-09). `/guide` is the role-aware tutorial
(`docs/DESIGN-guide-tutorial-2026-09-24.md`): five top-level sections and a second accordion level of task
panels, filtered by `computeGuideAvailablePanels` (`components/Guide/availability.ts`). `USER_GUIDE.md` is the
complete, unscoped print/offline reference. Both carry the same facts (`guideParity.spec.ts`).

- **Teachers** section, new task panels:
  - start a discussion and reply;
  - add a lesson reference;
  - **Discuss this version** on the lesson page;
  - what the blue dot and the per-row markers mean (posting in a thread, or being the author of a referenced
    version, puts you in it);
  - **search covers titles only**, plus the title hint ("Name the lesson and the question or change");
  - authors cannot edit or delete their posts.
- **Editing** section: **Post about these changes** after saving, and that the referenced version's author gets
  the dot.
- **Site administrators** section:
  - the forum switch in Manage → System;
  - pin and unpin;
  - redact a title or a post (irreversible), stating that **existing backups keep the text until they age out**;
  - delete a whole thread;
  - the **moderation-only view** while the forum is off.
- **Visibility follows the switch.** While the forum is off, the Teachers and Editing forum panels are not
  rendered, like every other forum entry point (16.4 "Off switch"). The Site Administrator's switch and
  moderation panels stay. `computeGuideAvailablePanels` is synchronous and takes only the user today, so it gains
  the resolved `forumEnabled` value as an argument rather than reading the flag itself.
- **`USER_GUIDE.md`** describes the forum unfiltered, noting that a Site Administrator can switch it off and that
  the forum is on by default.
- **Tests:** `guideAccess.spec.tsx` gains forum-on and forum-off cases for each role, and `guideParity.spec.ts`
  covers the new facts.
- **Vocabulary:** the CLAUDE.md rule applies. Say "Teacher with editing access", never "Editor".

⚑ **Release hold:** do not tag a release between PR 3 and PR 4. With the forum on by default, a release
cut there would ship a forum reachable through the API but with no UI and no off switch.

Each PR lands with its wire-level authorization tests (the CLAUDE.md standing rule), mutation-tests its guards, and is
verified against a production build.

**Test cases that are easy to forget (PR 3):**
- a "Deleted User" reply still lights the dot;
- your own reply never lights it, and posting never hides an earlier unseen reply;
- the starting point on first contribution: replying from page 1 of a long thread does not light the dot for
  later pages that already existed; a reply that arrived while you were typing stays unread; a forged
  `joinedAtSeq` above `lastSeq`, negative, or non-integer is rejected with nothing written;
- mark-read rejects malformed ranges; an invited author starting at −1 reads the opening post at seq 0, and the dot clears;
- duplicate submission: a retried create with the same key creates nothing and charges the rate limit once;
- a teacher's REST read of topics/replies exposes no other user's email, roles or assignments;
- switch-off: a request after disabling is refused; while off, the Site Administrator's read/delete/redact
  works and every other path (theirs included) is refused, while every other role is refused everywhere;
- marks are monotonic across two tabs;
- a non-contiguous page marks nothing;
- reply vs whole-thread delete race;
- a failed reply leaves `lastActivityAt` unchanged;
- invited author: the referenced version's author gets the dot for the opening post; the subject-grade
  administrator is not added; the topic's own author is never invited; a reply's reference invites nobody; a null
  version author adds nobody;
- the per-row marker matches the nav dot for every topic on the page, including "Deleted User" posts;
- a deleted referenced version: create a post referencing a version, delete that version, and assert that the
  thread shows the `refLabel` as an unavailable reference with **no link at all**, neither to the lesson page
  (which would open Official) nor a Compare changes link. The renderer must handle a null `refVersion`
  explicitly; the snapshot label alone does not guarantee it (GPT review, 2026-10-09);
- search in the real app keeps the spike's behaviour: every word must be in the title, in any order;
  case-insensitive; Swahili; literal `%`, `_` and `\` treated as plain characters; pagination; a redacted title
  no longer matches;
- redaction: refused for everyone except the Site Administrator (allowed for them while disabled, via the
  moderation view); a second redaction of
  the same part is refused; title and opening post redact independently; a non-empty title/body is still required
  at create; the original text is gone from the row, and a redacted title no longer matches search; an ordinary update that sets `body = ''`
  without the endpoint's marker is still refused;
- forged `author`/`seq`/`pinnedAt`/`ref*` fields are refused;
- update through `overrideAccess` is refused;
- every route and REST collection refuses while disabled, **except the Site Administrator's read, delete and redact through the moderation view**; data survives re-enabling.

### 16.6 Planning status

Every product question and default is operator-confirmed (16.1, 16.2; 2026-10-09). The **search spike is done**
(16.3 item 4), and its finding narrowed search to titles only. Remaining before implementation:

- **The Rock 5B confirmation run** of the spike's measurements (a confirmation, not a design gate).
- Approval to begin PR 1.

**Product scope is frozen** as of 2026-10-09. After the spike, resolve only issues that it exposes; new features are
out of scope for this release.

**Follow-ups outside this feature** (pre-existing, app-wide; the forum is deliberately consistent with them):

- **Frontend session expiry does not clear the screen** (SPEC §13 records the gap). Only the admin surface does
  (`IdleLogout`). When it is fixed, the fix covers Messages and the forum composer alike.
- **No app-wide request-size limit** on Payload REST creates (Messages already has this gap). The fix belongs at one
  app-wide enforcement point, not per collection.
