import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "/app/node_modules/drizzle-orm/index.js";
import {
  setupRoleFixture,
  setForumEnabled,
} from "/app/tests/helpers/fixtures.ts";
import { drizzleOf, rowsOf } from "/app/tests/helpers/db.ts";
import { listTopics, loadThread } from "/app/src/lib/discussionPages.ts";
import {
  hasUnread,
  unreadTopicIds,
  searchTopicTitles,
} from "/app/src/lib/discussions.ts";

if (
  process.env.FORUM_DISPOSABLE_PROBE !== "yes" ||
  process.env.NODE_ENV !== "production"
)
  throw new Error("Disposable production-mode probe required");
const fx = await setupRoleFixture();
const p = fx.payload;
const db = drizzleOf(p);
const author = fx.users.teacher;
const respondent = fx.users.subjectAdmin;
try {
  await setForumEnabled(p, true);
  const topics = rowsOf(
    await db.execute(sql`
    INSERT INTO discussion_topics (title, body, author_id, submission_key, last_seq)
    SELECT CASE WHEN g % 2 = 0 THEN 'Photosynthesis lesson plan ' ELSE 'Mabadiliko mwanga somo ' END || g,
           'Benchmark opening', ${author.id}, 'probe-topic-' || g, 20
      FROM generate_series(1, 5000) g RETURNING id`),
  );
  const ids = topics.map((t) => Number(t.id));
  await db.execute(sql`
    INSERT INTO discussion_replies (topic_id, seq, body, author_id, submission_key)
    SELECT t.id, g, 'Reply ' || g, ${respondent.id}, 'probe-reply-' || t.id || '-' || g
      FROM discussion_topics t CROSS JOIN generate_series(1, 20) g
     WHERE t.author_id = ${author.id}`);
  await db.execute(sql`
    INSERT INTO discussion_replies (topic_id, seq, body, author_id, submission_key)
    SELECT ${ids[0]}, g, 'Long reply ' || g, ${respondent.id}, 'probe-long-reply-' || g
      FROM generate_series(21, 2000) g`);
  await db.execute(
    sql`UPDATE discussion_topics SET last_seq = 2000 WHERE id = ${ids[0]}`,
  );
  await db.execute(sql`
    INSERT INTO discussion_participation (topic_id, user_id, last_read_seq)
    SELECT id, ${author.id}, 10 FROM discussion_topics
     WHERE author_id = ${author.id} ORDER BY id LIMIT 500`);
  await db.execute(sql`ANALYZE discussion_topics`);
  await db.execute(sql`ANALYZE discussion_replies`);
  await db.execute(sql`ANALYZE discussion_participation`);
  const runs = {
    "topic list, 20 rows": () => listTopics(p, author, 1),
    "title search, English": () =>
      searchTopicTitles(p, {
        user: author,
        query: "photosynthesis plan",
        page: 1,
      }),
    "title search, Swahili": () =>
      searchTopicTitles(p, { user: author, query: "mwanga somo", page: 1 }),
    "title search, no match": () =>
      searchTopicTitles(p, {
        user: author,
        query: "photosynthesis mwanga",
        page: 1,
      }),
    "nav unread, 500 discussions": () => hasUnread(p, author.id),
    "unread markers, 20 rows": () =>
      unreadTopicIds(p, author.id, ids.slice(0, 20)),
    "thread, 2000 replies, page 1": () =>
      loadThread(p, author, ids[0], "1", true),
    "thread, 2000 replies, page 40": () =>
      loadThread(p, author, ids[0], "40", true),
  };
  const results = {};
  for (const [label, run] of Object.entries(runs)) {
    await run();
    const times = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now();
      await run();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results[label] = {
      medianMs: +times[12].toFixed(2),
      p95Ms: +times[23].toFixed(2),
    };
  }
  mkdirSync("/app/test-results", { recursive: true });
  writeFileSync(
    "/app/test-results/discussions-timings.json",
    JSON.stringify(
      {
        runtime: process.version,
        dataset: {
          topics: 5000,
          replies: 101980,
          longThread: 2000,
          participation: 500,
        },
        warmSamples: 25,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await db.execute(
    sql`DELETE FROM discussion_replies WHERE topic_id IN (SELECT id FROM discussion_topics WHERE author_id = ${author.id})`,
  );
  await db.execute(
    sql`DELETE FROM discussion_participation WHERE topic_id IN (SELECT id FROM discussion_topics WHERE author_id = ${author.id})`,
  );
  await db.execute(
    sql`DELETE FROM discussion_topics WHERE author_id = ${author.id}`,
  );
  await fx.teardown();
  await p.destroy();
}

// Imported helpers can retain independent handles; all probe cleanup has completed above.
process.exit(0);
