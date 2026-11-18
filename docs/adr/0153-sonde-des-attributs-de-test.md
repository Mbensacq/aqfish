# 0153 — Sonde des attributs de test de l'aquarium

- Statut : acceptée
- Date : 2026-11-18
- Auteur : Dev
- Complète : ADR 0002 (rendu pixel art 3D et contrat de capture)

## Contexte

`ui/aquarium-host/aquarium-host.ts` faisait 5 438 lignes, dont une trentaine de méthodes
`expose*` qui mêlaient trois effets : écrire un attribut `data-aqfish-*` (contrat des tests de
bout en bout et des captures), mettre à jour un signal du tableau de bord, et pousser un état
vers la vue (courant, plantes, algues…). Les 50 constantes d'attributs étaient déclarées au
milieu du composant. Chantier d'assainissement #686, lot 7 (#693), premier lot du démontage de
l'hôte.

## Décision

1. **Constantes** : les noms d'attributs vivent dans `ui/aquarium-host/aquarium-attributes.ts`,
   un module de données sans logique.
2. **Sonde** : `AquariumProbe` (`ui/aquarium-host/aquarium-probe.ts`), construite avec
   l'élément hôte, est la **seule** à écrire ces attributs. Ses méthodes `publish*` prennent des
   valeurs déjà calculées ou le monde en lecture seule ; elle ne touche ni aux signaux ni à la
   vue. Elle porte aussi la mémoire « réécrire seulement si ça change » des attributs de la
   boucle (pas, granulés, heure, lampe, rayons) et des relevés (plantes, distributeur).
3. **Hôte** : les anciennes `expose*` deviennent des `refresh*` (signaux et vue), qui appellent
   la sonde au même endroit qu'avant ; l'ordre et la fréquence des écritures sont inchangés.
4. **Garde-fous** : `aquarium-probe.spec.ts` énumère les attributs publiés et les compare à la
   liste du contrat et aux constantes déclarées ; `aquarium-host.attributs.spec.ts` fige les
   attributs et leurs valeurs de l'hôte monté (graine fixe, interactif et capture).

## Options écartées

- **Un `effect` Angular par attribut** : écritures déclenchées par la détection de
  changements, donc à un autre moment que la boucle ; les e2e qui attendent un pas précis
  seraient devenus fragiles.
- **Une méthode générique `set(nom, valeur)`** : aucune vérification des formats, et la liste
  des attributs ne serait plus lisible en un seul endroit.

## Conséquences

- Les lots suivants (contrôleurs extraits de l'hôte) publient par la sonde au lieu d'écrire sur
  l'élément ; un nouvel attribut s'ajoute dans `aquarium-attributes.ts`, une méthode de la sonde
  et la liste de `aquarium-probe.spec.ts`.
- Renommer un attribut reste une rupture du contrat, traitée dans une issue à part.
