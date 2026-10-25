# 0053 — Qualité de l'eau : indicateur à trois niveaux, chauffage, eau trouble

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 71, issue #207

## Contexte

Le modèle d'eau (`sim/water.ts`, ADR 0052) n'était ni visible ni réglable. L'issue #207
demande une section « Eau » du panneau (température réglable « avec chauffage », jauges
d'ammoniaque, de nitrites et de nitrates, bouton « Changer l'eau »), un indicateur global
lisible sans la couleur, et une eau un peu plus trouble et verdâtre quand elle est
mauvaise, sans coût par image ; eau saine : captures inchangées à l'octet.

## Décision

- **Indicateur dans `sim/water-quality.ts`**, fonction pure `waterQuality(water,
  environment)` : pire niveau parmi quatre critères, chacun atteint dès son seuil (`>=`).
  Seuils de jeu : ammoniaque et nitrites 2 / 5, nitrates 20 / 40, écart de température à
  celle de l'environnement 3 / 6 °C, dans les deux sens. Une valeur non finie est
  « mauvaise ». Avec la population par défaut du bac tropical, ammoniaque (~0,8) et nitrites
  (~1,3) restent « bons » ; les nitrates passent « à surveiller » avant une heure simulée et
  « mauvaise » avant deux (test de calibrage). Le filtre n'entre pas dans l'indicateur.
- **Chauffage = consigne (thermostat)** : champ facultatif `WaterState.heater`, en °C dans
  [16, 32], arrondi au dixième ; absent, l'eau vise la température de l'environnement
  (`targetTemperature`). Il chauffe ou refroidit : un seul curseur, pas de distinction
  chauffage / refroidisseur. Dans l'eau plutôt que dans les réglages : il change la
  simulation et doit se rejouer au bit près ; il est donc sauvegardé avec l'eau, sans
  changer de schéma (champ facultatif, relu validé). Changer d'environnement repart d'une
  eau saine, consigne comprise.
- **Relevé au dixième** (`waterReadout`) : l'hôte le recalcule au plus toutes les 30 pas
  (0,5 s simulée) et ne met à jour le signal du panneau et `data-aqfish-water` que s'il
  change ; le niveau est calculé sur les valeurs exactes.
- **Eau trouble** : un seul palier, appliqué seulement à l'eau mauvaise
  (`waterTurbidity`). Une demi-teinte serait ramenée par la passe palette à l'une des
  couleurs voisines selon le fond. `AquariumScene.setTurbidity` mêle les couleurs d'entrée
  de jour du volume et de la surface vers deux tons d'entrée (`eauTroubleEntree`,
  `surfaceTroubleEntree`, hors palette : aucune autre image ne change) ; la nuit mêle
  ensuite comme avant. Aucun passage de rendu ni uniform en plus ; à 0, `lerpColors(a, b,
  0)` rend exactement les couleurs d'avant. Proportions choisies sur capture : volume gris
  vert sombre (`verreSombre`) et surface verte (`vegetation`) au bac tropical.
- **Paramètre de capture `eau=`** (`bonne`, `a-surveiller`, `mauvaise`), en capture
  seulement : eau d'exemple à t = 0 (`sampleWater`, nitrates à 1,25 fois le seuil, qui ne
  baissent qu'au changement d'eau). Valeur inconnue ou absent : rien ne change.
- **Panneau** : section « Eau » après « Journée » ; indicateur et « Changer l'eau » sur la
  ligne du titre, curseur du chauffage, trois jauges `meter` (seuils en `low` / `high`,
  plein à 1,5 fois le seuil « mauvaise »). Pour que tout tienne à 1280 × 720 sans masquer
  « Exporter / Importer », le panneau passe sur **deux colonnes** (532 px) sur un écran d'au
  moins 900 px de large et d'au plus 900 px de haut ; ailleurs, une colonne.

## Options écartées

- **Demi-trouble pour « à surveiller »** : invisible ou parasite après la passe palette.
- **Couleur ajoutée à la palette commune** pour l'eau trouble : change les images des autres
  environnements (`docs/PIEGES.md`).
- **Section repliable ou panneau « Eau » séparé** : un clic de plus pour l'état principal du
  bac ; la règle des panneaux exclusifs (#136) aurait aussi dû l'intégrer.
- **Consigne dans `SaveSettings`** : la température visée change l'état simulé, elle doit
  suivre le monde.

## Conséquences

- La capture `front-panneau` change (section ajoutée, deux colonnes) ; les captures d'eau
  saine restent identiques à l'octet.
- Les effets de l'eau sur les poissons, les alertes et les sons restent hors périmètre ; ils
  liront `waterQuality`.
