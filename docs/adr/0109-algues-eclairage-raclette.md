# 0109 — Algues : plaques fixes sur les vitres, pousse par l'éclairage et les nitrates, raclette

- Statut : acceptée
- Date : 2026-11-06
- Auteur : Dev, cycle 162, issue #476 (épopée v1.12 « Entretien et plantes »)

## Contexte

L'issue demande des algues vertes qui poussent quand l'éclairage dépasse 10 h par jour ou
que les nitrates montent, que le joueur retire à la raclette en mode Soins, une alerte au
tableau de bord, une sauvegarde qui les conserve, et les captures du bac par défaut
identiques à l'octet. Aucun réglage de durée d'éclairage n'existait.

## Décision

1. **Plaques fixes** (`sim/algae.ts`) : huit plaques par bac (`ALGAE_WALLS` : fond, côtés,
   deux en bas de la vitre avant), dont l'emplacement, le rayon et la vigueur viennent d'un
   sous-générateur de la graine du monde (`algaePatches`). Pas d'algues sur le décor : une
   plaque sur un rocher demanderait une surface par élément, déplacée avec l'éditeur ; à
   reprendre si besoin.
2. **État dans l'eau** : `WaterState.lighting` (heures entières, absent à 8 h) et
   `WaterState.algae` (couverture de chaque plaque dans [0, 1], absente sans algue), comme la
   consigne du chauffage et les feuilles de catappa : copiés, enregistrés et relus avec l'eau
   (`copyWater`, `readWater`), sans changer le schéma de sauvegarde (champs facultatifs, une
   ancienne version les ignore).
3. **Pousse** (`algaeGrowth`) : facteur de lumière (0 sans lumière, 1 dès 8 h) × somme de
   l'excès de lumière au-delà de 10 h (plein à 24 h) et de l'excès de nitrates au-delà de 20
   (plein à 60), plafonnée à 1. Chaque plaque gagne `pousse × vigueur × dt / 2 jours`,
   plafonnée à 1. Aucun tirage pendant le pas : seule la vigueur vient de la graine. Avancée
   dans `stepInPlace` après l'eau, en mode soins seulement (en pause en mode décor), dans les
   bacs vitrés d'eau douce (`hasAlgae` : ni bassin ni récif). Sans pousse, rien n'est calculé
   ni écrit.
4. **Raclette** : un bouton de la section « Eau » prend ou pose la raclette ; tant qu'elle est
   en main, un clic sur le bac lance un rayon depuis la caméra (`AquariumView.pickRay`) et
   retire la plaque visible la plus proche dont le centre est à moins de son rayon dessiné
   plus 2 cm du rayon (`scrapedPatch`, `scrapeWorldAlgaeInPlace`) ; le clic ne nourrit pas.
   Les poissons ne sont pas touchés.
5. **Alerte** `algae` (`sim/dashboard-alerts.ts`) : attention à 25 % de couverture moyenne,
   critique à 60 %, rangée après les nitrates, lien vers une nouvelle page « Entretien » du
   wiki ; « Pourquoi ? » renvoie à l'explication de l'azote. La couverture passe par le relevé
   (`WaterSample.algae`, absent sans algue).
6. **Rendu** (`render/algae-layer.ts`) : une tache de pixels de 1 cm par plaque, contour et
   cœur aux verts de la végétation de la palette, quelques pixels clairs à motif fixe, posée
   à 3 mm de la vitre ; taille selon la racine de la couverture ; masquée sous 5 %. Sans
   algue, la couche est masquée : images inchangées.
   **Révisé au cycle 163 (#488)** : les plaques ressemblaient aux plantes en vue trois-quarts
   (contour sombre, cœur clair, reflets). Elles sont désormais un voile terne et
   filamenteux : fond `vegetation`, filaments verticaux `vegetationOmbre` une colonne sur
   deux, coupés par endroits, bord tramé (une case sur deux) au lieu d'un contour ; ni
   `vegetationClaire` ni `vegetationLumineuse`. Voilées par l'eau, elles virent au vert-bleu
   strié, distinct des feuilles.
7. **Couverture moyenne** (`algaeCoverage`, révisé au cycle 163, #488) : somme des
   couvertures divisée par `ALGAE_PATCH_COUNT`, pas par la longueur de la liste enregistrée ;
   une liste courte compte ses plaques absentes comme nues.

## Conséquences

- Les captures par défaut ne changent pas (aucune algue à t = 0 et à éclairage normal) ;
  `algues=c` donne des captures avec algues (`front-algues`, `three-quarter-algues`).
- Le bac tropical par défaut voit ses nitrates passer 20 en moins d'une heure simulée : sans
  changement d'eau, les algues finissent par y pousser, ce qui est l'intention (entretien).
- Les valeurs sont des approximations de jeu, sauf l'ordre de grandeur de 8 à 10 h
  d'éclairage, non vérifié (`docs/SOINS.md` § 12, « Algues dans le jeu »).
- Hors périmètre : mangeurs d'algues (issue suivante), algues marines, algues sur le décor.
