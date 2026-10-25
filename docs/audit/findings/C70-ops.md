# Operations audit finding

Source: `bd5f07863a150cd51245b9c942502efa19d4014d`. The operator explicitly selected a sole auditor
without Claude; cross-family review is waived and is not claimed.

## F-C70-001 — Restore cache deletion errors are reported as success

- **Severity:** Medium. **Category:** restore / export integrity.
- **Priority:** validate before relying on restore or undo under filesystem faults.
- **Exposure:** conditional on restore/undo with retained cache files and a cache-deletion failure.
  No affected deployment or active exposure has been established.
- **Known status:** new candidate. The 2026-10-21 restore decision explicitly requires invalidation
  because database-local version IDs can collide across a restore; failure masking is not documented
  in the inspected decision or restore tests.
- **Audit status:** accepted after sole-auditor full-stack recheck, 2026-10-25. Independent
  cross-family review is waived by the operator and is not claimed.
- **Evidence scope:** exact helper failure, isolated full-stack restore/restart, real cache producer,
  repair and confirmation/discard controls. **Confidence:** high for the masked deletion failure
  and live restart consequence; a wrong old document was not claimed because the run did not retain
  a valid colliding artifact.
- **Location:** `scripts/restore-db.sh:220`, forward restore at line 319 and undo at line 399;
  `app/src/generator/exportArtifacts.ts:39`, `app/src/generator/artifactCache.ts:83`,
  `app/src/endpoints/exportVersion.ts:50`.

### Expected and actual

The restore decision in `docs/DECISIONS.md` (2026-10-21, export-cache bullet) requires the old
export cache to be emptied at every database swap. The helper executes:

```sh
d="${ARTIFACT_CACHE_DIR:-/var/cache/lesson3}"; [ -d "$d" ] && find "$d" -mindepth 1 -maxdepth 1 -type f -delete; true
```

The final `true` discards `find`'s failure status. If the directory exists and is readable but not
writable, `find` reports permission denied, files remain, and the helper returns 0. Both forward
restore and undo then continue toward service startup. A nonzero container-launch status is still
propagated; this candidate concerns errors inside the deletion command.

### Reproduction

From the checkout root, as an ordinary user:

```sh
bash docs/audit/tools/repro-restore-cache.sh
```

Observed on GNU Bash 5.2.21 with the host's POSIX shell, exit 0:

```text
find: cannot delete '<temporary cache>/stale.bin': Permission denied
helper_exit=0 stale_file_present=yes
writable_control=removed
```

The probe extracts the current helper without editing product source. A shell-function Docker
stub executes only its exact in-container shell command against a fresh temporary directory.
The same file is successfully removed after restoring directory write permission. The probe checks
that the faulty behavior is present, so its exit 0 is successful reproduction of a defect, not a
passing negative regression test. It does not simulate Compose, a database swap or an HTTP export.

Source SHA is above. Helper file SHA-256:
`d8ff5c94b97d211c6c55d0535e4e0bc78ebf113f27645470093828c3155e3908`.
Probe SHA-256:
`c42c3b0942aadded59de084ab3adc9ac476c24ea347cd60a154e1acddca67ee9`.

The full-stack recheck used a private copy of the real restore stack and current production/migration
images. The exact harness SHA-256 was
`26008736ac17c6bdef48b7d6d2d4ce4f929d062c75828278f0e8051aba469d42`; it passed **107/107** checks.
The fault was a read-only bind at one cache filename. The restore's `find ... -delete` reported
`Resource busy`, but the trailing `true` returned success; the helper reached provisional live state,
the app restarted, and the real `verify-stage2-export.ts` producer wrote fresh artifacts beside the
retained stale entry. Repair, `--confirm`, `--discard-previous`, and the drill all passed. Raw output
is retained privately at
`/home/james/.local/share/lesson3-audit/2026-10-25-bd5f078/logs/c70-cache-fault-stack-bind-final2.log`.

### Impact and limits

Exports use `render:<renderer revision>:version:<numeric ID>` as their cache scope. Existing cached
bytes are read without a content fingerprint or database identity. When the restored database uses
an ID already present in the old cache, a readable retained manifest and artifacts can be served
for the new version. Authorization is performed against the new database; that check does not prove
the retained bytes belong to its version. This is the correctness risk the existing restore decision
already recognizes.

The default cache directory normally permits deletion; no default-deployment permission failure has
been shown. Permission drift, a read-only filesystem, or another deletion fault is a precondition.
The full-stack run confirms that the failure is operationally masked and that service startup and
new cache writes continue while the stale entry remains. It does not establish data loss,
cross-user disclosure, a production incident, or serving of a wrong old document; that stronger
claim needs a retained valid artifact with a colliding restored version ID.

### Remediation and remaining validation

Preserve the harmless missing-directory case but propagate deletion failures and keep the app
stopped until invalidation succeeds. Preserve a resumable journal state on both forward restore and
undo. Test failure with retained readable cache entries, verify services remain stopped, repair the
filesystem and prove resume clears the cache before serving the restored version. Consider a
database-generation component in cache identity as an alternative design, with migration and cache
compatibility review.

Next: propagate deletion errors and keep writers stopped until invalidation succeeds, then add a
regression test for forward and undo with a retained readable cache entry. A colliding-ID artifact
reproduction would refine impact, but is not required to establish this accepted masked-error
finding. No product fix or deployment change was made.

- **Disposition:** accepted Medium, conditional on a cache-deletion fault with retained readable
  entries; remediation recommended and not implemented in this audit.

### Post-audit remediation

A separate fix is proposed in [PR #457](https://github.com/james-beep-boop/Lesson3/pull/457), based
on main rather than merging this audit branch. The real permission-fault regression found an extra
implementation detail: the Alpine app image's BusyBox `find -delete` can itself return 0 after
printing a deletion error. Removing the trailing `true` alone therefore does not suffice. The fix
also checks that no cache files remain before starting services and retains the forward/undo journal
state for repair and resume. The original v1.07 baseline finding remains valid; proposed remediation
is not evidence of a deployed fix or of a wrong-document collision.
