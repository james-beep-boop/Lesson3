# Tracked-file coverage manifest

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Generated from `git ls-tree -r --name-only` on 2026-10-24.

All **867 tracked files** have a provisional chunk owner below. This is an inventory, not
coverage: no file becomes covered merely by assignment. C00's coordinator owns this manifest; component
executors submit evidence/ranges for consolidation. C00 must split large ownership groups before dispatch.
Generated/vendor/binary rows retain explicit required checks; no exclusion is accepted yet.
New audit artifacts are outputs of this cycle and are not retroactively part of the immutable baseline.

## Largest source files (sizing, not findings)

| Lines | File |
|---|---|
| 3271 | `app/src/app/(payload)/custom.scss` |
| 2372 | `app/src/app/(frontend)/styles.css` |
| 1486 | `app/src/components/LessonControls/index.tsx` |
| 1344 | `app/src/payload-types.ts` |
| 944 | `app/src/app/(frontend)/guide/page.tsx` |
| 890 | `app/src/components/EditRecovery/useEditRecovery.ts` |
| 871 | `app/src/components/AdminDashboard/index.tsx` |
| 835 | `app/src/ingest/index.ts` |
| 755 | `app/src/lib/backupStatus.ts` |
| 706 | `app/src/lib/editRecovery/kernel.ts` |
| 618 | `app/src/hooks/userRoles.ts` |
| 582 | `app/src/components/Manage/UsersPanel.tsx` |
| 579 | `app/src/components/Manage/RolesAccessPanel.tsx` |
| 517 | `app/src/hooks/lessonPlan.ts` |
| 495 | `app/src/fields/lessonContent.ts` |
| 488 | `app/src/lib/editRecovery/projection.ts` |
| 488 | `app/src/endpoints/versionEdit.ts` |
| 448 | `app/src/hooks/fieldSplit.ts` |

## File assignments

| File | Provisional chunk owner | Coverage status | Required evidence / exclusion rationale |
|---|---|---|---|
| `.claude/launch.json` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/settings.json` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/SKILL.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/ACCESS-CONTROL-ADVANCED.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/ACCESS-CONTROL.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/ADAPTERS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/ADVANCED.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/COLLECTIONS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/ENDPOINTS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/FIELD-TYPE-GUARDS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/FIELDS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/HOOKS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/PLUGIN-DEVELOPMENT.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.claude/skills/payload/reference/QUERIES.md` | C71 | pending | Manual/source or behavioral evidence required |
| `.env.example` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `.github/workflows/ci.yml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `.github/workflows/publish-containers.yml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `.gitignore` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `.nvmrc` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `AGENTS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `CLAUDE.md` | C71 | pending | Manual/source or behavioral evidence required |
| `COMPUTING-ENVIRONMENT.md` | C71 | pending | Manual/source or behavioral evidence required |
| `LICENSE` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `NOTICE` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `README.md` | C71 | pending | Manual/source or behavioral evidence required |
| `SPEC.md` | C71 | pending | Manual/source or behavioral evidence required |
| `USER_GUIDE.md` | C71 | pending | Manual/source or behavioral evidence required |
| `app/.dockerignore` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.env.example` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.gitignore` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.npmrc` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.nvmrc` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.prettierignore` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.prettierrc.json` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/.yarnrc` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/Dockerfile` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `app/LICENSE` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/README.md` | C71 | pending | Manual/source or behavioral evidence required |
| `app/eslint.config.mjs` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/next.config.ts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/package-lock.json` | C11 / C15 | pending | Inspect exact resolution, overrides and advisories; no dependency installation from unpinned tools |
| `app/package.json` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/playwright.config.ts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/public/.gitkeep` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/scripts/adapter-fidelity.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/bench-typing.mjs` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/check-approuter.mjs` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/clear-editor-collapse-prefs.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/contract-check.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/contract-drift.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/corpus-check.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/corpus-resource-check.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/fidelity-spike.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/ingest-extract-check.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/ingest.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/docxDiff.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/fidelityFixture.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/localDbGuard.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/payloadRowIds.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/preferences.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/lib/stripCollapsed.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/patch-payload-ui.mjs` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/recover-site-admin.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/reset-installation-id.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/restore-check.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/roundtrip-regression.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/seed-local-dev.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/seed-users.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/verify-edit-recovery-cascade.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/verify-rbac.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/verify-stage2-export.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/verify-stage2-reads.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/scripts/verify-stage2b-preview.ts` | C5.13 (pair with component owner) | pending | Manual/source or behavioral evidence required |
| `app/src/access/bundle.ts` | C5.1 (C5.1-01) | pending | Manual/source or behavioral evidence required |
| `app/src/access/index.ts` | C5.1 (C5.1-01) | pending | Manual/source or behavioral evidence required |
| `app/src/access/versionImmutability.ts` | C5.1 (C5.1-01) | pending | Manual/source or behavioral evidence required |
| `app/src/access/versioning.ts` | C5.1 (C5.1-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/LibraryBrowser.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/discuss/[id]/page.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/discuss/new/page.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/discuss/page.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/explore/page.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/forgot-password/ForgotPasswordForm.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/forgot-password/page.tsx` | C5.10 (C5.10-01) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/guide/page.tsx` | C5.10 (C5.10-02) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/layout.tsx` | C5.10 (C5.10-02) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/EditActions.tsx` | C5.10 (C5.10-02) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/EmailModal.tsx` | C5.10 (C5.10-02) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/ShareMenu.tsx` | C5.10 (C5.10-02) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/compare/CompareFilter.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/compare/ComparePickers.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/compare/page.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/lessons/[id]/page.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/login/FirstUserForm.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/login/LoginForm.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/login/page.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/messages/Composer.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/messages/MarkShownRead.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/messages/ReplyBox.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/messages/page.tsx` | C5.10 (C5.10-03) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/messages/sendMessage.ts` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/page.tsx` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/reset-password/ResetPasswordForm.tsx` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/reset-password/page.tsx` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/signup/SignupForm.tsx` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/signup/page.tsx` | C5.10 (C5.10-04) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/styles.css` | C5.10 (C5.10-05, C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/verify-email/VerifyEmail.tsx` | C5.10 (C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(frontend)/verify-email/page.tsx` | C5.10 (C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(payload)/admin/[[...segments]]/not-found.tsx` | C5.10 (C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(payload)/admin/[[...segments]]/page.tsx` | C5.10 (C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(payload)/admin/importMap.js` | C5.10 / C60–C63 | pending generated check | Generated: verify inputs, registration, reproducibility and boundary; no manual line review |
| `app/src/app/(payload)/api/[...slug]/route.ts` | C5.10 (C5.10-06) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(payload)/custom.scss` | C5.10 (C5.10-07, C5.10-08, C5.10-09) | pending | Manual/source or behavioral evidence required |
| `app/src/app/(payload)/layout.tsx` | C5.10 (C5.10-09) | pending | Manual/source or behavioral evidence required |
| `app/src/app/app-tokens.scss` | C5.10 (C5.10-09) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/DiscussionParticipation.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/DiscussionReplies.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/DiscussionTopics.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/EditRecovery.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/Favorites.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/LessonBundleVersions.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/LessonPlans.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/Messages.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/Subject.ts` | C5.6a (C5.6a-01) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/SubjectGrade.ts` | C5.6a (C5.6a-02) | pending | Manual/source or behavioral evidence required |
| `app/src/collections/Users.ts` | C5.6a (C5.6a-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AdminDashboard/CandidateList.tsx` | C5.11 (C5.11-01) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AdminDashboard/DeletePlansPanel.tsx` | C5.11 (C5.11-01) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AdminDashboard/index.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AdminHeaderMenu/index.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AdminUnauthorizedRedirect/index.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AppNav/NavigationFreshness.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AppNav/index.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/AppVersion.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Brand/Icon.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/CollapseOnEntry/index.tsx` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/CombineVersions/applyOverlay.ts` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/CombineVersions/comparisonError.ts` | C5.11 (C5.11-02) | pending | Manual/source or behavioral evidence required |
| `app/src/components/CombineVersions/index.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/CompareToOfficialLink.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/ComposerParts.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/MarkThreadRead.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/ModerationControls.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/Pager.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/PostText.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/ReferencePicker.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/ReplyComposer.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/TopicComposer.tsx` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/referencePickerQueries.ts` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/submitPost.ts` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Discussions/useComposer.ts` | C5.11 (C5.11-03) | pending | Manual/source or behavioral evidence required |
| `app/src/components/DocButtons.tsx` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/DocStrip.tsx` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/Indicator.tsx` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/RestorePrompt.tsx` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/deadline.ts` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/flushRegistry.tsx` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/protocol.ts` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/restoreDiff.ts` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/restoreGroups.ts` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/unsavedWarning.ts` | C5.11 (C5.11-04) | pending | Manual/source or behavioral evidence required |
| `app/src/components/EditRecovery/useEditRecovery.ts` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/FavoriteToggle.tsx` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/FormField.tsx` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Guide/Accordion.tsx` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Guide/availability.ts` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Guide/panelState.ts` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/IdleLogout/index.tsx` | C5.11 (C5.11-05) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/EditJumpNav.tsx` | C5.11 (C5.11-06) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/MoreMenu.tsx` | C5.11 (C5.11-06) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/currentSection.ts` | C5.11 (C5.11-06) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/entryPhase.ts` | C5.11 (C5.11-06) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/index.tsx` | C5.11 (C5.11-07) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/initialCollapse.ts` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/server.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonControls/validation.ts` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonDetails.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LessonReference.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LinkedTextarea/activeTarget.ts` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LinkedTextarea/aresAddress.ts` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LinkedTextarea/index.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/LinkedTextarea/insertLink.ts` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/Accordion.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/BackupStatusPanel.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/ClockCheck.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/LocalTime.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/PersonIdentity.tsx` | C5.11 (C5.11-08) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/RolesAccessPanel.tsx` | C5.11 (C5.11-09) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/SubjectsAndGradesPanel.tsx` | C5.11 (C5.11-09) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/SystemFactsPanel.tsx` | C5.11 (C5.11-09) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/SystemFeaturesPanel.tsx` | C5.11 (C5.11-09) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/UnsavedWorkList.tsx` | C5.11 (C5.11-09) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/UsersPanel.tsx` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/panelState.ts` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/readFeaturesSettings.ts` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/systemFeaturesState.ts` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/taxonomyActions.ts` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Manage/useOpenPanels.ts` | C5.11 (C5.11-10) | pending | Manual/source or behavioral evidence required |
| `app/src/components/Modal/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/NewTabLink.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/PageBackLink.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/PageHeader.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/PasswordInput.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/PhaseSelectField/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/RedirectToManage/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/RequestEditingButton.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/RowLabel/formatRowLabel.ts` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/RowLabel/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/SubjectSelectField/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/SubjectSelectField/options.ts` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/UploadBundles/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/UserMenu/DisplayNameForm.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/UserMenu/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/VersionTimestamps/index.tsx` | C5.11 (C5.11-11) | pending | Manual/source or behavioral evidence required |
| `app/src/components/VersionsChip.tsx` | C5.11 (C5.11-12) | pending | Manual/source or behavioral evidence required |
| `app/src/components/WelcomeDialog/index.tsx` | C5.11 (C5.11-12) | pending | Manual/source or behavioral evidence required |
| `app/src/components/exportClient.ts` | C5.11 (C5.11-12) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/aresExport.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/combinePreview.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/discussionActions.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/discussionNavState.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/discussionThreadDelete.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/emailVersion.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/exportAuth.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/exportVersion.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/forgotPassword.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/markMessagesRead.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/moderate.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/parseFormat.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/previewParse.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/previewShared.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/previewVersion.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/recovery.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/recoveryParse.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/requestEditing.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/resourceLibrary.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/respond.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/serverTime.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/systemSettingsSave.ts` | C5.5 (C5.5-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/uploadBundles.ts` | C5.4 (C5.4-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/userAdminActions.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/userAssignments.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/userSearch.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/verifyEmail.ts` | C5.3 (C5.3-01) | pending | Manual/source or behavioral evidence required |
| `app/src/endpoints/versionEdit.ts` | C5.4 (C5.4-02) | pending | Manual/source or behavioral evidence required |
| `app/src/errors/AccountDisabled.ts` | C5.13 (C5.13-01) | pending | Manual/source or behavioral evidence required |
| `app/src/fields/bundleFields.ts` | C5.12 (C5.12-01) | pending | Manual/source or behavioral evidence required |
| `app/src/fields/identity.ts` | C5.12 (C5.12-01) | pending | Manual/source or behavioral evidence required |
| `app/src/fields/lessonContent.ts` | C5.12 (C5.12-01) | pending | Manual/source or behavioral evidence required |
| `app/src/fields/phases.ts` | C5.12 (C5.12-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/adapter.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/artifactCache.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/cacheCodecs.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/config/attribution.yaml` | C5.8 / C42 | pending | Manual/source or behavioral evidence required |
| `app/src/generator/deliverables.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/docxToPdf.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/exportArtifacts.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/generateForVersion.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/htmlDiffCache.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/htmlSectionsCache.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/index.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/previewBundle.ts` | C5.8 (C5.8-01) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/proseLinks.ts` | C5.8 (C5.8-02) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/renderVersion.ts` | C5.8 (C5.8-02) | pending | Manual/source or behavioral evidence required |
| `app/src/generator/vendor/LICENSE` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/PROVENANCE.md` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/aresResources.js` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/config/attribution.upstream.yaml` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/lib/attribution.js` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/lib/build_docs.js` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/lib/docx_kit.js` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/lib/sections.js` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/generator/vendor/package.json` | C5.8 / C42 | pending provenance | Exclude manual line review only after hashes, upstream advisory and boundary checks |
| `app/src/globals/SystemSettings.ts` | C5.13 (C5.13-01) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/authRateLimit.ts` | C5.6b (C5.6b-01) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/bundleVersion.ts` | C5.6b (C5.6b-01) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/discussions.ts` | C5.6b (C5.6b-01) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/fieldSplit.ts` | C5.6b (C5.6b-01) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/lessonPlan.ts` | C5.6b (C5.6b-02) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/messageReference.ts` | C5.6b (C5.6b-02) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/mutationAuthority.ts` | C5.6b (C5.6b-02) | pending | Manual/source or behavioral evidence required |
| `app/src/hooks/userRoles.ts` | C5.6b (C5.6b-02) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/ares-contract.schema.json` | C5.2 / C40 | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/contentEquality.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/contract.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/errors.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/extract.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/index.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/releaseAncestry.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/releaseFingerprintContext.ts` | C5.2 (C5.2-01) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/resourceLinks.ts` | C5.2 (C5.2-02) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/taxonomy.ts` | C5.2 (C5.2-02) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/toBundle.ts` | C5.2 (C5.2-02) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/uploadFiles.ts` | C5.2 (C5.2-02) | pending | Manual/source or behavioral evidence required |
| `app/src/ingest/validateGeneratable.ts` | C5.2 (C5.2-02) | pending | Manual/source or behavioral evidence required |
| `app/src/instrumentation.ts` | C5.13 (C5.13-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/emailVersionArtifact.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/expireEditRecovery.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/generateVersionArtifact.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/messagePing.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/passwordResetEmail.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/jobs/prewarmVersionArtifacts.ts` | C5.7 (C5.7-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/accessScopes.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/advancedTools.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/apiBase.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/appVersion.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/assignmentCounts.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/assignmentRoles.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/awaitingApproval.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/backupStatus.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/canonicalJson.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/clockSkew.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/ancestry.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/backfill.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/correspondence.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/diff3.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/draft.ts` | C5.9 (C5.9-01) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/engine.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/lineage.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/combine/outcome.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/compareGroups.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/conversionLimit.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/discussionComposer.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/discussionPages.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/discussionPaging.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/discussionText.ts` | C5.9 (C5.9-02) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/discussions.ts` | C5.9 (C5.9-03) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/displayTitle.ts` | C5.9 (C5.9-03) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/domWindow.ts` | C5.9 (C5.9-03) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/draftCombineSuggestion.ts` | C5.9 (C5.9-03) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/kernel.ts` | C5.9 (C5.9-03) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/projection.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/provenance.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/ttl.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editRecovery/unsavedWork.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editingViewport.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/editorGroups.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/emailAddress.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/emailLinkBase.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/enqueue.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/env.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/errorTracking.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/escapeHtml.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/firstUserBootstrap.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/formatDate.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/frameworkProse.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/gradeLevels.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/identity/installationId.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/identity/releaseFingerprint.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/initials.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/lessonAnchors.ts` | C5.9 (C5.9-04) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/lessonDetails.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/lessonReference.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/offlineAdminRecovery.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/personalFavorites.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/personalVersions.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/planSelection.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/plural.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/proseLinkTokens.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/publicLibrary.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/publicPlan.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/publicPosture.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/publicSlug.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/rateLimit.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/readBundle.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/relId.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/renderTimings.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/requestedVersion.ts` | C5.9 (C5.9-05) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/resolveLessonReferences.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/sanitizeHtml.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/semver.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/serverActionBodyLimit.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/session.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/stripIds.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/substrand.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/systemFacts.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/systemFlagNames.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/systemFlags.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/txDb.ts` | C5.9 (C5.9-06) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/userSearchContract.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/versionContent.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/versionCounts.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/versionsOrder.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/welcomeDismissal.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/widgetUser.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/lib/wireError.ts` | C5.9 (C5.9-07) | pending | Manual/source or behavioral evidence required |
| `app/src/migrations/20260608_024132_initial.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260608_024132_initial.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260608_145602_lesson_entities.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260608_145602_lesson_entities.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260608_224715_bundle_versioning.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260608_224715_bundle_versioning.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260609_164927_subjectgrade_unique_drop_media.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260609_164927_subjectgrade_unique_drop_media.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260609_170000_drop_subject_slug.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260609_170000_drop_subject_slug.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260622_210554_add_unit_fields.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260622_210554_add_unit_fields.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260623_151918_add_payload_jobs.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260623_151918_add_payload_jobs.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260624_221905_official_version_model.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260624_221905_official_version_model.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260625_125532_drop_lesson_bundles.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260625_125532_drop_lesson_bundles.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260628_154237_add_version_semver_unique.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260628_154237_add_version_semver_unique.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260629_213000_add_rate_limit_counters.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_015014_add_version_author.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_015014_add_version_author.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_194849_add_favorites.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_194849_add_favorites.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_230926_add_email_task.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260702_230926_add_email_task.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260703_041716_add_messaging.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260703_041716_add_messaging.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260706_175339_favorites_per_version.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260706_175339_favorites_per_version.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260710_041621_add_email_verification.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260710_041621_add_email_verification.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260719_185124_ares_resource_links_cutover.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260719_185124_ares_resource_links_cutover.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260719_210359_resource_links_child_rows.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260719_210359_resource_links_child_rows.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260721_025518_add_password_reset_email_task.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260721_025518_add_password_reset_email_task.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260806_185943_add_edit_recovery.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260806_185943_add_edit_recovery.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260812_180000_dedupe_pending_export_jobs.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260814_235248_add_public_publication.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260814_235248_add_public_publication.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260817_141942_add_sign_in_disabled.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260817_141942_add_sign_in_disabled.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260820_223208_add_assignment_provenance.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260820_223208_add_assignment_provenance.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260821_234341_add_system_settings.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260821_234341_add_system_settings.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260822_011614_drop_outbound_email_flag.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260822_011614_drop_outbound_email_flag.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260919_222201_add_reset_password_requested_at.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20260919_222201_add_reset_password_requested_at.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261009_082909_add_forum_enabled.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261009_082909_add_forum_enabled.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261009_125057_add_discussions.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261009_125057_add_discussions.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261012_012355_add_message_version_labels.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261012_012355_add_message_version_labels.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261018_072213_combine_lineage.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261018_072213_combine_lineage.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261018_095242_combine_draft_context.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261018_095242_combine_draft_context.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261019_120000_release_ancestry.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261019_211325_worldwide_ids.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261019_211325_worldwide_ids.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261020_092934_advanced_tools.json` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/20261020_092934_advanced_tools.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/migrations/index.ts` | C5.14 | pending | Review custom data logic and registration; generated schema covered by fresh-migrate and upgrade evidence |
| `app/src/payload-types.ts` | C5.13 | pending generated check | Generated: verify inputs, registration, reproducibility and boundary; no manual line review |
| `app/src/payload.config.ts` | C5.13 (C5.13-01) | pending | Manual/source or behavioral evidence required |
| `app/src/proxy.ts` | C5.13 (C5.13-01) | pending | Manual/source or behavioral evidence required |
| `app/test.env` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/advancedTools.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/catalogue.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/combine.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/discussions.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/discussionsGuide.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/discussionsModeration.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/draftCombineShortcut.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/drafts.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/editRecovery.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/editRecoveryRestore.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/editorBackDarkMode.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/editorValidation.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/insertLink.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/lessonDetails.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/liveRowLabels.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/manage.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/messages.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/offlineSignup.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/publicLibraryDisabled.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/saveSnapshot.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/uploadBundles.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/versionUnavailable.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/e2e/welcomeDialog.e2e.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/fixtures/pdf-library/.gitattributes` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/fixtures/pdf-library/README.md` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/fixtures/pdf-library/public-wire.pdf` | C72 (pair with source owner) | pending asset check | Binary asset: provenance, role, serving/export boundary and relevant render checks |
| `app/tests/helpers/cssSelectors.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/db.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/dialogs.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/discussions.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/e2e.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/editRecovery.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/editRecoveryUi.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/fakeReq.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/fieldTree.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/fixtures.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/generatorHtml.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/httpWire.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/login.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/manageUi.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/nullResourceLinks.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/payloadErrors.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/renderSql.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/helpers/rowLocks.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/apiErrorMessages.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/authFavorites.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/combinePreview.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/combineSave.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/discussions.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/endpoints.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/firstUserBootstrap.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/messageReferences.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/nativeVersionAuthority.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/nullResources.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/pendingAuthority.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/recovery.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/saveAsNewRecovery.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/serverTime.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/subjectGrades.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/systemSettings.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/teacherKey.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/userAdminActions.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/userAssignments.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/userSearch.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/http/worldwideIds.http.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/access.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/adminResetLinkCarveOut.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/api.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/assignmentProvenance.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/authFavorites.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/authRateLimit.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/bestEffortEnqueue.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/clearCollapsePrefs.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/combineDraftMigration.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/combineMigration.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/discussions.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/discussions3b.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/discussions4a.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/draftCombineSuggestion.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryAccess.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryCap.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryCapture.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryExpiry.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryMetadata.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryRetire.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryStart.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editRecoveryUnsavedWork.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/editorGroupsAccess.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/favorites.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/lockRows.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/messageReferenceMigration.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/messages.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/nullResources.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/officialPointerLock.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/personalVersions.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/planIdentityImmutable.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/publicPublication.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/rateLimit.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/reingest.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/subjectAdminHandover.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/systemSettings.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/taxonomyDelete.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/uploadTaxonomy.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/userSecurity.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/verifyBackfill.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/int/worldwideIds.int.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/accessScopes.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/accordionPanelCount.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/accountDisabledContract.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/accountDisabledWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/adminResetLinkAllowance.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/advancedTools.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/appVersion.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/aresAddress.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/artifactCacheBestEffort.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/artifactCacheCleanup.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/authFavoritesWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/authFormMessages.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/backupStatus.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/backupStatusPathParity.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/browserFindings.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/buttonSystem.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/canDeleteVersionDoc.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/candidateListActions.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/canonicalJson.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/captureDiffAgreement.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/classNameStyles.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/clockCheck.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/clockSkew.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/collapseOnEntry.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/collapsedPanelEntryRule.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineDraft.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineEngine.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineFields.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineLineage.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineOutcome.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineRetry.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineUnavailable.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/combineVersionChoices.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/compareDiffGroups.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/compareFilterDefault.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/compareGroups.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/corpusCheck.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/currentSection.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/deliverables.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionComposer.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionModerationControls.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionModerationPages.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionPages.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionPaging.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionReferenceSelection.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionText.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussionThreadDelete.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/discussions.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/displayNameForm.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/displayTitle.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/draftCombineSuggestion.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editJumpNav.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editRecoveryIndicator.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editRecoveryMigrationOrder.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editRecoveryProjection.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editRecoveryProtocol.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editRecoveryTtlProvenance.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editingViewport.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editorPlainLanguage.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/editorValidation.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/emailAddress.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/emailFormat.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/emptyArraySerialization.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/enforceAssignmentScope.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/enqueueDetached.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/entryPhase.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/envTemplateParity.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/errorTracking.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/expireEditRecoveryTask.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/exportArtifacts.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/exportClient.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/exportJobDedupe.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/exportKind.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/extract.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/favoriteToggle.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/fieldSplitContainers.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/filterRows.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/firstUserBootstrap.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/firstUserRoleLock.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/firstUserVerificationEmail.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/forgotPasswordFailure.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/generatorGrade.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/generatorUpgrade.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/guideAccess.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/guideCompareVisual.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/guidePanelState.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/guideParity.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/htmlDiffCacheWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/htmlDiffContract.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/htmlSectionsCache.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/idleLogoutScreenClear.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/ingestContentEquality.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/ingestSubjectGradeLock.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/ingestTaxonomy.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/initialEditorCollapse.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/initials.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/insertLink.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/jsonBodyCeiling.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/keepForLater.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonAnchors.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonControlsDrafts.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonControlsMountGuard.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonControlsSave.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonControlsSsr.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonControlsVersionIdentity.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonDetails.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lessonReference.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/libraryFilters.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/linkedTextareaLibrary.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/localDbGuard.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/lockOrder.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/markReadBody.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/messageContextLink.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/metaIdentitySplit.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/modalChrome.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/moreMenu.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/mutationAuthority.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/navigationFreshness.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/nextConfigMinify.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/officialPointerPartialUpdate.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/offlineAdminRecovery.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/pageBackLink.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/panelState.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/parsePreviewCandidate.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/payloadUiPatchBehaviour.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/payloadUiPatchScript.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/personalFavorites.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/personalVersions.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/phaseSelectField.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/planDetailsPanel.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/planSelection.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/planSubjectGradeImmutable.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/proseLinks.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/proseWhitelistDrift.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/publicLibrary.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/publicPosture.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/publicSlug.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/readBundleVisibility.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/readFeaturesSettings.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/recoveryCombineBoundary.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/recoveryParse.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/refreshCaller.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/relId.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/releaseAncestry.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/releaseFingerprint.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/releaseFingerprintContext.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/requestedVersion.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/resetLinkNotLogged.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/resourceLibrary.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/resourceLinks.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/resourceRowDrift.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/restoreDiff.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/restorePromptGroups.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/restorePromptRender.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/retargetFavoritesTxn.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/rolesAccessPanel.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/rowLabel.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/rowLabelLive.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/sanitizeHtml.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/sectionKeyForFocus.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/semverConflict.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/serverActionBodyLimit.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/shareMenuAdvanced.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/signupForm.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/signupTrustClassifier.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/stripCollapsed.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/structuralControlsCss.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/subjectAdminDemoteLock.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/subjectGradeDelete.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/subjectSelectOptions.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/substrand.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemFacts.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemFeaturesPanel.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemFeaturesState.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemFlags.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemSettingsFlags.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/systemSettingsSave.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/testSignupLimitConfig.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/unsavedWarning.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/uploadBundles.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/uploadFiles.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/useEditRecovery.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/useOpenPanels.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/userSearchWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/userTypeLabel.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/usersPanelPaging.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/vendorProvenance.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/verifiedFieldWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/versionCounts.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/versionImmutabilityWiring.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/versionTimestampsTz.spec.tsx` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tests/unit/versionsOrder.spec.ts` | C72 (pair with source owner) | pending | Manual/source or behavioral evidence required |
| `app/tsconfig.json` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/vitest.config.mts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/vitest.http.config.mts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/vitest.setup.ts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `app/vitest.unit.config.mts` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `deploy/online/compose.template.yaml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `deploy/online/install.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `deploy/online/update.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `docker-compose.local.yml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `docker-compose.test.yml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `docker-compose.yml` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `docs/ARES-DATA-REQUEST.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/ARES-canonical-json-audit.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/ARES-v2-followup.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/ARES-v2-remediation-summary.docx` | C71 | pending asset check | Binary asset: provenance, role, serving/export boundary and relevant render checks |
| `docs/CHANGELOG.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/CI-PDF-FIXTURE-WORKFLOW-EDIT.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/CODE-REVIEW-PLAN.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DECISIONS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DEPENDENCY-REVIEW-2026-08-25.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DEPENDENCY-REVIEW-2026-09-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DEPENDENCY-REVIEW-2026-10-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-CRITIQUE-2026-07-12.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-ares-release-combine-2026-10-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-backup-recovery-2026-10-21.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-button-system-2026-07-30.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-d1-deployment-amendments-2026-08-21.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-discussions-2026-10-09.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-editor-usability-2026-07-25.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-generator-upgrade-2026-10-06.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-guide-tutorial-2026-09-24.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-insert-link-ares-2026-10-18.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-manage-accordion-2026-08-16.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-modes-connectivity-network-2026-10-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-next-direction-2026-08-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-phase4-scope-2026-10-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-public-library.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-read-page-accordion-2026-08-29.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-system-panel-2026-08-21.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-update-draft-2026-10-19.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-user-model-language-2026-07-29.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-visual-system-2026-07-31.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-who-manages-what-2026-08-29.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/DESIGN-working-drafts.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/EXTERNAL-DEPENDENCIES.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/GO-LIVE-REHEARSAL.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/LOCAL-SERVER-DEPLOYMENT.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/NEXT-SESSION.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/OPS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/PLAN-editing-typing-speed-2026-10-23.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/PLAN-forum-dialogs-and-manage-personal-work-2026-10-22.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/PLAN-phase-b-recovery-2026-10-22.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/ROCK5B-SETUP.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/archive/BUILD-HISTORY-2026-06-TO-07.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/archive/NEXT-SESSION-HISTORY-2026-06-TO-10.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/audit/audit_plan.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/audit/catalog.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/drift.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/evidence/attribution-node-24.22.1-comparison.json` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/evidence/gotenberg-8.38.0-comparison.json` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/how-CBE-generation-works.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-finished-2026-10-11/README.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-finished-2026-10-11/RESULTS.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-finished-2026-10-11/mac-results.json` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-finished-2026-10-11/measure.mjs` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-finished-2026-10-11/rock-results.json` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/README.md` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/config.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/correctness.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/measure.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/measure2.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/search.sql` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/seed.sql` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/titlebody.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/titles.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `docs/spikes/discussions-search-2026-10-09/titlesem.ts` | C71 | pending | Manual/source or behavioral evidence required |
| `gotenberg/Dockerfile` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `how-CBE-generation-works.md` | C71 | pending | Manual/source or behavioral evidence required |
| `out/ops/.gitkeep` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `out/resource-library/.gitkeep` | C00 / C5.13 / C70 | pending | Manual/source or behavioral evidence required |
| `scripts/backup-db.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/build-local-deploy-bundle.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/create-env.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/deploy.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/dev-seed.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/dev-server.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/heartbeat.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/in-deps.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/lib.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/lib/dev-env.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/lib/release-images.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/lib/restore-probe-tools.Dockerfile` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/merge-release-images.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/prune-db.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/publish-release-bundle.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/restore-db.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-backup-status.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-deploy-sidecar.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-local-deploy-bundle.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-merge-release-images.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-online-update.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-publish-release-bundle.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-restore-db-stack.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-restore-db.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/test-vendor-generator.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/vendor-generator.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `scripts/verify-release-bundle-images.sh` | C70 / C15 | pending | Manual/source or behavioral evidence required |
| `system_panel_functions.md` | C71 | pending | Manual/source or behavioral evidence required |
