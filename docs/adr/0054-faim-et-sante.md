# 0054 — Bien-être : santé liée à la faim et à l'eau, nage ralentie, couleurs ternies

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 72, issue #208

## Contexte

L'épopée « Le vivant » poursuit avec le bien-être des animaux. La faim existe depuis l'issue
#68 (`Fish.hunger`, ADR 0023) et l'eau depuis #206 et #207 (ADR 0052, 0053). L'issue #208
demande une santé dans [plancher, 1] qui baisse si la faim est maximale ou l'eau mauvaise,
remonte lentement sinon, ralentit la nage et ternit les couleurs, sans mort ; captures par
défaut identiques à l'octet, sauvegardes anciennes acceptées.

## Décision

- **Module pur `sim/wellbeing.ts`** : `stepHealth`, `healthStress`, `vigor`, `dullness`,
  `stepWellbeingInPlace`, `starveInPlace`. Aucun hasard, aucune allocation, temps simulé
  (`dt`) : la vitesse de simulation ne change que le nombre de pas.
- **Santé `Fish.health`** ∈ [0,2 ; 1], 1 à la naissance. Par seconde et par cause (faim
  égale à 1, eau « mauvaise » selon `waterQuality`, lu sans recalcul), perte de 0,8/480 :
  du plein au plancher en 8 min simulées pour une cause, 4 pour deux. Sans cause, regain de
  0,8/960 (16 min). Une valeur non finie repart de 1.
- **Ordre dans le pas** : après les repas et l'eau (`stepInPlace`), donc sur la faim de fin
  de pas ; la nage du pas suivant lit cette santé.
- **Faim et espèces sans recherche de nourriture** : axolotl, grenouille et triton ne
  cherchent pas les granulés (`stepWalker`, `stepFrog`) ; leur faim monte sans qu'on puisse
  les nourrir. Pour eux, seule l'eau compte (`feedsOnPellets`). Sinon tout le paludarium
  dépérirait au bout de quelques minutes, sans remède.
- **Nage plus lente** : le déplacement d'un pas est multiplié par `vigor` = 1 − 0,4 ×
  ternissement (0,6 au plancher), dans `stepFish`, `stepWalker` et `stepFrog`. La vitesse
  `speed`, les tirages et le battement de queue ne changent pas. À santé 1, facteur
  exactement 1 : trajectoires d'avant au bit près.
- **Couleurs ternies** : attribut d'instance `aqfishDull` (`dullness`, de 0 à santé 1 à 1
  au plancher) dans `FishLayer`, partagé par le corps et la queue, et ajouté au shader de
  sommets après `color_vertex` (`withDullness`) : mélange vers la luminance (30 %) et
  assombrissement (15 %) au plancher. À 0, `mix(c, g, 0) × 1` rend exactement la couleur :
  captures par défaut identiques à l'octet (vérifié par `cmp`).
- **Proportions choisies sur capture** : à 45 % de désaturation et plus, la passe palette
  ramène néons et guppys vers les tons de sable (espèces méconnaissables) ; à 30 % / 15 %, le
  bleu néon reste, le rouge fonce, l'orange des guppys brunit.
- **Paramètre de capture `affames=1`** : faim maximale et santé au plancher à t = 0
  (`starveWorldInPlace`), en capture seulement ; captures `side-affames` et
  `three-quarter-affames`.
- **Sauvegarde** : champ `health` facultatif par poisson au schéma 1, toujours écrit ;
  absent, 1 ; présent, nombre fini dans [plancher, 1], sinon refus.

## Options écartées

- **Teinte d'instance de three.js (`setColorAt`)** : multiplicative seulement, elle
  assombrit sans désaturer ; un assombrissement seul ne change presque rien après la passe
  palette (le bleu néon reste `neonBleu` jusqu'à 0,6, ADR 0019).
- **Santé dans un tableau typé à part** : la faim est déjà un champ du poisson, sérialisé ;
  un champ de plus garde un seul état et la sauvegarde simple.
- **Vitesse `speed` réduite** : changerait les bornes de vitesse vérifiées par la sauvegarde
  et le battement de queue ; le facteur sur le déplacement suffit.

## Conséquences

- La faim des poissons non nourris atteint 1 en 75 à 150 s selon l'espèce : sans
  nourrissage, la santé commence à baisser au bout de quelques minutes simulées. Les
  captures (30 s) et le tracé des trajectoires (60 s) n'y arrivent pas.
- Un monde avancé longtemps sans nourriture (tests de trajectoire de plusieurs minutes)
  nage plus lentement qu'avant : tout nouveau test long sur la nage doit en tenir compte.
- Mort, reproduction et suivi individuel restent hors périmètre ; l'interface pourra lire
  `health` et `dullness`.
