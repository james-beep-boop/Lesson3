import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.SPIKE_DB ?? 'postgres://spike:spike@127.0.0.1:55499/spike' })
await client.connect()
const esc = (w: string) => '%' + w.replace(/[\\%_]/g, (c) => '\\' + c) + '%'

const ORIG_WHERE = `NOT EXISTS (SELECT 1 FROM unnest($1::text[]) AS w(p) WHERE NOT (
  t.title ILIKE w.p OR t.body ILIKE w.p
  OR EXISTS (SELECT 1 FROM discussion_replies r WHERE r.topic_id = t.id AND r.body ILIKE w.p)))`
const orig = {
  list: `SELECT t.id FROM discussion_topics t WHERE ${ORIG_WHERE} ORDER BY t.last_activity_at DESC, t.id DESC LIMIT 20 OFFSET $2`,
  count: `SELECT count(*) FROM discussion_topics t WHERE ${ORIG_WHERE}`,
}
// Set-based: per word, the set of topics it matches (title/body or any reply); keep topics matched by every word.
const HITS = `WITH w AS (SELECT DISTINCT p FROM unnest($1::text[]) AS u(p)),
hits AS (
  SELECT w.p, t.id AS topic_id FROM w JOIN discussion_topics t ON (t.title ILIKE w.p OR t.body ILIKE w.p)
  UNION
  SELECT w.p, r.topic_id FROM w JOIN discussion_replies r ON r.body ILIKE w.p
),
matched AS (SELECT topic_id FROM hits GROUP BY topic_id HAVING count(*) = (SELECT count(*) FROM w))`
const setb = {
  list: `${HITS} SELECT t.id FROM matched m JOIN discussion_topics t ON t.id = m.topic_id ORDER BY t.last_activity_at DESC, t.id DESC LIMIT 20 OFFSET $2`,
  count: `${HITS} SELECT count(*) FROM matched`,
}

async function median(sql: string, params: unknown[]) {
  const times: number[] = []
  for (let i = 0; i < 11; i++) {
    const r = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params)
    if (i) times.push(r.rows[0]['QUERY PLAN'][0]['Execution Time'])
  }
  times.sort((a, b) => a - b)
  return +((times[4] + times[5]) / 2).toFixed(1)
}
const searches: Record<string, string[]> = {
  'lesson': ['lesson'], 'somo': ['somo'], 'fractions tathmini': ['fractions', 'tathmini'],
  'photosynthesis': ['photosynthesis'], 'usanisinuru': ['usanisinuru'], 'zzqxv': ['zzqxv'],
  'lesson fractions photosynthesis': ['lesson', 'fractions', 'photosynthesis'],
}
async function run(label: string, q: { list: string; count: string }) {
  const out: Record<string, unknown> = {}
  for (const [name, words] of Object.entries(searches)) {
    const p = words.map(esc)
    const total = Number((await client.query(q.count, [p])).rows[0].count)
    const deep = Math.max(0, Math.floor((total - 1) / 20) * 20)
    const ids = (await client.query(q.list, [p, 0])).rows.map((r) => r.id)
    const l1 = await median(q.list, [p, 0]), ld = await median(q.list, [p, deep]), c = await median(q.count, [p])
    out[name] = { total, page1ListMs: l1, deepListMs: ld, countMs: c, page1PlusCountMs: +(l1 + c).toFixed(1), firstIds: ids.slice(0, 3) }
  }
  console.log(label, JSON.stringify(out, null, 1))
}
const phase = process.argv[2]
if (phase === 'noindex') { await run('ORIGINAL, no trigram', orig); await run('SET-BASED, no trigram', setb) }
if (phase === 'index') { await run('ORIGINAL, trigram', orig); await run('SET-BASED, trigram', setb) }
await client.end()
