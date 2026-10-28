import { minimalResourceLinks } from '../../helpers/fixtures'
/** Small contract-valid data fixture; never an executable upload. */
export const auditRawBundle = (
  subject: string,
  grade: number,
  substrandId: string,
  title: string,
): Record<string, unknown> => ({
  schemaVersion: '1.0.0',
  META: {
    subject,
    grade,
    substrand_id: substrandId,
    substrand_name: 'Audit sub-strand',
    titleDoc: title,
  },
  UNIT: null,
  LESSONS: [
    {
      number: 1,
      title: 'Lesson',
      duration: '40 minutes',
      slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'x',
          teacherMoves: 'y',
          sensemakingStrategy: 'z',
          formativeAssessment: 'w',
        },
      ],
      summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
      resourceLinks: minimalResourceLinks(),
    },
  ],
  FINAL_EXPLANATION: null,
  SUMMARY_TABLE: null,
})
