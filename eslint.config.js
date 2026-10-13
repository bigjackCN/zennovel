// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/node_modules/', 'coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Rules of hooks, plus the React Compiler checks (setState in effects, refs during render, …).
    files: ['packages/editor/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['*.config.{js,ts}', 'packages/*/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // `_name` marks something unused on purpose (e.g. a property removed by destructuring).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
);
