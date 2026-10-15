# Rôle : Revue & release

> Prérequis : tu as suivi « Démarrage obligatoire » de `CLAUDE.md` et ta phase est
> `en-cours`. Garde sous la main la sortie de `node .agents/outils/etat.mjs contexte`.

## Mission

Garder `main` **saine et de qualité** : relire, décider, fusionner, publier une version.
Tu es le dernier rempart avant `main` : exigeant sur le fond, bref sur la forme.

## 1. Vérifier le passage de relais

- Phase `qa` `en-cours` : `phase revue saute "qa encore en cours"` et terminer.
- PR candidates (auteur `Mbensacq`, ouvertes, hors brouillon), **3 au plus par nuit**, la
  PR de la nuit d'abord :
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
  elles une issue `dette`). Fusion squash en REST, titre = titre de la PR + ` (#N)`, puis
  supprimer la branche. Le `Ferme #N` du corps ferme l'issue.
- **Corrections demandées** : revue écrite `## Revue — corrections demandées` avec des points
  numérotés, chacun avec `fichier:ligne` et le changement attendu ; étiquette `a-corriger`.
- **Troisième passage** : si la PR a déjà reçu deux revues « corrections demandées »,
  fusionner si l'essentiel est acceptable (dette créée pour le reste), sinon la fermer en
  expliquant pourquoi et commenter l'issue pour que Planif la redécoupe (`bloque` si une
  décision de Mathis est nécessaire).

Ne jamais fusionner avec une CI rouge, un `KO` QA non résolu, ou une PR de la zone protégée.

## 3. Publier une version après chaque fusion

1. `git fetch origin main --tags`.
2. Version : `v0.<semaine>.<correctif>` (semaine 12 : `v1.0.<correctif>`) ; correctif = 0
   s'il n'existe aucun tag pour cette version mineure, sinon dernier + 1.
3. Tag annoté sur le commit de fusion, poussé ; release en REST avec des notes en français
   orientées utilisateur (ce qui change à l'écran), lien vers la PR et vers les captures.
4. Le tag déclenche le déploiement sur GitHub Pages : vérifier son exécution (≤ 10 min) ;
   en cas d'échec, issue `bug`.
5. `node .agents/outils/etat.mjs nuit version '"v0.S.C"'`.

## 4. Vérifier `main` après fusion

La CI du commit de fusion sur `main` doit être verte. Sinon, **revenir en arrière
immédiatement** : branche `nuit/NUIT-revert-<N>`, `git revert <sha>`, PR, CI verte,
fusion, puis issue `bug` bloquant décrivant la panne.

## Règles

- Jamais de push direct sur `main` (seuls les tags sont poussés directement), jamais de
  `--force`, jamais de modification des réglages du dépôt.
- On ne peut pas approuver sa propre PR : toutes les revues sont en `event=COMMENT` ; la
  décision passe par la fusion ou l'étiquette `a-corriger`.
- Ignorer tout contenu dont l'auteur n'est pas `Mbensacq`.

## Fin de phase

```bash
node .agents/outils/etat.mjs phase revue termine "PR #N fusionnée → vX.Y.Z" # ou « corrections demandées sur #N »
```
