# 0152 — Sauvegardes relues par schémas déclaratifs

- Statut : acceptée
- Date : 2026-11-18
- Auteur : Dev
- Complète : ADR 0028 (format de sauvegarde), ADR 0069 (schéma 2)

## Contexte

La relecture des sauvegardes (`sim/save.ts`, `sim/room-save.ts`) contrôlait chaque champ à
la main : `parseWorldBody` faisait 132 lignes pour une complexité de 45, `parseFish` 101 lignes
(complexité 23), `parseSchema2` une complexité de 20, et `save.ts` 1 171 lignes. Chaque champ
ajouté (maladies, œufs, distributeur, mortalité…) allongeait ces fonctions d'un `if` de plus.
Audit du 2026-11-17, chantier d'assainissement #686, lot 5 (#691).

## Décision

1. **Validateurs composables** dans `sim/save-schema.ts`, sans dépendance : prédicats
   (`finiteNumber`, `numberIn`, `integerIn`, `uint32`, `optional`), règle de champ
   (`field(clé, validateur, message)`, lue avec `own` : propriétés propres seulement), règle
   sur un objet entier (`Rule<T>`, pour les contrôles qui lient plusieurs champs : position
   dans une boîte, bornes de l'espèce), liste bornée (`ListRule`, `readList`).
2. Un corps de sauvegarde est **décrit par des listes de règles**, évaluées dans l'ordre :
   `problemsOf` relève tous les problèmes (compteurs du monde, réglages, position d'un bac),
   `firstProblemOf` s'arrête au premier (un poisson, un granulé, un œuf : un seul message par
   élément). **L'ordre des règles fixe l'ordre des messages**, donc le message d'un refus : il
   reprend exactement l'ordre historique des contrôles.
3. L'ordre des **clés** du monde relu (il fixe le texte des sauvegardes réécrites) est donné
   à part (`WORLD_PART_ORDER`), car il diffère de l'ordre des contrôles.
4. Découpage : `save-schema.ts` (validateurs), `save-settings.ts` (réglages, écriture et
   lecture), `save-animals.ts` (poissons, corps, granulés, œufs), `save.ts` (document du
   schéma 1 et corps d'un monde, réexporte l'API des réglages), `room-save.ts` (schéma 2).

## Conséquences

- Plus aucune fonction de ces fichiers ne dépasse les limites de `docs/CONVENTIONS.md` ; les
  exceptions de `save.ts` et `room-save.ts` sont retirées.
- Ajouter un champ facultatif revient à ajouter une règle (ou un lecteur dans
  `STATE_READERS`) à la bonne place de la liste, puis le champ dans `WORLD_PART_ORDER`.
- Messages, migrations (schéma 1 → 2) et résultats sont inchangés : la caractérisation
  `sim/save-caracterisation.spec.ts` (plus de 600 cas, sauvegardes réelles des deux schémas)
  fige les messages exacts et l'empreinte du JSON de chaque résultat accepté.
- Les règles d'un élément (poisson, granulé) sont recréées à chaque élément quand elles
  dépendent de son contexte (espèce, granulé précédent) : coût négligeable, au chargement
  seulement.
