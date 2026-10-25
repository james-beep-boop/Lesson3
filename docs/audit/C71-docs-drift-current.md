# C71 documentation drift — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). The comparison covered
`README.md`, `SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `USER_GUIDE.md`, `docs/OPS.md`, and the current
`docs/NEXT-SESSION.md`, using the live route/role observations and the configuration/source reviews.

The current documents agree on the central product rules: three displayed user types, editing access
as a subject-grade capability, immutable numbered versions, private recovery drafts, the Official
pointer, public-library switches, SMTP-dependent approval behavior, and staged restore/backup
operations. The guide's five walkthroughs and forum on/off copy match the role-aware UI contract.
The operational docs describe the current backup journal, staged restore, kernel lock, cache handling,
and the required `scripts/deploy.sh` path.

The focused parity run passed **103/103** unit assertions: 55 guide-parity, 5 backup-status-path,
8 environment-template, 8 public-posture, 12 generated-surface, 12 guide-access, and 3 guide-panel
state checks. `check:approuter` and the C5.13 configuration slice independently passed. Runner hash:
`e88b4966296cbe0b071cc0767013e05dfcbd372c95120f4c4c7805b875817a10`; raw log hash:
`003564ca4387867cf0806297a76a0221fa96343c60002be41cdc4024cb4daa8d`.

The comparison did identify two documentation limitations that are retained as follow-ups rather than
findings: `docs/NEXT-SESSION.md` contains historical dated sections whose old test counts are not a
current status source, and README/OPS cannot describe the private audit target or shared deployment
parity. The audit summary now labels those boundaries explicitly. No stale command, route, or policy
statement was reproduced as a product defect.

**Exit:** required document families were compared with current source/live behavior and parity tests;
103/103 assertions passed; no C71 finding is accepted.
