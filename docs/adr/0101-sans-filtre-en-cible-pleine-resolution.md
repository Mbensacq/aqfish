# 0101 — Sans filtre : rendu dans une cible pleine résolution

- Statut : acceptée (remplace la partie « rendu direct » de 0010)
- Date : 2026-11-03
- Auteur : Dev, cycle 139, issue #40

## Contexte

En mode `filtre=aucun` (ADR 0010), la scène était rendue directement à l'écran. Le tampon
d'affichage de WebGL n'est pas sRGB : le mélange alpha des translucides (eau à 30 %, verre)
s'y fait sur des valeurs sRGB, alors qu'en pixel art il se fait en espace linéaire dans la
cible sRGB 8 bits (`docs/PIEGES.md`, « Translucides plus clairs dans la cible basse
résolution »). Les teintes vues à travers l'eau différaient donc du pixel art : sable
verdâtre, eau plus sombre et plus grise. L'ADR 0010 avait écarté la cible pleine résolution
« à reconsidérer si l'écart de teinte gêne » ; la dette #40, repoussée six rétros de suite,
le demande.

## Décision

- **`render/direct-pass.ts` (`DirectPass`)** : cible pleine résolution du même format que
  celle de la passe palette (sRGB 8 bits, `NearestFilter`, sans mipmaps, tampon de
  profondeur), dimensionnée au tampon d'affichage (pixels CSS × `pixelRatio`, arrondi
  inférieur comme `WebGLRenderer.setSize`), puis quad plein écran qui lit chaque pixel
  (`texelFetch`) et le ramène en sRGB avec la même fonction GLSL que la passe palette
  (`LINEAR_TO_SRGB_GLSL`, désormais partagée), sans réduction à la palette, opaque.
- **`AquariumView.renderFrame()`** en mode `aucun` : scène → cible directe, puis quad →
  écran. Le chemin pixel art n'est pas touché.
- La cible reste à 1 × 1 tant que le mode `aucun` ne rend rien : aucun coût mémoire en pixel
  art (défaut) ; elle n'est réallouée qu'au changement de taille.

## Options écartées

- **Corriger les opacités en mode `aucun`** (eau plus transparente pour compenser le mélange
  sRGB) : l'écart dépend du fond derrière chaque translucide, aucune opacité unique ne le
  corrige, et les matériaux divergeraient entre les deux modes.
- **Tampon d'affichage sRGB** (réglage du contexte WebGL) : prise en charge non vérifiée sur
  les navigateurs et le rendu logiciel de la CI, et réglage du renderer partagé avec le pixel
  art (captures à garder identiques à l'octet) ; la cible ne dépend que de ce qui sert déjà.
- **Cible flottante (`HalfFloatType`)** : précision supérieure mais format différent de la
  cible du pixel art ; le but est d'en reproduire le mélange, précision des sombres comprise.

## Conséquences

- Mesures sur les 5 captures sans filtre du harnais (seed 42), distance moyenne de chaque
  pixel hors fond à la couleur la plus proche des captures pixel art : 15,6 → 14,3
  (trois-quarts), 12,0 → 3,9 (minuit), 17,3 → 15,6 (paludarium), 16,5 → 14,3 (récif), bassin
  vu de dessus inchangé (12,8 ; quasiment pas de translucide au-dessus du sol). Sable du bac
  tropical : `#adbe98` → `#c1c29a` (vert retiré ; pixel art `#c9b38a`) ; eau : plus claire,
  comme l'entrée réelle de la passe.
- Les couleurs vues sans filtre sont l'entrée de la passe palette avant réduction, en pleine
  résolution : utile pour régler un ton (voir `docs/PIEGES.md`, rubrique Rendu).
- Une passe et une cible pleine résolution de plus en mode `aucun` seulement (mode
  d'inspection) ; les 117 autres captures du harnais sont identiques à l'octet.
- Les doubles de renderer voient en mode `aucun` la même séquence qu'en pixel art (cible,
  scène, écran, quad), avec la taille de la cible directe.
