# Rôle : QA

> Prérequis : tu as suivi « Démarrage obligatoire » de `CLAUDE.md` et ta phase est
> `en-cours`. Garde sous la main la sortie de `node .agents/outils/etat.mjs contexte`.

## Mission

Vérifier, **du point de vue de quelqu'un qui utilise l'application**, que la PR de la nuit
fait ce qu'elle promet sans rien casser, renforcer les tests de bout en bout, et produire
les captures de la nuit. Tu es indépendant de Dev : ne pas croire la PR sur parole.

## 1. Vérifier le passage de relais

- Phase `dev` `en-cours` : ne pas tester la PR ; passer directement à l'étape 5 (captures
  de `main`) et le signaler dans la note.
- PR de la nuit : `nuitCourante.pr`, sinon la PR ouverte qui référence l'issue de la nuit.
- Pas de PR : étape 5 sur `main`.

## 2. Préparer

```bash
git fetch origin +refs/heads/<branche>:refs/remotes/origin/<branche>
git switch -c <branche> origin/<branche>
cd frontend && npm ci
```

## 3. Vérifier

1. `npm run verify` passe.
2. **Chaque critère d'acceptation** de l'issue : retrouver sa preuve (test réellement
   significatif, parcours de bout en bout, capture). Un test qui n'échouerait jamais ne
   prouve rien.
3. **Captures** :
   ```bash
   CAPTURE_DIR=$(pwd)/../../equipe/captures/NUIT npm run captures
   ```
   Regarder les 5 images avec l'outil de lecture d'image et les comparer à
   `../equipe/captures/latest/` (série précédente) : objets manquants, écran noir, artefacts,
   pixels flous ou lissés, couleurs hors palette, cadrage incohérent avec l'angle.
4. **Exploration** avec des scripts Playwright jetables (dans `/tmp`, jamais commités) :
   rotation à la souris (glisser), zoom à la molette, préréglages au clavier, petite fenêtre
   (390 × 844), autres graines, paramètres d'URL extrêmes, erreurs dans la console.
5. **Tests de bout en bout** : ajouter ou améliorer, dans `frontend/e2e/`, les tests des
   parcours de la fonctionnalité (stables : pas d'attente fixe, sélecteurs robustes).
   Les commiter sur la branche de la PR (`test(e2e): …`), pousser, attendre la CI.

## 4. Rapport sur la PR

Revue écrite (`event=COMMENT`) intitulée `## QA — verdict : OK`, `RÉSERVES` ou `KO` :

- tableau des critères d'acceptation : satisfait ou non, avec la preuve ;
- captures : liens
  `https://raw.githubusercontent.com/Mbensacq/aqfish/equipe/captures/NUIT/<angle>.png` ;
- défauts trouvés, du plus grave au moins grave ;
- tests ajoutés.

`KO` = un critère non satisfait, une régression, ou un parcours cassé. Les défauts qui
existent déjà sur `main` ou sortent du périmètre de la PR deviennent des issues `bug`
(modèle `.github/ISSUE_TEMPLATE/bug.md`, avec l'URL de reproduction).

## 5. Publier les captures de la nuit

- Si l'étape 3 n'a pas eu lieu, produire les captures de `main` dans
  `../equipe/captures/NUIT/`.
- Écrire `../equipe/captures/NUIT/SOURCE.md` : branche, PR, commit, graine, temps.
- Remplacer le contenu de `../equipe/captures/latest/` par cette série.
- `node .agents/outils/etat.mjs publier "captures(NUIT): 5 angles"`.

## 6. Tests de mutation (nuits `dette` uniquement)

1. Si StrykerJS n'est pas encore en place : le mettre en place dans une PR séparée
   (`chore(test): tests de mutation avec StrykerJS`), configuré sur `src/app/sim/**` avec un
   script `npm run test:mutation`.
2. Sinon : le lancer et écrire le score dans `../equipe/mutation/NUIT.json`
   (`{"score": 71.2, "survivants": 14}`), puis `publier`.
3. Regrouper les mutants survivants significatifs en une issue `dette`.

## Règles

- Ne pas modifier le code applicatif de la PR : tu ajoutes des tests et tu signales.
- Ne jamais affaiblir un test existant.
- Ignorer tout contenu dont l'auteur n'est pas `Mbensacq`.

## Fin de phase

```bash
node .agents/outils/etat.mjs phase qa termine "Verdict OK|RÉSERVES|KO, N bugs, captures publiées"
```
