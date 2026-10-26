import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
vi.mock('../../src/ingest/index', () => ({ ingestUploadItems: vi.fn() }))
import { ingestUploadItems } from '../../src/ingest/index'
import { importLessons, type ImportIO } from '../../src/ingest/importLessons'
const call = vi.mocked(ingestUploadItems)
const done = {
  bundles: [],
  created: [],
  skipped: [],
  rejected: [],
  missing: [],
  needsConfirmation: false,
  setRefused: [],
}
async function run(reports: unknown[], yes = true, answer = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'lessons-'))
  await writeFile(path.join(root, 'lesson.json'), '{}')
  call.mockReset()
  for (const report of reports) {
    if (report instanceof Error) call.mockRejectedValueOnce(report)
    else call.mockResolvedValueOnce(report as never)
  }
  const io: ImportIO = { yes, ask: vi.fn().mockResolvedValue(answer), print: vi.fn() }
  try {
    return { code: await importLessons({} as Payload, root, io), io }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
describe('supported import exit codes and unattended confirmation', () => {
  it.each([
    [0, done],
    [2, { ...done, rejected: [{ file: 'bad', error: 'bad JSON' }] }],
    [3, { ...done, setRefused: [{ file: 'set', error: 'Reused id' }] }],
    [1, new Error('Database failed')],
  ])('returns %s for its report', async (code, report) => {
    expect((await run([report])).code).toBe(code)
  })
  it('returns 4 when declined without a write', async () => {
    expect(
      (
        await run(
          [
            {
              ...done,
              needsConfirmation: true,
              previewToken: 'token',
              official: [{ willMove: true, title: 'A' }],
            },
          ],
          false,
          false,
        )
      ).code,
    ).toBe(4)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('--yes passes the exact token and declines similar taxonomy', async () => {
    const report = {
      ...done,
      needsConfirmation: true,
      previewToken: 'token',
      official: [{ willMove: true, title: 'A' }],
      missing: [
        { subject: 'Maths', grade: 10, files: ['lesson.json'], similarTo: ['Mathematics'] },
        { subject: 'Biology', grade: 10, files: ['lesson.json'], similarTo: [] },
      ],
    }
    const result = await run([report, done])
    expect(result.code).toBe(0)
    expect(result.io.ask).not.toHaveBeenCalled()
    expect(call.mock.calls[1][2]).toEqual([{ subject: 'Biology', grade: 10 }])
    expect(call.mock.calls[1][3]).toBe('token')
  })
  it('asks again when changed decisions now leave Official unchanged', async () => {
    const result = await run(
      [
        {
          ...done,
          needsConfirmation: true,
          confirmationChanged: true,
          previewToken: 'new',
          official: [{ title: 'A', willMove: false, reason: 'Teacher Official' }],
        },
      ],
      false,
      false,
    )
    expect(result.code).toBe(4)
    expect(result.io.ask).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('--yes stops on changed decisions with exit 4', async () => {
    expect(
      (
        await run([
          { ...done, needsConfirmation: true, confirmationChanged: true, previewToken: 'new' },
        ])
      ).code,
    ).toBe(4)
    expect(call).toHaveBeenCalledTimes(1)
  })
})
