# 0174 — Verdict de compatibilité par paire (eau, prédation, comportement)

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 294, issue #816 (tranche 1 de #730)

## Contexte

`docs/ECOSYSTEME.md` § 3.2 demande, pour chaque couple d'espèces, un verdict à trois niveaux
(compatible, avec précautions, incompatible) et sa raison. La compatibilité actuelle
(`sim/compatibility.ts`, ADR 0055) donne une raison unique (`predateur`, `territorial`,
`temperature`) tirée d'approximations non sourcées, et pilote les rivalités et l'évitement
des nageurs. Les données nécessaires existent désormais, sourcées champ par champ : plages de
la fiche (`sim/species-sheet.ts`) et données d'écologie (`sim/species-ecology.ts`, ADR des
tranches #784 à #786 : dureté tolérée, proies, territoriaux, mangeurs de nageoires, nageurs
rapides).

## Décision

Nouveau module pur `sim/verdict.ts`, qui **ne remplace pas encore** `compatibility()` (les
effets de comportement restent identiques ; la tranche 2 branchera l'interface) :

- **Profil** (`verdictProfile`) lu dans la fiche, l'écologie et `sim/verdict-data.ts` (données
  propres au verdict : longues nageoires, nageurs lents, « vit sans poissons », fraction de
  taille). Le calcul (`profileVerdict`) ne lit que deux profils : il se teste sur des profils
  fabriqués (espèce sans dureté, mangeur de nageoires, nageur lent, absents du jeu).
- **Eau** : salinité différente (douce et mer, d'après la nature de la dureté, GH ou KH) ou eau
  froide et tropicale (`WATER_CLASSES`) : incompatible, sans comparer les plages. L'eau tempérée
  n'exclut ni l'une ni l'autre (comme l'ADR 0147). Sinon, pour la température, le pH et la
  dureté (même nature, et si les deux espèces en ont une) : plages préférées communes, rien ;
  seules les tolérées, précautions ; aucune, incompatible. Bornes comprises.
- **Prédation** : liste nominative de l'écologie d'abord (adultes : incompatible ; jeunes
  seulement : précautions) ; à défaut, règle de taille limitée aux prédateurs du jeu
  (`TEMPERAMENTS`), non herbivores, pour une proie adulte de moins d'un tiers de leur taille.
- **Comportement** : deux territoriaux différents, précautions ; mangeur de nageoires face à de
  longues nageoires, incompatible ; nageur rapide face à un lent, précautions ; axolotl et
  triton face à toute espèce non amphibie, incompatible (« sans poissons »).
- Le verdict est le pire niveau de ses raisons ; chaque raison porte le statut des champs qui
  la décident : sourcée si tous le sont (références jointes), sinon approximation de jeu.
- La matrice de toutes les paires (`sim/verdict-matrix.ts`) est générée pour
  `docs/ESPECES.md` ; les désaccords entre sources y sont listés.

## Options écartées

- **Agrandir `compatibility.ts`** : le fichier pilote la boucle des nageurs ; y mêler le
  verdict sourcé aurait touché les empreintes de non-régression.
- **Règle de taille pour toutes les espèces** : elle faisait du gourami nain ou de l'ancistrus
  des mangeurs de tétras braise, contre les sources lues ; les listes nominatives suffisent hors
  des prédateurs du jeu.
- **Classe d'eau tempérée distincte** : elle aurait rendu le triton incompatible avec le poisson
  rouge alors que leurs plages se recoupent.

## Conséquences

- Aucun effet sur la simulation ni sur l'interface dans cette tranche : empreintes et captures
  inchangées.
- Aucune population par défaut n'a de paire incompatible (testé) ; le bac tropical en a avec
  précautions (pH et dureté, crevette cerise et mangeurs de jeunes).
- La fraction de taille, les longues nageoires et le pH des fiches restent des approximations
  de jeu à sourcer (`docs/ESPECES.md`, « Non vérifié et désaccords »).

## Addendum — tranche 2 (cycle 295, issue #818)

- **Espèces encore possibles** : `sim/possible-species.ts` (`possibleSpecies`) donne, pour
  chaque espèce du milieu, le pire verdict face aux espèces **présentes**, toutes les raisons
  gardées avec l'espèce visée, et le nombre restant (effectif maximal de `capacityLimits` moins
  l'effectif actuel). Plus de place compte comme `incompatible`, avec la raison de `canAdd` (ou
  sans texte quand seule la borne technique bloque). Tri stable : compatibles, précautions,
  incompatibles. Mode décor : ni verdict ni capacité.
- **Calcul** : fait par l'hôte au relevé des effectifs, avec la capacité déjà calculée
  (`CapacityShown.possible`), jamais dans la boucle d'affichage ; l'interface ne fait que
  mettre en texte (`computed`).
- **Interface** : liste repliable « Espèces encore possibles » dans la section Population,
  au format du cartel ; sous l'espèce ajoutée, ses raisons de verdict sourcées
  (`data-add-verdict`), en plus des avertissements d'ajout existants.
- **Écarté pour cette tranche** : réécrire `mixWarnings` et l'avertissement « mélange
  déconseillé » sur le verdict. Ils alimentent aussi le tableau de bord, le bilan et la liste
  des bacs ; les passer au verdict aurait changé leurs textes et leurs alertes (le bac tropical
  par défaut a des paires à précautions) et donc les tests existants, que l'issue demande
  inchangés. `compatibility()` reste la source des rivalités, des mélanges déconseillés et des
  alertes ; le verdict s'y ajoute comme explication sourcée.
