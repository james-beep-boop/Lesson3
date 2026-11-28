import { RESOURCE_PHASE_KEYS } from '../../../src/ingest/resourceLinks'
import type { LessonBundleVersion } from '../../../src/payload-types'

const resourceLinks = RESOURCE_PHASE_KEYS.map((phase) => ({
  phase,
  fallback_search_url: 'https://ares.example/search/salts',
}))

export const plan: LessonBundleVersion = {
  id: 1,
  lessonPlan: 1,
  subjectGrade: 1,
  semver: '1.0.0',
  title: 'Acids, Bases and Salts',
  createdAt: '2026-11-27T00:00:00.000Z',
  updatedAt: '2026-11-27T00:00:00.000Z',
  meta: {
    subject: 'General Science',
    grade: 10,
    titleDoc: 'GENERAL SCIENCE GRADE 10: ACIDS, BASES AND SALTS',
    filePrefix: 'General_Science_Acids_Bases_and_Salts',
  },
  unit: {
    totalDuration: '2 lessons • 75 minutes',
    drivingQuestion: 'How can we classify familiar substances?',
    learningOutcomes: 'Distinguish acids from bases.\nUse evidence to explain changes.',
  },
  lessons: [
    {
      number: 1,
      title: 'Classify aqueous samples',
      duration: '35 minutes',
      slo: {
        purpose: 'Use a chart to estimate pH.',
        knowledge: 'A pH below 7 is acidic.',
        safetyNotes: 'Wear splash goggles.',
      },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'Predict a colour change.',
          teacherMoves: '5 minutes. Ask for a reason.',
          sensemakingStrategy: 'Compare predictions.',
          formativeAssessment: 'Listen for a testable prediction.',
        },
        {
          phase: 'Observe Phase',
          learnerExperience: 'Use the chart.\n- Record the pH.',
          teacherMoves: '30 minutes. Show the results.\n| Sample | pH |\n|---|---|\n| A | 4 |',
          sensemakingStrategy: 'Group the samples.',
          formativeAssessment: 'Ask learners to classify sample A.',
        },
      ],
      resourceLinks,
      teacherReflection: 'Which learners changed their predictions?',
      summaryTablePrompt: { observed: 'Sample A turned orange.' },
    },
    {
      number: 2,
      title: 'Explain neutralisation',
      duration: '40 minutes',
      slo: { purpose: 'Explain a result.', safetyNotes: null },
      framework: [{ phase: 'Explain Phase', teacherMoves: 'Ask for an explanation.' }],
      resourceLinks,
      teacherReflection: 'Review the written explanations.',
      summaryTablePrompt: {},
    },
  ],
  summaryTable: {
    subStrand: 'Acids, Bases and Salts',
    lessons: [
      { number: 1, title: 'Classify aqueous samples', observed: 'Sample A turned orange.' },
    ],
  },
}
