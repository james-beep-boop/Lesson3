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

  // The package's `exports` map hides this file, so load the installed source by path.
  const convert = async (error: unknown, collectionSlug: string, tableName: string) => {
    const { handleUpsertError } = (await import(
      new URL(
        '../../node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js',
        import.meta.url,
      ).href
    )) as { handleUpsertError: (args: unknown) => never }
    try {
      handleUpsertError({ adapter: { fieldConstraints: {} }, collectionSlug, error, tableName })
    } catch (converted) {
      return converted
    }
    throw new Error('handleUpsertError did not throw')
  }

  /**
   * ⚑ THE REAL ADAPTER BOUNDARY (audit F-C42-001). The installed Drizzle adapter converts the
   * driver's 23505 into a fresh `ValidationError` that keeps neither `code`, `constraint` nor
   * `cause`, so a test that hands the helper a driver-shaped error never sees what the export
   * endpoint actually catches. Run the installed converter itself.
   */
  it('recognizes the conflict after the installed adapter converts it', async () => {
    const converted = await convert(
      { code: '23505', constraint: PENDING_EXPORT_JOB_UNIQUE_INDEX, detail: '' },
      'payload-jobs',
      'payload_jobs',
    )
    expect((converted as Error).name).toBe('ValidationError')
    expect((converted as { code?: unknown }).code).toBeUndefined()
    expect(isPendingExportJobConflict(converted)).toBe(true)
  })

  it('does not treat a converted unique error on another table as an export conflict', async () => {
    const converted = await convert(
      { code: '23505', constraint: 'users_email_idx', detail: '' },
      'users',
      'users',
    )
    expect(isPendingExportJobConflict(converted)).toBe(false)
  })
})
