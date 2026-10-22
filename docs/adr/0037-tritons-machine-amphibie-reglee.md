# 0037 — Tritons : la machine amphibie de la grenouille, réglée autrement

- Statut : acceptée
- Date : 2026-10-22
- Auteur : Dev, cycle 46, issue #133

## Contexte

Les tritons (issue #133) vivent, comme les grenouilles (ADR 0036), entre la berge et l'eau du
paludarium, mais ils sont plus aquatiques : nage ondulante, repos sur la berge, chasse lente
près de la surface. L'issue demande de réutiliser la machine à états de #131 avec des durées
propres plutôt que de la dupliquer. Contraintes inchangées : simulation pure et
déterministe, sauvegarde (ADR 0028) relue à l'identique, autres environnements identiques à
l'octet.

## Décision

- **Aucun code de simulation nouveau** : le triton est une espèce de plus (`TRITON`,
  `sim/species.ts`) qui déclare `amphibian` ; `stepInPlace` l'envoie donc à `stepFrog` et
  `createFrog` comme la grenouille. Les cinq états (`posee`, `saut`, `entree`, `nage`,
  `sortie`) et leurs transitions sont les mêmes ; seuls les `AmphibianParams` changent.
- **Réglages du triton** (approximations de jeu) :

  | Réglage                       | Grenouille  | Triton      | Effet                                        |
  | ----------------------------- | ----------- | ----------- | -------------------------------------------- |
  | `cycleDuration`, `waterShare` | 40 s, 35 %  | 60 s, 70 %  | plus de temps dans l'eau, séjours plus longs |
  | `hopDuration`                 | 0,5 s       | 0,8 s       | déplacement à terre lent                     |
  | `hopMinRange`–`hopMaxRange`   | 4–9 cm      | 2–4 cm      | pas courts                                   |
  | `hopHeight`                   | 4 cm        | 6 mm        | à ras du sol : un pas rampant, pas un bond   |
  | `hopSlot`, `hopChance`        | 1,6 s, 45 % | 1,2 s, 50 % | pas fréquents, entrecoupés de repos          |
  | `floatDepth`                  | 8 mm        | 2 cm        | nage juste sous la surface, corps immergé    |
  | `swimSpeed`                   | 5 cm/s      | 3 cm/s      | chasse lente                                 |

  Un « saut » de triton est donc un pas rampant ; l'état garde son nom dans le code
  (`saut`), le sens physique est porté par les réglages. L'entrée dans l'eau est un pas
  rampant vers +X qui finit dans l'eau.

- **Population** : deux par défaut, trois au plus (l'issue : « un à trois »), déclarés
  après les grenouilles dans `SPECIES` et dans `PALUDARIUM.species` : les identifiants des
  axolotls (0, 1) et des grenouilles (2 à 4) ne changent pas, les tritons prennent 5 et 6.
- **Silhouette** : gabarit voxel `triton` (`render/fish-model.ts`, `NEWT_FISH`) : corps long
  et bas (4 rangées, 4 voxels d'épaisseur au plus contre 6 pour la grenouille), orange
  `#e07a2f` taché de `#1c1c22`, ventre `#f2c14e`, longue queue aplatie, bord inférieur sombre, qui
  ondule à la nage (battement à 1,4 Hz), quatre pattes courtes en parties paires (ADR 0035).
  Couleurs existantes de la palette : aucune couleur ajoutée.

## Options écartées

- **Module `sim/newt.ts` avec une marche continue à terre** (comme l'axolotl) : plus fidèle
  pour un animal qui rampe, mais double la machine à états (rivage, sortie, bornes) que
  l'issue demande de réutiliser ; le pas rampant court et bas s'en approche à l'écran.
- **Paramètre « mode de déplacement à terre »** dans `AmphibianParams` : aucun besoin tant
  que les réglages existants suffisent ; à reconsidérer si une espèce doit marcher en continu.
- **Chasse réelle** (poursuite de granulés) : nourrissage hors périmètre de #133 ; la
  « chasse lente » se lit ici comme une nage lente sous la surface.

## Conséquences

- Les captures `paludarium-*` montrent deux tritons de plus ; celles du bac tropical et du
  bassin sont inchangées à l'octet (aucun triton, aucune couleur ajoutée).
- Tout changement de `sim/frog.ts` touche désormais deux espèces : les tests des tritons
  (`sim/triton.spec.ts`) gardent les bornes et les transitions de cette seconde espèce.
- Les objets d'effectifs (`populationCounts`, `NO_FISH`) et les couches de `AquariumView`
  ont une entrée de plus (`docs/PIEGES.md`, cycle 44).
