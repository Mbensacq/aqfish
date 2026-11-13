# 0137 — Mortalité : risque au plancher de santé, corps hors des entités

- Statut : acceptée (complète les ADR 0054 et 0088)
- Date : 2026-11-13
- Auteur : Dev, cycle 211, issue #582

## Contexte

Jusqu'ici la santé (`sim/wellbeing.ts`, ADR 0054) s'arrêtait à un plancher : une maladie non
soignée, la faim ou une eau toxique n'avaient pas de conséquence ultime. L'issue #582 demande
qu'un animal négligé finisse par mourir, reste dans l'eau grisé jusqu'à son retrait à
l'épuisette (clic), pollue l'eau tant qu'il reste, et que l'option « Mortalité » coupée laisse
le jeu exactement tel qu'avant (tests et captures identiques).

## Décision

1. **Option dans le monde** : `World.mortality?: true`, absente par défaut (bac par défaut,
   anciennes sauvegardes), jamais écrite à faux. En mode décor, `stepInPlace` s'arrête avant
   l'eau et la santé : aucun décès, sans code de plus.
2. **Risque pur, au plancher seulement** : `mortalityRate(animal, eauToxique)` vaut 0 tant que
   la santé dépasse `MORTALITY_HEALTH` (plancher + 0,02) ; au-dessous, λ = causes ·
   `MORTALITY_RATE_PER_CAUSE` (1/1200 s⁻¹), avec trois causes de poids 1 au plus : maladie
   (somme des poids des maladies dans la santé, bornée à 1), jeûne (faim maximale, espèce
   nourrie aux granulés) et eau toxique (ammoniaque libre ou nitrites au seuil « mauvaise »).
   Un animal qui se remet (plus aucune cause) ne meurt pas, même au plancher. La santé met
   déjà 8 minutes simulées à y descendre : il reste le temps d'agir. Valeurs : approximations
   de jeu.
3. **Tirage sans état** : hachage de (graine, pas, identifiant) avec un sel propre
   (`mortalityDraw`), comme les maladies (ADR 0088) ; calculé seulement si λ > 0. Aucun
   sous-générateur consommé : un bac sain avance au bit près comme avant.
4. **Corps hors des entités** : un mort passe de `World.entities` à `World.dead`
   (`DeadAnimal` = ses données de vivant + `deadFor`). Banc, repas, maladies, santé, ponte,
   effectifs, alertes et transferts ne voient donc jamais les corps : aucun de ces systèmes
   n'a eu à changer. Un nageur remonte flotter à la surface (`DEAD_FLOAT_SPEED`), un marcheur
   ou un amphibien reste au fond.
5. **Décomposition par la charge** : `deadLoad(dead)` = `DECAY_LOAD_FACTOR` (3) fois la charge
   de vivant des corps, ajoutée à `waterLoad` dans l'étape de l'eau. Le retrait annule l'effet
   au pas suivant ; sans corps, la charge ajoutée vaut exactement 0.
6. **Rendu** : la couche des poissons place les corps après les vivants (`FishLayer.update`,
   paramètre `dead`), ternissement poussé à `DEAD_DULLNESS` (presque gris), roulis de π (ventre
   en l'air) ou de π/2 (sur le flanc, au fond), queue droite, aucun autre signe.
7. **Épuisette** : un clic sur le canvas cherche le corps le plus proche le long du rayon de la
   caméra (`netTarget`, rayon de prise `max(NET_RADIUS, longueur du corps)`) ; s'il en trouve
   un, il le retire et ce clic ne nourrit pas. Aucun outil à prendre en main : le geste est le
   plus simple possible pour tous les âges.
8. **Sauvegarde** : `mortality` et `dead` (poissons enregistrés + `deadFor`) facultatifs,
   validés comme les poissons ; anciennes sauvegardes relues sans corps.
9. **Paramètre `mort=1`** : mortalité activée et premier animal mort à t = 0, en capture comme
   hors capture (captures `side-mort` et `front-mort`, e2e de l'épuisette).

## Options écartées

- **Corps restant dans `entities` avec un drapeau** : chaque système (banc, repas, cinq
  maladies, santé, ponte, effectifs, alertes, transfert) aurait dû l'exclure ; un oubli faisait
  nager ou soigner un mort.
- **Seuil de décès déterministe** (mort à X secondes au plancher) : toute une population
  négligée mourrait au même pas, ce qui se lit mal et ne laisse aucune chance.
- **Ammoniaque ajoutée directement par corps** : doublonne la production par la charge
  (ADR 0052) et change l'unité ; la charge réutilise le même modèle.

## Conséquences

- Lot 2 (hors de cette PR) : réglage « Mortalité » visible dans l'interface (le panneau
  « Réglages » n'a plus de marge à 1280 × 720, `docs/PIEGES.md`), annonce sobre d'un décès au
  tableau de bord, défaut à décider pour le mode soins. D'ici là, l'option n'est activée que
  par `mort=1` ou une sauvegarde.
- Tout nouveau système qui parcourt les animaux lit `World.entities` : les corps n'y sont pas.
  Un système qui doit voir les corps (rendu, eau) lit aussi `World.dead`.
