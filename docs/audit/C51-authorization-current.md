# C5.1 authorization core — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). The review covered
`app/src/access/{index,bundle,versioning,versionImmutability,lockedDocuments,generatedSurfaces}.ts`,
`scripts/verify-rbac.ts`, collection field guards, and the access integration contract.

The implementation has one explicit role model: Site Administrator is global; Subject Administrator
and editing access are subject-grade assignments; a plain Teacher is authenticated read/export only.
The review traced subject-grade normalization, scope predicates, names-only user directory fields,
admin-panel access, prose/structure/system-only field splits, save-as-new creation, candidate deletion
scope, Official-pointer protection, and the two-part version immutability mechanism. The important
boundary is preserved: `access.update` exists only to keep the Payload form editable, while
`beforeChange` rejects every authenticated in-place version update. Trusted system paths remain
available for ingest/migration operations.

The fresh pinned dependency-container run passed **21/21** focused unit assertions (15 access-scope
and six immutability-wiring checks) and **26/26** access integration assertions against the marked
target. The integration fixture was run with the target runtime database mounted over the tracked
localhost-only `test.env`; synthetic rows were tagged and removed by the fixture teardown. Runner
hash: `1805e78e4b723214f928c6115d876d44e4ed6d76cc25248fb06b98eb34a6a43d`; raw log hash:
`6af8bbe52557c87dead043ea7d0bf764a0f20f3309441269c6f6384b31ff4444`.

Existing HTTP/native authorization suites add the role/action evidence in C22, C23, C31 and the
C5 endpoint reports. No C5.1 candidate was found. Deployment edge identity, every possible REST
field permutation, and a complete C21/C22 matrix are reconciled separately in C80; they are not
silently treated as covered by this unit review.

**Exit:** authorization source, field boundaries, version immutability wiring and access integration
behavior were rechecked; 47 focused assertions passed; no C5.1 finding is accepted.
