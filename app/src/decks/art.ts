import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { PayloadRequest } from 'payload'

/** Resolve an art id in the supporting-file store for the deck's lesson. */
export async function findDeckArt(
  req: PayloadRequest,
  lessonPlan: number,
  lessonNumber: number,
  artId: string,
) {
  const { docs } = await req.payload.find({
    collection: 'supporting-files',
    where: {
      and: [
        { lessonPlan: { equals: lessonPlan } },
        { lessonNumber: { equals: lessonNumber } },
        { kind: { equals: 'deck-art' } },
        { title: { equals: artId } },
      ],
    },
    sort: '-id',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

export async function readDeckArt(req: PayloadRequest, filename: string): Promise<Buffer | null> {
  const upload = req.payload.collections['supporting-files'].config.upload
  if (!upload || !upload.staticDir || basename(filename) !== filename) return null
  try {
    return await readFile(join(upload.staticDir, filename))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
