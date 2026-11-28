import type { SupportingFile } from '@/payload-types'

const kinds = {
  QuickCheck: 'quick-check',
  AnswerKey: 'answer-key',
  StudentMaterials: 'student-materials',
  MaterialsTeacherKey: 'materials-teacher-key',
  AssessmentMaterials: 'assessment-materials',
} as const satisfies Record<string, SupportingFile['kind']>

const mimeTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

export function parseSupportingFileName(path: string) {
  const name = path.split(/[/\\]/).at(-1)!
  const match = /^(.+)_([^_]+)\.(pdf|docx)$/i.exec(name)
  if (!match || !Object.hasOwn(kinds, match[2])) return null
  const [, stem, token, extension] = match
  const lesson = /^(.*)_L(\d+)$/.exec(stem)
  const prefix = lesson ? lesson[1] : stem
  const lessonNumber = lesson ? Number(lesson[2]) : null
  if (
    !prefix ||
    (lessonNumber !== null && (!Number.isSafeInteger(lessonNumber) || lessonNumber < 1))
  )
    return null

  return {
    name,
    prefix,
    // If a current sub-strand uses the entire stem as its prefix, the two naming forms overlap.
    literalPrefix: lesson ? stem : null,
    lessonNumber,
    kind: kinds[token as keyof typeof kinds],
    mimeType: mimeTypes[extension.toLowerCase() as keyof typeof mimeTypes],
  }
}

export type SupportingFileName = NonNullable<ReturnType<typeof parseSupportingFileName>>

export type SupportingFileTarget = {
  id: number
  title: string
  lessons: ReadonlySet<number>
}

export function matchSupportingFileName(
  name: SupportingFileName,
  targets: ReadonlyMap<string, SupportingFileTarget[]>,
): { target: SupportingFileTarget } | { reason: string } {
  const candidates = targets.get(name.prefix) ?? []
  if (name.literalPrefix && targets.has(name.literalPrefix))
    return { reason: 'The name also matches a whole sub-strand.' }
  if (candidates.length > 1) return { reason: 'More than one sub-strand has this file prefix.' }
  const [target] = candidates
  if (!target) return { reason: 'No current Official sub-strand has this file prefix.' }
  if (name.lessonNumber !== null && !target.lessons.has(name.lessonNumber))
    return { reason: 'This lesson number is missing from the current Official version.' }
  return { target }
}
