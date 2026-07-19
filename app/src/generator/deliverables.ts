/**
 * The primary-vs-secondary deliverable split, in a dependency-free module so BOTH the client
 * catalogue components and the server export path can share one definition. `exportArtifacts.ts`
 * (which owns `DeliverableTag`) pulls in server-only deps — `node:module`, `jszip`, the artifact
 * cache — so a client component must not import a runtime VALUE from it; the `DeliverableTag`
 * import below is type-only (erased at compile time), keeping this module free of those deps.
 *
 * The catalogue row surfaces the PRIMARY deliverable inline and folds the secondaries behind a
 * disclosure; both sides must agree on which tag is primary, or a one-sided change would
 * double-render or drop a document. This is that single agreement.
 */
import type { DeliverableTag } from './exportArtifacts'

export const PRIMARY_DELIVERABLE: DeliverableTag = 'lessonSequence'

export const secondaryDeliverables = (tags: DeliverableTag[]): DeliverableTag[] =>
  tags.filter((t) => t !== PRIMARY_DELIVERABLE)

/** Human labels for each deliverable, shared by the lesson-page strip and the editor's PDF menu so
 *  the two surfaces name the documents identically. */
export const DELIVERABLE_LABELS: Record<DeliverableTag, string> = {
  lessonSequence: 'Lesson plan',
  finalExplanation: 'Final explanation',
  summaryTable: 'Summary table',
}
