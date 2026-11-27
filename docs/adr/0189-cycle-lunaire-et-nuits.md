# 0189 — Cycle lunaire : phase pure du jour de jeu, clarté des nuits seulement

- Statut : acceptée (complète les ADR 0018, 0019 et 0082)
- Date : 2026-11-27
- Auteur : Dev, cycle 318, issue #856

## Contexte

Épopée v1.34 : seule la lumière du jour rythmait le bac ; toutes les nuits se ressemblaient.
Une lune qui croît et décroît rend la nuit plus lisible et plus vivante, sans toucher au jour ni
au contrat de capture (images de jour identiques à l'octet).

## Décision

1. **Phase pure** (`sim/moon.ts`) : jour de jeu = `World.time / dayLengthSeconds` (journées
   simulées depuis le temps 0, jamais l'horloge murale) ; phase = `0,5 + jour / 29,5` modulo 1
   (0 : nouvelle lune, 0,5 : pleine lune). Le monde neuf commence sous la **pleine lune** :
   c'est la nuit d'avant le cycle lunaire, donc les captures de nuit existantes (temps court)
   restent identiques à l'octet. Aucun champ ajouté au monde : sauvegardes et empreintes de
   non-régression inchangées. Le jour de jeu ne suit pas `startHour` : figer ou relancer
   l'horloge ne fait pas sauter la lune.
2. **Clarté de nuit** (`moonGlow`) : facteur dans ]0, 1], 1 à la pleine lune,
   `NEW_MOON_GLOW` (0,72) à la nouvelle lune, selon la part éclairée `(1 − cos 2πφ) / 2`, arrondi
   au centième (l'éclairage n'est recalculé que quand il change). **Approximation de jeu.**
3. **Nuit seulement** (`moonShadeAt`, `withMoonInto`) : clarté appliquée
   `mix(glow, 1, intensité du jour)`, **exactement** 1 en plein jour ; posée sur la lumière
   (`DayLight.moon`) après la lampe du bac, qui relève l'intensité et efface donc la lune.
4. **Rendu** (`render/scene-lighting.ts`) : la clarté se multiplie au facteur de ciel couvert de
   la pluie (ADR 0082) pour les lumières, l'eau, le décor, les nénuphars et la pièce ; les rayons
   ne suivent que la pluie. Les couleurs restent celles de la passe palette (tons de nuit,
   ADR 0021) : les nuits sans lune tirent le décor vers les tons plus sombres de la palette.
5. **Option « Lune »** (section « Affichage », `core/moon-option`, `aqfish.lune`) : activée par
   défaut, mémorisée à part de la sauvegarde ; coupée, la nuit garde la clarté de pleine lune.
   « Réduire les mouvements » garde `REDUCED_MOON_AMPLITUDE` (20 %) de la variation. En capture,
   l'option mémorisée est ignorée et `lune=` (réel dans [0, 1)) fixe la phase.

## Conséquences

- Captures `recif-three-quarter-pleine-lune` et `recif-three-quarter-nouvelle-lune` ; toutes
  les séries existantes inchangées.
- Hors périmètre : effets biologiques de la lune (ponte des coraux), disque de lune visible.
