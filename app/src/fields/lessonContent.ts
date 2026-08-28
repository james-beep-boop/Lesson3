import type { Field } from 'payload'

import { canEditStructure, systemOnly } from '../access/bundle'
import { isSubjectAdminFor, siteAdminField, toId } from '../access'
import { prose, proseAdmin, structureText } from './bundleFields'
import { PHASE_OPTIONS } from './phases'
import type { User } from '../payload-types'
import { isSafeHttpUrl, RESOURCE_PHASE_KEYS } from '../ingest/resourceLinks'

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
 * Field-level access (SPEC §5): teachers with editing access edit prose; Subject Admins edit META / phase /
 * duration / structure / answer keys; lesson-level ARES resources and lesson numbers are system-only.
 *
 * IMPORTANT — the authority for the teacher with editing access/admin split is the field-split hook (`applyEditorFieldSplit`,
 * via `enforceVersionFieldSplit`), NOT Payload field-level access (which can't gate array rows and
 * silently nulls optional admin-only array subfields). The hook is a WHITELIST: for a non-admin holder of editing access
 * it writes the original document with only the editing-access-editable *prose* fields overlaid. Consequences
 * for anyone adding fields here:
 *   • A new field is admin-only BY DEFAULT.
 *   • To make a field editing-access-editable you must add it to the matching prose whitelist constant in
 *     `hooks/fieldSplit.ts` (and use `prose()` for the grammar hint). Forgetting only makes it
 *     non-editable by teachers with editing access — never silently editable.
 *   • Editing a container's array via the API requires submitting the FULL array (same rows/order);
 *     the hook rejects cardinality/order changes by teachers with editing access.
 *
 * `LESSONS[].resourceLinks` is required by the definitive ARES 1.0.0 contract (SPEC §3/§4). It is
 * resolved upstream, stored losslessly, hidden from the form, and protected again in fieldSplit
 * because save-as-new ultimately writes through a trusted Local API path.
 */

const validateHttpUrl = (value: unknown): true | string =>
  isSafeHttpUrl(value) || 'Must be an http:// or https:// URL.'

const validateOptionalHttpUrl = (value: unknown): true | string =>
  value == null || value === '' ? true : validateHttpUrl(value)

const resourceRecordFields = (): Field[] => [
  // Optional at the Payload-column layer so the enclosing video/reading group can represent
  // ARES's explicit null. validateGeneratable requires every field when the record is populated.
  { name: 'title', type: 'text' },
  { name: 'source', type: 'text' },
  { name: 'content_type', type: 'text' },
  { name: 'direct_url', type: 'text', validate: validateOptionalHttpUrl },
  { name: 'search_url', type: 'text', validate: validateOptionalHttpUrl },
  { name: 'search_terms', type: 'text' },
  { name: 'exact_search_url', type: 'text', validate: validateOptionalHttpUrl },
  { name: 'has_transcript', type: 'checkbox' },
  { name: 'tier', type: 'number', min: 0 },
]

const resourcePhaseFields = (): Field[] => [
  { name: 'video', type: 'group', fields: resourceRecordFields() },
  { name: 'reading', type: 'group', fields: resourceRecordFields() },
  {
    name: 'fallback_search_url',
    type: 'text',
    required: true,
    validate: validateHttpUrl,
  },
]

// A collapsible bundle array row: shows "<noun> N — <first line of `field`>" via the shared RowLabel
// component (registered once in admin/importMap.js), and starts COLLAPSED. Pure per-array config,
// used by every content array in this file.
//
// The two halves are one decision, not two (2026-07-25): a dozen fully-expanded lesson rows is the
// single biggest reason this form reads as intimidating, and collapsing is only safe BECAUSE the row
// label keeps a collapsed row identifiable. The jump nav expands a row on the way in.
//
// NOTE: `initCollapsed` is Payload's first-render fallback. Its `isRowCollapsed` resolves in-session
// form state → stored field preferences → this value, so LessonControls also collapses the loaded
// form state once per document visit. That makes "opens collapsed" authoritative for returning users
// while leaving Show All / Collapse All fully usable during the visit. See
// docs/DESIGN-editor-usability-2026-07-25.md §3b/§3c.
const collapsedRow = (field: string, noun: string) => ({
  components: {
    RowLabel: {
      path: '@/components/RowLabel#default',
      clientProps: { field, noun },
    },
  },
  initCollapsed: true,
})

// Admin-form VISIBILITY for the admin-only structure sections (META / UNIT): show them only to whoever
// may edit them — Subject Admins for THIS doc's subject-grade, and Site Admins — and hide them from
// everyone else (a teacher with editing access) rather than showing them read-only. Reuses the SAME pure predicate the
// server rule uses (`canEditStructure` → `isSubjectAdminFor`); `@/access` is type-only at runtime
// (already bundled via `access/bundle`), so it is safe in this client-bundled `condition`. Server
// access is unchanged — presentation only; the field-split hook remains the write-time authority.
export const structureCondition = (
  data: unknown,
  _siblingData: unknown,
  { user }: { user: unknown },
): boolean =>
  isSubjectAdminFor(
    user as User,
    toId((data as { subjectGrade?: unknown } | undefined)?.subjectGrade as never),
  )

// Hide an admin-only field from anyone who can't edit it (a teacher with editing access): via `structureCondition`, show
// it only to structure editors (Subject Admins for this doc's subject-grade + Site Admins). Used for
// every admin-only field below — the whole META and UNIT groups, plus the scattered structural /
// answer-key fields inside LESSONS / FINAL_EXPLANATION / SUMMARY_TABLE. This keeps the teacher with editing access's form
// to ONLY the fields they can actually change, removing both greyed inputs AND the subtler trap of
// fields that look editable but are silently dropped by the field-split whitelist
// (`applyEditorFieldSplit`) on save. Presentation
// only — the hook remains the write-time authority; hidden fields keep their original values (an
// a save made under editing access overlays prose onto the original doc), so answer keys/structure are never wiped. The
// value still lives in row `data`, so collapsed array RowLabels (e.g. by `phase`/`title`) still show.
// Merges into any existing `admin` (descriptions, row labels) rather than replacing it.
const adminOnly = (field: Field): Field => {
  const admin = (field as { admin?: Record<string, unknown> }).admin ?? {}
  return { ...field, admin: { ...admin, condition: structureCondition } } as Field
}

/**
 * Stored faithfully, never offered for editing.
 *
 * ⚑ HIDDEN, NOT DELETED, AND NOT DERIVED. Each field this wraps is real ARES contract data that the
 * generator receives verbatim — removing it would change generator input, and deriving a replacement
 * would mean emitting a document upstream would not. What is wrong with them is only that they were
 * FORM CONTROLS: editing them cannot change anything observable, so the control was an offer the
 * system does not honour.
 *
 * ⚑ PRESENTATION ONLY — NO FIELD-LEVEL `access`, and that is not an oversight. Payload field access
 * **nulls optional admin-only subfields inside open arrays** when a non-admin submits the array
 * (DECISIONS 2026-07-04). The recorded victims of that were `lessons[].duration/substrand/
 * aresKeywords` — two of which this helper wraps — and the recorded resolution was to REMOVE field
 * access from exactly those fields and enforce them in a hook instead. Adding `access` back here
 * would be inert today (every version write goes through `overrideAccess`, and in-place update is
 * refused by `enforceVersionImmutable`) and a latent wipe the day any other write path appears.
 *
 * Write-time authority is therefore `applyEditorFieldSplit`'s whitelist, which is secure by default:
 * a key absent from every `*_PROSE` list is restored from the source version, so none of these can be
 * changed by a teacher with editing access whether or not the form shows them.
 */
const storedNotEdited = (field: Field): Field => {
  const admin = (field as { admin?: Record<string, unknown> }).admin ?? {}
  return { ...field, admin: { ...admin, hidden: true, readOnly: true } } as Field
}

/**
 * META + UNIT: the administrator-only identity and overview groups, shown in one collapsed panel.
 *
 * ⚑ BOTH MEMBERS KEEP THEIR OWN `adminOnly` GATE even though the panel that contains them carries the
 * same `structureCondition`, and that doubling is deliberate rather than an oversight. The panel's
 * condition is a LAYOUT convenience — do not draw an empty shell for a teacher. The field conditions
 * are the invariant, and they have to travel with the fields: this is a standalone export, it is also
 * re-spliced into `lessonContentFields`, and `collapsible` is presentational, so a future re-layout
 * that lifts these groups out of the panel would otherwise drop the role gate silently. The predicate
 * is referentially identical, so the second evaluation costs one call and decides nothing.
 */
export const lessonPlanDetailFields: Field[] = [
  // ---- META (all structural / admin-only) ----
  adminOnly({
    name: 'meta',
    type: 'group',
    label: 'Document settings',
    access: { update: canEditStructure },
    fields: [
      // META identity (META_IDENTITY_KEYS in hooks/fieldSplit.ts — the single source) is
      // Site-Admin-only corruption repair, never curation (2026-07-05): subject/grade only label the
      // printed document (the plan's subjectGrade relationship is the categorization truth), and
      // substrand_id is the re-ingest matching key. These `siteAdminField` markers cover the form
      // render + direct writes; the fieldSplit carve-out enforces it on save-as-new. A drift test
      // (metaIdentitySplit.spec.ts) asserts the two layers name the same fields.
      {
        name: 'subject',
        type: 'text',
        access: { create: siteAdminField, update: siteAdminField },
        admin: {
          description: 'Shown in the generated document.',
          // Constrained input: a dropdown over the live `subjects` taxonomy (the data stays a plain
          // string — generator grammar unchanged). See the component header for why there is no
          // server-side validate.
          components: { Field: '@/components/SubjectSelectField#default' },
        },
      },
      {
        name: 'grade',
        type: 'number',
        access: { create: siteAdminField, update: siteAdminField },
        admin: { description: 'Shown in the generated document.' },
      },
      {
        name: 'substrand_id',
        type: 'text',
        access: { create: siteAdminField, update: siteAdminField },
        admin: { description: 'Used to match future uploads to this lesson plan.' },
      },
      { name: 'substrand_name', type: 'text' },
      // The contract's own description: "Authoring/output hint; not consumed downstream." The only
      // vendored reader is `build_docs.js`'s `run()` file-writing path, which Lesson3 does not use —
      // it calls the builders and `Packer.toBuffer` directly (docs/EXTERNAL-DEPENDENCIES.md).
      storedNotEdited({ name: 'outputDir', type: 'text' }),
      { name: 'filePrefix', type: 'text' },
      // `title` is derived from this at ingest, so a titleDoc list column just duplicates Title.
      // Keep it on the edit form, but bar it from the list columns (incl. saved user prefs).
      { name: 'titleDoc', type: 'text', admin: { disableListColumn: true } },
      { name: 'subtitleDoc', type: 'text' },
      { name: 'col3Label', type: 'text' },
      { name: 'col5Label', type: 'text' },
    ],
  }),

  // ---- UNIT (sub-strand overview; renders the generator's Sub-Strand Overview table) ----
  adminOnly({
    name: 'unit',
    type: 'group',
    label: 'Sub-strand overview',
    access: { update: canEditStructure },
    // All UNIT fields are admin-only (SPEC §5 does not list UNIT among editing-access prose): the
    // whitelist hook preserves the whole `unit` group wholesale for teachers with editing access, so none of these
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
  }),
]

export const lessonEditableContentFields: Field[] = [
  // ---- LESSONS[] ----
  {
    name: 'lessons',
    type: 'array',
    label: 'Lessons',
    labels: { singular: 'Lesson', plural: 'Lessons' },
    admin: {
      ...collapsedRow('title', 'Lesson'),
    },
    // A bundle must have ≥1 lesson (native; skipped for drafts). The generator-
    // completeness gate (validateGeneratable) is the create-time authority.
    minRows: 1,
    fields: [
      {
        name: 'number',
        type: 'number',
        admin: { hidden: true, readOnly: true },
        access: { create: systemOnly, update: systemOnly },
      },
      // Titles are interpolated into generated document headings rather than rendered as ordinary
      // cell prose, so the narrow link proof of concept deliberately does not offer insertion here.
      prose('title', 'Title', { linkable: false }),
      adminOnly(structureText('duration', 'Duration')),
      // ⚑ ARGUMENTS TO A LOOKUP THIS APP DOES NOT PERFORM. The pristine `sections.js` passes both to
      // `getAllPhaseResources({ substrand, topic, subject })`, but Lesson3's bridge
      // (`generator/vendor/aresResources.js`) is POSITIONAL: it pops each lesson's already-resolved
      // `resourceLinks` from a queue in `LESSONS` order and ignores the arguments entirely. So
      // editing either one changed nothing a teacher could ever see — though a re-pin that restored
      // the lookup would make them matter again, which is why they stay stored.
      storedNotEdited(structureText('substrand', 'Sub-strand')),
      storedNotEdited(structureText('aresKeywords', 'ARES keywords')),
      {
        name: 'slo',
        type: 'group',
        label: 'Specific learning outcomes',
        fields: [
          prose('purpose', 'Purpose'),
          prose('knowledge', 'Knowledge'),
          prose('skills', 'Skills'),
          prose('attitudes', 'Attitudes'),
          prose('keyInquiry', 'Key inquiry question'),
          prose('purposeInStoryline', 'Purpose in the storyline'),
          prose('safetyNotes', 'Safety notes'),
        ],
      },
      prose('overview', 'Overview'),
      {
        name: 'resourceLinks',
        type: 'array',
        label: 'ARES resource links',
        required: true,
        minRows: RESOURCE_PHASE_KEYS.length,
        maxRows: RESOURCE_PHASE_KEYS.length,
        access: { create: systemOnly, update: systemOnly },
        admin: {
          hidden: true,
        },
        // Store the five buckets as child rows instead of flattening 95 columns onto the parent
        // lesson row. Payload's Postgres adapter reconstructs each array row with
        // json_build_array(), whose hard 100-argument limit the flattened representation exceeded.
        // Ingest/export adapters preserve the definitive external object keyed by phase.
        fields: [
          {
            name: 'phase',
            type: 'select',
            options: [...RESOURCE_PHASE_KEYS],
            required: true,
          },
          ...resourcePhaseFields(),
        ],
      },
      {
        name: 'framework',
        type: 'array',
        label: 'Instructional framework',
        labels: { singular: 'Phase', plural: 'Phases' },
        admin: collapsedRow('phase', 'Phase'),
        // Each lesson needs ≥1 phase or the generator's Section C is empty (native;
        // skipped for drafts — validateGeneratable is the create-time authority).
        minRows: 1,
        fields: [
          adminOnly({
            name: 'phase',
            type: 'select',
            required: true,
            options: PHASE_OPTIONS,
            access: { update: canEditStructure },
          }),
          prose('learnerExperience', 'Learner experience'),
          prose('teacherMoves', 'Teacher moves'),
          prose('sensemakingStrategy', 'Sensemaking strategy'),
          prose('formativeAssessment', 'Formative assessment'),
        ],
      },
      prose('teacherReflection', 'Teacher reflection'),
      {
        name: 'summaryTablePrompt',
        type: 'group',
        label: 'Lesson summary prompts',
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
    label: 'Final explanation',
    fields: [
      adminOnly(structureText('subjectLabel', 'Subject label')),
      prose('instructions', 'Instructions'),
      {
        name: 'sections',
        type: 'array',
        labels: { singular: 'Section', plural: 'Sections' },
        admin: collapsedRow('title', 'Section'),
        fields: [
          adminOnly(structureText('title', 'Title')),
          prose('prompt', 'Prompt'),
          // Answer key — Subject Admin only (SPEC §5). Multiline prose, admin-gated.
          adminOnly(proseAdmin('exemplar', 'Exemplar (answer key)')),
        ],
      },
      adminOnly({
        // Whole rubric is an answer key → Subject Admin only.
        name: 'rubric',
        type: 'array',
        labels: { singular: 'Rubric row', plural: 'Rubric' },
        admin: collapsedRow('criterion', 'Rubric row'),
        access: { update: canEditStructure },
        fields: [
          structureText('criterion', 'Criterion'),
          structureText('excellent', 'Excellent'),
          structureText('proficient', 'Proficient'),
          structureText('developing', 'Developing'),
        ],
      }),
    ],
  },

  // ---- SUMMARY_TABLE ----
  {
    name: 'summaryTable',
    type: 'group',
    label: 'Summary table',
    fields: [
      adminOnly(structureText('subStrand', 'Sub-strand')),
      adminOnly(structureText('drivingQuestion', 'Driving question')),
      {
        name: 'lessons',
        type: 'array',
        labels: { singular: 'Lesson row', plural: 'Lesson rows' },
        admin: collapsedRow('title', 'Lesson row'),
        fields: [
          {
            name: 'number',
            type: 'number',
            admin: { hidden: true, readOnly: true },
            access: { create: systemOnly, update: systemOnly },
          },
          // Administrator-only — see the ⚑ on `SUMMARY_LESSON_PROSE` in `hooks/fieldSplit.ts` for
          // why, and SPEC §5 for the permission it implements.
          adminOnly(structureText('title', 'Title')),
          prose('observed', 'Observed'),
          prose('learned', 'Learned'),
          prose('explained', 'Explained'),
        ],
      },
    ],
  },
]

/**
 * The whole stored shape in ONE array — the flat list the drift specs walk.
 *
 * ⚑ Says what it is, because the first version of this comment said "retained for adapters and schema
 * drift tests" and no adapter uses it: every consumer is a unit spec (`resourceRowDrift`,
 * `proseWhitelistDrift`, `metaIdentitySplit`, `insertLink`, `subjectSelectOptions`,
 * `editorPlainLanguage`). Keeping it is still right — six specs would otherwise each re-compose the
 * two halves — but a reader should know no collection installs this array. The collection composes
 * the halves separately, and `tests/unit/planDetailsPanel.spec.ts` is what pins that wiring.
 */
export const lessonContentFields: Field[] = [
  ...lessonPlanDetailFields,
  ...lessonEditableContentFields,
]
