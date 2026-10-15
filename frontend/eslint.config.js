// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Frontières d'architecture (voir docs/ARCHITECTURE.md) :
 * - src/app/sim    : simulation pure. Ni Angular, ni Three.js, ni render/ui.
 * - src/app/render : rendu Three.js. Pas d'Angular, pas d'ui.
 * - src/app/core   : utilitaires purs partagés. Ni Angular, ni Three.js.
 * - src/app/ui     : composants Angular. Peut tout importer.
 */
const noAngular = {
  group: ['@angular/*'],
  message: 'Cette couche doit rester indépendante d’Angular (docs/ARCHITECTURE.md).',
};
const noThree = {
  group: ['three', 'three/*'],
  message: 'Cette couche doit rester indépendante de Three.js (docs/ARCHITECTURE.md).',
};
const noRender = {
  regex: '(^|/)render(/|$)',
  message: 'La simulation ne doit pas dépendre du rendu (docs/ARCHITECTURE.md).',
};
const noUi = {
  regex: '(^|/)ui(/|$)',
  message: 'Cette couche ne doit pas dépendre de l’interface Angular (docs/ARCHITECTURE.md).',
};

/** Déterminisme de la simulation : ni hasard sans graine, ni horloge réelle. */
const determinismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Utiliser le PRNG à graine de la simulation.' },
    { object: 'Date', property: 'now', message: 'Le temps vient du pas fixe de la simulation.' },
    {
      object: 'performance',
      property: 'now',
      message: 'Le temps vient du pas fixe de la simulation.',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'Le temps vient du pas fixe de la simulation.',
    },
  ],
};

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/app/sim/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noAngular, noThree, noRender, noUi] }],
      ...determinismRules,
    },
  },
  {
    files: ['src/app/render/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noAngular, noUi] }],
    },
  },
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noAngular, noThree, noRender, noUi] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
