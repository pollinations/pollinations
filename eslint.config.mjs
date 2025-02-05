import blitzPlugin from '@blitz/eslint-plugin';
import { jsFileExtensions } from '@blitz/eslint-plugin/dist/configs/javascript.js';
import { getNamingConventionRule, tsFileExtensions } from '@blitz/eslint-plugin/dist/configs/typescript.js';

export default [
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/.wrangler',
      '**/bolt/build',
      '**/.history',
    ],
  },
  ...blitzPlugin.configs.recommended(),
  {
    rules: {
      '@blitz/catch-error-name': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@blitz/comment-syntax': 'off',
      '@blitz/block-scope-case': 'off',
      'array-bracket-spacing': ["warn", "never"],
      'object-curly-newline': ["warn", { "consistent": true }],
      'keyword-spacing': ["warn", { "before": true, "after": true }],
      'consistent-return': "warn",
      'semi': ["warn", "always"],
      'curly': ["warn"],
      'no-eval': ["warn"],
      'linebreak-style': ["warn", "unix"],
      'arrow-spacing': ["warn", { "before": true, "after": true }]
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      ...getNamingConventionRule({}, true),
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: [...tsFileExtensions, ...jsFileExtensions, '**/*.tsx'],
    ignores: ['functions/*'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../'],
              message: 'Relative imports are not allowed. Please use \'~/\' instead.',
            },
          ],
        },
      ],
    },
  },
];
