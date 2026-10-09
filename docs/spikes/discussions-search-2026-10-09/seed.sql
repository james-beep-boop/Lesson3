-- Deterministic scale seed for the discussions search spike (2026-10-09).
SELECT setseed(0.42);
TRUNCATE discussion_participation, discussion_replies, discussion_topics, users_sessions, users RESTART IDENTITY CASCADE;

-- 300 users
INSERT INTO users (name, email, hash, salt, updated_at, created_at)
SELECT 'User ' || g, 'u' || g || '@spike.test', 'x', 'x', now(), now() FROM generate_series(1, 300) g;

-- Vocabulary: English + Swahili teaching words, Zipf-skewed by position (earlier = more common).
CREATE TEMP TABLE vocab AS
SELECT ARRAY[
 'lesson','the','students','somo','and','wanafunzi','class','to','mwalimu','activity','learners','group','kazi',
 'question','swali','time','discussion','majadiliano','fractions','sehemu','assessment','tathmini','homework',
 'kazi ya nyumbani','plenary','objective','lengo','materials','vifaa','reading','kusoma','writing','kuandika',
 'numbers','namba','grade','darasa','improve','kuboresha','example','mfano','worksheet','practice','mazoezi',
 'algebra','geometry','jiometria','science','sayansi','english','kiingereza','kiswahili','history','historia',
 'water','maji','energy','nishati','plants','mimea','animals','wanyama','map','ramani','story','hadithi',
 'poem','shairi','grammar','sarufi','vocabulary','msamiati','equation','mlinganyo','graph','grafu','data',
 'measurement','kipimo','time-keeping','starter','extension','differentiation','feedback','maoni','marks',
 'alama','rubric','criteria','vigezo','video','link','resource','rasilimali','phase','introduction','utangulizi',
 'conclusion','hitimisho','experiment','jaribio','observation','uchunguzi','hypothesis','dhana','results',
 'matokeo','teacher','parents','wazazi','school','shule','term','muhula','week','wiki','exam','mtihani'
] AS w;

CREATE OR REPLACE FUNCTION spike_text(nwords int) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(
    CASE WHEN random() < 0.08 THEN 'tok' || floor(random() * 40000)::int   -- long-tail vocabulary
         ELSE (SELECT w[1 + floor(array_length(w,1) * power(random(), 2.2))::int] FROM vocab) END, ' ')
  FROM generate_series(1, nwords)
$$;

-- 5,000 topics over the past year
INSERT INTO discussion_topics (title, body, author_id, last_activity_at, pinned_at, last_seq, updated_at, created_at)
SELECT initcap(spike_text(6)), spike_text(30 + floor(random() * 80)::int), 1 + floor(random() * 300)::int,
       now() - (random() * interval '365 days'), NULL, 0, now(), now()
FROM generate_series(1, 5000);
UPDATE discussion_topics SET pinned_at = now() - (id * interval '1 day') WHERE id IN (17, 2222, 4321);

-- Topic 1 is the 2,000-reply thread; 98,000 more replies are spread over the rest, skewed so some threads are long.
INSERT INTO discussion_replies (topic_id, seq, body, author_id, updated_at, created_at)
SELECT 1, g, spike_text(10 + floor(random() * 70)::int), 1 + floor(random() * 300)::int, now(), now()
FROM generate_series(1, 2000) g;
WITH picks AS (
  SELECT 2 + floor(4999 * power(random(), 1.6))::int AS topic_id FROM generate_series(1, 98000)
), numbered AS (
  SELECT topic_id, row_number() OVER (PARTITION BY topic_id) AS seq FROM picks
)
INSERT INTO discussion_replies (topic_id, seq, body, author_id, updated_at, created_at)
SELECT topic_id, seq, spike_text(10 + floor(random() * 70)::int), 1 + floor(random() * 300)::int, now(), now()
FROM numbered;
UPDATE discussion_topics t SET last_seq = s.m FROM (SELECT topic_id, max(seq) m FROM discussion_replies GROUP BY topic_id) s WHERE s.topic_id = t.id;

-- Planted rare terms (exact counts known) and one cross-reply pair in topic 4000.
UPDATE discussion_replies SET body = body || ' photosynthesis' WHERE id IN (SELECT id FROM discussion_replies ORDER BY id LIMIT 5 OFFSET 50000);
UPDATE discussion_replies SET body = body || ' usanisinuru' WHERE id IN (SELECT id FROM discussion_replies ORDER BY id LIMIT 3 OFFSET 70000);

-- Participation: user 1 in 500 topics, some unread; user 2 in 500 topics, ALL read (the dot's worst case);
-- user 3 in the 2,000-reply thread, read up to 100. Everyone else in ~10 topics.
INSERT INTO discussion_participation (user_id, topic_id, last_read_seq, updated_at, created_at)
SELECT 1, id, CASE WHEN random() < 0.1 THEN floor(last_seq * random()) ELSE last_seq END, now(), now()
FROM discussion_topics WHERE id BETWEEN 2 AND 501;
INSERT INTO discussion_participation (user_id, topic_id, last_read_seq, updated_at, created_at)
SELECT 2, id, last_seq, now(), now() FROM discussion_topics WHERE id BETWEEN 1 AND 500;
INSERT INTO discussion_participation (user_id, topic_id, last_read_seq, updated_at, created_at)
VALUES (3, 1, 100, now(), now());
INSERT INTO discussion_participation (user_id, topic_id, last_read_seq, updated_at, created_at)
SELECT u, t, 0, now(), now() FROM (
  SELECT DISTINCT u, 1 + floor(random() * 5000)::int AS t
  FROM generate_series(4, 300) u, generate_series(1, 10)
) x ON CONFLICT (user_id, topic_id) DO NOTHING;

ANALYZE;
SELECT (SELECT count(*) FROM discussion_topics) topics, (SELECT count(*) FROM discussion_replies) replies,
       (SELECT max(last_seq) FROM discussion_topics) longest_thread, (SELECT count(*) FROM discussion_participation) participation,
       pg_size_pretty(pg_total_relation_size('discussion_replies')) replies_size;
