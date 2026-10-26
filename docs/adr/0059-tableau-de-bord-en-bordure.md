# 0059 — Tableau de bord de l'eau en bordure : disposition, rythme et règle de plan

- Statut : acceptée
- Date : 2026-10-26
- Auteur : Dev, cycle 80, issue #256

## Contexte

Mathis veut une interface « autour de la fenêtre, sur les bords » qui montre en continu les
données de l'aquarium sans gêner la vue (#251). Le lot 1/3 (#256) pose le cadre et y place
les jauges d'eau déjà modélisées (ADR 0052, 0053, 0057), jusque-là dans la section « Eau »
du panneau « Réglages », visible seulement panneau ouvert. Contraintes : ne jamais
recouvrir le centre du bac (rectangle central de 60 % × 60 %), lisible à 390 px, repliable
à la souris et au clavier, estompé sans passer sous 4,5:1, rafraîchi au plus 4 fois par
seconde, simulation et captures sans interface inchangées.

Place existante (mesurée à 1280 × 720 et 768 × 1024) : indicateur du jour et bouton
« Réglages » en haut à gauche (jusqu'à 143 px), aide-mémoire « Commandes » de 300 px en haut
à droite, déplié par défaut dès 640 px, barre des préréglages en bas au centre.

## Décision

- **Composant `ui/dashboard-frame/`** (standalone, `OnPush`, signaux), dans le bloc
  `@defer` de l'application à côté de l'indicateur du jour, absent en mode capture.
  Fonctions de préparation pures dans `sim/water-dashboard.ts` (niveau, remplissage, valeur
  affichée, tendance, texte lu), à côté de `sim/water-quality.ts` qu'elles réutilisent
  (`levelOf`, `gaugeFill`, seuils) ; rythme (`refresh-pace.ts`) et contraste (`contrast.ts`)
  purs dans le dossier du composant.
- **Disposition** (`dashboard-frame.scss`) :

  | Largeur | Place | Effet sur les autres panneaux |
  | ------- | ----- | ----------------------------- |
  | ≥ 1100 px | barre haute dans la ligne des boutons, entre 155 px et 324 px du bord droit (place de l'aide-mémoire) | aucun |
  | 640 à 1099 px | bandeau sous la ligne des boutons (haut 56 px, ~67 px de haut) | l'aide-mémoire, déplié par défaut, commence à 129 px (sous le bandeau) |
  | ≤ 639 px | bandeau compact sous les boutons (48 px sous 480 px), bouton « Eau » au-dessus des cinq jauges | aucun (aide-mémoire replié par défaut, #136) |

  Mesuré : bas du cadre à 79 px (1280 × 720, centre à partir de 144 px), 123 px
  (768 × 1024, centre à 205 px), 144 px (390 × 844, centre à 169 px) ;
  `e2e/tableau-de-bord.spec.ts` le vérifie aux trois largeurs.
- **Règle de plan avec les autres panneaux** : le cadre est au plan 0 (au-dessus du canvas),
  les panneaux flottants au plan 1. Un panneau **ouvert à la demande** (« Réglages »,
  « Commandes », éditeur) passe par-dessus le cadre là où ils se croisent ; un panneau
  **ouvert par défaut** ne le masque jamais (d'où le décalage de l'aide-mémoire sur
  tablette). Le cadre n'entre pas dans l'exclusivité de `ui/exclusive-panels` : il ne se
  replie pas tout seul et ne replie personne. L'hôte est transparent au pointeur
  (`pointer-events: none`, contenu `auto`) : le canvas reçoit les gestes autour du cadre.
- **Contenu** : bouton « Eau » (indicateur global en texte et icône, `aria-expanded`,
  `aria-controls`), puis une jauge par grandeur : nom court (« Temp. », « NH₃/NH₄⁺ »,
  « NO₂⁻ », « NO₃⁻ », « pH »), valeur au dixième, unité, flèche de tendance, barre, niveau
  en texte (« Bon », « À surveiller », « Critique » ; pH : « Idéal », « Toléré », « Hors
  plage ») et icône pixel art (coche, point d'exclamation, croix). Chaque barre est un
  `role="meter"` nommé, dont `aria-valuetext` dit tout (« Nitrates (NO₃⁻) : 42,5 unités de
  jeu, critique, en hausse ») ; le texte visible est masqué aux lecteurs d'écran pour ne
  pas être lu deux fois. La barre du pH garde les zones des espèces présentes (ADR 0057).
- **Unités** : °C pour la température ; les composés sont en **unités de jeu** (« u. »,
  lu « unités de jeu »), comme le modèle (`sim/water.ts`) : pas de mg/L inventés.
  L'ammoniaque affichée est le total (NH₃ + NH₄⁺) : la fraction toxique NH₃, qui dépend du pH
  et de la température, n'est pas modélisée.
- **Niveaux** calculés sur les valeurs exactes (relevé `WaterSample`), comme l'indicateur
  global : une valeur affichée « 5,0 » peut rester orange (4,99). Une valeur non finie
  s'affiche « – » et passe au rouge (jamais rassurant à tort).
- **Tendance** mesurée en pas de simulation, jamais en temps réel : référence vieille d'une
  à deux fenêtres de 60 s simulées (`TREND_WINDOW_TICKS`), seuils par grandeur
  (`TREND_THRESHOLDS`, seuil compris). La mémoire repart de zéro si l'environnement change,
  si le pas recule ou saute de plus de deux fenêtres (nouveau monde, import). À l'arrêt
  (vitesse 0), la tendance reste celle du dernier relevé.
- **Rythme** : l'hôte expose `waterSample` (relevé exact) à chaque relevé de l'eau ; dans la
  boucle, un relevé n'a lieu que tous les 30 pas **et** au plus toutes les 250 ms de temps
  réel (`refreshDue`), quelle que soit la vitesse (à vitesse 4, il y en avait 8 par
  seconde). Les actions (changer l'eau, chauffage, import, environnement) relèvent tout de
  suite. Aucune écriture dans le monde : simulation et déterminisme inchangés.
- **Estompage** : opacité 0,85 au repos, 1 au survol et au focus. Couleurs et opacités sont
  des constantes TypeScript posées en variables CSS par le composant ; un test unitaire
  compose les couleurs comme le navigateur (fond, texte, opacité du groupe, scène blanche,
  noire, sable, eau) et vérifie au moins 4,5:1 pour chaque texte lu.
- **Panneau « Réglages »** : la section « Eau » ne garde que ce qui se règle (« Changer
  l'eau », chauffage avec sa consigne) ; indicateur global, trois jauges et jauge pH passent
  dans le cadre, avec leurs tests (aucun supprimé : déplacés ou réécrits sur le cadre).

## Options écartées

- **Barre haute à toutes les largeurs dans la ligne des boutons** : à 768 px, l'aide-mémoire
  déplié ne laisse que ~290 px entre « Réglages » et lui, trop peu pour cinq jauges lisibles.
- **Bandeau sous les boutons aussi sur bureau** : à 1280 × 720, l'aide-mémoire doit tenir
  sans défiler (#79, 51 px de marge) ; le descendre de 56 px le ferait défiler.
- **Replier l'aide-mémoire par défaut jusqu'à 1099 px** : change un comportement établi
  (#136) pour toutes les tablettes ; le décaler sous le bandeau suffit.
- **Bas de l'écran** : la barre des préréglages y est déjà, et l'issue demande une barre
  haute.
- **Tendance en temps réel** (variation par seconde d'horloge) : dépend de la vitesse et de
  la machine ; en pas de simulation, elle est la même à toutes les vitesses.
- **Jauge `meter` HTML** : ses couleurs ne suivent pas les zones du pH (ADR 0057) et varient
  selon le navigateur ; une barre `role="meter"` est identique partout.

## Conséquences

- Les e2e qui lisaient les jauges dans la section « Eau » les lisent dans le cadre
  (`[data-dashboard]`) ; `data-aqfish-water` et `data-aqfish-ph` sont inchangés.
- Un nouvel élément d'interface en haut de l'écran doit tenir compte du cadre : ligne des
  boutons sur bureau, ligne sous les boutons ailleurs. Un panneau ouvert par défaut ne doit
  pas le masquer.
- Les lots 2/3 (santé, alertes) et 3/3 (lien avec les animaux) ajoutent leurs jauges au
  cadre ; au-delà de cinq jauges, la ligne du téléphone ne suffit plus (prévoir une seconde
  ligne ou un défilement horizontal).
- Captures d'interface : `three-quarter-tableau-de-bord`, `tablette-tableau-de-bord`,
  `telephone-tableau-de-bord` et leurs variantes `-alerte` (eau mauvaise importée). Les
  captures sans interface ne changent pas.
