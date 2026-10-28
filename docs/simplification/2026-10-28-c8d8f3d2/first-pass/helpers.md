# Export inventory

Declaration index for navigation; caller review establishes purpose and suitability.

| Export | Location | Declaration |
|---|---|---|
| `canEditProse` | `app/src/access/bundle.ts:26` | `export const canEditProse: FieldAccess = ({ req: { user }, doc, data }) =>` |
| `canEditStructure` | `app/src/access/bundle.ts:30` | `export const canEditStructure: FieldAccess = ({ req: { user }, doc, data }) =>` |
| `systemOnly` | `app/src/access/bundle.ts:35` | `export const systemOnly: FieldAccess = () => false` |
| `JOB_STATS_GLOBAL_SLUG` | `app/src/access/generatedSurfaces.ts:38` | `export const JOB_STATS_GLOBAL_SLUG = 'payload-jobs-stats'` |
| `noApiWrites` | `app/src/access/generatedSurfaces.ts:45` | `export const noApiWrites: Access = () => false` |
| `applyGeneratedSurfacePolicy` | `app/src/access/generatedSurfaces.ts:47` | `export const applyGeneratedSurfacePolicy = (config: SanitizedConfig): SanitizedConfig => {` |
| `toId` | `app/src/access/index.ts:24` | `export const toId = (ref: SubjectGradeRef / null / undefined): number / undefined => {` |
| `isSiteAdmin` | `app/src/access/index.ts:31` | `export const isSiteAdmin = (user: User / null / undefined): boolean =>` |
| `isSubjectAdminFor` | `app/src/access/index.ts:43` | `export const isSubjectAdminFor = (` |
| `isEditorFor` | `app/src/access/index.ts:51` | `export const isEditorFor = (` |
| `isSubjectAdminForAny` | `app/src/access/index.ts:61` | `export const isSubjectAdminForAny = (user: User / null / undefined): boolean =>` |
| `subjectGradeIdsByRole` | `app/src/access/index.ts:65` | `export const subjectGradeIdsByRole = (` |
| `authenticated` | `app/src/access/index.ts:81` | `export const authenticated: Access = ({ req: { user } }) => Boolean(user)` |
| `siteAdminOnly` | `app/src/access/index.ts:83` | `export const siteAdminOnly: Access = ({ req: { user } }) => isSiteAdmin(asUser(user))` |
| `canUseAdminPanel` | `app/src/access/index.ts:91` | `export const canUseAdminPanel = (user: User / null / undefined): boolean =>` |
| `userTypeLabel` | `app/src/access/index.ts:107` | `export const userTypeLabel = (user: User / null / undefined): UserTypeLabel => {` |
| `adminScopeIds` | `app/src/access/index.ts:115` | `export const adminScopeIds = (user: User / null / undefined): number[] =>` |
| `editingAccessScopeIds` | `app/src/access/index.ts:126` | `export const editingAccessScopeIds = (user: User / null / undefined): number[] =>` |
| `canManageUsers` | `app/src/access/index.ts:129` | `export const canManageUsers = (user: User / null / undefined): boolean =>` |
| `canManageCurriculum` | `app/src/access/index.ts:132` | `export const canManageCurriculum = (user: User / null / undefined): boolean => isSiteAdmin(user)` |
| `adminPanelAccess` | `app/src/access/index.ts:136` | `export const adminPanelAccess = ({ req: { user } }: { req: PayloadRequest }): boolean =>` |
| `usersCollectionCreate` | `app/src/access/index.ts:158` | `export const usersCollectionCreate: Access = async ({ req }) => {` |
| `usersCollectionRead` | `app/src/access/index.ts:164` | `export const usersCollectionRead: Access = ({ req: { user } }) => Boolean(user)` |
| `usersCollectionUpdate` | `app/src/access/index.ts:168` | `export const usersCollectionUpdate: Access = ({ req: { user }, id }) => {` |
| `emailReadAccess` | `app/src/access/index.ts:181` | `export const emailReadAccess: FieldAccess = ({ req: { user }, id }) => {` |
| `mayIdentifyGrantCandidates` | `app/src/access/index.ts:208` | `export const mayIdentifyGrantCandidates = (user: User / null / undefined): boolean =>` |
| `selfOrSiteAdminField` | `app/src/access/index.ts:213` | `export const selfOrSiteAdminField: FieldAccess = ({ req: { user }, id }) => {` |
| `siteAdminField` | `app/src/access/index.ts:219` | `export const siteAdminField: FieldAccess = ({ req: { user } }) => isSiteAdmin(asUser(user))` |
| `assignmentsUpdateField` | `app/src/access/index.ts:223` | `export const assignmentsUpdateField: FieldAccess = ({ req: { user } }) => {` |
| `assignmentsReadField` | `app/src/access/index.ts:232` | `export const assignmentsReadField: FieldAccess = ({ req: { user }, id }) => {` |
| `LOCKED_DOCUMENTS_SLUG` | `app/src/access/lockedDocuments.ts:39` | `export const LOCKED_DOCUMENTS_SLUG = 'payload-locked-documents'` |
| `LOCKABLE_COLLECTIONS` | `app/src/access/lockedDocuments.ts:45` | `export const LOCKABLE_COLLECTIONS = [` |
| `canEditLockTarget` | `app/src/access/lockedDocuments.ts:62` | `export async function canEditLockTarget(` |
| `lockCreate` | `app/src/access/lockedDocuments.ts:95` | `export const lockCreate: Access = () => false` |
| `lockRead` | `app/src/access/lockedDocuments.ts:98` | `export const lockRead: Access = authenticated` |
| `lockUpdate` | `app/src/access/lockedDocuments.ts:104` | `export const lockUpdate: Access = async ({ req, id, data }) => {` |
| `lockDelete` | `app/src/access/lockedDocuments.ts:115` | `export const lockDelete: Access = ({ req: { user } }) =>` |
| `versionUpdateGrantForFormRenderOnly` | `app/src/access/versionImmutability.ts:45` | `export const versionUpdateGrantForFormRenderOnly: Access = ({ req: { user } }) => {` |
| `enforceVersionImmutable` | `app/src/access/versionImmutability.ts:56` | `export const enforceVersionImmutable: CollectionBeforeChangeHook = ({ operation, req }) => {` |
| `lessonPlanRead` | `app/src/access/versioning.ts:16` | `export const lessonPlanRead: Access = ({ req: { user } }) => Boolean(user)` |
| `lessonPlanCreate` | `app/src/access/versioning.ts:31` | `export const lessonPlanCreate: Access = () => false` |
| `lessonPlanUpdate` | `app/src/access/versioning.ts:33` | `export const lessonPlanUpdate: Access = ({ req: { user } }) => {` |
| `lessonPlanDelete` | `app/src/access/versioning.ts:40` | `export const lessonPlanDelete: Access = ({ req: { user } }) => isSiteAdmin(user as User)` |
| `canSetOfficialVersion` | `app/src/access/versioning.ts:42` | `export const canSetOfficialVersion: FieldAccess = ({ req: { user }, data, doc }) => {` |
| `lessonBundleVersionRead` | `app/src/access/versioning.ts:48` | `export const lessonBundleVersionRead: Access = ({ req: { user } }) => Boolean(user)` |
| `lessonBundleVersionCreate` | `app/src/access/versioning.ts:59` | `export const lessonBundleVersionCreate: Access = () => false` |
| `deletableVersionsWhere` | `app/src/access/versioning.ts:76` | `export const deletableVersionsWhere = (u: User / null / undefined): Where / boolean => {` |
| `lessonBundleVersionDelete` | `app/src/access/versioning.ts:88` | `export const lessonBundleVersionDelete: Access = ({ req: { user } }) =>` |
| `canDeleteVersionDoc` | `app/src/access/versioning.ts:100` | `export const canDeleteVersionDoc = (` |
| `prose` | `app/src/fields/bundleFields.ts:36` | `export const prose = (` |
| `proseAdmin` | `app/src/fields/bundleFields.ts:56` | `export const proseAdmin = (name: string, label: string): TextareaField => ({` |
| `structureText` | `app/src/fields/bundleFields.ts:64` | `export const structureText = (name: string, label: string, description?: string): TextField => ({` |
| `worldwideIdField` | `app/src/fields/identity.ts:28` | `export const worldwideIdField = (read?: FieldAccess): TextField => ({` |
| `RELEASE_FINGERPRINT_CONTEXT` | `app/src/fields/identity.ts:45` | `export const RELEASE_FINGERPRINT_CONTEXT = 'aresReleaseFingerprint'` |
| `releaseFingerprintField` | `app/src/fields/identity.ts:52` | `export const releaseFingerprintField: TextField = {` |
| `RESET_INSTALLATION_ID_CONTEXT` | `app/src/fields/identity.ts:70` | `export const RESET_INSTALLATION_ID_CONTEXT = 'resetInstallationId'` |
| `installationIdField` | `app/src/fields/identity.ts:77` | `export const installationIdField: TextField = {` |
| `ARES_RELEASE_CONTEXT` | `app/src/fields/identity.ts:95` | `export const ARES_RELEASE_CONTEXT = 'aresLessonRelease'` |
| `aresReleaseField` | `app/src/fields/identity.ts:96` | `export const aresReleaseField = (name: 'aresReleaseId' / 'aresReleaseDate'): TextField => ({` |
| `collapseOnEntry` | `app/src/fields/lessonContent.ts:111` | `export const collapseOnEntry = (): Field => ({` |
| `structureCondition` | `app/src/fields/lessonContent.ts:123` | `export const structureCondition = (` |
| `lessonPlanDetailFields` | `app/src/fields/lessonContent.ts:186` | `export const lessonPlanDetailFields: Field[] = [` |
| `lessonEditableContentFields` | `app/src/fields/lessonContent.ts:272` | `export const lessonEditableContentFields: Field[] = [` |
| `lessonContentFields` | `app/src/fields/lessonContent.ts:492` | `export const lessonContentFields: Field[] = [` |
| `officialChangeFields` | `app/src/fields/officialChange.ts:19` | `export const officialChangeFields: Field[] = [` |
| `PHASE_VALUES` | `app/src/fields/phases.ts:11` | `export const PHASE_VALUES = [` |
| `PHASE_OPTIONS` | `app/src/fields/phases.ts:21` | `export const PHASE_OPTIONS = PHASE_VALUES.map((p) => ({ label: p, value: p }))` |
| `isPhase` | `app/src/fields/phases.ts:24` | `export const isPhase = (value: unknown): value is Phase =>` |
| `ADMIN_RESET_LINK_CONTEXT` | `app/src/hooks/authRateLimit.ts:74` | `export const ADMIN_RESET_LINK_CONTEXT = 'adminResetLink' as const` |
| `OPERATOR_RESET_LINK_CONTEXT` | `app/src/hooks/authRateLimit.ts:86` | `export const OPERATOR_RESET_LINK_CONTEXT = 'operatorResetLink' as const` |
| `withAdminResetLinkAllowance` | `app/src/hooks/authRateLimit.ts:101` | `export async function withAdminResetLinkAllowance<T>(` |
| `rateLimitAuthOperations` | `app/src/hooks/authRateLimit.ts:121` | `export const rateLimitAuthOperations: CollectionBeforeOperationHook = async ({` |
| `VERSION_EDITOR_KEYS` | `app/src/hooks/bundleVersion.ts:20` | `export const VERSION_EDITOR_KEYS = new Set([` |
| `enforceVersionFieldSplit` | `app/src/hooks/bundleVersion.ts:32` | `export const enforceVersionFieldSplit: CollectionBeforeChangeHook = ({` |
| `isOfficialVersion` | `app/src/hooks/bundleVersion.ts:51` | `export async function isOfficialVersion(` |
| `numberBundleVersionRows` | `app/src/hooks/bundleVersion.ts:66` | `export const numberBundleVersionRows: CollectionBeforeValidateHook = ({ data }) => {` |
| `enforceOfficialNotDeletable` | `app/src/hooks/bundleVersion.ts:88` | `export const enforceOfficialNotDeletable: CollectionBeforeDeleteHook = async ({ id, req }) => {` |
| `enforceVersionPlanConsistency` | `app/src/hooks/bundleVersion.ts:151` | `export const enforceVersionPlanConsistency: CollectionBeforeValidateHook = async ({` |
| `enforceBundleVersionGeneratable` | `app/src/hooks/bundleVersion.ts:184` | `export const enforceBundleVersionGeneratable: CollectionBeforeValidateHook = ({` |
| `stampTopicCreate` | `app/src/hooks/discussions.ts:112` | `export const stampTopicCreate: CollectionBeforeValidateHook = async ({ data, operation, req }) =>` |
| `joinTopicParticipants` | `app/src/hooks/discussions.ts:122` | `export const joinTopicParticipants: CollectionAfterChangeHook = async ({ doc, operation, req }) => {` |
| `cascadeDeleteThread` | `app/src/hooks/discussions.ts:158` | `export const cascadeDeleteThread: CollectionBeforeDeleteHook = async ({ id, req }) => {` |
| `stampReplyCreate` | `app/src/hooks/discussions.ts:168` | `export const stampReplyCreate: CollectionBeforeValidateHook = async ({ data, operation, req }) => {` |
| `orderReply` | `app/src/hooks/discussions.ts:209` | `export const orderReply: CollectionBeforeChangeHook = async ({ data, operation, req }) => {` |
| `joinReplyAuthor` | `app/src/hooks/discussions.ts:245` | `export const joinReplyAuthor: CollectionAfterChangeHook = async ({ data, doc, operation, req }) => {` |
| `rejectContentEdits` | `app/src/hooks/discussions.ts:283` | `export const rejectContentEdits =` |
| `TOPIC_CONTENT_FIELDS` | `app/src/hooks/discussions.ts:306` | `export const TOPIC_CONTENT_FIELDS = {` |
| `REPLY_CONTENT_FIELDS` | `app/src/hooks/discussions.ts:310` | `export const REPLY_CONTENT_FIELDS = {` |
| `META_IDENTITY_KEYS` | `app/src/hooks/fieldSplit.ts:112` | `export const META_IDENTITY_KEYS = ['subject', 'grade', 'substrand_id'] as const` |
| `LESSON_PROSE` | `app/src/hooks/fieldSplit.ts:114` | `export const LESSON_PROSE = ['title', 'overview', 'teacherReflection']` |
| `SLO_PROSE` | `app/src/hooks/fieldSplit.ts:115` | `export const SLO_PROSE = [` |
| `FRAMEWORK_PROSE` | `app/src/hooks/fieldSplit.ts:124` | `export const FRAMEWORK_PROSE = Object.keys(FRAMEWORK_PROSE_LABELS)` |
| `SUMMARY_PROMPT_PROSE` | `app/src/hooks/fieldSplit.ts:125` | `export const SUMMARY_PROMPT_PROSE = ['observed', 'learned', 'explained']` |
| `FINAL_EXPLANATION_PROSE` | `app/src/hooks/fieldSplit.ts:126` | `export const FINAL_EXPLANATION_PROSE = ['instructions']` |
| `SECTION_PROSE` | `app/src/hooks/fieldSplit.ts:127` | `export const SECTION_PROSE = ['prompt']` |
| `SUMMARY_LESSON_PROSE` | `app/src/hooks/fieldSplit.ts:141` | `export const SUMMARY_LESSON_PROSE = ['observed', 'learned', 'explained']` |
| `PROSE_LABELS` | `app/src/hooks/fieldSplit.ts:160` | `export const PROSE_LABELS: Record<string, string> = {` |
| `preserveLessonResourceLinks` | `app/src/hooks/fieldSplit.ts:240` | `export const preserveLessonResourceLinks = (data: Doc, originalDoc: Doc): void => {` |
| `applyEditorFieldSplit` | `app/src/hooks/fieldSplit.ts:270` | `export const applyEditorFieldSplit = ({` |
| `DELETING_LESSON_PLAN_IDS` | `app/src/hooks/lessonPlan.ts:28` | `export const DELETING_LESSON_PLAN_IDS = 'deletingLessonPlanIds'` |
| `enforcePlanSubjectGradeImmutable` | `app/src/hooks/lessonPlan.ts:66` | `export const enforcePlanSubjectGradeImmutable: CollectionBeforeValidateHook = ({` |
| `validateOfficialVersionPointer` | `app/src/hooks/lessonPlan.ts:87` | `export const validateOfficialVersionPointer: CollectionBeforeValidateHook = async ({` |
| `validatePublication` | `app/src/hooks/lessonPlan.ts:239` | `export const validatePublication: CollectionBeforeValidateHook = async ({` |
| `cascadeDeleteLessonPlanVersions` | `app/src/hooks/lessonPlan.ts:386` | `export const cascadeDeleteLessonPlanVersions: CollectionBeforeDeleteHook = async ({ id, req }) => {` |
| `prewarmOfficialArtifacts` | `app/src/hooks/lessonPlan.ts:410` | `export const prewarmOfficialArtifacts: CollectionAfterChangeHook = async ({` |
| `retargetFollowerFavorites` | `app/src/hooks/lessonPlan.ts:437` | `export const retargetFollowerFavorites: CollectionAfterChangeHook = async ({` |
| `equalizeLoginPasswordWork` | `app/src/hooks/loginPasswordWork.ts:14` | `export const equalizeLoginPasswordWork: CollectionBeforeOperationHook = async ({` |
| `validateContextLink` | `app/src/hooks/messageReference.ts:13` | `export const validateContextLink: CollectionBeforeValidateHook = async ({` |
| `refreshMutationAuthority` | `app/src/hooks/mutationAuthority.ts:19` | `export const refreshMutationAuthority: CollectionBeforeOperationHook = async ({` |
| `ADMIN_COUNT_LOCK` | `app/src/hooks/userRoles.ts:47` | `export const ADMIN_COUNT_LOCK = ADVISORY_LOCKS.adminCount // registered in `lib/txDb.ts`` |
| `refuseDisabledLogin` | `app/src/hooks/userRoles.ts:67` | `export const refuseDisabledLogin: CollectionBeforeLoginHook = ({ user }) => {` |
| `takeAdminCountLock` | `app/src/hooks/userRoles.ts:127` | `export async function takeAdminCountLock(` |
| `guardLastSiteAdmin` | `app/src/hooks/userRoles.ts:176` | `export const guardLastSiteAdmin: CollectionBeforeChangeHook = async ({` |
| `guardLastSiteAdminOnDelete` | `app/src/hooks/userRoles.ts:236` | `export const guardLastSiteAdminOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {` |
| `lockDeletingUser` | `app/src/hooks/userRoles.ts:272` | `export const lockDeletingUser: CollectionBeforeDeleteHook = async ({ id, req }) => {` |
| `grantSiteAdminToFirstUser` | `app/src/hooks/userRoles.ts:290` | `export const grantSiteAdminToFirstUser: CollectionBeforeChangeHook = async ({` |
| `guardPasswordChange` | `app/src/hooks/userRoles.ts:327` | `export const guardPasswordChange: CollectionBeforeChangeHook = ({` |
| `enforceAssignmentScope` | `app/src/hooks/userRoles.ts:354` | `export const enforceAssignmentScope: CollectionBeforeChangeHook = ({` |
| `stampAssignmentProvenance` | `app/src/hooks/userRoles.ts:497` | `export const stampAssignmentProvenance: CollectionBeforeChangeHook = ({` |
| `autoDemotePriorSubjectAdmins` | `app/src/hooks/userRoles.ts:540` | `export const autoDemotePriorSubjectAdmins: CollectionAfterChangeHook = async ({` |
| `resolveAccessScopes` | `app/src/lib/accessScopes.ts:30` | `export async function resolveAccessScopes(` |
| `scopeLines` | `app/src/lib/accessScopes.ts:54` | `export const scopeLines = ({ adminScopes, editingScopes }: AccessScopes): string[] => [` |
| `resolveAccessSummary` | `app/src/lib/accessScopes.ts:81` | `export async function resolveAccessSummary(` |
| `ADVANCED_ACTIONS` | `app/src/lib/advancedTools.ts:21` | `export const ADVANCED_ACTIONS = [` |
| `resolveMode` | `app/src/lib/advancedTools.ts:30` | `export const resolveMode = (` |
| `showsAction` | `app/src/lib/advancedTools.ts:35` | `export const showsAction = (mode: InterfaceMode, action: AdvancedAction): boolean =>` |
| `apiBaseFrom` | `app/src/lib/apiBase.ts:6` | `export const apiBaseFrom = (config: { serverURL?: string; routes?: { api?: string } }): string =>` |
| `releaseTagVersion` | `app/src/lib/appVersion.ts:2` | `export function releaseTagVersion(version: string / undefined): string / undefined {` |
| `appVersionLabel` | `app/src/lib/appVersion.ts:7` | `export function appVersionLabel(version: string / undefined): string {` |
| `aresReleaseLabel` | `app/src/lib/aresReleasePresentation.ts:12` | `export function aresReleaseLabel(version: Release): string / null {` |
| `releaseVersionLabel` | `app/src/lib/aresReleasePresentation.ts:18` | `export function releaseVersionLabel(version: LabelledVersion): string {` |
| `officialUpdateNotice` | `app/src/lib/aresReleasePresentation.ts:26` | `export function officialUpdateNotice(` |
| `newerReleaseSuggestion` | `app/src/lib/aresReleasePresentation.ts:45` | `export function newerReleaseSuggestion(` |
| `NO_ASSIGNMENTS` | `app/src/lib/assignmentCounts.ts:26` | `export const NO_ASSIGNMENTS: AssignmentCounts = { editors: 0, subjectAdmins: 0 }` |
| `assignmentCountsBySubjectGrade` | `app/src/lib/assignmentCounts.ts:51` | `export async function assignmentCountsBySubjectGrade(` |
| `deleteConsequences` | `app/src/lib/assignmentCounts.ts:113` | `export function deleteConsequences({` |
| `ASSIGNMENT_ROLES` | `app/src/lib/assignmentRoles.ts:18` | `export const ASSIGNMENT_ROLES = ['editor', 'subjectAdmin'] as const` |
| `assignmentAction` | `app/src/lib/assignmentRoles.ts:33` | `export const assignmentAction = (mode: 'assign' / 'unassign', role: AssignmentRole): string =>` |
| `countAwaitingApproval` | `app/src/lib/awaitingApproval.ts:14` | `export async function countAwaitingApproval(req: PayloadRequest): Promise<number> {` |
| `BACKUP_DESTINATIONS` | `app/src/lib/backupStatus.ts:49` | `export const BACKUP_DESTINATIONS: readonly BackupDestination[] = ['disk', 'usb', 'remote']` |
| `BACKUP_STREAMS` | `app/src/lib/backupStatus.ts:67` | `export const BACKUP_STREAMS = ['daily', 'weekly', 'monthly', 'premigrate'] as const` |
| `isIsoUtcSeconds` | `app/src/lib/backupStatus.ts:141` | `export const isIsoUtcSeconds = (value: unknown): value is string => {` |
| `isStreamRecord` | `app/src/lib/backupStatus.ts:182` | `export const isStreamRecord = (value: unknown): value is StreamRecord =>` |
| `isLegacyRecord` | `app/src/lib/backupStatus.ts:193` | `export const isLegacyRecord = (value: unknown): value is LegacyRecord =>` |
| `isRestoreJournal` | `app/src/lib/backupStatus.ts:231` | `export const isRestoreJournal = (value: unknown): value is RestoreJournal =>` |
| `parseAgreement` | `app/src/lib/backupStatus.ts:248` | `export function parseAgreement(raw: string / undefined): Agreement {` |
| `DEFAULT_DISK_DIR` | `app/src/lib/backupStatus.ts:281` | `export const DEFAULT_DISK_DIR = '/var/lib/lesson3-backups'` |
| `backupSettingsFromEnv` | `app/src/lib/backupStatus.ts:283` | `export const backupSettingsFromEnv = (): BackupSettings => ({` |
| `ago` | `app/src/lib/backupStatus.ts:319` | `export const ago = (iso: string, now: Date): string => `${age(iso, now)} ago`` |
| `isRemovableDestination` | `app/src/lib/backupStatus.ts:326` | `export const isRemovableDestination = (destination: string / undefined): boolean =>` |
| `deriveBackupStatus` | `app/src/lib/backupStatus.ts:349` | `export function deriveBackupStatus(input: BackupInputs): BackupStatus {` |
| `isLater` | `app/src/lib/backupStatus.ts:641` | `export function isLater(a: Attempt, b: Attempt): boolean {` |
| `collectBackupEvidence` | `app/src/lib/backupStatus.ts:808` | `export async function collectBackupEvidence(settings: BackupSettings) {` |
| `deriveDestinationBackupStatus` | `app/src/lib/backupStatus.ts:864` | `export function deriveDestinationBackupStatus(` |
| `collectBackupStatus` | `app/src/lib/backupStatus.ts:937` | `export async function collectBackupStatus(now = new Date()): Promise<BackupStatus> {` |
| `BACKUP_PATHS` | `app/src/lib/backupStatus.ts:946` | `export const BACKUP_PATHS = { BACKUP_RECORD_DIR, RESTORE_JOURNAL_FILE }` |
| `canonicalJson` | `app/src/lib/canonicalJson.ts:11` | `export const canonicalJson = (value: unknown): string => {` |
| `CLOCK_TOLERANCE_MS` | `app/src/lib/clockSkew.ts:10` | `export const CLOCK_TOLERANCE_MS = 60 * 60 * 1000` |
| `MAX_ROUND_TRIP_MS` | `app/src/lib/clockSkew.ts:19` | `export const MAX_ROUND_TRIP_MS = 30_000` |
| `readingUsable` | `app/src/lib/clockSkew.ts:22` | `export function readingUsable(sentMs: number, receivedMs: number): boolean {` |
| `clocksDisagree` | `app/src/lib/clockSkew.ts:27` | `export function clocksDisagree(` |
| `newestAncestor` | `app/src/lib/combine/ancestry.ts:11` | `export function newestAncestor<T extends { id: number; semver?: string / null; createdAt: string }>(` |
| `findCommonAncestor` | `app/src/lib/combine/ancestry.ts:24` | `export async function findCommonAncestor(` |
| `backfillLineages` | `app/src/lib/combine/backfill.ts:11` | `export function backfillLineages(rows: LineageRow[]): Map<number, number[]> {` |
| `rowsCorrespond` | `app/src/lib/combine/correspondence.ts:22` | `export const rowsCorrespond = (` |
| `createMergeBudget` | `app/src/lib/combine/diff3.ts:33` | `export const createMergeBudget = (): MergeBudget => ({ remaining: 2_000_000 })` |
| `merge3` | `app/src/lib/combine/diff3.ts:109` | `export const merge3 = (` |
| `MAX_COMBINE_CONTEXT_BYTES` | `app/src/lib/combine/draft.ts:5` | `export const MAX_COMBINE_CONTEXT_BYTES = 64 * 1024` |
| `conflictKey` | `app/src/lib/combine/draft.ts:6` | `export const conflictKey = (conflict: { key: string; field: string }): string =>` |
| `parseCombineContext` | `app/src/lib/combine/draft.ts:9` | `export function parseCombineContext(value: unknown): CombineContext / null {` |
| `withoutProse` | `app/src/lib/combine/engine.ts:126` | `export const withoutProse = (doc: Doc): Doc => {` |
| `planCombine` | `app/src/lib/combine/engine.ts:194` | `export function planCombine(input: { base: object / null; a: object; b: object }): CombinePlan {` |
| `MAX_LINEAGE` | `app/src/lib/combine/lineage.ts:5` | `export const MAX_LINEAGE = 2000` |
| `unionLineage` | `app/src/lib/combine/lineage.ts:8` | `export function unionLineage(parents: { id: number; lineage?: number[] / null }[]): number[] {` |
| `stampVersionLineage` | `app/src/lib/combine/lineage.ts:16` | `export const stampVersionLineage: CollectionBeforeChangeHook = async ({ data, operation, req }) => {` |
| `includedVersion` | `app/src/lib/combine/outcome.ts:7` | `export function includedVersion({` |
| `splitDocumentGroups` | `app/src/lib/compareGroups.ts:244` | `export function splitDocumentGroups(docLabel: string, html: string): LogicalGroup[] {` |
| `groupAnchorId` | `app/src/lib/compareGroups.ts:305` | `export const groupAnchorId = (doc: string, key: string): string =>` |
| `changeSummary` | `app/src/lib/compareGroups.ts:317` | `export function changeSummary(` |
| `mergeGroupKeys` | `app/src/lib/compareGroups.ts:339` | `export function mergeGroupKeys(fromKeys: readonly string[], toKeys: readonly string[]): string[] {` |
| `runWithConversionSlot` | `app/src/lib/conversionLimit.ts:32` | `export async function runWithConversionSlot<T>(fn: () => Promise<T>): Promise<T / null> {` |
| `newSubmissionKey` | `app/src/lib/discussionComposer.ts:34` | `export function newSubmissionKey(): string {` |
| `initialComposerState` | `app/src/lib/discussionComposer.ts:56` | `export const initialComposerState = (key: string = newSubmissionKey()): ComposerState => ({` |
| `fieldsLocked` | `app/src/lib/discussionComposer.ts:64` | `export const fieldsLocked = (state: ComposerState): boolean => state.phase !== 'editing'` |
| `composerReducer` | `app/src/lib/discussionComposer.ts:70` | `export function composerReducer(` |
| `classifyCreateStatus` | `app/src/lib/discussionComposer.ts:103` | `export function classifyCreateStatus(` |
| `UNCERTAIN_MESSAGE` | `app/src/lib/discussionComposer.ts:113` | `export const UNCERTAIN_MESSAGE =` |
| `SESSION_MESSAGE` | `app/src/lib/discussionComposer.ts:119` | `export const SESSION_MESSAGE =` |
| `requireForum` | `app/src/lib/discussionPages.ts:37` | `export async function requireForum(payload: Payload, moderator?: User): Promise<boolean> {` |
| `listTopics` | `app/src/lib/discussionPages.ts:137` | `export async function listTopics(` |
| `searchTopics` | `app/src/lib/discussionPages.ts:178` | `export async function searchTopics(` |
| `listPageParam` | `app/src/lib/discussionPages.ts:195` | `export const listPageParam = (raw: string / undefined): number => pageNumberParam(raw) ?? 1` |
| `loadThread` | `app/src/lib/discussionPages.ts:229` | `export async function loadThread(` |
| `REPLY_PAGE_SIZE` | `app/src/lib/discussionPaging.ts:11` | `export const REPLY_PAGE_SIZE = 50` |
| `pageOfSeq` | `app/src/lib/discussionPaging.ts:14` | `export const pageOfSeq = (seq: number): number => Math.max(1, Math.ceil(seq / REPLY_PAGE_SIZE))` |
| `replyPageCount` | `app/src/lib/discussionPaging.ts:17` | `export const replyPageCount = (lastSeq: number): number => pageOfSeq(lastSeq)` |
| `pageNumberParam` | `app/src/lib/discussionPaging.ts:20` | `export const pageNumberParam = (raw: string / undefined): number / null =>` |
| `entryPage` | `app/src/lib/discussionPaging.ts:32` | `export const entryPage = (lastReadSeq: number / null, lastSeq: number): number =>` |
| `parsePage` | `app/src/lib/discussionPaging.ts:38` | `export function parsePage(raw: string / undefined, lastSeq: number): number / null {` |
| `replySeqsOn` | `app/src/lib/discussionPaging.ts:44` | `export function replySeqsOn(page: number, lastSeq: number): { first: number; last: number } / null {` |
| `markRangeFor` | `app/src/lib/discussionPaging.ts:58` | `export function markRangeFor(` |
| `postAnchor` | `app/src/lib/discussionPaging.ts:68` | `export const postAnchor = (seq: number): string => (seq === 0 ? 'post-0' : `reply-${seq}`)` |
| `postHref` | `app/src/lib/discussionPaging.ts:71` | `export const postHref = (topicId: number, seq: number): string =>` |
| `MAX_TITLE_LENGTH` | `app/src/lib/discussionText.ts:10` | `export const MAX_TITLE_LENGTH = 150` |
| `MAX_BODY_LENGTH` | `app/src/lib/discussionText.ts:11` | `export const MAX_BODY_LENGTH = 5000` |
| `escapeLike` | `app/src/lib/discussionText.ts:14` | `export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`)` |
| `MAX_SEARCH_LENGTH` | `app/src/lib/discussionText.ts:17` | `export const MAX_SEARCH_LENGTH = 200` |
| `likeAllWords` | `app/src/lib/discussionText.ts:25` | `export function likeAllWords(query: string): string / null {` |
| `linkify` | `app/src/lib/discussionText.ts:72` | `export function linkify(line: string): TextSegment[] {` |
| `paragraphsOf` | `app/src/lib/discussionText.ts:89` | `export const paragraphsOf = (text: string): string[] =>` |
| `forumPosting` | `app/src/lib/discussions.ts:39` | `export const forumPosting: Access = async ({ req }) =>` |
| `forumReading` | `app/src/lib/discussions.ts:47` | `export const forumReading: Access = async ({ req }) => {` |
| `ownParticipation` | `app/src/lib/discussions.ts:57` | `export const ownParticipation: Access = async ({ req }) => {` |
| `requireSubmissionKey` | `app/src/lib/discussions.ts:71` | `export function requireSubmissionKey(value: unknown): string {` |
| `requireJoinedAtSeq` | `app/src/lib/discussions.ts:83` | `export function requireJoinedAtSeq(value: unknown): number {` |
| `createdText` | `app/src/lib/discussions.ts:98` | `export const createdText =` |
| `serverWritten` | `app/src/lib/discussions.ts:115` | `export const serverWritten = { create: systemOnly }` |
| `postFields` | `app/src/lib/discussions.ts:122` | `export const postFields = (): Field[] => [` |
| `insertParticipation` | `app/src/lib/discussions.ts:181` | `export async function insertParticipation(` |
| `advanceReadMarker` | `app/src/lib/discussions.ts:224` | `export async function advanceReadMarker(` |
| `hasUnread` | `app/src/lib/discussions.ts:285` | `export async function hasUnread(payload: Payload, userId: number): Promise<boolean> {` |
| `unreadTopicIds` | `app/src/lib/discussions.ts:301` | `export async function unreadTopicIds(` |
| `titleSearchWhere` | `app/src/lib/discussions.ts:319` | `export function titleSearchWhere(query: string): Where / null {` |
| `TOPIC_PAGE_SIZE` | `app/src/lib/discussions.ts:325` | `export const TOPIC_PAGE_SIZE = 20` |
| `searchTopicTitles` | `app/src/lib/discussions.ts:333` | `export async function searchTopicTitles(` |
| `displayTitle` | `app/src/lib/displayTitle.ts:9` | `export function displayTitle(title: string): string {` |
| `findDraftCombineSuggestion` | `app/src/lib/editRecovery/draftCombineSuggestion.ts:12` | `export async function findDraftCombineSuggestion(` |
| `MAX_ACTIVE_CAPTURES` | `app/src/lib/editRecovery/kernel.ts:98` | `export const MAX_ACTIVE_CAPTURES = 20` |
| `start` | `app/src/lib/editRecovery/kernel.ts:108` | `export const start = async (` |
| `MAX_CAPTURE_BYTES` | `app/src/lib/editRecovery/kernel.ts:190` | `export const MAX_CAPTURE_BYTES = 512 * 1024` |
| `capture` | `app/src/lib/editRecovery/kernel.ts:234` | `export const capture = async (` |
| `retire` | `app/src/lib/editRecovery/kernel.ts:332` | `export const retire = async (` |
| `EXPIRY_BATCH_LIMIT` | `app/src/lib/editRecovery/kernel.ts:380` | `export const EXPIRY_BATCH_LIMIT = 500` |
| `selectExpiredCaptures` | `app/src/lib/editRecovery/kernel.ts:428` | `export const selectExpiredCaptures = async (` |
| `retireSelected` | `app/src/lib/editRecovery/kernel.ts:458` | `export const retireSelected = async (` |
| `expireCaptures` | `app/src/lib/editRecovery/kernel.ts:489` | `export const expireCaptures = async (` |
| `readActiveCapture` | `app/src/lib/editRecovery/kernel.ts:516` | `export const readActiveCapture = async (` |
| `readCaptureMetadata` | `app/src/lib/editRecovery/kernel.ts:578` | `export const readCaptureMetadata = async (` |
| `listOwnCaptures` | `app/src/lib/editRecovery/kernel.ts:631` | `export const listOwnCaptures = async (` |
| `countUnsavedWorkOnVersion` | `app/src/lib/editRecovery/kernel.ts:666` | `export const countUnsavedWorkOnVersion = async (` |
| `hasUnsavedWork` | `app/src/lib/editRecovery/kernel.ts:692` | `export const hasUnsavedWork = async (` |
| `FINAL_EXPLANATION_KEY` | `app/src/lib/editRecovery/projection.ts:79` | `export const FINAL_EXPLANATION_KEY = 'finalExplanation'` |
| `asRows` | `app/src/lib/editRecovery/projection.ts:82` | `export const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])` |
| `asDoc` | `app/src/lib/editRecovery/projection.ts:84` | `export const asDoc = (v: unknown): Doc / undefined =>` |
| `parseKey` | `app/src/lib/editRecovery/projection.ts:108` | `export const parseKey = (key: string): { scope: string; rowId: string / null } => {` |
| `proseText` | `app/src/lib/editRecovery/projection.ts:122` | `export const proseText = (v: ProseValue / undefined): string => v ?? ''` |
| `normaliseProseValue` | `app/src/lib/editRecovery/projection.ts:155` | `export const normaliseProseValue = (v: ProseValue): ProseValue =>` |
| `projectCapture` | `app/src/lib/editRecovery/projection.ts:180` | `export const projectCapture = (doc: Doc / undefined / null): CaptureMap => {` |
| `captureAnchors` | `app/src/lib/editRecovery/projection.ts:229` | `export const captureAnchors = (doc: Doc / undefined / null): { key: string; heading: string }[] => {` |
| `orphanHeading` | `app/src/lib/editRecovery/projection.ts:275` | `export const orphanHeading = (scope: string): string =>` |
| `captureDiff` | `app/src/lib/editRecovery/projection.ts:348` | `export const captureDiff = (saved: CaptureMap, capture: CaptureMap): CaptureDiff => {` |
| `applyCapture` | `app/src/lib/editRecovery/projection.ts:392` | `export const applyCapture = (` |
| `captureFieldPath` | `app/src/lib/editRecovery/projection.ts:458` | `export function captureFieldPath(doc: Doc, key: string, field: string): string / null {` |
| `CAPTURE_SCHEMA_VERSION` | `app/src/lib/editRecovery/provenance.ts:10` | `export const CAPTURE_SCHEMA_VERSION = 'v1'` |
| `captureProvenance` | `app/src/lib/editRecovery/provenance.ts:16` | `export const captureProvenance = (` |
| `CAPTURE_TTL_DAYS` | `app/src/lib/editRecovery/ttl.ts:9` | `export const CAPTURE_TTL_DAYS = 30` |
| `captureKeptUntil` | `app/src/lib/editRecovery/ttl.ts:21` | `export const captureKeptUntil = (capturedAt: Date / string / number): Date =>` |
| `captureExpiryCutoff` | `app/src/lib/editRecovery/ttl.ts:25` | `export const captureExpiryCutoff = (now: number = Date.now()): Date =>` |
| `listUnsavedWork` | `app/src/lib/editRecovery/unsavedWork.ts:46` | `export async function listUnsavedWork(req: PayloadRequest, user: User): Promise<UnsavedWorkRow[]> {` |
| `MOBILE_EDIT_MAX_WIDTH` | `app/src/lib/editingViewport.ts:15` | `export const MOBILE_EDIT_MAX_WIDTH = 640` |
| `editingAvailableAtWidth` | `app/src/lib/editingViewport.ts:22` | `export function editingAvailableAtWidth(width: number): boolean {` |
| `EDITING_WIDER_SCREEN_TITLE` | `app/src/lib/editingViewport.ts:43` | `export const EDITING_WIDER_SCREEN_TITLE = 'Editing needs a wider screen'` |
| `EDITING_WIDER_SCREEN_BODY` | `app/src/lib/editingViewport.ts:45` | `export const EDITING_WIDER_SCREEN_BODY =` |
| `buildRolesAccess` | `app/src/lib/editorGroups.ts:103` | `export async function buildRolesAccess({` |
| `parseRecipientEmail` | `app/src/lib/emailAddress.ts:23` | `export function parseRecipientEmail(raw: unknown): string / null {` |
| `sanitizeEmailHeaderText` | `app/src/lib/emailAddress.ts:40` | `export function sanitizeEmailHeaderText(raw: unknown): string {` |
| `emailLinkBase` | `app/src/lib/emailLinkBase.ts:9` | `export const emailLinkBase = (): string => process.env.ADMIN_URL // process.env.SERVER_URL // ''` |
| `enqueueDetached` | `app/src/lib/enqueue.ts:45` | `export async function enqueueDetached<TSlug extends keyof TypedJobs['tasks']>(` |
| `positiveIntEnv` | `app/src/lib/env.ts:12` | `export const positiveIntEnv = (name: string, fallback: number): number => {` |
| `errorTrackingEnabled` | `app/src/lib/errorTracking.ts:26` | `export const errorTrackingEnabled = (): boolean => Boolean(process.env.SENTRY_DSN)` |
| `initErrorTracking` | `app/src/lib/errorTracking.ts:28` | `export function initErrorTracking(): void {` |
| `captureException` | `app/src/lib/errorTracking.ts:39` | `export function captureException(err: unknown, context?: Record<string, unknown>): void {` |
| `escapeHtml` | `app/src/lib/escapeHtml.ts:19` | `export const escapeHtml = (text: string): string =>` |
| `hasRegisteredUsers` | `app/src/lib/firstUserBootstrap.ts:10` | `export async function hasRegisteredUsers(payload: Payload, req?: PayloadRequest): Promise<boolean> {` |
| `isFirstRegisterRequest` | `app/src/lib/firstUserBootstrap.ts:22` | `export const isFirstRegisterRequest = (req: Pick<PayloadRequest, 'pathname'>): boolean =>` |
| `suppressFirstUserVerificationEmail` | `app/src/lib/firstUserBootstrap.ts:35` | `export const suppressFirstUserVerificationEmail: CollectionBeforeOperationHook = ({` |
| `formatDay` | `app/src/lib/formatDate.ts:11` | `export const formatDay = (date: Date / string / number): string => dayFmt.format(new Date(date))` |
| `formatCalendarDay` | `app/src/lib/formatDate.ts:17` | `export function formatCalendarDay(value: string / null / undefined): string / null {` |
| `FRAMEWORK_PROSE_LABELS` | `app/src/lib/frameworkProse.ts:2` | `export const FRAMEWORK_PROSE_LABELS = {` |
| `LINKABLE_FIELD_LIST` | `app/src/lib/frameworkProse.ts:10` | `export const LINKABLE_FIELD_LIST = `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`` |
| `MIN_GRADE` | `app/src/lib/gradeLevels.ts:2` | `export const MIN_GRADE = 1` |
| `MAX_GRADE` | `app/src/lib/gradeLevels.ts:3` | `export const MAX_GRADE = 12` |
| `GRADE_LEVELS` | `app/src/lib/gradeLevels.ts:4` | `export const GRADE_LEVELS = Array.from(` |
| `isGradeLevel` | `app/src/lib/gradeLevels.ts:9` | `export const isGradeLevel = (value: unknown): value is number =>` |
| `readInstallationId` | `app/src/lib/identity/installationId.ts:15` | `export async function readInstallationId(payload: Payload): Promise<string / null> {` |
| `resetInstallationId` | `app/src/lib/identity/installationId.ts:30` | `export async function resetInstallationId(` |
| `RELEASE_FINGERPRINT_FORMAT` | `app/src/lib/identity/releaseFingerprint.ts:29` | `export const RELEASE_FINGERPRINT_FORMAT = 'ares-content-v1'` |
| `releaseFingerprintInput` | `app/src/lib/identity/releaseFingerprint.ts:84` | `export function releaseFingerprintInput(bundle: Record<string, unknown>): string {` |
| `releaseFingerprint` | `app/src/lib/identity/releaseFingerprint.ts:101` | `export function releaseFingerprint(bundle: Record<string, unknown>): string {` |
| `initials` | `app/src/lib/initials.ts:5` | `export function initials(nameOrEmail: string): string {` |
| `slugId` | `app/src/lib/lessonAnchors.ts:31` | `export const slugId = (s: string): string =>` |
| `docSectionId` | `app/src/lib/lessonAnchors.ts:38` | `export const docSectionId = (label: string): string => `doc-${slugId(label)}`` |
| `annotateLessonAnchors` | `app/src/lib/lessonAnchors.ts:56` | `export function annotateLessonAnchors(html: string): { html: string; anchors: LessonAnchor[] } {` |
| `LESSON_SEQUENCE_LABEL` | `app/src/lib/lessonAnchors.ts:76` | `export const LESSON_SEQUENCE_LABEL = 'Lesson Sequence'` |
| `FINAL_EXPLANATION_LABEL` | `app/src/lib/lessonAnchors.ts:77` | `export const FINAL_EXPLANATION_LABEL = 'Final Explanation'` |
| `SUMMARY_TABLE_LABEL` | `app/src/lib/lessonAnchors.ts:78` | `export const SUMMARY_TABLE_LABEL = 'Summary Table'` |
| `annotateSections` | `app/src/lib/lessonAnchors.ts:90` | `export function annotateSections(sections: { label: string; html: string }[]): AnnotatedSection[] {` |
| `docNavItems` | `app/src/lib/lessonAnchors.ts:110` | `export function docNavItems(sections: AnnotatedSection[]): DocNavItem[] {` |
| `readLessonDetails` | `app/src/lib/lessonDetails.ts:8` | `export async function readLessonDetails(` |
| `versionReferenceLabel` | `app/src/lib/lessonReference.ts:12` | `export const versionReferenceLabel = (version: {` |
| `clientKey` | `app/src/lib/loginProtection.ts:18` | `export function clientKey(address: string): string {` |
| `loginClient` | `app/src/lib/loginProtection.ts:36` | `export function loginClient(req: PayloadRequest, target: string): string {` |
| `withLoginCapacity` | `app/src/lib/loginProtection.ts:50` | `export async function withLoginCapacity<T>(` |
| `MAX_MESSAGE_LENGTH` | `app/src/lib/messageText.ts:5` | `export const MAX_MESSAGE_LENGTH = 5000` |
| `recoverOfflineSiteAdmin` | `app/src/lib/offlineAdminRecovery.ts:18` | `export async function recoverOfflineSiteAdmin(` |
| `findPersonalFavorites` | `app/src/lib/personalFavorites.ts:6` | `export function findPersonalFavorites(` |
| `versionActions` | `app/src/lib/personalVersions.ts:57` | `export function versionActions(` |
| `listPersonalVersions` | `app/src/lib/personalVersions.ts:83` | `export async function listPersonalVersions(` |
| `planCount` | `app/src/lib/planSelection.ts:28` | `export const planCount = (n: number): string => `${n} lesson plan${n === 1 ? '' : 's'}`` |
| `strandIds` | `app/src/lib/planSelection.ts:31` | `export const strandIds = (strand: StrandGroup<SelectableRow>): number[] =>` |
| `subjectGradeIds` | `app/src/lib/planSelection.ts:35` | `export const subjectGradeIds = (sg: SubjectGradeGroup<SelectableRow>): number[] =>` |
| `groupState` | `app/src/lib/planSelection.ts:40` | `export function groupState(ids: readonly number[], selected: ReadonlySet<number>): GroupState {` |
| `toggleGroup` | `app/src/lib/planSelection.ts:54` | `export function toggleGroup(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {` |
| `hiddenSelectedCount` | `app/src/lib/planSelection.ts:65` | `export function hiddenSelectedCount(` |
| `deleteScope` | `app/src/lib/planSelection.ts:98` | `export function deleteScope(` |
| `deleteScopeSentence` | `app/src/lib/planSelection.ts:119` | `export function deleteScopeSentence({ count, label }: DeleteScope): string {` |
| `plural` | `app/src/lib/plural.ts:11` | `export const plural = (count: number, one: string): string =>` |
| `tokenizeParenthesizedUrls` | `app/src/lib/proseLinkTokens.ts:14` | `export function tokenizeParenthesizedUrls(text: string): LinkToken[] {` |
| `hasParenthesizedUrl` | `app/src/lib/proseLinkTokens.ts:43` | `export const hasParenthesizedUrl = (text: string): boolean =>` |
| `isPublicLibraryEnabled` | `app/src/lib/publicLibrary.ts:34` | `export const isPublicLibraryEnabled = (): boolean => process.env.PUBLIC_LIBRARY_ENABLED === '1'` |
| `isPubliclyVisible` | `app/src/lib/publicLibrary.ts:64` | `export const isPubliclyVisible = (visibility: unknown): boolean =>` |
| `requirePublicLibrary` | `app/src/lib/publicLibrary.ts:86` | `export function requirePublicLibrary(): void {` |
| `publicLibraryBootRefusal` | `app/src/lib/publicLibrary.ts:90` | `export function publicLibraryBootRefusal(opts: {` |
| `resolvePublicPlanBySlug` | `app/src/lib/publicPlan.ts:55` | `export async function resolvePublicPlanBySlug(` |
| `isHttpsServerUrl` | `app/src/lib/publicPosture.ts:24` | `export const isHttpsServerUrl = (serverUrl: string / undefined): boolean =>` |
| `isUndefinedTableError` | `app/src/lib/publicPosture.ts:33` | `export function isUndefinedTableError(error: unknown): boolean {` |
| `firstUserBootRefusal` | `app/src/lib/publicPosture.ts:50` | `export function firstUserBootRefusal(opts: {` |
| `MIN_PUBLIC_SLUG_LENGTH` | `app/src/lib/publicSlug.ts:21` | `export const MIN_PUBLIC_SLUG_LENGTH = 3` |
| `MAX_PUBLIC_SLUG_LENGTH` | `app/src/lib/publicSlug.ts:22` | `export const MAX_PUBLIC_SLUG_LENGTH = 80` |
| `normalisePublicSlug` | `app/src/lib/publicSlug.ts:35` | `export function normalisePublicSlug(raw: string): string {` |
| `isValidPublicSlug` | `app/src/lib/publicSlug.ts:53` | `export function isValidPublicSlug(slug: string): boolean {` |
| `derivePublicSlug` | `app/src/lib/publicSlug.ts:71` | `export function derivePublicSlug(parts: {` |
| `suffixedPublicSlug` | `app/src/lib/publicSlug.ts:97` | `export function suffixedPublicSlug(base: string, attempt: number): string {` |
| `consumeRateLimit` | `app/src/lib/rateLimit.ts:230` | `export async function consumeRateLimit(` |
| `enforceUserRateLimit` | `app/src/lib/rateLimit.ts:245` | `export async function enforceUserRateLimit(` |
| `enforceSharedRateLimit` | `app/src/lib/rateLimit.ts:268` | `export async function enforceSharedRateLimit(` |
| `nullOnNotVisible` | `app/src/lib/readBundle.ts:21` | `export function nullOnNotVisible(e: unknown): null {` |
| `findReadablePlan` | `app/src/lib/readBundle.ts:31` | `export async function findReadablePlan(` |
| `findReadableVersions` | `app/src/lib/readBundle.ts:76` | `export async function findReadableVersions(` |
| `findReadableVersionChoices` | `app/src/lib/readBundle.ts:100` | `export async function findReadableVersionChoices(` |
| `findReadableVersion` | `app/src/lib/readBundle.ts:146` | `export async function findReadableVersion(` |
| `findReadableVersion` | `app/src/lib/readBundle.ts:150` | `export async function findReadableVersion<` |
| `findReadableVersion` | `app/src/lib/readBundle.ts:156` | `export async function findReadableVersion(` |
| `relId` | `app/src/lib/relId.ts:32` | `export const relId = (value: unknown): number / null => {` |
| `distinctIds` | `app/src/lib/relId.ts:47` | `export const distinctIds = (ids: (number / null)[]): number[] => [` |
| `startRenderTimings` | `app/src/lib/renderTimings.ts:41` | `export function startRenderTimings(route: string): RenderTimings {` |
| `resolveRequestedVersion` | `app/src/lib/requestedVersion.ts:31` | `export function resolveRequestedVersion<V extends { id: number }>(` |
| `resolveVersionReferences` | `app/src/lib/resolveLessonReferences.ts:17` | `export async function resolveVersionReferences(` |
| `sanitizePreviewHtml` | `app/src/lib/sanitizeHtml.ts:63` | `export function sanitizePreviewHtml(html: string): string {` |
| `schoolPageMetadata` | `app/src/lib/schoolMetadata.ts:6` | `export async function schoolPageMetadata(fallback = 'ARES Lesson Plans') {` |
| `MAX_SCHOOL_NAME_LENGTH` | `app/src/lib/schoolName.ts:6` | `export const MAX_SCHOOL_NAME_LENGTH = 80` |
| `parseSchoolName` | `app/src/lib/schoolName.ts:9` | `export function parseSchoolName(value: unknown): string {` |
| `bumpSemver` | `app/src/lib/semver.ts:7` | `export const bumpSemver = (` |
| `compareSemver` | `app/src/lib/semver.ts:28` | `export const compareSemver = (a: string, b: string): number => {` |
| `isSemverConflict` | `app/src/lib/semver.ts:44` | `export function isSemverConflict(e: unknown): boolean {` |
| `nextSemverForPlan` | `app/src/lib/semver.ts:61` | `export async function nextSemverForPlan(` |
| `nextMajorForPlan` | `app/src/lib/semver.ts:75` | `export async function nextMajorForPlan(` |
| `nextSemverFrom` | `app/src/lib/semver.ts:107` | `export function nextSemverFrom(` |
| `FORM_STATE_MULTIPLIER` | `app/src/lib/serverActionBodyLimit.ts:67` | `export const FORM_STATE_MULTIPLIER = 2.57` |
| `SERVER_ACTION_BODY_LIMIT` | `app/src/lib/serverActionBodyLimit.ts:82` | `export const SERVER_ACTION_BODY_LIMIT = `${LIMIT_MIB}mb`` |
| `SERVER_ACTION_BODY_LIMIT_BYTES` | `app/src/lib/serverActionBodyLimit.ts:85` | `export const SERVER_ACTION_BODY_LIMIT_BYTES = LIMIT_MIB * 1024 * 1024` |
| `getSession` | `app/src/lib/session.ts:19` | `export const getSession = cache(async (): Promise<{ payload: Payload; user: User / null }> => {` |
| `requireUser` | `app/src/lib/session.ts:26` | `export async function requireUser(): Promise<{ payload: Payload; user: User }> {` |
| `setSchoolName` | `app/src/lib/setSchoolName.ts:12` | `export async function setSchoolName(payload: Payload, schoolName: string): Promise<void> {` |
| `stripIds` | `app/src/lib/stripIds.ts:6` | `export const stripIds = (value: unknown): unknown => {` |
| `subjectGradeLabel` | `app/src/lib/substrand.ts:15` | `export const subjectGradeLabel = (subjectName: string, grade: number): string =>` |
| `compareSubstrandId` | `app/src/lib/substrand.ts:87` | `export function compareSubstrandId(a: string, b: string): number {` |
| `strandNumberOf` | `app/src/lib/substrand.ts:106` | `export function strandNumberOf(substrandId: string): number / null {` |
| `cleanStrandName` | `app/src/lib/substrand.ts:123` | `export function cleanStrandName(raw: string / null): string {` |
| `curriculumContextLabel` | `app/src/lib/substrand.ts:142` | `export function curriculumContextLabel(row: CurriculumRow): string {` |
| `stripSubjectGradePrefix` | `app/src/lib/substrand.ts:153` | `export function stripSubjectGradePrefix(title: string / null / undefined): string {` |
| `lessonDisplayName` | `app/src/lib/substrand.ts:164` | `export function lessonDisplayName(` |
| `groupLessons` | `app/src/lib/substrand.ts:186` | `export function groupLessons<T extends CurriculumRow>(rows: readonly T[]): SubjectGradeGroup<T>[] {` |
| `orderLessons` | `app/src/lib/substrand.ts:240` | `export function orderLessons<T extends CurriculumRow>(rows: readonly T[]): T[] {` |
| `bundleSearchText` | `app/src/lib/substrand.ts:245` | `export function bundleSearchText(r: CurriculumRow): string {` |
| `tokenise` | `app/src/lib/substrand.ts:266` | `export const tokenise = (query: string): string[] =>` |
| `matchesTokenAnd` | `app/src/lib/substrand.ts:278` | `export function matchesTokenAnd(text: string, tokens: readonly string[]): boolean {` |
| `matchesQuery` | `app/src/lib/substrand.ts:289` | `export function matchesQuery(r: CurriculumRow, query: string): boolean {` |
| `filterRows` | `app/src/lib/substrand.ts:298` | `export function filterRows<T extends CurriculumRow>(` |
| `mb` | `app/src/lib/systemFacts.ts:204` | `export const mb = (bytes: number): string => {` |
| `collectSystemFacts` | `app/src/lib/systemFacts.ts:216` | `export async function collectSystemFacts(): Promise<SystemFact[]> {` |
| `SYSTEM_FLAGS` | `app/src/lib/systemFlagNames.ts:12` | `export const SYSTEM_FLAGS = ['publicLibraryLive', 'forumEnabled', 'advancedTools'] as const` |
| `SAVEABLE_FLAGS` | `app/src/lib/systemFlagNames.ts:23` | `export const SAVEABLE_FLAGS = [` |
| `readSystemSettings` | `app/src/lib/systemFlags.ts:64` | `export async function readSystemSettings(` |
| `readSystemFlags` | `app/src/lib/systemFlags.ts:98` | `export const readSystemFlags = async (` |
| `systemFlagsFor` | `app/src/lib/systemFlags.ts:112` | `export function systemFlagsFor(req: PayloadRequest): Promise<SystemFlags> {` |
| `isForumEnabled` | `app/src/lib/systemFlags.ts:119` | `export const isForumEnabled = async (req: PayloadRequest): Promise<boolean> =>` |
| `systemSettingsForRender` | `app/src/lib/systemFlags.ts:132` | `export const systemSettingsForRender = cache((payload: Payload): Promise<RenderSettings> =>` |
| `systemFlagsForRender` | `app/src/lib/systemFlags.ts:137` | `export const systemFlagsForRender = async (payload: Payload): Promise<SystemFlags> =>` |
| `schoolNameForRender` | `app/src/lib/systemFlags.ts:141` | `export const schoolNameForRender = async (payload: Payload): Promise<string / null> =>` |
| `txDb` | `app/src/lib/txDb.ts:50` | `export const txDb = async (` |
| `poolDb` | `app/src/lib/txDb.ts:91` | `export const poolDb = (payload: { db: unknown }): DrizzleHandle =>` |
| `lockRows` | `app/src/lib/txDb.ts:142` | `export async function lockRows(` |
| `sqlIdList` | `app/src/lib/txDb.ts:166` | `export const sqlIdList = (ids: ReadonlyArray<number>) =>` |
| `lockUserForReference` | `app/src/lib/txDb.ts:182` | `export async function lockUserForReference(source: TxSource, userId: number): Promise<boolean> {` |
| `ADVISORY_LOCKS` | `app/src/lib/txDb.ts:202` | `export const ADVISORY_LOCKS = {` |
| `takeAdvisoryLock` | `app/src/lib/txDb.ts:223` | `export async function takeAdvisoryLock(source: TxSource, name: AdvisoryLockName): Promise<void> {` |
| `assertFresh` | `app/src/lib/txDb.ts:238` | `export function assertFresh(` |
| `rowsOf` | `app/src/lib/txDb.ts:253` | `export const rowsOf = (result: unknown): Record<string, unknown>[] => {` |
| `toPositiveInt` | `app/src/lib/txDb.ts:271` | `export const toPositiveInt = (v: unknown): number => {` |
| `lockAndVerifyFresh` | `app/src/lib/txDb.ts:302` | `export async function lockAndVerifyFresh<T extends { updatedAt?: unknown }>(` |
| `USER_SEARCH_TYPES` | `app/src/lib/userSearchContract.ts:14` | `export const USER_SEARCH_TYPES = ['siteAdmin', 'subjectAdmin', 'teacher'] as const` |
| `USER_SEARCH_STATUSES` | `app/src/lib/userSearchContract.ts:22` | `export const USER_SEARCH_STATUSES = ['awaiting'] as const` |
| `USER_SEARCH_TYPE_LABELS` | `app/src/lib/userSearchContract.ts:31` | `export const USER_SEARCH_TYPE_LABELS: Record<UserSearchType, UserTypeLabel> = {` |
| `grantRoleLabel` | `app/src/lib/userSearchContract.ts:46` | `export const grantRoleLabel = (role: UserSearchGrant['role']): string =>` |
| `DROP_KEYS` | `app/src/lib/versionContent.ts:14` | `export const DROP_KEYS = new Set([` |
| `contentOf` | `app/src/lib/versionContent.ts:38` | `export const contentOf = (doc: Record<string, unknown>): Record<string, unknown> =>` |
| `comparableContent` | `app/src/lib/versionContent.ts:44` | `export const comparableContent = (doc: Record<string, unknown>): string =>` |
| `versionCountsByPlan` | `app/src/lib/versionCounts.ts:11` | `export async function versionCountsByPlan(payload: Payload): Promise<Map<number, number>> {` |
| `sortVersionsOfficialFirst` | `app/src/lib/versionsOrder.ts:8` | `export function sortVersionsOfficialFirst<` |
| `welcomeDismissedKey` | `app/src/lib/welcomeDismissal.ts:9` | `export const welcomeDismissedKey = (userId: number / string): string =>` |
| `userDisplayName` | `app/src/lib/widgetUser.ts:38` | `export const userDisplayName = (u: { id: number; name?: string / null }): string =>` |
| `personLabel` | `app/src/lib/widgetUser.ts:52` | `export const personLabel = (u: WidgetUser): string => (u.email ? `${u.name} — ${u.email}` : u.name)` |
| `toWidgetUser` | `app/src/lib/widgetUser.ts:71` | `export function toWidgetUser(user: {` |
| `wireErrorMessage` | `app/src/lib/wireError.ts:18` | `export async function wireErrorMessage(response: Response, fallback: string): Promise<string> {` |
| `DOCUMENT_LOCKED_MESSAGE` | `app/src/lib/wireError.ts:32` | `export const DOCUMENT_LOCKED_MESSAGE =` |
| `documentLockedMessage` | `app/src/lib/wireError.ts:36` | `export const documentLockedMessage = (response: Response): string / null =>` |
