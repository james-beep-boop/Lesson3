/**
 * Shared editing-access prose keys and labels, used by server enforcement, Combine and recovery.
 * Keep this module client-safe: native field configs and access enforcement belong in their own layers.
 */
import { FRAMEWORK_PROSE_LABELS } from './frameworkProse'

// Must stay in sync with the `prose()` fields in fields/lessonContent.ts. The native-field drift test
// identifies intended editing-access prose by its factory's `canEditProse` marker.
// Anything NOT listed is admin/system and is preserved from the original.
export const LESSON_PROSE = ['title', 'overview', 'teacherReflection']
export const SLO_PROSE = [
  'purpose',
  'knowledge',
  'skills',
  'attitudes',
  'keyInquiry',
  'purposeInStoryline',
  'safetyNotes',
]
export const FRAMEWORK_PROSE = Object.keys(FRAMEWORK_PROSE_LABELS)
export const SUMMARY_PROMPT_PROSE = ['observed', 'learned', 'explained']
export const FINAL_EXPLANATION_PROSE = ['instructions']
export const SECTION_PROSE = ['prompt']
// ⚑ NO `title`, AND THIS IS THE CANONICAL NOTE — the field definition and the two specs that changed
// with it point here rather than restating it.
//
// SPEC §5 grants a teacher with editing access `SUMMARY_TABLE.lessons[].{observed, learned,
// explained}` and nothing else. `title` was listed here AND rendered by `prose()`, so the
// implementation was wider than the permission it implements: a teacher could rewrite a Summary Table
// row's title. Now administrator-only on both halves.
//
// The two halves are a deliberate copy, not an oversight: these constants are consumed on the CLIENT
// path (`lib/editRecovery/projection.ts` → `components/EditRecovery/restoreGroups.ts`), so deriving
// them from `lessonContentFields` would pull the server access layer and `payload-types` into the
// browser bundle. `tests/unit/proseWhitelistDrift.spec.ts` walks the field definitions and asserts
// this list matches, which is what keeps the copy honest — it needed no edit when both halves moved.
export const SUMMARY_LESSON_PROSE = ['observed', 'learned', 'explained']

/**
 * The teacher-facing label for each prose field — the SAME words the editor puts above the textarea.
 *
 * ⚑ Restated here rather than derived from the field name, because the authored labels are not
 * mechanical: `keyInquiry` is "Key inquiry question" and `purposeInStoryline` is "Purpose in the
 * storyline", and `tests/unit/editorPlainLanguage.spec.ts` exists because that plain-language wording
 * was chosen deliberately. A de-camelising regex gets both of those wrong, which is exactly what the
 * edit-recovery restore prompt did until it was measured — naming a field one thing in the panel and
 * another in the form the teacher was comparing it against.
 *
 * ⚑ A COPY, and therefore pinned: `tests/unit/proseWhitelistDrift.spec.ts` asserts every entry matches
 * the `prose()` label in `fields/lessonContent.ts`, and that none is missing. The alternative —
 * importing `lessonContentFields` — drags the access-control module into a client component.
 *
 * Names are unique across the sub-objects they appear in (`title` and `observed` recur with the same
 * label), so one flat map serves every scope.
 */
export const PROSE_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  teacherReflection: 'Teacher reflection',
  purpose: 'Purpose',
  knowledge: 'Knowledge',
  skills: 'Skills',
  attitudes: 'Attitudes',
  keyInquiry: 'Key inquiry question',
  purposeInStoryline: 'Purpose in the storyline',
  safetyNotes: 'Safety notes',
  ...FRAMEWORK_PROSE_LABELS,
  observed: 'Observed',
  learned: 'Learned',
  explained: 'Explained',
  instructions: 'Instructions',
  prompt: 'Prompt',
}
