import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/domains/invoices/*', '**/domains/stores/*', '**/domains/users/*'], message: 'Importe pela API pública index.ts do domínio.' },
      ] }],
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['playwright.config.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
