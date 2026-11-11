# 0127 — Bac de quarantaine : un bac posé soigné à part, maladies portées par l'animal

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 192, issue #547

## Contexte

Épopée v1.16 « Soigner et prévenir ». Traiter tout le bac pour un seul malade pénalise les
plantes et les invertébrés (ADR 0126) ; les aquariophiles isolent le malade dans un bac de
quarantaine (`docs/SOINS.md`, § 1 et koïs). La pièce a déjà des bacs **indépendants** (ADR 0061),
le transfert à l'épuisette (ADR 0075) et des bacs posés qui vivent (ADR 0076), mais un bac posé
n'est pas sélectionnable : le rendre « regardé » demande de dessiner la pièce dans son repère
(chantier de rendu reporté par l'ADR 0075, #553). Or les gestes de soin n'agissaient que sur le
bac affiché. Enfin le transfert gardait la santé de l'animal, mais pas ses maladies.

## Décision

- **Aucun état nouveau** : un bac de quarantaine est un bac posé ordinaire (`addTank`, petit
  bac de 60 cm, nommé « Quarantaine », même environnement que le bac affiché, filtre neuf en
  maturation comme tout bac ajouté). Aucun champ de sauvegarde ni drapeau : tout bac posé peut
  servir de quarantaine (`quarantineTanks`).
- **Isolement** : `treatTank(pièce, bac, geste)` (`sim/quarantine.ts`, pur) copie le monde du
  seul bac visé et lui applique `treatWorldInPlace`, mêmes contrôles et refus qu'au bac affiché ;
  les autres bacs gardent le même objet. Aucun état de traitement n'est global : sel, médicament
  et chaleur sont dans `World.water` de chaque bac.
- **Maladie portée** : `transferFish` garde, en plus de la faim et de la santé, les points
  blancs, le velours et la pourriture des nageoires avec leur avancement. La contagion d'un bac
  ne compte que ses propres malades (`stepIchInPlace`, `stepVelvetInPlace`) : elle cesse au
  départ du dernier contagieux, sans code de plus. Un animal sain n'emporte aucun champ (mondes
  identiques au bit près à avant pour un transfert sain).
- **Interface** : section « Bacs » des réglages. Bouton « Isoler en quarantaine » (nom accessible « Installer un bac de quarantaine »)
  dès un malade dans le bac affiché tant qu'aucun bac posé n'existe (pièce masquée possible ;
  la durée sourcée est sa description). Puis groupe « Quarantaine », dès qu'un bac posé existe :
  choix du bac (nombre de malades), les trois gestes de soin pour ce bac seul, « Ramener au bac
  affiché » (le plus récent de l'espèce choisie) avec le rappel d'acclimatation de l'aide,
  durée en note. L'aller passe par le transfert existant. Messages dans `data-transfer-notice`.
  Bac par défaut inchangé ; à 1280 × 720 bac malade, une seule ligne de plus, dans la deuxième
  colonne (mesurée : « Sauvegarde » y tient encore) ; un quatrième bouton sur la ligne des gestes
  de « Soins » débordait de la colonne.
- **Durée** : affichée et sourcée (30 jours ; 4 à 6 semaines pour les koïs : UC Davis,
  Colombie-Britannique, Merck), jamais imposée : le temps du jeu est compressé, ce qui est dit
  « approximation de jeu ».

## Options écartées

- **Rendre le bac posé sélectionnable** : chantier de rendu et de caméra (ADR 0075), hors d'une
  PR M ; #553 reste ouverte. Soigner depuis la liste suffit pour l'isolement.
- **Drapeau `quarantine` dans la sauvegarde** : aucun comportement ne le lirait ; un nom suffit.
- **Quarantaine des koïs** : le bassin est au jardin, sans bac de la pièce à poser depuis lui ;
  refus en clair. À reprendre avec un bac d'eau froide de quarantaine.
- **Minuteur de quarantaine** : une durée réelle de semaines n'a pas de sens en temps compressé.

## Conséquences

- Le bac de quarantaine n'est pas regardé : on suit ses malades dans la liste (gravité, nombre
  de malades) et dans les messages des gestes.
- Le filtre neuf du bac de quarantaine (#538) mûrit seul ; l'amorce de bactéries reste réservée
  au bac affiché (#553).
