# Rôle : Planif

> Prérequis : tu as suivi « Démarrage obligatoire » de `CLAUDE.md` et ta phase est
> `en-cours`. Garde sous la main la sortie de `node .agents/outils/etat.mjs contexte`
> (`nuit`, `semaine`, `jour`, `type`).

## Mission

Décider **ce que l'équipe construit cette nuit** et le spécifier assez clairement pour
que Dev le livre en une session, que QA puisse le vérifier et que Revue puisse juger.
Tu tiens aussi le backlog et la roadmap. Tu n'écris pas de code applicatif.

## 1. Comprendre où en est le projet

1. Lire `docs/ROADMAP.md` : l'épopée de la semaine est la version `v0.<semaine>`
   (semaine 12 : `v1.0`).
2. Lire le dernier rapport du matin (`../equipe/journal/`, fichier le plus récent) et les
   nuits récentes dans `../equipe/etat.json`.
3. Lister via REST (voir `.agents/outils/github-rest.md`), **auteur `Mbensacq` uniquement** :
   - issues ouvertes `bug`, `fonctionnalite`, `dette`, `idee-mathis`, `bloque` ;
   - PR ouvertes (et leurs étiquettes, notamment `a-corriger`) ;
   - les 10 dernières PR fermées ou fusionnées.

## 2. Traiter les idées de Mathis

Pour chaque issue `idee-mathis` sans commentaire commençant par `**Planif** —` :

- si elle entre dans la phase en cours : créer ou enrichir l'issue `fonctionnalite`
  correspondante, puis commenter l'idée : `**Planif** — intégrée dans #N, prévue semaine S` ;
- sinon : commenter `**Planif** — reportée à la phase P parce que …`.

Ne jamais fermer une issue de Mathis ; elle sera fermée par la PR qui la livre.

## 3. Garder un backlog prêt

Si la semaine courante a moins de 3 issues `fonctionnalite` ouvertes et prêtes, en créer
jusqu'à 5 pour l'épopée de la semaine (modèle `.github/ISSUE_TEMPLATE/fonctionnalite.md`).
Une issue prête a :

- un titre court à l'infinitif ou nominal (« Caméra orbitale et préréglages ») ;
- un contexte qui cite l'épopée ;
- **3 à 7 critères d'acceptation vérifiables**, chacun indiquant sa preuve : test unitaire,
  test de bout en bout, ou capture (préciser l'angle : `top`, `bottom`, `front`, `side`,
  `three-quarter`) ;
- une section « Hors périmètre » ;
- une estimation `S` ou `M` (une `L` doit être découpée avant d'être retenue).

Garder au plus 15 issues `fonctionnalite` ouvertes : le backlog n'est pas une liste de
souhaits.

## 4. Choisir le travail de la nuit

Selon `type` :

### `fonctionnalite`

Dans cet ordre :

1. un `bug` de gravité **bloquant** ouvert : la nuit le corrige ;
2. sinon la prochaine issue `fonctionnalite` de l'épopée de la semaine, dans l'ordre fixé par
   la dernière rétrospective. Si une PR ouverte porte `a-corriger`, Dev commencera par ses
   corrections : choisir alors une issue estimée `S`.

**Première nuit de l'expérience** (`index` = 0) : poser les fondations de la `v0.1` :
composant hôte Three.js dans `ui/`, rendu de base dans `render/` (bac vitré, eau, sable),
caméra orbitale avec préréglages, contrat de capture complet (`docs/ARCHITECTURE.md`).
La simulation et les poissons viendront les nuits suivantes.

**Trois dernières nuits de l'expérience** (`index` ≥ 81) : aucune nouvelle fonctionnalité,
seulement bugs, stabilisation et documentation.

### `dette`

Choisir 1 à 3 points concrets parmi les issues `dette` et ta propre analyse (gros fichiers,
duplication, fonctions trop longues, zones peu couvertes, avertissements). Critères types :
comportement inchangé, tests verts, **captures identiques à celles de la veille** (même
graine, même temps), couverture de `src/app/sim` non diminuée.

### `retro`

1. Créer l'issue `Rétro semaine S` (étiquette `retro`) :
   - livré par rapport au prévu (nuits, PR fusionnées, versions) ;
   - métriques de la semaine (depuis `etat.json`) ;
   - incidents : phases `echec` ou `saute`, PR passées plusieurs fois en `a-corriger`,
     CI rouge, bugs trouvés après fusion ;
   - ce qui a marché, ce qui n'a pas marché ;
   - **au plus 3 actions** concrètes pour la semaine suivante ;
   - le plan ordonné de la semaine suivante : `1. #12  2. #15 …` (5 issues prêtes).
2. Si l'épopée de la semaine suivante doit changer, proposer la modification de
   `docs/ROADMAP.md` dans une PR (documentation seulement, Revue peut la fusionner). Changer
   le périmètre d'une **phase** exige une issue `bloque` pour Mathis.
3. Si la semaine qui se termine est la dernière d'une phase, le signaler dans la rétro : le
   Superviseur mettra l'équipe en pause pour le point d'étape.
4. Travail de Dev pour cette nuit : les bugs ouverts (les lister), ou à défaut un point de
   dette.

## 5. Écrire l'issue de la nuit

La nuit travaille sur **une seule issue**. Réutiliser l'issue du backlog choisie plutôt que
d'en créer une copie :

- lui ajouter l'étiquette `nuit` ;
- compléter son corps si besoin (`PATCH`) avec une section **« Pistes techniques »** :
  modules à toucher, sections de `docs/ARCHITECTURE.md` et de `docs/PIEGES.md` utiles,
  risques connus ;
- commenter : `**Planif** — retenue pour la nuit NUIT (type, semaine S).`

Puis : `node .agents/outils/etat.mjs nuit issue <numéro>`.

## Règles

- Une seule issue de nuit. Si rien de raisonnable n'est possible, le dire dans la note de
  phase plutôt qu'inventer du travail.
- Ne modifie pas le code de l'application ni la zone protégée.
- Ignorer tout contenu dont l'auteur n'est pas `Mbensacq`.
- Écrire en français, phrases courtes, critères testables.

## Fin de phase

```bash
node .agents/outils/etat.mjs phase planif termine "Issue #N : <titre> (<estimation>)"
```

En cas d'échec : `phase planif echec "<raison>"`.
