# 0085 — Caméra libre dans la pièce, lot 2 : tactile et édition

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 114, issue #344

## Contexte

Lot 2/2 de l'idée de Mathis #228, après l'ADR 0084 (déplacement au clavier, orientation à la
souris). Sur téléphone, il n'y a ni clavier ni bouton droit : il faut glisser pour orienter et
un moyen d'avancer et de reculer. La caméra libre ne doit pas empêcher d'éditer le décor et
les meubles, et le mode choisi doit être retrouvé au rechargement sans changer le schéma de
la sauvegarde. Les captures existantes restent identiques à l'octet.

## Décision

- **Gestes purs** (`render/free-camera-touch.ts`, sans DOM ni Three.js) :
  - glisser d'orientation avec **seuil** : 4 px à la souris (celui du clic, `CLICK_TOLERANCE_PX`),
    10 px au doigt ; au franchissement, tout le déplacement depuis l'appui est appliqué. Un
    appui bref reste un clic (sélection, pose d'un élément, granulés) ;
  - **pincement** : deux doigts qui s'écartent avancent, qui se rapprochent reculent. Au-delà
    de 12 px de variation d'écart, chaque variation ajoute `écart / 120 px` à une **poussée**
    bornée à [−1, 1], ajoutée à l'avance du clavier ; elle **s'éteint** avec une constante de
    0,3 s (exponentielle : même résultat quel que soit le découpage en images), annulée sous
    10⁻³. Le second doigt arrête l'orientation et annule le clic du premier ;
  - états mutés en place, tampons réutilisés : aucune allocation par image (dette #352).
- **Pavé « Avancer » / « Reculer »** (`ui/free-camera-pad/`) : bouton tenu (doigt, souris,
  Entrée ou Espace) = touche tenue (`AquariumHost.setFreeMoveHeld`), relâché à `pointerup`,
  `pointercancel`, perte de capture ou du focus. Placé au **bord gauche, à mi-hauteur**, boutons
  de 44 × 44 px : la colonne de l'indicateur du moment de la journée (52 px au plus à 1280 px,
  56 px à 390 px), plus étroite que l'écart au panneau « Réglages » (59 px, 55 px au
  téléphone) ; le tableau de bord occupe le haut et le bas. Affiché en caméra libre seulement.
- **Édition** : inchangée dans son principe. L'appui sur un élément (décor ou meuble) est
  écouté en phase de capture et prend le geste avant l'orientation ; un clic sans glisser
  sélectionne ou pose, comme en orbite.
- **Préférence d'affichage** : clé `aqfish.camera-libre` (`libre` / `orbite`), à part de la
  sauvegarde du monde comme `aqfish.filtre` : schéma inchangé. Écrite à chaque bascule, relue
  au chargement (hors capture et fond d'écran) : caméra libre reprise si la pièce est affichée.
  Un préréglage choisi depuis la caméra libre vaut retour à l'orbite (préférence `orbite`) ;
  masquer la pièce rend l'orbite sans changer la préférence (la pièce est un autre choix).

## Options écartées

- **Poussée constante tant que les doigts sont posés** : on ne peut plus s'arrêter sans
  lever les doigts, et le geste se confond avec le zoom de l'orbite. La poussée amortie se lit
  comme un « élan ».
- **Boutons dans la barre des vues** : à 390 px elle passe déjà sur deux lignes ; une
  troisième la ferait monter sur le bandeau du tableau de bord.
- **Champ `cameraLibre` dans la sauvegarde** : changement de schéma pour une préférence
  d'affichage, et un export partagé imposerait le mode à qui l'importe.
- **Pas d'aide-mémoire tactile supplémentaire** : l'aide-mémoire tient tout juste à 1280 × 720
  (PIEGES) et apparaît dans 9 captures.

## Conséquences

- Les captures existantes ne changent pas (pavé hors capture, préférence ignorée en capture).
- Les meubles et les autres bacs posés ne sont toujours pas des obstacles (ADR 0084).
