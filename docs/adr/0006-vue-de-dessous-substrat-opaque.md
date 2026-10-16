# 0006 — Vue de dessous : substrat opaque vu en contre-plongée

- Statut : acceptée
- Date : 2026-10-16
- Auteur : Dev (nuit 2026-10-15, issue #4)

## Contexte

Le préréglage `bottom` doit montrer « quelque chose de lisible » depuis le dessous du bac
(issue #4, `docs/ARCHITECTURE.md` § Caméra). Une caméra strictement à la verticale sous le
fond ne voit que la face inférieure du sable : un aplat uniforme, sans repère de volume.

## Décision

- Le **sable est une dalle opaque** posée sur le fond (y = 0 → 6 cm). Ses faces ont trois
  tons de la palette : dessus `sableClair`, côtés `sable` (lecture de la coupe du
  substrat de face et de côté), dessous `sableSombre`, non éclairé (`MeshBasicMaterial`) pour
  rester lisible quelle que soit la lumière.
- Le préréglage `bottom` est une **contre-plongée légèrement avant** : direction
  `(0, -1, 0,45)` depuis le centre du bac. On voit le dessous du substrat et, au-dessus,
  l'eau à travers la vitre avant ; le volume du bac se lit par la perspective et les arêtes.
- Le verre englobe l'eau et le sable avec une marge de 8 mm, pour éviter le
  chevauchement de faces (scintillement de profondeur) sous tous les angles.

## Options écartées

- **Fond vitré avec substrat transparent** : on verrait l'eau « par en dessous », mais la
  transparence du sable contredit le réalisme et multiplie les artefacts d'ordre de rendu
  des surfaces translucides.
- **Plan de coupe** (clipping) qui retire le sable en vue de dessous : intéressant pour
  voir les animaux depuis le fond, mais complexe (gestion des plans de coupe pour tous les
  matériaux, cohérence avec le pipeline pixel art à venir). À réexaminer si on veut observer
  les poissons depuis le dessous.
- **Caméra strictement verticale** : aplat uniforme, illisible.

## Conséquences

- En vue `bottom`, les animaux posés sur le fond ne sont pas visibles à travers le sable ;
  ceux qui nagent restent visibles à travers la vitre avant.
- Le préréglage `top` reste à la verticale (vue « bassin à koïs » de `docs/DA.md`), avec
  un décalage infime pour que `lookAt` reste défini.
