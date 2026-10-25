# Historical audit to current source change inventory

Historical base: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Observed current main at checkout: `bd5f07863a150cd51245b9c942502efa19d4014d`.

`git diff --name-status d3714a5b210e1bac7bfa8884f4fce9a34add37b5 bd5f07863a150cd51245b9c942502efa19d4014d` reports 62 changed tracked paths. This is the opening change inventory; it does not satisfy the final current-main comparison. Reopen changed covered areas and preserve historical evidence against its original revision.

```text
M	app/next.config.ts
M	app/package-lock.json
M	app/package.json
A	app/playwright.style.config.ts
M	app/scripts/patch-payload-ui.mjs
M	app/scripts/seed-local-dev.ts
A	app/src/access/generatedSurfaces.ts
A	app/src/access/lockedDocuments.ts
M	app/src/access/versionImmutability.ts
M	app/src/app/(frontend)/layout.tsx
M	app/src/app/(frontend)/styles.css
M	app/src/app/(payload)/custom.scss
A	app/src/app/app-chrome.scss
A	app/src/app/app-dialog.scss
M	app/src/app/app-tokens.scss
M	app/src/collections/DiscussionParticipation.ts
M	app/src/collections/DiscussionReplies.ts
M	app/src/collections/DiscussionTopics.ts
M	app/src/collections/EditRecovery.ts
M	app/src/collections/Favorites.ts
M	app/src/collections/Messages.ts
M	app/src/collections/Users.ts
M	app/src/components/AdminDashboard/CandidateList.tsx
M	app/src/components/AdminDashboard/DeletePlansPanel.tsx
M	app/src/components/LessonControls/index.tsx
M	app/src/components/Modal/index.tsx
M	app/src/globals/SystemSettings.ts
M	app/src/ingest/contract.ts
M	app/src/lib/wireError.ts
A	app/src/migrations/20261024_094011_native_lock_scope.json
A	app/src/migrations/20261024_094011_native_lock_scope.ts
M	app/src/migrations/index.ts
M	app/src/payload-types.ts
M	app/src/payload.config.ts
A	app/tests/e2e/documentLocks.e2e.spec.ts
M	app/tests/e2e/editorBackDarkMode.e2e.spec.ts
M	app/tests/e2e/manage.e2e.spec.ts
M	app/tests/http/apiErrorMessages.http.spec.ts
M	app/tests/http/authFavorites.http.spec.ts
A	app/tests/http/jobStatsGlobal.http.spec.ts
A	app/tests/http/lockedDocuments.http.spec.ts
M	app/tests/int/favorites.int.spec.ts
A	app/tests/int/jobStatsScheduling.int.spec.ts
A	app/tests/style-snapshot/README.md
A	app/tests/style-snapshot/dialogs.spec.ts
A	app/tests/style-snapshot/diff.mjs
A	app/tests/style-snapshot/kit.ts
A	app/tests/style-snapshot/menu-states.spec.ts
A	app/tests/style-snapshot/pages.spec.ts
A	app/tests/unit/generatedSurfaces.spec.ts
A	app/tests/unit/ingestContract.spec.ts
M	app/tests/unit/modalChrome.spec.tsx
D	app/tests/unit/nextConfigMinify.spec.ts
M	docs/CHANGELOG.md
M	docs/DECISIONS.md
M	docs/NEXT-SESSION.md
M	docs/OPS.md
A	docs/PLAN-job-stats-global-access-2026-10-24.md
A	docs/PLAN-native-locks-2026-10-24.md
A	docs/audit/reviews/recent-2026-10-25.md
M	scripts/dev-server.sh
M	scripts/test-restore-db-stack.sh
```
