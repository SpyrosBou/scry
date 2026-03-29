// @ts-check
const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');
const globals = require('globals');

const nodeSources = [
  '*.js',
  'scripts/**/*.js',
  'utils/**/*.js',
  'fixtures/**/*.js',
  'docs/**/*.js',
];

const unitTestSources = ['tests/unit/**/*.test.js'];
const playwrightSpecs = ['tests/**/*.spec.js'];

const baseLanguageOptions = {
  ecmaVersion: 2022,
  sourceType: 'commonjs',
  globals: {
    ...globals.node,
  },
};

const baseRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-console': 'off',
};

const browserLanguageOptions = {
  ...baseLanguageOptions,
  globals: {
    ...globals.node,
    ...globals.browser,
  },
};

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'tests/baseline-snapshots/**',
      'reports/**',
      '.pw-browsers/**',
      'utils/report-templates.js',
      'utils/report-templates/**',
      'docs/mocks/**',
      'sites/*.json',
      '.github/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  js.configs.recommended,
  prettierConfig,
  {
    files: nodeSources,
    languageOptions: baseLanguageOptions,
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...baseRules,
      'prettier/prettier': 'warn',
    },
  },
  {
    files: unitTestSources,
    languageOptions: baseLanguageOptions,
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...baseRules,
      'prettier/prettier': 'off',
    },
  },
  {
    files: playwrightSpecs,
    languageOptions: browserLanguageOptions,
    rules: {
      ...baseRules,
      'no-empty-pattern': 'off',
      'prettier/prettier': 'off',
    },
  },
];
