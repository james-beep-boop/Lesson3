# Documentation consistency review — v1.10 c8d8f3d2

## documentation-01 — partial
Read fully: AGENTS.md, CLAUDE.md, COMPUTING-ENVIRONMENT.md, README.md, USER_GUIDE.md. The combined output for SPEC.md and the five design/fixture documents was truncated; they cannot be counted fully read. Read newest 200 lines of docs/DECISIONS.md for current wording, backup and product decisions. Dependencies checked so far: none. Remaining: read SPEC.md and docs/CI-PDF-FIXTURE-WORKFLOW-EDIT.md, docs/DESIGN-CRITIQUE-2026-07-12.md, docs/DESIGN-ares-release-combine-2026-10-19.md, docs/DESIGN-backup-recovery-2026-10-21.md, docs/DESIGN-button-system-2026-07-30.md without truncation; check Guide claims against source.

No verified findings yet.

Verified finding: USER_GUIDE.md:69–73 says users get a short email for messages; app/src/app/(frontend)/guide/page.tsx:195 repeats it. app/src/collections/Messages.ts:70–95 only enqueues a ping for the first unread message within a daily budget, and app/src/payload.config.ts:55–57,74–82 shows no real email without SMTP. Users on no-email schools could wait for notices that never come. Correct both guides to say unread messages appear on the avatar and an email may be sent when email is set up. Documentation only, no behavior or policy change.

## documentation-02 — partial
Read fully: docs/DESIGN-d1-deployment-amendments-2026-08-21.md. The combined output for the remaining six design records was truncated and none is claimed complete. Remaining: docs/DESIGN-discussions-2026-10-09.md, docs/DESIGN-editor-usability-2026-07-25.md, docs/DESIGN-generator-upgrade-2026-10-06.md, docs/DESIGN-guide-tutorial-2026-09-24.md, docs/DESIGN-insert-link-ares-2026-10-18.md, docs/DESIGN-manage-accordion-2026-08-16.md. No packet-specific source dependencies checked. No findings.

## documentation-03 — not started
No files or dependencies read. Remaining all nine files listed for documentation-03 in packets.json. No findings.

## documentation-04 — partial
Read fully: docs/EXTERNAL-DEPENDENCIES.md, docs/GO-LIVE-REHEARSAL.md, docs/LOCAL-SERVER-DEPLOYMENT.md, docs/ROCK5B-SETUP.md, docs/SIGN-IN-PROTECTION.md. OPS.md lines 1–170 only. Remaining: docs/DESIGN-working-drafts.md, docs/NEXT-SESSION.md, OPS.md lines 171–1097. Targeted dependencies: scripts/deploy.sh:1–100, docker-compose.yml:1–130, FirstUserForm.tsx:1–55.

Finding: docs/LOCAL-SERVER-DEPLOYMENT.md:120–134 tells a new installer to sign in and download a lesson immediately after install, before its own account-creation section (136–168) and lesson upload (204–215, 282–296). A clean school has neither login nor plans; manual says stop on error at 7–9. Move this check after account creation and lesson upload, keeping initial container/login checks. Docs only; no behavior/policy change.

Finding: docs/ROCK5B-SETUP.md:87–105, linked as the Rock runbook by README.md:75–77 and AGENTS.md practices, prescribes `git pull && docker compose up -d --build`, bypassing the pre-migration backup enforced by scripts/deploy.sh:3–10,32–46; docker-compose.yml:12–13,30–35 runs migrations before app starts. The plaintext pg_dump also bypasses current encrypted backup instructions. Mark these setup notes historical and direct current Rock operations to deploy.sh and OPS; no behavior/policy change.

## documentation-05 — not started
No files or dependencies read. Remaining all 21 files listed for documentation-05 in packets.json. No findings.

Follow-up: OPS.md lines 171–1097 read, completing that file. Remaining in packet 04: docs/DESIGN-working-drafts.md and docs/NEXT-SESSION.md. Additional source dependencies: app/src/lib/advancedTools.ts:22,31–32 and app/src/components/LessonControls/index.tsx:252–255.

Finding: docs/GO-LIVE-REHEARSAL.md:68–76 asks a freshly installed school to make two saves and use Combine, but never enables Advanced tools; the cited source hides the editor's Combine action in default Standard mode. Add a step for the Site administrator to turn on Advanced tools before testing. The newer-ARES suggestion in Standard does not apply to the two ordinary saves specified. Docs only; no behavior/policy change.

Finding: docs/LOCAL-SERVER-DEPLOYMENT.md:543–554 instructs a lightweight tag and a protected-main PR process while AGENTS.md:211–216 requires an annotated tag and practices records main protection removed. Align the example with `git tag -a ... -m ...` and current push policy; documentation-only. Additional Combine default evidence: app/src/globals/SystemSettings.ts:239–245.

NEXT-SESSION.md was attempted in one output, which truncated; it remains partially read and unclaimed as complete.

Packet 01 follow-up: read fully docs/CI-PDF-FIXTURE-WORKFLOW-EDIT.md, docs/DESIGN-ares-release-combine-2026-10-19.md and docs/DESIGN-backup-recovery-2026-10-21.md. Still remaining: SPEC.md, docs/DESIGN-CRITIQUE-2026-07-12.md, docs/DESIGN-button-system-2026-07-30.md.

Packet 01 completed: SPEC.md fully read in three ranges, including 224–230 re-read after the first output clipped; docs/DESIGN-CRITIQUE-2026-07-12.md and docs/DESIGN-button-system-2026-07-30.md fully read with their clipped join re-read. All 11 packet files are now fully read. Additional targeted dependencies: app/src/fields/lessonContent.ts:149–172,286–303 and in-app guide page.tsx:572–574.

Finding: USER_GUIDE.md:174–175 and app/src/app/(frontend)/guide/page.tsx:572–574 say administrators can change ARES keywords. The field is hidden and read-only (app/src/fields/lessonContent.ts:149–172,296–303; SPEC.md:303–307). Remove it from both lists; no behavior/policy change.

Packet 02 completed: all seven files now fully read, including discussions and Manage in three sequential ranges each; the clipped join in the combined read of editor-usability and generator-upgrade was re-read. Those design documents are dated planning records, so superseded proposals were not treated as current instructions. No additional packet-specific finding.

Packet 03 completed: all nine files fully read. The clipped joins in next-direction and system-panel/user-model/visual-system were re-read explicitly. These records describe proposals and dated implementations, so superseded claims were not treated as live behavior. No additional packet-specific source dependency or verified finding.

Packet 04 completed: docs/DESIGN-working-drafts.md and docs/NEXT-SESSION.md fully read in bounded sequential ranges, completing all eight files. Finding: docs/DESIGN-working-drafts.md:22–25 states the feature is never called drafts and that draft means an unofficial saved version; the present-tense naming conflicts with SPEC.md:331–343, which supersedes that reservation, and USER_GUIDE.md:121–126. Add a dated supersession note above the historical block pointing to SPEC §5, preserving the old reasoning. Documentation only, no behavior or policy change.

Packet 05 completed: all 21 files fully read, in packets.json order, including both evidence JSON files, all benchmark scripts/results and both root references. Dependency: SPEC.md:104–107,139–161; docs/EXTERNAL-DEPENDENCIES.md:14–24. Finding: root how-CBE-generation-works.md:237–267 calls generated JSON a disposable, untransformed mirror of the JS source, while docs/how-CBE-generation-works.md:310–336 and the cited SPEC state JSON contains mandatory resolved resourceLinks and is the complete downstream interchange. A maintainer could choose incomplete input. Replace the duplicate root copy with a pointer to the corrected docs copy or label it historical. Documentation only; no behavior/policy change.

## Final coverage reconciliation
All five packets complete: documentation-01 (11 files), documentation-02 (7), documentation-03 (9), documentation-04 (8), documentation-05 (21): 56 files in total. Later completion notes supersede the earlier partial/not-started notes above. All reads were at immutable v1.10 c8d8f3d22c432061c8bff27e8357dd9f2d4feb91. Evidence comparisons were targeted source reads, not execution or browser tests. No repository writes, live test writes, deployment, or external communication occurred.
