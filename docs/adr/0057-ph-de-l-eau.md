# 0057 — pH de l'eau : dérive avec la charge, plages par espèce, jauge à zones

- Statut : acceptée
- Date : 2026-10-26
- Auteur : Dev, cycle 78, issue #236

## Contexte

L'épopée v0.12 « L'aquarium éducatif » commence par le pH : le modèle d'eau (ADR 0052, 0053) a température, azote, filtre et changement d'eau, mais pas de pH. L'issue #236 demande
un pH simulé (pur, déterministe) qui dérive avec la charge organique et revient vers l'eau
neuve au changement d'eau, une plage tolérée et une plage idéale par espèce, une usure lente
de la santé hors plage tolérée, une jauge « pH » à zones dans la section « Eau », et une
sauvegarde qui le garde (les anciennes sans pH restant lisibles). Les captures sans panneau
doivent rester identiques à l'octet.

## Décision

- **Champ `WaterState.ph`**, obligatoire dans l'état, borné à [4,0 ; 9,5] (`MIN_PH`,
  `MAX_PH`). Eau neuve (`freshWater`) au pH de l'environnement, `FRESH_PH` : tropical 7,0,
  bassin 7,5, paludarium 7,2, récif 8,2.
- **Dérive** (`stepPh`, appelée par `stepWaterInPlace`) : baisse de
  `PH_DROP_PER_LOAD_LITER · charge / litres · dt`, avec la charge déjà utilisée pour
  l'ammoniaque (`waterLoad`). Aucun tampon carbonaté (dureté hors périmètre) : sans
  changement d'eau, le pH descend jusqu'à 4,0. Un bac sans habitant ne dérive pas. Calibrage
  (`PH_DROP_PER_LOAD_LITER = 4,5e-4`), population par défaut :

  | Environnement | Charge | Litres | Baisse par heure simulée | Sortie de la plage tolérée la plus étroite |
  | ------------- | ------ | ------ | ------------------------ | ------------------------------------------ |
  | tropical      | 45,2   | 288    | 0,25                     | ~2,0 h (guppys sous 6,5)                   |
  | bassin        | 153,7  | 840    | 0,30                     | ~3,4 h (koïs sous 6,5)                     |
  | paludarium    | 20,2   | 105    | 0,31                     | ~2,3 h (axolotls sous 6,5)                 |
  | récif         | 60,1   | 473    | 0,21                     | ~1,9 h (clowns et chirurgiens sous 7,8)    |

  Même ordre de grandeur que les nitrates (« mauvaise » en moins de deux heures, ADR 0053) :
  le changement d'eau régulier règle les deux.

- **Changement d'eau** : `changeWaterInPlace(water, environment)` rapproche le pH de celui de
  l'eau neuve de la même part que les composés (`WATER_CHANGE_SHARE`, 30 %) :
  `ph + 0,3 · (FRESH_PH − ph)`. Moyenne linéaire : approximation assumée (le pH est
  logarithmique ; mélanger deux eaux ne moyenne pas leurs pH).
- **Plages par espèce** (`SPECIES_PH`, table typée sur `SpeciesId`) : tolérée et idéale
  (l'idéale comprise dans la tolérée, testé). **Toutes les valeurs sont des approximations de
  jeu** : ordres de grandeur courants de l'aquariophilie, **non recoupés avec une source
  consultable** pendant ce cycle (le réseau des agents est limité aux registres de paquets,
  et `docs/SOINS.md` évoqué par l'issue n'existe pas encore). Chaque ligne le dit dans le
  code. Seule contrainte vérifiée par les tests : l'eau neuve de chaque environnement est
  tolérée par toutes ses espèces, et la population par défaut le reste au moins 30 min
  simulées. Les idéales du néon (jusqu'à 7,2) et du guppy (dès 6,8) ont été choisies pour se
  recouvrir : le trio par défaut du bac tropical a un idéal commun de 6,8 à 7,2, visible sur
  la jauge (un idéal réduit à un point n'y laissait aucun vert). À recouper quand une fiche
  de soins sourcée existera.

  | Espèce          | Tolérée   | Idéale    |
  | --------------- | --------- | --------- |
  | néon            | 5,0 – 7,8 | 6,0 – 7,2 |
  | guppy           | 6,5 – 8,5 | 6,8 – 8,0 |
  | corydora        | 5,8 – 8,0 | 6,5 – 7,5 |
  | koï             | 6,5 – 9,0 | 7,0 – 8,0 |
  | axolotl         | 6,5 – 8,0 | 7,0 – 7,6 |
  | grenouille      | 6,0 – 8,0 | 6,5 – 7,5 |
  | triton          | 6,0 – 8,0 | 6,5 – 7,5 |
  | poisson-clown   | 7,8 – 8,6 | 8,0 – 8,4 |
  | chirurgien bleu | 7,8 – 8,6 | 8,1 – 8,4 |

- **Santé** (`sim/wellbeing.ts`) : un pH hors de la plage tolérée **de l'espèce** est une
  cause de poids `PH_STRESS = 0,5`, qui s'ajoute à la faim et à l'eau mauvaise (ADR 0054) :
  seule, du plein au plancher en 16 min simulées au lieu de 8. Paramètre facultatif de
  `healthStress` et `stepWellbeingInPlace` (absent : le pH ne compte pas), passé par
  `advanceInPlace`. Dans la plage, rien ne change : un bac neuf garde exactement les
  trajectoires d'avant (santé 1, `vigor` = 1).
- **Le pH n'entre pas dans l'indicateur global** `waterQuality` : il dépend des espèces
  présentes, l'indicateur non ; le mêler changerait aussi le trouble de l'eau et les captures
  `eau=`. La jauge porte sa propre zone.
- **Jauge** : zone calculée sur la valeur exacte (`phZone`) pour les **plages communes**
  des espèces présentes (`phBands`, intersection) : « idéal » (vert), « toléré » (orange),
  « hors plage » (rouge, au moins une espèce souffre). Bac vide : toute l'échelle est
  idéale ; plages incompatibles : pas de vert, voire tout rouge. `waterReadout` reçoit les
  espèces présentes et renvoie `ph` (au dixième), `phZone` et `phBands` ; `sameReadout` les
  compare. Le `meter` HTML ne sait pas faire rouge des deux côtés : la jauge est un
  `role="meter"` dont le fond est un dégradé à paliers nets (`phGaugeBackground`) et un repère
  clair, avec la valeur et la zone en toutes lettres (`aria-valuetext`, `title` : « pH 6,9,
  toléré », et le libellé de la zone affiché à côté de la valeur). Ligne à part sous les
  trois jauges, sur toute la largeur de la section : en quatrième colonne, la jauge faisait
  ~50 px et « Ammoniaque » était tronqué. Le panneau grandit d'une ligne (~22 px), qui tient
  à 1280 × 720 en deux colonnes (vérifié par capture et par `e2e/cadrage-panneaux.spec.ts`).
- **Exposition** : attribut `data-aqfish-ph` (« 6.9;tolere ») à côté de `data-aqfish-water`,
  laissé inchangé (les e2e existants lisent sa fin).
- **Sauvegarde** : schéma 1 inchangé ; `ph` facultatif dans `water` (`readWater(value,
environment)`), toujours écrit. Absent : pH de l'eau neuve de l'environnement de la
  sauvegarde. Présent : nombre fini dans [4 ; 9,5], sinon refus.
- **Capture d'interface** `three-quarter-panneau-eau` (1280 × 720, `vitesse=0`, section
  « Eau » en vue).

## Options écartées

- **pH « cible » qui tend vers une valeur d'équilibre selon les nitrates** : plus réaliste
  en apparence, mais couple deux valeurs de jeu et rend le calibrage opaque ; la dérive
  linéaire bornée est lisible et testable.
- **Moyenne des concentrations en ions H⁺ au changement d'eau** : plus juste, mais l'écart
  avec la moyenne linéaire reste faible sur une part de 30 % et ne sert pas le jeu.
- **pH dans l'indicateur global** : voir plus haut.
- **`meter` HTML avec `low` / `high` / `optimum`** : une seule zone dégradée de chaque
  côté de l'optimum, jamais rouge des deux côtés.
- **Sources citées « de mémoire »** : refusé ; une référence non vérifiée serait une source
  inventée.

## Conséquences

- Un bac laissé deux heures simulées sans changement d'eau voit ses espèces les plus
  exigeantes sortir de leur plage tolérée et perdre lentement de la santé : tout test long
  (plusieurs heures simulées) sur la nage doit en tenir compte.
- Captures sans panneau identiques à l'octet (rien ne change au rendu) ; les captures avec
  panneau (`front-panneau`, `telephone-eau`) montrent la quatrième jauge.
- Feuilles de catappa, dureté et fiches d'espèces liront `SPECIES_PH` et `water.ph`.

## Complément (cycle 151, #250 point 2) : recoupement avec `docs/SOINS.md`

`docs/SOINS.md` (§ 8 à 11) donne depuis le cycle 77 des pH cibles sourcés pour une partie des
espèces. Recoupement fait le 2026-11-05, **sans changer aucune valeur** (le lot de dette ne
change pas le comportement ; un écart conservé est dit ici) :

| Espèce / bac              | `SOINS.md`                                                          | `SPECIES_PH` / `FRESH_PH`         | Verdict                                                                                                               |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| néon                      | 5,0 – 7,0 (FishBase)                                                | toléré 5,0 – 7,8, idéal 6,0 – 7,2 | borne basse conforme ; bornes hautes relevées pour l'eau neuve à 7,0 et l'idéal commun avec le guppy (voir plus haut) |
| guppy                     | 7,0 – 8,0 (FishBase), 7,0 – 8,5 (SF)                                | toléré 6,5 – 8,5, idéal 6,8 – 8,0 | borne haute conforme à SF ; borne basse abaissée (le pH du bac baisse avec la charge)                                 |
| corydoras                 | 6,0 – 7,0 (SF)                                                      | toléré 5,8 – 8,0, idéal 6,5 – 7,5 | plus large que la source : approximation conservée                                                                    |
| koï                       | éviter < 5,5 et > 8,5 ; 7,0 – 7,4 cité (VIN/WSAVA)                  | toléré 6,5 – 9,0, idéal 7,0 – 8,0 | **écart** : borne haute tolérée 9,0 au-delà de 8,5 ; inatteignable en jeu (le pH ne fait que baisser depuis 7,5)      |
| axolotl                   | 7,4 – 7,6, tolérance 6,5 – 8,0 (Loh) ; 7,1 – 7,6 (UKY)              | toléré 6,5 – 8,0, idéal 7,0 – 7,6 | toléré **conforme** (Loh) ; idéal un peu plus large que UKY                                                           |
| grenouille, triton        | non vérifié                                                         | toléré 6,0 – 8,0, idéal 6,5 – 7,5 | approximation de jeu, aucune source                                                                                   |
| poisson-clown             | 8,3 (TFH)                                                           | toléré 7,8 – 8,6, idéal 8,0 – 8,4 | conforme                                                                                                              |
| chirurgien et récif       | 7,8 – 8,5, 8,1 – 8,3 préférable (Holmes-Farley) ; 7,8 – 8,3 (Merck) | toléré 7,8 – 8,6, idéal 8,1 – 8,4 | borne haute tolérée 8,6 au-delà de 8,5, inatteignable (eau neuve 8,2)                                                 |
| `FRESH_PH` récif 8,2      | 8,1 – 8,3 préférable                                                | —                                 | conforme                                                                                                              |
| `FRESH_PH` eau froide 7,5 | 7,4 – 7,6 (Loh)                                                     | —                                 | conforme                                                                                                              |
| `FRESH_PH` bassin 7,5     | 7,0 – 7,4 cité pour la koï                                          | —                                 | un dixième au-dessus de l'optimum cité, dans la plage tolérée                                                         |
| `FRESH_PH` tropical 7,0   | néon ≤ 7,0, guppy ≥ 7,0                                             | —                                 | à la jonction des deux sources : seule valeur commune                                                                 |

Les espèces ajoutées depuis (ADR 0070, 0090, 0095, 0097, 0103, 0104) ont déjà leurs bornes
rapprochées de Seriously Fish, FishBase ou FishKeeper dans le code ; `docs/SOINS.md` ne les
traite pas. Les lignes « approximation de jeu » de `water-ph.ts` le restent pour les valeurs
qui s'écartent des sources.
