/**
 * SAFE static extraction of an ARES `.js` data module → plain JSON (SPEC §7).
 *
 * THE SECURITY CONTRACT (the whole point of this file): the input is UNTRUSTED code.
 * We NEVER execute it — no `require`, no `vm`, no `eval`, no `Function`. We parse it to
 * an AST with `acorn` and statically evaluate ONLY pure data literals. Any executable or
 * dynamic construct (a call, an identifier reference inside data, a member access, a
 * template with expressions, a spread, a getter…) is REJECTED with an `IngestError`,
 * never run. ARES's `extract_generator_data.py` is the conceptual model.
 *
 * The accepted shape is the ARES data-module convention (verified against the corpus):
 *   'use strict';
 *   const META = { … };  const UNIT = { … };  const LESSONS = [ … ];
 *   const FINAL_EXPLANATION = { … };  const SUMMARY_TABLE = { … };
 *   module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
 *
 * We collect top-level `const NAME = <literal>` declarations, read which identifiers
 * `module.exports = { … }` re-exports, and return the evaluated literal for each. Other
 * top-level statements are inert (we never execute anything) and are ignored.
 */
import { parse } from 'acorn'

import { IngestError } from './errors'

// acorn emits ESTree-shaped nodes; its bundled types expose only the `Node` base, so we
// describe the handful of node shapes we touch and narrow by `type`.
type AnyNode = {
  type: string
  start: number
  end: number
  loc?: { start: { line: number; column: number } }
  [key: string]: unknown
}

export type AresRawBundle = Record<string, unknown>

/** The five groups an ARES bundle must export (order-independent). */
const REQUIRED_EXPORTS = ['META', 'UNIT', 'LESSONS', 'FINAL_EXPLANATION', 'SUMMARY_TABLE']

const fail = (message: string, node?: AnyNode): never => {
  throw new IngestError(message, {
    node: node?.type,
    line: node?.loc?.start.line,
    column: node?.loc?.start.column,
  })
}

/** The property name an object key denotes (only plain identifiers / string literals). */
const keyName = (key: AnyNode): string => {
  if (key.type === 'Identifier') return key.name as string
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return fail(`Unsupported object key (${key.type}); only plain keys are allowed`, key)
}

/**
 * Evaluate a pure data-literal AST node to its JSON value. Throws on ANYTHING that would
 * require execution or references the environment — that is the safety boundary.
 */
function literalToJson(node: AnyNode): unknown {
  switch (node.type) {
    case 'Literal': {
      // Reject regex/bigint literals — not JSON data.
      if ('regex' in node && node.regex) return fail('Regex literals are not allowed', node)
      if ('bigint' in node && node.bigint) return fail('BigInt literals are not allowed', node)
      return node.value as unknown
    }

    case 'TemplateLiteral': {
      // Permit a template ONLY if it has no interpolated expressions (pure string).
      const expressions = node.expressions as AnyNode[]
      const quasis = node.quasis as AnyNode[]
      if (expressions.length > 0) {
        return fail('Template literals with `${…}` expressions are not allowed', node)
      }
      return (quasis[0].value as { cooked?: string }).cooked ?? ''
    }

    case 'UnaryExpression': {
      // Allow only +/- on a numeric literal (e.g. a negative number). Reject !, typeof, …
      const op = node.operator as string
      const arg = node.argument as AnyNode
      if ((op === '-' || op === '+') && arg.type === 'Literal' && typeof arg.value === 'number') {
        return op === '-' ? -arg.value : arg.value
      }
      return fail(`Unsupported unary operator '${op}'`, node)
    }

    case 'ArrayExpression': {
      const elements = node.elements as Array<AnyNode | null>
      return elements.map((el) => {
        if (el === null) return fail('Sparse array holes are not allowed', node)
        if (el.type === 'SpreadElement') return fail('Spread (`...`) is not allowed', el)
        return literalToJson(el)
      })
    }

    case 'ObjectExpression': {
      const out: Record<string, unknown> = {}
      for (const prop of node.properties as AnyNode[]) {
        if (prop.type === 'SpreadElement') fail('Spread (`...`) is not allowed', prop)
        if (prop.type !== 'Property') fail(`Unsupported object member (${prop.type})`, prop)
        if (prop.kind !== 'init') fail('Getters/setters are not allowed', prop)
        if (prop.method) fail('Object methods are not allowed', prop)
        if (prop.computed) fail('Computed keys are not allowed', prop)
        const name = keyName(prop.key as AnyNode)
        // Guard against prototype pollution via a `__proto__` data key.
        if (name === '__proto__') fail('`__proto__` keys are not allowed', prop)
        out[name] = literalToJson(prop.value as AnyNode)
      }
      return out
    }

    default:
      // Identifier (a variable reference inside data), CallExpression, MemberExpression,
      // NewExpression, function/arrow expressions, etc. — all rejected, never executed.
      return fail(`Unsupported expression (${node.type}); only data literals are allowed`, node)
  }
}

/** Match `module.exports` / `exports` on the left of an assignment. */
const isExportsTarget = (left: AnyNode): boolean => {
  if (left.type !== 'MemberExpression' || left.computed) return false
  const object = left.object as AnyNode
  const property = left.property as AnyNode
  if (object.type === 'Identifier' && object.name === 'module') {
    return property.type === 'Identifier' && property.name === 'exports'
  }
  return false
}

/**
 * Extract an ARES data module's exported groups to JSON, WITHOUT executing it.
 * @throws {IngestError} on any non-literal syntax or a malformed export shape.
 */
export function extractAresData(source: string): AresRawBundle {
  let program: AnyNode
  try {
    program = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script', // ARES data modules are CommonJS scripts
      locations: true,
    }) as unknown as AnyNode
  } catch (e) {
    throw new IngestError(`Could not parse the module as JavaScript: ${(e as Error).message}`)
  }

  // Pass 1: collect top-level `const/let/var NAME = <init>` initializer nodes, and find
  // the `module.exports = { … }` object. We never evaluate eagerly — only what's exported.
  const constInit = new Map<string, AnyNode>()
  let exportsObject: AnyNode | undefined

  for (const stmt of program.body as AnyNode[]) {
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations as AnyNode[]) {
        const id = decl.id as AnyNode
        const init = decl.init as AnyNode | null
        if (id.type === 'Identifier' && init) constInit.set(id.name as string, init)
      }
      continue
    }
    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression as AnyNode
      if (expr.type === 'AssignmentExpression' && isExportsTarget(expr.left as AnyNode)) {
        const right = expr.right as AnyNode
        if (right.type !== 'ObjectExpression') {
          fail('`module.exports` must be assigned a plain object literal', right)
        }
        exportsObject = right // last assignment wins
      }
    }
    // All other top-level statements are inert (never executed) and ignored.
  }

  if (!exportsObject) {
    throw new IngestError('No `module.exports = { … }` found in the module')
  }

  // Pass 2: resolve each exported key. The value is either a shorthand/identifier
  // reference to a collected const, or an inline literal — both evaluated as data.
  const result: AresRawBundle = {}
  for (const prop of exportsObject.properties as AnyNode[]) {
    if (prop.type !== 'Property') fail(`Unsupported export member (${prop.type})`, prop)
    if (prop.computed) fail('Computed export keys are not allowed', prop)
    const name = keyName(prop.key as AnyNode)
    // Same `__proto__` rejection as object data (literalToJson) — applied here too so the
    // "reject __proto__" contract holds uniformly at the export layer.
    if (name === '__proto__') fail('`__proto__` keys are not allowed', prop)
    const value = prop.value as AnyNode
    if (value.type === 'Identifier') {
      const init = constInit.get(value.name as string)
      if (!init) fail(`Exported '${name}' references undefined '${value.name}'`, value)
      result[name] = literalToJson(init!)
    } else {
      result[name] = literalToJson(value)
    }
  }

  const missing = REQUIRED_EXPORTS.filter((k) => !(k in result))
  if (missing.length > 0) {
    throw new IngestError(`Module is missing required export(s): ${missing.join(', ')}`)
  }

  return result
}
