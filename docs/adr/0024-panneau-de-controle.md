# 0024 — Panneau de contrôle : vitesse par le temps réel versé, décor masqué mais toujours obstacle

- Statut : acceptée
- Date : 2026-10-20
- Auteur : Dev (Claude), cycle 28, issue #52

## Contexte

L'issue #52 ajoute un panneau de contrôle repliable : vitesse de simulation (0, ×0,5, ×1,
×2, ×4), heure de la journée au curseur et case « Afficher le décor ». Trois questions
structurent la suite (population #69 et environnement #70 réutiliseront le panneau) :
comment accélérer sans casser le déterminisme, comment masquer le décor sans fausser la
simulation, et comment le panneau dialogue avec l'hôte du canvas.

## Décision

- **Vitesse** : le pas `SIM_DT` ne change jamais. L'hôte verse `realDt × vitesse` à la
  boucle à pas fixe (`scaledDt`, `sim/sim-speed.ts`). À 0, aucun pas : le monde, l'heure et
  les plantes s'arrêtent, mais le rendu continue (caméra, transitions, redimensionnement,
  qui suivent toujours le temps réel). Le plafond de pas par image est multiplié par la
  vitesse au-delà de ×1 (`maxStepsForSpeed` : 5, 10 puis 20 pas) : sans cela, ×4 à
  30 images/s (8 pas demandés) serait ramené à 5 pas et prendrait du retard. Le plafond
  reste borné : pas de spirale de rattrapage après une longue pause.
- **Décor masqué** : `DecorLayer.object.visible = false` (rien n'est détruit ni recréé).
  La simulation n'est pas touchée : rochers et plantes restent des obstacles pour les
  poissons. Les bulles, l'eau et la lumière restent affichées.
- **Heure** : le curseur (crans d'un quart d'heure, libellé `formatHour` « 14:30 ») fige
  l'horloge à l'heure choisie (`freezeClockAt`) ; la case « Heure automatique » la remet en
  marche sans saut (`setClockRunning` → `toggleClock`). L'hôte expose l'heure au quart
  d'heure (`clockHour`, `snapHour`) : le signal ne notifie qu'au changement de quart
  d'heure (12,5 s réelles à ×1), jamais à chaque image.
- **Dialogue** : le panneau (`ui/control-panel/`) ne contient aucune logique de
  simulation. Il reçoit l'état de l'hôte en entrées et émet les demandes en sorties, comme
  la barre des vues ; `app.html` les relie à `AquariumHost` (`setSpeed`, `freezeClockAt`,
  `setClockRunning`, `setDecorVisible`). Chaque réglage est une section `fieldset` avec sa
  légende : une nouvelle section n'ajoute qu'une entrée, une sortie et un `fieldset`.
- **Mode capture** : le panneau n'y est pas affiché et les nouvelles méthodes de l'hôte y
  sont sans effet. Fermé par défaut, il ne change aucune capture existante (vérifié à
  l'octet). La capture `front-panneau.png` est prise hors mode capture, simulation à
  l'arrêt : c'est une capture d'interface, non reproductible à l'octet.

## Options écartées

- **Changer le pas** (`SIM_DT × vitesse`) : les trajectoires dépendraient de la vitesse
  choisie (intégration différente), contraire au déterminisme (`docs/ARCHITECTURE.md`).
- **Retirer les obstacles du monde quand le décor est masqué** : il faudrait reconstruire
  `world.obstacles` en cours de partie, et les poissons traverseraient les rochers à leur
  réapparition. Possible plus tard avec une vraie édition du décor (éditeur, v0.5).
- **Mémoriser les réglages** (`localStorage`) : la sauvegarde est hors périmètre (v0.4).
- **Curseur d'heure continu** (pas de 0,01 h) : libellés à la minute près peu lisibles, et
  un signal mis à jour à chaque recalcul de l'éclairage (deux fois par seconde).

## Conséquences

- Les poissons évitent des rochers invisibles quand le décor est masqué : comportement
  documenté, acceptable pour une option d'affichage.
- À ×4, chaque image peut exécuter jusqu'à 20 pas : sur une machine lente, la vitesse
  réelle peut descendre sous ×4 sans bloquer l'affichage.
- `data-aqfish-speed` et `data-aqfish-decor` exposent l'état aux tests de bout en bout.
