# 0039 — Récif : environnement marin et tons de palette propres à un environnement

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 50, issue #148

## Contexte

L'épopée v0.8 commence par l'environnement du récif (issue #148) : bac vitré plus grand que
le bac tropical, eau d'un bleu franc plus clair en surface, sable corallien clair, quelques
roches, sans habitants pour l'instant. Un environnement est une donnée (ADR 0026) : il suffit
d'ajouter `recif` à `ENVIRONMENT_IDS` et de décrire le bac.

La difficulté est la couleur. La palette commune (ADR 0007) n'a aucun bleu d'eau : ses eaux
vont du vert profond au vert d'eau. Une eau teintée de bleu et translucide (30 % pour le
volume, 50 % pour la surface) retombait donc, après la passe palette, sur les eaux vertes du
bac tropical (essai : teinte `#2a7fc0`, image identique en tons à celle du bac). Il faut des
bleus dans la palette, au plus deux (critère de l'issue).

Mais la passe palette ramène **chaque** pixel de **chaque** environnement à la couleur la plus
proche. Deux bleus ajoutés à la palette commune (`#3f7597`, `#4796cb`) ont changé deux
captures existantes du bac tropical au crépuscule : 35 946 pixels d'eau affichés
`eauLuneClaire` sont passés au bleu foncé, et 396 pixels de néons affichés `neonBleu` au bleu
clair. Le critère « captures des autres environnements identiques à l'octet » l'interdisait.

## Décision

- **Tons d'environnement** (`render/palette.ts`, `ENVIRONMENT_TONES`) : un groupe de couleurs
  à part, comme les tons de nuit et du crépuscule (ADR 0021). Ils sont placés en fin de la
  palette du shader, chacun avec sa pénalité (`uEnvironmentPenalty`) : nulle dans un
  environnement qui le déclare (`Environment.tones`), `TONE_PENALTY_OFF` ailleurs, où il ne
  peut jamais l'emporter. La palette commune, son ordre et ses égalités ne changent pas : les
  autres environnements donnent les mêmes images, à l'octet près (vérifié sur les 43 captures,
  hors `front-panneau`, non reproductible, voir `docs/PIEGES.md`).
  - `AquariumView` fixe ces pénalités à sa création (`environmentTonePenalties`), d'après
    l'environnement de sa scène ; l'heure ne les touche pas.
  - `environmentTonePenalties` refuse un nom inconnu ; `setEnvironmentPenalties` refuse un
    nombre ou une valeur de pénalités invalides.
- **Deux tons** : `eauRecif` `#3f7597` (volume vu de côté, bleu franc) et `eauRecifClaire`
  `#4796cb` (surface vue en trois-quarts, bleu plus clair).
- **Teinte d'entrée saturée** : l'eau du récif est teintée `neonBleu` (corps et surface). Le
  mélange translucide sur le fond sombre donne avant quantification `#3f7596` (volume) et
  `#4489b7` (surface) : les deux tons ont été choisis sur ces valeurs, calculées (mélange en
  espace linéaire, comme la cible basse résolution) puis mesurées sur capture avec la passe
  court-circuitée. Même démarche que l'eau de nuit (`NIGHT_WATER_BODY`, `docs/PIEGES.md`).
- **Sable corallien** : dessus `koiBlanc`, côtés `sableClair`, dessous `sableSombre`. Vu de
  côté et en trois-quarts, il s'affiche blanc cassé (`texteInterface`). Vu de dessus, à
  travers la surface bleue à 50 %, aucun sable de la palette n'est atteignable : il se lit en
  eau très claire (`eauTresClaire`), comme un lagon. Les sables chauds (`coeurFleur`,
  `koiOrange`) donnaient `sable` de dessus, mais un sable beige identique à celui du bac
  tropical ; écarté.
- **Bac** : 1,5 × 0,6 m, 65 cm de haut (plus long, plus large et plus haut que le bac
  tropical), eau à 90 %, vitres, vue trois-quarts par défaut, ni bulles, ni caustiques, ni
  pluie. Quatre roches (`kind: rock`), graines fixes. Population et espèces vides : le panneau
  affiche « Aucune espèce pour l'instant. », comme le paludarium à sa création.
- **Sauvegarde** : aucun changement de format (`schema: 1`, ADR 0028) ; un monde du récif
  fait l'aller-retour, un poisson d'une autre espèce y est refusé (`livesIn`).

## Options écartées

- **Deux bleus dans la palette commune** : change les captures du crépuscule du bac tropical
  (voir Contexte).
- **Palette entière par environnement** (une passe par environnement) : plus général, mais
  duplique la palette et ses tests pour un besoin de deux couleurs.
- **Surface teintée de blanc** (`texteInterface`, `koiBlanc`) pour garder un sable clair de
  dessus : la surface vue en trois-quarts sur le fond sombre devient grise, plus bleue.

## Conséquences

- Un futur environnement peut déclarer ses propres tons sans toucher aux images des autres.
  Chaque ton coûte une itération de la boucle de la passe pour tous les pixels (négligeable).
- Les tons du récif sont libres de jour comme de nuit au récif : la nuit, l'eau y garde des
  bleus du récif à côté des tons de lune.
- Les rides de la surface (`SURFACE_COLOR`, `eauTresClaire`) se lisent en taches vertes
  (`eauClaire`) sur l'eau bleue, de dessus et en trois-quarts : une couleur de reflet propre
  au récif viendra avec la lumière du récif.
- Pas de caustiques : leurs paliers de couleurs pleines (sable) ne sont pas réglés pour le
  sable blanc sous l'eau bleue.
