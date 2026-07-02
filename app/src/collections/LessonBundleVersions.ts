import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  lessonBundleVersionCreate,
  lessonBundleVersionDelete,
  lessonBundleVersionRead,
  lessonBundleVersionUpdate,
} from '../access/versioning'
import { canEditStructure, systemOnly } from '../access/bundle'
import {
  enforceBundleVersionGeneratable,
  enforceOfficialNotDeletable,
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
    // Drop the `lessonPlan` column: a version's title IS its plan's title, so it just repeated the
    // Title column. The custom Title Cell (below) shows the clean substrand name; the parent plan is
    // still one click away in the version's edit view.
    defaultColumns: ['title', 'semver', 'subjectGrade', 'createdAt'],
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
    // Stage 2 model: versions are IMMUTABLE. `update` access is now permissive enough for Payload to
    // render the edit form editable (so an Editor can actually type + Save-as-new; see
    // `lessonBundleVersionUpdate`), so the immutability guarantee lives here instead:
    // `enforceVersionImmutable` rejects every in-place `update` (a stray/direct PATCH included).
    // Authoring goes through the save-as-new endpoint (a CREATE, applying the field-split + stale-check
    // itself). `enforceVersionFieldSplit` still exists for the preview endpoint's direct use; not wired here.
    beforeChange: [enforceVersionImmutable],
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
      // Who saved this candidate — stamped by save-as-new from the authenticated caller; empty for
      // uploaded 1.0.0 / system-created versions. Drives the Editor delete scope (IA redesign
      // 2026-07-01): an Editor may delete only versions they authored ("My saved versions" on Manage).
      // System-set only: direct create/update cannot forge it (save-as-new writes via overrideAccess).
      name: 'author',
      type: 'relationship',
      relationTo: 'users' as CollectionSlug,
      index: true,
      access: { create: systemOnly, update: systemOnly },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Who saved this version. Empty for uploaded or system-created versions.',
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
        // De-shout + de-duplicate the list column (prefers the clean meta.substrand_name). Display
        // only — the stored title / useAsTitle stay intact for breadcrumbs + relationship displays.
        components: { Cell: '@/components/VersionTitleCell#default' },
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
