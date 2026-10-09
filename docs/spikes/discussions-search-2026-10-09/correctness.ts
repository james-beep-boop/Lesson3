import { getPayload } from 'payload'
import config from './config.ts'

const payload = await getPayload({ config })
for (const c of ['discussion-participation', 'discussion-replies', 'discussion-topics', 'users'] as const)
  await payload.delete({ collection: c, where: { id: { exists: true } }, overrideAccess: true })

const u = await payload.create({ collection: 'users', data: { email: 'a@x.test', password: 'pw-spike-1', name: 'A' } })
const mk = async (title: string, body: string, replies: string[]) => {
  const t = await payload.create({ collection: 'discussion-topics', data: { title, body, author: u.id, lastActivityAt: new Date().toISOString() } })
  let seq = 0
  for (const r of replies) await payload.create({ collection: 'discussion-replies', data: { topic: t.id, seq: ++seq, body: r, author: u.id } })
  return t.id
}
const ids = {
  A_titleAndReply: await mk('Fractions help', 'opening text', ['some assessment ideas']),
  B_differentReplies: await mk('Algebra', 'opening', ['about fractions', 'about assessment']),
  C_sameReply: await mk('Geometry', 'opening', ['fractions assessment together']),
  D_onlyOneWord: await mk('Biology', 'opening', ['fractions only']),
  E_manyMatches: await mk('Fractions again', 'assessment in opening', ['fractions', 'fractions', 'fractions assessment']),
}
const expected = ['A_titleAndReply', 'B_differentReplies', 'C_sameReply', 'E_manyMatches'].map((k) => ids[k as keyof typeof ids]).sort()
const name = (id: unknown) => Object.entries(ids).find(([, v]) => v === id)?.[0]

const words = ['fractions', 'assessment']
const forms: Record<string, any> = {
  dotPath: { and: words.map((w) => ({ or: [{ title: { like: w } }, { body: { like: w } }, { 'replies.body': { like: w } }] })) },
  containsWhere: { and: words.map((w) => ({ or: [{ title: { like: w } }, { body: { like: w } }, { replies: { contains: { body: { like: w } } } }] })) },
}
for (const [label, where] of Object.entries(forms)) {
  try {
    const r = await payload.find({ collection: 'discussion-topics', where, limit: 2, page: 1, sort: '-lastActivityAt', depth: 0, overrideAccess: true, select: { title: true } })
    const all = await payload.find({ collection: 'discussion-topics', where, limit: 100, depth: 0, overrideAccess: true, select: { title: true } })
    const got = all.docs.map((d) => d.id).sort()
    const dupes = all.docs.length !== new Set(all.docs.map((d) => d.id)).size
    console.log(JSON.stringify({ form: label, got: got.map(name), missing: expected.filter((i) => !got.includes(i)).map(name), extra: got.filter((i) => !expected.includes(i)).map(name), duplicateRows: dupes, totalDocs: all.totalDocs, page1: { docs: r.docs.length, totalDocs: r.totalDocs, totalPages: r.totalPages } }))
  } catch (e) {
    console.log(JSON.stringify({ form: label, error: String((e as Error).message) }))
  }
}
// Wildcard escaping: does a literal % in a search term act as a wildcard?
await mk('Score 50 percent', 'opening', [])
const pct = await payload.find({ collection: 'discussion-topics', where: { title: { like: '50%' } }, limit: 10, depth: 0, overrideAccess: true })
console.log(JSON.stringify({ wildcardProbe: 'title like "50%"', matchedTitles: pct.docs.map((d: any) => d.title) }))
process.exit(0)
