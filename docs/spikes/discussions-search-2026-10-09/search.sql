-- :'words' is a text[] of already-escaped '%word%' patterns (\ % _ escaped, ESCAPE '\' is Postgres's default)
PREPARE forum_search(text[], int, int) AS
SELECT t.id, t.title
FROM discussion_topics t
WHERE NOT EXISTS (
  SELECT 1 FROM unnest($1) AS w(p)
  WHERE NOT (
    t.title ILIKE w.p OR t.body ILIKE w.p
    OR EXISTS (SELECT 1 FROM discussion_replies r WHERE r.topic_id = t.id AND r.body ILIKE w.p)
  )
)
ORDER BY t.last_activity_at DESC, t.id DESC
LIMIT $2 OFFSET $3;
PREPARE forum_search_count(text[]) AS
SELECT count(*) FROM discussion_topics t
WHERE NOT EXISTS (
  SELECT 1 FROM unnest($1) AS w(p)
  WHERE NOT (
    t.title ILIKE w.p OR t.body ILIKE w.p
    OR EXISTS (SELECT 1 FROM discussion_replies r WHERE r.topic_id = t.id AND r.body ILIKE w.p)
  )
);
