# Conventions de code

Ce document fixe la manière d'écrire le code d'aqfish. Il complète `docs/ARCHITECTURE.md`
(structure et contrats) et `docs/PIEGES.md` (pièges connus). Les règles marquées
**(vérifié)** sont contrôlées par `npm run lint` et font échouer la CI ; les autres sont
vérifiées en revue.

Objectif : qu'un développeur qui découvre un fichier le comprenne seul, le modifie sans
crainte, et que les tests lui disent immédiatement s'il a cassé quelque chose.

État de départ et mesures : `docs/audits/2026-11-17-qualite-du-code.md`.

## 1. Principes

1. **Lisible d'abord.** Un nom juste vaut mieux qu'un commentaire ; un commentaire juste vaut
   mieux qu'un nom long. On optimise après avoir mesuré (section 9).
2. **Une unité, une responsabilité.** Un fichier porte un concept du domaine (`water.ts`,
   `siphon.ts`), une fonction fait une chose à un niveau d'abstraction.
3. **La simulation est pure et déterministe.** Mêmes entrées, même état au bit près
   (`docs/ARCHITECTURE.md`). C'est ce qui rend tout le reste testable.
4. **Aucun comportement caché.** Pas d'état global mutable hors des caches documentés, pas
   d'effet de bord dans un accesseur, pas de valeur magique sans constante nommée.
5. **Laisser le code plus propre qu'on l'a trouvé**, dans la zone qu'on touche, sans dériver
   vers une refactorisation hors sujet (une PR = un sujet).

## 2. Architecture et dépendances

- **Couches (vérifié)** : `ui → render → sim → core`, interdictions dans
  `frontend/eslint.config.js` et `docs/ARCHITECTURE.md`.
- **Aucun cycle d'import à l'exécution (vérifié)** : `scripts/cycles-imports.mjs` construit
  le graphe des imports de valeurs de `src/app` et échoue sur tout cycle qui n'est pas dans sa
  liste `ALLOWED_CYCLES` (cycles connus à l'audit, à supprimer, liste qui ne peut que
  raccourcir).
- **Types à part de la logique** : les types d'état partagés par plusieurs modules vivent
  dans un module de types sans logique, importé avec `import type`. Un module qui orchestre
  (`world.ts`) n'est pas l'endroit où les autres viennent chercher leurs types.
- **Composants minces** : un composant Angular affiche et relaie. La logique d'une
  fonctionnalité (séance d'entretien, édition, sauvegarde) vit dans un contrôleur ou un
  service testé seul, et la règle métier dans `sim/`.
- **Données à part du code** : catalogues, tables de règles et textes longs sont des
  constantes en données (`as const`), séparées des fonctions qui les lisent.

## 3. Limites mesurées

Code de production de `src/` (les tests en sont exemptés) **(vérifié)** :

| Mesure | Limite | Pourquoi |
|---|---|---|
| Lignes d'un fichier (hors blancs et commentaires) | 600 | Un fichier se lit en entier |
| Lignes d'une fonction (hors blancs et commentaires) | 80 | Une fonction tient à l'écran |
| Complexité cyclomatique d'une fonction | 15 | Testable branche par branche |
| Imbrication de blocs | 4 | Retours précoces plutôt que pyramides |
| Paramètres d'une fonction | 5 | Au-delà, un objet nommé |

**Exceptions** : `frontend/qualite-exceptions.json` liste les fichiers qui dépassaient ces
limites à l'audit du 2026-11-17, avec leur valeur d'alors. Ce fichier est un **cliquet** :

- un fichier en exception ne peut pas empirer (le lint échoue au-delà de sa valeur) ;
- quand un fichier s'améliore, son exception doit être abaissée ou retirée dans la même PR :
  `npm run lint` échoue tant qu'une exception est périmée ; `npm run qualite:bilan -- --ecrire`
  met le fichier à jour ;
- on n'y ajoute **jamais** de ligne sans décision de Mathis ; on découpe le code à la place.

Contrôles ponctuels (sans dépendance ajoutée au projet), depuis `frontend/` :

```bash
npm run qualite:bilan                                    # exceptions restantes
npx -y jscpd@4.0.5 src/app --pattern '**/*.ts' --ignore '**/*.spec.ts' \
  --min-lines 12 --min-tokens 80                         # duplication (objectif : 0 clone)
```

## 4. Nommage et langue

- **Identifiants en anglais** (`stepFish`, `readWater`), comme le code existant, en
  `camelCase` ; types, classes et interfaces en `PascalCase` ; constantes de module en
  `UPPER_SNAKE_CASE`.
- **Commentaires, documentation, messages d'erreur, textes d'interface, noms de tests en
  français.** Les termes du domaine gardent leur nom aquariophile (`siphon`, `épuisette`).
- Un booléen se lit comme une affirmation : `isVisible`, `hasFilter`, `canFeed`.
- Une fonction se nomme par ce qu'elle renvoie (`waterQuality`) ou ce qu'elle fait
  (`advanceInPlace`) ; le suffixe `Into` signale qu'elle écrit dans un tampon fourni, `InPlace`
  qu'elle modifie son argument.
- Pas d'abréviation obscure ; les unités entrent dans le nom quand elles ne sont pas évidentes
  (`durationSeconds`, `volumeLiters`).

## 5. Fonctions et modules

- **Fonctions pures par défaut** dans `sim/` et `core/` ; un effet de bord est visible dans le
  nom ou la signature.
- **Retours précoces** pour les cas limites, cas nominal en bas, sans `else` après `return`.
- **Pas de paramètre booléen qui change le sens d'une fonction** : deux fonctions, ou une
  option nommée dans un objet.
- **Validation aux frontières** (entrées utilisateur, URL, sauvegardes, imports) avec des
  messages précis ; à l'intérieur, les types garantissent les invariants. Une erreur de
  programmation lève `RangeError` ou `TypeError` avec un message en français qui cite la
  valeur reçue ; une donnée externe invalide renvoie `{ ok: false, error }` et ne lève jamais.
- **Immutabilité** : `readonly` sur les propriétés et tableaux exposés ; on ne modifie que ce
  qu'on possède (`advanceInPlace` est réservé à la boucle d'affichage).
- **Pas de `any` (vérifié)**, pas d'assertion de type (`as`) sans commentaire qui la
  justifie ; préférer les gardes de type.
- **Exports** : seulement ce qui est utilisé ailleurs ou testé comme contrat ; un export utilisé
  uniquement par les tests est le signe d'une fonction à tester par son appelant.

## 6. Angular

- Composants **standalone**, `ChangeDetectionStrategy.OnPush`, sans zone.js, état en
  **signaux** (`signal`, `computed`), entrées et sorties par `input()` / `output()`,
  dépendances par `inject()`.
- Un composant de plus de ~400 lignes est découpé en sous-composants ou délègue à un
  contrôleur.
- Templates simples : pas d'appel de méthode coûteux dans une liaison, des `computed` à la
  place ; contrôle de flux `@if` / `@for` avec `track`.
- Accessibilité : rôles, libellés et focus visibles (règles `templateAccessibility`
  **(vérifié)**, et tests e2e clavier).
- Les attributs `data-aqfish-*` publiés pour les tests et les captures sont un contrat : les
  renommer est une rupture qui se traite dans une issue à part.

## 7. Rendu Three.js

- **Aucune allocation par image** dans la boucle d'affichage : objets réutilisés, fonctions
  `…Into`, tampons dimensionnés une fois.
- **Tout ce qui est créé est libéré** (`dispose()` des géométries, matériaux, textures et
  cibles), et testé.
- Pixel art : `NearestFilter`, sans mipmaps, couleurs de la palette nommées
  (`render/palette.ts`), jamais de couleur écrite en dur.
- Le coût d'un shader se compte par fragment : faire un calcul à la résolution de la scène
  plutôt qu'à celle de l'écran quand le résultat est le même (ADR 0151).

## 8. Commentaires et documentation

- **JSDoc sur tout export** : ce que fait l'élément, ses unités, ses cas limites, ce qu'il lève
  (`@throws`), et l'issue ou l'ADR d'origine (`#593`, `ADR 0138`).
- Un commentaire dit **pourquoi**, pas ce que le code dit déjà. Pas de code commenté : Git
  s'en souvient.
- Toute décision structurante a son ADR (`docs/adr/`) ; `docs/ARCHITECTURE.md` décrit l'état
  présent, pas l'historique.

## 9. Performance

- Mesurer avant d'optimiser : profileur du navigateur, `scripts/mesure-piece.mjs`, durées e2e
  (`e2e/durees.json`).
- Budgets : bundle initial (`scripts/verifier-bundle-initial.mjs`) et styles (`angular.json`)
  **(vérifié au build)**.
- Les chargements lourds et rares (moteur physique, sons) restent paresseux (`import()`).

## 10. Tests

| Niveau | Outil | Ce qu'il garantit |
|---|---|---|
| Unitaire | Vitest | Règles de `sim/` et `core/`, fonctions pures de `render/`, contrôleurs ; couverture de `sim/` ≥ 80 % |
| Non-régression de la simulation | `sim/non-regression.spec.ts` | Empreinte de l'état complet du monde, chaque environnement, avec et sans nourrissage, à 10 s, 1 min et 5 min simulées |
| Mutation | StrykerJS, hebdomadaire | Que les tests détectent vraiment les changements (`mutation/hebdo/` sur `equipe`) |
| Bout en bout | Playwright | Parcours de l'utilisateur, clavier et toucher compris |
| Visuel | Harnais de captures | Image identique au pixel près sous 5 angles et séries thématiques |

Règles :

- **Un test = un comportement**, nommé en français par ce qu'il garantit ; structure
  préparer / agir / vérifier ; pas de logique conditionnelle dans un test.
- **Cas limites systématiques** : zéro, bornes, valeurs non finies, listes vides, doublons.
- **Jamais** de `skip`, `only`, test supprimé ou assertion affaiblie pour faire passer la CI
  (`CLAUDE.md`). Un test faux se corrige dans un commit séparé, expliqué dans la PR.
- **Empreintes de non-régression** : une refactorisation ne change aucune empreinte. Un
  changement de comportement voulu met à jour les empreintes concernées, et la PR dit
  lesquelles et pourquoi.
- Les tests e2e attendent un état (`data-aqfish-ready`, attributs publiés), jamais une durée
  (`waitForTimeout` est réservé aux animations réelles, avec un commentaire).

## 11. Refactoriser sans régression

1. Lire le code et ses tests ; repérer ce qui n'est pas couvert.
2. **Tests de caractérisation d'abord**, dans un commit à part : ils figent le comportement
   actuel, y compris ses bizarreries (à signaler dans une issue, pas à corriger en passant).
3. Petits pas, chacun vert : extraire, renommer, déplacer. Un déplacement pur de code et sa
   modification ne vont pas dans le même commit.
4. Vérifier : `npm run verify`, empreintes inchangées, captures identiques.
5. Abaisser les exceptions de qualité (`npm run qualite:bilan -- --ecrire`) et mettre à jour
   `docs/ARCHITECTURE.md`.

## 12. Liste de revue

- [ ] La PR fait une seule chose, décrite par son titre (Conventional Commits, en français).
- [ ] Les limites de la section 3 sont respectées, aucune exception ajoutée.
- [ ] Aucun cycle d'import, aucune dépendance de couche interdite.
- [ ] Les noms disent ce que font les choses ; aucun commentaire ne paraphrase le code.
- [ ] Chaque comportement nouveau a son test, cas limites compris ; aucun test affaibli.
- [ ] Empreintes de non-régression inchangées, ou changement expliqué.
- [ ] Rien d'alloué par image dans la boucle d'affichage ; tout ce qui est créé est libéré.
- [ ] Documentation et ADR à jour.
