# 0052 — Modèle d'eau : unités de jeu, pas de la simulation, cycle de l'azote simplifié

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 70, issue #206

## Contexte

L'épopée « Le vivant » (`docs/ROADMAP.md`) commence par un état de l'eau du bac, que la
santé des poissons, le rendu de l'eau trouble et l'interface liront plus tard. L'issue #206
demande un modèle **pur et déterministe** dans `sim/`, sans rendu ni interface : température,
ammoniaque, nitrites, nitrates, efficacité du filtre, un pas de simulation et une action
« changer l'eau », l'état étant sauvegardé.

## Décision

- **Module `sim/water.ts`** : `WaterState` (cinq nombres), `freshWater(env)`,
  `stepWaterInPlace` / `stepWater`, `changeWaterInPlace` / `changeWater`, `readWater`
  (relecture validée). Aucun hasard, aucune horloge : l'eau ne consomme aucun flux de la
  graine et ne change ni les trajectoires ni les captures.
- **Dans le monde** : `World.water`, eau saine à la création (`createWorld`), avancée à
  chaque pas de `SIM_DT` après la nourriture (`stepInPlace`), mise à jour sur place (aucune
  allocation). `changeWorldWater` (pure) et `changeWorldWaterInPlace` (hôte).
- **Unités de jeu** : concentrations dans [0, 100] (0 : eau saine), pas des mg/L ;
  température en °C dans [0, 40] ; filtre dans [0, 1]. Les seuils de toxicité viendront avec
  la santé des poissons.
- **Équations**, par seconde, B charge des habitants, L litres d'eau, f filtre :
  - charge B = Σ (`bodyLength` / 5 cm)³ (la masse, donc les déchets, croît comme le cube de
    la taille ; un koï de 14 cm compte pour ~22, un néon de 6 cm pour ~1,7) ;
  - ammoniaque produite : 0,045 · B / L ;
  - ammoniaque → nitrites : taux 1/120 s⁻¹ · f ; nitrites → nitrates : 1/180 s⁻¹ · f, en
    forme exacte `x · (1 − e^(−k·f·dt))` sur les valeurs du début du pas (stable quel que
    soit le pas, aucune valeur négative) ;
  - nitrates : s'accumulent, retirés seulement par un changement d'eau ;
  - température : tend vers celle de l'environnement (tropical 25 °C, bassin 18, paludarium
    22, récif 26), constante de temps 10 min ; sans chauffage ni saison pour l'instant ;
  - plafond : ce qui dépasserait 100 est perdu.
- **Calibrage** : avec la population par défaut du bac tropical (24 habitants, B ≈ 45,
  288 L), les nitrates atteignent ~49 unités en deux heures simulées (six journées de
  20 min) ; ammoniaque et nitrites restent sous 1,5 tant que le filtre marche.
- **Changement d'eau** : retire 30 % des composés dissous. L'issue parle des nitrates ; une
  eau neuve dilue aussi l'ammoniaque et les nitrites, retirés dans la même proportion.
  Température et filtre inchangés.
- **Sauvegarde** : champ `water` facultatif au schéma 1 (comme `dimensions`), toujours écrit ;
  absent (ancienne sauvegarde), eau saine ; présent, chaque champ validé (nombre fini dans
  ses bornes), sinon refus.

## Options écartées

- **Vraies unités (mg/L) et cinétique bactérienne** (colonies qui croissent, cycle de
  démarrage du bac) : beaucoup de paramètres pour un effet que l'interface ne montre pas
  encore ; à reprendre si l'épopée en a besoin.
- **Pas d'eau plus lent que celui des poissons** (une fois par seconde) : un compteur à
  sauvegarder en plus, pour un calcul de quelques multiplications par pas.
- **Charge proportionnelle à la longueur** : un koï ne pèserait que deux néons ; le cube suit
  mieux la masse.
- **Eau dans les réglages de la sauvegarde** : c'est un état de la simulation, il avance
  avec le monde et doit se rejouer au bit près.

## Conséquences

- `World` gagne un champ obligatoire : tout test qui énumère la forme d'un monde neuf
  l'inclut (`world.spec.ts`).
- Changer de dimensions du bac garde les concentrations (le volume change seulement la
  production à venir) ; changer d'environnement crée un monde neuf, donc une eau saine.
- L'efficacité du filtre ne s'use pas encore : elle n'est modifiable que par la sauvegarde ou
  le code. L'encrassement et son entretien, l'interface, le rendu de l'eau trouble et les
  effets sur la santé sont hors périmètre (#206).
