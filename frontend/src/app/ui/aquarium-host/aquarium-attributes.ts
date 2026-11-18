/**
 * Attributs `data-aqfish-*` publiés sur l'élément de l'aquarium pour les tests de bout en bout
 * et les captures (#693). Leurs noms et formats sont un contrat (`docs/CONVENTIONS.md`, § 6) :
 * les renommer est une rupture qui se traite dans une issue à part. Seule la sonde
 * (`aquarium-probe.ts`) les écrit.
 */

/** Attribut du composant hôte exposant la position de la caméra aux tests de bout en bout. */
export const CAMERA_ATTRIBUTE = 'data-aqfish-camera';
/** Attribut du composant hôte : `true` en caméra libre dans la pièce (#343), `false` sinon. */
export const FREE_CAMERA_ATTRIBUTE = 'data-aqfish-camera-libre';
/** Attribut du composant hôte : `true` si les mouvements décoratifs sont réduits (#406). */
export const REDUCED_MOTION_ATTRIBUTE = 'data-aqfish-mouvements-reduits';
/** Attribut du composant hôte exposant la cible de la caméra (mis à jour avec la position). */
export const CAMERA_TARGET_ATTRIBUTE = 'data-aqfish-target';
/** Attribut du composant hôte exposant `world.tick` (mis à jour quand il change). */
export const TICK_ATTRIBUTE = 'data-aqfish-tick';
/** Attribut du composant hôte exposant la graine du monde (fixée au démarrage). */
export const SEED_ATTRIBUTE = 'data-aqfish-seed';
/** Attribut du composant hôte exposant le filtre de rendu courant (`pixel` ou `aucun`). */
export const FILTER_ATTRIBUTE = 'data-aqfish-filter';
/** Attribut du composant hôte exposant le nombre de granulés de nourriture du monde (#67). */
export const FOOD_ATTRIBUTE = 'data-aqfish-food';
/** Attribut du composant hôte exposant le rendu des granulés (`points` ou `voxels`, #117). */
export const FOOD_STYLE_ATTRIBUTE = 'data-aqfish-food-style';
/** Attribut du composant hôte exposant l'heure de la journée affichée (2 décimales). */
export const HOUR_ATTRIBUTE = 'data-aqfish-hour';
/**
 * Attribut du composant hôte exposant les rayons de lumière (#567) : `force;temps` (force
 * dans [0, 1] au centième, 0 s'ils sont masqués ; temps du mouvement en secondes entières,
 * fixe sous « Réduire les mouvements »).
 */
export const LIGHT_RAYS_ATTRIBUTE = 'data-aqfish-rayons';
/**
 * Attribut du composant hôte exposant l'intensité de la lampe du bac (#584), dans [0, 1] au
 * centième : 0 éteinte ou bac sans lampe, 1 allumée, entre les deux pendant un fondu.
 */
export const LAMP_ATTRIBUTE = 'data-aqfish-lamp';
/**
 * Attribut du composant hôte exposant le distributeur automatique (#583) : `aucun`, ou la
 * réserve et les heures (`12;9,18`).
 */
export const FEEDER_ATTRIBUTE = 'data-aqfish-feeder';
/** Attribut du composant hôte : `true` si l'heure est figée, `false` sinon. */
export const HOUR_FROZEN_ATTRIBUTE = 'data-aqfish-hour-frozen';
/** Attribut du composant hôte exposant la vitesse de simulation (#52). */
export const SPEED_ATTRIBUTE = 'data-aqfish-speed';
/** Attribut du composant hôte : `true` si le décor est affiché, `false` sinon (#52). */
export const DECOR_ATTRIBUTE = 'data-aqfish-decor';
/** Attribut du composant hôte : `true` s'il pleut, `false` sinon (#106). */
export const RAIN_ATTRIBUTE = 'data-aqfish-rain';
/** Attribut exposant si la pièce autour du bac est affichée (#187), `true` ou `false`. */
export const ROOM_ATTRIBUTE = 'data-aqfish-room';
/** Attribut du composant hôte exposant les effectifs (`neon:12,guppy:6,corydora:6`, #69). */
export const POPULATION_ATTRIBUTE = 'data-aqfish-population';
/**
 * Attribut du composant hôte exposant le relevé de l'eau (#207) : `niveau;température;visée;
 * ammoniaque;nitrites;nitrates`, valeurs au dixième (`bonne;24;24;0;0;0`), mis à jour quand il
 * change.
 */
export const WATER_ATTRIBUTE = 'data-aqfish-water';
/** Animaux mis en évidence depuis une alerte (#483) : nombre ; absent : aucun. */
export const ALERT_HIGHLIGHT_ATTRIBUTE = 'data-aqfish-animaux-signales';
/**
 * Feuilles de catappa du bac et teinte de l'eau (#239) : « nombre;teinte », `3;1` (teinte 1 :
 * eau brun-thé), mis à jour avec le relevé de l'eau.
 */
export const CATAPPA_ATTRIBUTE = 'data-aqfish-catappa';
/**
 * Algues du bac (#476) : « plaques visibles;couverture moyenne en %;éclairage en h »,
 * `0;0;8` sans algue, mis à jour avec le relevé de l'eau.
 */
export const ALGAE_ATTRIBUTE = 'data-aqfish-algae';
/**
 * Encrassement du bac (#607) : « vitres en %;sol en % » (`worldFouling`), `0;0` propre, mis à
 * jour avec le relevé de l'eau.
 */
export const FOULING_ATTRIBUTE = 'data-aqfish-fouling';
/**
 * Voile réellement dessiné (#607) : « cases des vitres;cases du sol » (`foulingCounts` de la
 * vue), `0;0` sans voile, mis à jour avec `FOULING_ATTRIBUTE`.
 */
export const FOULING_CELLS_ATTRIBUTE = 'data-aqfish-fouling-cells';
/** Raclette en main (#476) : `true` ou `false`. */
export const SCRAPER_ATTRIBUTE = 'data-aqfish-scraper';
/** Étape de la séance d'entretien affichée (#604), absent hors séance. */
export const CARE_SESSION_ATTRIBUTE = 'data-aqfish-care-session';
/** Bactéries du filtre du bac affiché, en pour cent entier (#606, `filterMaturityPercent`). */
export const FILTER_BACTERIA_ATTRIBUTE = 'data-aqfish-bacteries';
/** Corps dans le bac affiché (#582) : nombre ; absent : aucun. */
export const DEAD_ATTRIBUTE = 'data-aqfish-morts';
/** Sécateur en main (#477) : `true` ou `false`. */
export const PRUNER_ATTRIBUTE = 'data-aqfish-pruner';
/**
 * Pousse affichée des plantes à tige (#477), en voxels entiers, dans l'ordre du décor,
 * séparées par des virgules (vide sans plante à tige), puis « ;lumière du fond en % ».
 */
export const PLANTS_ATTRIBUTE = 'data-aqfish-plants';
/** pH de l'eau et sa zone pour les espèces présentes, « 6.9;tolere » (#236). */
export const PH_ATTRIBUTE = 'data-aqfish-ph';
/**
 * Traitement des points blancs en cours (#361) : « jours restants;jours avant de redoser »
 * (`4.5;3.2`, second champ vide sans médicament) ; absent sans traitement.
 */
export const TREATMENT_ATTRIBUTE = 'data-aqfish-treatment';
/** Attribut du composant hôte exposant l'environnement courant (`tropical`, `bassin`, #87). */
export const ENVIRONMENT_ATTRIBUTE = 'data-aqfish-environment';
/**
 * Attribut du composant hôte exposant l'état de la sauvegarde automatique (#70) : `active`,
 * `indisponible` ou `plein` ; absent en mode capture (aucune sauvegarde).
 */
export const SAVE_ATTRIBUTE = 'data-aqfish-save';
/** Attribut du composant hôte exposant l'état du moteur de chute (`DecorPhysicsState`, #170). */
export const DECOR_PHYSICS_ATTRIBUTE = 'data-aqfish-decor-physics';
/** Attribut du composant hôte : `true` en mode édition du décor, `false` sinon (#167). */
export const EDITING_ATTRIBUTE = 'data-aqfish-editing';
/** Attribut du composant hôte exposant le nombre d'éléments de `World.decor` (#167). */
export const DECOR_COUNT_ATTRIBUTE = 'data-aqfish-decor-count';
/**
 * Attribut du composant hôte exposant l'indice de l'élément de décor sélectionné, `aucun`
 * sans sélection (#167).
 */
export const DECOR_SELECTION_ATTRIBUTE = 'data-aqfish-decor-selected';
/**
 * Attribut du composant hôte exposant l'indice de l'élément de la pièce sélectionné, `aucun`
 * sans sélection (#188).
 */
export const ROOM_SELECTION_ATTRIBUTE = 'data-aqfish-room-selected';
/** Attribut du composant hôte exposant le nombre d'éléments de la pièce (#188). */
export const ROOM_COUNT_ATTRIBUTE = 'data-aqfish-room-count';
/** Nombre de bacs de la pièce de N bacs (#305, lot 2b), bac affiché et bacs rangés compris. */
export const ROOM_TANKS_ATTRIBUTE = 'data-aqfish-room-tanks';
/** Nombre de meubles supports de la pièce de N bacs (#305, lot 2b). */
export const ROOM_SUPPORTS_ATTRIBUTE = 'data-aqfish-room-supports';
/** Identifiant du bac sélectionné de la pièce (#306, lot 3). */
export const SELECTED_TANK_ATTRIBUTE = 'data-aqfish-selected-tank';
/** Mode du bac affiché (#278) : `soins` ou `decor`. */
export const CARE_MODE_ATTRIBUTE = 'data-aqfish-mode';
/** Force du courant du bac affiché (#460) : `coupe`, `doux` ou `fort`. */
export const CURRENT_ATTRIBUTE = 'data-aqfish-current';
/**
 * Vue fond d'écran (#279) : source de la scène (`fichier`, `script`, `sauvegarde`, `defaut`),
 * absent hors fond d'écran.
 */
export const WALLPAPER_ATTRIBUTE = 'data-aqfish-fond';
/** Vue fond d'écran (#279) : `1` quand la boucle est en pause (page masquée), `0` sinon. */
export const WALLPAPER_PAUSED_ATTRIBUTE = 'data-aqfish-fond-pause';
/**
 * Attribut de l'hôte : dimensions du bac en mètres, `longueur:hauteur:profondeur` (issue
 * #171, même ordre que `bac=`).
 */
export const TANK_ATTRIBUTE = 'data-aqfish-tank';
/** Attribut de test : forme du bassin du monde courant (`rectangle` hors du bassin, #190). */
export const SHAPE_ATTRIBUTE = 'data-aqfish-shape';
