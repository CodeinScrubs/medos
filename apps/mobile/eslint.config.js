// @ts-check
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

/*
 * Layering, enforced. Each layer imports only from the layers below it:
 *
 *   lib  <  theme, db, platform  <  components  <  features  <  app
 *
 *   lib         Pure TypeScript: Persian text, Jalali dates, numbers, crypto.
 *               No React, no device APIs — the part a web dashboard can share.
 *   theme       Design tokens.
 *   db          Schema, connection, settings, audit, live queries. No UI.
 *   platform    Device services: stored files, notifications, the error log.
 *   components  UI building blocks. They know nothing about patients.
 *   features    One folder per module: screens, queries, pure logic.
 *   app         Routes only; each file re-exports a feature's screen.
 *
 * Screens and components never touch the database client: queries live in
 * features/<name>/queries.ts. Colours come from the theme, never from a literal.
 */

const layer = (message, ...groups) => ({ group: groups, message });

const APP = layer('Nothing imports a route; routes import features.', '@/app', '@/app/*');
const FEATURES = layer('Only features and routes may depend on features.', '@/features/*');
const COMPONENTS = layer('Only features and routes may use UI components.', '@/components', '@/components/*');
const DB = layer('This layer sits below the database layer.', '@/db', '@/db/*');
const PLATFORM = layer('This layer sits below the platform layer.', '@/platform/*');
const THEME = layer('This layer has no UI.', '@/theme', '@/theme/*');
const DB_CLIENT_IN_UI = layer(
  'Screens and components do not touch the database client; add a query to features/<name>/queries.ts.',
  '@/db/client',
);

const restrict = (...patterns) => [
  'error',
  {
    paths: [
      {
        name: '@expo/vector-icons',
        message: 'Import the icon family directly, e.g. @expo/vector-icons/Ionicons, to avoid bundling unused fonts.',
      },
    ],
    patterns,
  },
];

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['android/*', 'dist/*', '.expo/*', 'src/db/migrations/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'no-restricted-imports': restrict(),
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  /* ------------------------------------------------------------ boundaries */
  {
    files: ['src/lib/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrict(
        layer('lib/ is the bottom layer: pure TypeScript, no app code.', '@/*', '!@/lib/*'),
        layer(
          'lib/ has no UI, no device APIs and no database: it must run anywhere, including a future web dashboard.',
          'react',
          'react-native',
          'react-native-*',
          'expo-*',
          '!expo-crypto',
          'drizzle-orm',
          'drizzle-orm/*',
        ),
      ),
    },
  },
  {
    files: ['src/theme/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(APP, FEATURES, COMPONENTS, DB, PLATFORM),
    },
  },
  {
    files: ['src/db/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrict(
        APP,
        FEATURES,
        COMPONENTS,
        PLATFORM,
        THEME,
        layer('The database layer has no UI.', 'react-native'),
      ),
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(APP, FEATURES, COMPONENTS, DB, THEME),
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(APP, FEATURES, DB),
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrict(APP),
    },
  },
  {
    files: ['src/features/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrict(APP, DB_CLIENT_IN_UI),
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', 'src/test/**', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Colours come from the theme (src/theme/tokens.ts).',
        },
        {
          selector: 'Literal[value=/^(?:rgb|hsl)a?[(]/]',
          message: 'Colours come from the theme (src/theme/tokens.ts).',
        },
        /*
         * The two invariants a reviewer cannot see by reading a diff.
         *
         * An async transaction callback returns a promise immediately, so the
         * driver commits before any awaited statement has run: the work looks
         * transactional and is not. Inside a transaction use .run() / .all() / .get().
         */
        {
          selector:
            "CallExpression[callee.property.name='transaction'] > :matches(ArrowFunctionExpression, FunctionExpression)[async=true]",
          message:
            'db.transaction() is synchronous with this driver: an async callback commits before your statements run. Use .run() / .all() / .get() inside it.',
        },
        /*
         * Clinical data is never removed, only stamped with deletedAt, so a
         * mistaken delete during a shift stays recoverable.
         */
        {
          selector: "CallExpression[callee.object.name=/^(db|tx)$/][callee.property.name='delete']",
          message: 'Clinical data is never hard-deleted. Stamp deletedAt with softDelete() instead.',
        },
      ],
    },
  },

  /* ----------------------------------------------------------------- node */
  {
    files: ['*.config.js', 'plugins/**/*.js', 'scripts/**/*.js', 'metro.config.js', 'babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly', process: 'readonly', require: 'readonly', module: 'writable' },
    },
  },
]);
