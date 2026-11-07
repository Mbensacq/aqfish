# 0112 — Photo du bac en PNG : relecture d'une cible palette à la taille native

- Statut : acceptée
- Date : 2026-11-07
- Auteur : Dev, cycle 169, issue #479 (épopée v1.12 « Entretien et plantes »)

## Contexte

L'issue demande un bouton « Photo » qui télécharge un PNG du bac dans la vue courante, à la
résolution pixel art native agrandie par un facteur entier, sans lissage, sans interface ni
curseur, sans faire avancer la simulation et sans toucher au contrat de capture.

Le canvas affiché ne convient pas : il est déjà agrandi par `PIXEL_SIZE × pixelRatio`
(facteur non entier possible à un zoom de 125 %), et `preserveDrawingBuffer` est faux, si bien
que son contenu n'est garanti que pendant l'image qui vient d'être rendue. La cible basse
résolution de `PalettePass`, elle, contient la scène **avant** la palette (couleurs
linéaires) : la relire donnerait une image sans le rendu pixel art.

## Décision

1. **Une cible de plus, à la taille native** : `PalettePass.photoTarget()` crée à la première
   photo une cible de la taille de la cible basse résolution (NearestFilter, sans mipmaps ni
   profondeur). `AquariumView.takePhoto()` rend la scène dans la cible basse résolution, puis
   le quad de la palette **dans cette cible** avec `uPixelScale = 1` (un pixel par pixel de
   scène, `setPixelScale` rend l'échelle précédente), et relit les pixels
   (`readRenderTargetPixels`) dans le même appel. Le shader écrit les valeurs sRGB exactes de
   la palette (pas de `colorspace_fragment`) : les octets relus sont ceux de la palette.
2. **Rien d'autre ne bouge** : ni l'écran (aucun rendu vers le canvas), ni le monde, ni
   l'horloge, ni la caméra. L'image suivante est rendue exactement comme avant.
3. **Toujours en pixel art**, quel que soit le filtre affiché : la photo est l'image
   « signature » du projet, et le filtre « aucun » n'a pas de résolution native.
4. **Agrandissement et retournement purs** (`render/photo-capture.ts`) : facteur entier
   `photoScale` (le plus grand qui garde le côté long sous 2048 px, borné à [1, 8] ; 3 pour un
   écran 1920 × 1080, 4 pour 1280 × 720), plus proche voisin, lignes remises de haut en bas
   (WebGL lit de bas en haut), opacité forcée à 255. Testé sans WebGL.
5. **Encodage par le navigateur** : l'hôte copie l'image dans un canvas 2D hors du document
   (`putImageData`, aucun lissage possible) et l'encode avec `toBlob('image/png')`, puis la
   télécharge par un lien `download` daté (`aqfish-AAAA-MM-JJ-HHMMSS.png`), comme l'export
   de la sauvegarde.
6. **Interface** : bouton « Photo » de la barre des vues, sans raccourci clavier, absent en
   mode capture et en fond d'écran (la barre n'y est pas affichée).

## Options écartées

- **Relire le canvas affiché** (`toBlob` du canvas WebGL) : facteur parfois non entier, image
  vide hors de l'image rendue sans `preserveDrawingBuffer`, que l'activer aurait coûté à
  chaque image.
- **Encodeur PNG maison** (zlib en blocs stockés) : déterministe et testable, mais un fichier
  de 8 Mo pour une photo en 1920 × 1080 ; `CompressionStream` manque en partie dans jsdom.
  Le canvas 2D compresse et suffit.
- **Photo à la résolution du filtre « aucun »** : pas de cible palette, et l'issue demande du
  pixel art.

## Conséquences

- Une cible de plus en mémoire, créée seulement à la première photo.
- `AquariumRenderer.readRenderTargetPixels` est facultatif : les doubles des tests en sont
  dispensés, la photo est alors refusée (`takePhoto` renvoie `null`).
- Le contrat de capture est inchangé : les 5 angles sont identiques à l'octet à ceux de `main`.
