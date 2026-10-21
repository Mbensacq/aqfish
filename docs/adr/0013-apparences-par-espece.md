# 0013 — Apparences d'une espèce (dimorphisme) sans état dans la simulation

- Statut : acceptée
- Date : 2026-10-18
- Auteur : Dev, cycle 11 (issue #30)

## Contexte

Le guppy, deuxième espèce, a un fort dimorphisme : mâle petit à grande caudale colorée,
femelle plus grande et sobre. Le schéma d'espèce (`sim/species.ts`) ne portait qu'un jeu de
couleurs et le rendu une seule silhouette (`SLENDER_FISH`), une couche par espèce.

## Décision

- **Schéma** : chaque espèce déclare une apparence par défaut (`silhouette`, `colors`) et,
  optionnellement, des `variants` (`SpeciesVariant` : `id`, `name`, `silhouette`, `scale`
  dans (0, 1], `colors`). Le néon garde son schéma (pas de `variants`) ; `validateSpecies`
  vérifie aussi les variantes (identifiants uniques, échelle, couleurs, silhouette connue).
- **Silhouettes** : identifiants déclarés par la simulation (`SILHOUETTE_IDS`), gabarits
  voxel associés par le rendu (`SILHOUETTES`, `render/fish-model.ts`).
- **Répartition** : l'apparence d'un individu est `id mod nombre d'apparences`
  (`speciesVariantIndex`). Aucun champ ajouté au poisson, aucun tirage aléatoire : l'état
  du monde, sa sérialisation et toutes les trajectoires existantes sont inchangés.
- **Rendu** : une `FishLayer` par apparence (`poissons-guppy-male`, `poissons-guppy-femelle`),
  le nom historique `poissons-<espèce>` étant conservé pour une apparence unique.
- **Taille** : la simulation raisonne sur `bodyLength` (la plus grande apparence) pour les
  marges et distances ; `scale` ne change que le modèle affiché.

## Options écartées

- **Deux espèces distinctes** (`guppy-male`, `guppy-femelle`) : réutilise le schéma tel quel,
  mais mâles et femelles ne formeraient plus un même banc (congénères seulement) et la
  population serait dédoublée.
- **Champ `sex` dans l'état du poisson, tiré au hasard** : plus réaliste, mais modifie la
  sérialisation et la suite aléatoire de chaque poisson, donc les trajectoires des néons.
  Prématuré tant que le sexe n'a aucun effet sur la simulation.

## Conséquences

- Les apparences alternent avec les identifiants (consécutifs) : répartition équilibrée,
  mais pas de proportion réglable. Si la reproduction ou un dimorphisme de comportement
  arrive, le sexe devra devenir un champ de l'état (nouvelle ADR).
- Ajouter une espèce à apparence unique ne demande qu'une silhouette et des couleurs.
- Une couche de rendu de plus par apparence (deux `InstancedMesh` chacune).
