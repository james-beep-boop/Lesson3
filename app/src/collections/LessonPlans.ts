import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  canSetOfficialVersion,
  lessonPlanCreate,
  lessonPlanDelete,
  lessonPlanRead,
  lessonPlanUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import { siteAdminField } from '../access'
import {
  cascadeDeleteLessonPlanVersions,
  enforcePlanSubjectGradeImmutable,
  prewarmOfficialArtifacts,
  retargetFollowerFavorites,
  validateOfficialVersionPointer,
  validatePublication,
} from '../hooks/lessonPlan'
import { uploadBundlesEndpoint } from '../endpoints/uploadBundles'
import { requestEditingEndpoint } from '../endpoints/requestEditing'

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'title',
    group: 'Lesson plans',
    components: {
      // IA redesign PR ③: there is no admin lesson-plans LIST — the library (`/`) is the only list of
      // lessons and Manage owns the functions (upload / repair / delete), so the list route redirects
      // to Manage. The DOCUMENT (edit) view stays: it is the Official-pointer repair form, reached
      // from Manage's Repair links. Nav entry hidden in custom.scss (`nav-group-Lesson plans`).
      views: {
        list: { Component: '@/components/RedirectToManage#default' },
      },
    },
  },
  access: {
    read: lessonPlanRead,
    create: lessonPlanCreate,
    update: lessonPlanUpdate,
    delete: lessonPlanDelete,
  },
  hooks: {
    beforeValidate: [
      enforcePlanSubjectGradeImmutable,
      validateOfficialVersionPointer,
      validatePublication,
    ],
    // Any authenticated Official-pointer move pre-warms that version's export artifacts (T1);
    // any pointer move re-points follower (non-editor) favorites to the new Official (T4).
    afterChange: [prewarmOfficialArtifacts, retargetFollowerFavorites],
    // Deleting a plan must first remove its child versions (NOT NULL lesson_plan_id + ON DELETE SET
    // NULL FK → Postgres 23502 otherwise, shown as "An unknown error has occurred"). SPEC §6.
    // Favorites are per-version (§10) and cascade from the version delete itself.
    beforeDelete: [cascadeDeleteLessonPlanVersions],
  },
  endpoints: [
    // POST /api/lesson-plans/upload — Site-Admin-only JSON ingest (SPEC §7 deviation).
    uploadBundlesEndpoint,
    // POST /api/lesson-plans/:id/request-editing — message the sg's admins for editing access (T3).
    requestEditingEndpoint,
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      access: { update: canEditStructure },
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      // Ingest identity, not repair-form context: the plan title is enough to identify the row and
      // the hook above rejects every attempted move. Hiding the control avoids presenting a greyed
      // field that no user can act on.
      admin: { hidden: true },
      // ⚑ THIS GRANT DOES NOT MEAN RE-CATEGORISATION IS A SUBJECT-ADMIN CAPABILITY. It is not one:
      // `enforcePlanSubjectGradeImmutable` (registered above) rejects every changed value from
      // everyone, `overrideAccess` included. The grant is kept deliberately so that a caller who
      // DOES submit a move reaches the hook and gets the field-scoped explanation, instead of having
      // the key stripped by field access and receiving a 200 for a write that changed nothing.
      // Tightening this to `systemOnly` would read as tidier and would trade a clear refusal for a
      // silent no-op — see `docs/DECISIONS.md` 2026-08-25.
      access: { update: canEditStructure },
    },
    {
      name: 'officialVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions' as CollectionSlug,
      admin: {
        position: 'sidebar',
        description: 'The approved version shown first to teachers.',
      },
      access: {
        update: canSetOfficialVersion,
      },
    },
    /**
     * PUBLICATION (SPEC §2; `docs/DESIGN-public-library.md`). Independent of Official, deliberately:
     * approving a version must never publish it to the internet, and publishing must never be able
     * to expose a version that is not the plan's current Official one. Two orthogonal fields, two
     * separate decisions, made by different people at different times.
     *
     * Site-Admin-only, a narrower gate than the `canEditStructure` guarding `title`: a
     * Subject Administrator curates content, but putting a lesson plan in front of the open internet
     * is a decision about the deployment, not about the subject.
     */
    {
      /**
       * ⚑ NOT `required: true`, deliberately, even though every plan has a visibility.
       *
       * Payload's `required` conflates two things: the column being NOT NULL, and the CALLER having
       * to supply a value. With a `defaultValue` the second is wrong — it makes `visibility` a
       * mandatory argument of every `payload.create` for a lesson plan, so ingest, the seed script
       * and six test fixtures would each have to restate `visibility: 'private'`, which is precisely
       * the default they would get anyway. That is noise at every existing call site and every future
       * one.
       *
       * Nothing about the security posture depends on it: `resolvePublicPlanBySlug` treats anything
       * that is not exactly `unlisted` or `listed` as private, so a NULL — reachable only by raw SQL
       * or a migration, never through Payload — fails closed like everything else.
       */
      name: 'visibility',
      type: 'select',
      defaultValue: 'private',
      options: [
        { label: 'Private — authenticated users only', value: 'private' },
        { label: 'Unlisted — anyone with the link', value: 'unlisted' },
        { label: 'Listed — public, and shown in Explore', value: 'listed' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Public visibility. Independent of Official: approving a version never publishes it.',
      },
      access: { update: siteAdminField },
    },
    {
      name: 'publicSlug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'The permanent public URL name. Derived on first publish if left blank, and FROZEN once the plan has been published — a shared link must not rot.',
      },
      access: { update: siteAdminField },
    },
  ],
}
