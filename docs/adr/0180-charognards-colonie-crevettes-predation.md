# 0180 — Charognards, colonie de crevettes et prédation des crevettes

- Statut : acceptée
- Date : 2026-11-25
- Auteur : Dev, cycle 303, issue #836 (tranche 2 de #732)

## Contexte

Après les brouteurs (ADR 0179), la nourriture tombée se décompose toujours (#638), les
crevettes cerises ne se reproduisent pas et ne sont jamais mangées (`docs/ECOSYSTEME.md` § 1).
Les scénarios S8 (bac à crevettes de 30 L stable, colonie qui grandit puis se stabilise) et S9
(crevettes avec des poissons rouges : elles disparaissent) restaient impossibles.

## Décision

- **Charognards** (`sim/scavenging.ts`) : crevette cerise (Garnelio : restes de nourriture) et
  néritine (approximation). À chaque pas fin, chaque charognard affamé (`isHungry`), dans
  l'ordre du tableau, mange le premier granulé posé au fond, où qu'il soit, et sa faim baisse
  comme pour un granulé mangé. La masse rejoint celle des repas (`pass.eaten`) : ammoniaque de
  la nourriture mangée (4 %), pas celle de la décomposition (8 %). Corydoras et ancistrus,
  nageurs du fond, mangeaient déjà les granulés tombés en nageant vers eux : inchangés.
  À gros pas, `feedAnimalsInPlace` nourrit aussi les charognards (restes du repas).
- **Colonie** (`sim/shrimp-colony.ts`), fonction du temps simulé et de la graine, appelée au
  pas fin (population, `sim/world.ts`) et à gros pas (`sim/ecosystem-step.ts`) :
  - à la fin de chaque couvée (`CLUTCH_PERIOD_SECONDS` = un jour de jeu), chaque femelle adulte
    (identifiant impair) en pleine santé, nourrie (`SHRIMP_FED_HUNGER` : faim sous 0,75, elle
    a mangé dans les dernières minutes), dans une eau bonne au pH toléré, fait éclore 2 à 4
    jeunes (hachage, aucun générateur), tant que la colonie a sa place : `shrimpPlace`, volume
    d'eau divisé par le besoin d'une crevette au plafond de la capacité (#729, 3 L). Seules les
    crevettes comptent dans cette place (une néritine demande à elle seule 40 L) ;
  - un jeune est un animal à `growth`, comme un alevin : il grandit en `FRY_GROWTH_TIME`, se
    rend à l'échelle des alevins et se sauvegarde (`growth` accepté pour les espèces en
    colonie) ;
  - **prédation** à la fin de chaque fenêtre de 60 s : chaque crevette est mangée avec la
    probabilité `1 − exp(−risque × 60 s)`, tirée du hachage (graine, identifiant, fenêtre).
    Les mangeurs viennent des listes `prey` de `sim/species-ecology.ts` (Practical
    Fishkeeping, FishKeeper) : un adulte n'est mangé que par les mangeurs d'adultes (poisson
    rouge, `ADULT_SHRIMP_RISK` : deux jours de jeu par crevette en moyenne pour un poisson
    rouge) ; un jeune par tous les mangeurs de crevettes (`YOUNG_SHRIMP_RISK`), multiplié par
    la part non couverte du refuge de plantes (#823, `fryCover`). Les otocinclus n'en mangent
    pas. La prédation des alevins au contact (`eatFryInPlace`) ne touche plus les jeunes
    marcheurs : un seul modèle, le même aux deux pas.
- **Néritines** : aucune éclosion en eau douce (`NERITE_HATCHES_IN_FRESHWATER`, Aquarium
  Breeder) : elles ne sont pas une espèce en colonie.
- **Charge des crevettes** : la crevette cerise a un modèle de 10 cm (lisibilité, #424) mais
  mesure 3 cm ; sa charge dans l'eau (`waterLoad`) prend sa longueur réelle
  (`LOAD_BODY_LENGTHS`). Sans cela, dix crevettes pesaient autant que dix poissons de 10 cm et
  aucun bac à crevettes de 30 L ne pouvait être stable.
- `broodWorldInPlace` (alevins d'exemple, `alevins=1`) passe dans `sim/fry-sample.ts` (place
  libérée dans `sim/world.ts`) et y fait éclore aussi les jeunes crevettes.

## Conséquences

- S8 et S9 deviennent des tests verts ; S1 à S13 inchangés.
- Les bacs par défaut n'ont ni crevette cerise ni néritine : empreintes de non-régression
  inchangées. Un bac importé avec des crevettes voit leur charge baisser (eau plus propre).
- Les sauvegardes anciennes se relisent à l'identique ; une sauvegarde avec des jeunes
  crevettes se relit avec leur âge. Une crevette mangée disparaît, comme un alevin mangé.
- Un massif dense de plantes abrite les jeunes même des poissons rouges : la colonie peut
  alors se maintenir (S9 se joue donc sans plantes). Les adultes, eux, finissent mangés.
- Approximations de jeu : durée des couvées, taille des couvées (2 à 4 au lieu de 20 à 30),
  maturité en un jour de jeu, risques de prédation, faim « nourrie ».
- Hors périmètre : escargots envahissants, biofilm, génétique des couleurs.
