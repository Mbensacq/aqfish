# 0147 — Poisson rouge au bassin et règle de température de la compatibilité

- Statut : acceptée (complète l'ADR 0055)
- Date : 2026-11-16
- Auteur : Dev, cycle 232, issue #654

## Contexte

Épopée v1.22 : le bassin n'avait que des koïs. Le poisson rouge (*Carassius auratus*) devait y
être proposé, déconseillé avec l'axolotl et les espèces tropicales, compatible avec les koïs
« selon la plage commune ». Or la compatibilité (ADR 0055) ne connaissait que le tempérament et
la taille : le poisson rouge, paisible, aurait été compatible avec tout le bac tropical, et la
koï, prédatrice plus grande, l'aurait mangé. `docs/ESPECES.md` proposait déjà « intersection
non vide des plages » comme règle ; mais `sim/compatibility.ts` ne peut lire ni les fiches
(`sim/species-sheet.ts` l'importe) ni les environnements (cycle d'imports par `world.ts`).

## Décision

1. **Classe d'eau par espèce** (`WATER_CLASSES`, table complète imposée par le type) :
   `froide` (koï, axolotl, poisson rouge : bassin 18 °C, bac d'eau froide 17 °C), `temperee`
   (sonneur, triton : paludarium 20 °C), `tropicale` (bac tropical et récif). Nouveau verdict
   `'temperature'` pour un couple froide / tropicale, après les règles de prédation et de
   territoire (un prédateur reste dit « prédateur »).
2. **Proies épargnées** (`SPARED_PREY`) : la koï n'est pas prédatrice du poisson rouge, plus
   petit qu'elle (bassins mixtes courants) : approximation de jeu.
3. **Axolotl** : `EXTRA_PREDATORS.axolotl = ['rouge']` (le poisson rouge, plus grand que
   l'axolotl du jeu, en mordille les branchies ; « sans poissons » de `docs/ESPECES.md`).
4. `eaterOf` dit qui mange qui ; le texte de cohabitation du wiki s'en sert (il prenait la proie
   pour le mangeur quand le mangeur venait de `EXTRA_PREDATORS`, cas crevette cerise et xipho).
5. **Bassin** : le poisson rouge est proposé (`POND.species`) sans être peuplé d'office ; trois
   robes (commun, sarasa, jaune) tirées de la graine comme les koïs ; silhouette propre.
   Captures existantes identiques ; nouvelle capture `bassin-side-poissons-rouges`.

## Conséquences

- Couples devenus déconseillés sans poisson rouge : koï ou axolotl face aux espèces tropicales
  plus grandes qu'eux, qu'aucun bac du jeu ne réunit (fiches et wiki : liste « à éviter »
  allongée).
- Une nouvelle espèce doit déclarer sa classe d'eau. Les plages chiffrées restent dans les
  fiches ; la classe n'en est qu'un résumé, à revoir si un environnement change de température.
