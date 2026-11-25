# 0179 — Brouteurs : les algues se mangent, la faim des néritines compte

- Statut : acceptée
- Date : 2026-11-25
- Auteur : Dev, cycle 302, issue #833 (tranche 1 de #732)

## Contexte

Les algues (`sim/algae.ts`, ADR 0109) poussent sur huit plaques des vitres et seule la raclette
les retire. Crevettes cerises, néritines, otocinclus et ancistrus n'ont aucun rôle
(`docs/ECOSYSTEME.md` § 1). Les néritines et les crevettes sont des marcheurs du fond : leur
faim monte mais ne compte pas dans leur santé (`feedsOnPellets`), si bien qu'une néritine ne
meurt jamais de faim, contrairement à la réalité (Aquarium Breeder).

## Décision

- Module `sim/grazing.ts` : table `GRAZERS` (néritine, otocinclus, ancistrus, crevette
  cerise), chaque entrée avec sa vitesse de broutage, sa capacité à manger les algues dures et
  si sa faim compte sans nourriture ; valeurs sourcées ou marquées approximation de jeu
  (`SheetField`, comme `sim/species-ecology.ts`).
- **Broutage** dans l'étape des algues (`stepAlgaeStageInPlace`), après leur pousse, au pas fin
  comme à gros pas (`sim/ecosystem-step.ts`) : un brouteur dont la faim est positive mange au
  plus `rate · dt` de couverture, jamais plus que ce qui calme sa faim
  (`GRAZE_SATIATION_PER_COVER` : une plaque pleine est un repas), réparti sur les plaques qu'il
  peut manger au prorata de leur couverture. Les animaux mangent dans l'ordre du tableau.
  Aucun tirage, aucune allocation ; sans algues, rien n'est calculé. Quand tout est mangé, le
  champ `algae` est retiré, comme après la raclette.
- **Algues dures** : deux plaques fixes (`HARD_ALGAE_PATCHES`, indices 3 et 6, fond et côté
  droit) sont des algues dures, mangées par les néritines et les ancistrus, jamais par les
  crevettes (Garnelio) ni les otocinclus. Indices fixes plutôt que tirés de la graine : aucun
  tirage nouveau, plaques et sauvegardes inchangées. Le rendu ne les distingue pas encore.
- **Faim** : `hungerCounts(def)` = `feedsOnPellets(def)` ou `starvesWithoutFood` (néritine
  seulement). Santé (`healthStress`), mortalité (`mortalityRate`), alertes et bilan de santé
  lisent `hungerCounts`. Le repas sans nage du harnais (`feedAnimalsInPlace`) nourrit aussi la
  néritine (pastilles d'algues). Les crevettes vivent aussi du biofilm, non simulé : leur faim
  reste sans effet en attendant les charognards et la colonie (tranche 2 de #732).
- Biofilm : non simulé ; aucun brouteur ne le mange.

## Conséquences

- S10 (`docs/ECOSYSTEME.md` § 4) devient un test vert : deux néritines sans algues ni
  nourriture sont affamées et au plancher de santé en un jour de jeu, puis meurent au pas fin
  quand la mortalité est active ; avec des algues, elles restent en pleine santé.
- Aucun champ de sauvegarde nouveau : les sauvegardes anciennes se relisent à l'identique.
- Les bacs par défaut n'ont ni algues ni brouteur : empreintes de non-régression inchangées.
- Au pas fin, une néritine ne cherche pas les granulés (marcheur du fond) : elle n'en mange
  qu'un posé à sa portée. Une néritine ajoutée à un bac sans algues finit donc affamée, comme
  en vrai ; la recherche de la nourriture au fond viendra avec les charognards.
