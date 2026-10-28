# 0070 — Nouvelles espèces d'eau douce, lot 1

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 93, issue #238 (épopée v0.12 « L'aquarium éducatif », #229)

## Contexte

Le catalogue n'avait que neuf espèces ; Mathis en veut « beaucoup plus », réalistes. Le lot 1
porte sur l'eau douce tropicale de communauté, à choisir parmi neuf candidates de l'issue.
Contraintes : bac tropical à 24 °C (ADR 0067) et pH 7 de l'eau neuve (ADR 0057) ; bac par
défaut identique à l'octet (graine 42) ; palette commune seulement (ADR 0039) ; environ 600
lignes, donc quatre espèces.

## Décision

1. **Quatre espèces**, retenues pour couvrir quatre comportements et quatre silhouettes
   nettement différentes à l'échelle des captures :

   | Espèce | Nom scientifique | Comportement (mécanismes existants) | Silhouette et couleurs |
   |---|---|---|---|
   | Rasbora arlequin | *Trigonostigma heteromorpha* | banc serré en pleine eau (`schooling`, `depth` 25–75 %) | corps cuivré rosé, triangle noir à l'arrière |
   | Tétra citron | *Hyphessobrycon pulchripinnis* | banc lâche, toute la hauteur d'eau | losange jaune pâle, nageoires bordées de noir, œil rouge |
   | Loche kuhli | *Pangio kuhlii* | fond (`depth` 8 %), sans banc, active la nuit (`DIURNAL`) | anguille orangée barrée de brun |
   | Gourami nain | *Trichogaster lalius* | moitié haute, montées à la surface (respiration aérienne), solitaire ou en couple | ovale haut rouge barré de bleu, ventrales en filaments |

   Écartées pour ce lot : barbus de Sumatra (mordeur de nageoires, règle de compatibilité à
   créer), pléco commun (taille adulte incompatible avec le bac), bélier (*Mikrogeophagus
   ramirezi*, préfère une eau plus chaude que 24 °C), crevette cerise et néritine
   (invertébrés : déplacement et modèle propres). Elles restent pour un lot suivant.
2. **Bac tropical** : les quatre espèces sont ajoutées à `Environment.species` (panneau,
   wiki, cohabitation), **pas** à sa population de départ. Le monde par défaut et ses
   captures ne changent pas ; le panneau et l'attribut `data-aqfish-population` listent
   quatre lignes de plus (effectif 0).
3. **Valeurs** : tailles, températures tolérées, groupes, volumes et aliments sont repris des
   fiches Seriously Fish consultées le 2026-10-28 (références dans `sim/species-sheet.ts` et
   `sim/species-care.ts`) ; FishBase (fiches 10881 et 4774) a été lu pour le rasbora et le
   gourami et les désaccords sont écrits dans la référence. Le reste est marqué
   **approximation de jeu** : températures préférées (choisies pour contenir 24 °C), plages de
   pH de la simulation (ADR 0057, bornes proches de Seriously Fish), régime du rasbora,
   volume du tétra citron (base 80 × 30 cm citée, litres estimés), activité nocturne de la
   loche, tous les paramètres de nage.
4. **Compatibilité** (ADR 0055, règle inchangée) : le gourami nain est `territorial`
   (Seriously Fish : « timide et territorial », surtout envers les autres poissons à
   labyrinthe). Paires incompatibles nouvelles : koï avec chacune des quatre (prédateur),
   gourami nain et poisson-clown (territoriaux, jamais dans le même environnement). Les quatre
   sont compatibles entre elles et avec le néon, le guppy et le corydoras.
5. **Statut légal** : `a-verifier`, confiance « non vérifié », comme le néon : aucune ligne de
   l'annexe 2 de l'arrêté de 2018 n'a été lue pour ces espèces.
6. **Couleurs** : palette commune seulement (aucun ton ajouté). Le gourami emprunte le bleu
   des néons (`neonBleu`) ; aucune nouvelle espèce n'est dans le bac par défaut, donc les
   mesures du banc de néons sur image (`e2e/banc.spec.ts`) ne voient aucun pixel de plus.

## Non vérifié

- Températures préférées, pH, activité nocturne de la loche kuhli, territorialité envers les
  autres espèces : non recoupés avec une source primaire.
- Taille adulte : longueur standard (SL) de Seriously Fish ; FishBase donne une longueur totale
  (TL) plus grande (gourami : 9,5 cm TL).
- Températures : FishBase donne 22–25 °C (rasbora) et 25–28 °C (gourami), plus étroit ou plus
  chaud que Seriously Fish ; la fiche garde Seriously Fish et cite le désaccord.
- Statut légal en France : à vérifier auprès de la DDPP.

## Conséquences

- Le bac tropical propose sept espèces ; les tests de bout en bout qui comptaient trois lignes
  ou lisaient `neon:…,guppy:…,corydora:…` sont mis à jour (quatre effectifs nuls en plus).
- Ajouter une espèce reste une affaire de tables typées (`SpeciesId`) : le compilateur liste
  toutes les entrées manquantes (libellés, fiche, soins, pH, tempérament, rythme, statut
  légal, gabarit).
- Suite : un lot 2 d'eau douce (barbus, bélier, invertébrés) demandera une règle de
  compatibilité « mordeur de nageoires » et un déplacement d'invertébré.
