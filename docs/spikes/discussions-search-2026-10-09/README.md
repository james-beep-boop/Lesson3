# Discussions search spike — 2026-10-09

Throwaway investigation scripts for `docs/DESIGN-discussions-2026-10-09.md` §16.3 item 4.
**Not application code.** Kept so the measurements can be reproduced, and so the outstanding Rock 5B run
uses the same dataset and queries. The outcome and its reasoning are recorded in the design doc. This
file only says how to rerun the scripts.

## Run (disposable database only)

Never point these at a real installation's database. `seed.sql` truncates the users table.

```bash
docker run -d --name lesson3-forum-spike -e POSTGRES_USER=spike -e POSTGRES_PASSWORD=spike \
  -e POSTGRES_DB=spike -p 127.0.0.1:55499:5432 --tmpfs /var/lib/postgresql/data \
  postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685
```

From a scratch copy of this directory, with `node_modules` symlinked to `app/node_modules` (Payload 3.90.2),
run the scripts with `./node_modules/.bin/tsx <script>.ts`. Set `SPIKE_DB` to override the connection string.

1. `correctness.ts`: pushes the minimal schema (`config.ts`) and shows that Payload's join-path `where`
   requires all words to be in ONE reply.
2. `search.sql`: the SQL "every word anywhere in the discussion" query; checked on the small seed.
3. `seed.sql` (via `psql -f`): 5,000 topics, 100,000 replies, a 2,000-reply thread, a user in 500
   discussions. English/Swahili vocabulary, deterministic (`setseed`).
4. `measure.ts`, then `measure2.ts noindex|index`: whole-discussion search, with and without `pg_trgm`; also
   the nav dot, row markers, topic list and thread pages.
5. `titles.ts`, `titlesem.ts`, `titlebody.ts`: title-only and title+opening search through Payload's
   own `like` (the adopted approach is title-only).

Teardown: `docker rm -f lesson3-forum-spike`.
