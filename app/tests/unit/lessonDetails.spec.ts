import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '../../src/payload-types'
import { readLessonDetails } from '../../src/lib/lessonDetails'

const user = { id: 7 } as User
const versions = [
  { id: 10, semver: '1.0.0' },
  { id: 11, semver: '1.0.1' },
]
const record = {
  id: 11,
  author: 8,
  sourceVersion: 10,
  createdAt: '2026-10-22T10:00:00.000Z',
  updatedAt: '2026-10-22T11:00:00.000Z',
}

describe('lesson reading details', () => {
  it('reads with the viewer’s access and returns only display values', async () => {
    const findByID = vi
      .fn()
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        id: 8,
        name: 'A teacher',
        email: 'private@example.com',
        roles: ['siteAdmin'],
      })
    const details = await readLessonDetails({ findByID } as unknown as Payload, {
      versionId: 11,
      user,
      versions,
    })
    expect(
      findByID.mock.calls.map(([args]) => ({
        collection: args.collection,
        overrideAccess: args.overrideAccess,
        user: args.user,
        depth: args.depth,
        select: args.select,
      })),
    ).toEqual([
      {
        collection: 'lesson-bundle-versions',
        overrideAccess: false,
        user,
        depth: 0,
        select: { author: true, sourceVersion: true, createdAt: true, updatedAt: true },
      },
      { collection: 'users', overrideAccess: false, user, depth: 0, select: { name: true } },
    ])
    expect(details).toEqual({
      savedBy: 'A teacher',
      basedOn: '1.0.0',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
  })

  it('does not substitute a source outside the readable plan or expose an unavailable author', async () => {
    const findByID = vi
      .fn()
      .mockResolvedValueOnce({ ...record, sourceVersion: 99 })
      .mockRejectedValueOnce({ status: 403 })
    expect(
      await readLessonDetails({ findByID } as unknown as Payload, {
        versionId: 11,
        user,
        versions,
      }),
    ).toMatchObject({ savedBy: 'Unavailable', basedOn: 'Unavailable' })
    expect(findByID).toHaveBeenCalledTimes(2)
  })

  it('shows unrecorded provenance without inventing an author or source', async () => {
    const findByID = vi.fn().mockResolvedValueOnce({ ...record, author: null, sourceVersion: null })
    expect(
      await readLessonDetails({ findByID } as unknown as Payload, {
        versionId: 11,
        user,
        versions,
      }),
    ).toMatchObject({ savedBy: 'Not recorded', basedOn: 'Not recorded' })
    expect(findByID).toHaveBeenCalledTimes(1)
  })

  it('omits details for a version no longer readable and propagates operational failures', async () => {
    const findByID = vi
      .fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce(record)
      .mockRejectedValueOnce(new Error('database unavailable'))
    const payload = { findByID } as unknown as Payload
    expect(await readLessonDetails(payload, { versionId: 11, user, versions })).toBeNull()
    await expect(readLessonDetails(payload, { versionId: 11, user, versions })).rejects.toThrow(
      'database unavailable',
    )
  })
})
