import type { SupportingFile } from '@/payload-types'

export const SUPPORTING_FILE_KINDS = [
  { value: 'quick-check', label: 'Quick Check' },
  { value: 'answer-key', label: 'Answer Key' },
  { value: 'student-materials', label: 'Student Materials' },
  { value: 'materials-teacher-key', label: 'Materials Teacher Key' },
  { value: 'assessment-materials', label: 'Assessment Materials' },
  { value: 'deck-art', label: 'Deck art' },
  { value: 'other', label: 'Other' },
] as const

export type SupportingFileLink = Pick<SupportingFile, 'id' | 'title' | 'kind' | 'lessonNumber'> & {
  filename: string
}
