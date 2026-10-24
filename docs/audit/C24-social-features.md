# C24 — Social features (discussions, messages, favorites, recovery)

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Environment:** disposable cloud stack (as C23/C31/C41), synthetic accounts only, loopback-only.
  Live probes are **locally reproduced**, not deployment-reproduced. Source reading is
  **source-confirmed**.
- **Mandatory checks:** every route in the C24 surface answered for anonymous, non-owner, editor
  and Site Administrator callers; cross-user reads and writes; server-written field spoofing;
  moderation authority; forum-off behaviour; rendering of user text; rate limits.
- **Exclusions:** the discussion race/concurrency paths (topic-lock ordering, deadlock comment in
  `cascadeDeleteUserParticipation`) are source-read only. The `replyTo` context-link path and the
  recovery happy path (start → capture → get → discard) are not exercised live; their gates are.
- **Exit:** each route answered, or a candidate with an evidence scope. One candidate: F-C24-001.

## Outcome

**No authorization or integrity defects.** Every cross-user, forum-off and spoofing probe was
refused or ignored as intended. One robustness candidate, F-C24-001 (an unhandled error returns
500 where a 4xx belongs), and two cosmetic leads. Details below.

## Coverage

### Source

| Surface | Source answer |
|---|---|
| Forum gates (`lib/discussions.ts`) | `forumPosting` = signed-in and forum on; `forumReading` = signed-in and (forum on or Site Admin); `ownParticipation` = own rows, forum on, no Site Admin exception. Consistent with §16.1. |
| Forum moderation (`endpoints/discussionActions.ts`, `moderate.ts`, `discussionThreadDelete.ts`) | Pin, redact (topic and reply) and whole-thread delete all `assertSiteAdmin`, then `moderate`: topic lock, caller re-check after the wait, write, commit, log. Redaction is one conditional `UPDATE … WHERE redacted_at IS NULL`, so it is all-or-nothing. |
| Read marker (`advanceReadMarker`) | One statement; monotonic; cannot skip ahead of `lastSeq`; writes nothing for a non-participant. |
| Server-written fields (`postFields`, `serverWritten`) | `author`, `refPlan`, `refLabel`, `redactedAt`, `redactedBy` are `create: systemOnly`. `submissionKey` is validated, never generated. |
| Post text rendering (`PostText.tsx`, `discussionText.ts`) | Text nodes and anchors only; `linkify` links only `http:`/`https:` with a host. No `dangerouslySetInnerHTML` or `innerHTML` in the forum or message components. |
| Messages (`collections/Messages.ts`) | Read = sender or recipient only (deliberate; no Site Admin). `sender` stamped from session; create rate-limited; no update or delete path; `readAt` system-only. Ping enqueue is detached and best-effort (`lib/enqueue.ts`). |
| Message context links (`hooks/messageReference.ts`) | Caller-scoped: a version the caller cannot read is refused (new links) or nulled with the inherited snapshot (replies). The label is server-written. |
| Mark-read (`markMessagesRead.ts`) | `recipient = session user` and `readAt` unset; foreign ids match nothing; 64 KiB body cap. CSRF-safe by `SameSite=Lax` (see C23 L-C23-01 for the deployment caveat). |
| Favorites (`collections/Favorites.ts`) | Read and delete own rows (Site Admin all); `user` stamped; update denied; unique `(user, version)`. Version readability is not a gate, but every signed-in user can read every version (`lessonBundleVersionRead`), so no exposure. |
| Participation (`DiscussionParticipation.ts`) | Own rows read-only; written only by the system; user-deletion cascade locks every affected topic before deleting (deadlock comment, source-read). |
| Edit recovery (`endpoints/recovery.ts`, `collections/EditRecovery.ts`) | Operations key on `req.user.id`, never a body field. Start, capture, get and discard require read plus editing access on the version's subject-grade, and refuse the others with the same 404 as a missing version. Cleanup is Site-Admin only. The collection itself is `closed` for all REST access. |

### Live (disposable stack)

| Probe | Result |
|---|---|
| Message inbox at `depth=2` as recipient | Sender populated as id, name and timestamps only. No email, roles or sessions of the other party. The caller's own record shows the caller's own email and sessions, as intended. |
| Message sender's view at `depth=2` | Recipient populated without `email`. Create response also without the recipient's email. |
| `GET /api/users/:id` for another teacher | No `email`; `assignments` and `sessions` present as empty arrays for the caller. |
| Third-party reads of a message (subject admin, editor B) | 404 — identical to a nonexistent id (no existence oracle). Anonymous 403. |
| Third-party PATCH / DELETE of a message | 403 for recipient and sender alike (no update or delete path). |
| Spoofed `sender` in a message create | Overridden to the session user; the created row carries the caller's id. |
| Third-party mark-read on a foreign message id | `{"ok":true,"updated":0}` — nothing written. Anonymous 401. |
| Favorite create | 201; `user` stamped to the caller. Duplicate → 400. PATCH → 403. |
| Other user's favorite: GET → 404; DELETE → 403 (for a real id and for a nonexistent id alike, so no existence oracle). |
| **Favorite on a nonexistent version id** | **500 "Something went wrong."** — see F-C24-001. |
| Non-admin pin, redact, delete (topic) | 403 each. |
| Reply create with spoofed `seq`, `author`, `redactedAt`, `redactedBy`, `refLabel` | 201, but `seq` is server-assigned (1), `redactedAt` and `refLabel` are null. Spoofed fields ignored. |
| Reply to a nonexistent topic | 404. Malformed `submissionKey` → 400. Anonymous topic list → 403. |
| Mark-read with `throughSeq` past `lastSeq` | 400, nothing written. |
| Forum switched **off** (flag set, then restored to `true`) | Non-admin list, read, mark-read, topic create and reply all refused (403). Site Administrator read and list still 200, as §16.1 intends. |
| Recovery gates | Anonymous 401. Non-editor (teacher, editor for another subject-grade) and nonexistent version all 404 with the same body. Non-admin cleanup 403. Anonymous cleanup 401. Admin cleanup reached and rejected for a bad body (400), so the gate ran first. |

No live probe found a cross-user read, a cross-user write, a spoofed server-written field
taking effect, or an email, session or role leak.

## Candidates

- **F-C24-001 — Favorite on a nonexistent version returns 500.** See
  [findings/C24-social-features.md](findings/C24-social-features.md). Robustness, not security.

## Leads (not filed)

- **L-C24-01 — Cleanup refusal wording.** A non-admin calling the recovery cleanup endpoint gets
  "Only a site administrator may view recovery metadata." The action is cleanup, not view. Cosmetic.
- **L-C24-02 — Retracted (Codex review, 2026-10-24).** My earlier reading was wrong. `loadForAdmin` in `app/src/endpoints/recovery.ts` (about lines 99–108) checks authentication and administrator status *before* it looks up the version, so the response does not depend on whether a version exists. My live probe covered only existing version IDs for non-administrators, so it could not show this either way. A regression test should pin the same 403 for existing and missing IDs, and 401 for anonymous callers.
- **L-C24-03 — Own session ids in `GET /api/users/me`.** The caller's own session ids, creation and
  expiry times are returned. These are the JWT `sid` values, not the signed tokens, and they appear
  only to the owner. No action; noted for the C23 session review.

## Policy questions

None new. The message read rule (no Site Administrator exception) and the favorites Site-Admin
exception are both documented design choices in the source and were treated as intended.

## Resume point

- Happy-path recovery (start → capture → get → discard) and the `replyTo` context-link path, live.
- Discussion topic-lock ordering under concurrent reply and delete (needs the row-lock barrier
  helper, as in C31).
- The user-deletion cascade for participation and favorites (C30 rows 11–13), with C31's race half.
