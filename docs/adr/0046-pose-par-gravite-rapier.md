# 0046 — Pose par gravité avec Rapier, chargé à la demande

- Statut : acceptée
- Date : 2026-10-24
- Auteur : Dev, cycle 59, issue #170

## Contexte

Dans l'éditeur du décor (ADR 0043, 0044), un élément ajouté ou déplacé apparaissait
directement sur le sable, quitte à traverser un voisin. Mathis veut qu'un élément lâché tombe
et se pose, sur le sable ou sur un autre élément (idées #34 et #35), avec le moteur
**Rapier**, utilisé **seulement pendant le placement** et chargé **à la demande** (commentaire
de Mathis sur #35). La simulation des poissons et les captures ne doivent lire que les poses
enregistrées (ADR 0003 : `sim/` reste pur, sans moteur).

## Décision

- **Paquet** : `@dimforge/rapier3d-compat` 0.21.0 (version exacte), licence **Apache-2.0**
  (vérifiée dans `node_modules/@dimforge/rapier3d-compat/package.json` et son `LICENSE`),
  projet maintenu par Dimforge. La variante `compat` embarque le WebAssembly en base64 dans
  le JavaScript : aucun fichier `.wasm` à servir, donc rien à adapter au chemin de base de
  GitHub Pages (`/aqfish/`).
- **Chargement** : `core/decor-physics/load-decor-physics.ts` fait un `import()` dynamique de
  `decor-physics.ts` (seul fichier qui importe Rapier) à la **première ouverture** de
  l'éditeur (`setDecorEditing(true)`), jamais en mode capture. Fragment séparé d'environ
  4,3 MB (1,2 MB compressé) ; bundle initial inchangé (240,62 → 240,75 kB). Le script
  `postbuild` (`scripts/verifier-bundle-initial.mjs`) fait échouer le build si un script
  initial contient le moteur.
- **Scène pure** (`sim/decor-drop.ts`) : le corps qui tombe est l'élément lâché, décrit par
  ses **sphères de collision** (ADR 0015 : blocs des rochers, sphères des branches du bois,
  tiges des plantes, le feuillage restant traversable). Les autres rochers et bois sont des
  sphères **fixes**, épaissies de 2 mm (`DROP_SKIN`) pour absorber la pénétration tolérée par le
  contact du moteur. Les plantes ne portent rien (elles plient) : un rocher lâché dans une
  plante tombe jusqu'au sable, et la pose est refusée s'il pénètre ses tiges. Sol : une boîte dont le dessus est le point le plus bas du corps posé
  sur le sable ; quatre vitres. Départ au-dessus du plus haut voisin (+ 2 cm), à 8 cm au
  moins.
- **Chute** : pas fixe de 1/60 s, **2 s au plus** (`DROP_MAX_STEPS` = 120), arrêt dès que le
  corps est immobile (6 pas sous 1 mm/s, ou endormi). **Rotations bloquées** : la rotation
  enregistrée est celle choisie dans l'éditeur. Frottement 0,7, sans rebond. Monde Rapier
  neuf à chaque chute, objets créés dans un ordre fixe : même décor, même lâcher, même pose
  (test unitaire).
- **Pose enregistrée** : position (x, z) et nouvelle clé facultative `DecorItem.elevation`
  (hauteur de la base au-dessus de sa pose sur le sable, dans [0, hauteur du bac]). Sous
  3 mm, l'élément est sur le sable et la clé est omise : un décor sans empilement est
  identique à l'octet à celui d'avant (captures inchangées, sauvegarde au même schéma 1). Sur
  le sable libre, la position du lâcher est gardée telle quelle (le contact avec le sol la
  décale d'un millimètre). La pose finale passe par `isDecorPoseAllowed` comme un glissement.
- **Sphères remontées** : sur le sable, les sphères d'un rocher descendent sous sa base (partie
  enfouie, invisible). Posé sur un autre élément, il reposerait sur cette partie, au-dessus
  du vide (vu en local : 6 cm d'écart). Pour le corps qui tombe et pour tout élément
  d'élévation non nulle, chaque sphère est remontée pour ne pas descendre sous la base
  (`liftedSphereY`) : ce sont aussi ses obstacles pour les poissons et pour
  `isDecorPoseAllowed`.
- **Repli** : moteur en chargement, inaccessible (hors ligne) ou en erreur : l'élément est
  posé sur le sable à la position du lâcher ; s'il est inaccessible, le panneau l'annonce
  (« Chute indisponible… »).
- **Rotation et échelle d'un élément posé** (#183, cycle 61) : tourner ou redimensionner un
  élément d'élévation non nulle le fait retomber depuis sa position, par la même chute
  (réduit ou tourné, il rejoint son support ; agrandi, il s'y repose plus haut au lieu d'être
  refusé). La pose obtenue passe par `isDecorPoseAllowed` ; refusée, ou moteur pas encore
  prêt, l'édition se fait à élévation constante comme avant (le repli sur le sable ferait
  pénétrer le support). Un élément sur le sable garde exactement sa pose.
- **Éléments dont le support disparaît** (#182, cycle 63) : après chaque modification du
  décor dans l'éditeur (`AquariumHost.applyDecor` : ajout, suppression, glissement, rotation,
  échelle), chaque élément d'élévation non nulle qui ne repose plus sur rien retombe
  (`sim/decor-release.ts`). « Soutenu » : une de ses sphères touche, par en dessous, une
  sphère d'un rocher ou d'un bois (distance au plus la somme des rayons + `DROP_SKIN` +
  `SUPPORT_GAP` de 5 mm, normale de contact à plus de 0,2 de la verticale ; les plantes ne
  portent rien). Mesuré sur 709 poses obtenues par la chute (rochers, bois et plantes lâchés
  sur le décor par défaut) : 706 jugées soutenues ; à 2 mm de jeu, une plante posée à 6 mm
  de son support était jugée en l'air. La chute part de la **pose actuelle** (`decorFallScene`),
  pas du dessus du décor : ce que porte l'élément ne l'arrête pas. Le plus bas d'abord, puis
  de nouveau (cascade : ce qu'il portait retombe à son tour), au plus deux chutes par élément.
  Une chute qui déplace l'élément de moins de 1 mm (`SUPPORT_SAME_POSE`, élément calé sans
  appui assez vertical) est ignorée : un élément soutenu garde sa pose **à l'octet**. Pose
  refusée par `isDecorPoseAllowed`, ou moteur absent : posé sur le sable si c'est permis,
  sinon laissé tel quel. La première de ces chutes est affichée, sauf si le geste affiche la
  sienne (lâcher, rotation ou échelle d'un élément posé).
- **Image** : la trajectoire (un point par pas) est rejouée en temps réel par l'hôte
  (`previewDecorPose`), sans toucher au monde déjà enregistré.

## Options écartées

- **Physique dans la simulation** (poissons qui poussent le décor) : hors périmètre, et le
  moteur casserait la pureté de `sim/`.
- **Variante `@dimforge/rapier3d` (WebAssembly séparé)** : plus légère en JavaScript, mais un
  `.wasm` à servir sous `/aqfish/` et à charger selon le bundler ; la variante `compat` évite
  ce risque pour un fragment chargé une fois.
- **Laisser tourner le corps** (rotation libre ou autour de Y) : il faudrait enregistrer une
  orientation complète et la rendre ; un rocher incliné se poserait mal sur le sable voxel.
- **Maillages voxels comme formes de collision** : coûteux et sans gain visible ; les sphères
  sont déjà celles des poissons.

## Conséquences

- Un élément posé sur un autre retombe si l'on retire, déplace ou réduit son support (#182).
  Le redimensionnement du bac (ADR 0047) ne relâche rien : hors de l'éditeur du décor.
- Le rendu (`DecorLayer`), les formes de collision et la nourriture posée sur un rocher
  tiennent compte de `elevation`.
- Le bassin et le récif ne sont toujours pas éditables (ADR 0043).
