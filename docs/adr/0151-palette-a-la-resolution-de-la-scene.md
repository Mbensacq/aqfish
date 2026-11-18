# 0151 — Palette appliquée à la résolution de la scène, puis agrandissement

- Statut : acceptée
- Date : 2026-11-17
- Auteur : Mathis
- Remplace en partie : ADR 0002 (pipeline pixel art), ADR 0112 (cible de la photo)

## Contexte

Le pipeline pixel art (ADR 0002) rendait la scène dans une cible basse résolution, puis un
quad plein écran faisait **à chaque pixel d'affichage** la recherche de la couleur la plus
proche dans la palette étendue (jour, nuit, crépuscule, environnements, nourriture : plus
d'une centaine de couleurs). Avec `PIXEL_SIZE = 3`, chaque pixel de scène était donc ramené à
la palette 9 fois (36 fois sur un écran à `devicePixelRatio` 2), avec le même résultat.

Mesures sur le rendu logiciel des tests de bout en bout (Chromium, SwiftShader, 1280 × 720) :
2 images par seconde ; un clic sur un bouton de l'interface attendait ~7 s qu'une image se
termine. Les parts e2e de la CI duraient de 21 à 36 minutes. La profilation du fil principal
montre moins de 1 % du temps en JavaScript : tout le coût est dans le rendu.

## Décision

Trois passes au lieu de deux :

1. la scène est rendue dans `PalettePass.target` (inchangé) ;
2. le quad de la palette est rendu dans `PalettePass.paletteTarget`, cible de **même taille**
   que la scène (8 bits sans espace colorimétrique, NearestFilter, sans profondeur) : la
   recherche dans la palette est faite une fois par pixel de scène ;
3. un quad d'agrandissement (`upscaleScene`) recopie à l'écran, sans filtrage, le pixel de
   `paletteTarget` qui couvre chaque pixel d'affichage, avec la même formule qu'avant
   (`floor(gl_FragCoord / (PIXEL_SIZE × pixelRatio))`, bornée à la cible).

La photo du bac (ADR 0112) relit directement `paletteTarget` : la cible dédiée et
`setPixelScale` disparaissent.

## Options écartées

- **Table de correspondance 3D** (couleur → index de palette) : plus rapide encore, mais la
  palette dépend de pénalités qui changent avec l'heure et l'environnement ; la table serait
  à recalculer, et l'égalité au bit près avec `nearestPaletteIndex` deviendrait difficile à
  garantir.
- **Réduire la résolution des tests** : accélère la CI mais ne teste plus ce que voit
  l'utilisateur, et ne gagne rien pour les vrais appareils.

## Conséquences

- **Image identique au bit près** : la couleur écrite pour un pixel d'affichage est celle
  que la passe palette calcule pour le même pixel de scène ; les valeurs de la palette sont
  des octets exacts, stockés sans conversion dans une cible 8 bits puis recopiés sans
  conversion. Vérifié en comparant toutes les captures du harnais avant / après.
- **Coût du rendu divisé** : 2 → 11,6 images par seconde en rendu logiciel à 1280 × 720 ;
  un clic d'interface passe de ~7,4 s à ~1,3 s. Sur un vrai GPU, la passe palette coûte
  `PIXEL_SIZE²` fois moins de calcul de fragments (36 fois moins sur un écran Retina).
- Une cible de la taille de la scène en plus (environ 400 ko à 1280 × 720), créée une fois.
- Le mode « sans filtre » (ADR 0101) n'est pas concerné.
