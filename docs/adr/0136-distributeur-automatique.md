# 0136 — Distributeur automatique : rations comptées en heure continue, état dans le monde

- Statut : acceptée (complète les ADR 0022 et 0023)
- Date : 2026-11-12
- Auteur : Dev, cycle 206, issue #583

## Contexte

Le nourrissage se faisait seulement au clic. L'issue #583 demande un distributeur posé sur le
bac qui lâche une ration à 1 à 4 heures choisies par jour (heure simulée), une réserve de 14
rations avec une alerte « distributeur vide », un réglage lisible à 1280 × 720, un état
enregistré (anciens fichiers relus sans erreur) et un bac par défaut inchangé, captures
comprises. Le risque désigné : plusieurs rations dans un même pas à grande vitesse, et le
passage de minuit.

## Décision

1. **Compte en heure continue.** `rationsDue(horloge, t0, t1, heures)` (`sim/auto-feeder.ts`)
   compte les heures prévues dans ]H(t0), H(t1)], avec H(t) = `startHour + 24 · t / durée du
   jour` **sans retour à 0 à minuit** : Σ ⌊(H(t1) − h) / 24⌋ − ⌊(H(t0) − h) / 24⌋. Le compte se
   télescope d'un pas au suivant : une ration n'est jamais lâchée deux fois ni oubliée, même
   quand une fin de pas tombe exactement sur son heure, et minuit n'est pas un cas à part.
   Horloge figée (touche `H`, mode capture) ou absente : aucune ration.
2. **Vitesse.** La vitesse ne change que le nombre de pas `SIM_DT` par image (ADR du pas fixe) :
   les rations sont donc les mêmes à ×1 qu'à ×4, par grandes images ou pas à pas (test). La
   fonction pure `rationsInFrame` donne aussi le compte d'une image à une vitesse quelconque
   (×8 testé), pour une future vitesse plus haute.
3. **Ration = clic.** Chaque ration passe par `feedInPlace` au point de chute sous l'appareil
   (`feederSpot`, fond gauche du bac) : mêmes granulés, mêmes effets qu'un clic. La réserve
   borne le nombre de rations d'un pas ; vide, plus rien ne tombe.
4. **État dans le monde**, pas dans l'eau : `World.feeder` (`{ hours, stock }`), absent sans
   distributeur ; jamais écrit absent, relu absent des anciennes sauvegardes. Sans distributeur,
   le pas ne calcule rien : trajectoires et captures identiques au bit près. En mode décor, le
   distributeur est en pause, comme la faim.
5. **Bacs vitrés seulement** (tropical, récif, eau froide) : le boîtier s'accroche au bord
   arrière d'un bac droit ; refusé (réglage et sauvegarde) dans le bassin et le paludarium.
6. **Réglage dans le calendrier d'entretien** du tableau de bord (poser, rations par jour,
   heure de chaque ration, remplir, retirer), pas dans « Réglages » : ce panneau n'a plus de
   marge en hauteur à 1280 × 720 (`docs/PIEGES.md`), le calendrier défile (40 vh au plus).
   L'alerte « Distributeur vide » (gravité « attention ») rejoint les alertes du tableau de bord.
7. **Rendu** : `render/feeder-layer.ts`, trois boîtes aux couleurs plates de la palette
   (roche, roche sombre, noir), assombries la nuit ; couche masquée sans distributeur.

## Conséquences

- Le modèle existant ne fait pas polluer l'eau par la nourriture non mangée (la nourriture
  disparaît au bout de `FOOD_GROUND_SECONDS`) ; le bilan du bac signale la suralimentation.
  Le distributeur hérite de ce modèle tel quel : un effet de la nourriture perdue sur les
  nitrates et les algues reste à décider (hors périmètre de #583).
- Paramètre de capture `distributeur=h1,h2…` pour photographier l'appareil.
