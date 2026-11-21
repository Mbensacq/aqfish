# Interface : charte et fenêtre des réglages

Décision de Mathis du 2026-11-18. Ce document fixe l'apparence de l'interface (tout ce qui
entoure la vue 3D) et la nouvelle organisation des réglages. Il ne touche **ni au rendu 3D,
ni au contenu de la simulation** : le bac, la palette du rendu (`render/palette.ts`) et le
fond de la scène restent tels quels.

Deux objectifs :

1. **Des réglages qu'on trouve.** La liste déroulante du panneau « Réglages » est devenue trop
   longue (plus de 20 sections et contrôles, 17 espèces). Elle est remplacée par une fenêtre au
   centre de l'écran, avec des catégories, des tuiles et une recherche.
2. **Une apparence propre au projet.** L'interface actuelle cumule les tics des interfaces
   générées automatiquement : accent vert d'eau lumineux sur fond noir, fonds translucides,
   boutons tout arrondis aux mêmes rayons, petits intitulés en capitales colorées, cadres
   partout, icône par défaut du framework. Elle doit avoir l'air d'un outil éducatif
   sérieux, pensé pour ce sujet.

## 1. La charte : « la salle d'aquarium »

Image directrice : la salle sombre d'un aquarium public, où seuls les bacs sont éclairés, et
les **cartels** sobres qui expliquent ce qu'on regarde. L'interface s'efface devant le bac.

### Couleurs

| Rôle                                   | Valeur    | Règle                                                                                            |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Salle (fond de la page)                | `#141418` | Celui de la scène (`fondScene`), inchangé                                                        |
| Panneau                                | `#1b1f23` | **Plein**, jamais translucide, jamais flouté                                                     |
| Panneau élevé (élément choisi, survol) | `#232a30` |                                                                                                  |
| Filet (séparations)                    | `#30383f` | Les groupes se séparent par des filets, pas par des cadres                                       |
| Bord de champ et de bouton secondaire  | `#3d4850` |                                                                                                  |
| Encre                                  | `#ebe7de` | Texte principal                                                                                  |
| Encre secondaire                       | `#a9b1b5` | Explications, unités, légendes                                                                   |
| Laiton (action)                        | `#d1a65c` | **Seulement** pour l'action principale, la sélection et le focus ; texte posé dessus : `#141418` |
| Bon                                    | `#7db88c` | Toujours doublé d'un mot ou d'un symbole                                                         |
| À surveiller                           | `#e8955f` | Idem                                                                                             |
| Danger                                 | `#ec6a5c` | Idem                                                                                             |

Contrastes à vérifier par `ui/panel-contrast.spec.ts` (texte ≥ 4,5:1, focus ≥ 3:1). Mesures
indicatives sur `#1b1f23` : encre ≈ 13:1, secondaire ≈ 7,5:1, laiton ≈ 7:1, danger ≈ 5:1.
Les couleurs de niveau du tableau de bord de l'eau (ADR 0059) passent aux trois couleurs
d'état ci-dessus.

Pourquoi garder une interface sombre : c'est un choix de sujet, pas un réflexe. On regarde
un aquarium dans une pièce peu éclairée ; une interface claire éblouirait à côté du bac. Mais
aucun halo, aucun dégradé, aucune lueur.

### Typographie

- **Atkinson Hyperlegible Next** pour tout le texte, titres compris (graisses 400, 600, 700,
  italique 400). Dessinée pour la lisibilité (I, l et 1 ne se confondent pas) : un choix
  cohérent avec un projet éducatif. Licence OFL-1.1, servie par le site (paquet
  `@fontsource-variable/atkinson-hyperlegible-next`, aucun appel à un service externe).
- **Atkinson Hyperlegible Mono** pour les valeurs mesurées : températures, concentrations,
  heures, vitesses, compteurs (`@fontsource-variable/atkinson-hyperlegible-mono`, OFL-1.1).
- Échelle : 13 (explication), 15 (courant), 18 (titre de section), 24 à 28 (titre de fenêtre).
- Titres en **casse de phrase**, jamais en capitales. Noms scientifiques en _italique_.
- Pas de police pixel pour le texte : le pixel art est réservé au bac, au logo et aux icônes.

### Formes et composants

- **Coins** : 2 px pour les boutons, champs, interrupteurs et tuiles ; 4 px pour les fenêtres.
  Plus aucune pastille ni pilule.
- **Hiérarchie des boutons** : une seule action **pleine** (laiton) par zone ; les autres en
  bouton à filet ; les actions mineures en lien (« Fiche »). Jamais tous les boutons au même
  niveau.
- **Choix exclusifs** (courant, vitesse) : boutons accolés, le choix courant plein en laiton.
- **Interrupteur** : rectangle 38 × 20, curseur carré ; plein en laiton quand il est activé.
- **Compteur** : − valeur + dans un même cadre, valeur en police mono.
- **Touches** : `<kbd>` à filet, bord bas épaissi.
- **Tuiles** : seulement quand l'objet est un choix visuel (milieux, espèces). Le reste en
  lignes : intitulé et explication à gauche, contrôle à droite, filet entre deux lignes.
- **Ombres** : aucune, sauf l'assombrissement de la page derrière une fenêtre.
- **Mouvements** : 120 ms au plus, opacité et position seulement, sans rebond ; aucun quand
  « Réduire les mouvements » est actif (#406).

### Le cartel

Modèle de toutes les explications de l'interface, comme sous un bac de musée : nom courant
en gras, nom scientifique en italique (et famille), une ligne utile avec des unités vraies,
un lien vers la fiche du wiki. Exemple : « **Néon** · _Paracheirodon innesi_ · Characidae —
Bassin de l'Amazone. Vit en banc de 6 au moins, dans une eau douce entre 20 et 26 °C. »
Toute valeur biologique suit la règle du projet : sourcée, ou marquée « approximation de jeu ».

### Ton des textes

- Dire ce qui se passe et pourquoi, avec les unités : « Au-delà de 10 h d'éclairage, les
  algues poussent. » Pas de superlatifs, pas de formules creuses, pas de point
  d'exclamation, pas d'emoji, pas de flèches décoratives (▸ ▾ : un chevron dessiné si besoin).
- Le vouvoiement des textes actuels est gardé ; les verbes d'action à l'infinitif sur les
  boutons (« Changer l'eau », « Exporter »).

### Identité

- **Icône du site** en pixel art propre au projet (un poisson de 16 × 16, avec ses
  déclinaisons 32 et 48) à la place de l'icône par défaut d'Angular (`public/favicon.ico`).
- **Logo** : le mot « aqfish » à côté d'un petit poisson en pixels laiton, dessiné en SVG.
- `index.html` : titre « aqfish — simulateur d'aquarium », `meta description` en français,
  image de partage (capture du bac de départ) et texte alternatif.
- **Icônes** : en pixels sur une grille de 12, dessinées pour le projet, seulement dans les
  barres d'outils (nourrir, raclette, sécateur, photo, vues).

## 2. La fenêtre des réglages

Le bouton « Réglages » ouvre une **fenêtre modale au centre** (largeur 1 100 px au plus) au
lieu du panneau déroulant. La page derrière s'assombrit ; le bac continue de vivre.

- **Gauche** : titre « Réglages », champ de recherche, puis les catégories par groupe.
- **Droite** : titre et phrase d'explication de la catégorie, puis son contenu.
- **Clavier** : Échap ferme, le focus reste dans la fenêtre et revient au bouton « Réglages »
  à la fermeture ; flèches haut et bas dans la liste des catégories ; `/` place le focus dans
  la recherche. Rôle `dialog`, `aria-modal`, titre lié.
- La catégorie ouverte est retenue d'une ouverture à l'autre (préférence locale).

### Catégories et contenu

Chaque contrôle actuel garde son comportement, sa valeur et ses attributs de test ; seul son
emplacement change. **Aucune fonctionnalité n'est perdue.**

| Groupe      | Catégorie             | Contenu (contrôles actuels)                                                                                                                                                                                                                           |
| ----------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le bac      | Bac et milieu         | Milieu en tuiles (bac tropical, bassin, paludarium, récif, eau froide), forme du bassin, « Afficher la pièce » ; pièce affichée : bacs et meubles (environnement, taille, support, liste des bacs, mode soins ou décor, retrait confirmé)             |
|             | Population            | Une tuile par espèce de l'environnement : nom, nom scientifique, compteur, lien vers la fiche ; filtres « Toutes », « Dans le bac », « Poissons », « Invertébrés » ; tri par nom, nombre dans le bac, taille adulte ; résumé « N animaux, M espèces » |
|             | Eau et matériel       | Chauffage, durée d'éclairage, heure d'allumage de la lampe, courant de la pompe (coupé, doux, fort), changer l'eau                                                                                                                                    |
|             | Soins et produits     | Conditionneurs (déchlorer, liant, eau du robinet), filtre (amorce de bactéries, charbon actif), pH et eau noire (pH −, pH +, feuilles de catappa), avec l'avertissement « effets simplifiés »                                                         |
|             | Décor                 | Éditer le décor, afficher le décor, granulés en voxels ou en points                                                                                                                                                                                   |
| Simulation  | Temps                 | Vitesse (pause, ×0,5, ×1, ×2, ×4), heure de la journée, heure automatique                                                                                                                                                                             |
| Préférences | Affichage             | Filtre pixel art, masquer l'interface (section 3), pluie sur le bassin                                                                                                                                                                                |
|             | Son                   | Sons d'ambiance et volume                                                                                                                                                                                                                             |
|             | Accessibilité         | Réduire les mouvements                                                                                                                                                                                                                                |
| Données     | Sauvegarde et partage | Partager ce bac (action principale), exporter, importer, photo du bac ; mention de l'enregistrement automatique                                                                                                                                       |

Restent **hors de la fenêtre**, sous la main dans la barre du bas : nourrir, raclette,
sécateur, photo et préréglages de vue (gestes de jeu, pas des réglages). La pharmacie, le wiki,
le bilan du bac, le tableau de bord de l'eau et l'aide-mémoire gardent leur place et prennent
la charte.

### Recherche

- Cherche dans les noms des réglages, leurs explications et une liste de mots voisins
  déclarée avec chaque réglage (« lumière » → éclairage, lampe, heure de la journée ;
  « température » → chauffage ; nom d'une espèce → sa tuile).
- Insensible à la casse et aux accents. Les résultats remplacent le contenu de droite :
  chaque réglage s'y change directement, son nom de catégorie y mène. Entrée ouvre le
  premier résultat ; aucun résultat : un message et la liste des catégories.
- Index construit une fois, à partir de la même déclaration que la fenêtre (une seule source
  de vérité : la liste des réglages par catégorie).

### Téléphone (moins de 640 px de large)

La fenêtre devient un panneau qui monte du bas (environ 75 % de la hauteur) : recherche, puis
liste des catégories avec leur valeur résumée ; une catégorie ouvre son contenu dans le même
panneau, avec un retour. Cibles tactiles de 44 px au moins.

## 3. « Masquer l'interface » remplace le mode immersif

Le mode immersif (ADR de #340 : étalonnage avec une carte, projection décentrée, parallaxe au
gyroscope) est retiré : Mathis le juge peu utile. À sa place, **Masquer l'interface** : on
oriente la vue comme on veut, puis tout disparaît sauf le bac.

- Interrupteur dans Affichage, et touche **I**. Échap, I ou un appui long sur écran tactile
  fait revenir l'interface.
- Une indication discrète au moment du masquage (« I ou Échap pour revenir »), qui
  s'efface après 3 s (aucune si « Réduire les mouvements » : elle reste 3 s sans fondu).
- La caméra reste utilisable (glisser, molette, vues 1 à 5, caméra libre) ; la simulation
  continue.
- Retrait du mode immersif : composant `ui/immersive-mode`, `core/immersive`, leurs tests et
  leurs e2e, réglages enregistrés devenus inutiles ignorés au chargement (sauvegardes
  anciennes toujours lisibles). ADR qui remplace celle du mode immersif.

## 4. Mise en œuvre

Issues `idee-mathis`, dans cet ordre, juste après le lot 11 du chantier #686 (#697, panneau
découpé par section), qui fournit les sections réutilisées par la fenêtre :

1. #721 — Charte, fondations : jetons de couleurs, typographie, formes, icône et logo, en-tête de
   la page. Aucun changement de disposition.
   **Livré** : jetons dans `ui/_panel-layout.scss` (`$room`, `$panel-background`,
   `$panel-raised`, `$panel-rule`, `$panel-border`, `$panel-ink`, `$panel-ink-muted`, `$brass`,
   `$on-brass`, `$state-good|watch|danger`, `$radius-control|window`, `$space-1…5`,
   `$opacity-disabled`, `$opacity-band`, `$scrim`, `$font-text`, `$font-mono`) ; polices
   chargées dans `src/styles.scss` ; icône et logo générés par `scripts/generer-icone.mjs` ;
   `index.html` (titre, description, image de partage `public/partage.png`). Le logo
   (`public/logo.svg`) sera posé dans l'en-tête au lot 4, avec la disposition.
2. #722 — Fenêtre des réglages : fenêtre, catégories, déplacement de tous les contrôles, téléphone.
   **Livré (cycle 263, partiel)** : la déclaration unique des catégories
   (`ui/settings-window/settings-categories.ts` : groupe, titre, explication, sections
   `data-section` réutilisées, contrôles portés ; un test vérifie que chaque section du panneau
   actuel est dans une et une seule catégorie) et le composant de fenêtre bureau
   (`ui/settings-window/settings-window.ts` : `dialog` et `aria-modal`, titre lié, fond assombri,
   focus piégé, Échap, clic sur le fond, flèches haut et bas, `/` vers la recherche, contenu
   projeté par le parent). **Livré (cycle 266, partiel)** : tous les e2e ouvrent et
   referment les réglages par `ouvrirReglages(page, '<catégorie>')` et `fermerReglages(page)`
   (`e2e/outils-panneau.ts`), posés par script (152 clics dans 70 fichiers) : le branchement
   ne changera plus que ces deux fonctions et les tests qui utilisent plusieurs catégories.
   **Livré (cycle 267)** : la fenêtre remplace le panneau déroulant
   (`ui/control-panel/control-panel.ts` : toutes les sections dans le document, celles des
   autres catégories masquées, ADR 0165 révisée) ; catégorie gardée d'une ouverture à l'autre ;
   focus rendu au bouton à la fermeture ; raclette et sécateur pris referment la fenêtre ;
   `ouvrirReglages` clique la catégorie ; e2e repris pour la fenêtre modale (catégories,
   fermeture avant de toucher ou de mesurer le bac, cadrage, clavier) ; repli provisoire sous
   640 px (catégories au-dessus du contenu). **Livré (cycle 268)** : raclette et sécateur dans
   la barre du bas, après « Nourrir » et avant « Photo » (groupe « Outils d'entretien », mêmes
   attributs `data-scraper` et `data-pruner`, nourrir et photo y étaient déjà) ; barre sans
   pastilles de touche sous 1 280 px et sur deux lignes sous 640 px pour tenir à l'écran ;
   catégorie retenue d'une visite à l'autre (`core/settings-category-pref`, clé
   `aqfish.reglages-categorie`, inconnue ou absente : « Bac et milieu ») ; fenêtre exclusive à
   toute largeur : elle replie « Commandes » le temps d'être ouverte (rendu à sa fermeture
   au-delà de 639 px), et « Commandes » ouvert (touche `?`) la referme. **Livré (cycle 269)** :
   panneau du téléphone sous 640 px (`PHONE_LAYOUT`, `ui/settings-window/phone-layout.ts`,
   même seuil que les panneaux exclusifs) : monte du bas sur 75 % de la hauteur ; liste des
   catégories avec leur valeur résumée (`ui/control-panel/settings-summaries.ts`, lue comme
   description du bouton), puis contenu seul avec « Retour » (focus rendu à la catégorie) ;
   le bloc non montré est `hidden` (hors du piège du focus) ; `/` ramène la liste ; cibles de
   44 px ; `ouvrirReglages` passe par « Retour » sur téléphone. **Livré (cycle 271, #762)** :
   produits sortis de « Eau » dans leur section (`ui/control-panel/products-section.ts`,
   `data-section="produits"`), après les traitements dans « Soins et produits » (sans points
   blancs : la phrase « rien à soigner » puis les produits) ; « Pluie » sortie de « Journée »
   dans la section « Affichage » (`display-section.ts`), nouvelle catégorie du groupe
   « Préférences » (ailleurs qu'au bassin : « Il ne pleut que sur le bassin. »), résumée sur
   téléphone (« Pluie sur le bassin », « Pas de pluie », « Sans pluie ici »).
3. #723 — Population en tuiles et recherche dans les réglages.
   **Livré (cycle 270)** : chaque réglage est déclaré une seule fois
   (`ui/settings-window/settings-categories.ts` : nom, explication, mots voisins, section qui
   le porte) ; l'index de la recherche (`ui/settings-window/settings-index.ts`, module pur) en
   est tiré, avec les espèces du milieu affiché (nom courant et scientifique). Normalisation :
   minuscules, NFD sans diacritiques. Rang : nom qui commence par la requête, mot du nom, mot
   voisin, nom qui la contient, mot voisin qui la contient, explication (au début d'un
   mot, #764) ; égalités dans l'ordre de la déclaration. Pendant une recherche, le contenu montre la liste des résultats puis les
   sections qui les portent (réglables sur place ; une recherche d'espèce ne garde que ses
   tuiles) ; le nom de catégorie d'un résultat y mène, Entrée ouvre le premier, aucun
   résultat : un message et les catégories. Population (`ui/control-panel/population-view.ts`,
   fonctions pures) : filtres « Toutes », « Dans le bac », « Poissons » (ni invertébré ni
   amphibien), « Invertébrés » (`INVERTEBRATES`) ; tri « Ordre du milieu » (par défaut, ajouté
   pour garder l'ordre du catalogue), nom, nombre dans le bac (le plus nombreux d'abord), taille
   adulte (`bodyLength` de la simulation, la plus grande d'abord) ; résumé « N animaux,
   M espèces ». **Suite (cycle 272, #764)** : dans les sections montrées par une recherche,
   seules les lignes des réglages trouvés restent visibles (marque `appSetting` d'un contrôle,
   `ui/settings-window/settings-search-filter.ts` ; sections « eau », « journee », « son »,
   « simulation », « decor », « sauvegarde ») ; l'explication n'est cherchée qu'au début d'un
   mot (« lum » ne trouve plus la fiche par « volume ») ; la légende d'une section qui répète
   le titre de la catégorie (« Population », « Affichage », « Son », « Accessibilité ») est
   masquée à l'écran, gardée pour les lecteurs d'écran. **Reste** : les sections
   « environnement », « bacs », « produits » et « population » se montrent encore en entier ;
   les sections absentes du bac (« Soins » sans
   points blancs, pièce masquée) restent proposées dans les résultats sans contenu.
4. #724 — Habillage de toute la page selon la charte (tableau de bord, barres, aide-mémoire, wiki,
   pharmacie, bilan, guide, parcours du premier bac), textes revus.
   **Livré (cycle 273, tranche 1)** : tableau de bord de l'eau, bandeau bas (santé, alertes,
   entretien, bilan et journal), indicateur du jour et barre du bas. Surface commune
   (`dashboard-frame/_dashboard-surface.scss`) pleine sans opacité au repos ni transition
   (constantes `DASHBOARD_BACKGROUND_ALPHA`, `DASHBOARD_MUTED_ALPHA` et
   `DASHBOARD_REST_OPACITY` retirées ; encre secondaire `DASHBOARD_COLORS.inkMuted`) ; focus en
   laiton partout (plus d'anneau vert ou blanc) ; chevrons dessinés (`CHEVRON_ICON_PIXELS`) ;
   boutons du bandeau à filet ; onglets et filtres du journal pleins en laiton ; vues de la
   barre accolées, la courante pleine en laiton ; touches en `kbd`. Un test lit les feuilles
   du tableau de bord et refuse `color-mix`, `opacity`, couleur à canal alpha, ombre,
   capitales et rayon hors charte. Textes : renvois aux catégories actuelles des réglages
   (« Soins et produits », « Eau et matériel ») et raclette dans la barre du bas.
   **Reste (tranche 2)** : aide-mémoire, wiki, pharmacie, guide, parcours du premier bac,
   offre de partage, éditeur de décor, format « cartel », icônes pixel sur grille de 12 de la
   barre du bas, renvois « Réglages, Eau » encore écrits dans `sim/pharmacy.ts`,
   `sim/first-tank-path.ts` et `sim/water-test.ts`, recherche globale finale.
5. #725 — Masquer l'interface à la place du mode immersif.

Pour chaque lot : tests unitaires et e2e mis à jour pour les nouveaux emplacements (jamais
affaiblis), contrastes vérifiés, captures regardées, `docs/DA.md` à jour. Les captures du bac
seul (mode capture, sans interface) doivent rester **identiques au pixel près**.
