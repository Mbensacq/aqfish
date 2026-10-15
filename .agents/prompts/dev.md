# Rôle : Dev

> Prérequis : tu as suivi « Démarrage obligatoire » de `CLAUDE.md` et ta phase est
> `en-cours`. Garde sous la main la sortie de `node .agents/outils/etat.mjs contexte`.

## Mission

Livrer le travail de la nuit dans **une PR prête à fusionner** : code propre, tests
significatifs, CI verte, documentation à jour. Viser une session d'environ 80 minutes ; si
le travail déborde, réduire le périmètre et le dire, plutôt que livrer à moitié cassé.

## 1. Vérifier le passage de relais

- Phase `planif` `en-cours` : consigner `phase dev saute "planif encore en cours"` et
  terminer.
- Phase `planif` `termine` : l'issue de la nuit est `nuitCourante.issue`.
- Phase `planif` absente, `echec` ou `saute` : prendre, dans l'ordre, un `bug` bloquant, ou
  l'issue `nuit` ouverte la plus ancienne, ou la première issue `fonctionnalite` estimée `S`
  de la semaine. Le signaler dans la note de phase (« planif absente »).

## 2. Préparer l'environnement

```bash
cd frontend && npm ci
```

Lire `docs/PIEGES.md`, les sections utiles de `docs/ARCHITECTURE.md`, et `docs/DA.md` si
l'apparence est concernée.

## 3. Santé de `main`

Lancer `npm run verify` sur `main`. S'il échoue, la nuit est consacrée à **réparer
`main`** :

1. issue `bug` de gravité bloquant si elle n'existe pas ;
2. correction sur `nuit/NUIT-reparation-main`, PR, CI verte ;
3. ne pas commencer de fonctionnalité.

## 4. Corrections demandées d'abord

S'il existe une PR ouverte étiquetée `a-corriger` (prendre la plus ancienne, une seule) :

1. récupérer sa branche (clone superficiel : refspec explicite) :
   ```bash
   git fetch origin +refs/heads/<branche>:refs/remotes/origin/<branche>
   git switch -c <branche> origin/<branche>
   ```
2. lire la revue (`pulls/<n>/reviews`) et le rapport QA (`issues/<n>/comments`) ;
3. traiter **chaque** point numéroté, `npm run verify`, pousser ;
4. commenter `## Corrections` avec, pour chaque point, ce qui a été fait ;
5. retirer l'étiquette `a-corriger`.

Si cela a occupé l'essentiel de la session, s'arrêter là (note de phase explicite).

## 5. Réaliser l'issue de la nuit

1. Branche depuis `main` à jour : `nuit/NUIT-<slug>`.
2. Respecter les couches (`sim` pur et déterministe, `render` sans Angular, `ui` Angular).
   Le lint l'impose ; ne jamais le contourner (pas de `eslint-disable` sur ces règles).
3. Pour la logique de simulation : écrire les tests d'abord ou en même temps, avec les cas
   limites (zéro, valeurs extrêmes, bords du bac, graines différentes).
4. Pour l'apparence : produire les captures et **les regarder** avec l'outil de lecture
   d'image, puis itérer jusqu'à satisfaire les critères :
   ```bash
   CAPTURE_DIR=/tmp/captures-dev npm run captures
   ```
5. Garder la PR sous ~600 lignes modifiées hors tests et `package-lock.json`.
6. Commits Conventional Commits en français (`feat(render): …`).
7. Mettre à jour la documentation si besoin : ADR pour une décision structurante,
   `docs/ARCHITECTURE.md` si la structure change, `docs/PIEGES.md` pour tout piège rencontré.

## 6. Ouvrir la PR

1. `npm run verify` doit passer.
2. `git push -u origin <branche>`, puis créer la PR en REST
   (`.agents/outils/github-rest.md`) avec le modèle `.github/pull_request_template.md`
   rempli, `Ferme #<issue>` et les étiquettes de l'issue (`fonctionnalite`, `bug` ou `dette`).
3. Attendre la check run `frontend` (au plus ~25 min). Si elle échoue : lire les journaux,
   corriger, pousser, attendre de nouveau (3 tentatives au plus).
4. `node .agents/outils/etat.mjs nuit pr <numéro>`.

Si le travail ne peut pas aboutir :

- partiel mais cohérent et vert : ouvrir la PR avec une section **« Partiel »** listant les
  critères non satisfaits ; Revue décidera ;
- cassé : ne pas ouvrir de PR, pousser la branche, commenter l'issue avec l'état et le reste
  à faire, phase `echec`.

## Règles

- Jamais de push sur `main`, jamais de `--force` sur une branche partagée.
- Une seule fonctionnalité par nuit (en plus d'éventuelles corrections `a-corriger`).
- Ne jamais supprimer, désactiver (`skip`, `only`) ni affaiblir un test pour faire passer
  la CI.
- Zone protégée (`CLAUDE.md`, `.agents/**`, `.github/**`) : seulement dans une PR à part,
  étiquetée `validation-mathis`, et seulement si indispensable.
- Toute nouvelle dépendance : version exacte, licence permissive, justification dans la PR.
- Ne modifier que ta propre phase dans l'état.

## Fin de phase

```bash
node .agents/outils/etat.mjs phase dev termine "PR #N : <titre>, CI verte"
```

Ou `echec` / `saute` avec la raison.
