# 0125 — Pharmacie du bac : produits existants, état dans le bac, conseil selon l'alerte

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 190, issue #533

## Contexte

Épopée v1.15. Les lots de soins (#239, #361, #529 à #532) ont ajouté des produits dont les
gestes sont répartis dans « Réglages » (sections « Eau » et « Soins ») : conditionneur, amorce
de bactéries, médicament, sel, charbon actif, régulateur de pH, feuilles de catappa. Le joueur
doit les retrouver au même endroit et savoir lequel répond à l'alerte en cours. Contraintes :
aucun nouveau produit, captures par défaut identiques, monde comparé au bit près par les tests
de l'hôte (`docs/PIEGES.md`), panneau des réglages au bord de son budget de style et de place.

## Décision

- **Module pur** `sim/pharmacy.ts` : liste fixe des produits (`PHARMACY_PRODUCTS`, libellé,
  usage, emplacement du geste), produit « en cours » tant qu'il agit dans l'eau
  (`productActive` : réserve d'amorce, protection du liant, sel, médicament, charbon, délai du
  régulateur, feuilles qui infusent), conseil `pharmacyAdvice(alertes, état)`.
- **Conseil** : celui de la **première** alerte de `dashboardAlerts` (déjà triées par gravité
  puis ordre fixe), pour que pharmacie et tableau de bord parlent de la même alerte. Chlore →
  conditionneur ; ammoniaque et nitrites → amorce si le filtre est jeune, changement d'eau
  sinon (ou en attendant l'amorce déjà versée) ; points blancs → médicament (ou sel) ; velours →
  médicament seul ; traitement en cours → poursuivre ; charbon pendant un traitement → le
  retirer ; autre alerte → son action conseillée, sans produit. Un produit conseillé qui agit
  déjà est signalé « en cours » : poursuivre, ne pas en reverser.
- **« Terminé »** : produit qui a agi dans ce bac depuis le chargement de la page et n'agit
  plus. Mémoire tenue par l'hôte **hors du monde** (`WeakMap` par monde, comme l'historique de
  l'eau), mise à jour à chaque relevé de l'eau et à la dose de conditionneur simple (qui agit à
  l'instant). Rien n'est sauvegardé : après un rechargement, un produit fini redevient
  « disponible ».
- **Interface** `ui/pharmacy/` : bouton « Pharmacie » (à gauche de « Wiki » au-delà de
  1099 px, dans la ligne du haut en dessous, sous le tableau de bord du haut sur téléphone) ;
  panneau `role="dialog"` à la place du wiki, focus sur le titre à l'ouverture, Tab piégé,
  Échap ferme et rend le focus au bouton ; exclusif avec les autres panneaux
  (`App.onPharmacyOpened`). La pharmacie n'agit sur rien : les gestes restent dans « Réglages » ;
  un lien ouvre la page « Produits et traitements » du wiki.

## Options écartées

- **Gestes dans la pharmacie** (boutons « Verser ») : doublons des réglages, et la pharmacie
  aurait dû reprendre leurs refus et messages ; hors périmètre d'une estimation S.
- **Section de plus dans « Réglages »** : panneau plein à 1280 × 720 et budget de style épuisé
  (`docs/PIEGES.md`).
- **« Terminé » sauvegardé** (champ du monde) : changerait la sauvegarde et les empreintes
  dorées pour une information de confort.
- **Conseil pour chaque alerte** : la pharmacie répond à la plus grave ; les autres restent
  dans le tableau de bord.

## Conséquences

- Nouveau bouton dans les captures d'interface (pas dans celles du contrat de capture) ;
  nouvelle capture `front-pharmacie`.
- Un futur produit s'ajoute à `PHARMACY_PRODUCTS` et à `productActive` ; une future alerte
  obtient un conseil propre dans `productAdvice`, sinon son action par défaut.
