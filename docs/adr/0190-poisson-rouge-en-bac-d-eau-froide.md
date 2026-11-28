# 0190 — Poisson rouge proposé au bac d'eau froide, bac d'eau froide redimensionnable

- Statut : acceptée (complète les ADR 0047, 0065, 0171, 0172 et 0173)
- Date : 2026-11-28
- Auteur : Dev, cycle 324, issue #862

## Contexte

Le scénario S3 (`docs/ECOSYSTEME.md` § 3.1 : 120 L et un poisson rouge, le deuxième refusé
avec la raison OATA) était vert en test unitaire mais injouable : le poisson rouge ne vivait
qu'au bassin (environ 834 L, dimensions fixes), le bac d'eau froide (environ 155 L de 1 m ×
45 cm × 45 cm) n'accueillait que l'axolotl, et seul le bac tropical se redimensionnait. Or
155 L acceptent deux poissons rouges (100 L + 50 L) : il faut un bac plus petit.

## Décision

1. **Poisson rouge proposé au bac d'eau froide** (`COLD_TANK.species`), sans y être peuplé
   d'office : le bac par défaut garde ses deux axolotls, sous sa capacité (ADR 0173). Eau froide
   (17 °C) et pH du bac sont dans les plages préférées du poisson rouge (`poisson-rouge.spec.ts`).
   Le verdict axolotl / poisson rouge (`sim/compatibility.ts`) est inchangé : le mélange reste
   déconseillé ; c'est au joueur de retirer les axolotls (ADR 0065, « seul ou entre axolotls »).
2. **Bac d'eau froide redimensionnable** (`RESIZABLE_ENVIRONMENTS`) dans les bornes communes
   `TANK_LIMITS`. Ses curseurs sont ceux de l'éditeur de décor : l'éditeur s'ouvre donc aussi au
   bac d'eau froide (`EDITABLE_ENVIRONMENTS`). Le bac 80 × 40 cm, 50 cm de haut, donne environ
   123 L d'eau réelle : un poisson rouge, le deuxième refusé (S3).
3. **Conséquences mécaniques** acceptées : un bac d'eau froide ajouté à la pièce prend la taille
   choisie au catalogue (`addedTankDimensions`, comme le tropical) ; le paramètre de capture
   `bac=` s'y applique ; une sauvegarde d'eau froide peut porter des dimensions.

## Options écartées

- **Nouveau bac « poissons rouges » dédié** (sixième environnement) : liste, captures, rendu et
  sauvegardes à étendre pour un seul scénario ; disproportionné pour une issue S.
- **Taille de catalogue de 80 cm** pour les bacs ajoutés à la pièce : S3 n'aurait été jouable
  qu'en passant par la pièce (bac tropical seulement), parcours long et peu découvrable.
- **Autoriser axolotl et poisson rouge ensemble** : contraire aux sources (températures proches
  mais le poisson rouge mordille les branchies, l'axolotl avale ce qui passe).

## Conséquences

- Hauteur minimale réglable : 50 cm (`TANK_LIMITS`). Le bac d'eau froide par défaut (45 cm) est
  hors de ces bornes : le premier réglage de n'importe quel curseur porte sa hauteur à 50 cm.
  Sans réglage, rien ne change (dimensions absentes du monde et de la sauvegarde).
- Empreintes de non-régression inchangées ; sauvegardes anciennes du bac d'eau froide
  (sans dimensions) relues à l'identique (`sim/eau-froide-rouge.spec.ts`).
- L'éditeur propose au bac d'eau froide la même palette qu'au tropical (rochers, bois, plantes,
  salvinia) : aucun élément n'y est propre à l'eau chaude.
