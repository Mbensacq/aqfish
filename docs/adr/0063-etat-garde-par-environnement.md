# 0063 — État gardé par environnement : mondes rangés, figés et enregistrés

- Statut : acceptée
- Date : 2026-10-27
- Auteur : Dev, cycle 85, issue #277

## Contexte

Changer d'environnement (bac tropical, bassin, paludarium, récif) recréait le monde de
départ du nouvel environnement (`createDefaultWorld`) et **jetait** le monde quitté : en
revenant, population, décor, eau, nourriture et dimensions réglées étaient perdus, et la
sauvegarde n'enregistrait que le monde affiché (#277, constat de Mathis).

L'ADR 0061 prévoit la pièce de N bacs, avec une sauvegarde au schéma 2 où chaque bac est un
`World` indépendant. Elle n'est pas encore implémentée (lots du sprint 14) : il faut un
correctif **autonome** maintenant, compatible avec cette migration, sans déployer la pièce
ni changer de schéma deux fois.

## Décision

1. **Un monde par environnement visité.** L'hôte garde le monde affiché et une table des
   mondes rangés, au plus un par environnement (`sim/environment-worlds.ts` :
   `switchEnvironment`, pure). Changer d'environnement range le monde quitté, tel quel, et
   reprend celui de l'environnement choisi ; un environnement jamais visité part de son monde
   de départ, avec la graine du monde quitté (comportement inchangé pour lui).
2. **Un environnement non affiché est figé.** Son monde n'est pas avancé : `tick`, eau,
   faim, santé et granulés sont ceux du moment où on l'a quitté. Aucune simulation en
   arrière-plan.
3. **L'heure de la journée reste commune.** L'heure dérive du temps du monde affiché
   (ADR 0018) ; comme les mondes ont des temps différents, l'horloge est reportée au
   changement (`carryClock`, `sim/daylight.ts`) : l'heure au temps du monde repris est celle
   qu'indiquait l'horloge au moment du départ. Plus de retour à l'heure de départ en
   changeant d'environnement.
4. **Sauvegarde : champ facultatif `others`, schéma 1 inchangé.** Le document garde sa forme
   et son schéma ; les mondes rangés sont écrits dans `others`, liste de **corps de
   monde** (exactement les champs du monde affiché : graine, environnement, dimensions,
   `tick`, compteurs, décor, poissons, granulés, eau ; ni `format`, ni `schema`, ni
   `settings`), dans l'ordre de `ENVIRONMENT_IDS`, jamais vide (omis s'il n'y a rien).
   Relecture : chaque corps passe par le même validateur que le monde affiché ; un corps
   invalide, un environnement en double ou égal à celui affiché, ou plus de trois autres
   environnements refusent la sauvegarde entière (comme tout autre champ invalide), avec un
   message préfixé de l'environnement. Le changement d'environnement est enregistré
   aussitôt. L'import remplace aussi les mondes rangés.
5. **Taille.** La limite reste 256 Kio pour tout le document ; les quatre environnements au
   plus lourd (population maximale, granulés au plafond, décor par défaut) pèsent environ
   90 Kio (test de `sim/save.spec.ts`). `serializeWorld` lève si le texte dépasse la limite
   (il serait refusé à la relecture) : l'hôte garde alors la sauvegarde précédente et
   signale `indisponible`.

## Options écartées

- **Simuler les environnements non affichés en arrière-plan** (ce que fera la pièce de
  l'ADR 0061) : coût multiplié par quatre à chaque image pour des bacs que l'on ne voit pas,
  alors que la liste des bacs et leurs alertes, qui donnent du sens à un bac qui vit hors
  champ, n'existent pas encore. À revoir avec la pièce.
- **Passer tout de suite au schéma 2** : demande la pièce, les supports et la migration
  complète de l'ADR 0061 ; hors du périmètre d'un correctif.
- **Une clé de stockage par environnement** : écriture non atomique (documents d'époques
  différentes après une interruption) et export en plusieurs fichiers, déjà écartée par
  l'ADR 0061.
- **Ignorer un corps invalide dans `others`** au lieu de refuser : perte silencieuse ; la
  règle de la sauvegarde reste « tout valide ou refus avec la raison ».

## Conséquences

- Compatibilité : une sauvegarde sans `others` (toutes les sauvegardes existantes) se relit
  sans perte, sans aucun autre environnement ; une version antérieure de l'application lit
  une sauvegarde avec `others` en ignorant ce champ (champs inconnus ignorés), donc ne perd
  que les environnements non affichés. Sans autre environnement visité, le texte écrit est
  identique à l'octet à celui d'avant.
- Captures : le mode capture ne change jamais d'environnement et n'écrit aucune
  sauvegarde ; rien ne change.
- Migration vers le schéma 2 (#264, lot 1) : le monde affiché devient le bac 0 et chaque
  corps de `others` un bac de plus, avec sa graine **enregistrée** (identique à celle du
  bac 0 aujourd'hui, puisque tous partent de la même graine). L'ADR qui implémentera ce lot
  devra décider si ces bacs gardent leur graine (recommandé : rien ne change pour
  l'utilisateur) plutôt que la graine dérivée de l'ADR 0061, et placer les bacs de la pièce ;
  le bassin devient le bac du jardin.
- L'état « figé » sera remplacé par la simulation de tous les bacs de la pièce (ADR 0061) :
  un comportement qui changera alors, à signaler dans les notes de version.
