# 0124 — Velours (Oodinium) : troisième maladie, contagieuse, soignée par le médicament

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 189, issue #532

## Contexte

Épopée v1.15, lot 4/4. Deux maladies existent : les points blancs (ADR 0088, 0089, 0091),
parasite contagieux soigné par sel, chaleur ou médicament ; la pourriture des nageoires
(ADR 0114), liée à l'eau, sans médicament. Le velours (Oodinium / Piscinoodinium,
`docs/SOINS.md` § 5.2) est un parasite proche des points blancs par son mode de transmission,
mais d'aspect différent (voile fin doré). Contraintes : déterminisme, captures par défaut
identiques à l'octet, sauvegardes anciennes relues telles quelles, non-confusion avec les
points blancs (symptômes et remèdes distincts).

## Décision

- **État** : champ facultatif `Fish.velvet`, progression en secondes simulées dans [0, 900] ;
  absent, l'animal est sain. Un seul nombre, comme la pourriture des nageoires : il monte sans
  traitement, redescend sous médicament et s'efface à 0. Pas de nouveau champ dans l'eau
  (contrairement à `ichCure`).
- **Stades** : incubation [0, 240 s[ (aucun signe, pas contagieux), voile [240, 600 s[
  (demi-cause de santé), avancé à partir de 600 s (cause entière).
- **Apparition** : stress du bac des points blancs (`ichStress`), taux par cause 1/7200 s⁻¹
  (moitié de celui des points blancs) ; **contagion lente** : 1/5400 s⁻¹ par poisson au voile
  visible (trois fois moins que les points blancs). Bac sans stress ni malade : jamais malade.
- **Qui** : comme les points blancs (`catchesIch`) ; le récif (Amyloodinium) n'est pas simulé.
- **Hasard** : hachage sans état (graine, pas, animal), sel propre ; aucun tirage sans stress
  ni malade, ni sous traitement.
- **Traitement** : le médicament du panneau « Soins » (`medicationProtects`, lu sur l'eau du
  début du pas) bloque toute infection et fait reculer le voile à la vitesse
  900 / (2 journées) : un animal au maximum guérit en deux journées simulées, ce qui demande un
  second dosage (une dose protège ≈ 2,3 jours). Médicament non redosé : la maladie reprend là où
  elle en est. Le sel et la chaleur sont acceptés mais n'agissent pas ; le geste renvoie la mise
  en garde `VELVET_WRONG_TREATMENT` (erreur de traitement enseignée). Le contexte du geste
  compte les malades de velours (`TreatmentContext.velvet`), sans quoi le médicament serait
  refusé « aucun malade ».
- **Boucle** : après les points blancs, avant les traitements (dégradation du médicament) et la
  pourriture des nageoires ; en pause en mode décor.
- **Alerte** « Velours (voile doré) », critique au stade avancé, action « médicament tous les
  deux jours ; le sel et la chaleur n'y font rien », lien vers la page « Maladies » ; nouvelle
  fiche « Velours (Oodinium) » au wiki. Les malades sortent de l'alerte de santé générale
  (`HealthSummary.diseased`) et sont désignés par l'alerte (`alertTargets`).
- **Rendu** (`withVelvet`) : à l'intensité maximale, tous les voxels se mêlent à peine à l'or
  koï (`PALETTE.koiOr`, 8 %), et la moitié des voxels tachables, pris à l'autre bout du rang de
  taché que les points blancs, deviennent une poussière dorée. Valeurs choisies sur capture
  (`front-velours`, `side-velours`) : un voile mêlé à 45 %, puis 20 %, faisait basculer à la
  passe palette le rouge et le bleu du néon vers l'orange et le menthe, et l'espèce ne se
  reconnaissait plus ; à 8 %, la couleur d'origine reste et l'or vient de la poussière. Garde
  `intensité > 0` : rendu inchangé pour un poisson sain. L'attribut `aqfishSpot` est déclaré
  une seule fois (`declareAttribute`) puisque deux effets le lisent.
- **Sauvegarde** : champ `velvet` écrit pour un malade seulement, relu s'il est dans [0, 900],
  refusé sinon, ignoré pour un animal qui ne l'attrape pas ; pas de changement de schéma.
- **Capture** : paramètre `velours=1` (tous les poissons concernés au maximum à t = 0).

## Valeurs : sources et approximations

- Sourcé (`docs/SOINS.md` § 5.2, UF/IFAS FA165) : en mer, cuivre libre 0,15–0,20 mg/L.
- **Non vérifié** : traitements du velours en eau douce (`docs/SOINS.md` § 15), aspect
  « voile doré » (description d'usage). Le choix du médicament générique du jeu et
  l'inefficacité du sel sont des **approximations de jeu**, choisies pour distinguer les deux
  maladies ; à revoir si une source vérifiée les contredit.
- Tous les délais et taux : approximations de jeu (journée de 20 minutes).

## Options écartées

- **Réutiliser `ichCure`** (cure partagée) : couplerait les deux maladies ; un bac aux deux
  maladies guérirait des deux au même rythme.
- **Produit au cuivre dédié** : sourcé en mer seulement ; le récif n'a pas de maladie simulée.
- **Obscurité comme traitement** (le parasite est photosynthétique, selon l'usage amateur) :
  non vérifié, et demanderait de lier la maladie à l'éclairage.
- **Contagion par un poisson nouvellement introduit** : pas de notion d'arrivée ni de
  quarantaine dans le jeu ; à reprendre avec le bac de quarantaine (#547).

## Conséquences

- Trois maladies possibles sous stress ; leurs poids s'ajoutent dans la santé (bornée au
  plancher, aucune mort).
- Le médicament sert désormais deux maladies : la future pharmacie du bac (#533) devra
  distinguer les produits par maladie visée.
