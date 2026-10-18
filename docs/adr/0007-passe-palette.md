# 0007 — Passe palette : cible sRGB basse résolution et couleur la plus proche en sRGB

- Statut : acceptée
- Date : 2026-10-17
- Auteur : Dev (Claude)

## Contexte

L'ADR 0002 impose un rendu basse résolution agrandi sans lissage et ramené à une palette
limitée. Il faut choisir comment stocker l'image intermédiaire, comment l'agrandir et
selon quelle métrique choisir la couleur de palette, de façon testable sans WebGL.

## Décision

- **Cible** : `WebGLRenderTarget` de `ceil(canvas / PIXEL_SIZE)` pixels (`PIXEL_SIZE = 3`
  pixels CSS ; minimum 1 × 1), `NearestFilter`, sans mipmaps ni multiéchantillonnage,
  texture `SRGBColorSpace` (stockage sRGB 8 bits, précision correcte dans les sombres).
- **Agrandissement** : quad plein écran ; chaque pixel d'affichage lit le pixel de scène
  qui le couvre par `texelFetch(floor(gl_FragCoord / (PIXEL_SIZE × pixelRatio)))`. Aucun
  filtrage possible, la dernière rangée est rognée plutôt que l'image étirée. La caméra
  prend le rapport d'aspect de la cible.
- **Métrique** : distance euclidienne en sRGB (valeurs lues converties de linéaire en sRGB),
  première couleur déclarée en cas d'égalité. La même formule existe en TypeScript pur
  (`render/pixel-art.ts`) et sert de spécification testée du shader.
- La couleur écrite est la valeur sRGB exacte de la palette (pas de `colorspace_fragment`).

## Options écartées

- Cible linéaire 8 bits (`NoColorSpace`) : bandes visibles dans les sombres avant
  quantification.
- Cible en demi-flottants : dépend d'extensions non garanties en rendu logiciel.
- `EffectComposer` de Three.js : une abstraction de plus pour une seule passe.
- Métrique perceptuelle (Lab, OKLab) : plus juste mais plus coûteuse dans le shader ; à
  réévaluer si des teintes tombent mal une fois les animaux présents.

## Conséquences

- Les surfaces translucides (eau, verre) se mélangent en espace linéaire dans la cible :
  elles paraissent plus claires qu'avant sur fond sombre. Les teintes de la palette ont été
  complétées en conséquence (`verreSombre`) ; à surveiller sur captures.
- Toute couleur affichée est une couleur de `render/palette.ts` (vérifiable sur capture).
- Le tramage ordonné (optionnel) et les contours s'ajouteront dans ce même shader ou une
  passe voisine.
