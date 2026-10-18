# Required CI edit for the Insert link PDF wire fixture

These credentials cannot push `.github/workflows/` changes. After the review-fix commit is pushed,
the operator must make this one-line edit on PR #404's **`feat/insert-link-ares` branch**.

Open [.github/workflows/ci.yml in the GitHub editor](https://github.com/james-beep-boop/Lesson3/edit/feat/insert-link-ares/.github/workflows/ci.yml).
In the **Stack up (postgres → migrate → app + gotenberg)** step, replace:

```yaml
        run: docker compose up -d --build
```

with:

```yaml
        run: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

Commit to the PR branch. Do not merge the PR or apply this override on the Rock.

The override mounts `app/tests/fixtures/pdf-library` read-only into the test app and sets its
`PDF_LIBRARY_DIR`. The wire test requires `public-wire.pdf` and compares the complete anonymous
response with the committed bytes; it no longer skips. Listing still returns 401 without an
account, invalid tokens return 404, and the file response must have `nosniff`.

No other workflow command needs changing: the project, services, database, network and named
volumes stay the same. Commands that inspect, execute in or tear down the stack still target the
same services. The production Compose file and fresh-install opt-in remain unchanged.
