# 0010 — Filtre de rendu désactivable : pixel art ou rendu direct

- Statut : acceptée
- Date : 2026-10-18
- Auteur : Dev (Claude), cycle 7, issue #33 (idée de Mathis)

## Contexte

Le rendu passe toujours par la cible basse résolution et la passe palette (ADR 0002,
ADR 0007). Mathis veut pouvoir voir les modèles 3D tels quels, en basculant à chaud, sans
perdre la vue en cours, le pixel art restant le mode par défaut et les séries de captures
existantes restant identiques.

## Décision

- **Deux filtres** : `pixel` (défaut, pipeline actuel inchangé) et `aucun`. Type, décodage
  (toute valeur inconnue ⇒ `pixel`) et mémorisation tolérante dans
  `core/render-filter/render-filter.ts` (pur, testé en unitaire).
- **Rendu direct** en mode `aucun` : `AquariumView.renderFrame()` fait un seul
  `renderer.render(scène, caméra)` vers l'écran, en pleine résolution (pixel ratio de
  l'appareil), sans anticrénelage (renderer inchangé). La caméra prend alors le rapport
  d'aspect du canvas au lieu de celui de la cible.
- **Bascule à chaud** (`AquariumView.setFilter`) : seule la projection est mise à jour ; la
  position, la cible, le préréglage suivi, la transition en cours et la scène sont conservés.
  La cible basse résolution reste dimensionnée dans les deux modes (retour immédiat, coût
  négligeable).
- **Priorité** du filtre initial : paramètre d'URL `filtre=pixel|aucun` > choix mémorisé
  (`localStorage`, clé `aqfish.filtre`, hors capture seulement) > `pixel`. En mode capture,
  le choix mémorisé est ignoré : sans `filtre=`, les captures restent en pixel art.
- **Interface** : bouton « Pixel art » (`aria-pressed`) après un séparateur dans la barre des
  vues, hors de la barre d'outils des préréglages ; touche `P`. L'état vient de l'hôte
  (`AquariumHost.filter`), exposé aux tests dans `data-aqfish-filter`.

## Options écartées

- **Rendu sans filtre dans une cible pleine résolution** puis copie à l'écran : mélange des
  translucides identique au pixel art (espace linéaire), mais une passe et une cible de plus
  pour un mode d'inspection. À reconsidérer si l'écart de teinte gêne.
- **Désactiver seulement la palette** (garder la basse résolution) ou seulement la basse
  résolution : l'idée demande les modèles « tels quels » ; des réglages plus fins relèvent
  des réglages de qualité, hors périmètre.
- **Mémoriser aussi en mode capture** : rendrait une capture dépendante de l'historique du
  navigateur, contraire au contrat de capture.

## Conséquences

- Sans filtre, l'eau et le verre se mélangent à l'écran sur des valeurs sRGB : les teintes
  vues à travers l'eau diffèrent du pixel art (sable plus vert, eau plus sombre ; voir
  `docs/PIEGES.md`, « Translucides plus clairs dans la cible basse résolution »).
- La scène étant en couleurs plates sans anticrénelage, le mode `aucun` ne produit qu'une
  vingtaine de couleurs : les tests le distinguent du pixel art par les couleurs hors palette
  et les blocs de `PIXEL_SIZE` rompus, pas par un nombre de couleurs.
- Les captures des 5 angles sont inchangées ; le harnais produit en plus
  `three-quarter-sans-filtre.png` (`filtre=aucun`).
