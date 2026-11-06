# 0108 — Courant de rivière : champ uniforme par environnement, force réglée par bac

- Statut : acceptée
- Date : 2026-11-06
- Auteur : Dev, cycle 158, issue #460 (épopée v1.11 « Reproduction et alevins »)

## Contexte

L'issue demande un biotope à courant : un champ de courant simple (direction, force) par
environnement, nul au bac tropical par défaut ; des poissons de rivière qui nagent un peu à
contre-courant quand les autres sont peu influencés ; des particules (bulles, nourriture,
feuilles) qui suivent l'eau ; un réglage coupé, doux, fort dans « Réglages », accessible au
clavier et à 390 px ; un indicateur discret du sens, qui respecte « Réduire les
mouvements » ; et les 5 angles du bac tropical par défaut identiques à l'octet.

## Décision

1. **Champ uniforme** (`sim/water-current.ts`) : une vitesse horizontale constante dans tout
   le volume d'eau, `currentVelocity(field, level)`. Pas de champ variable dans l'espace
   (tourbillons, sillage des rochers) : hors de portée de l'issue et coûteux par pas.
2. **Direction par environnement, force par bac.** `Environment.current` (`CurrentField` :
   `direction` en radians dans le plan X-Z, `level` par défaut) est une donnée de
   l'environnement : vers +X au bac tropical, au récif et au bac d'eau froide, en biais au
   bassin, vers +Z au paludarium. La force par défaut est `coupe` partout. Le bac la règle
   par `World.current` (`doux` ou `fort`, 0,03 et 0,07 m/s), **absent quand le courant est
   coupé** (`setWorldCurrentInPlace` retire le champ) : un monde par défaut, sa sauvegarde et
   ses captures sont inchangés.
3. **Effet sur les nageurs**, après leur nage du pas (`applyCurrentInPlace`) : un poisson de
   `RIVER_SPECIES` (danio, xipho, ancistrus, otocinclus, corydoras) vire vers l'amont (au
   plus 1,2 rad/s au courant fort, rhéotaxie) et gagne 15 % de la vitesse de l'eau vers
   l'amont ; un autre nageur est emporté de 30 % de cette vitesse vers l'aval. Le poisson
   reste dans sa boîte `hard` et dans la forme du bassin. Marcheurs du fond et amphibiens ne
   sont pas touchés. Aucun tirage : le flux des générateurs est le même, courant ou non.
   Coupé, aucun calcul (`flowing` faux) : nage d'avant au bit près.
4. **Particules** : les bulles et les feuilles mortes restent des fonctions pures de la
   graine et du temps ; la vitesse de l'eau s'ajoute à leur dérive depuis leur naissance
   (`fillBubbles`, `fillFloatingLeaves`, paramètres facultatifs nuls par défaut). Les granulés
   qui flottent ou coulent dérivent pas à pas dans le volume d'eau ; posés, ils restent
   (`stepFoodInPlace`). Leur hauteur de repos reste celle du point de dépôt (sol plat sauf
   au paludarium, où l'écart reste de quelques millimètres).
5. **Sauvegarde** : champ facultatif `current` du monde (`doux` ou `fort`), jamais écrit
   coupé ; absent (anciennes sauvegardes), courant coupé. Une valeur inconnue (ou `coupe`
   écrit) est refusée comme les autres champs invalides. Pas de nouveau schéma.
6. **Réglage** : bouton « Courant : coupé » sur la ligne du titre de la section « Eau »
   (comme « Changer l'eau »), qui passe à doux, fort, puis coupé ; aucune ligne de plus dans
   le panneau à 1280 × 720 (`docs/PIEGES.md`). Capture : paramètre `courant=doux|fort`.
7. **Indicateur** (`render/current-indicator-layer.ts`) : deux (doux) ou trois (fort)
   chevrons couleur d'ombre du sable (`sableOmbre`, comme des rides creusées par l'eau ; plus
   clairs, ils se confondaient avec les caustiques vus de dessus), posés sur le sable le long
   de la vitre avant, pointés vers l'aval, qui glissent de 12 mm sur 2 s au temps simulé (contrat de capture). En
   mouvements réduits, ils restent immobiles. Dans la scène plutôt que dans l'interface :
   l'interface est masquée en capture, et le repère tourne avec la caméra.

## Conséquences

- Le bac tropical par défaut, sans courant, garde ses captures à l'octet ; les tests le
  vérifient sur 600 pas (`advance` identique avec et sans réglage `coupe`).
- Un poisson de rivière tient sa place face au courant et se masse côté amont ; les néons
  dérivent un peu vers l'aval (test de la dérive moyenne sur 2 000 pas).
- Une espèce nouvelle se déclare de rivière en l'ajoutant à `RIVER_SPECIES`.
- Hors périmètre : vagues du récif, pompes réglables, champ variable, son de l'eau.
