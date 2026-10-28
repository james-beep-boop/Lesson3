# P018-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope

**Read (supplied text only, no tool calls):**
- `app/src/collections/DiscussionParticipation.ts:1-82`
- `app/src/collections/DiscussionReplies.ts:1-77`
- `app/src/collections/DiscussionTopics.ts:1-100`
- `app/src/collections/EditRecovery.ts:1-175`
- `app/src/collections/Favorites.ts:1-143`

**Not assessed:** imported helpers and hooks (`lib/discussions`, `hooks/discussions`, `lib/txDb`, `lib/readBundle`, `lib/relId`, `access`, `endpoints/*`), `lockDeletingUser`, the Payload Postgres error mapping, and any tests. I have not checked callers or runtime behaviour.

## Purpose and invariants (as stated in the headers)

- **DiscussionParticipation:** one row per (user, topic), written only by the system. The user-delete cascade locks affected topics before deleting rows.
- **DiscussionReplies:** flat and never edited through REST. `seq` is assigned by `orderReply` under the topic lock. Unique on (topic, seq) and (author, submissionKey).
- **DiscussionTopics:** the opening post is immutable. System-only writes cover pin, activity, `lastSeq` and title redaction. Any `payload.update` must hold the topic row lock first.
- **EditRecovery:** all four operations closed. Unique on (user, sourceVersion). Children are deleted before parents.
- **Favorites:** `user` is stamped from the session on create. Read and delete are own-rows only, with Site Admin excepted. Unique on (user, version). The version must be readable before insert.

## Candidates

**None confirmed** from local reasoning within these ranges.

Checked and found consistent with their comments:
- Favorites `stampFavoriteUser` runs before `requireReadableFavoriteVersion`, and both are `beforeValidate` hooks, so the readability check sees the stamped user.
- Cascades pass `req` and `overrideAccess`, as the comments describe.
- Closed access on replies, topics, participation and recovery matches the comments.

## Uncertain leads (not confirmed defects)

1. **DiscussionParticipation.ts:62-75, race window.** The topic set is read with a plain `SELECT` and only then locked with `lockRows`. This is safe only if `lockDeletingUser` blocks new references to the account between the two steps, as the comment claims. That hook is not in scope. *Reproduction:* two sessions. Session A deletes user U. Session B posts a reply as U after A's `SELECT` and before A's `lockRows`. Check whether the new topic is locked and whether the cascade leaves dangling participation or author state.

2. **Favorites.ts:117 and 120-141, duplicate create.** The header says double-favouriting is "impossible at the DB, whatever the UI races." The unique index enforces that. Nothing here handles a duplicate POST, so the response depends on whether the adapter maps the unique violation to a 4xx or a 500. *Reproduction:* POST the same (user, version) twice and record the status. Whether a 500 is a defect depends on the expected response, which the supplied material does not state.

3. **DiscussionTopics.ts:33-36, lock rule.** Update access is closed (`update: () => false`), but the rule constrains trusted `overrideAccess` writes made elsewhere. Those writes are not in scope.

4. **EditRecovery.ts:45-47 and 58-73, cascade mechanics.** Two things are assumed without evidence here: that Payload runs `beforeDelete` per row for where-based deletes (Favorites.ts:103-104 relies on the same claim), and that `select: { content: false }` is honoured on delete-by-where. Neither is verified here.

## Unresolved questions

- What is the expected response for a duplicate favourite?
- Does `lockDeletingUser` close the window in lead 1?
- Do the access-closure tests (`tests/int/access.int.spec.ts`, cited at EditRecovery.ts:38-40) exist and assert these closures? They were not supplied, so no test claim is made.
- Are the Payload `beforeDelete` and `select` behaviours in leads 4 and 5 confirmed by the adapter?

Security and integrity claims in this range remain unreviewed until independent review.
