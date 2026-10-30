# 0082 — Ciel couvert sous la pluie : facteur dédié et tons couverts

- Statut : acceptée
- Date : 2026-10-30
- Auteur : Dev, cycle 109, issue #123

## Contexte

La pluie du bassin (#106, ADR 0032) devait assombrir légèrement la lumière. L'essai du
cycle 39 (`DayLight.intensity` × 0,85) a été retiré : l'intensité du jour choisit aussi les
tons de nuit et du crépuscule de la passe palette (`tonePenaltiesInto`) et la teinte chaude
du décor (`decorTintInto`), d'où des stries claires sur les parois de l'eau et des touffes
d'herbe ternies en plein midi (`docs/PIEGES.md`). Contraintes de l'issue #123 : scène
visiblement mais légèrement plus sombre sous la pluie à midi, aucun ton du soir ni de nuit,
captures sans pluie identiques à l'octet.

## Décision

- **Facteur dédié** `overcastBrightness(pluie)` (`render/overcast.ts`) : exactement 1 sans
  pluie, `RAIN_OVERCAST_BRIGHTNESS` (0,85) sous la pluie. Il multiplie les seules couleurs :
  intensités des lumières ambiante et directe (teintes inchangées), couleurs de l'eau et du
  dessous du sol (`AquariumScene.setOvercast`), teinte du décor et des nénuphars. Les
  pénalités des tons de nuit et du crépuscule restent calculées sur la seule intensité du
  jour : à midi, ces tons restent écartés.
- **Tons du ciel couvert** (`RAIN_TONES`, cinq tons d'environnement, ADR 0039) : herbe claire,
  touffes lumineuses, roche, roche à l'ombre et terre beige à 85 % de leur luminosité,
  proposés à la passe seulement sous la pluie (`AquariumView.applyTonePenalties`, comme l'eau
  brun-thé). Sans eux, la palette de jour est trop espacée : à 0,85, l'herbe retombait sur sa
  couleur de midi (luminance moyenne inchangée à 0,5 niveau près) et la margelle passait du
  beige au gris, puis au gris-vert de la vitre (`verreSombre`) sur ses flancs.
- **Eau** : ses couleurs sont multipliées par le facteur, mais l'eau translucide reste sur ses
  couleurs de jour après la passe (`eauSombre` vue de dessus). Le ciel couvert se lit sur l'herbe, la
  terre et la margelle, qui occupent l'essentiel de l'image du bassin.
- **Couleurs plates inchangées** (poissons, bulles, gouttes, granulés) : vus sous l'eau
  assombrie, ils restent lisibles. Non essayé ici, mais d'après les distances de la palette,
  un koï orange à 85 % se rapproche du triton et des gouttes assombries de l'eau claire.
- Assombrissement immédiat à la bascule de la pluie (aucune transition) : la pluie elle-même
  apparaît d'un coup.

## Options écartées

- **Réduire `DayLight.intensity`** : essai du cycle 39, voir le contexte.
- **Facteur seul, sans tons couverts** : essayé ce cycle ; captures de pluie quasi
  inchangées (herbe et eau sur leurs couleurs de midi), seule la margelle changeait de
  famille de couleur.
- **Tons d'eau couverte** (`eauSombre`, `eauMoyenne` à 85 %) : essayés, jamais choisis par la
  passe dans les captures du bassin, retirés.
- **Facteur plus fort (≈ 0,7) sans tons couverts** (non essayé) : d'après les distances de la
  palette, l'herbe sauterait d'un cran entier (`vegetationClaire` → `vegetation`),
  assombrissement franc et non « léger ».

## Conséquences

- Les tons couverts sont liés à `RAIN_OVERCAST_BRIGHTNESS` (test : chaque ton vaut sa
  couleur de jour à ce facteur, à trois niveaux près) : changer l'un oblige à changer l'autre.
- La palette étendue passe de 8 à 13 tons d'environnement (boucle de la passe un peu plus
  longue, sans effet mesurable sur les captures).
- Sans pluie, rien ne change : facteur exactement 1, tons couverts écartés
  (`TONE_PENALTY_OFF`).
