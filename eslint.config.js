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

const esmNodeSources = ['app/svelte.config.js'];
const siteNodeSources = ['site/build.js', 'site/serve.js'];
const unitTestSources = ['tests/unit/**/*.test.js'];
const playwrightSpecs = ['tests/**/*.spec.js'];
const browserSources = ['site/js/**/*.js', 'site/app/js/**/*.js'];

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
      'app/node_modules/**',
      'app/.svelte-kit/**',
      'app/build/**',
      'app/.vercel/**',
      'app/.netlify/**',
      'app/.wrangler/**',
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
    files: esmNodeSources,
    languageOptions: {
      ...baseLanguageOptions,
      sourceType: 'module',
    },
    rules: {
      ...baseRules,
    },
  },
  {
    files: siteNodeSources,
    languageOptions: baseLanguageOptions,
    rules: {
      ...baseRules,
    },
  },
  {
    files: browserSources,
    languageOptions: browserLanguageOptions,
    rules: {
      ...baseRules,
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
