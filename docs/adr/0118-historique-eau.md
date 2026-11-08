# 0118 — Historique de l'eau du bac affiché

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 178, issue #511

## Contexte

Le tableau de bord montre l'eau à l'instant et une tendance, pas son histoire. Il faut voir
qu'un pic de nitrites suit un nourrissage ou qu'un changement d'eau fait baisser les nitrates,
sans coût par image, sans toucher à la simulation au bit près ni aux captures sans interface.

## Décision

- **Module pur** `sim/water-history.ts` : tampon circulaire (`Float32Array`) de 96 relevés de
  5 séries, un toutes les 750 pas (15 min de jeu, 24 h au total). Relevé seulement au pas
  multiple exact de l'intervalle : l'hôte coupe ses lots de pas à ces frontières, l'historique
  ne dépend donc pas de la cadence d'affichage. Tranches sautées (bac non affiché) : trous.
- **Hors du monde pendant la partie** : `WeakMap` par monde dans l'hôte, jamais touchée par
  `step`. Le champ optionnel `World.waterHistory` (données simples, au millième) n'est écrit
  qu'à la sauvegarde et au changement de bac (piège du cycle 176). Bac du fond : pas de relevé.
- **Sauvegarde** : champ optionnel du corps du monde, avec son propre numéro `version`, comme
  `maintenance` (ADR 0116) ; pas de nouveau numéro de schéma global : une sauvegarde antérieure
  (schéma 1 ou 2) se lit sans historique, un champ invalide est refusé.
- **Changement d'eau** : marque sur le relevé de la tranche courante (créé s'il n'existe pas).
- **Interface** : le nom de chaque jauge devient un bouton qui déplie `app-water-history-chart`
  sous le cadre, SVG pixel art d'une colonne par relevé. Plage tolérée (niveau non critique) en
  trame, valeur actuelle et extrêmes en texte, phrase complète pour les lecteurs d'écran, Échap
  pour replier. Échelle calée sur les valeurs avec un écart minimal par jauge.

## Conséquences

- Aucune allocation par image : le tampon est écrit en place, la vue n'est recopiée qu'à un
  relevé nouveau (toutes les 12,5 s de jeu), le champ du monde qu'à la sauvegarde.
- ~3 Kio de sauvegarde par bac suivi.
- Un monde importé sans historique commence le sien au prochain relevé.
- Un bac rangé n'a pas de relevés pendant qu'il est rangé : sa courbe montre un trou.
