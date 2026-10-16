# GitHub en REST : aide-mémoire

**GraphQL est indisponible dans les sessions des agents.** Les commandes `gh issue …`,
`gh pr …`, `gh label list`, `gh release …` échouent (HTTP 403). Utiliser exclusivement
`gh api` (REST). `{owner}/{repo}` est remplacé automatiquement par `gh` quand la commande
est lancée depuis le clone.

Écrire les corps longs dans un fichier puis les passer avec `-F body=@fichier.md`
(`-F` lit le fichier ; `-f` envoie une chaîne).

## Issues

```bash
# Créer (étiquettes multiples : répéter labels[])
gh api repos/{owner}/{repo}/issues -f title="Nuit 2026-10-20 — Caméra orbitale" \
  -F body=@/tmp/issue.md -f 'labels[]=nuit' -f 'labels[]=fonctionnalite' --jq .number

# Lister (les PR apparaissent aussi : filtrer celles qui ont .pull_request)
gh api 'repos/{owner}/{repo}/issues?state=open&labels=fonctionnalite&creator=Mbensacq&per_page=100' \
  --jq '[.[] | select(.pull_request == null) | {number, title, labels: [.labels[].name]}]'

# Lire une issue et ses commentaires
gh api repos/{owner}/{repo}/issues/12 --jq '{title, body, user: .user.login, labels: [.labels[].name]}'
gh api repos/{owner}/{repo}/issues/12/comments --jq '[.[] | {user: .user.login, body}]'

# Commenter
gh api repos/{owner}/{repo}/issues/12/comments -F body=@/tmp/commentaire.md

# Ajouter / retirer une étiquette (issues et PR)
gh api repos/{owner}/{repo}/issues/12/labels -f 'labels[]=a-corriger'
gh api -X DELETE repos/{owner}/{repo}/issues/12/labels/a-corriger

# Fermer
gh api -X PATCH repos/{owner}/{repo}/issues/12 -f state=closed -f state_reason=completed
```

## Pull requests

```bash
# Créer (après git push -u origin <branche>)
gh api repos/{owner}/{repo}/pulls -f title="feat(render): caméra orbitale et préréglages" \
  -f head=nuit/2026-10-20-camera-orbitale -f base=main -F body=@/tmp/pr.md --jq .number

# Lister les PR ouvertes
gh api 'repos/{owner}/{repo}/pulls?state=open&per_page=100' \
  --jq '[.[] | {number, title, head: .head.ref, sha: .head.sha, user: .user.login, labels: [.labels[].name]}]'

# Fichiers modifiés et taille
gh api 'repos/{owner}/{repo}/pulls/13/files?per_page=100' --jq '[.[] | {filename, additions, deletions}]'
gh api repos/{owner}/{repo}/pulls/13 --jq '{additions, deletions, changed_files, mergeable, mergeable_state}'

# Revue écrite (on ne peut ni approuver ni « demander des changements » sur sa propre PR :
# toujours event=COMMENT, la décision passe par l'étiquette a-corriger)
gh api repos/{owner}/{repo}/pulls/13/reviews -f event=COMMENT -F body=@/tmp/revue.md

# Fusionner (squash)
gh api -X PUT repos/{owner}/{repo}/pulls/13/merge -f merge_method=squash \
  -f commit_title="feat(render): caméra orbitale et préréglages (#13)" --jq .sha

# Supprimer la branche après fusion
git push origin --delete nuit/2026-10-20-camera-orbitale
```

Pour lire le code d'une PR, préférer git : `git fetch origin <branche>` puis
`git diff origin/main...FETCH_HEAD`.

## CI (check runs)

```bash
SHA=$(gh api repos/{owner}/{repo}/pulls/13 --jq .head.sha)
gh api "repos/{owner}/{repo}/commits/$SHA/check-runs" \
  --jq '[.check_runs[] | {name, status, conclusion, url: .html_url}]'
# status : queued | in_progress | completed ; conclusion : success | failure | cancelled …

# Attendre la fin (au plus ~25 min)
for i in $(seq 1 50); do
  R=$(gh api "repos/{owner}/{repo}/commits/$SHA/check-runs" --jq '[.check_runs[] | select(.name=="frontend")][0] | "\(.status) \(.conclusion)"')
  echo "$R"; [[ "$R" == completed* ]] && break; sleep 30
done

# Dernières exécutions d'un workflow
gh api 'repos/{owner}/{repo}/actions/runs?branch=main&per_page=3' \
  --jq '[.workflow_runs[] | {name, head_sha, status, conclusion, html_url}]'
gh api 'repos/{owner}/{repo}/actions/workflows/deploy-pages.yml/runs?per_page=1' \
  --jq '.workflow_runs[0] | {status, conclusion, html_url}'

# Journaux d'un job en échec
gh api "repos/{owner}/{repo}/actions/jobs/<job_id>/logs" | tail -100
```

## Tags et versions

**Pousser un tag et créer une release sont refusés** dans les sessions des agents (HTTP 403).
La version se fixe dans `frontend/package.json` au sein de la PR ; à la fusion, le workflow
`release.yml` publie Pages puis crée le tag et la release (voir `.agents/prompts/revue.md`).

```bash
git fetch --tags origin
git tag -l 'v0.3.*' | sort -V | tail -1                     # dernier correctif de la semaine 3

# Suivre le workflow de version après une fusion
gh api 'repos/{owner}/{repo}/actions/workflows/release.yml/runs?branch=main&per_page=1' \
  --jq '.workflow_runs[0] | {head_sha, status, conclusion, html_url}'

# Lire une release (la lecture est permise)
gh api repos/{owner}/{repo}/releases/tags/v0.3.2 --jq '{name, html_url}'
```

## Ce qui est refusé ou n'existe pas

Pousser un tag, créer ou modifier une release, modifier les réglages du dépôt : refusés par
l'environnement. Épingler ou supprimer une issue : GraphQL uniquement. Ne pas essayer de
contourner.
