# 0064 — Amphibiens réels du paludarium : sonneur oriental et triton à ventre de feu

- Statut : acceptée (choix des espèces non vérifié à la source juridique consolidée)
- Date : 2026-10-27
- Auteur : Dev, cycle 86, issue #270 (lot 2/3 de #262)

## Contexte

Le paludarium affichait deux amphibiens génériques : une « Grenouille » (_Anura_, un ordre)
et un « Triton » (_Salamandridae_, une famille). `docs/ESPECES.md` (#262) demande des espèces
réelles, détenables en France sans formalité, et exclut _Xenopus_ (interdit) et
_Hymenochirus_ (Pipidae : certificat dès le premier individu en lecture littérale). Pour la
grenouille, la recherche documentaire n'avait vérifié aucun candidat de la ligne « Autres
Anoures ».

## Décision

1. **Triton : _Cynops orientalis_** (triton à ventre de feu chinois), plutôt que
   _C. pyrrhogaster_ :
   - taille (6 à 10,3 cm en longueur totale) proche du modèle existant (7 cm sans la queue),
     là où _C. pyrrhogaster_ atteint 10 à 15 cm ;
   - eau fraîche (14–20 °C, éviter au-dessus de 23 °C), la plus proche de l'axolotl
     (16–18 °C), seul autre habitant d'eau du paludarium ;
   - source de niveau « moyenne » (Caudata Culture), contre une source secondaire pour
     _C. pyrrhogaster_ ;
   - défaut connu, affiché dans la fiche : sujets souvent prélevés dans la nature, préférer
     ceux nés en captivité.
     Statut : « Autres Caudata », sans formalité jusqu'à 40 (confiance moyenne, non confirmé).
2. **Grenouille : _Bombina orientalis_** (sonneur oriental), anoure semi-aquatique d'Asie du
   Nord-Est (Corée, nord-est de la Chine, sud-est de la Sibérie) :
   - exotique (non indigène, donc hors arrêté du 8 janvier 2021), hors Pipidae, courant en
     élevage ;
   - adulte d'environ 6 cm, terrarium à 20–24 °C, eau peu profonde (une dizaine de cm) et un
     quart de berge sèche : le paludarium tel qu'il est (fiche de soins anapsid.org,
     **source secondaire**, consultée le 2026-10-27) ;
   - ligne « Autres Anoures » de `docs/ESPECES.md` appliquée à l'espèce : sans formalité
     jusqu'à 40, **confiance faible**. Les tentatives de lire l'annexe 2 de l'arrêté du
     8 octobre 2018 (copies FAOLEX et AIDA) se sont arrêtées avant les amphibiens : la ligne
     n'est pas confirmée. La fiche porte une mise en garde et la mention DDPP.
   - _Bombina variegata_ (sonneur à ventre jaune, indigène protégé) rejoint la liste
     d'exclusion, pour qu'un futur ajout du genre ne le propose pas par erreur.
3. **Identifiants inchangés** (`grenouille`, `triton`). Ils sont sérialisés dans les
   sauvegardes (`fish.species`, monde affiché et `others`, ADR 0063) et dans l'URL de
   capture. Les noms génériques _Anura_ et _Salamandridae_ n'ont jamais été écrits dans une
   sauvegarde : seuls le nom affiché et le nom scientifique de la définition changent. La
   « migration » d'une ancienne sauvegarde est donc l'identité : chaque `grenouille` ou
   `triton` enregistré devient, au chargement, un sonneur oriental ou un triton à ventre de
   feu, sans changement de schéma (test : `save.spec.ts`, « ancienne sauvegarde du
   paludarium »). Renommer les identifiants aurait demandé une table d'alias à la lecture,
   des changements dans le rendu, l’URL et de nombreux tests, pour aucun gain visible.
4. **Libellés de phrase** : « sonneur oriental » / « sonneurs orientaux » et « triton à ventre
   de feu » / « tritons à ventre de feu », au masculin. Le test du catalogue impose que le
   singulier soit le nom affiché en minuscules ; les compteurs (« Nombre de sonneurs
   orientaux »), boutons et avertissements suivent. Plus aucune espèce n'a de nom féminin :
   la branche féminine des libellés (`speciesStepLabel`, `addWarningText`) reste, pour une
   future espèce, sans donnée actuelle qui l'exerce.
5. **Apparence** : mêmes gabarits ; couleurs reprises dans la palette existante :
   - sonneur : dos vert grenouille `#7bc950`, taches noires `#1c1c22`, ventre rouge
     `#d94a3a` ;
   - triton : dos et flancs noirs `#1c1c22`, ventre orange triton `#e07a2f`, taches orange
     sur le dos (approximation de jeu : un dos gris roche `#45423e`, essayé d'abord, se
     confondait avec les racines et les rochers de la berge en vue de trois-quarts).
     Les comportements (sauts, nage, part du temps dans l'eau) ne changent pas : les tests de
     déplacement terre/eau (`frog.spec.ts`, `triton.spec.ts`) sont inchangés.

## Conséquences

- Les autres environnements ne changent pas (captures identiques à l'octet).
- Le ventre « de feu » n'apparaît que sur la rangée basse du corps (profil, trois-quarts) :
  la vue de dessous du paludarium montre le sol, pas les animaux.
- Restent à faire : confirmer les deux lignes de l'annexe 2 sur la version consolidée
  (Légifrance) ; recouper les paramètres du sonneur avec une source primaire ; la
  cohabitation axolotl / triton / sonneur, incohérente selon `docs/ESPECES.md`, relève du
  lot 3/3.
