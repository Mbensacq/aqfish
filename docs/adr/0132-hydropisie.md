# 0132 — Hydropisie : maladie lente d'un poisson affaibli, stade avancé sans recul

- Statut : acceptée
- Date : 2026-11-11
- Auteur : Dev, cycle 198, issue #565

## Contexte

Cinquième maladie simulée, après les points blancs (ADR 0088), la pourriture des nageoires
(ADR 0114), le velours (ADR 0124) et les champignons (ADR 0128), sur la table des maladies
(ADR 0129). Sources (`docs/SOINS.md` § 5.7, Merck) : l'hydropisie est un signe (abdomen gonflé,
écailles hérissées « en pomme de pin ») d'une infection interne, Aeromonas le plus souvent ; la
cause est le stress et la mauvaise eau ; le traitement réel passe par un vétérinaire
(antibiotique sur ordonnance dans l'UE) ; le stade avancé est terminal, à pronostic réservé.
Recommandation 4 de `docs/SOINS.md` : pas de bouton « guérir » pour l'hydropisie avancée.

## Décision

- **Module `sim/dropsy.ts`**, champ `Fish.dropsy` (secondes simulées dans [0, 2400]), ligne
  `dropsy` ajoutée en fin de `DISEASES` : sauvegarde, transfert et quarantaine suivent sans autre
  changement.
- **Apparition** : seulement chez un poisson **affaibli** (santé < 0,5) dans une **eau dégradée**
  (ammoniaque ou nitrites au seuil « mauvaise », `finRotCauses`, 0 à 2 causes) ; taux bas
  (1/7200 s⁻¹ par cause). La durée vient de la chaîne : l'eau mauvaise fait baisser la santé en
  plusieurs minutes, puis l'apparition prend environ deux heures simulées. Ni spontanée ni
  contagieuse. Tirage par hachage sans état (sel propre), aucun tirage sans les deux conditions.
- **Stades** : début (aucun signe, < 600 s), ventre gonflé (< 1800 s, poids santé 0,5), écailles
  hérissées (stade avancé, poids santé 1,5).
- **Soins** : en eau dégradée, elle progresse ; en eau propre (changements d'eau, quarantaine),
  elle recule lentement (trois journées simulées depuis la fin du ventre gonflé) **avant** le
  stade avancé, plus du tout ensuite. Aucun produit du panneau « Soins » ne la soigne : elle
  n'est pas comptée parmi les malades traitables (comme la pourriture), et un traitement donné
  pour une autre maladie affiche `DROPSY_WRONG_TREATMENT`.
- **Euthanasie : conseil seulement**. L'alerte du stade avancé et la fiche du wiki disent qu'un
  vétérinaire peut conseiller une euthanasie sans souffrance ; le jeu n'a aucun geste pour cela.
- **Rendu** (`withDropsy`, `render/fish-layer.ts`) : attribut d'instance `vec2` (gonflement,
  écailles) sur le corps seul (la queue a un attribut à part, toujours nul). Le ventre descend et
  le corps s'élargit selon une cloche `max(0, 1 − (x / demi-longueur)²)` calculée dans le shader
  à partir de la position du sommet et d'un uniforme de demi-longueur par couche : fonction de la
  seule position, donc sans fente entre voxels voisins. Écailles : une bande du rang de taché, au
  stade avancé, en sable sombre.

## Options écartées

- **Poids de ventre en attribut de sommet** : un attribut de plus dépassait la limite d'attributs
  de WebGL (programme refusé, plus aucun poisson dessiné, `docs/PIEGES.md`).
- **Médicament efficace** : contraire aux sources (antibiotique vétérinaire, absent du jeu) et à
  la recommandation « pas de bouton guérir ».
- **Mortalité** : le jeu ne fait pas mourir ses animaux (plancher de santé) ; hors périmètre.
- **Compteur de durée d'eau mauvaise par animal** : état de plus dans la sauvegarde ; la santé
  joue déjà ce rôle de mémoire du stress.

## Conséquences

- Captures du bac par défaut identiques à l'octet (eau propre : aucun tirage ; garde explicite
  d'intensité nulle dans le shader).
- Les valeurs numériques sont des approximations de jeu : aucune source consultée ne chiffre les
  délais.
- Paramètre de capture `hydropisie=1` (stade avancé) ou `hydropisie=gonfle` (ventre gonflé).
