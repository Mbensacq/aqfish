# 0160 — Démarrage, création de la vue et animaux du bac hors de l'hôte

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0159 (relevés, réglages et affichage hors de l'hôte)

## Contexte

Après le cinquième passage du lot 10 du chantier d'assainissement #686 (#741),
`ui/aquarium-host/aquarium-host.ts` faisait encore 1 864 lignes (1 244 hors blancs et
commentaires). Il gardait la séquence de démarrage (`start`, `begin` et ses dix étapes,
écoutes de la fenêtre, pause du fond d'écran), l'installation d'une sauvegarde importée,
la création de la vue (`createView`) et les gestes sur les animaux (effectifs, nourriture,
mode décor ou soins). L'ADR 0159 avait écarté l'extraction du démarrage, qui écrit une
dizaine de champs de l'hôte.

## Décision

1. **Trois modules** dans `ui/aquarium-host/`, construits par l'hôte avec un objet de ports,
   sans importer l'hôte : `StartupSequence` (démarrage et `loadImported`), `ViewBuilder`
   (`build`, ancien `createView`) et `PopulationController`.
2. **Champs de l'hôte écrits par des ports** : les champs de session restent dans l'hôte
   (capture, fond d'écran et sa cadence, voile d'exemple, pixel ratio, monde, vue) ; le
   démarrage les écrit par `setMode`, `setWallpaperFps`, `setPixelRatio`, `setWorld`,
   `setDayClock`, la création de la vue par `setView`. Les signaux qu'il écrit (vitesse,
   granulés, pièce, pluie, filtre, son autorisé) lui sont passés tels quels.
3. **Contrôleurs lus à l'appel** : `controllers()` renvoie les contrôleurs de l'hôte dont le
   module a besoin ; l'ordre de déclaration des champs n'importe plus pour eux (piège du
   cycle 254). Un objet littéral est nécessaire : `() => this` ne se type pas, les champs de
   l'hôte étant privés.
4. **Contrat public inchangé** : `initialDayClock` reste exportée par l'hôte, `createView` y
   reste une délégation privée (appelée par `TankPlaceController`), les méthodes publiques
   délèguent en une ligne. Ordre des étapes inchangé, figé par les tests de l'hôte et par un
   test d'ordre dans chaque `.spec.ts`.

## Options écartées

- **Regrouper les champs de session dans un objet partagé** par tous les contrôleurs : retire
  des ports, mais touche les quinze contrôleurs existants ; à reprendre si le câblage des
  ports reste la plus grosse part de l'hôte.
- **Raccourcir les commentaires des délégations** pour passer sous 1 000 lignes : ne change
  rien au code, et la limite mesurée par le lint (hors commentaires) est déjà atteinte.

## Conséquences

- `aquarium-host.ts` passe de 1 864 à 1 493 lignes (969 hors blancs et commentaires) ;
  l'exception de taille est abaissée. Restent : câblage des ports, signaux réexposés et
  délégations publiques.
