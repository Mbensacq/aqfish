# 0018 — Cycle jour/nuit : horloge sur le temps simulé et courbe de lumière

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 18, issue #51

## Contexte

L'épopée v0.3 « Le décor » ajoute un cycle jour/nuit : l'éclairage passe de l'aube au jour,
au crépuscule puis à la nuit (intensité et teinte de la lumière, teinte de l'eau), la nuit
restant lisible. Contraintes : déterminisme et contrat de capture (l'heure ne doit pas
dépendre de l'horloge murale), captures par défaut identiques à l'octet près, et la passe
palette (ADR 0007) reste le seul endroit qui fixe les couleurs affichées.

## Décision

- **Horloge sur le temps simulé** (`sim/daylight.ts`) : `DayClock` (données pures :
  `startHour`, `dayLengthSeconds`, `frozen`) et `hourAt(horloge, temps)` =
  `startHour + 24 · temps / dayLengthSeconds` modulo 24. Le temps est `World.time`, avancé
  seulement par les pas fixes : l'heure ne lit jamais `performance.now()` ni `Date`.
  `World` ne change pas (l'horloge est un état de l'hôte, comme le filtre de rendu).
  `freezeClock` / `resumeClock` figent et reprennent sans saut d'heure.
- **Valeurs par défaut** : journée de **1 200 s** (20 min ; 180 s jusqu'au cycle 21, voir
  « Révision » ci-dessous), départ à **midi**. En capture sans
  `heure=`, midi figé : les séries existantes restent identiques. `heure=` (réel dans
  [0, 24), valeur invalide ignorée) fige l'heure, en capture comme hors capture. La
  touche **`H`** fige ou remet en marche l'heure (sans effet en capture). Les touches
  **`J`** (plein jour) et **`N`** (nuit) figent l'heure à midi ou à minuit
  (`freezeClockAt`), que l'horloge tourne ou non ; `H` reprend ensuite depuis l'heure
  figée, sans saut.
- **Courbe de lumière** `lightAt(heure)` : élévation du soleil `e = −cos(2π · h / 24)` ;
  intensité `i = smoothstep(−0,25 ; 0,5 ; e)`, d'où plein jour de 8 h à 16 h, pleine nuit
  avant ≈ 5 h et après ≈ 19 h. Teintes (lumière directe et ciel) : mélange nuit → blanc
  selon `i`, puis vers une teinte d'aube et de crépuscule avec un poids
  `0,6 · 4 · i · (1 − i)`, nul aux extrêmes. Mélanges écrits `a · (1 − t) + b · t` :
  exactement blanc et `i = 1` à midi. Fonction continue, périodique, symétrique autour de
  midi ; aucune couleur de la palette (grandeurs abstraites dans [0, 1]).
- **Traduction dans le rendu** :
  - `render/aquarium-scene.ts` (`setDaylight`) : lumière ambiante de 1,1 (nuit) à 2 (jour)
    teintée du ciel, lumière directe de 0,24 à 1,2 teintée ; eau (non éclairée) glissant de
    `eauMoyenne` / `eauClaire` vers `eauProfonde` / `eauSombre` (couleurs de la palette,
    `lerpColors`, exact à midi).
  - `render/water-light.ts` : caustiques **opaques par paliers** de la palette
    (`sableClair` dès `i ≥ 0,75`, `sable` dès `0,4`, éteintes en dessous) ; reflet de
    surface atténué jusqu'à 85 % de son opacité la nuit.
  - L'hôte ne recalcule l'éclairage que si l'heure a bougé d'au moins 0,01 h (soit 0,5 s
    avec la journée de 20 min ; évite une allocation par image pour un changement
    invisible après la passe palette).

## Options écartées

- **Heure dans `World`** : aurait changé la forme de l'état (sérialisation, tests de
  monde) sans bénéfice : l'heure est une fonction du temps du monde et de réglages d'hôte.
- **Couleurs de nuit ajoutées à la palette** (sable bleuté…) : la passe palette choisit la
  couleur la plus proche ; une couleur ajoutée peut capter des pixels de jour et casser
  l'identité des captures par défaut. À reconsidérer avec une comparaison avant/après.
- **Caustiques à opacité proportionnelle à l'intensité** : sur un sable assombri, une
  caustique translucide retombe sur des couleurs ternes (motif de craquelures brunes au
  crépuscule, vu sur capture) ; les paliers opaques restent nets.
- **Fonction en escalier par plages horaires** : non continue.

## Conséquences

- Les poissons et les bulles, en couleurs plates (ADR 0009, 0017), ne s'assombrissent pas
  la nuit : ils restent lisibles, mais paraissent éclairés. À traiter avec les
  comportements nocturnes (v0.10) si besoin.
- Le sable de nuit tombe sur `roche` (gris) et celui du crépuscule sur `sableOmbre` : effet
  de nuit sans couleur nouvelle.
- Hors capture, l'heure fait le tour en 20 min (0,02 h par seconde simulée) : un test de
  bout en bout qui compare des images hors capture doit figer l'heure (`heure=`) s'il dure
  longtemps ; un test qui attend que l'heure avance doit prévoir au moins une seconde
  simulée par 0,02 h.
- Le panneau de contrôle (durée de la journée, heure) viendra avec une issue suivante (#52).

## Révision (cycle 21, issue #75)

Demande de Mathis : une journée de 180 s passait trop vite pour observer le bac. La durée
par défaut passe à **1 200 s** (20 min), une seule constante
(`DEFAULT_DAY_LENGTH_SECONDS`, `sim/daylight.ts`) ; la durée deviendra réglable avec le
panneau de contrôle (#52). Les touches `J` et `N` permettent d'aller directement au plein
jour ou à la nuit sans attendre. Captures inchangées : en capture, l'heure reste figée
(midi par défaut, ou `heure=`), la durée de la journée n'y intervient pas.

## Révision (cycle 23, issue #73)

`NIGHT_ELEVATION` passe à −0,5 (pleine nuit de 20 h à 4 h) et la teinte d'aube et de
crépuscule pèse `0,75 · √(4i(1 − i))` ; tons de nuit et du crépuscule ajoutés à la passe
palette, pondérés par l'heure : voir l'ADR 0021.
