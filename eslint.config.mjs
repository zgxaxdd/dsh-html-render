/**
 * ESLint flat config — G3: catch undefined-variable / unused-var regressions
 * (the A1 class) before they reach CI.
 */
import globals from 'globals'

export default [
  { ignores: ['vendor/**', 'node_modules/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }], // 有意吞掉浏览器边缘异常的空 catch
      'no-redeclare': 'error',
    },
  },
]
