# Engineering Conventions

Canonical spec: `SPEC.md`. AI-assistant rules: `CLAUDE.md`.

## Stack conventions

- **Language:** TypeScript on Node.js. One runtime end to end — do not add a second language on the core path.
- **Framework:** Payload CMS (Postgres adapter). Define content as **native nested fields**, not JSON blobs. Use Payload **access control** for authz (collection-, operation-, and field-level), and **hooks** (`beforeChange`/`afterChange`) for versioning side-effects and generator invocation.
- **DOCX/PDF:** reuse ARES's `cbe-generation-system` generator (the `docx` npm package) in-process via `generateOne(dataObject)`. Never reimplement the formatting.
- **Versioning:** Payload native versions/drafts + custom semver and official-version fields.

## Practices

- **Verify before coding** against Payload / `docx` / Next.js: read installed source or official docs; trust installed source over memory. **Pin dependency versions** and upgrade deliberately.
- **Tests:** colocate and run before declaring work done. (Test framework TBD — likely Vitest; record the choice here once made.)
- **Security:** ingest **extracts** ARES `.js` data to JSON; never execute uploaded code. Enforce all rules server-side, not only in the UI.
- **Formatting/linting:** establish ESLint + Prettier for the stack; record commands here once set up.
- **Never commit or push without an explicit request.**

## To be filled in as the stack is established

- Project layout and module boundaries
- Test commands and coverage expectations
- Lint/format/build/run commands
- Deployment runbook
