# Browser evidence — partial C60/C61/C63/C72

Contract: exercise Chromium and WebKit with synthetic role fixtures on the disposable stack. New audit cases may isolate a symptom; existing browser tests and product code remain unchanged. Report automated accessibility and screenshot coverage separately from manual inspection.

- Chromium existing suite: 151 passed, two checks expected no SMTP while the target had SMTP configured, one applicable-only-offline skip. After switching the disposable app to no-email mode, all three targeted cases passed with zero retries.
- WebKit existing suite in no-email mode: 150 passed, four failed. Three involved competing client/test navigations, not a demonstrated denied server request. A fresh independent search test passed; the existing search test depends on a previous test's Dot topic (F-C72-001). Remaining navigation symptoms are not silently counted as passes.
- Independent search case with its own data passed in both engines.
- Route/role/viewport crawl: 84 combinations each engine, widths 360/768/1280; anonymous plus the four fixture capability shapes. No document overflow or WCAG2 A/AA and WCAG2.1 A/AA axe violations on those rendered states. See the per-engine route summaries for redirects and unavailable routes; a redirect is not coverage of the intended destination state.
- Screenshots retained privately. Manual screenshot sampling, keyboard-only journeys, all dynamic/admin routes, and feature-specific states remain pending. Automated axe results do not establish full accessibility.
- The initial independent lost-reply probe incorrectly expected Try again even when lookup succeeded automatically. The assertion was corrected to the documented automatic key-recovery behavior. Its engine-specific rerun is pending. This was an audit probe error, not an implementation change.

The first crawl omitted wcag21a. The expanded repeat with all four declared tag groups passed both engines (84 combinations each), with zero violations in those states. This corrects audit coverage, not product code. Experimental/best-practice rules are not thereby declared clean; see Lighthouse diagnostics. Chromium keyboard journey and three manual screenshot samples are now recorded in keyboard.md. Independent uncertain-reply recovery passed both engines. WebKit keyboard focus and expanded dynamic states remain distinct gaps.
