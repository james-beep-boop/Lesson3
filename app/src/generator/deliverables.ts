/**
 * The export document list, in order, shared by the server and the download buttons.
 * Keep it free of server-only imports so catalogue components can use it.
 *
 * The catalogue row surfaces the PRIMARY deliverable inline and folds the secondaries behind a
 * disclosure; both sides must agree on which tag is primary, or a one-sided change would
 * double-render or drop a document. This is that single agreement.
 */
export const DELIVERABLE_TAGS = [
  'lessonSequence',
  'finalExplanation',
  'teacherKey',
  'summaryTable',
  'compactTeacherGuide',
  'studentSummaryTable',
] as const
export type DeliverableTag = (typeof DELIVERABLE_TAGS)[number]

export const PRIMARY_DELIVERABLE: DeliverableTag = 'lessonSequence'

export const secondaryDeliverables = (tags: DeliverableTag[]): DeliverableTag[] =>
  tags.filter((t) => t !== PRIMARY_DELIVERABLE)

/** Human labels for each deliverable, shared by the lesson-page strip and the editor's PDF menu so
 *  the two surfaces name the documents identically. */
export const DELIVERABLE_LABELS: Record<DeliverableTag, string> = {
  lessonSequence: 'Lesson plan',
  finalExplanation: 'Final explanation',
  teacherKey: 'Teacher key — not for students',
  summaryTable: 'Summary table',
  compactTeacherGuide: 'Compact Teacher Guide',
  studentSummaryTable: 'Student Summary Table',
}
