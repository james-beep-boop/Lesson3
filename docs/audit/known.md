# Known issues and prior-work pointers

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Initial C00 reference index; no new defect
claims have been accepted. A historical report or accepted tradeoff does not suppress contrary evidence.

| Reference | How this cycle uses it |
|---|---|
| SPEC §5/§6/§8; DECISIONS and current design documents | Current intended policy; do not infer expected access from old audit wording |
| DECISIONS 2026-10-23/24, typing-speed plan | The Payload patch and deployment benchmark are prior evidence, not a new audit result; validate the installed patch and input/save behavior |
| NEXT-SESSION current state and Phase B pause | Whole-machine recovery kit implementation stays paused; D02 awaits hardware and required recovery material |
| Latest dependency review under `docs/` and DECISIONS dependency entries | Re-check current advisory data and runtime reachability; previous green results expire as advisory data changes |
| CODE-REVIEW-PLAN, drift and canonical-JSON audit documents | Historical leads and unit ownership only; this handbook/catalog govern the new cycle |
| Cycle D01–D03 | Required deferred acceptance, reported separately from product defects or passed checks |

Environment/setup failures and unavailable fixtures are recorded in baseline results with next actions.
Scanner output becomes a finding only after the handbook's evidence and review requirements are met.
