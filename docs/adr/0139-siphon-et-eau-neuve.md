# 0139 — Siphon et eau neuve : l'eau retirée se compte dans la séance, l'eau versée dilue

- Statut : acceptée (complète les ADR 0138 et 0121)
- Date : 2026-11-14
- Auteur : Dev, cycle 214, issue #605

## Contexte

Lot 2 de l'épopée « Entretenir à la main » (#593) : les étapes « siphon » et « eau neuve » de
la séance guidée (ADR 0138) reçoivent leur geste. Le bac n'a ni niveau d'eau simulé ni dépôts
de sol (l'encrassement visible arrive avec #607) ; le changement d'eau existant
(`changeWaterInPlace`) retirait une part fixe de 30 % d'un seul coup.

## Décision

1. **Le siphon ne touche pas à l'eau du bac.** Chaque point du passage qui tombe dans l'eau
   (`siphonFloorPoint` : là où le rayon coupe le fond, sinon l'aplomb de son entrée dans l'eau,
   pour la vue de côté) ajoute `SIPHON_SHARE_PER_POINT` à la part retirée, gardée dans la séance
   (`CareSession.siphoned`, plafonnée à `MAX_SIPHON_SHARE`, 80 %). Retirer de l'eau ne change
   aucune concentration : seule l'eau neuve dilue. Les granulés posés à moins de `SIPHON_REACH`
   du tuyau sont retirés du monde (seuls « dépôts » simulés pour l'instant).
2. **Seuil sourcé** : au-delà de 50 % retirés, la jauge passe à l'orange avec un avertissement
   (UF/IFAS, 25 à 50 %, `docs/SOINS.md` § 14). Les autres valeurs (part par point, seau de 10 %,
   portée, écart de 2 °C) sont des **approximations de jeu**.
3. **Eau neuve** : on verse au seau jusqu'à la part retirée (`CareSession.poured`) ; « Étape
   terminée » applique `changeWaterInPlace(water, env, poured, fresh)` : dilution à la part
   versée, chlore du robinet si le conditionneur a été oublié (`untreated`, indépendant du
   réglage « eau du robinet non traitée »), température du bac mélangée à celle du seau. Le
   bouton « Changer l'eau » garde ses 30 % et son comportement (paramètres par défaut).
4. **Calendrier** : le siphon devient une tâche de séance (`siphon`, 7 jours), suivie seulement
   après une première fois, comme les vitres (`SESSION_MAINTENANCE_TASKS`) ; l'eau neuve
   enregistre `waterChange`, l'historique de l'eau et le journal, comme le bouton.
5. Le conditionneur et la température du seau sont des choix de l'étape, non sauvegardés (une
   séance reprise repart d'un seau traité, à la température du bac).

## Options écartées

- **Baisser un niveau d'eau au siphon** : il faudrait un niveau dans `WaterState`, la
  sauvegarde, le rendu et l'empreinte dorée ; hors périmètre du lot.
- **Diluer au siphon** : physiquement faux (l'eau retirée a la concentration du bac).

## Conséquences

- Une séance interrompue après le siphon garde sa part retirée ; si l'eau neuve est passée,
  rien n'est dilué (le bac est réputé complété à l'eau du bac).
- Lot 4 (#607) : les dépôts visibles du sol pourront être retirés par `siphonWorldInPlace`.
