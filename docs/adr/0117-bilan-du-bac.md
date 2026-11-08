# 0117 — Bilan du bac

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 177, issue #514

## Contexte

Les alertes disent ce qui ne va pas maintenant ; elles ne disent pas comment réussir. Les erreurs
classiques du débutant (bac surchargé, surnourrissage, mélange d'espèces) ne sont pas toutes des
alertes, et le bandeau ne doit pas se remplir de conseils que personne n'a demandés.

## Décision

- **Module pur** `sim/bilan.ts` : six sujets (densité, azote, nourrissage, compatibilité, dureté,
  température), classés par gravité puis ordre fixe, trois points au plus. Une valeur non finie
  donne un point critique.
- **Seuils réutilisés** : ceux des jauges et des fiches. Deux seuls sont propres au bilan :
  - **densité** : charge par litre (`waterLoad / waterLiters`) dérivée du modèle de l'eau, celle
    où un filtre neuf maintient les nitrites à leur seuil (`seuil × NITRITE_CONVERSION /
    AMMONIA_PER_LOAD_LITER`). Le texte en donne le pourcentage, sans notion de « charge » ;
  - **surnourrissage** : 15 granulés non mangés (3 dépôts) : **approximation de jeu**.
- **À la demande** : bouton « Bilan du bac » dans la ligne de santé ; le détail n'est calculé que
  déplié, relu au rythme des relevés de l'eau. Il replie alertes et calendrier, et inversement.
- **Rien dans le monde** : pas d'état, pas de champ de sauvegarde, captures inchangées.

## Conséquences

- Un point du bilan peut doubler une alerte (azote, température) : c'est voulu, le bilan
  ajoute la valeur comparée et l'action, et se lit seul.
- Le koï à son effectif maximal dépasse le seuil de densité du bassin : les plafonds de population
  restent des bornes techniques, pas des conseils.
- Note globale, comparaison entre bacs et conseils d'achat restent hors périmètre.
