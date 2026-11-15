# 0143 — Avant / après de la séance d'entretien : deux relevés en mémoire, un curseur

- Statut : acceptée (complète les ADR 0138 et 0112)
- Date : 2026-11-15
- Auteur : Dev, cycle 225, issue #624

## Contexte

Lot 6 de l'épopée « Entretenir à la main » (#593) : le bilan de la séance guidée (ADR 0138)
doit montrer l'« avant » et l'« après » du bac et proposer d'enregistrer la photo. La photo PNG
existante (ADR 0112) relit la cible pixel art de la vue (`AquariumView.takePhoto`), sans
interface ni curseur, puis l'agrandit par un entier sans lissage. La séance est enregistrée
(clé `aqfish.seance-entretien`) pour reprendre après un rechargement.

## Décision

1. **Relevés** : l'hôte relit la vue à l'ouverture d'une **séance neuve** (« avant »), puis au
   bilan (« après ») si au moins une étape est faite (`careSessionCompared`, pur, dans
   `sim/care-session.ts`). Les relevés bruts restent dans des champs privés de l'hôte ; le
   bilan reçoit deux images PNG `data:` à la résolution de la scène (`careComparison`).
2. **Jamais enregistrées** : ni dans la sauvegarde du monde, ni dans la séance enregistrée.
   Une séance interrompue (« Plus tard », mode décor) libère l'« avant » ; reprise ensuite,
   elle n'a pas de comparaison (son « avant » n'existe plus). Fin de séance : tout est libéré.
3. **Affichage** : les deux images superposées, l'« après » découpé à droite d'un curseur
   (`input type="range"`, pas de 5 %) : flèches, Début et Fin au clavier, glissé ou clic à la
   souris, `aria-valuetext` lisible. Pixels nets (`image-rendering: pixelated`), légère loupe
   (× 1,25) sur le milieu de la vue où se trouve le bac.
4. **Photo enregistrée** : avant et après côte à côte, 2 pixels de scène d'écart au fond de
   l'interface (`sideBySidePhotos`, pur), puis le même agrandissement entier que la photo ;
   fichier `aqfish-avant-apres-AAAA-MM-JJ-HHMMSS.png`. Le code d'encodage et de
   téléchargement est partagé avec le bouton « Photo » (`downloadPhoto`).
5. Relecture impossible (navigateur, contexte perdu) : la séance se déroule normalement, sans
   comparaison ; aucune erreur affichée au bilan.

## Options écartées

- **Images dans la séance enregistrée** (`localStorage`) : plusieurs centaines de Ko par image,
  et le critère de l'issue l'exclut.
- **Côte à côte dans la carte** : deux images de 140 px de large rendent le bac illisible ; le
  curseur garde toute la largeur de la carte pour chaque image.
- **Reprendre un « avant » à la reprise d'une séance** : il montrerait un bac déjà à moitié
  entretenu, une fausse comparaison.

## Conséquences

- Deux rendus de plus par séance (ouverture, bilan), au coût d'une photo ; rien par image.
- Mémoire : deux relevés RGBA de la cible basse résolution (≈ 1 Mo en 1280 × 720) le temps de
  la séance.
- Aucun changement hors séance ni en capture (séance absente en capture) : les captures
  existantes restent identiques.
