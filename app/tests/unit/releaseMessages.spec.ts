import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { sendReleaseMessages } from '../../src/ingest/releaseMessages'
import type { IngestReport, IngestResult } from '../../src/ingest'
const bundle = (id: number, subjectGrade: number, official: boolean): IngestResult => ({
  file: `${id}.json`,
  id,
  subjectGrade,
  official,
  title: `Lesson ${id}`,
  semver: '2.0.0',
  previousSemver: '1.0.0',
  releaseDate: '2026-11-14',
  action: 'revised',
  warnings: [],
})
const report = (bundles: IngestResult[]): IngestReport => ({
  bundles,
  skipped: [],
  rejected: [],
  created: [],
  missing: [],
  needsConfirmation: false,
  setRefused: [],
})
function fake() {
  const find = vi.fn().mockResolvedValue({
    docs: [{ id: 7, assignments: [{ subjectGrade: 10, role: 'subjectAdmin' }] }],
  })
  const create = vi.fn().mockResolvedValue({ id: 1 })
  const logger = { error: vi.fn() }
  return { find, create, logger, payload: { find, create, logger } as unknown as Payload }
}
describe('release upload administrator messages', () => {
  it('groups moved and waiting releases in one message from the confirming Site Administrator', async () => {
    const f = fake()
    expect(
      await sendReleaseMessages(f.payload, 5, report([bundle(1, 10, true), bundle(2, 10, false)])),
    ).toEqual([])
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.create.mock.calls[0][0].data).toMatchObject({ sender: 5, recipient: 7 })
    const body = f.create.mock.calls[0][0].data.body
    expect(body).toContain('Official moved')
    expect(body).toContain('waiting for you')
    expect(body).toContain('/lessons/1')
    expect(body).toContain('/lessons/2')
    expect(body).toContain('2026-11-14')
  })
  it('sends nothing for an empty/refused/rolled-back report or a subject-grade without an administrator', async () => {
    const f = fake()
    await sendReleaseMessages(f.payload, 5, report([]))
    expect(f.find).not.toHaveBeenCalled()
    await sendReleaseMessages(f.payload, 5, report([bundle(1, 20, true)]))
    expect(f.create).not.toHaveBeenCalled()
  })
  it('reports a failed message without throwing or retrying the committed upload', async () => {
    const f = fake()
    f.create.mockRejectedValue(new Error('Message store unavailable'))
    expect(await sendReleaseMessages(f.payload, 5, report([bundle(1, 10, true)]))).toHaveLength(1)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.logger.error).toHaveBeenCalledTimes(1)
  })
  it('keeps even a 500-lesson summary inside the system-message limit', async () => {
    const f = fake()
    await sendReleaseMessages(
      f.payload,
      5,
      report(
        Array.from({ length: 500 }, (_, i) => ({
          ...bundle(i, 10, true),
          title: 'x'.repeat(1000),
        })),
      ),
    )
    expect(f.create.mock.calls[0][0].data.body.length).toBeLessThan(100000)
  })
})
