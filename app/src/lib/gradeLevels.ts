/** Curriculum setup uses numeric grades; keep the picker and server validation in step. */
export const MIN_GRADE = 1
export const MAX_GRADE = 12
export const GRADE_LEVELS = Array.from(
  { length: MAX_GRADE - MIN_GRADE + 1 },
  (_, index) => MIN_GRADE + index,
)

export const isGradeLevel = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_GRADE && value <= MAX_GRADE
