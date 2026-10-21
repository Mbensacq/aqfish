# 0001 — Angular 21 LTS plutôt qu'Angular 22

- Statut : acceptée
- Date : 2026-10-16
- Auteur : Mathis

## Contexte

Mathis veut un front Angular. La dernière version (22.2) exige Node ≥ 22.22.3 ; or
l'environnement d'exécution des agents fournit Node 22.22.0, ce qui fait échouer la CLI
Angular 22.

## Décision

Utiliser **Angular 21 (LTS)**, composants standalone, sans zone.js, test runner Vitest,
SCSS, routing activé, sans SSR.

## Options écartées

- Angular 22 avec une installation de Node plus récente à chaque nuit : fragile, dépend du
  réseau et ajoute une étape à chaque agent.

## Conséquences

- Ne pas monter de version majeure sans nouvelle ADR vérifiant la version de Node de
  l'environnement des agents (`node -v`).
- La CI utilise Node 22 (dernière 22.x) : compatible.
