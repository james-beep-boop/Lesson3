/** The four framework columns that accept prose links; shared schema and display labels. */
export const FRAMEWORK_PROSE_LABELS = {
  learnerExperience: 'Learner experience',
  teacherMoves: 'Teacher moves',
  sensemakingStrategy: 'Sensemaking strategy',
  formativeAssessment: 'Formative assessment',
}

const labels = Object.values(FRAMEWORK_PROSE_LABELS)
export const LINKABLE_FIELD_LIST = `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`
