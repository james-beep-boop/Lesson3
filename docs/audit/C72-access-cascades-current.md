# C72 current integration evidence: access, identity and deletion cascades

The marked isolated target ran the following current-source integration suites under the exclusive
target lock with the pinned Node 24 dependency wrapper:

| Suite | Result | Scope |
|---|---:|---|
| `app/tests/int/access.int.spec.ts` | **26/26** | role and field access, plan/version identity rules, Official retention and plan deletion |
| `app/tests/int/taxonomyDelete.int.spec.ts` | **8/8** | subject-grade deletion guards, role-assignment cascade and content cleanup |
| `app/tests/int/planIdentityImmutable.int.spec.ts` | **3/3** | immutable plan identity and pointer/relationship boundaries |

The combined run passed **37/37** tests in **7.05 seconds** (exit 0). Raw output is retained
privately at `logs/c72-cascade-integrations-locked.log`.

The access suite exercised the real Site-Admin delete path for a plan containing both an Official
version and a candidate. The plan deletion succeeded without a `23502`; both child versions were
removed, while a direct delete of an Official version still failed with the retention guard. The
same file covered the scoped role and field checks around plans, versions and subject grades.

The taxonomy suite verified that deleting a subject grade is refused while content remains, then
removes the dangling assignments and content after the required prerequisites are cleared. The
identity suite verified that plan identity and relationship fields cannot be rewritten through the
permitted update paths. These are current integration checks, not a claim that every collection,
migration or browser path has been reviewed.

The fixture teardown completed, the target lock was released, and all synthetic marker rows were
removed. No product files or application behavior were changed.
