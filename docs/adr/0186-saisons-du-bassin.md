# 0186 — Saisons du bassin : température ambiante et repos hivernal des koïs

- Statut : acceptée (complète les ADR 0052, 0053, 0055 et 0170)
- Date : 2026-11-27
- Auteur : Dev, cycle 315, issue #858

## Contexte

Le bassin à koïs est extérieur et sans chauffage, mais sa température restait fixée à 18 °C
toute l'année (`WATER_TEMPERATURES.bassin`). Un débutant doit comprendre que les koïs
ralentissent et mangent peu quand l'eau passe sous 10 °C. La température d'environnement sert
aussi de référence à la qualité de l'eau (`TEMPERATURE_THRESHOLDS`), aux alertes, au bilan et
au stress des points blancs (`ichStress`) : une eau à 4 °C en hiver ne doit pas y passer pour
« mauvaise » alors qu'elle est normale pour la saison.

## Décision

1. **Calendrier** (`sim/pond-season.ts`) : le jour de l'année se compte en jours de jeu
   (`DEFAULT_DAY_LENGTH_SECONDS`, comme l'azote, ADR 0170), à partir du 19 mai au temps 0
   (`START_DAY_OF_YEAR` = 138) ; année de 365 jours, sans années bissextiles.
2. **Courbe** : sinusoïde de moyenne 14 °C et de demi-écart 10 °C (de 4 °C fin janvier à
   24 °C fin juillet, `WARMEST_DAY_OF_YEAR` = 205), continue et lisse au passage de l'année ;
   **approximation de jeu** pour un bassin de jardin en climat tempéré. Au temps 0, elle vaut
   18,06 °C : le bassin démarre comme avant.
3. **Température ambiante dans l'eau** : `WaterState.ambient` (°C, facultatif), posé à chaque
   pas par `stepPondSeasonInPlace`, au bassin seulement, au début de `stepLivingWaterInPlace`
   (pas fin et gros pas). `ambientTemperature(water, environment)` = `ambient` ou, à défaut,
   `WATER_TEMPERATURES` : c'est la référence de la qualité, de `ichStress`, des jauges
   (`temperatureLevel`, via `WaterSample.ambient`), des alertes et du bilan ; l'eau la suit
   (`targetTemperature`) sauf consigne de chauffage. Écrite dans la sauvegarde (après `kh`),
   relue bornée à [0, 40] °C.
4. **Repos hivernal** : `coldRest` (koï et poisson rouge, `COLD_SLOWED`) vaut 0 à 10 °C et
   au-dessus, 1 à 5 °C et en dessous, linéaire entre ; il passe par le poids de repos de la
   nage (`restWeight` = le plus fort du repos de nuit et du froid, `sim/day-rhythm.ts`) : nage
   ralentie et tenue près du fond, comme la nuit. L'appétit (`coldAppetite`) descend de 1 à
   0,1 sur la même plage : la faim montée pendant la nage est reprise d'autant, sans passer
   sous 0. Seuil de 10 °C : consigne courante des éleveurs (nourrir peu sous 10 °C),
   approximation de jeu.
5. **Tableau de bord** : la saison (mot et flèche de tendance ; phrase « Saison : hiver,
   température stable » dans l'infobulle et la lecture de la simulation) s'affiche quand le
   relevé porte une température ambiante (`dashboardSeason`).

## Options écartées

- **Calculer la référence à partir du temps partout** : la qualité, les jauges et le bilan ne
  reçoivent que l'eau et l'environnement ; leur passer le temps du monde touchait des dizaines
  d'appels. La température ambiante posée dans l'eau est un état dérivé, mais elle suit la
  sauvegarde et les relevés sans autre changement.
- **Faire suivre la courbe à l'eau sans changer la référence** : l'hiver rendait l'eau
  « mauvaise » et déclenchait les points blancs.
- **Ralentir aussi les autres environnements** : ils sont intérieurs, chauffés ou tempérés ;
  leur état reste identique au bit près (aucun calcul de ce module hors du bassin).

## Conséquences

- Empreintes de non-régression : seules celles du bassin changent (température ambiante dans
  l'eau, eau à 18,06 au lieu de 18 °C) ; les nages restent celles d'avant (eau au-dessus de
  10 °C les premières semaines de jeu).
- Tranche suivante (#864) : voir ci-dessous. La bande tolérée de la courbe de température
  (`toleratedRange`) suit la température ambiante depuis #866.

## Suite : option et captures (issue #864)

1. **Option « Saisons »** : drapeau `World.seasonsOff` (absent : saisons actives ; jamais
   écrit à `false`, comme `mortality`), sauvegardé avec le monde. Coupées
   (`setWorldSeasonsInPlace`), la température ambiante est retirée de l'eau et
   `stepPondSeasonInPlace` ne fait rien : l'eau revient vers les 18 °C du bassin à son rythme
   habituel, sans appétit réduit par la saison (le repos dû au froid suit l'eau tant qu'elle
   est froide). Rétablies, la température ambiante du jour est reposée tout de suite. Case
   « Saisons » sur la ligne « Lieu » du bassin (catégorie « Bac et milieu »), à la place de
   « Afficher la pièce » qui n'existe qu'au bac tropical.
2. **Captures saisonnières** : paramètre `saison=` (`printemps`, `ete`, `automne`, `hiver`).
   Il pose `World.seasonStartDay`, le jour de l'année au temps 0 (cœur de la saison : 205 au
   plus chaud, 22 au plus froid), jamais enregistré, et met l'eau à la température du jour
   dès t = 0. Le relevé de l'eau le reprend (`WaterSample.seasonStartDay`) pour que le
   tableau de bord affiche la bonne saison. Écarté : avancer `world.time` de plusieurs mois,
   qui aurait décalé l'âge des animaux, l'azote et toutes les horloges du monde.
3. Accès du gabarit : `aquarium-host.ts` étant au plafond de son exception de taille,
   l'application lit `readouts.pondSeasons` et appelle `settingsCtl.setSeasons` directement
   (contrôleurs rendus publics) plutôt que par de nouvelles méthodes de l'hôte.
