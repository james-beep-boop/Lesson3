import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.SPIKE_DB ?? 'postgres://spike:spike@127.0.0.1:55499/spike' })
await client.connect()

const esc = (w: string) => '%' + w.replace(/[\\%_]/g, (c) => '\\' + c) + '%'
const SEARCH_WHERE = `NOT EXISTS (SELECT 1 FROM unnest($1::text[]) AS w(p) WHERE NOT (
  t.title ILIKE w.p OR t.body ILIKE w.p
  OR EXISTS (SELECT 1 FROM discussion_replies r WHERE r.topic_id = t.id AND r.body ILIKE w.p)))`
const searchList = `SELECT t.id FROM discussion_topics t WHERE ${SEARCH_WHERE} ORDER BY t.last_activity_at DESC, t.id DESC LIMIT 20 OFFSET $2`
const searchCount = `SELECT count(*) FROM discussion_topics t WHERE ${SEARCH_WHERE}`
const UNREAD = `(p.last_read_seq < 0 AND t.author_id IS DISTINCT FROM p.user_id)
  OR EXISTS (SELECT 1 FROM discussion_replies r WHERE r.topic_id = p.topic_id AND r.seq > p.last_read_seq
             AND r.author_id IS DISTINCT FROM p.user_id)`
const navDot = `SELECT EXISTS (SELECT 1 FROM discussion_participation p JOIN discussion_topics t ON t.id = p.topic_id
  WHERE p.user_id = $1 AND (${UNREAD}))`
const rowMarkers = `SELECT p.topic_id FROM discussion_participation p JOIN discussion_topics t ON t.id = p.topic_id
  WHERE p.user_id = $1 AND p.topic_id = ANY($2::int[]) AND (${UNREAD})`
const topicList = `SELECT id FROM discussion_topics ORDER BY pinned_at DESC NULLS LAST, last_activity_at DESC, id DESC LIMIT 20 OFFSET $1`
const threadPage = `SELECT id, seq FROM discussion_replies WHERE topic_id = $1 AND seq > $2 ORDER BY seq LIMIT 50`
const firstUnread = `SELECT min(seq) FROM discussion_replies WHERE topic_id = $1 AND seq > $2 AND author_id IS DISTINCT FROM $3`

async function median(sql: string, params: unknown[], runs = 10) {
  const times: number[] = []
  let rows = 0
  for (let i = 0; i < runs + 1; i++) {
    const r = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params)
    const plan = r.rows[0]['QUERY PLAN'][0]
    if (i === 0) { rows = plan.Plan['Actual Rows']; continue } // first run warms the cache, not counted
    times.push(plan['Execution Time'])
  }
  times.sort((a, b) => a - b)
  return { medianMs: +((times[4] + times[5]) / 2).toFixed(2), maxMs: +times[9].toFixed(2), rows }
}

const page20 = (await client.query(`SELECT array_agg(topic_id) a FROM (SELECT topic_id FROM discussion_participation WHERE user_id = 2 ORDER BY topic_id LIMIT 20) x`)).rows[0].a
const results: Record<string, unknown> = {}
const searches: Record<string, string[]> = {
  'common (lesson)': ['lesson'],
  'common Swahili (somo)': ['somo'],
  'mixed two words across replies (fractions tathmini)': ['fractions', 'tathmini'],
  'rare (photosynthesis, 5 replies)': ['photosynthesis'],
  'rare Swahili (usanisinuru, 3 replies)': ['usanisinuru'],
  'no match (zzqxv)': ['zzqxv'],
  'three words incl. one rare (lesson fractions photosynthesis)': ['lesson', 'fractions', 'photosynthesis'],
}
for (const [label, words] of Object.entries(searches)) {
  const p = words.map(esc)
  const count = await median(searchCount, [p])
  const total = Number((await client.query(searchCount, [p])).rows[0].count)
  const deepOffset = Math.max(0, Math.floor((total - 1) / 20) * 20)
  results[`search: ${label}`] = {
    matchingTopics: total,
    page1: await median(searchList, [p, 0]),
    deepPage: { offset: deepOffset, ...(await median(searchList, [p, deepOffset])) },
    count,
  }
}
results['nav dot: user 1 (500 discussions, some unread)'] = await median(navDot, [1])
results['nav dot: user 2 (500 discussions, ALL read — worst case)'] = await median(navDot, [2])
results['nav dot: user 3 (2,000-reply thread, read to 100)'] = await median(navDot, [3])
results['row markers: user 2, one page of 20 topics'] = await median(rowMarkers, [2, page20])
results['topic list page 1 (pins first)'] = await median(topicList, [0])
results['topic list deep page (offset 4980)'] = await median(topicList, [4980])
results['thread page: 2,000-reply thread, last page'] = await median(threadPage, [1, 1950])
results['first unread seq: user 3 in 2,000-reply thread'] = await median(firstUnread, [1, 100, 3])
console.log(JSON.stringify(results, null, 2))
const v = await client.query('select version()')
console.log(v.rows[0].version)
await client.end()
