# 0058 — Fiches d'espèces : format, règle de sourçage, avertissement d'ajout

- Statut : acceptée
- Date : 2026-10-26
- Auteur : Dev, cycle 79, issue #237

## Contexte

L'épopée v0.12 « L'aquarium éducatif » (#229) demande qu'une personne qui débute puisse lire
ce dont une espèce a besoin avant de l'ajouter (#237) : une fiche par espèce, accessible
depuis le panneau « Population », et un avertissement à l'ajout si le bac ne convient pas.
`docs/SOINS.md` (« Comment l’utiliser ») impose que toute valeur sans source consultable
soit marquée « approximation de jeu ». L'issue nommait cette décision « ADR 0057 », numéro
déjà pris par le pH (#236) : elle devient la 0058.

## Décision

- **Données pures dans `sim/species-sheet.ts`** : `SpeciesSheet` porte, par espèce, taille
  adulte (cm), température préférée et tolérée (°C), pH préféré et toléré, régime, caractère,
  groupe minimal, volume conseillé (L) et espèces à éviter. Table `SHEET_DATA` typée sur
  `SpeciesId` : une nouvelle espèce sans fiche ne compile pas.
- **Chaque champ est un `SheetField<T>`** : `{ value, status }`, avec `status` égal à
  `{ kind: 'source', reference }` (référence non vide) ou `{ kind: 'approximation' }`. Le
  panneau affiche le statut en petit gris sous la valeur (« Source : … » ou « Approximation de
  jeu »). Un test vérifie que toute espèce du catalogue a une fiche complète et que chaque
  statut est valable.
- **Règle de sourçage** : un champ n'est `source` que si sa valeur figure telle quelle dans
  un document consultable avec sa référence. Ce cycle, seules les plages de température de
  `docs/SOINS.md` § 11 remplissent cette condition ; la référence cite le document et la
  source qu'il indique (« docs/SOINS.md § 11 (FishBase) »). Elles n'ont pas été recoupées
  avec la source primaire (réseau des agents limité aux registres de paquets). Désaccords
  écrits dans la référence (corydora : 22–26 °C contre 18–24 °C). Grenouilles et tritons
  (« non vérifié » dans SOINS.md) : approximations. Tout le reste (tailles, régimes, groupes,
  volumes, plages préférées) : approximations de jeu.
- **Source unique pour ce que la simulation porte déjà** : le pH préféré et toléré est l'objet
  même de `SPECIES_PH` (ADR 0057, approximations de jeu), le caractère vient de
  `TEMPERAMENTS` et les espèces à éviter de `compatibility` (ADR 0055). Aucune copie : changer
  une plage de pH change la fiche. Les plages de pH de SOINS.md § 11 (néon 5,0–7,0…) diffèrent
  de celles du jeu ; les réconcilier est une décision de simulation (santé), hors périmètre.
- **Avertissement d'ajout** (`addWarnings`) : pour l'espèce ajoutée et son nouvel effectif,
  dans un bac de `liters` litres peuplé de `counts` :
  - `volume` si le bac fait strictement moins que le volume conseillé (volume exact : rien ;
    volume inconnu ou invalide : rien) ;
  - `groupe` si l'effectif est strictement sous le groupe minimal ;
  - `incompatible` pour chaque autre espèce présente déconseillée (même règle que les
    mélanges de #209).
    Le panneau retient la dernière espèce ajoutée (« + », curseur ou champ en hausse) et
    affiche ses avertissements sous sa ligne ; ils sont recalculés sur la population et le
    volume courants (l'hôte fournit `tankLiters`, `waterLiters(environmentWater(monde))`), donc
    disparaissent quand le bac convient. Une baisse de cette espèce ou un changement
    d'environnement les efface.
- **Calibrage des volumes** : la population par défaut de chaque environnement ne déclenche
  ni avertissement de volume ni de groupe (testé). Les corydoras (100 L) avertissent dans le
  plus petit bac tropical réglable (moins de 100 L, testé), pour que l'avertissement de volume puisse
  apparaître en jeu.
- **Interface** : bouton « Fiche » à côté du nom de chaque espèce (disclosure,
  `aria-expanded`, `aria-controls`), sans changer la hauteur de la ligne ; la fiche est une
  région titrée (`role="region"`, `aria-labelledby`) sous la ligne de l'espèce, une seule à la
  fois ; Échap ou « Fermer la fiche » la referme et rend le focus au bouton.

## Options écartées

- **Fiches dans un panneau ou une boîte de dialogue à part** : un panneau de plus à cadrer
  (`e2e/cadrage-panneaux.spec.ts`) et une gestion de focus modale, pour un contenu court ;
  la fiche dans la section reste lisible à 390 px et défile avec le panneau.
- **Statut implicite (tout est approximation sauf mention)** : l'oubli d'une mention ferait
  passer une valeur inventée pour sourcée ; le statut obligatoire par champ le rend visible
  au typage.
- **Reprendre les plages de pH de SOINS.md dans la fiche** : deux valeurs différentes pour la
  même espèce (fiche et santé) ; la fiche montre ce que la simulation applique.
- **Avertir à chaque changement de population** (pas seulement à l'ajout) : les mélanges
  déconseillés (#209) le font déjà pour le bac entier.

## Conséquences

- Une nouvelle espèce exige sa fiche ; tout champ sourcé exige une référence.
- La capture d'interface `telephone-fiche-espece` (390 × 844, fiche du néon) s'ajoute ; les
  captures 3D sans panneau sont inchangées à l'octet. `telephone-catalogue` change (boutons
  « Fiche »).
- Le test d'accessibilité du panneau compte un contrôle de plus par espèce.
- À faire : recouper les plages de SOINS.md avec les sources primaires, sourcer tailles,
  groupes et volumes, puis passer les champs concernés en `source`.
