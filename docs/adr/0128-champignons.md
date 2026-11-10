# 0128 — Champignons (Saprolegnia) : quatrième maladie, sur blessure ou faiblesse

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 193, issue #548

## Contexte

Épopée v1.16, quatrième maladie simulée après les points blancs (ADR 0088), la pourriture des
nageoires (ADR 0114) et le velours (ADR 0124). La saprolégniose (`docs/SOINS.md` § 5.6) est une
infection opportuniste : elle s'installe sur une peau abîmée ou un animal affaibli (§ 5.12),
jamais sur un animal sain. Contraintes : déterminisme, captures par défaut identiques à l'octet,
sauvegardes anciennes relues telles quelles, pas de nouveau produit, pas de contagion nouvelle.

## Décision

- **État** : champ facultatif `Fish.fungus`, progression en secondes simulées dans [0, 900],
  comme le velours ; absent, l'animal est sain.
- **Stades** : début [0, 180 s[ (aucun signe), coton [180, 600 s[ (demi-cause de santé),
  avancé à partir de 600 s (cause entière).
- **Apparition** (`fungusCauses`, 0 à 2) : une **blessure** (signes visibles de points blancs,
  de pourriture des nageoires ou de velours ; les blessures de territoire ne sont pas
  modélisées, ADR 0106) et un **affaiblissement** (santé sous 0,5) comptent chacun pour une
  cause ; taux 1/3600 s⁻¹ par cause. Sans cause, aucun tirage : un animal sain en eau propre
  ne l'attrape jamais. Chaîne voulue : un animal affamé ou une eau mauvaise font baisser la
  santé, l'animal affaibli peut alors se couvrir de coton.
- **Pas de contagion** : approximation de jeu, les spores sont supposées présentes dans tout
  bac (hors périmètre de l'issue).
- **Traitement** : le médicament existant (`medicationProtects`), dans une **eau propre**
  (`finRotCauses` nul) : le coton recule et l'animal guérit en deux journées simulées au plus
  (redose nécessaire, comme le velours). Médicament en eau chargée : la maladie est figée. Sans
  médicament, elle progresse jusqu'au maximum même si la blessure s'est refermée. Sel et
  chaleur n'agissent pas : mise en garde `FUNGUS_WRONG_TREATMENT`. Une double dose ne soigne pas
  plus vite (la guérison dépend de « médicament actif », pas de la dose).
- **Ordre dans le pas** : après le velours, avant la dégradation du médicament (même eau de
  début de pas que le velours).
- **Rendu** : coton blanc grisâtre (`PALETTE.texteInterface`, distinct du blanc crème des
  points blancs) en voxels pleins sur le rang d'effilochage (bout de la caudale, bord des
  nageoires) et une bande du rang de taché juste au-dessus de celle des points blancs.
- **Interface** : alerte « Champignons (coton blanc) », conseil de la pharmacie (médicament),
  fiche « Champignons (Saprolegnia) » de la page « Maladies » complétée, paramètre de capture
  `champignons=1`. Les champignons suivent l'animal transféré et comptent comme malades en
  quarantaine.

## Options écartées

- **Apparition sous le stress du bac** (`ichStress`) comme le velours : contredit la source
  (opportuniste sur blessure) et le critère « jamais spontanée sur un animal sain ».
- **Basse température comme cause** (facteur sourcé, § 5.6) : demanderait une plage par espèce
  plus fine que celle de la fiche ; laissé pour plus tard.
- **Nouveau produit antifongique** (acriflavine, formol) : hors périmètre.

## Conséquences

- Un bac jamais nourri finit par compter des cas (animaux au plancher de santé) : les tests
  longs qui affament un bac voient apparaître `fungus`.
- Captures et sauvegardes existantes inchangées : aucun tirage ni champ sans cause.
- Toutes les durées et tous les taux sont des approximations de jeu.
