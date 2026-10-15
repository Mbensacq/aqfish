# 0002 — Pixel art par rendu 3D basse résolution et modèles générés

- Statut : acceptée
- Date : 2026-10-16
- Auteur : socle (Claude, avec Mathis)

## Contexte

La direction artistique est du pixel art, mais Mathis veut tourner librement autour du bac
et l'observer de dessus, de dessous et de côté. Des sprites 2D ne tiennent pas ces angles.

## Décision

- Vraie scène **Three.js**, rendue dans une cible basse résolution puis agrandie sans
  lissage (`NearestFilter`), avec palette limitée et contours en post-traitement.
- Animaux et décor en **voxels ou low-poly générés par le code** à partir de définitions
  déclaratives d'espèces.
- Three.js utilisé directement (pas de surcouche Angular pour Three.js).

## Options écartées

- Sprites 2D dans la 3D (billboards) : incohérents de côté et de dessous.
- Bibliothèque d'intégration Angular pour Three.js : une dépendance et une abstraction de
  plus, moins documentée que Three.js seul.
- Modèles 3D importés : licences à vérifier, style difficile à unifier, pas de variété
  procédurale.

## Conséquences

- Le rendu dépend de WebGL : non testable en unitaire (jsdom), d'où le contrat de capture
  et les tests Playwright.
- Les performances se mesurent sur une vraie machine, pas dans l'environnement des agents.
