import type { CollectionConfig } from 'payload'

import {
  canEditStructure,
  lessonBundleCreate,
  lessonBundleDelete,
  lessonBundleRead,
  lessonBundleReadVersions,
  lessonBundleUpdate,
  systemOnly,
} from '../access/bundle'
import { prose, proseAdmin, structureText } from '../fields/bundleFields'
import { enforceBundleStructure } from '../hooks/bundleIntegrity'

/**
 * Sub-strand bundle (SPEC §3) — one structured object that generates the three ARES
 * Word documents. Modeled as NATIVE nested fields (groups/arrays), not a JSON blob,
 * so we get per-field validation, field-level access (SPEC §5) and versioning.
 *
 * Field names: top-level groups are camelCase (`meta`, `unit`, `lessons`,
 * `finalExplanation`, `summaryTable`); the generation adapter maps them back to the
 * generator's exact keys (META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE). Inner
 * keys already match the ARES data verbatim.
 *
 * Field-level access (SPEC §5): Editors edit prose; Subject Admins edit
 * META / aresKeywords / phase / duration / structure / answer keys; the resource
 * column and lesson numbers are system-only.
 *
 * IMPORTANT — the authority for the Editor/admin split is the `enforceBundleStructure`
 * hook, NOT Payload field-level access (which can't gate array rows and silently nulls
 * optional admin-only array subfields). The hook is a WHITELIST: for a non-admin Editor
 * it writes the original document with only the Editor-editable *prose* fields overlaid.
 * Consequences for anyone adding fields here:
 *   • A new field is admin-only BY DEFAULT.
 *   • To make a field Editor-editable you must add it to the matching prose whitelist
 *     constant in `hooks/bundleIntegrity.ts` (and use `prose()` for the grammar hint).
 *     Forgetting only makes it non-editable by Editors — never silently editable.
 *   • Editing a container's array via the API requires submitting the FULL array
 *     (same rows/order); the hook rejects cardinality/order changes by Editors.
 *
 * The per-phase Resource column is OPTIONAL (SPEC §3/§4): resolved at ingest if
 * enabled, absent otherwise. Every path must tolerate empty `resources`.
 */

const PHASE_OPTIONS = [
  'Predict Phase',
  'Observe Phase',
  'Explain Phase',
  'Driving Question Board (DQB) Creation',
  'Model Building Phase',
].map((p) => ({ label: p, value: p }))

// Resource sub-link (system-generated): title + direct/search URLs.
const resourceLink = (name: string, label: string) => ({
  name,
  type: 'group' as const,
  label,
  fields: [
    { name: 'title', type: 'text' as const },
    { name: 'direct_url', type: 'text' as const },
    { name: 'search_url', type: 'text' as const },
  ],
})

export const LessonBundles: CollectionConfig = {
  slug: 'lesson-bundles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subjectGrade', 'semver', '_status'],
    group: 'Content',
  },
  versions: {
    drafts: true,
    maxPerDoc: 100,
  },
  // Document locking is ON by default in Payload 3 (no `true` literal exists; the
  // option is `false | { duration }`). Leaving it default = concurrent admin-UI
  // edits are guarded. See docs/DECISIONS.md (optimistic concurrency).
  access: {
    read: lessonBundleRead,
    readVersions: lessonBundleReadVersions,
    create: lessonBundleCreate,
    update: lessonBundleUpdate,
    delete: lessonBundleDelete,
  },
  hooks: {
    beforeChange: [enforceBundleStructure],
  },
  fields: [
    // ---- Versioning (sidebar) ----
    {
      name: 'semver',
      type: 'text',
      defaultValue: '1.0.0',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Set automatically on each save.',
      },
    },
    {
      name: 'bumpType',
      type: 'select',
      defaultValue: 'patch',
      options: [
        { label: 'Patch (1.0.x) — prose edits', value: 'patch' },
        { label: 'Minor (1.x.0) — new content or structure', value: 'minor' },
        { label: 'Major (x.0.0) — breaking / complete revision', value: 'major' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Version increment for the next save.',
      },
    },
    {
      name: 'lockVersion',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Generation counter — increments on every save.',
      },
    },
    {
      // Human label for lists; mirrors META titleDoc. Structural (admin-set).
      name: 'title',
      type: 'text',
      required: true,
      access: { update: canEditStructure },
      admin: { description: 'Bundle label for lists, e.g. the document title.' },
    },
    {
      // RBAC + browse scope (SPEC §8). META.subject/grade remain as generator content.
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      access: { update: canEditStructure },
    },

    // ---- META (all structural / admin-only) ----
    {
      name: 'meta',
      type: 'group',
      label: 'META',
      access: { update: canEditStructure },
      fields: [
        { name: 'subject', type: 'text' },
        { name: 'grade', type: 'number' },
        { name: 'substrand_id', type: 'text' },
        { name: 'substrand_name', type: 'text' },
        { name: 'outputDir', type: 'text' },
        { name: 'filePrefix', type: 'text' },
        { name: 'titleDoc', type: 'text' },
        { name: 'subtitleDoc', type: 'text' },
        { name: 'col3Label', type: 'text' },
        { name: 'col5Label', type: 'text' },
      ],
    },

    // ---- UNIT (sub-strand overview; may be empty) ----
    {
      name: 'unit',
      type: 'group',
      label: 'UNIT',
      access: { update: canEditStructure },
      admin: { description: 'Sub-strand overview. May be empty.' },
      // Admin-only (SPEC §5 does not list UNIT): proseAdmin, and the whitelist hook
      // preserves `unit` wholesale for Editors.
      fields: [proseAdmin('overview', 'Overview')],
    },

    // ---- LESSONS[] ----
    {
      name: 'lessons',
      type: 'array',
      label: 'LESSONS',
      labels: { singular: 'Lesson', plural: 'Lessons' },
      fields: [
        {
          name: 'number',
          type: 'number',
          admin: { readOnly: true, description: 'Set automatically from lesson order.' },
          access: { create: systemOnly, update: systemOnly },
        },
        prose('title', 'Title'),
        structureText('duration', 'Duration'),
        structureText('substrand', 'Sub-strand'),
        structureText('aresKeywords', 'ARES keywords'),
        {
          name: 'slo',
          type: 'group',
          label: 'SLO',
          fields: [
            prose('purpose', 'Purpose'),
            prose('knowledge', 'Knowledge'),
            prose('skills', 'Skills'),
            prose('attitudes', 'Attitudes'),
            prose('keyInquiry', 'Key inquiry question'),
            prose('purposeInStoryline', 'Purpose in storyline'),
            prose('safetyNotes', 'Safety notes'),
          ],
        },
        prose('overview', 'Overview'),
        {
          name: 'framework',
          type: 'array',
          label: 'Instructional framework',
          labels: { singular: 'Phase', plural: 'Phases' },
          fields: [
            {
              name: 'phase',
              type: 'select',
              required: true,
              options: PHASE_OPTIONS,
              access: { update: canEditStructure },
              admin: {
                description:
                  'Controlled vocabulary — drives colour-coding and resource lookup; an unknown phase silently degrades the document.',
              },
            },
            prose('learnerExperience', 'Learner experience'),
            prose('teacherMoves', 'Teacher moves'),
            prose('sensemakingStrategy', 'Sensemaking strategy'),
            prose('formativeAssessment', 'Formative assessment'),
            {
              name: 'resources',
              type: 'group',
              label: 'Resource column (system-generated)',
              admin: {
                readOnly: true,
                description: 'Auto-resolved at ingest; never user-editable. May be empty.',
              },
              access: { create: systemOnly, update: systemOnly },
              fields: [resourceLink('video', 'Video'), resourceLink('reading', 'Reading')],
            },
          ],
        },
        prose('teacherReflection', 'Teacher reflection'),
        {
          name: 'summaryTablePrompt',
          type: 'group',
          label: 'Summary-table prompt (for the Lesson Sequence)',
          fields: [
            prose('observed', 'Observed'),
            prose('learned', 'Learned'),
            prose('explained', 'Explained'),
          ],
        },
      ],
    },

    // ---- FINAL_EXPLANATION ----
    {
      name: 'finalExplanation',
      type: 'group',
      label: 'FINAL EXPLANATION',
      fields: [
        structureText('subjectLabel', 'Subject label'),
        prose('instructions', 'Instructions'),
        {
          name: 'sections',
          type: 'array',
          labels: { singular: 'Section', plural: 'Sections' },
          fields: [
            structureText('title', 'Title'),
            prose('prompt', 'Prompt'),
            // Answer key — Subject Admin only (SPEC §5). Multiline prose, admin-gated.
            proseAdmin('exemplar', 'Exemplar (answer key)'),
          ],
        },
        {
          // Whole rubric is an answer key → Subject Admin only.
          name: 'rubric',
          type: 'array',
          labels: { singular: 'Rubric row', plural: 'Rubric' },
          access: { update: canEditStructure },
          fields: [
            structureText('criterion', 'Criterion'),
            structureText('excellent', 'Excellent'),
            structureText('proficient', 'Proficient'),
            structureText('developing', 'Developing'),
          ],
        },
      ],
    },

    // ---- SUMMARY_TABLE ----
    {
      name: 'summaryTable',
      type: 'group',
      label: 'SUMMARY TABLE',
      fields: [
        structureText('subStrand', 'Sub-strand'),
        structureText('drivingQuestion', 'Driving question'),
        {
          name: 'lessons',
          type: 'array',
          labels: { singular: 'Lesson row', plural: 'Lesson rows' },
          fields: [
            {
              name: 'number',
              type: 'number',
              admin: { readOnly: true, description: 'Set automatically from row order.' },
              access: { create: systemOnly, update: systemOnly },
            },
            prose('title', 'Title'),
            prose('observed', 'Observed'),
            prose('learned', 'Learned'),
            prose('explained', 'Explained'),
          ],
        },
      ],
    },
  ],
}
