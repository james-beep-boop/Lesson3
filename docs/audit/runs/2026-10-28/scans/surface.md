# Registered surface inventory — C20 (partial)

Built configuration at the fixed baseline: 16 collections, two globals and 251 registered collection/global endpoint entries including generated REST/auth routes. GraphQL is disabled. Runtime crawls, per-field matrix and remaining route coverage are pending.

| Collection | Access function wiring | Endpoint entries |
|---|---|---|
| lesson-plans | create: lessonPlanCreate, delete: lessonPlanDelete, read: lessonPlanRead, unlock: defaultUnlockAccess, update: lessonPlanUpdate | 15 |
| lesson-bundle-versions | create: lessonBundleVersionCreate, delete: lessonBundleVersionDelete, read: lessonBundleVersionRead, unlock: defaultUnlockAccess, update: versionUpdateGrantForFormRenderOnly | 31 |
| subjects | create: siteAdminOnly, delete: siteAdminOnly, read: authenticated, unlock: defaultUnlockAccess, update: siteAdminOnly | 13 |
| subject-grades | create: siteAdminOnly, delete: siteAdminOnly, read: authenticated, unlock: defaultUnlockAccess, update: siteAdminOnly | 13 |
| users | create: usersCollectionCreate, delete: siteAdminOnly, read: usersCollectionRead, unlock: siteAdminOnly, update: usersCollectionUpdate, admin: adminPanelAccess | 33 |
| favorites | create: create, delete: ownFavorites, read: ownFavorites, unlock: defaultUnlockAccess, update: update | 13 |
| messages | create: create, delete: delete, read: senderOrRecipient, unlock: defaultUnlockAccess, update: update | 14 |
| edit-recovery | create: closed, delete: closed, read: closed, unlock: defaultUnlockAccess, update: closed | 13 |
| discussion-topics | create: forumPosting, delete: delete, read: forumReading, unlock: defaultUnlockAccess, update: update | 18 |
| discussion-replies | create: forumPosting, delete: delete, read: forumReading, unlock: defaultUnlockAccess, update: update | 14 |
| discussion-participation | create: create, delete: delete, read: ownParticipation, unlock: defaultUnlockAccess, update: update | 13 |
| payload-kv | create: create, delete: delete, read: read, unlock: defaultUnlockAccess, update: update | 13 |
| payload-jobs | create: create, delete: delete, read: read, unlock: defaultUnlockAccess, update: update | 15 |
| payload-locked-documents | create: lockCreate, delete: lockDelete, read: authenticated, unlock: defaultUnlockAccess, update: lockUpdate | 13 |
| payload-preferences | create: defaultAccess, delete: preferenceAccess, read: preferenceAccess, unlock: defaultUnlockAccess, update: preferenceAccess | 16 |
| payload-migrations | create: defaultAccess, delete: defaultAccess, read: defaultAccess, unlock: defaultUnlockAccess, update: defaultAccess | 0 |

## Globals

- system-settings: read: siteAdminOnly, update: update
- payload-jobs-stats: read: siteAdminOnly, update: noApiWrites

## Frontend route files

- `app/src/app/(frontend)/discuss/[id]/page.tsx`
- `app/src/app/(frontend)/discuss/new/page.tsx`
- `app/src/app/(frontend)/discuss/page.tsx`
- `app/src/app/(frontend)/explore/page.tsx`
- `app/src/app/(frontend)/forgot-password/page.tsx`
- `app/src/app/(frontend)/guide/page.tsx`
- `app/src/app/(frontend)/lessons/[id]/compare/page.tsx`
- `app/src/app/(frontend)/lessons/[id]/page.tsx`
- `app/src/app/(frontend)/login/page.tsx`
- `app/src/app/(frontend)/messages/page.tsx`
- `app/src/app/(frontend)/page.tsx`
- `app/src/app/(frontend)/reset-password/page.tsx`
- `app/src/app/(frontend)/signup/page.tsx`
- `app/src/app/(frontend)/verify-email/page.tsx`
- `app/src/app/(payload)/admin/[[...segments]]/page.tsx`
