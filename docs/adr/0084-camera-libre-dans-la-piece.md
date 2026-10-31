# 0084 — Caméra libre dans la pièce, lot 1 : déplacement et limites

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 113, issue #343

## Contexte

Idée de Mathis #228, lot 1/2 : une caméra qui flotte dans la pièce fermée (ADR 0081, 0083),
sans vue à la première personne : avancer, reculer, côtés, monter, descendre, orientation à la
souris. Elle ne doit traverser ni mur, ni sol, ni plafond, ni le bac ; le retour à l'orbite rend
la pose d'avant. Sans pièce affichée, rien ne change ; les captures existantes restent
identiques à l'octet. La caméra orbitale (`OrbitControls`, ADR 0020) garde ses gestes.

## Décision

- **Modèle pur** (`render/free-camera.ts`, sans Three.js) : état = position, cap (`yaw`, 0 vers
  le mur du fond, −Z), inclinaison (`pitch`, bornée à ±(π/2 − 0,05) : jamais à la verticale,
  où `lookAt` serait indéterminé) et vitesse. `stepFreeCamera` avance par **pas fixes** de
  1/120 s (reste reporté à l'appel suivant, au plus 0,25 s par appel) : la vitesse tend vers la
  consigne (1,2 m/s) avec un amortissement exponentiel de constante 0,15 s, puis la position
  avance **axe par axe** ; un axe qui sortirait de la pièce ou entrerait dans l'obstacle
  s'arrête au bord et sa vitesse est annulée : la caméra glisse le long des parois. Avancer et
  reculer restent dans le plan horizontal (on flotte, on ne vole pas vers le point visé).
- **Limites** (`freeCameraBounds(dims, cabinetHeight)`) : faces intérieures de
  `roomInterior(dims)` (murs, dessous des poutres), parquet à −hauteur du meuble ; obstacle =
  bac et meuble au débord du plateau, du sol au haut du bac ; chaque face rapprochée de 0,15 m.
  Une pose de départ hors limites (orbite lointaine, `libre=` dans le bac) est ramenée par
  `constrainFreePosition` : dans la pièce, puis hors de l'obstacle par la face la plus proche
  qui reste dans la pièce.
- **Vue** (`AquariumView`) : `enterFreeCamera` garde la pose et le préréglage suivis, coupe
  `OrbitControls`, place la caméra sans `controls.update()` (qui ramènerait distance et cible
  dans les bornes de l'orbite) ; `exitFreeCamera` rend la pose d'avant, ou recadre sur le
  préréglage suivi. Refusé sans pièce dessinée et en vue non interactive. Glisser au bouton
  gauche oriente (0,004 rad par pixel). Un préréglage (barre, touches 1 à 5) quitte la caméra
  libre par une transition depuis la pose libre ; masquer la pièce rend l'orbite.
- **Commandes** (`core/commands`, source unique) : touche `L`, sur **une seule ligne** du
  groupe « Vues » de l'aide-mémoire (« Caméra libre : ZQSD, E/C, glisser ») : le panneau doit
  tenir sans défilement à 1280 × 720 (`e2e/cadrage-panneaux.spec.ts`), un groupe de quatre
  lignes le faisait déborder. Déplacements actifs dans ce mode seulement, AZERTY, QWERTY et
  flèches (`Z`/`W`/↑, `S`/↓, `Q`/`A`/←, `D`/→, `E`/Page ↑, `C`/Page ↓), lus par l'hôte en
  touches tenues (relâchées à la perte du focus). Aucune touche de déplacement ne reprend un
  raccourci.
- **Réglage** : bouton « Libre » dans la barre des vues, affiché seulement pièce affichée. Pas
  de ligne dans le panneau des réglages : à 1280 × 720 il n'en accepte plus (PIEGES, #316).
- **Contrat de capture** : `libre=x:y:z:cap:inclinaison` (mètres, degrés), avec `piece=1`,
  pose instantanée sans passer en caméra libre ; absent, mal formé ou pièce masquée :
  préréglage habituel. Trois captures ajoutées (`libre-interieur`, `libre-fenetre`,
  `libre-plafond`).
- Exposé aux e2e : `data-aqfish-camera-libre` (`true` / `false`) sur `app-aquarium-host`.

## Options écartées

- **`PointerLockControls` / `FlyControls` de Three.js** : pas de pas fixe ni de limites, état
  dans les contrôles (non testable sans WebGL) ; le verrouillage du pointeur ajoute une
  permission et une sortie à la touche Échap qui se mêle à l'interface.
- **Avancer selon la direction de visée** : plus « vol libre », mais tête levée on percute le
  plafond ; le plan horizontal se lit mieux dans une pièce.
- **Collision par sphère contre les blocs de la pièce** : plus juste mais coûteuse ; les
  boîtes suffisent pour l'enveloppe et le bac. Les meubles (#188) et les autres bacs posés
  (#305) ne sont pas encore des obstacles (hors périmètre de #343).

## Conséquences

- Pièce masquée ou caméra libre jamais activée : aucun changement de rendu, captures existantes
  identiques à l'octet.
- Lot 2/2 : équivalents tactiles et édition à la souris dans les deux modes.
- Une PR future qui ajoute un raccourci doit vérifier qu'il ne prend pas une touche de
  `FREE_MOVE_COMMANDS` (test de `commands.spec.ts`).
