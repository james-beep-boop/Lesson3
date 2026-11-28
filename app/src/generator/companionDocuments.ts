/** Layouts from write_guide and write_student_summary in vendor/ares-curriculum/compiler.py. */
import { createRequire } from 'node:module'
import type { IParagraphOptions, Paragraph, Table, TableCell } from 'docx'

import type { AresDataObject } from './index'
import type { LessonBundleVersion } from '../payload-types'

const require = createRequire(import.meta.url)
// Use the same CommonJS docx classes as the vendored helpers and Packer.
const {
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  HeightRule,
  PageOrientation,
  Paragraph: DocxParagraph,
  Table: DocxTable,
  TableCell: DocxTableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip: inches,
} = require('docx') as typeof import('docx')
const { bullet, para, richCell, stripTables } = require('./vendor/lib/docx_kit.js') as {
  bullet: (text: string, opts: { size: number }) => Paragraph
  para: (text: string, opts?: { size?: number; after?: number }) => Paragraph
  richCell: (text: string, opts: { w: number; span: number; size: number }) => TableCell
  stripTables: (text: string) => [prose: string, tables: string]
}

// The adapter renames the groups and cleans their values. The fields used here keep their shape.
type CompanionPlan = {
  META: LessonBundleVersion['meta']
  UNIT: LessonBundleVersion['unit']
  LESSONS: NonNullable<LessonBundleVersion['lessons']>
}

function documentWithFooter(children: (Paragraph | Table)[], vertical: number, horizontal: number) {
  const { attribution } = require('./vendor/lib/attribution.js') as {
    attribution: () => { footer: string }
  }
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: inches(8.5),
              height: inches(11),
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: inches(vertical),
              bottom: inches(vertical),
              left: inches(horizontal),
              right: inches(horizontal),
              footer: inches(0.15),
            },
          },
        },
        footers: {
          default: new Footer({ children: [para(attribution().footer, { size: 14, after: 0 })] }),
        },
        children,
      },
    ],
  })
}

function title(text: string): Paragraph {
  return new DocxParagraph({
    heading: HeadingLevel.TITLE,
    keepNext: true,
    spacing: { before: 0, after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '4F81BD', space: 4 } },
    children: [new TextRun({ text, font: 'Calibri', size: 52, color: '17365D' })],
  })
}

function guideHeading(text: string, startsLesson = false): Paragraph {
  const options: IParagraphOptions = {
    heading: startsLesson ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    pageBreakBefore: startsLesson,
    keepNext: true,
    spacing: { before: startsLesson ? 0 : 200, after: 60 },
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        bold: true,
        size: startsLesson ? 28 : 26,
        color: startsLesson ? '365F91' : '4F81BD',
      }),
    ],
  }
  return new DocxParagraph(options)
}

function prose(text: string, size: number, after: number): Paragraph[] {
  const lines = text.split(/\r?\n/)
  return lines.map((line, i) =>
    line.startsWith('- ') || line.startsWith('• ')
      ? bullet(line.slice(2), { size })
      : para(line, { size, after: i === lines.length - 1 ? after : 0 }),
  )
}

function gridCells(values: string[], widths: number[], size: number): TableCell[] {
  return values.map(
    (text, i) =>
      new DocxTableCell({
        width: { size: widths[i]!, type: WidthType.DXA },
        children: prose(text, size, 0),
      }),
  )
}

function grid(
  headers: string[],
  rows: InstanceType<typeof TableRow>[],
  widths: number[],
  size: number,
) {
  return new DocxTable({
    width: { size: widths.reduce((total, width) => total + width, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    margins: { left: 108, right: 108 },
    rows: [
      new TableRow({ tableHeader: true, children: gridCells(headers, widths, size) }),
      ...rows,
    ],
  })
}

function guideTable(framework: NonNullable<CompanionPlan['LESSONS'][number]['framework']>) {
  const widths = [1, 2.2, 2.9, 1.8, 2.1].map(inches)
  const rows = framework.flatMap((phase) => {
    const columns = [
      phase.learnerExperience,
      phase.teacherMoves,
      phase.sensemakingStrategy,
      phase.formativeAssessment,
    ].map((text) => stripTables(text ?? ''))
    const cells = [phase.phase ?? '', ...columns.map(([text]) => text)]
    const phaseRow = new TableRow({ children: gridCells(cells, widths, 18) })
    const tables = columns
      .map(([, text]) => text)
      .filter(Boolean)
      .join('\n\n')
    // As in the lesson plan, a data table sits beneath its phase at full width.
    return tables
      ? [
          phaseRow,
          new TableRow({ children: [richCell(tables, { w: inches(10), span: 5, size: 18 })] }),
        ]
      : [phaseRow]
  })
  return grid(
    ['Phase / time', 'Learner activity', 'Teacher moves', 'Sensemaking', 'Evidence / check'],
    rows,
    widths,
    18,
  )
}

export function buildCompactTeacherGuide(data: AresDataObject) {
  const { META, UNIT, LESSONS } = data as CompanionPlan
  const body = (text: string) => prose(text, 18, 60)
  const overview = [
    title(META?.titleDoc || META?.substrand_name || ''),
    ...body('Compact Teacher Guide'),
    guideHeading('Duration'),
    ...body(UNIT?.totalDuration ?? ''),
    guideHeading('Driving question'),
    ...body(UNIT?.drivingQuestion ?? ''),
    guideHeading('Source learning outcomes'),
    ...body(UNIT?.learningOutcomes ?? ''),
    guideHeading('Preparation and evidence'),
    ...body(
      'Check the preparation and safety notes before each lesson. Assess the risks before doing a practical demonstration. Use the evidence column to check what learners understood.',
    ),
  ]
  const pages = LESSONS.flatMap((lesson, index) => [
    guideHeading(`Lesson ${lesson.number || index + 1}: ${lesson.title ?? ''}`, true),
    ...body([lesson.duration, lesson.slo?.purpose].filter(Boolean).join(' • ')),
    ...body(`Knowledge: ${lesson.slo?.knowledge ?? ''}`),
    ...body(`Preparation/safety: ${lesson.slo?.safetyNotes ?? ''}`),
    guideTable(lesson.framework ?? []),
    ...body(`Reflection: ${lesson.teacherReflection ?? ''}`),
  ])
  return documentWithFooter([...overview, ...pages], 0.45, 0.5)
}

export function buildStudentSummaryTable(data: AresDataObject) {
  const { META, LESSONS } = data as CompanionPlan
  const heading = [META?.titleDoc || META?.substrand_name, 'Student Summary Table']
    .filter(Boolean)
    .join(' — ')
  const widths = Array<number>(4).fill(inches(9.7 / 4))
  const rows = LESSONS.map(
    (lesson, index) =>
      new TableRow({
        height: { value: inches(0.45), rule: HeightRule.ATLEAST },
        children: gridCells(
          [`${lesson.number || index + 1}. ${lesson.title ?? ''}`, '', '', ''],
          widths,
          20,
        ),
      }),
  )
  return documentWithFooter(
    [
      title(heading),
      para(
        'Complete the three evidence columns after each lesson. Use your own observations, learning and explanation.',
        { size: 20, after: 200 },
      ),
      grid(['Lesson', 'What I observed', 'What I learned', 'What I can explain'], rows, widths, 20),
    ],
    0.65,
    0.65,
  )
}
