import { describe, expect, it, vi } from 'vitest'

import {
  findPendingExportJob,
  isPendingExportJobConflict,
  PENDING_EXPORT_JOB_UNIQUE_INDEX,
} from '../../src/jobs/generateVersionArtifact'

describe('pending export job dedupe', () => {
  it('looks up the exact JSON input in SQL instead of scanning a bounded page', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: 91 }] })
    const findByID = vi.fn().mockResolvedValue({ id: 91, taskSlug: 'generateVersionArtifact' })
    const payload = { db: { drizzle: { execute } }, findByID } as never

    await expect(
      findPendingExportJob(payload, { versionId: 7, kind: 'pdf' }),
    ).resolves.toMatchObject({
      id: 91,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'payload-jobs', id: 91, overrideAccess: true }),
    )
  })

  it('recognizes only the migration-backed unique conflict, including wrapped driver errors', () => {
    expect(
      isPendingExportJobConflict({
        cause: { code: '23505', constraint: PENDING_EXPORT_JOB_UNIQUE_INDEX },
      }),
    ).toBe(true)
    expect(isPendingExportJobConflict({ code: '23505', constraint: 'some_other_unique' })).toBe(
      false,
    )
    expect(isPendingExportJobConflict({ code: '08006' })).toBe(false)
  })
})
