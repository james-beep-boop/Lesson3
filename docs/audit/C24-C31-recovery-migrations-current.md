# Current recovery kernel and migration integration evidence

The marked isolated target ran these current-source integration suites under the target lock with
the pinned Node 24 dependency wrapper:

| Suite | Result |
|---|---:|
| `editRecoveryCap.int.spec.ts` | **7/7** |
| `editRecoveryCapture.int.spec.ts` | **13/13** |
| `editRecoveryExpiry.int.spec.ts` | **10/10** |
| `editRecoveryMetadata.int.spec.ts` | **10/10** |
| `editRecoveryRetire.int.spec.ts` | **14/14** |
| `editRecoveryStart.int.spec.ts` | **7/7** |
| `editRecoveryUnsavedWork.int.spec.ts` | **15/15** |
| `messageReferenceMigration.int.spec.ts` | **1/1** |
| `combineMigration.int.spec.ts` | **1/1** |
| `combineDraftMigration.int.spec.ts` | **1/1** |

The combined run passed **79/79** tests in **21.46 seconds** (exit 0). Raw output is retained
privately at `logs/c24-c31-recovery-migration-integrations.log`.

The recovery suites covered active-capture capacity and bounded overshoot, capture fencing and
projection, malformed Unicode and byte ceilings, expiry selection/races/batching, metadata shape,
all four retirement callers and transaction fail-closed behavior, first-start/reactivation races,
and unsaved-work listing/counting/restorability. The migration cases exercised message-version-label
backfill with rollback and 501-row batching, Combine lineage backfill/idempotence/rollback after a
deleted parent, and Combine-draft metadata rollback without changing prose or timestamps.

The target lock released, fixture teardown completed and the application remained healthy. These
are focused current integration checks; browser/editor behavior, migration upgrade sequencing,
deployment parity and the remaining C24/C31 catalog are still open. No product behavior changed.
