# 0149 — Garde de la ponte du poisson-clown : un gardien près des œufs jusqu'à l'éclosion

- Statut : acceptée (suite de l'ADR 0146)
- Date : 2026-11-17
- Auteur : Dev, cycle 235, issue #670

## Contexte

L'ADR 0146 a livré la ponte du poisson-clown près de son anémone, sans la garde : chez
_Amphiprion ocellaris_, le mâle reste près des œufs et les ventile (FishBase, docs/ESPECES.md).
L'issue #670 demandait ce comportement, sans toucher à la ponte (taille, délai, éclosion) ni à
la sauvegarde.

## Décision

1. **Module pur `sim/clutch-guard.ts`** : `clutchGuardInto` désigne la garde du pas (rang du
   gardien, centre de la ponte) dans un tampon réutilisé ; `guardTarget` donne le point visé.
   Aucun champ d'état, aucun tirage : tout se déduit des œufs, des animaux et du temps simulé.
2. **Gardien** : le sexe n'est pas modélisé ; le premier clown du tableau (ordre des
   identifiants) adulte, sans maladie, de santé au moins `GUARD_MIN_HEALTH` (0,5) et de faim au
   plus `GUARD_HUNGER` (0,8) fait office de mâle. Trop affamé, il quitte la garde pour manger et
   le suivant le relaie. Un seul gardien par bac.
3. **Ponte gardée** : celle du premier œuf du récif dans le tableau (la plus ancienne) ; son
   centre est la moyenne des œufs de la même espèce à moins de `CLUTCH_GROUP_RADIUS` (10 cm)
   de cet œuf. À l'éclosion du dernier œuf, plus de garde : la nage redevient celle d'avant.
4. **Point visé** : devant la ponte, reculé de `GUARD_STANDOFF` (5 cm) vers l'anémone la plus
   proche (la ponte est collée au flanc du rocher tourné vers elle), en va-et-vient de ±2 cm
   (période 4 s) perpendiculaire à cette direction ; les 3 dernières secondes de chaque période
   de 12 s, sortie à 85 % de `GUARD_RADIUS` (10 cm) du côté de l'anémone. Hauteur : au moins
   `GUARD_HOVER` (2 cm) au-dessus des œufs et `GUARD_FLOOR_CLEARANCE` (3 cm) au-dessus du bas
   des bornes de nage (la ponte est sous `wallMargin`), plafonnée pour rester à moins de
   `GUARD_RADIUS` du centre. Valeurs : approximations de jeu.
5. **Évitement rapproché** : la nage tient les poissons à `wallMargin` + `AVOID_ZONE` (11,5 cm
   pour le clown) de tout obstacle ; collée à un rocher, la ponte était hors d'atteinte (le
   gardien tournait 15 cm au-dessus, ou loin autour des coraux). `stepFish` reçoit donc un
   paramètre `closeAvoid` (faux par défaut, nage d'avant au bit près) : avec un point visé, les
   obstacles ne sont évités qu'à 1,5 + 3 cm de leur surface ; le filet de sécurité (projection
   hors des obstacles) reste entier. Seul le gardien l'active, et seulement à moins de
   `GUARD_CLOSE_RANGE` (12 cm) de la ponte : plus loin, l'évitement normal lui fait contourner
   coraux et rochers sur le chemin.
6. **Priorité** : dans `world.ts`, ce point remplace la nourriture, le refuge et le retour à
   l'anémone du gardien (`bondTarget`) ; le reste de la nage (banc, profondeur) est inchangé.
   Sans œuf du récif, aucun calcul supplémentaire : nage d'avant au bit près.

## Options écartées

- **Un gardien par ponte** : il faudrait identifier les pontes (champ de sauvegarde) ; deux
  pontes simultanées sont rares avec les plafonds actuels.
- **Choisir le clown le plus proche des œufs** : le gardien changerait d'un pas à l'autre.
- **Évitement rapproché sur tout le trajet** : le gardien se coinçait contre le flanc d'un
  corail entre son anémone et la ponte (essai sur la graine 42).
- **Retirer de ses obstacles le rocher de la ponte** : le filet de sécurité ne le
  protégerait plus, il pourrait entrer dans le rocher.
- **Interdire au gardien de manger** (`eatInPlace`) : il ne court plus aux granulés, ce qui
  suffit ; un granulé tombé sur la ponte peut encore être happé.
- **Retrait des œufs morts** : aucun œuf ne meurt dans la simulation.

## Conséquences

- Seule la capture `recif-three-quarter-oeufs` change (le gardien est près de la ponte) ; les
  autres, récif sans ponte compris, sont identiques à l'octet.
- Coût : un parcours des œufs et des animaux par pas, seulement quand le bac porte des œufs.
