# 0187 — Vieillissement et durée de vie des animaux

- Statut : acceptée (complète les ADR 0113 et 0137)
- Date : 2026-11-27
- Auteur : Dev, cycle 316, issue #857

## Contexte

Les animaux ne vieillissaient pas : seuls les alevins grandissaient (`Fish.growth`). Chaque
fiche porte déjà une plage de durée de vie (`lifespan`, ADR 0113), toutes en approximation de
jeu, mais le jeu n'en tirait rien. L'issue demande un âge suivi en jours de jeu, sauvegardé,
une fin de vie douce (mort de vieillesse sans alerte rouge) et un monde neuf inchangé au bit
près (empreintes de non-régression, captures).

## Décision

1. **Durée de vie moyenne** (`sim/aging.ts`) : milieu de la plage `lifespan` de la fiche, en
   années de `DAYS_PER_YEAR` = 365 jours de jeu (`DEFAULT_DAY_LENGTH_SECONDS`, comme les
   saisons, ADR 0186). Tableau dans `docs/ESPECES.md` ; approximations de jeu.
2. **Naissance plutôt qu'âge** : `Fish.bornAt` (secondes simulées, négatif avant la création
   du monde), facultatif. Absent, la naissance vaut `−initialAgeSeconds(graine, id, espèce)` :
   un âge adulte entre 25 et 60 % de la durée de vie moyenne, tiré par hachage. L'âge
   (`ageSeconds`) se déduit du temps du monde : aucun champ n'avance à chaque pas, le monde
   neuf ne porte aucun champ nouveau.
3. **Qui reçoit `bornAt`** : un alevin né en partie (`birthYoungInPlace`, au temps de sa
   naissance) ; un adulte ajouté en cours de partie (`adultBornAt`, âge tiré de la graine à
   partir de l'heure d'ajout ; au temps 0, rien n'est écrit) ; un animal transféré (son âge,
   ramené à l'horloge du bac d'arrivée).
4. **Sauvegarde** : `bornAt` écrit seulement s'il est présent, relu s'il est un nombre fini ;
   **migration** : une sauvegarde antérieure n'en a pas, ses animaux reçoivent l'âge adulte
   tiré de la graine (même règle que le monde neuf), sans changement de schéma.
5. **Fin de vie** : la vitalité (`vitality`) vaut 1 jusqu'à la durée de vie moyenne comprise,
   puis baisse linéairement jusqu'à 0 en 10 % de celle-ci ; le taux de mort de vieillesse est
   `(1 − vitalité) / 5 jours de jeu`, tiré par hachage (graine, pas, animal) comme les autres
   décès. Seulement si la mortalité est activée (`World.mortality`), après les décès de
   faiblesse (`sim/world-deaths.ts`). La vitalité **ne touche pas à la santé** : ni nage
   ralentie, ni alerte de santé ; la fiche dit « le plus âgé est en fin de vie ».
6. **Journal** : le corps d'une mort de vieillesse porte `cause: 'vieillesse'` (sauvegardé) ;
   le journal en tire une ligne neutre « Mort de vieillesse : <espèce> (n animal) », famille
   « Santé », jamais une alerte.
7. **Affichage** : la fiche du panneau « Population » et le wiki ajoutent « Âge dans le bac »
   (du plus jeune au plus âgé, en ans et jours de jeu) et « Durée de vie moyenne », relevés par
   `TankReadoutsController.ages` avec les effectifs et l'eau, changés seulement quand un
   nombre de jours affiché change.

## Options écartées

- **Un champ `age` avancé à chaque pas** : toutes les empreintes et toutes les sauvegardes
  auraient changé, et chaque pas aurait écrit dans chaque animal.
- **Baisser la santé en fin de vie** : la santé déclenche les alertes et ralentit la nage ;
  l'issue demande une fin sans alerte rouge.
- **Âge stocké pour tous les animaux à la sauvegarde** : un monde relu aurait différé du monde
  sauvegardé (champ ajouté), et la règle de migration aurait dû distinguer les deux cas.

## Conséquences

- Empreintes de non-régression : inchangées (aucune durée de vie dépassée en 5 minutes,
  mortalité coupée dans les scénarios). Captures inchangées.
- Un animal ajouté à une ancienne sauvegarde après le temps 0 compte le temps écoulé depuis
  le début du bac en plus de son âge tiré : écart borné par la durée de la partie, accepté.
- Restent hors périmètre : reproduction liée à l'âge, deuil visuel, vieillissement des plantes.
