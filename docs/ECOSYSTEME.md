# Écosystème du bac : population, compatibilités, équilibre

Décision de Mathis du 2026-11-18. Ce document fixe comment le jeu décide **combien
d'animaux tient un bac**, **quelles espèces vont ensemble**, et **ce que chaque élément
apporte à l'équilibre** (plantes, roches, bois, crevettes, escargots, poissons), pour qu'un bac
stable dans la vraie vie le soit dans le jeu, et qu'un bac instable dans la vraie vie le soit
aussi dans le jeu.

Il complète `docs/ESPECES.md` (fiches sourcées), `docs/SOINS.md` (eau, produits, maladies) et
`docs/ARCHITECTURE.md`. Mêmes règles : toute valeur est **sourcée** (référence consultable)
ou marquée **approximation de jeu** ; ce qui n'a pas pu être vérifié est signalé.

## 1. Ce que fait le jeu aujourd'hui (audit du 2026-11-18)

| Sujet                                       | État actuel                                                                                                  | Écart avec la réalité                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Nombre d'animaux                            | Plafond fixe par espèce (`maxPopulation`, 40 néons…) et 60 animaux au total, quel que soit le volume         | Un bac de 30 L accepte autant d'animaux qu'un bac de 300 L                                            |
| Volume conseillé                            | `minLiters` par espèce, simple avertissement à l'ajout                                                       | Pas de volume par animal supplémentaire (le poisson rouge : 100 L, puis 50 L par adulte)              |
| Charge biologique                           | Somme des cubes des longueurs (`waterLoad`) : bonne base                                                     | Unités de jeu, pas de lien avec la nourriture distribuée                                              |
| Compatibilités                              | Tempérament (paisible, territorial, prédateur), classe d'eau, listes de proies : approximations non sourcées | Pas de recouvrement des plages de température, de pH, de dureté ; prédation des crevettes non traitée |
| Plantes                                     | Poussent, se taillent, servent de décor                                                                      | **N'absorbent rien** : les nitrates ne baissent qu'avec un changement d'eau                           |
| Algues                                      | Poussent avec la lumière et les nitrates                                                                     | **Personne ne les mange** : seule la raclette les retire                                              |
| Crevettes, escargots, otocinclus, ancistrus | Présents                                                                                                     | **Aucun rôle** de nettoyage, aucune faim liée aux algues                                              |
| Roches, bois                                | Décor et obstacles                                                                                           | **Aucun effet** sur l'eau (le catappa, lui, agit sur le pH)                                           |
| Concentrations                              | Unités de jeu dans [0, 1]                                                                                    | Impossible de comparer aux kits réels et aux seuils de `docs/SOINS.md` en mg/L                        |

Conséquence : on ne peut construire aucun des bacs équilibrés qui existent en vrai (bac
planté peu peuplé presque sans changement d'eau, bac à crevettes autonome), et rien n'empêche
des bacs impossibles (quatre poissons rouges dans 120 L).

## 2. Ce que disent les sources

### Volume et densité

- **RSPCA** (association britannique de protection animale), « Choosing an aquarium » :
  bac de 40 L au moins (45 × 30 × 30 cm) ; **poissons tropicaux : 1,5 à 2 L d'eau par cm de
  poisson** adulte, queue non comprise ; **poisson rouge : 2 L par 0,5 cm**, soit 4 L par cm,
  et « au moins 60 L chacun » ; bocaux et petits bacs inadaptés (trop instables, pas de
  filtre efficace, peu de surface d'échange).
- **OATA** (association professionnelle britannique), « Goldfish in aquaria » : **100 L pour
  un poisson rouge adulte, puis 50 L par adulte supplémentaire** ; 25 cm en aquarium ; filtre
  toujours indispensable ; comètes et poissons rouges fantaisie à ne pas mélanger (les comètes
  prennent la nourriture des plus lents).
- **Seriously Fish** (fiches par espèce) : dimensions de base minimales et taille de groupe,
  par exemple le néon : 30 mm (longueur standard), base de 60 × 30 cm, groupe de 8 à 10.
- La règle « 1 pouce par gallon » est unanimement critiquée : elle ignore la masse (un
  poisson de 10 cm pèse bien plus que dix de 1 cm) et l'espèce. D'où le choix du jeu : les
  règles par cm restent des **plafonds de bien-être**, et la masse (longueur au cube) pilote la
  pollution.

**Correction sur l'exemple du poisson rouge** : 30 L par poisson rouge ne correspond à aucune
source trouvée. Dans un bac de 120 L : **1 poisson rouge adulte selon l'OATA** (le deuxième
demande 150 L), **2 selon la RSPCA** (60 L chacun). Le jeu suit la règle la plus stricte des
deux sources sérieuses, l'OATA, et affiche le désaccord dans la fiche.

### Pollution produite

- En aquaculture, l'ammoniaque totale produite vaut **3 à 5 % du poids de nourriture** pour une
  nourriture à 30–55 % de protéines (Global Seafood Alliance, « Flow rate estimation for RAS » :
  16 % de la protéine est de l'azote, la moitié n'est pas retenue par le poisson). La
  pollution suit donc **ce qu'on donne à manger**, plus que le nombre de poissons.

### Plantes

- Les plantes absorbent l'azote : **l'ammonium d'abord, le nitrate ensuite**, quand
  l'ammonium manque (études citées sur The Krib, dont Reddy et De Busk, 1985).
- Ordres de grandeur d'absorption d'azote en bacs extérieurs de 700–900 L, en été, en mg par
  m² et par jour (Reddy et De Busk, 1985) : _Egeria densa_ 125, _Lemna minor_ 292, _Salvinia_
  406, _Pistia stratiotes_ 985. Les **plantes flottantes et à croissance rapide** retirent
  beaucoup plus que les plantes lentes. _Egeria_ a retiré 85 à 97 % de nitrates partant de
  1–4 mg/L en 7 jours (Reddy et al., 1987, cité).
- **Méthode Walstad** (_Ecology of the Planted Aquarium_, Diana Walstad) : terre sous le sable,
  beaucoup de plantes, peu de poissons, lumière moyenne, très peu de changements d'eau ; stable
  parce que les plantes absorbent les déchets, nourries par le sol, et concurrencent les algues.
  Un bac **surpeuplé** fait basculer l'équilibre vers les algues.

### Algues et nettoyeurs

- Crevettes naines (_Neocaridina_, _Caridina_) : mangent le biofilm, les jeunes algues et les
  restes de nourriture ; **préviennent** les algues mais ne viennent pas à bout d'une invasion ni
  des algues dures (Garnelio).
- Néritines : mangent les algues vertes en couche et le biofilm ; **ne se reproduisent pas en eau
  douce** (les œufs demandent une eau saumâtre, 5–15 ‰) ; **meurent de faim** quand il n'y a plus
  d'algues sans nourriture d'appoint ; environ **1 pour 20 à 40 L** (Aquarium Breeder).
- Prédation : avec les crevettes, les grands poissons, cichlidés, poissons rouges et grands
  gouramis les mangent « tôt ou tard » ; guppys, rasboras, petits danios, loches kuhli,
  corydoras mangent **au moins les jeunes** ; les otocinclus sont les plus sûrs ; plantes et
  cachettes réduisent les pertes (Practical Fishkeeping).

### Roches et bois

- Roches **calcaires** (calcaire, marbre, travertin, aragonite, roche de corail, « holey rock »,
  pierre Seiryu, coquillages) : relèvent la dureté et le pH vers **7,6–7,9, pas au-delà** ; vite
  avec beaucoup de surface et de courant (corail broyé dans le filtre : quelques jours), en
  quelques **mois** pour un bloc en eau calme ; sans effet au-dessus de pH 8,4. Les autres roches
  courantes (quartz, granit, ardoise, lave, grès) sont **inertes** (aquariumscience.org).
- Aucune roche n'acidifie une eau dure ; **une roche n'apporte pas de filtration notable** : le
  biofilm couvre toutes les surfaces de la même façon, rugueuses ou lisses ; la lave ne retire
  pas les nitrates (aquariumscience.org). Le jeu ne donnera donc **aucun bonus de filtration aux
  roches**.
- Bois flotté : tanins et légère baisse du pH, comme le catappa (**à sourcer**).

## 3. Le modèle du jeu

### 3.1 Capacité du bac

Pour chaque espèce, la fiche porte (sourcé ou approximation) :

| Donnée                                                      | Exemple                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Longueur adulte (standard, sans queue), en cm               | Néon : 3                                                                                                                     |
| Classe de densité                                           | tropical 1,5–2 L/cm ; eau froide 4 L/cm ; invertébré, récif, amphibien (à sourcer ; amphibien : litres d'eau, berge déduite) |
| Volume minimal du bac                                       | Néon : 54 L (base 60 × 30)                                                                                                   |
| Volume par adulte supplémentaire, quand une source le donne | Poisson rouge : 100 L puis 50 L                                                                                              |
| Groupe minimal                                              | Néon : 8                                                                                                                     |

Règles :

1. **Volume minimal** : une espèce ne peut entrer que si le bac a son volume minimal.
2. **Volume par animal** : la somme, sur tous les animaux, de « longueur adulte × litres par cm de
   sa classe » (ou du volume par adulte quand la source en donne un) ne dépasse pas le **volume
   d'eau réel** du bac, décor déduit. Plafond : **1,5 L/cm** pour les tropicaux (borne basse de la
   RSPCA) ; **2 L/cm** affiché comme « conseillé ».
3. **Mode soins** : on ne peut pas dépasser la capacité ; le compteur s'arrête et dit pourquoi
   (« 120 L : un poisson rouge adulte demande 100 L, puis 50 L par poisson en plus (OATA) »).
   **Mode décor** (#278) : aucune contrainte.
4. Les plafonds techniques (nombre d'animaux affichables, performances) restent à part et ne
   sont plus présentés comme des règles de bien-être.
5. Une ancienne sauvegarde qui dépasse la capacité se charge telle quelle, avec une alerte : on
   ne supprime jamais d'animal en silence.

### 3.2 Compatibilités

Verdict par couple d'espèces, avec sa raison : **compatible**, **avec précautions**,
**incompatible**.

- **Eau** : classes différentes (douce, mer, froide) → incompatible ; plages de température,
  pH et dureté **préférées** qui se recouvrent → compatible ; seules les plages **tolérées** se
  recouvrent → précautions ; aucun recouvrement → incompatible.
- **Prédation** : une espèce en mange une autre si la source le dit (liste nominative) ou, à
  défaut, si la proie adulte mesure moins qu'une fraction de sa taille (fraction à sourcer,
  sinon approximation) ; crevettes : listes de Practical Fishkeeping (« mange les adultes »,
  « mange les jeunes », « sûr »).
- **Comportement** : territoriaux entre eux, mangeurs de nageoires avec espèces à longues
  nageoires, nageurs rapides avec nageurs lents (comètes et poissons rouges fantaisie).
- L'interface montre, pour le bac courant, **les espèces encore possibles et combien**
  (capacité restante et compatibilités), et pour chaque refus sa raison.

### 3.3 Rôles dans l'équilibre

| Élément                                                | Effet simulé                                                                                                                                                                                                                   | Base                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Poissons et invertébrés                                | Produisent de l'ammoniaque selon **la nourriture mangée** (3 à 5 % du poids de nourriture) et leur masse au repos. **Fait** (#798, ADR 0168) : 4 % ; au repos, un tiers d'un bac nourri                                        | Global Seafood Alliance ; masse ∝ longueur³ |
| Nourriture non mangée                                  | Se décompose en ammoniaque (#638), **sauf si un charognard la mange avant**                                                                                                                                                    | Existant + Garnelio                         |
| Filtre                                                 | Ammoniaque → nitrites → nitrates, maturation (existant)                                                                                                                                                                        | `docs/SOINS.md`                             |
| Plantes                                                | Absorbent l'ammonium, puis le nitrate, selon leur masse, leur type (flottante, rapide, lente) et la lumière ; poussent si elles trouvent de l'azote ; concurrencent les algues ; servent de refuge (alevins, jeunes crevettes) | Reddy et De Busk ; Walstad                  |
| Algues                                                 | Poussent avec la lumière en excès et les nutriments **laissés par les plantes** ; mangées par les brouteurs                                                                                                                    | Existant + Garnelio                         |
| Brouteurs (néritine, otocinclus, ancistrus, crevettes) | Mangent algues et biofilm selon leur espèce ; **ont faim** s'il n'y en a plus et qu'on ne les nourrit pas                                                                                                                      | Garnelio ; Aquarium Breeder                 |
| Crevettes naines                                       | Se reproduisent ; la colonie se limite d'elle-même (nourriture, place, prédation)                                                                                                                                              | À sourcer (fiche _Neocaridina davidi_)      |
| Néritines                                              | Ne se reproduisent pas en eau douce                                                                                                                                                                                            | Aquarium Breeder                            |
| Roche calcaire                                         | Relève la dureté et tire le pH vers 7,6–7,9, vite ou lentement selon surface et courant                                                                                                                                        | aquariumscience.org                         |
| Roche inerte                                           | Aucun effet sur l'eau ; cachettes et territoires                                                                                                                                                                               | aquariumscience.org                         |
| Bois flotté                                            | Tanins, légère baisse du pH                                                                                                                                                                                                    | À sourcer                                   |
| Changement d'eau                                       | Retire une part de tout ce qui est dissous (existant)                                                                                                                                                                          | —                                           |

### 3.4 Unités réelles et temps long

- Les concentrations passent en **mg/L** (ammoniaque totale, nitrites, nitrates), pour que les
  kits de test, la jauge et les seuils de `docs/SOINS.md` parlent la même langue que la réalité.
  **Fait** (#793, ADR 0167) : facteurs exacts, même dynamique, seuils et correspondance dans
  l'ADR.
- L'équilibre se juge sur des **semaines et des mois** simulés. La partie « eau, plantes,
  algues, faim » doit donc pouvoir avancer seule à **gros pas** (par exemple une minute
  simulée), de façon déterministe, sans le mouvement des animaux ni le rendu, pour que les
  scénarios de la section 4 tournent en quelques secondes dans les tests.
  **Fait** (#799, ADR 0169) : `sim/ecosystem-step.ts`, pas de 5 s, écart au pas fin sous 3 %.

## 4. Scénarios de référence

Bacs inspirés de situations réelles connues. Chacun devient un **test** qui fait tourner le
bac longtemps à gros pas et vérifie l'issue attendue. Un changement qui fait échouer un
scénario est une **régression de réalisme**, au même titre qu'une régression de code. Chaque lot
de la section 5 ajoute les scénarios qu'il rend possibles ; aucun n'est désactivé.

Harnais : `sim/testing/ecosystem-scenario.ts` (bac, volume imposé, entretien, durée → pics,
pire qualité de l'eau, santé, algues) ; tests : `sim/ecosystem-scenarios.spec.ts`.

**État au 2026-11-23** (#799) : S1 et S4 sont verts. **S2 et S12 échouent** avec l'entretien
normal (un repas par minute simulée, 30 % d'eau tous les 7 jours de jeu) : les nitrates
montent trop vite **par jour de jeu** (bac tropical par défaut : environ 8 mg/L par jour, soit
60 par semaine, quand un bac réel en prend quelques-uns) et dépassent 40 mg/L entre deux
changements d'eau. Les durées de l'azote (production, conversion) sont en secondes, calées
sur le tableau de bord, alors que l'entretien et le filtre se comptent en jours de 20 minutes.
Relevés sur 90 jours de jeu :

| Scénario          | Pire qualité | Premier jour « mauvaise » | Pic NH₃/NH₄⁺ | Pic NO₂⁻ | Pic NO₃⁻ | Santé min. | Algues max. |
| ----------------- | ------------ | ------------------------- | ------------ | -------- | -------- | ---------- | ----------- |
| S2 (25 %/semaine) | mauvaise     | 55,5                      | 0,09         | 0,03     | 43,9     | 0,20       | 0           |
| S12 tropical      | mauvaise     | 4,9                       | 0,53         | 0,16     | 100      | 0,20       | 1           |
| S12 bassin        | mauvaise     | 13,3                      | 0,19         | 0,07     | 82,9     | 0,20       | 0           |
| S12 paludarium    | mauvaise     | 62,7                      | 0,09         | 0,03     | 41,6     | 0,20       | 1           |
| S12 récif         | mauvaise     | 18,1                      | 0,19         | 0,06     | 74,6     | 0,20       | 0           |
| S12 eau froide    | à surveiller | —                         | 0,07         | 0,03     | 30,8     | 1          | 1           |

Les rendre verts demande de recaler la production d'azote sur le jour de jeu (environ ÷ 8 pour
le bac tropical), en gardant S1 (bocal toxique en quelques jours) et S4 (pics du cyclage au-dessus
des seuils « à surveiller ») : changement de comportement de tout le jeu, à faire dans sa propre
issue, avec ses empreintes.

| #   | Bac                                                                                                                   | Issue attendue                                                                   | Pourquoi                                               |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| S1  | Bocal de 10 L, un poisson rouge, sans filtre                                                                          | **Instable** : ammoniaque toxique en quelques jours, poisson malade              | RSPCA : bocaux inadaptés                               |
| S2  | 120 L filtré et mûr, un poisson rouge, 25 % d'eau changée par semaine                                                 | **Stable** sur 3 mois                                                            | OATA                                                   |
| S3  | 120 L, deuxième poisson rouge                                                                                         | **Refusé** par la capacité (mode soins)                                          | OATA : 150 L pour deux                                 |
| S4  | Bac neuf non cyclé rempli d'un coup                                                                                   | **Pic** d'ammoniaque puis de nitrites les premières semaines                     | `docs/SOINS.md`                                        |
| S5  | 60 L très planté (plantes rapides et flottantes), peu peuplé (10 néons), nourrissage léger, **sans changement d'eau** | **Stable** : nitrates bas, pas d'algues                                          | Walstad                                                |
| S6  | Le même sans plantes                                                                                                  | Nitrates qui montent sans cesse, algues ; **instable** en quelques mois          | Plantes absentes                                       |
| S7  | Le même surpeuplé (construit directement par le test, au-delà de la capacité)                                         | Algues et nitrates qui montent malgré les plantes                                | Walstad : le surpeuplement fait basculer               |
| S8  | 30 L planté, crevettes _Neocaridina_ et une néritine, nourrissage léger                                               | **Stable** ; la colonie de crevettes grandit puis se stabilise                   | Bacs à crevettes courants (à sourcer)                  |
| S9  | Crevettes avec des poissons rouges                                                                                    | Les crevettes disparaissent                                                      | Practical Fishkeeping                                  |
| S10 | Néritines dans un bac sans algues, jamais nourries                                                                    | Faim, puis mort                                                                  | Aquarium Breeder                                       |
| S11 | Roche calcaire dans un bac de néons en eau douce                                                                      | pH tiré vers 7,6–7,9 en quelques semaines ou mois ; néons en limite de tolérance | aquariumscience.org ; Seriously Fish (néon : pH 4–7,5) |
| S12 | Bac par défaut de chaque environnement, entretien normal                                                              | **Stable**                                                                       | Le jeu doit être jouable tel qu'il démarre             |

## 5. Mise en œuvre

Issues `idee-mathis` #727 à #733, dans cet ordre, après le chantier d'interface (#721 à #725) et les lots 12 et 13 de #686 (#698, #699). Chaque lot garde les règles du projet : données sourcées
ou marquées, tests de cas limites, empreintes de non-régression mises à jour **seulement** pour
le changement voulu et expliquées dans la PR, sauvegardes anciennes toujours lisibles.

1. #727 — **Données par espèce** : longueur adulte, classe de densité, volume minimal, volume par
   adulte supplémentaire, groupe, plages préférées et tolérées (température, pH, dureté),
   régime (algues, biofilm, restes), prédation, comportement ; sources dans `docs/ESPECES.md`.
2. #728 — **Unités réelles et pas long** : concentrations en mg/L, pollution liée à la nourriture,
   avance à gros pas déterministe, harnais des scénarios (S1, S2, S4, S12).
3. #729 — **Capacité du bac** : règles 3.1, compteurs bornés en mode soins, raisons affichées,
   occupation dans le bilan du bac (S3).
4. #730 — **Compatibilités sourcées** : règles 3.2, verdicts et raisons, espèces encore possibles.
5. #731 — **Plantes actives** : absorption, croissance liée à l'azote, concurrence avec les algues,
   refuges (S5, S6, S7).
6. #732 — **Nettoyeurs et chaîne alimentaire** : brouteurs, charognards, faim, reproduction et
   autorégulation des crevettes (S8, S9, S10).
7. #733 — **Roches et bois** : matière de chaque élément de décor, effets sur la dureté et le pH (S11).

## Sources

- RSPCA, « Choosing an aquarium » : https://www.rspca.org.uk/adviceandwelfare/pets/fish/environment
- OATA, « Goldfish in aquaria » : https://ornamentalfish.org/wp-content/uploads/Goldfish-in-aquaria.pdf
- Seriously Fish, _Paracheirodon innesi_ : https://seriouslyfish.com/species/paracheirodon-innesi
- Global Seafood Alliance, « Flow rate estimation for RAS » : https://www.globalseafood.org/advocate/flow-rate-estimation-for-ras/
- The Krib, « Nitrate consumption » (Reddy et De Busk, 1985 ; Reddy et al., 1987 ; autres) : https://thekrib.com/Plants/Fertilizer/nitrate-chart.html
- Fish Tank Advisor, « Walstad method » (d'après D. Walstad, _Ecology of the Planted Aquarium_) : https://fishtankadvisor.com/walstad-method/
- Garnelio, « Shrimp and snails as a cleanup crew » : https://www.garnelio.de/en/blog/invertebrates/the-invertebrate-algae-police-shrimp-and-snails-as-a-cleanup-crew
- Aquarium Breeder, « Nerite snails » : https://aquariumbreeder.com/nerite-snails-detailed-guide-care-diet-and-breeding/
- Practical Fishkeeping, « What can I keep with shrimp? » : https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/
- aquariumscience.org, « Rocks » : https://aquariumscience.org/index.php/14-3-rocks

Sources secondaires (associations, sites spécialisés, compilations de forums citant des
études) : à recouper avec une source primaire quand il en existe une, comme le demande
`docs/ESPECES.md`.
