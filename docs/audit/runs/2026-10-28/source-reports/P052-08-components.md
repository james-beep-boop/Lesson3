# P052-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/src/components/AdminDashboard/index.tsx:1-400`, plus the supplied policy excerpts.
- **Not assessed:** `index.tsx:401` onward, including the candidate exclusion logic that begins at line 393 and is cut off at line 400. Imported modules (`access`, `lib/*`, `Manage/*`, `CandidateList`, `DeletePlansPanel`) were not supplied, so their behaviour is unverified.
- **Token limit:** No token limit was hit. This is a partial assessment because of the range boundary, not a completed coverage claim.

## Purpose and invariants (as stated in the read range)

- Server component for the Manage page. Each query runs with the caller's access (`overrideAccess: false`), except the editors widget, which goes through `buildRolesAccess`.
- Admin-only reads are gated by `isAdmin` (line 86) and `deletable` (lines 96, 125). Site-Admin panels are gated by `siteAdmin`.
- Stated invariants: the cleanup queue mirrors the server's delete scope (lines 88–89, 62–63); candidates fail closed on an unresolved plan (lines 394–400); the subject-grade lookup is one shared map (lines 355–372).

## Candidates

**C1. Subject name falls back to "Unknown subject" for every non-Site-Admin (lead, medium-low confidence)**

- **Location:** `index.tsx:177-189` (taxonomy subjects read is `siteAdmin`-only), `index.tsx:353-354` and `364-370` (`subjectNameById` is built from that read and used for every role).
- **Preconditions:** A Subject Administrator (not a Site Administrator) with at least one deletable non-Official version, so `versionsRes` is non-null (line 125 passes for `isAdmin`).
- **Confirmed locally:** For a non-Site-Admin, `taxonomySubjectsRes` is `null`, so `subjectNameById` is empty. Every `sgById` entry then gets `subjectName = UNKNOWN_SUBJECT` (lines 368–369), even when the subject-grade resolves. The page's own comments (343–346, 364–366, 73) describe this fallback as a can't-happen path that "fails visibly", so reaching it for ordinary Subject Admins contradicts that stated intent.
- **Expected (from code comments, not policy):** The delete panel's `<Subject> · Grade N` headings show the real subject name for administrators who can see the queue.
- **Actual (per local reasoning):** `subjectName` is `"Unknown subject"` for them.
- **Not verified:** Whether the candidate queue for Subject Admins renders `subjectName` at all. The render code is outside the supplied range.
- **Focused reproduction:** Integration test. Sign in as a Subject Administrator for subject-grade X, where X's subject is "Mathematics" and X has one non-Official deletable version. Load `/admin` and assert the candidate group heading contains "Mathematics", not "Unknown subject".

## Unresolved questions

1. Is the `siteAdmin`-only taxonomy read (line 177) intended to also gate the subject-name fallback for Subject Admins? The comment at 343–346 says Site-Admin-only, but the queue is shown to all administrators.
2. Does `DeletePlansPanel` or `CandidateList` display `subjectName` for Subject Admins? This decides whether C1 is user-visible.
3. Lines 97–99 claim the email test matches Sign up, Sign in and Forgot password. Those routes are not in the supplied range, so this is unverified.
4. For a Subject Admin, `officialIds` is empty (line 258 reads only `planDocs`, which is `[]` for them). Confirm no Subject-Admin-facing row depends on `officialInfoById`.
