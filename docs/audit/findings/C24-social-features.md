# C24 — Social-features candidates

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. This is a candidate, not an accepted total.
Coverage and the full probe table are in [C24-social-features.md](../C24-social-features.md).

## F-C24-001 — A favorite on a nonexistent version returns 500

- **Severity:** provisional Info (robustness; no security impact). **Category:** input handling /
  error mapping. **Exposure:** any signed-in user, via the default REST create.
- **Known status:** new.
- **Audit / review status:** candidate, author-verified/unreviewed. Author: author-a (Claude),
  2026-10-24.
- **Evidence scope / confidence:** locally reproduced (disposable cloud stack, 2026-10-24) over HTTP.
  Cause inferred from the schema (required relationship to `lesson-bundle-versions`, FK enforced)
  and not confirmed from the server log. Medium-high confidence on the symptom.
- **Scenario:** a signed-in user posts `POST /api/favorites` with `{"version": 999999}`. The reply
  is `500 "Something went wrong."`. A valid request is 201; a duplicate is a clean 400.
- **Where:** `app/src/collections/Favorites.ts` (`version` is `required` with no existence check
  before the insert; the cascade and `beforeValidate` do not look it up).
- **Expected vs actual:** a missing version should be a 4xx ("version not found", 400 or 404), the
  way the message context-link hook refuses a missing version. Actual: a generic 500, which also
  pollutes the server error log with what is a client error.

### Evidence

- Live: `POST /api/favorites` as editor A with `version: 999999` → 500; the same body with a real id
  → 201. Repeatable.
- Source: `Favorites.ts` (required relationship, no lookup); contrast `hooks/messageReference.ts`,
  which resolves the version and refuses a missing one with a 400/404.

### Impact and limits

- No data is read or written. The 500 body is generic. No other user's data is involved.
- Log noise: each attempt logs a server error, so a client can fill the error log at its own rate.
  This is bounded by the existing request limits and is not a denial-of-service finding on its own.

### Suggested fix

Resolve the version before insert (through the caller's read access) and throw a 400 "A lesson
version must exist to be a favorite." Add a `tests/http` case for the missing-version 4xx in the
same change, per the every-endpoint rule.

## Leads, not filed

L-C24-01 (cleanup refusal says "view"), L-C24-02 (403 vs 404 for version existence on the recovery
cleanup route; not secret today), L-C24-03 (own session ids in `/api/users/me`). Details in
[C24-social-features.md](../C24-social-features.md).

- **Disposition:** _(blank until triage)_
