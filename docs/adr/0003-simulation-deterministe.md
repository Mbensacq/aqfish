# 0003 — Simulation pure et déterministe, séparée du rendu

- Statut : acceptée
- Date : 2026-10-16
- Auteur : Mathis

## Contexte

L'équipe travaille sans mémoire d'une nuit à l'autre et doit pouvoir vérifier seule que
rien ne régresse. Une simulation entremêlée au rendu ou dépendante du temps réel est
difficile à tester et produit des captures qui changent à chaque exécution.

## Décision

- La simulation (`src/app/sim`) est écrite en TypeScript pur : ni Angular, ni Three.js.
- Hasard uniquement via un PRNG à graine ; temps uniquement via un pas fixe de 1/60 s.
- État du monde sérialisable en JSON.
- Ces règles sont imposées par ESLint (`no-restricted-imports`, `no-restricted-properties`,
  `no-restricted-syntax`).

## Conséquences

- La logique (banc, nourrissage, qualité de l'eau…) se teste en unitaire, vite et sans
  navigateur.
- Les captures sont reproductibles à graine et temps donnés.
- Le rendu doit interpoler entre deux pas de simulation pour rester fluide.
