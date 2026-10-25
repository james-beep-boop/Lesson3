# Computed-style comparison kit

The proof behind the 2026-10-25 CSS cleanup (DECISIONS, CSS steps 2–4), kept so the same comparison can
be re-run when the shared styles change. These are **measurement scripts, not tests**: nothing here
asserts, and none of it runs in CI. Each spec writes a JSON dump to `STYLE_OUT`; `diff.mjs` compares two
dumps, or the two surfaces in one.

| Spec                  | Records                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.spec.ts`       | Every element on 11 screens (sign-in, catalogue, lesson, Guide, Discuss, Messages, Manage, the version editor, the Users list), the account menu open on two, plus the catalogue and Manage at 390px. Colours, borders, radius, type and geometry. |
| `menu-states.spec.ts` | The nav and account menu on both surfaces at 1280px and 390px with an unread message: badges, keyboard focus, the open dropdown, the display-name form's error, enabled and disabled buttons, Escape.                                              |
| `dialogs.spec.ts`     | Every element inside an open dialog: a synthetic dialog with every `.modal*` part on both surfaces (including an over-tall body), and the real Help, Insert link (with its error) and phone "needs a wider screen" dialogs.                        |

## Running

Against a **production build** (the dev server's CSS ordering differs). From `app/`, with the stack
from `AGENTS.md` running and the build serving on `E2E_BASE_URL`:

```sh
# before: on the base commit's build
STYLE_OUT=/tmp/before.json E2E_BASE_URL=http://localhost:3000 \
  npx playwright test --config=playwright.style.config.ts pages.spec.ts
# after: rebuild on your change, then
STYLE_OUT=/tmp/after.json E2E_BASE_URL=http://localhost:3000 \
  npx playwright test --config=playwright.style.config.ts pages.spec.ts
node tests/style-snapshot/diff.mjs /tmp/before.json /tmp/after.json --ignore=width,height
```

`dialogs.spec.ts` compares the same way. For `menu-states.spec.ts`, compare the surfaces within one run:
`node tests/style-snapshot/diff.mjs --surfaces /tmp/states.json`.

## Reading the result

- **Noise.** The fixture's names carry a timestamp, so text-width-dependent values (`width`, `height`, and
  an auto margin on the editor's Back row) change between two runs of the _same_ build. Use
  `--ignore=width,height` for the page dump, and run the baseline twice if a value looks suspicious.
- **Measure the before in the same state as the after.** A badge, an error or an open menu that the
  before-run never rendered cannot be called unchanged (DECISIONS 2026-10-25, CSS step 3 correction).
