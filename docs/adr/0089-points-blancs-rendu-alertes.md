# 0089 — Points blancs, rendu et alertes

- Statut : acceptée
- Date : 2026-11-01
- Auteur : Dev, cycle 120, issue #366

## Contexte

L'ADR 0088 (#360) a fait entrer la maladie des points blancs dans la simulation (`Fish.ich`,
stades incubation, visible, aggravé) sans rien en montrer. Cette issue la rend **visible** sur
les poissons et **signalée** par le tableau de bord, avec un renvoi vers la page « Maladies »
du wiki. Contraintes : captures de la graine 42 identiques à l'octet (aucun malade par
défaut), aucune allocation par image, couleurs de la palette (`docs/DA.md`).

## Décision

- **Rendu** (`render/fish-layer.ts`, `render/fish-model.ts`) : chaque sommet du modèle voxel
  porte un **rang de taché** (`aqfishSpot`), hachage sans état des coordonnées de son voxel
  dans le gabarit (`voxelSpotRank`), le même pour tout le voxel. Une intensité par instance
  (`aqfishIch`, à côté du ternissement `aqfishDull`) blanchit les voxels de rang inférieur à
  `intensité × ICH_SPOT_SHARE` (0,25), dans le shader de sommets, **après** le ternissement :
  les points restent clairs sur un poisson terni. Couleur : `koiBlanc` (`#f2ead8`) de la
  palette. Corps, queue et nageoires paires sont concernés.
- **Intensité** (`ichSpots`) : 0 sain ou en incubation, puis de 0,4 au début du stade visible
  à 1 au stade aggravé (`ichSeverity`). Mêmes voxels d'une image à l'autre, de plus en plus
  nombreux. Intensité nulle : aucun sommet touché (rang dans [0, 1)), donc rendu identique à
  l'octet à celui d'avant.
- **Synthèse de santé** (`sim/health-summary.ts`) : `ich` (animaux aux points visibles ou
  aggravés) et `ichAggravated` ; un animal aux points visibles compte aussi parmi les
  « malades » (`sick`), une seule fois. L'incubation, sans signe, n'est pas comptée. Le texte
  lu de la ligne « Malades » précise « dont N avec des points blancs ».
- **Alerte** (`sim/dashboard-alerts.ts`, `ichAlert`) : sujet `ich`, « Points blancs »,
  « attention » au stade visible, « critique » dès qu'un animal est aggravé ; cause et action
  sans promesse de guérison (les traitements viennent au lot 2/2, #361) ; champ `wiki:
  'maladies'`. Rang dans `ALERT_ORDER` : juste après le pH, avant la faim. L'alerte de santé
  ne compte plus que les malades **sans** points blancs (`sick − ich`, exact puisque les
  seconds sont inclus dans les premiers) : pas de doublon pour les mêmes animaux.
- **Lien vers le wiki** : sous une alerte dépliée qui a un `wiki`, un bouton « Wiki :
  Maladies » émet `wikiPageRequested` ; l'application ouvre le wiki sur la page
  (`SpeciesWiki.showPage`), qui replie les autres panneaux comme une ouverture ordinaire.
- **Paramètre d'URL** `points-blancs=1` : tous les poissons qui peuvent l'attraper
  (`catchesIch`) au stade aggravé à t = 0, après `population=`. En capture comme hors capture
  quand le monde est créé neuf (sinon l'e2e ne verrait pas le tableau de bord, masqué en
  capture). Aucun tirage. Captures ajoutées : `front-points-blancs`,
  `three-quarter-points-blancs`, `libre-points-blancs` (de près, contre la vitre).

## Options écartées

- **Taches dans le shader de fragments** (hachage de la position par pixel) : il aurait
  fallu retrouver le voxel à partir de la position interpolée (bords de faces ambigus) ; le
  rang par sommet donne des voxels entiers, nets en pixel art, pour un attribut de plus.
- **Ligne « Points blancs » dans la synthèse** : le bandeau bas tient déjà juste sur
  téléphone ; l'alerte et le texte lu suffisent.
- **Points tirés au hasard à chaque image** : scintillement ; le rang fixe garde des points
  stables qui s'étendent avec la maladie.
- **Part de 0,3** : essayée d'abord ; en vue de face, le néon perdait presque tout son bleu.

## Conséquences

- Les poissons malades nagent aussi moins vite (santé, `vigor`, ADR 0054) : les positions
  des captures avec `points-blancs=1` diffèrent de celles du bac sain.
- Le lot 2/2 (#361) pourra faire disparaître les points en effaçant `Fish.ich`, sans toucher
  au rendu.
- Toute alerte future peut renvoyer à une page du wiki par son champ `wiki`.
