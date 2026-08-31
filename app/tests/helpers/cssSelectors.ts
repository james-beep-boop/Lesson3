/**
 * Selector-level stylesheet queries for the CSS guard specs — ONE definition of "does this class
 * have a rule?", because the boundary rule is the subtle part and two copies drift.
 *
 * ⚑ THE NEGATIVE LOOKAHEAD IS THE WHOLE CONTRACT. `.lp-manage` must not match `.lp-manage__num`,
 * and `.lp-delete-plans__num` must not satisfy a query for `.lp-manage__num`. `classNameStyles.spec`
 * owns the test that proves it. An earlier version of that guard paired a bare `.base` found
 * anywhere with an `&__suffix` found anywhere else and happily invented three classes that no
 * selector contained (2026-08-30) — hence: compile the Sass first, then ask real selectors.
 */
import postcss from 'postcss'

/** Characters that may continue a CSS identifier — the boundary a class-name match must not cross. */
const CSS_NAME_CHAR = '[_a-zA-Z0-9-]'

export const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every rule selector in each source, including rules nested inside at-rules — a `@media` block's
 * selector counts just as much for "does a rule exist?". Pass COMPILED CSS: postcss's default parser
 * cannot read Sass nesting, so a `.scss` source must go through `sass.compile()` first.
 */
export function stylesheetSelectors(...sources: string[]): string[] {
  return sources.flatMap((source) => {
    const selectors: string[] = []
    postcss.parse(source).walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    return selectors
  })
}

/** Does any selector target exactly `className` (and not merely a longer name starting with it)? */
export function stylesheetHasRule(ruleSelectors: readonly string[], className: string): boolean {
  const exact = new RegExp(`\\.${escapeForRegExp(className)}(?!${CSS_NAME_CHAR})`)
  return ruleSelectors.some((selector) => exact.test(selector))
}
