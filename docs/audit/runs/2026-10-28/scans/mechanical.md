# Mechanical first pass — raw observations

Contract: execute report-only scans with pinned tools outside application dependencies. Tool hits are leads, not defects. Remaining scan and semantic-triage gaps keep C10–C15 incomplete.

- Knip 5.66.0 / TypeScript 5.9.3: existing explicit framework/CLI/test configuration used; raw JSON retained. The new audit harness files are not product dead-code findings. Current-run unreachable-file and unused-export controls were both detected and removed; per-hit triage remains pending.
- jscpd 4.0.5: source, app CLIs and root scripts scanned, with generated/vendor/migration exclusions; raw clusters retained.
- TypeScript unused-local/parameter probe: raw diagnostics retained; no tsconfig changes.
- Strict report-only TypeScript/sonar lint: external config and tools; raw diagnostics retained.
- Stylelint 16.23.1 with standard/SCSS configs: raw diagnostics retained. Formatting preferences are not automatically product defects.
- ShellCheck 0.10.0: 182 raw diagnostics; triage pending.
- Hadolint 2.12.0: four raw diagnostics; triage pending.
- Gitleaks 8.28.0: full available Git history, all refs, 1,073 commits. Five redacted hits independently inspected: three are document SHA hashes whose filenames contain teacherKey; two are synthetic unit/integration fixture values. No credential exposure established by these five hits. No history rewritten.
- npm audit/outdated: raw JSON retained outside checkout. No upgrades or lockfile edits.

Tools install in a separate prefix/lockfile. Browser runner lockfile hash matches the application; WebKit was installed only in a new audit browser image. Scanner output and model agreement alone do not establish correctness.
