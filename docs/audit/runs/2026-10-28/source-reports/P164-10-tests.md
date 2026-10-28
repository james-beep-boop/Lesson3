# P164-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: supplied ranges

**Scope note:** No tools were run. Findings come from reading the supplied text. Test outcomes below are local regex reasoning and have not been executed.

### Coverage

- **Read in full:** `app/tests/unit/backupStatusPathParity.spec.ts:1-162`
- **Read in full:** `app/tests/unit/browserFindings.spec.tsx:1-95`
- **Not assessed:** `app/src/lib/backupStatus.ts`, `scripts/backup-db.sh`, `scripts/restore-db.sh`, `docker-compose.yml`, `app/(frontend)/LibraryBrowser`, `components/VersionsChip`. The first two spec assertions read these at runtime, but their contents were not supplied, so no claim is made about them.
- The policy excerpts were used as context only, not as source.

### Purpose and invariants

- **backupStatusPathParity.spec.ts:** Keeps the backup-record path in sync across the host writer (`backup-db.sh`), the compose bind mount, and the app reader (`backupStatus.ts`) by text-matching the three files. It also asserts the app's mount is read-only, so the app cannot forge its own backup evidence. It fails loudly when a pattern is not found.
- **browserFindings.spec.tsx:** Pins two regression fixes. (1) `VersionsChip` re-fetches versions and favorites on every open. (2) `LibraryBrowser` search matches pinned non-Official favorite rows.

### Candidates

**1. Read-only negative check misses `:rw` (and similar suffixes). Severity: low-medium (test integrity, unexecuted).**
- Location: `app/tests/unit/backupStatusPathParity.spec.ts:156-160`.
- Precondition: `docker-compose.yml` contains a read-write mount of the ops directory alongside the read-only one, written with an explicit option such as `:rw` (or `:z`/`:Z`, or a CRLF line ending).
- Expected: the "no read-write mount" assertion fails.
- Actual, by regex reasoning: the pattern `-\s+\./out/ops:[\w./-]+(?!:ro)$` cannot match `- ./out/ops:/ops:rw`, because `[\w./-]+` stops at `:` and `$` then fails. The check returns `false` and the test passes.
- Why it matters: the test's own comment names this exact case ("no read-write mount … may exist alongside it"). The positive check still passes because the `:ro` line exists, so the failure is silent.
- Focused reproduction: copy the compose text into a temp fixture with both `- ./out/ops:/ops:ro` and `- ./out/ops:/ops:rw`, run the negative regex, and confirm it returns `false`. Expected: `true`.

**2. Weak assertion in the VersionsChip refresh test. Severity: low (test only; not a product defect).**
- Location: `app/tests/unit/browserFindings.spec.tsx:41-56`.
- The title says "re-fetches versions AND favorites", but the assertions only count total `fetch` calls (`>= n`). A reopen that refetches versions twice and favorites zero times would pass.
- This is a test-strength gap. No product defect is established, because the component source was not supplied.

### Unresolved questions

- Does `docker-compose.yml` contain other `:ro` mounts before the operations mount? If so, the positive check picks the first match, which may be the wrong one. Current behavior is a loud failure, not a silent pass.
- Does `backup-db.sh` write per-stream records whose filenames match what `backupStatus.ts` reads? The test checks only the directory name.
- Are there multiple compose services? If a non-app service legitimately mounts the directory read-write, the negative assertion is too broad. That is a policy question I cannot answer from the supplied text.
- For finding 2 in `browserFindings.spec.tsx`, does `LibraryBrowser` render the pinned row's name in more than one element? `getByText` would throw in that case, which fails loudly and is not a silent pass.
