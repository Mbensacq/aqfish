# 0141 — Encrassement visible : un voile tiré du calendrier d'entretien, dessiné par plage

- Statut : acceptée (complète les ADR 0138, 0139 et 0109)
- Date : 2026-11-15
- Auteur : Dev, cycle 220, issue #607

## Contexte

Lot 4 de l'épopée « Entretenir à la main » (#593) : le bac se salit (algues, nitrates) mais ça
se voit peu, et les gestes de la séance guidée (raclette, siphon, ADR 0138 et 0139) manquent de
récompense visuelle. Contraintes : fonction pure et déterministe, aucun nouvel attribut de
shader (`docs/PIEGES.md`, shaders des poissons), captures du bac propre identiques à l'octet.

## Décision

1. **Niveau** (`sim/fouling.ts`) : `foulingLevel(écoulé, nitrates)` dans [0, 1], nul pendant
   `FOULING_GRACE_DAYS` (3 jours de jeu), puis linéaire jusqu'au plein en `FOULING_FULL_DAYS`
   (21 jours), accéléré jusqu'à × 3 par l'excès de nitrates (mêmes seuils que les algues).
   Approximations de jeu (`docs/SOINS.md` § 12).
2. **Aucun état nouveau** : le temps écoulé se lit dans le calendrier d'entretien (ADR 0116) :
   vitres depuis `lastDone.glass` (raclette), sol depuis `lastDone.siphon` ; faute de geste,
   depuis le début du suivi (plus ancienne des tâches suivies dès le début). Les sauvegardes ne
   changent pas, et les gestes de la séance effacent le voile sans code de plus.
3. **Aucun voile** en mode décor (eau en pause) ni hors des bacs à algues (bassin, récif) ; le
   sol n'est voilé que sur le sable plat (pas sur le terrain du paludarium).
4. **Rendu** (`render/fouling-layer.ts`) : des cases de 2 cm contre la face intérieure des
   quatre vitres et 8 mm au-dessus du sable, construites une fois et **triées par ordre
   d'apparition** (bords, coins et ligne d'eau d'abord, puis par touffes d'un bruit de valeur
   lissé) ; le niveau ne règle que `setDrawRange`. Deux maillages (vitres, sol), couleurs par
   sommet de la palette commune (`sableOmbre`, `vegetationClaire`, `rocheSombre`), luminosité
   de nuit comme les algues. Rien n'est construit tant que le bac est propre.
5. **Portée** : à plein voile, au plus la moitié des cases des vitres du fond et des côtés, 30 %
   de la vitre de devant (le bac reste lisible de face), 60 % du sol.

## Options écartées

- **Champ `fouling` dans l'eau, intégré à chaque pas** : un état de plus à sauvegarder, relire
  et copier, pour un effet que le calendrier donne déjà.
- **Voile translucide (opacité partielle)** : la passe palette ramène les mélanges vers des
  couleurs inattendues (`docs/PIEGES.md`) ; des cases opaques éparses restent dans la palette.
- **Tramage ordonné uniforme** : se lit comme du bruit à basse résolution (cycle 203) ; les
  touffes qui partent des bords se lisent comme des dépôts.
- **Voile sur les feuilles** : hors du critère d'acceptation, renvoyé à un lot suivant.

## Conséquences

- Le voile baisse aussi quand les nitrates baissent (changement d'eau) : il suit l'état courant
  de l'eau, pas son histoire.
- Paramètre de capture `encrassement=` (en capture seulement), quatre captures de plus.
