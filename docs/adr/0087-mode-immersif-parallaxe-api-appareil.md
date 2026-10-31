# 0087 — Mode immersif, lot 2 : parallaxe et API d'appareil

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 116, issue #346

## Contexte

Suite de l'ADR 0086 (#340, lot 2/2) : sur téléphone, incliner l'appareil doit déplacer l'œil
comme à travers une vraie vitre, et la page doit ménager la batterie. Les API utiles
(orientation, plein écran, Wake Lock) manquent selon l'appareil, exigent parfois un geste de
l'utilisateur ou une autorisation, et peuvent lever. Le lot 2 est découpé (risque de taille
signalé dans l'issue) : cette ADR couvre la parallaxe, l'autorisation, le repli et les gardes
d'API ; tapotement de la vitre, nourriture et interface minimale suivent dans une PR à part.

## Décision

- **Modèle de parallaxe** (`core/immersive/parallax.ts`, pur) : la tête est fixe, l'appareil
  tourne. Tourner l'écran de θ revient à tourner l'œil de −θ dans le repère de l'écran :
  décalage d · sin θ à la distance d'œil d. `gamma` (gauche-droite) donne x, `beta`
  (avant-arrière) donne y ; `alpha` (boussole) est ignoré (dérive, inutile à une fenêtre).
  Les axes de l'appareil sont tournés de `screen.orientation.angle` vers ceux de l'écran.
- **Pose neutre** : la première lecture valide (l'appareil tel qu'on le tient), puis
  recentrage exponentiel lent (constante 4 s) : une inclinaison maintenue redevient « en
  face », on peut s'allonger ou changer de prise sans étalonner. Remise à zéro à chaque
  changement de taille ou de rotation.
- **Amortissement** exponentiel de l'œil (constante 0,12 s), exact quel que soit le pas de
  temps (même œil à 30 et 60 images par seconde) ; pas borné à 0,25 s (pas d'à-coup après une
  image sautée).
- **Bornes** : écart d'angle à ±30°, décalage à 0,8 × la demi-largeur et la demi-hauteur de
  l'écran (au-delà, la projection devient très oblique et les bords trop étirés). Valeurs de
  jeu, à ajuster à l'usage.
- **Entrées invalides** (lecture absente, `null` comme le donne un ordinateur sans capteur,
  angle non fini, pas de temps négatif) : ignorées ; sans lecture, l'œil revient au centre.
- **Autorisation** (`core/immersive/device-api.ts`) : si `DeviceOrientationEvent.requestPermission`
  existe (Safari sur iOS et iPadOS depuis la version 13, à notre connaissance ; **constaté
  aussi sur le Chromium sans interface local**, build 1243 (pas sur celui de la CI), qui répond `prompt` sans
  autorisation du contexte et `granted` avec), elle est demandée au premier `pointerdown`
  dans le mode, puisqu'elle exige un geste ; seule la réponse `granted` active la parallaxe.
  Sinon (navigateurs sans cette fonction) l'écoute commence à l'entrée. **La documentation de référence (MDN,
  W3C) n'a pas pu être consultée pendant ce cycle (accès refusé) : comportement décrit d'après
  les connaissances générales, à vérifier sur un iPhone réel.** Refus, rejet, exception ou
  API absente : repli sans parallaxe (œil centré, comportement du lot 1), état exposé par
  `data-immersive-parallax` (`off`, `waiting`, `on`, `denied`).
- **Après un refus** (décidé au cycle 117, #357) : **une seule demande par ouverture du
  mode**. Un refus (`denied`, rejet ou exception) n'est pas redemandé aux touchers suivants :
  le toucher servira à d'autres gestes (tapotement de la vitre, nourriture), un dialogue à
  chaque toucher serait pénible, et Safari, à notre connaissance, répond de toute façon
  `denied` sans redemander tant que la page n'est pas rechargée (à vérifier sur un iPhone
  réel). Refermer puis rouvrir le mode recrée le composant : la demande repart au premier
  toucher. L'état `denied` reste affiché jusque-là.
- **Plein écran** demandé au premier toucher **tactile** seulement (`pointerType === 'touch'`) :
  à la souris, un clic sur « Réglages » ne doit pas faire basculer l'écran. Préfixe WebKit
  accepté. Sur iPhone, Safari ne propose pas le plein écran d'un élément : le mode reste en
  fenêtre. Sortie du plein écran à la fermeture du mode.
- **Wake Lock** (`navigator.wakeLock.request('screen')`) demandé à l'entrée et au premier
  toucher (certains navigateurs exigent un geste), relâché à la sortie et quand la page est
  masquée, redemandé quand elle redevient visible (le navigateur le libère de lui-même).
- **Batterie** : au plus **30 images par seconde** (`FrameLimiter`, marge d'un quart
  d'intervalle contre la gigue : une image sur deux à 60 Hz, environ 40 à 120 Hz) ; le temps
  de simulation s'accumule sur les images sautées. **Page masquée** : boucle arrêtée, reprise
  sans rattrapage du temps passé.
- **Aucune allocation par image à paramètres constants** (#355) : la caméra n'est réappliquée
  (tronc, matrice) que si l'œil bouge de plus de 0,05 mm, si la distance ou la vue changent ;
  objet de caméra réutilisé, copié par `AquariumView.setImmersiveCamera` dans un objet interne
  préalloué (#357), sans allocation.
- Aucune de ces fonctions ne lève ni ne rejette : l'échec vaut `false` ou `null`.

## Options écartées

- **Suivi de la tête par la caméra frontale** : autorisation lourde, coûteux, hors périmètre.
- **Position absolue (gravité)** sans pose neutre : l'œil serait décentré dès que l'appareil
  n'est pas tenu à la verticale.
- **Demander l'autorisation à l'entrée du mode** : le clic sur « Mode immersif » est bien un
  geste, mais il a lieu dans l'application hôte, avant la création du composant ; garder la
  demande dans le composant le rend autonome et testable.
- **`requestAnimationFrame` à pleine cadence** : sur un téléphone à 120 Hz, quatre fois plus
  de rendus qu'utile pour un décor lent.

## Conséquences

- Ordinateur : rien ne change (pas de lecture d'orientation, pas de plein écran à la souris).
- Les e2e n'ont pas de capteur : ils accordent `accelerometer` et `gyroscope` au contexte,
  touchent la vitre, puis injectent des `DeviceOrientationEvent` synthétiques.
- Wake Lock en e2e : refusé (`NotAllowedError`, page sans interface), absorbé sans erreur
  console.
- La vue normale et ses captures ne changent pas : le mode est absent en capture.
