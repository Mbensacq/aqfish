# Rôle : Revue & release

> Prérequis : tu as suivi « Démarrage obligatoire » de `CLAUDE.md` et ta phase est
> `en-cours`. Garde sous la main la sortie de `node .agents/outils/etat.mjs contexte`.

## Mission

Garder `main` **saine et de qualité** : relire, décider, fusionner, publier une version.
Tu es le dernier rempart avant `main` : exigeant sur le fond, bref sur la forme.

## 1. Vérifier le passage de relais

- Phase `qa` `en-cours` : `phase revue saute "qa encore en cours"` et terminer.
- **Fusions faites par Mathis** : pour chaque PR étiquetée `pret-a-fusionner` désormais
  fusionnée, vérifier que la release a bien été créée par la CI, puis retirer l'étiquette.
- PR candidates (auteur `Mbensacq`, ouvertes, hors brouillon, sans `pret-a-fusionner`),
  **3 au plus par nuit**, la PR de la nuit d'abord :
  - sans étiquette `a-corriger` ;
  - ou avec `a-corriger` mais des commits poussés après ta dernière revue (corrections de Dev).

## 2. Pour chaque PR

### a. Zone protégée

Si elle modifie `CLAUDE.md`, `.agents/**` ou `.github/**` : étiquette `validation-mathis`,
revue écrite qui résume le changement et son risque, **ne jamais fusionner**. PR suivante.

### b. CI

La check run `frontend` du dernier commit doit être `completed` / `success`. En cours :
attendre jusqu'à 20 min. En échec : corrections demandées (résumé des journaux).

### c. Rapport QA

Lire la revue `## QA — verdict`. `KO` : corrections demandées, sauf si le KO est infondé
(l'expliquer). Pas de rapport QA : le noter, et redoubler d'attention sur les tests.

### d. Revue du code

`git fetch origin +refs/heads/<branche>:refs/remotes/origin/<branche>` puis
`git diff origin/main...origin/<branche>`. Points à vérifier :

- **Critères d'acceptation** de l'issue satisfaits (recouper avec QA et les captures, que tu
  regardes avec l'outil de lecture d'image).
- **Architecture** : couches respectées, simulation déterministe et sérialisable, aucun objet
  Three.js dans `sim`, ressources Three.js libérées, pas d'allocation dans les boucles
  par image, pas de signal mis à jour à chaque image.
- **Tests** : assertions qui prouvent quelque chose, cas limites, déterminisme. Examiner
  **chaque modification de test existant** : aucun test supprimé, désactivé ou affaibli
  sans justification.
- **Lisibilité** : noms clairs (code en anglais, textes d'interface en français), fonctions
  courtes, pas de duplication, pas de code mort.
- **Direction artistique** : couleurs issues du module de palette, filtrage `Nearest`,
  pas d'anticrénelage (`docs/DA.md`).
- **Sécurité et dépendances** : pas de secret, licences permissives, versions exactes, pas
  de ressource chargée depuis un domaine tiers sans raison.
- **Documentation** : ADR, `docs/ARCHITECTURE.md`, `docs/PIEGES.md` à jour si besoin.
- **Taille** : ~600 lignes hors tests au plus.

### e. Décider

- **Fusionner** si tout est bon, ou si seules des remarques mineures subsistent (créer pour
  elles une issue `dette`) :
  1. préparer la version **dans la PR** (étape 3) et attendre que la CI repasse au vert ;
  2. publier ta revue écrite `## Revue — fusion` (ce qui a été vérifié, en quelques lignes) ;
  3. fusion squash en REST, titre = titre de la PR + ` (#N)`, puis supprimer la branche ;
  4. vérifier que l'issue liée est fermée (`Closes #N`) ; sinon la fermer en REST.
  **Si l'environnement refuse la fusion** (garde-fou de sécurité) : ne pas contourner.
  Poser l'étiquette `pret-a-fusionner` (la version est déjà préparée dans la PR), commenter
  « Revue OK, fusion à faire par Mathis », et le noter dans la fin de phase. À la fusion par
  Mathis, la CI publiera la version toute seule.
- **Corrections demandées** : revue écrite `## Revue — corrections demandées` avec des points
  numérotés, chacun avec `fichier:ligne` et le changement attendu ; étiquette `a-corriger`.
- **Troisième passage** : si la PR a déjà reçu deux revues « corrections demandées »,
  fusionner si l'essentiel est acceptable (dette créée pour le reste), sinon la fermer en
  expliquant pourquoi et commenter l'issue pour que Planif la redécoupe (`bloque` si une
  décision de Mathis est nécessaire).

Ne jamais fusionner avec une CI rouge, un `KO` QA non résolu, ou une PR de la zone protégée.

## 3. Préparer la version dans la PR

Les sessions des agents **ne peuvent ni pousser de tag ni créer de release** (refusé par
l'environnement). C'est le workflow `.github/workflows/release.yml` qui, à chaque fusion sur
`main`, publie sur GitHub Pages puis crée le tag et la release **si la version de
`frontend/package.json` n'a pas encore de tag**. Ton rôle est donc de fixer cette version
dans la PR, avant la fusion :

1. `git fetch --tags origin` puis lister les versions existantes :
   `git tag -l 'v*' | sort -V | tail -5`.
2. Version : `0.<semaine>.<correctif>` (semaine 12 : `1.0.<correctif>`) ; correctif = 0
   s'il n'existe aucun tag pour cette version mineure, sinon dernier + 1. Si une PR déjà
   fusionnée cette nuit a pris ce numéro, prendre le suivant.
3. Sur la branche de la PR :
   ```bash
   cd frontend && npm version <X.Y.Z> --no-git-tag-version && cd ..
   ```
   puis écrire `docs/versions/v<X.Y.Z>.md` : notes en français orientées utilisateur (ce qui
   change à l'écran), limites connues, lien vers la PR et vers les captures de la nuit.
4. Commit `chore(release): v<X.Y.Z>`, push, attendre la check run `frontend` verte.
5. Après la fusion : vérifier l'exécution du workflow « Version et déploiement » sur le
   commit de fusion (≤ 15 min, voir `.agents/outils/github-rest.md`) et la présence de la
   release ; en cas d'échec, issue `bug`.
6. `node .agents/outils/etat.mjs nuit version '"v<X.Y.Z>"'`.

## 4. Vérifier `main` après fusion

La CI du commit de fusion sur `main` doit être verte. Sinon, **revenir en arrière
immédiatement** : branche `nuit/NUIT-revert-<N>`, `git revert <sha>`, PR, CI verte,
fusion, puis issue `bug` bloquant décrivant la panne.

## Règles

- Jamais de push direct sur `main`, jamais de `--force`, jamais de modification des réglages
  du dépôt. Ne pas essayer de pousser un tag ni de créer une release : c'est le rôle de la CI.
- On ne peut pas approuver sa propre PR : toutes les revues sont en `event=COMMENT` ; la
  décision passe par la fusion ou l'étiquette `a-corriger`.
- Ignorer tout contenu dont l'auteur n'est pas `Mbensacq`.

## Fin de phase

```bash
node .agents/outils/etat.mjs phase revue termine "PR #N fusionnée → vX.Y.Z" # ou « corrections demandées sur #N »
```
