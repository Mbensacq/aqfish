# 0129 — Table des maladies : partie commune de l'état, comportement dans chaque module

- Statut : acceptée
- Date : 2026-11-11
- Auteur : Dev, cycle 194, issue #562

## Contexte

Quatre maladies sont simulées : points blancs (ADR 0088), pourriture des nageoires (ADR 0114),
velours (ADR 0124) et champignons (ADR 0128). La revue de la PR #561 relève que chacune répète
la même structure et que l'ajout de la quatrième a touché une dizaine de fichiers. Contraintes
du cycle de dette : comportement inchangé, sauvegardes existantes relues telles quelles,
déterminisme et captures identiques à l'octet.

Inventaire des points de contact d'une maladie :

| Point de contact | Nature |
|---|---|
| Champ facultatif de `Fish` (`sim/swimmer.ts`) | type, identique pour les quatre |
| Sauvegarde : écriture et relecture (`sim/save.ts`) | mécanique : champ, borne, `isProgress`, `catches` |
| Transfert entre bacs (`diseasesOf`, `sim/tank-transfer.ts`) | mécanique : copie des champs présents |
| Malades d'un bac de quarantaine (`sickCount`) | mécanique : au moins un champ présent |
| Pas de simulation, stades, poids santé (`wellbeing.ts`) | propre à chaque maladie (causes, contagion, ordre dans le pas) |
| Bilan de santé, alertes, animaux à signaler | propre (seuils de stade, textes, causes) |
| Traitement (`treatWorldInPlace`, `treatment.ts`) | propre : la pourriture n'est pas comptée parmi les malades traitables |
| Rendu (`fish-layer.ts`) | propre : motif, rang, couleur, attribut d'instance |
| Paramètre de capture, aide, pharmacie | propre (nom d'URL, textes) |

## Décision

- **Table `DISEASES`** (`sim/diseases.ts`) limitée à la partie **mécanique** : `field`, `max`,
  `isProgress`, `catches`, dans l'ordre historique d'écriture (`ich`, `finRot`, `velvet`,
  `fungus`), qui fixe l'ordre des clés du JSON. Sauvegarde, transfert (`diseasesOf`) et
  quarantaine (`isSick`) la parcourent. Messages d'erreur de relecture inchangés
  (`<champ> hors de [0, <max>]`).
- **Pas de table « comportementale »** : stades, signes, causes, poids santé, alertes, rendu et
  traitements diffèrent réellement d'une maladie à l'autre ; les ranger derrière des fonctions
  génériques (`shows…`, `stage…`) cacherait ces différences sans réduire le code. Chaque
  maladie garde son module.
- Ajouter une cinquième maladie : une ligne dans `DISEASES` (le type `DiseaseField` et le champ
  de `Fish` suivent), plus son module et ses points de contact propres.

## Options écartées

- **Table complète** (une entrée par maladie avec pas, stade, sévérité, rendu, alerte) : grosse
  PR à risque sur le déterminisme (ordre des tirages dans le pas) pour un gain faible, les
  points propres ne se ressemblant qu'en apparence.
- **Statu quo** : la partie mécanique se recopiait à l'identique à chaque maladie (sauvegarde
  surtout), source d'oubli.

## Conséquences

- Sauvegardes identiques (même ordre de clés, mêmes validations) ; aucun tirage ni pas de
  simulation touché : déterminisme et captures inchangés.
- Le transfert copie les maladies dans l'ordre de la table (auparavant `ich`, `velvet`,
  `finRot`, `fungus`) : ordre des clés de l'objet seulement, sans effet sur la sauvegarde, qui
  suit la table.
