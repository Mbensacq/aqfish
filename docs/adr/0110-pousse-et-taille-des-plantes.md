# 0110 — Pousse des plantes à tige, taille au sécateur, ombre du fond

- Statut : acceptée
- Date : 2026-11-07
- Auteur : Dev, cycle 165, issue #477 (épopée v1.12 « Entretien et plantes »)

## Contexte

Les plantes du décor (ADR 0016) ondulent mais gardent la hauteur tirée de leur graine.
L'issue demande que les plantes à tige grandissent avec le temps simulé jusqu'à la surface,
que le joueur les taille d'un clic en mode Soins, qu'une plante trop haute assombrisse un peu
le fond, que la hauteur soit sauvegardée, et que les captures du bac par défaut restent
identiques à l'octet.

## Décision

1. **Modèle** (`plantModel(seed, scale, form, growth = 0)`) : `growth` voxels entiers ajoutés
   au haut de chaque tige d'une plante `tall`. Les tirages d'origine restent les mêmes, dans le
   même ordre : à `growth = 0`, le modèle est celui d'avant. La pousse porte ses propres
   feuilles courtes, tirées d'un sous-générateur par tige (graine dérivée) : une plante qui
   grandit garde ses voxels d'en dessous, seules les pointes des tiges montent.
2. **Pousse** (`sim/plant-growth.ts`) : réel de voxels par plante, `rythme × temps simulé`,
   rythme = 6 voxels par jour simulé × vigueur tirée de la graine (0,7 à 1,3), borné à un
   plafond entier qui garde la pointe un voxel sous la surface (`plantLimits`, mis en cache par
   élément). Avancée dans `stepInPlace` après l'eau, en mode soins seulement, dans les bacs
   vitrés d'eau douce (`hasPlantGrowth`, ceux des algues). À la seconde de capture (30 s), la
   pousse reste sous un voxel : rien ne change à l'image.
3. **État dans l'eau** : `WaterState.plantGrowth`, un objet « graine de la plante → voxels »,
   absent sans pousse, copié, enregistré et relu avec l'eau (`copyWater`, `readWater`,
   `readPlantGrowth`), comme les algues (ADR 0109) : aucun changement de schéma, une ancienne
   sauvegarde donne des plantes à leur hauteur d'origine. La clé est la **graine**, pas
   l'indice dans `World.decor` : l'éditeur retire et ajoute des éléments (les indices
   glissent), alors que chaque élément garde sa graine (`nextDecorSeed`). Le décor lui-même
   (`World.decor`, clé des caches de coraux et d'emprises) n'est jamais modifié par la pousse.
4. **Collision inchangée** : les obstacles restent ceux de la plante d'origine (calculés à la
   création du monde) ; la pousse est traversable, comme le feuillage. Recalculer les obstacles
   à chaque voxel de pousse demanderait de reconstruire `world.obstacles` en cours de partie.
5. **Taille** : bouton « Sécateur » à côté de la raclette (section « Eau », sur la même ligne :
   le panneau ne grandit pas) ; en main, un clic sur une plante à tige (`pickDecor`) la ramène
   à 80 % de sa hauteur totale, jamais sous sa hauteur d'origine (`prunedGrowth`). Raclette et
   sécateur s'excluent ; le clic ne nourrit pas.
6. **Rendu** : `DecorLayer.setPlantGrowth(index, growth)` remplace le maillage d'une plante
   seulement quand sa pousse **entière** change (paliers d'un voxel) ; les maillages par
   (graine, échelle, forme, pousse) sont gardés dans un cache borné à 64 entrées
   (`cachedPlantMesh`), chaque plante affichée ayant sa propre copie des positions (l'ondulation
   les réécrit). L'hôte expose la pousse avec le relevé de l'eau (4 fois par seconde au plus),
   jamais à chaque image.
7. **Ombre** (`plantShade`) : chaque plante au plafond retire 4 % de la teinte du décor
   (rochers, plantes, bois), 12 % au plus ; facteur exactement 1 sans plante au plafond.

## Conséquences

- Captures par défaut inchangées (pousse affichée nulle à 30 s, ombre à 1, modèle identique).
- Une capture de 3 000 s du bac par défaut (`bulles-robustesse`) montre des plantes plus
  hautes : voulu, le temps simulé fait pousser.
- Attribut de test `data-aqfish-plants` (« pousses;lumière en % ») et `data-aqfish-pruner`.
- À reprendre si besoin : collision de la pousse, taille des touffes, effet de l'ombre sur les
  algues ou sur la santé des plantes.
