# 0062 — Statut légal des espèces en France et liste d'exclusion

- Statut : acceptée
- Date : 2026-10-27
- Auteur : Dev, cycle 84, issue #269

## Contexte

Mathis veut que le jeu reste dans la législation (#262). Le lot 1/3 (#269) demande un statut
légal par fiche (ADR 0058), une liste d'exclusion testée et des corrections de fiches tirées
de `docs/ESPECES.md`. Ce document a été écrit à partir de l'arrêté du 8 octobre 2018 et de son
modificatif du 5 septembre 2025, **sans** la version consolidée de Légifrance. L'issue
nommait cette décision « ADR 0061 », numéro déjà pris par la pièce de N bacs : elle devient
la 0062.

## Décision

- **Module pur `sim/species-legal.ts`** : `LEGAL_STATUS`, table typée sur `SpeciesId` (une
  nouvelle espèce sans statut ne compile pas). Chaque `LegalStatus` porte un régime
  (`sans-formalite`, `declaration`, `certificat`, `interdit`, `a-verifier`), l'effectif
  maximal sans formalité, un niveau de confiance (`elevee`, `moyenne`, `faible`,
  `non-verifie`, ceux de `docs/ESPECES.md`), une référence non vide, une précision et
  `confirmed`.
- **Prudence par défaut** : `confirmed` vaut `false` tant que le statut n'a pas été lu sur la
  version consolidée ; le texte affiché finit alors par « à vérifier auprès de la DDPP ». Un
  statut `a-verifier` a la confiance `non-verifie` (testé).
- **Fiche** : nouveau champ `legal` (`SheetField<LegalStatus>`, dernière ligne « Statut légal
  en France ») ; son statut affiche la source et la confiance. Nouveau champ `notes` : mises en
  garde sourcées affichées en tête de fiche (koï non vérifiée, chirurgien pas pour débutant,
  poisson-clown sans anémone).
- **Liste d'exclusion `EXCLUSIONS`** : taxons que le jeu ne propose jamais, au rang d'espèce
  (« Genre espèce ») ou de genre (« Genre »), avec un motif (`interdit`, `liste-union`,
  `certificat-des-un`, `indigene-protegee`) et une référence. `exclusionOf` compare genre et
  épithète sans casse, auteur ni sous-espèce ; l'espèce prime sur le genre. `validateSpecies`
  refuse une définition exclue, et un test vérifie qu'aucune espèce du catalogue ne l'est.
  Liste de précaution, non exhaustive : une espèce absente n'est pas pour autant autorisée.
- **Corrections** : corydoras renommé *Hoplisoma paleatum* (nom courant « Corydora »
  conservé, identifiant `corydora` inchangé donc sauvegardes intactes) ; koï : plus aucun champ
  « source » (la plage de `docs/SOINS.md` repasse en approximation, `docs/ESPECES.md` prévaut) ;
  chirurgien bleu : 31 cm (FishBase) et 300 L conseillés (OATA via un revendeur, secondaire),
  d'où l'avertissement d'ajout sous 300 L (450 L avant, approximation).

## Ce qui n'a pas pu être vérifié (cycle 84)

- Version consolidée de l'arrêté du 8 octobre 2018 : non consultée. Aucun statut n'est
  `confirmed`.
- Poissons (néon, guppy, corydoras, poisson-clown, chirurgien) : aucune ligne de l'annexe 2
  vérifiée ; régime `a-verifier`.
- Koï : statut de la forme domestique (arrêté du 11 août 2006) non vérifié.
- Axolotl : « Autres Caudata », 1 à 40 sans formalité, lu via `docs/ESPECES.md` (confiance
  moyenne) ; la liste des formes domestiques reste en désaccord entre sources secondaires.
- Grenouille et triton génériques : espèce non déterminée, régime `a-verifier` (lot 2/3,
  #262).
- Liste de l'Union : inscription de *Pseudorasbora parva*, *Procambarus clarkii*,
  *Trachemys scripta* et *Lithobates catesbeianus* au règlement d'exécution (UE) 2016/1141
  reprise sans relire l'annexe consolidée sur EUR-Lex ; *Xenopus laevis* (2022/1203, arrêté du
  14 février 2018) vient de `docs/ESPECES.md`.
- Indigènes protégés : exemples (*Salamandra salamandra*, *Lissotriton helveticus*,
  *Ichthyosaura alpestris*, *Hyla arborea*, *Bufo bufo*) tirés de la règle générale de
  l'arrêté du 8 janvier 2021 citée par `docs/ESPECES.md`, sans relecture de ses annexes.

## Options écartées

- **Statut légal dans `species.ts`** : mêle données juridiques et paramètres de nage ; un
  module dédié se teste et se relit seul.
- **Filtrer silencieusement le catalogue** : une espèce exclue disparaîtrait sans bruit ; la
  validation des définitions la signale au test.
- **Afficher un régime « sans formalité » pour les poissons courants** : plausible mais non
  vérifié ; contraire à la règle « jamais de valeur inventée ».

## Conséquences

- La fiche compte 11 lignes ; captures d'interface avec fiche modifiées
  (`telephone-fiche-espece`) et nouvelle capture `three-quarter-fiche-chirurgien` (bureau,
  récif). Captures sans fiche inchangées.
- Toute nouvelle espèce exige un statut légal et passe la liste d'exclusion.
- Confirmer un statut : lire la version consolidée, passer `confirmed` à `true` et la
  confiance à `elevee`, mettre `docs/ESPECES.md` à jour.
