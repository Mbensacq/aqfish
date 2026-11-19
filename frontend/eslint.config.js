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

/**
 * Limites de lisibilité du code de production (docs/CONVENTIONS.md, chantier #686). Les tests
 * (`*.spec.ts`, `e2e/`) en sont exemptés : un test long et linéaire reste lisible.
 */
const QUALITY_LIMITS = {
  'max-lines': 600,
  'max-lines-per-function': 80,
  complexity: 15,
  'max-depth': 4,
  'max-params': 5,
};

/** Règle ESLint de chaque limite, au seuil donné. */
function qualityRule(name, max) {
  if (name === 'max-lines' || name === 'max-lines-per-function') {
    return ['error', { max, skipBlankLines: true, skipComments: true }];
  }
  return ['error', name === 'complexity' ? max : { max }];
}

/**
 * Fichiers qui dépassaient les limites à leur introduction (audit du 2026-11-17), avec leur
 * valeur d'alors : `qualite-exceptions.json`. Chaque ligne est une dette. Le seuil d'un fichier
 * ne peut que baisser : un fichier qui empire fait échouer le lint. Quand une refactorisation
 * passe un fichier sous les limites, sa ligne est supprimée ou abaissée dans la même PR
 * (`npm run qualite:bilan` liste ce qui peut l'être). Aucune nouvelle ligne sans décision de
 * Mathis.
 */
const QUALITY_EXCEPTIONS = require('./qualite-exceptions.json');

const qualityConfigs = [
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: Object.fromEntries(
      Object.entries(QUALITY_LIMITS).map(([name, max]) => [name, qualityRule(name, max)]),
    ),
  },
  ...Object.entries(QUALITY_EXCEPTIONS).map(([file, limits]) => ({
    files: [`src/app/${file}`],
    rules: Object.fromEntries(
      Object.entries(limits).map(([name, max]) => [name, qualityRule(name, max)]),
    ),
  })),
];

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
    // Sections du panneau « Réglages » (#697, ADR 0161) : composants posés sur le `fieldset`
    // de la section par un sélecteur d'attribut, pour que le DOM ne change pas.
    files: ['src/app/ui/control-panel/*-section.ts'],
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
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
  ...qualityConfigs,
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
