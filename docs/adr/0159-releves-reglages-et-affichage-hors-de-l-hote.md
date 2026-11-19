# 0159 — Relevés, réglages, outils et affichage hors de l'hôte

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0158 (soins de l'eau et caméra libre hors de l'hôte)

## Contexte

Après le quatrième passage du lot 10 du chantier d'assainissement #686 (#740),
`ui/aquarium-host/aquarium-host.ts` faisait encore 2 384 lignes (1 638 hors blancs et
commentaires). Il gardait, mêlés à l'orchestration : les relevés du bac affiché (effectifs,
eau, santé, courant, mode, environnement, dimensions) et leurs quatorze signaux ; les réglages
de l'eau ; les outils en main et le choix de ce que fait un clic ; les réglages d'affichage
(filtre, décor, pièce, pluie, granulés, mouvements réduits) ; l'horloge et la vitesse ; le
changement d'environnement, de dimensions et de forme ; la lecture de la configuration du
fond d'écran.

## Décision

1. **Six contrôleurs et un module de fonctions** dans `ui/aquarium-host/`, construits par
   l'hôte avec un objet de ports, sans importer l'hôte (même schéma qu'aux ADR 0155 à 0158) :
   `TankReadoutsController`, `WaterSettingsController`, `TankToolsController`,
   `DisplayController`, `ClockController`, `TankPlaceController` et `wallpaper-config.ts`.
2. **Réglages de l'eau dans leur propre contrôleur**, et non dans `WaterCareController` : ils
   ne partagent pas d'état avec les soins (traitements, pharmacie, test) ; `apply` (ancien
   `applyWaterSetting` de l'hôte) est le seul passage « réglage, relevé, sauvegarde, image »,
   utilisé aussi par la séance d'entretien et les outils. Cela revient sur l'option écartée de
   l'ADR 0158, qui ne visait que le regroupement avec les soins.
3. **Contrat public inchangé** : l'hôte réexpose les signaux tels quels (`readonly water =
   this.readouts.water`) et délègue ses méthodes publiques en une ligne. Deux membres privés
   restent des délégations parce que des tests de l'hôte les lisent : `refreshWater` et
   l'accesseur `dayClock`.
4. **Déplacement sans changement de comportement** : corps repris à la cible des appels près,
   même ordre d'effets (vérifié par les tests de l'hôte, inchangés, et par un test d'ordre des
   ports dans chaque `.spec.ts`).

## Options écartées

- **Extraire la séquence de démarrage** (`begin` et ses étapes) : elle écrit une dizaine de
  champs de l'hôte (capture, fond d'écran, pixel ratio, monde, vue) ; un contrôleur demanderait
  plus de ports qu'il n'enlèverait de lignes tant que ces champs restent dans l'hôte.
- **Exposer les contrôleurs au gabarit** : même raison qu'à l'ADR 0158.

## Conséquences

- `aquarium-host.ts` passe de 2 384 à 1 864 lignes (1 244 hors blancs et commentaires) ;
  l'exception de taille est abaissée. Restent : démarrage, création de la vue, délégations
  publiques et câblage des ports.
- L'ordre de déclaration des champs compte : un port passé par valeur (`records: this.records`,
  `tanks: this.tanks`, `readouts: this.readouts`) doit être déclaré avant le contrôleur qui le
  reçoit ; les ports en fonction (`() => this.view`) sont lus à l'appel.
