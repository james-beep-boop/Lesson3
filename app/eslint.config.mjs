// ESLint 9 flat config. `eslint-config-next` 16 ships native flat-config arrays,
// so we spread them directly — wrapping them via FlatCompat.extends() double-wraps
// the flat plugin config and crashes the legacy validator ("circular structure").
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // buildSowCompact.cjs is Lesson3-owned but is a CommonJS bridge: it is loaded via
    // createRequire from index.ts and must require() the vendored CommonJS primitives
    // (docx_kit / sections) in their own module system. The .cjs extension forces CJS
    // regardless of the app's "type":"module" (Node's native require(ESM) path otherwise
    // breaks it — surfaced by `payload generate:importmap`). require() is correct here, so
    // exempt this one file from the ESM-only rule while keeping every other rule.
    files: ['src/generator/buildSowCompact.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Vendored ARES generator is byte-pristine CommonJS (require()-style) that we must
    // never edit — see vendor/PROVENANCE.md. The sibling aresResources.js is our shim
    // but lives in the same require-path dir; linting it as ESM is noise. Exclude both.
    ignores: [
      '.next/',
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      'src/generator/vendor/**',
    ],
  },
]

export default eslintConfig
