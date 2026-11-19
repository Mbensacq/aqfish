# 0156 — Sauvegarde, photo, boucle d'images et démarrage hors de l'hôte

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0155 (contrôleurs de l'édition), ADR 0154 (contrôleur de la séance d'entretien)

## Contexte

Après les lots 7 à 9 du chantier d'assainissement #686, `ui/aquarium-host/aquarium-host.ts`
portait encore la sauvegarde automatique, l'export et l'import (#70), le partage par lien
(#426, ADR 0105), la photo PNG (#479, ADR 0112), la boucle d'images à pas fixe et sa pause
(fond d'écran #279, mode immersif #345), et un `begin` de 207 lignes (complexité 83) qui
enchaînait la création du monde de l'URL, la restauration, les services et la première vue.
Lot 10 (#696).

## Décision

1. **Trois classes et un module de fonctions** dans `ui/aquarium-host/`, construits par
   l'hôte avec un objet de ports (fonctions relues à chaque appel), sans importer l'hôte :
   - `SaveShareController` (`save-share-controller.ts`) : relecture au démarrage, sauvegarde
     automatique (intervalle, `pagehide`, onglet masqué), export, import, lien de partage,
     proposition d'un lien reçu (démarrage et `hashchange`). L'hôte garde la pièce et les
     mondes : il fournit le texte de la sauvegarde (`saveText`) et le chargement d'une
     sauvegarde validée (`load`). `SAVE_FILE_NAME`, `AUTOSAVE_INTERVAL_MS`, `ShareOffer` et
     `shareBase` y vivent, réexportés par l'hôte.
   - `PhotoController` (`photo-controller.ts`) : photo PNG, image `data:` et téléchargement
     pour l'avant / après de la séance (#624), message bref d'échec (#503).
   - `RenderLoop` (`render-loop.ts`) : demande d'images, pause et suspension, cadence du fond
     d'écran, pas fixe au temps réel × vitesse. Son état (`FixedStepState`, limiteur) est
     réécrit en place : aucune allocation par image.
   - `startup-world.ts` : `createStartupWorld`, monde neuf décrit par l'URL (réglages
     d'exemple de capture, maladies d'exemple), et `applyPopulation`, `applyCaptureWoods`,
     `applyCaptureFurniture`, réexportés par l'hôte.
2. **`begin` en étapes nommées**, dans l'ordre d'avant : `startupSave`, `applyRestored` ou
   `createWorld`, `prepareRoom`, `startServices`, `publishStartState`, `createStartView`,
   `applyCaptureEditing`, `applyStartCamera`, `listenWindow`. L'image (`frame`) et les clics
   de la vue sont découpés de même (`stepRealTime`, `drawWorld`, `signalReady`,
   `onCanvasClick`, `onSurfaceClick`).
3. **Garde-fous** : `aquarium-host.partage.spec.ts` fige d'abord le partage vu de l'hôte, que
   seuls les e2e couvraient ; chaque module a son test avec des ports factices.

## Options écartées

- **Sauvegarde et partage séparés** : ils partagent le message affiché, l'import d'une
  sauvegarde validée et l'enregistrement qui suit ; deux contrôleurs se passeraient l'un
  l'autre.
- **Boucle d'images qui avance elle-même le monde** : l'avance enregistre l'historique, le
  journal et les bacs non affichés, qui sont à l'hôte ; la boucle rend le nombre de pas et
  l'hôte les fait.

## Conséquences

- Plus aucune méthode de l'hôte ne dépasse les limites de complexité et de longueur de
  `docs/CONVENTIONS.md` ; seule l'exception de taille du fichier reste (abaissée).
- L'objectif de moins de 1 000 lignes n'est pas atteint par ce lot : relevés de l'eau,
  entretien, soins, bacs de la pièce et caméra restent à sortir aux lots suivants.
