# 0096 — Pièce de N bacs, lot 4 : plafonds de performance

- Statut : acceptée
- Date : 2026-11-02
- Auteur : Dev, cycle 130, issue #392 (épopée #264, v1.7)

## Contexte

Depuis le lot 3b (ADR 0076), **tous les bacs vivent** : l'hôte avance le bac affiché à chaque
image et rattrape les autres par lots (`stepRoom`, au plus 4 fois par seconde). Le coût de
simulation d'une pièce est donc la somme de celui de ses bacs, et celui d'un bac croît comme
le **carré** de son nombre d'animaux : les boucles du banc et de l'espacement
(`sim/flocking.ts`) parcourent tous les animaux du bac pour chacun. Les seules bornes étaient
des bornes de **validation** provisoires : 32 bacs (`MAX_ROOM_TANKS`, ADR 0061) et 60
animaux par bac (`MAX_TOTAL_FISH`), soit jusqu'à 1 920 animaux. Avant d'agrandir la pièce vers
l'animalerie, il faut des plafonds mesurés.

## Mesure

`node --expose-gc scripts/mesure-piece.mjs` (hors CI) construit, dans Node, des pièces de
1 à 32 bacs tropicaux de 10, 30 ou 60 animaux (animaux de départ retirés, puis répartis sur
néon, guppy et corydora, chacun borné par son plafond d'espèce : 56 au lieu de 60, voir la
colonne « Animaux »), puis mesure :

- **paires par pas** (`roomSimulationCost`, somme des carrés des effectifs par bac) :
  déterministe, indépendant de la machine ;
- **ms par pas** de toute la pièce (`stepRoom`), médiane de 5 répétitions de 120 pas après
  une chauffe de 10 pas ;
- **tas** (Kio) après construction, avec `--expose-gc` ; **sauvegarde** (`serializeRoom`) ;
- **blocs statiques** des bacs posés (`roomLayoutBlocks`) : un bac non affiché n'ajoute à
  l'image que ses blocs de verre et de cadre (ses animaux ne sont pas dessinés).

Résultats du cycle 130 (environnement des agents : 2 cœurs, Node 22, rien d'autre en cours) :

| Bacs | Animaux/bac | Animaux | Paires/pas | ms/pas | ms par seconde simulée | Tas (Kio) | Sauvegarde (Kio) |
| ---: | ----------: | ------: | ---------: | -----: | ---------------------: | --------: | ---------------: |
|    1 |          30 |      30 |        900 |   0,11 |                      7 |        72 |               16 |
|    1 |          60 |      56 |      3 136 |   0,23 |                     14 |        40 |               29 |
|    4 |          60 |     224 |     12 544 |   1,09 |                     65 |       143 |              113 |
|    8 |          30 |     240 |      7 200 |   0,68 |                     41 |       239 |              126 |
|   16 |          10 |     160 |      1 600 |   0,38 |                     23 |       309 |               96 |
|   16 |          30 |     480 |     14 400 |   1,55 |                     93 |       385 |              250 |
|   32 |          10 |     320 |      3 200 |   0,69 |                     42 |       533 |              191 |
|   32 |          60 |   1 792 |    100 352 |   7,80 |                    468 |     1 121 |              902 |

Blocs statiques : 11 par bac posé (165 pour 15 bacs posés).

Lecture : environ **0,08 µs par paire** plus **~0,02 ms par bac** et par pas ; le temps suit
surtout les paires, pas le nombre de bacs. Une pièce de 32 bacs pleins coûte ~8 ms par pas,
la moitié d'une image à 60 images/s, et ses rattrapages (15 pas d'un coup à vitesse ×1)
dureraient plus de 100 ms.

**Limites** : temps instables d'une exécution à l'autre (jusqu'au double pour les petites
pièces, `docs/PIEGES.md`) : seuls les ordres de grandeur comptent. Mesuré dans Node, pas dans
le navigateur (même moteur V8, sans le rendu ni Angular). **Temps d'image non mesuré** :
WebGL est en rendu logiciel dans l'environnement des agents (`docs/PIEGES.md`) ; seul le
nombre de blocs ajoutés est donné. **Téléphone non mesuré** : aucun appareil dans l'environnement des agents ;
à vérifier par Mathis (lancer le script sur sa machine donne au moins le rapport avec le
poste de bureau).

## Décision

1. **Plafonds d'ajout** (`sim/room-limits.ts`) :
   - `ROOM_ANIMAL_CAP` = **240 animaux**, tous bacs confondus. Pire cas à ce plafond : 4 bacs
     de 60, 14 400 paires, entre 1,1 et 1,6 ms par pas (lignes 4 × 60 et 16 × 30), soit
     moins de 100 ms de calcul par seconde simulée (moins de 10 % d'un cœur ici) ; c'est
     l'ordre du budget de l'architecture (60 images/s avec 200 poissons).
   - `ROOM_TANK_CAP` = **16 bacs** (défini dans `sim/room-state.ts` à côté de
     `MAX_ROOM_TANKS`, réexporté). Le coût fixe d'un bac est faible (~0,02 ms par pas, 11
     blocs) mais s'ajoute à chaque rattrapage (un clone de monde par bac) ; 16 bacs de 10
     animaux tiennent sous 0,4 ms par pas et 100 Kio de sauvegarde, la liste des bacs des
     réglages reste lisible, et 16 bacs laissent 15 animaux en moyenne par bac sous le
     plafond d'animaux. Choix de jugement, révisable.
2. **Refus avec message, sans effet de bord** :
   - `addTank` refuse au-delà de `ROOM_TANK_CAP` (`piece-pleine`, pièce inchangée) ; l'hôte
     affiche `ROOM_TANK_CAP_MESSAGE` dans le catalogue « Bacs et meubles » (avant de chercher
     une place).
   - Effectifs : `roomPopulationLimits` ramène le maximum de chaque espèce du bac affiché à
     son effectif plus la place restante dans la pièce ; l'hôte s'en sert pour
     `populationMax` (« + » désactivé, champ borné) et pour ramener toute demande
     (`setPopulation`, panneau et wiki). Au plafond, `ROOM_ANIMAL_CAP_MESSAGE` s'affiche en
     tête de la section « Population » (`data-room-cap`, `role="status"`, style de note
     existant : aucun nouveau panneau). Retirer reste toujours possible.
3. **Plafonds d'ajout, pas de validation** : `MAX_ROOM_TANKS` (32) et `MAX_TOTAL_FISH` (60
   par bac) restent les bornes de lecture d'une sauvegarde. Une pièce venue d'une ancienne
   sauvegarde au-delà des plafonds se charge et garde tout ; seuls les ajouts sont refusés.
4. **Transferts** (`transferFish`) inchangés : ils déplacent un animal sans changer le total.

## Options écartées

- **Baisser `MAX_ROOM_TANKS` ou `MAX_TOTAL_FISH`** : rendrait illisibles des sauvegardes
  existantes (refus au chargement).
- **Test de CI sur les temps** : non reproductible ici (`docs/PIEGES.md`) ; la CI vérifie les
  plafonds (tests unitaires et e2e), pas les temps.
- **Plafond sur les paires plutôt que sur les animaux** : plus juste pour le coût, mais
  incompréhensible pour l'utilisateur (« 240 animaux » se lit, « 14 400 paires » non).
- **Rendu ou simulation réduits des bacs éloignés** : hors périmètre (lots 5 et 6 de #264).

## Conséquences

- Changer d'environnement crée encore son bac de départ (jusqu'à 5 bacs, quelques animaux
  chacun), même au plafond d'animaux : la pièce peut alors le dépasser de quelques animaux ;
  plus aucun ajout tant qu'on n'en retire pas. Assumé : l'environnement n'est pas un ajout
  d'animal choisi.
- Les rattrapages des bacs non affichés restent par lots : au plafond, un lot de 15 pas coûte
  ~20 ms, 4 fois plus à vitesse ×4. À lisser (rattrapage étalé sur plusieurs images) si
  Mathis constate des saccades.
- Les plafonds se changent en un seul endroit (`ROOM_TANK_CAP`, `ROOM_ANIMAL_CAP`) ; les
  messages et les tests les suivent.
