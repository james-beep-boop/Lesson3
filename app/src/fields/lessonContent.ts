import type { Field } from 'payload'

import { canEditStructure, systemOnly } from '../access/bundle'
import { prose, proseAdmin, structureText } from './bundleFields'
import { PHASE_OPTIONS } from './phases'

/**
 * Shared lesson-plan CONTENT fields (SPEC §3) — the structured sub-strand bundle that generates
 * the three ARES Word documents: META, UNIT, LESSONS[], FINAL_EXPLANATION, SUMMARY_TABLE. Modeled
 * as NATIVE nested fields (groups/arrays), not a JSON blob, so we get per-field validation,
 * field-level access (SPEC §5) and versioning.
 *
 * These were extracted from the (now-retired) `lesson-bundles` collection when the Official-version
 * model became the only representation; `lesson-bundle-versions` is the sole consumer. Top-level
 * group names are camelCase (`meta`, `unit`, `lessons`, `finalExplanation`, `summaryTable`); the
 * generation adapter maps them back to the generator's exact keys. Inner keys already match the ARES
 * data verbatim.
 *
 * Field-level access (SPEC §5): Editors edit prose; Subject Admins edit META / aresKeywords / phase /
 * duration / structure / answer keys; the resource column and lesson numbers are system-only.
 *
 * IMPORTANT — the authority for the Editor/admin split is the field-split hook (`applyEditorFieldSplit`,
 * via `enforceVersionFieldSplit`), NOT Payload field-level access (which can't gate array rows and
 * silently nulls optional admin-only array subfields). The hook is a WHITELIST: for a non-admin Editor
 * it writes the original document with only the Editor-editable *prose* fields overlaid. Consequences
 * for anyone adding fields here:
 *   • A new field is admin-only BY DEFAULT.
 *   • To make a field Editor-editable you must add it to the matching prose whitelist constant in
 *     `hooks/fieldSplit.ts` (and use `prose()` for the grammar hint). Forgetting only makes it
 *     non-editable by Editors — never silently editable.
 *   • Editing a container's array via the API requires submitting the FULL array (same rows/order);
 *     the hook rejects cardinality/order changes by Editors.
 *
 * The per-phase Resource column is OPTIONAL (SPEC §3/§4): resolved at ingest if enabled, absent
 * otherwise. Every path must tolerate empty `resources`.
 */

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

// Collapsed-row label config for an array: shows "<noun> N — <first line of `field`>" via the
// shared RowLabel component (registered once in admin/importMap.js). Pure per-array config.
const rowLabel = (field: string, noun: string) => ({
  components: {
    RowLabel: {
      path: '@/components/RowLabel#default',
      clientProps: { field, noun },
    },
  },
})

export const lessonContentFields: Field[] = [
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
      // `title` is derived from this at ingest, so a titleDoc list column just duplicates Title.
      // Keep it on the edit form, but bar it from the list columns (incl. saved user prefs).
      { name: 'titleDoc', type: 'text', admin: { disableListColumn: true } },
      { name: 'subtitleDoc', type: 'text' },
      { name: 'col3Label', type: 'text' },
      { name: 'col5Label', type: 'text' },
    ],
  },

  // ---- UNIT (sub-strand overview; renders the generator's Sub-Strand Overview table) ----
  {
    name: 'unit',
    type: 'group',
    label: 'UNIT',
    access: { update: canEditStructure },
    admin: { description: 'Sub-strand overview. May be empty for some sub-strands.' },
    // All UNIT fields are admin-only (SPEC §5 does not list UNIT among Editor prose): the
    // whitelist hook preserves the whole `unit` group wholesale for Editors, so none of these
    // need field-level access or the prose() whitelist. Field set + names mirror the generator's
    // subStrandOverview() reader (vendor/lib/sections.js) and the ARES contract's UNIT block
    // (ingest/ares-contract.schema.json) — canonical names only.
    fields: [
      structureText('gradeLevel', 'Grade level'),
      structureText('subject', 'Subject'),
      structureText('strand', 'Strand'),
      structureText('substrand', 'Sub-strand'),
      structureText('totalDuration', 'Total duration'),
      proseAdmin('content', 'Sub-strand content'),
      proseAdmin('learningOutcomes', 'Learning outcomes'),
      proseAdmin('coreCompetencies', 'Core competencies'),
      proseAdmin('values', 'Core values'),
      proseAdmin('sep', 'Science & Engineering Practices'),
      proseAdmin('pcis', 'Pertinent & Contemporary Issues (PCIs)'),
      proseAdmin('careers', 'Career connections'),
      proseAdmin('focus', 'Focus for lessons'),
      proseAdmin('drivingQuestion', 'Driving question / key inquiry'),
      proseAdmin('phenomenon', 'Anchoring phenomenon'),
      proseAdmin('supportingPhenomena', 'Supporting phenomena'),
      proseAdmin('storylineThread', 'Storyline thread'),
    ],
  },

  // ---- LESSONS[] ----
  {
    name: 'lessons',
    type: 'array',
    label: 'LESSONS',
    labels: { singular: 'Lesson', plural: 'Lessons' },
    admin: rowLabel('title', 'Lesson'),
    // A bundle must have ≥1 lesson (native; skipped for drafts). The generator-
    // completeness gate (validateGeneratable) is the create-time authority.
    minRows: 1,
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
        admin: rowLabel('phase', 'Phase'),
        // Each lesson needs ≥1 phase or the generator's Section C is empty (native;
        // skipped for drafts — validateGeneratable is the create-time authority).
        minRows: 1,
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
        admin: rowLabel('title', 'Section'),
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
        admin: rowLabel('criterion', 'Rubric row'),
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
        admin: rowLabel('title', 'Lesson row'),
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
]
