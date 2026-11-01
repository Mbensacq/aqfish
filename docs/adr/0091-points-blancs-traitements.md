# 0091 — Points blancs, lot 2/2 : traitements, erreurs et guérison

- Statut : acceptée
- Date : 2026-11-01
- Auteur : Dev, cycle 122, issue #361

## Contexte

Les ADR 0088 et 0089 ont fait entrer la maladie des points blancs dans la simulation
(`Fish.ich`) et à l'écran (taches, alerte). Il manquait de quoi **soigner** : choisir un
traitement, le doser, le répéter sur plusieurs jours simulés, et comprendre les erreurs
classiques (`docs/SOINS.md` §§ 5.1, 6, 12 et 14). Contraintes : déterminisme, captures
existantes identiques à l'octet, anciennes sauvegardes lues telles quelles, panneau des
réglages qui ne grandit pas à 1280 × 720 dans le cas par défaut (`docs/PIEGES.md`), budget de
style du panneau presque épuisé.

## Décision

- **Produits dans l'eau** (`sim/water.ts`) : champs facultatifs `salt` (g/L, au plus 5) et
  `medication` (doses d'étiquette, au plus 1,5) ; un changement d'eau en retire 30 %
  (`WATER_CHANGE_SHARE`, règle « retiré par changements d'eau », § 12) et efface les traces.
  Le médicament se dégrade aussi : demi-vie d'une journée simulée.
- **Protection** (`ichProtected`, `sim/treatment.ts`) : sel à 5 g/L dans une eau à 24 °C au
  moins (Merck), ou médicament à 0,2 dose au moins. Elle tue les formes libres : aucune
  nouvelle infection (`stepIchInPlace(…, treated)` met le taux à 0, sans tirage).
- **Cure** (`WaterState.ichCure`, dans [0, 1[) : avance de `dt / ichCureSeconds(T)` tant que le
  bac est protégé et compte un malade ; durée = 5 cycles (Texas A&M : au minimum 5
  traitements) d'une durée de 1 jour à 24 °C et plus, 2 jours de 19 à 24 °C, 4 jours en dessous
  (rythme du § 5.1). L'âge de chaque infection est ramené sous `(1 − cure) × 900 s` : les
  points reculent, l'alerte tombe au-delà des deux tiers ; à 1, `ich` est effacé. Protection
  interrompue (sel dilué, médicament non redosé) : la cure s'efface et les infections
  reprennent leur âge là où il en est (« arrêté trop tôt, la maladie revient »).
- **Boucle** (`stepInPlace`) : eau, maladie (avec la protection), traitement, santé ; rien de
  tout cela en mode décor.
- **Gestes** (`applyTreatmentInPlace`, `treatWorldInPlace`), un pas par bouton : chaleur
  +1 °C, sel +1 g/L, médicament 1 dose. Refus sans rien modifier, avec un message : quantité
  non finie, nulle ou négative ; aucun malade ; sel ou médicament avec un amphibien
  (marcheur ou amphibie) ou un invertébré (`INVERTEBRATES`, vide pour l'instant) ; sel
  au-delà de 5 g/L ; médicament au-delà d'une dose, ou redosé au-dessus de 0,5 dose ; chaleur
  au plafond (température tolérée la plus basse des espèces présentes) ou ajoutée alors que
  l'eau est à 2 °C ou plus sous la consigne (un choc stresse, ADR 0088). Sel avec des tétras,
  corydoras ou loches : accepté avec une mise en garde (prudence, § 4). Un geste efficace
  donné à un bac malade commence la cure aussitôt (affichée simulation à l'arrêt).
- **Chaleur** : ne guérit pas seule (niveau « soutien ») ; elle raccourcit le cycle, donc le
  traitement.
- **Interface** : section « Soins : points blancs » des réglages, affichée seulement en mode
  soins avec des points blancs visibles ou une cure en cours ; trois boutons courts (source et
  niveau de preuve en infobulle), une ligne d'état (produits, jours restants, délai avant de
  redoser), puis le message du dernier geste ou, à défaut, la ligne des sources. Quand elle
  est affichée, la liste des espèces défile plus tôt (variable CSS `--soins`) pour que
  « Sauvegarde » reste dans la deuxième colonne à 1280 × 720. Tableau de bord : alerte
  « Traitement en cours » (attention, après « Points blancs »), lien vers la page « Produits
  et traitements » du wiki ; l'action de l'alerte « Points blancs » renvoie aux soins.
- **Sauvegarde** : `salt`, `medication` et `ichCure` relus s'ils sont dans leurs bornes,
  refusés sinon ; absents dans les anciennes sauvegardes ; pas de changement de schéma.

## Valeurs : sources et approximations

- Sourcé (`docs/SOINS.md`) : sel 5 g/L une semaine à 24 °C au moins (Merck, § 5.1) ; au moins
  5 traitements (Texas A&M CIR920) ; traiter chaque jour au-dessus de 24 °C, un jour sur deux
  de 19 à 23 °C (aquariumscience.org, secondaire) ; notice Sera costapur, 1 mL pour 40 L les
  jours 1 et 3 (§ 1.4) ; tétras sensibles au sel (UF/IFAS) ; produits retirés par les
  changements d'eau (§ 12).
- **Approximations de jeu** : demi-vie du médicament, seuils de protection (0,2 dose) et de
  redosage (0,5 dose), durée d'un cycle en eau froide (4 jours, dans la fourchette 3–5 jours),
  pas de la chaleur et écart toléré (2 °C), effet de la chaleur sur la durée.
- **Prudence, non vérifié** : toxicité du vert de malachite et des bains de sel pour les
  amphibiens (§ 8, données partielles) ; toxicité du médicament pour les invertébrés ;
  sensibilité au sel des corydoras et loches.

## Options écartées

- **Charge de parasites par bac** (formes libres comptées) : plus fidèle, mais un état de plus
  à régler sans source chiffrée ; la cure en fraction suffit à rendre la répétition
  nécessaire.
- **Erreurs « possibles » qui blessent** (surdosage appliqué puis perte de santé) : il aurait
  fallu chiffrer une toxicité qu'aucune source consultée ne donne ; le refus expliqué
  enseigne la même chose.
- **Panneau « Soins » séparé** : un panneau de plus à placer entre les autres ; la section
  conditionnelle des réglages tient à 1280 × 720 en faisant défiler la liste des espèces.
- **Section toujours visible** : aurait poussé « Sauvegarde » hors du panneau dans le cas par
  défaut (`docs/PIEGES.md`).

## Conséquences

- La quarantaine (bac séparé, #264) pourra réutiliser les gestes avec un autre contexte.
- Une future espèce invertébrée s'ajoute à `INVERTEBRATES` : sel et médicament lui sont
  aussitôt refusés.
- Les mondes sans produit avancent exactement comme avant (aucun champ écrit, aucun tirage).
