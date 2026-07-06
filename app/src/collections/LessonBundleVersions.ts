import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  lessonBundleVersionCreate,
  lessonBundleVersionDelete,
  lessonBundleVersionRead,
} from '../access/versioning'
import {
  enforceVersionImmutable,
  versionUpdateGrantForFormRenderOnly,
} from '../access/versionImmutability'
import { canEditStructure, systemOnly } from '../access/bundle'
import {
  enforceBundleVersionGeneratable,
  enforceOfficialNotDeletable,
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
import { emailVersionEndpoint } from '../endpoints/emailVersion'
import { cascadeDeleteVersionFavorites } from './Favorites'
import { lessonContentFields } from '../fields/lessonContent'

export const LessonBundleVersions: CollectionConfig = {
  slug: 'lesson-bundle-versions',
  // Invariant #4 backstop: semver is unique per plan. `nextSemverForPlan` computes the next free
  // patch on fork, but this compound unique index is the hard guarantee against a race (two forks of
  // the same source persisting concurrently). Realised by the generated migration.
  indexes: [{ fields: ['lessonPlan', 'semver'], unique: true }],
  // User-facing name (IA redesign PR ③): the data-model word "bundle" never appears in the UI —
  // breadcrumbs/titles read "Lesson plan version".
  labels: { singular: 'Lesson plan version', plural: 'Lesson plan versions' },
  admin: {
    useAsTitle: 'title',
    group: 'Lesson plans',
    description:
      'Immutable lesson-plan snapshots. The parent Lesson Plan chooses one snapshot as Official.',
    components: {
      // IA redesign PR ③: no admin versions LIST — versions are reached from a lesson page (Edit)
      // or Manage (My saved versions), so the list route redirects to Manage. The DOCUMENT view is
      // the editor and stays. Nav entry hidden in custom.scss (`nav-group-Lesson plans`).
      views: {
        list: { Component: '@/components/RedirectToManage#default' },
      },
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
    // NOT a write grant — one half of the immutability mechanism (renders the form editable; every
    // write it appears to allow is rejected by `enforceVersionImmutable` below). The pair lives,
    // deliberately colocated, in access/versionImmutability.ts — read its header before touching.
    update: versionUpdateGrantForFormRenderOnly,
    delete: lessonBundleVersionDelete,
  },
  hooks: {
    beforeValidate: [numberBundleVersionRows, enforceVersionPlanConsistency, enforceBundleVersionGeneratable],
    // Stage 2 model: versions are IMMUTABLE — `enforceVersionImmutable` rejects every authenticated
    // in-place `update` (a stray/direct PATCH included); it pairs with the form-render-only update
    // grant above (see access/versionImmutability.ts). Authoring goes through the save-as-new
    // endpoint (a CREATE, applying the field-split + stale-check itself). `enforceVersionFieldSplit`
    // still exists for the preview endpoint's direct use; not wired here.
    beforeChange: [enforceVersionImmutable],
    // Retention: the Official version cannot be deleted (would orphan the plan pointer). Favorites
    // are per-version (§10) with a NOT NULL version FK — cascade them before the row goes; this
    // runs per row on bulk deletes too, so the plan-delete cascade path is covered here as well.
    beforeDelete: [enforceOfficialNotDeletable, cascadeDeleteVersionFavorites],
  },
  endpoints: [
    // GET /:id/export — serve-only download (idempotent). Warm → 200 .zip; cold → 409. SPEC §9.
    exportVersionEndpoint,
    // POST /:id/export — prepare: warm → 200 {ready}; cold → 202 + enqueue generateVersionArtifact.
    exportVersionPrepareEndpoint,
    // GET /:id/export/status?jobId=… — poll an enqueued export job.
    exportVersionStatusEndpoint,
    // GET /:id/preview — READ-gated HTML content view of the stored version (SPEC §5).
    previewVersionEndpoint,
    // POST /:id/preview — same gate; renders the editor's current UNSAVED working-copy state (SPEC §5).
    previewVersionUnsavedEndpoint,
    // POST /:id/save-as-new — save the editor's form content as a new candidate version (no pointer move).
    saveAsNewEndpoint,
    // POST /:id/make-official — point this version's plan at it (no content copy). Admin-gated.
    makeOfficialEndpoint,
    // POST /:id/email — send the export zip to any address (READ-gated, daily-capped). SPEC §10.
    emailVersionEndpoint,
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
      // Provenance, not content: save-as-new stamps the actual source itself (a submitted value is
      // in its DROP_KEYS) via overrideAccess. System-set only — no authenticated create/update may
      // set or change it (before 2026-07-05 this rendered as an editable dropdown over EVERY version).
      name: 'sourceVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions' as CollectionSlug,
      access: { create: systemOnly, update: systemOnly },
      admin: {
        position: 'sidebar',
        readOnly: true,
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
      // System-owned identity, on BOTH writes (audit 2026-07-06 — create was previously open, so a
      // privileged direct create could forge "banana"/"999.0.0" and corrupt ordering + future bump
      // allocation): only overrideAccess system paths (ingest 1.0.0 / re-ingest next-major /
      // save-as-new next-patch) may set it. An authenticated direct create has any submitted value
      // stripped → the 1.0.0 default (right for a fresh plan; a dup on an existing plan is rejected
      // by the unique (lessonPlan, semver) index). `validate` backstops even the system paths to
      // strict x.y.z — nextSemverForPlan parses malformed pieces loosely, so garbage must never land.
      access: {
        create: systemOnly,
        update: systemOnly,
      },
      validate: (value: null | string | undefined) =>
        /^\d+\.\d+\.\d+$/.test(value ?? '') || 'Version must be numeric x.y.z',
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
