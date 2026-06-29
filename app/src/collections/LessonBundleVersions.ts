import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  lessonBundleVersionCreate,
  lessonBundleVersionDelete,
  lessonBundleVersionRead,
  lessonBundleVersionUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import {
  enforceBundleVersionGeneratable,
  enforceOfficialNotDeletable,
  enforceVersionConcurrency,
  enforceVersionFieldSplit,
  enforceVersionImmutable,
  enforceVersionPlanConsistency,
  numberBundleVersionRows,
} from '../hooks/bundleVersion'
import {
  exportVersionEndpoint,
  exportVersionPrepareEndpoint,
  exportVersionStatusEndpoint,
} from '../endpoints/exportVersion'
import { previewVersionEndpoint, previewVersionUnsavedEndpoint } from '../endpoints/previewVersion'
import { makeOfficialEndpoint, saveAsNewEndpoint } from '../endpoints/versionEdit'
import { lessonContentFields } from '../fields/lessonContent'

export const LessonBundleVersions: CollectionConfig = {
  slug: 'lesson-bundle-versions',
  // Invariant #4 backstop: semver is unique per plan. `nextSemverForPlan` computes the next free
  // patch on fork, but this compound unique index is the hard guarantee against a race (two forks of
  // the same source persisting concurrently). Realised by the generated migration.
  indexes: [{ fields: ['lessonPlan', 'semver'], unique: true }],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'lessonPlan', 'semver', 'subjectGrade', 'createdAt'],
    group: 'Lesson plans',
    description:
      'Immutable lesson-plan snapshots. The parent Lesson Plan chooses one snapshot as Official.',
    components: {
      // Working-copy edit-view controls: content preview (current form state, unsaved included —
      // SPEC §5) and per-export DOCX/PDF download (every retained version is inherently exportable —
      // SPEC §9, Official-version model).
      edit: {
        beforeDocumentControls: ['@/components/LessonControls#default'],
      },
    },
  },
  access: {
    read: lessonBundleVersionRead,
    create: lessonBundleVersionCreate,
    update: lessonBundleVersionUpdate,
    delete: lessonBundleVersionDelete,
  },
  hooks: {
    beforeValidate: [numberBundleVersionRows, enforceVersionPlanConsistency, enforceBundleVersionGeneratable],
    // Working-copy model: reject edits to the plan's Official (immutable) version; reject a stale
    // overwrite of a working copy (optimistic concurrency, reading the client's submitted updatedAt
    // BEFORE the field-split); then apply the Editor/Admin field-split (Editors edit prose only).
    beforeChange: [enforceVersionImmutable, enforceVersionConcurrency, enforceVersionFieldSplit],
    // Retention: the Official version cannot be deleted (would orphan the plan pointer).
    beforeDelete: [enforceOfficialNotDeletable],
  },
  endpoints: [
    // GET /:id/export — serve-only download (idempotent). Warm → 200 .zip; cold → 409. SPEC §9.
    exportVersionEndpoint,
    // POST /:id/export — prepare: warm → 200 {ready}; cold → 202 + enqueue generateVersionArtifact.
    exportVersionPrepareEndpoint,
    // GET /:id/export/status?jobId=… — poll an enqueued export job.
    exportVersionStatusEndpoint,
    // GET /:id/preview?format=… — READ-gated HTML content view of the stored version (SPEC §5).
    previewVersionEndpoint,
    // POST /:id/preview — same gate; renders the editor's current UNSAVED working-copy state (SPEC §5).
    previewVersionUnsavedEndpoint,
    // POST /:id/save-as-new — save the editor's form content as a new candidate version (no pointer move).
    saveAsNewEndpoint,
    // POST /:id/make-official — point this version's plan at it (no content copy). Admin-gated.
    makeOfficialEndpoint,
  ],
  fields: [
    {
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans' as CollectionSlug,
      required: true,
      index: true,
      access: { update: canEditStructure },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions' as CollectionSlug,
      admin: {
        position: 'sidebar',
        description: 'Version this snapshot was edited from. Empty for uploaded 1.0.0.',
      },
    },
    {
      name: 'semver',
      type: 'text',
      // Display label only — the field name / data / code stay `semver`.
      label: 'Version',
      required: true,
      defaultValue: '1.0.0',
      index: true,
      // Server-immutable identity: set once on create (ingest 1.0.0; fork via overrideAccess computes
      // the next free patch). `update: false` blocks any authenticated edit from mutating it (Payload
      // preserves the original); overrideAccess system paths bypass it. `readOnly` only hid it in the UI.
      access: {
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      // Read-only display of the native timestamps, relocated into the sidebar below Version (the
      // native "Last Modified / Created" row in the doc controls is hidden via custom.scss, scoped to
      // this collection). UI field → no DB column.
      name: 'timestampsDisplay',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/VersionTimestamps#default' },
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      access: { update: canEditStructure },
      admin: {
        description: 'Version label for lists, e.g. the document title.',
      },
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      index: true,
      access: { update: canEditStructure },
    },
    ...lessonContentFields,
  ],
}
