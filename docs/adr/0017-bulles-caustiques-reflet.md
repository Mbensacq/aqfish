# 0017 — Bulles sans état, caustiques et reflet de surface par cases

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 17, issue #50

## Contexte

L'épopée v0.3 « Le décor » ajoute les bulles d'un diffuseur, un reflet de surface et des
caustiques sur le sable (`docs/DA.md`, règles 5 et 6). Contraintes : déterminisme et contrat
de capture (même graine, même temps : mêmes octets), aucune allocation par image, nombre de
bulles borné, aucune couleur hors palette, et ne pas consommer le hasard des poissons (leurs
trajectoires ne doivent pas changer).

## Décision

- **Bulles sans état** (`sim/bubbles.ts`) : la bulle n° k naît au temps `k · 0,25 s` sur le
  diffuseur ; sa position est une fonction fermée de la graine du monde, de k et du temps
  simulé (montée à vitesse constante tirée dans [0,10 ; 0,16) m/s, zigzag sinusoïdal de
  3 à 8 mm, petite dérive, léger décalage d'émission), et elle disparaît en atteignant la
  surface. Ses paramètres viennent d'un flux de hasard dédié :
  `deriveSeed(deriveSeed(graine, BUBBLE_STREAM), k)`. `fillBubbles(graine, temps, tampon)`
  écrit les bulles vivantes dans un tampon préalloué ; le plafond `MAX_BUBBLES` (19 dans le
  bac par défaut) est le nombre d'émissions pendant la vie de la bulle la plus lente.
  `World` ne change pas : `worldBubbles(monde, tampon)` lit la graine et le temps du monde.
- **Rendu des bulles** (`render/bubble-layer.ts`) : deux nuages de points
  (`PointsMaterial`, `sizeAttenuation: false`) de 1 et 2 pixels de la cible basse
  résolution, donc 1 et 2 pixels de scène quel que soit le zoom ; couleur `eauTresClaire`,
  dessinés après les poissons en opacité pleine (couleur exacte, ADR 0009). Sans filtre
  (ADR 0010), la taille est multipliée par `PIXEL_SIZE × pixelRatio`. Un diffuseur
  (`rocheSombre`, 2,4 cm) marque le point d'émission, sans forme de collision.
- **Caustiques et reflet** (`render/water-light.ts`) : deux plans à shader. Le motif est une
  somme de sinusoïdes évaluée au **centre de cases fixes du bac** (1,2 cm pour les
  caustiques, 0,8 cm pour le reflet) : chaque case est allumée en bloc ou non dessinée
  (`discard`). Vecteurs d'onde multiples de 2π / 0,6 m et pulsations multiples de
  2π / 60 s : motif répétable dans l'espace et dans le temps ; le temps simulé est ramené
  modulo 60 s avant d'entrer dans le shader (précision des flottants 32 bits).
  - Caustiques : plan posé 0,8 mm au-dessus du sable, `sableClair` opaque, dessiné après
    l'eau et le verre (couleur exacte, aucune teinte), visible de dessus.
  - Reflet : plan à la surface, `eauTresClaire` à 40 %, entre l'eau et le verre,
    `DoubleSide` : visible de dessus et de dessous (la face supérieure de l'eau, `FrontSide`,
    est invisible du dessous).
  - Les fonctions `causticLit` et `surfaceGlint` sont la référence TypeScript du GLSL
    (mêmes constantes), testée en unitaire.

## Options écartées

- **Bulles avec état dans `World`** (tableau de bulles avancé à chaque pas) : sérialisation
  et clonage plus lourds, intégration numérique à tester, et une capture à `time` dépendrait
  de tous les pas précédents. La forme fermée donne le même résultat par construction, quel
  que soit le chemin suivi.
- **Bulles en petits cubes** (maillage instancié) : leur taille à l'écran dépendrait du
  zoom ; le critère est un à deux pixels de scène.
- **Caustiques par texture ou projection de lumière** : texture à générer et filtrer, ou
  lumière projetée (`SpotLight` avec carte) coûteuse en rendu logiciel ; le motif par cases
  est déjà pixelisé et ne crée aucune teinte intermédiaire.
- **Caustiques translucides sous l'eau** : l'eau les teinte, et la passe palette les
  ramenait à `eauTresClaire` (réseau vert menthe trop présent sur le sable, essai du cycle).

## Conséquences

- Les captures changent (bulles en vue de face, caustiques et reflet en vue de dessus, reflet
  en vue de dessous), mais restent déterministes ; les trajectoires des poissons sont
  inchangées.
- Les caustiques passent par-dessus l'ombre de la lame d'eau (couleur exacte) : un futur
  cycle jour/nuit devra les moduler explicitement.
- Le diffuseur n'est pas un obstacle : un corydora peut le traverser (2,4 × 1,2 cm). À
  revoir s'il grossit ou s'il devient un élément de `World.decor`.
