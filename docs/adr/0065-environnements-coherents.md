# 0065 — Environnements cohérents : bac d'eau froide pour l'axolotl, paludarium sans axolotl

- Statut : acceptée (cohabitation sonneur / triton « possible sous conditions », sources faibles)
- Date : 2026-10-27
- Auteur : Dev, cycle 87, issue #271 (lot 3/3 de #262)

## Contexte

Les lots 1 et 2 de #262 (ADR 0062, 0064) ont donné des espèces réelles au paludarium : sonneur
oriental (_Bombina orientalis_) et triton à ventre de feu chinois (_Cynops orientalis_). Sa
population par défaut mêlait encore deux axolotls à trois sonneurs et deux tritons, mélange
que `docs/ESPECES.md` juge incompatible : axolotl « seul ou entre axolotls », eau à 15,5–18 °C,
et _Cynops_ « pas avec des amphibiens plus grands ». Le panneau l'affichait déjà comme
« mélange déconseillé » (ADR 0055), sans alerte au tableau de bord.

## Décision

1. **Nouvel environnement « Bac d'eau froide »** (`eaufroide`, ajouté en fin de
   `ENVIRONMENT_IDS`) : 1 m × 45 cm × 45 cm (environ 155 L d'eau, au-dessus des 75 L de la
   fiche, approximation), deux axolotls seuls. Eau à **17 °C** (dans l'idéal 16–18 °C de la
   fiche, consigne du chauffage bornée à 16 °C au moins) et pH neuf **7,5** (idéal 7,4–7,6,
   `docs/ESPECES.md`). Apparence (`docs/DA.md`) : bac vitré à fond plat de sable, eau plus
   sombre que le bac tropical (`eauSombre`, surface `eauMoyenne`), sans bulles ni caustiques
   (pas de courant, eau fraîche), trois plantes et deux pierres **le long de la vitre
   arrière** : l'axolotl ne contourne pas encore les obstacles en marchant
   (`sim/axolotl.ts`), le devant reste donc dégagé.
2. **Paludarium : sonneurs et tritons par défaut, sans axolotl.** La cohabitation sonneur /
   triton est retenue comme **possible sous conditions**, pas comme sûre :
   - plages préférées : sonneur 20–24 °C (anapsid.org, secondaire), triton 14–20 °C (Caudata
     Culture, moyenne) : un seul point commun, **20 °C**. L'eau du paludarium passe donc de
     22 à 20 °C (`WATER_TEMPERATURES`) ;
   - le triton (6 à 10 cm) n'est pas plus petit que le sonneur (environ 6 cm) : la règle
     « pas avec des amphibiens plus grands » n'exclut pas le couple ;
   - forum Caudata.org, fil « FB Newts + FB Toad » (avril 2007, témoignages, **faible**) :
     un éleveur les a gardés ensemble trois ans dans un grand bac à eau centrale et deux
     berges, à 20 °C stables, les tritons mangeant œufs et têtards des sonneurs ; les autres
     déconseillent le mélange (profondeurs d'eau différentes, place) ou le jugent viable
     seulement avec beaucoup d'espace. Aucune source primaire consultée sur ce couple.
     Le jeu ne le signale pas comme mélange déconseillé (règles de `sim/compatibility.ts`
     inchangées) ; la fiche reste muette sur ce point, à revoir avec le wiki (#252).
3. **L'axolotl reste proposé au paludarium** (`PALUDARIUM.species` inchangé), à zéro par
   défaut : les anciennes sauvegardes du paludarium mixte (monde affiché ou `others`,
   ADR 0063) se rechargent **telles quelles**, sans migration ni perte, et le panneau permet
   de retirer les axolotls. L'en ajouter garde le libellé « Mélange déconseillé » du panneau.
4. **Alerte « Mélange déconseillé » au tableau de bord** (`sim/dashboard-alerts.ts`, sujet
   `mix`, gravité « attention ») : nomme chaque couple présent et sa raison, conseille de
   retirer l'une des espèces. Rangée après les alertes de l'eau de même gravité, avant la
   santé ; ce n'est **pas** une cause de souffrance du modèle de santé (conseil de
   maintenance, pas un effet simulé).
5. **Sauvegarde : schéma 1 inchangé.** Le nouvel identifiant est accepté par la relecture
   (même validation que les autres) ; `others` compte au plus quatre corps. Une ancienne
   version de l'application refuse une sauvegarde dont le monde affiché est le bac d'eau
   froide, et ignore `others` (ADR 0063) : rien à faire de ce côté.
6. **Tests de cohérence** (`sim/environment-populations.spec.ts`) sur **tous** les
   environnements : aucune paire incompatible par défaut, plages de température préférées qui
   se recoupent, eau de l'environnement tolérée par chaque espèce (et dans la plage préférée
   commune pour le paludarium et le bac d'eau froide), pH neuf toléré, axolotl peuplé par
   défaut dans le seul bac d'eau froide.

## Options écartées

- **Retirer l'axolotl de `PALUDARIUM.species`** : la relecture refuse toute espèce qui ne vit
  pas dans l'environnement ; il aurait fallu une liste d'espèces « tolérées » à la lecture et
  un panneau qui montre une espèce non proposée pour la retirer. Plus de code pour un
  environnement de moins à choisir.
- **Migrer les anciennes sauvegardes** (déplacer les axolotls du paludarium vers le bac d'eau
  froide) : modification silencieuse de la partie du joueur, contraire à « une population
  incompatible reste chargée » (#271).
- **Triton avec l'axolotl, dans l'eau froide** : _Cynops_ ne va pas avec des amphibiens plus
  grands (`docs/ESPECES.md`, matrice : axolotl ❌ _Cynops_).
- **Une règle de compatibilité par intersection des plages de température** dans
  `sim/compatibility.ts` : `species-sheet.ts` dépend déjà de `compatibility.ts` (dépendance
  circulaire) et la règle changerait les verdicts affichés hors du périmètre ; elle est
  vérifiée par test sur les populations par défaut.

## Conséquences

- Captures : celles du paludarium changent (plus d'axolotls) ; trois nouvelles captures du
  bac d'eau froide (`eaufroide-three-quarter`, `-side`, `-top`) ; les autres environnements
  sont identiques à l'octet.
- Le bac tropical (25 °C) dépasse d'un degré la plage préférée approximative du corydoras
  (22–24 °C) tout en restant dans sa plage tolérée : constaté par le test, hors périmètre.
- Une ancienne sauvegarde du paludarium à 22 °C se recharge à 22 °C puis rejoint 20 °C ;
  l'écart (2 °C) reste sous le seuil « attention » : pas d'alerte de température.
- Restent à faire : sourcer à une source primaire la cohabitation sonneur / triton (ou
  séparer les deux espèces si elle se révèle déconseillée) ; contournement des obstacles par
  l'axolotl, qui permettrait un décor au centre du bac d'eau froide.
