/**
 * The 2026-10 generator re-pin (upstream 6591146): student/teacher Final Explanation, attribution in every
 * deliverable, Markdown tables, upstream's null-resource wording, and the stored-links resource path.
 * These run the REAL vendored generator and read the resulting DOCX XML — nothing here is mocked.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

import {
  generateBundleDocx,
  generateFinalExplanationDocx,
  generateLessonSequenceDocx,
  generateTeacherKeyDocx,
  type AresDataObject,
} from '../../src/generator/index'
import { PHASE_VALUES } from '../../src/fields/phases'
import { RESOURCE_PHASE_KEYS } from '../../src/ingest/resourceLinks'

const require = createRequire(import.meta.url)
const bridge = require('../../src/generator/vendor/aresResources.js') as {
  DB_PATH: string
  getAllPhaseResources: () => unknown
  takeDiagnostics: () => unknown[]
  buildResourceParagraphs: (r: unknown) => unknown[]
}

const EXEMPLAR = 'EXEMPLAR-ANSWER-THAT-STUDENTS-MUST-NOT-SEE'
const record = (title: string) => ({
  title,
  source: 'ARES',
  content_type: 'video',
  direct_url: `http://ares.local/content/${encodeURIComponent(title)}`,
  search_url: 'http://ares.local/search/similar',
  search_terms: 'terms',
  exact_search_url: 'http://ares.local/search/exact',
  has_transcript: false,
  tier: 0,
})
const FALLBACK = 'http://ares.local/www2/search.php?searchstring=animal+gaseous+exchange&x=1'

/** A complete ARES resourceLinks map; `tag` makes every title unique to this lesson/build. */
function links(tag: string, nulls: { video?: boolean; reading?: boolean } = {}) {
  return Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((k) => [
      k,
      {
        video: nulls.video ? null : record(`${tag}-${k}-video`),
        reading: nulls.reading ? null : { ...record(`${tag}-${k}-reading`), content_type: 'html' },
        fallback_search_url: FALLBACK,
      },
    ]),
  )
}

const lesson = (number: number, title: string, resourceLinks: unknown) => ({
  number,
  title,
  duration: '40 min',
  slo: { purpose: 'P.', knowledge: 'K.', skills: 'S.', attitudes: 'A.', keyInquiry: 'Q?' },
  overview: 'Overview text.',
  framework: PHASE_VALUES.map((phase) => ({
    phase,
    learnerExperience: 'LE.',
    teacherMoves: 'TM.',
    sensemakingStrategy: 'SS.',
    formativeAssessment: 'FA.',
  })),
  teacherReflection: 'TR.',
  summaryTablePrompt: { observed: 'O.', learned: 'L.', explained: 'E.' },
  resourceLinks,
})

const PIPE_TABLE = '| Organ | Function |\n|---|---|\n| Heart | Pumps blood |'

function data(overrides: Partial<AresDataObject> = {}): AresDataObject {
  return {
    META: {
      subject: 'Biology',
      grade: 10,
      substrand_id: '1.1',
      substrand_name: 'Probe',
      titleDoc: 'Probe Lesson Sequence',
      col3Label: 'Sensemaking',
      col5Label: 'Resources',
      outputDir: 'x',
      filePrefix: 'Biology_Probe',
    },
    UNIT: {
      gradeLevel: 'Grade 10',
      subject: 'Biology',
      strand: 'S',
      substrand: 'SS',
      overview: 'U.',
    },
    LESSONS: [lesson(1, 'Lesson one', links('A')), lesson(2, 'Lesson two', links('B'))],
    FINAL_EXPLANATION: {
      subjectLabel: 'Biology',
      instructions: 'Explain your thinking.',
      sections: [
        { title: 'Evidence', prompt: 'What happened?', exemplar: `${EXEMPLAR}\n${PIPE_TABLE}` },
      ],
      rubric: [{ criterion: 'C', excellent: '4', proficient: '3', developing: '2' }],
    },
    SUMMARY_TABLE: {
      subStrand: 'SS',
      drivingQuestion: 'DQ?',
      lessons: [{ number: 1, title: 'Lesson one', observed: 'o', learned: 'l', explained: 'e' }],
    },
    ...overrides,
  }
}

async function parts(buffer: Buffer | null) {
  expect(buffer).not.toBeNull()
  const zip = await JSZip.loadAsync(buffer!)
  return {
    xml: await zip.file('word/document.xml')!.async('string'),
    rels: (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '',
  }
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe('student document vs teacher key', () => {
  it('the student document carries no exemplar answers and keeps the writing space', async () => {
    const { xml } = await parts(await generateFinalExplanationDocx(data()))
    expect(xml).not.toContain(EXEMPLAR)
    expect(xml).not.toContain('Pumps blood')
    expect(xml).toContain('Student Assessment Document')
    expect(xml).toContain('Student Name')
    expect(xml).toContain('Write your answer here')
    expect(xml).not.toContain('Teacher Key')
  })

  it('the teacher key carries the exemplars and none of the student fields', async () => {
    const { xml } = await parts(await generateTeacherKeyDocx(data()))
    expect(xml).toContain(EXEMPLAR)
    expect(xml).toContain('Teacher Key')
    expect(xml).toContain('do not give to students')
    expect(xml).not.toContain('Student Name')
    expect(xml).not.toContain('Write your answer here')
  })

  it('a Markdown table in the exemplar renders as a table, not as pipe characters', async () => {
    const { xml } = await parts(await generateTeacherKeyDocx(data()))
    expect(xml).toContain('Pumps blood')
    expect(xml).toContain('Organ')
    expect(xml).not.toContain('| Heart |')
    expect(xml).not.toContain('|---|')
    // the exemplar cell holds a NESTED table, so the document has more tables than sections + header
    const plain = await parts(
      await generateTeacherKeyDocx(
        data({
          FINAL_EXPLANATION: {
            subjectLabel: 'Biology',
            instructions: 'x',
            sections: [{ title: 'Evidence', prompt: 'p', exemplar: 'no table here' }],
            rubric: [],
          },
        }),
      ),
    )
    expect(count(xml, '<w:tbl>')).toBeGreaterThan(count(plain.xml, '<w:tbl>'))
  })

  it('produces neither document when the bundle has no final explanation', async () => {
    const out = await generateBundleDocx(data({ FINAL_EXPLANATION: undefined }))
    expect(out.finalExplanation).toBeNull()
    expect(out.teacherKey).toBeNull()
    expect(out.lessonSequence).not.toBeNull()
  })

  it('the full bundle has all four deliverables, in document order', async () => {
    const out = await generateBundleDocx(data())
    expect(Object.keys(out)).toEqual([
      'lessonSequence',
      'finalExplanation',
      'teacherKey',
      'summaryTable',
    ])
    for (const buf of Object.values(out)) expect(buf).not.toBeNull()
  })
})

describe('a table and a link in the same Final Explanation field', () => {
  // proseLinks used to turn ANY field with a (https://…) into Paragraph[] before upstream's table parser saw
  // it, so the table printed as raw `| a | b |` text. A field that contains a table now stays a plain string.
  const LINK = 'Source (https://example.com/evidence)'
  const withFe = (prompt: string, exemplar = 'E') =>
    data({
      FINAL_EXPLANATION: {
        subjectLabel: 'Biology',
        instructions: 'i',
        sections: [{ title: 'T', prompt, exemplar }],
        rubric: [],
      },
    })

  it.each([
    ['student document', generateFinalExplanationDocx],
    ['teacher key', generateTeacherKeyDocx],
  ] as const)(
    'the table still renders in the %s when the field also holds a link',
    async (_n, fn) => {
      const plain = (await parts(await fn(withFe(`Compare:\n${PIPE_TABLE}`)))).xml
      const linked = (await parts(await fn(withFe(`Compare:\n${PIPE_TABLE}\n${LINK}`)))).xml
      expect(linked).not.toContain('| Heart |')
      expect(linked).not.toContain('|---|')
      expect(linked).toContain('Pumps blood')
      // the same nested-table structure as the link-free field
      expect(count(linked, '<w:tbl>')).toBe(count(plain, '<w:tbl>'))
    },
  )

  it('the address stays VISIBLE in a table field, as text rather than a clickable link', async () => {
    const { xml, rels } = await parts(
      await generateTeacherKeyDocx(withFe(`${PIPE_TABLE}\n${LINK}`)),
    )
    expect(xml).toContain('https://example.com/evidence')
    expect(rels).not.toContain('https://example.com/evidence')
  })

  it('a field with a link and NO table is still hyperlinked, exactly as before', async () => {
    const { xml, rels } = await parts(await generateTeacherKeyDocx(withFe(LINK)))
    expect(xml).toContain('https://example.com/evidence')
    expect(rels).toContain('https://example.com/evidence')
  })

  it('only the field that holds the table is affected: a sibling field keeps its link', async () => {
    const { rels } = await parts(
      await generateTeacherKeyDocx(
        withFe(`${PIPE_TABLE}\n${LINK}`, 'Read (https://example.com/exemplar-link)'),
      ),
    )
    expect(rels).toContain('https://example.com/exemplar-link')
    expect(rels).not.toContain('https://example.com/evidence')
  })

  it('an indented or whitespace-led pipe row still counts as a table (upstream trims each line)', async () => {
    const { xml } = await parts(
      await generateTeacherKeyDocx(
        withFe(
          `Compare:\n   | Organ | Function |\n   |---|---|\n   | Heart | Pumps blood |\n${LINK}`,
        ),
      ),
    )
    expect(xml).not.toContain('| Heart |')
    expect(xml).toContain('Pumps blood')
  })
})

describe('attribution', () => {
  const FOOTER = 'Aligned with KICD objectives'
  const HEADER = 'This work is licensed under a'

  it('appears in all four deliverables', async () => {
    const out = await generateBundleDocx(data())
    for (const [name, buf] of Object.entries(out)) {
      const { xml } = await parts(buf)
      expect(xml, `${name} carries the attribution block`).toContain('Curriculum Alignment')
      expect(xml, `${name} names the licence`).toContain(HEADER)
      expect(xml, `${name} names the creators`).toContain('SeaVuria and ARES')
    }
  })

  it('puts the short footer after EVERY lesson, and the full block once', async () => {
    const { xml } = await parts(await generateLessonSequenceDocx(data()))
    expect(count(xml, FOOTER)).toBe(2)
    expect(count(xml, HEADER)).toBe(1)
    const three = data({
      LESSONS: [1, 2, 3].map((n) => lesson(n, `Lesson ${n}`, links(`L${n}`))),
    })
    expect(count((await parts(await generateLessonSequenceDocx(three))).xml, FOOTER)).toBe(3)
  })

  it('uses the FIXED configured copyright year, never the render-time year', async () => {
    const { xml } = await parts(await generateTeacherKeyDocx(data()))
    expect(xml).toContain('© 2026 SeaVuria and ARES')
    // Stable across wall-clock years: rendering "in 2031" must not change the stamped year. The module
    // caches after first use, so load a FRESH copy to prove the config — not the cache — decides it.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.UTC(2031, 5, 1)))
    try {
      expect(new Date().getFullYear()).toBe(2031)
      const modPath = require.resolve('../../src/generator/vendor/lib/attribution.js')
      delete require.cache[modPath]
      const fresh = require(modPath) as { attribution: () => { year: string } }
      expect(fresh.attribution().year).toBe('2026')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('attribution config path', () => {
  it('the generator points the vendored code at the REAL on-disk config (not a bundler placeholder)', () => {
    // index.ts is already loaded by this file's imports, so the default has been applied.
    const configured = process.env.ATTRIBUTION_YAML
    expect(configured).toBeDefined()
    expect(configured).not.toContain('/ROOT/')
    expect(existsSync(configured!)).toBe(true)
    expect(configured!.endsWith('src/generator/config/attribution.yaml')).toBe(true)
  })
})

describe('resources: stored-links path, null wording, isolation', () => {
  it('the bridge selects the stored-links path: DB_PATH cannot exist, lookups are forbidden', () => {
    expect(existsSync(bridge.DB_PATH)).toBe(false)
    expect(() => bridge.getAllPhaseResources()).toThrow(/no ARES content database/)
    expect(bridge.takeDiagnostics()).toEqual([])
  })

  it('every lesson gets ITS OWN links, in lesson order', async () => {
    const { xml } = await parts(await generateLessonSequenceDocx(data()))
    const a = xml.indexOf('A-predict-video')
    const b = xml.indexOf('B-predict-video')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    // all 5 buckets × 2 slots × 2 lessons reach the document
    for (const tag of ['A', 'B'])
      for (const k of RESOURCE_PHASE_KEYS)
        for (const slot of ['video', 'reading']) expect(xml).toContain(`${tag}-${k}-${slot}`)
  })

  it('concurrent builds never exchange resource links', async () => {
    const [x, y] = await Promise.all([
      generateLessonSequenceDocx(data({ LESSONS: [lesson(1, 'X', links('XX'))] })),
      generateLessonSequenceDocx(data({ LESSONS: [lesson(1, 'Y', links('YY'))] })),
    ])
    const [xp, yp] = await Promise.all([parts(x), parts(y)])
    expect(xp.xml).toContain('XX-predict-video')
    expect(xp.xml).not.toContain('YY-')
    expect(yp.xml).toContain('YY-predict-video')
    expect(yp.xml).not.toContain('XX-')
  })

  it('a null slot prints upstream wording, the search link, and the visible search terms', async () => {
    const { xml, rels } = await parts(
      await generateLessonSequenceDocx(
        data({ LESSONS: [lesson(1, 'Nulls', links('N', { video: true, reading: true }))] }),
      ),
    )
    // one per phase bucket
    expect(count(xml, 'No closely matching video in the ARES library for this activity.')).toBe(5)
    expect(count(xml, 'No closely matching reading in the ARES library for this activity.')).toBe(5)
    expect(xml).toContain('Search ARES for videos')
    expect(xml).toContain('Search ARES for readings')
    expect(xml).toContain('Search terms: animal gaseous exchange')
    expect(rels).toContain('searchstring=animal+gaseous+exchange')
    expect(xml).not.toContain('N-predict-video') // nothing stale where a slot is null
  })

  it('a malformed percent-escape in the fallback URL drops the search terms but still renders the slot', async () => {
    const bad = 'http://ares.local/www2/search.php?searchstring=%E0%A4%A&x=1'
    const nullLinks = Object.fromEntries(
      RESOURCE_PHASE_KEYS.map((k) => [k, { video: null, reading: null, fallback_search_url: bad }]),
    )
    const { xml } = await parts(
      await generateLessonSequenceDocx(data({ LESSONS: [lesson(1, 'Bad escape', nullLinks)] })),
    )
    expect(xml).toContain('No closely matching video in the ARES library for this activity.')
    expect(xml).toContain('Search ARES for videos')
    expect(xml).not.toContain('Search terms:')
  })

  it('refuses a lesson with no stored links rather than printing blank resources', async () => {
    const broken = data({ LESSONS: [lesson(1, 'No links', undefined)] })
    await expect(generateLessonSequenceDocx(broken)).rejects.toThrow(/no existing resourceLinks/)
  })
})

describe('tables in the fields upstream added to richCell (b3743ff)', () => {
  // Upstream now parses a Markdown table out of Final Explanation `instructions`, lesson `overview` and the
  // four framework fields, not just `prompt`/`exemplar`. Five assessments had a table in `instructions` that
  // printed as raw `| a | b |` text. Each field must (a) render the table and (b) keep it when a link shares
  // the field ("table wins over link", as for prompt/exemplar).
  const LINK = 'Source (https://example.com/evidence)'
  const FRAMEWORK_KEYS = [
    'learnerExperience',
    'teacherMoves',
    'sensemakingStrategy',
    'formativeAssessment',
  ] as const

  const withInstructions = (instructions: string) =>
    data({
      FINAL_EXPLANATION: {
        subjectLabel: 'Biology',
        instructions,
        sections: [{ title: 'T', prompt: 'P', exemplar: 'E' }],
        rubric: [],
      },
    })
  const withLessonField = (field: 'overview' | (typeof FRAMEWORK_KEYS)[number], value: string) => {
    const l = lesson(1, 'Lesson one', links('A'))
    if (field === 'overview') l.overview = value
    else l.framework[0] = { ...l.framework[0]!, [field]: value }
    return data({ LESSONS: [l] })
  }
  const rawPipes = (xml: string) => xml.includes('| Heart |') || xml.includes('|---|')

  it.each([
    ['student document', generateFinalExplanationDocx],
    ['teacher key', generateTeacherKeyDocx],
  ] as const)('instructions: a table renders in the %s, with or without a link', async (_n, fn) => {
    const plain = (await parts(await fn(withInstructions(`Use:\n${PIPE_TABLE}`)))).xml
    const linked = (await parts(await fn(withInstructions(`Use:\n${PIPE_TABLE}\n${LINK}`)))).xml
    expect(rawPipes(plain)).toBe(false)
    expect(rawPipes(linked)).toBe(false)
    expect(linked).toContain('Pumps blood')
    expect(count(linked, '<w:tbl>')).toBe(count(plain, '<w:tbl>'))
    expect(count(plain, '<w:tbl>')).toBeGreaterThan(
      count((await parts(await fn(withInstructions('Use it.')))).xml, '<w:tbl>'),
    )
  })

  it('instructions: a link with no table is still hyperlinked', async () => {
    const { rels } = await parts(await generateFinalExplanationDocx(withInstructions(LINK)))
    expect(rels).toContain('https://example.com/evidence')
  })

  it.each(['overview', ...FRAMEWORK_KEYS] as const)(
    'lesson %s: a table renders, with or without a link',
    async (field) => {
      const base = (await parts(await generateLessonSequenceDocx(withLessonField(field, 'Text.'))))
        .xml
      const plain = (
        await parts(await generateLessonSequenceDocx(withLessonField(field, PIPE_TABLE)))
      ).xml
      const linked = (
        await parts(
          await generateLessonSequenceDocx(withLessonField(field, `${PIPE_TABLE}\n${LINK}`)),
        )
      ).xml
      expect(rawPipes(plain)).toBe(false)
      expect(rawPipes(linked)).toBe(false)
      expect(linked).toContain('Pumps blood')
      expect(count(plain, '<w:tbl>')).toBeGreaterThan(count(base, '<w:tbl>'))
      expect(count(linked, '<w:tbl>')).toBe(count(plain, '<w:tbl>'))
    },
  )

  it('lesson fields: the address stays visible but is not a link when the field holds a table', async () => {
    const { xml, rels } = await parts(
      await generateLessonSequenceDocx(withLessonField('teacherMoves', `${PIPE_TABLE}\n${LINK}`)),
    )
    expect(xml).toContain('https://example.com/evidence')
    expect(rels).not.toContain('https://example.com/evidence')
  })

  it('lesson fields: a link with no table is still hyperlinked', async () => {
    for (const field of ['overview', ...FRAMEWORK_KEYS] as const) {
      const { rels } = await parts(await generateLessonSequenceDocx(withLessonField(field, LINK)))
      expect(rels, field).toContain('https://example.com/evidence')
    }
  })
})
