# 0026 — Environnements décrits en données ; le monde porte son environnement

- Statut : acceptée
- Date : 2026-10-20
- Auteur : Dev (Claude), cycle 30, issue #87

## Contexte

L'épopée v0.5 « Le bassin » ajoute un second environnement au bac tropical : un bassin
extérieur plus large et moins profond, à l'eau verte-bleutée, bordé de pierre, vu par
défaut de dessus. Jusqu'ici, la simulation et le rendu lisaient les dimensions du bac par
défaut (`DEFAULT_TANK`, `waterVolume()`) dans plusieurs caches et paramètres par défaut,
et la scène codait ses couleurs (sable, eau) et ses vitres en dur. Il faut pouvoir changer
d'environnement en cours de session sans toucher au bac tropical : ses captures doivent
rester identiques à l'octet.

## Décision

- **`sim/environment.ts`** : un type `Environment` (identifiant, nom, dimensions, teintes
  de l'eau et du sol, bordure `verre` ou `pierre`, vue par défaut, bulles, caustiques,
  décor et population de départ) et deux instances, `TROPICAL_TANK` (le bac d'avant, à
  l'identique) et `POND`. Les teintes sont des **noms** de couleurs de la palette : la
  simulation ne dépend pas du rendu, et un test du rendu vérifie que chaque nom existe.
- **Le monde porte son environnement** (`World.environment`, fixé à la création, donnée
  JSON comme le reste) : les bornes de nage, les tranches d'alimentation et le volume des
  dépôts de nourriture en dépendent. Les caches par espèce deviennent des tables à deux
  niveaux (environnement puis espèce) pour qu'une lecture n'alloue rien dans la boucle.
  `createWorld` prend l'environnement en dernier paramètre facultatif, `createDefaultWorld`
  en second ; sans lui, le bac tropical (code existant et tests inchangés).
- **Changer d'environnement recrée le monde et la vue** : `AquariumHost.setEnvironment`
  crée le monde de départ de l'environnement avec la même graine (même environnement et
  même graine : même monde), libère la vue et en crée une nouvelle sur le même canvas,
  caméra sur la vue par défaut de l'environnement. Heure, vitesse, filtre et affichage du
  décor sont conservés ; nourriture et effectifs repartent de l'état de départ.
  Reconstruire la vue entière est plus simple et plus sûr que de rendre chaque couche
  (contrôles de caméra, limites de zoom, caustiques, bulles) modifiable à chaud ; le coût
  d'un changement d'environnement, rare, est négligeable.
- **Bassin sans bulles ni caustiques** : pas de diffuseur dans un bassin ; les caustiques,
  dessinées en couleurs de sable, masquaient l'eau sur le fond sombre (captures du
  cycle 30). Le fond est `vegetationOmbre` (vase couverte d'algues), l'eau `eauSombre` et
  `eauMoyenne` : vue de dessus, l'eau domine. Aucune couleur n'est ajoutée à la palette.
- **Margelle de pierre** (`render/stone-border.ts`) : anneau de blocs à joints étroits,
  hauteurs selon un motif fixe (déterministe, sans hasard), dessus `roche` et `sableOmbre`
  en alternance, côtés `rocheSombre`. La nuit, une lueur `rocheLuneSombre` (émission, nulle
  à midi) l'empêche de se fondre dans le fond de la scène.
- **Contrat de capture** : `environnement=tropical|bassin` ; sans `camera=`, la vue par
  défaut de l'environnement. Absent : bac tropical, séries existantes inchangées.
- **Bassin sans poissons** au départ : les koïs arrivent avec #88 ; les espèces actuelles
  restent ajoutables au panneau (aucune règle de compatibilité espèce-environnement pour
  l'instant).

## Options écartées

- **Vue modifiable à chaud** (`AquariumView.setEnvironment`) : chaque couche (scène,
  caustiques, bulles, limites de zoom et de déplacement de la caméra) aurait dû savoir se
  reconstruire ; beaucoup de code pour une action rare.
- **Environnement global** (variable de module lue par la simulation) : état caché, hors
  de `World`, qui casserait la reproductibilité d'un monde sérialisé.
- **Couleurs de l'eau du bassin ajoutées à la palette** : inutile, la rampe d'eau
  existante donne déjà une eau verte-bleutée plus sombre que celle du bac.

## Conséquences

- Ajouter un environnement (paludarium, récif) revient à déclarer une instance de plus ;
  ce qui ne se décrit pas encore en données (forme non rectangulaire, partie terrestre)
  demandera d'étendre le type.
- L'épaisseur du sol (`SAND_THICKNESS`) et le niveau de l'eau (`WATER_LEVEL_RATIO`) restent
  communs à tous les environnements ; le diffuseur reste à sa place du bac tropical.
- La population n'est pas conservée d'un environnement à l'autre : elle repart de la
  population de départ de l'environnement choisi.
- Une future compatibilité espèce-environnement (koïs au bassin seulement) se branchera
  sur `Environment.population` et sur les bornes du panneau.
