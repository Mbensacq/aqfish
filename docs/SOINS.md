# Soins, produits, maladies et paramètres d'eau — référentiel de départ

Ce document sert de **point de départ** aux agents pour l'épopée « aquarium éducatif » (issue
#229) : produits, traitements, maladies, paramètres d'eau et règles de simulation. Il vient
d'une recherche documentaire du 2026-10-26 (sources en fin de fichier).

## Comment l'utiliser (consigne aux agents)

1. **Ce n'est ni complet ni définitif.** Chaque agent qui s'en sert doit **chercher plus loin**
   : recouper chaque valeur avec une source fiable (manuel vétérinaire, vulgarisation
   universitaire, étude publiée, fiche du fabricant pour les doses d'étiquette, FishBase pour les
   espèces), compléter les « non vérifié » de la section 15, et corriger ce document quand une
   source le contredit (dans la même PR, avec la source).
2. **Jamais de valeur inventée.** Une donnée sans source consultable est marquée
   « approximation de jeu » dans le code, la fiche et ce document. Les désaccords entre sources
   sont écrits tels quels, pas arbitrés en silence.
3. **Les sources secondaires** (boutiques, forums, blogs, sites de fabricants pour autre chose
   qu'une dose d'étiquette) ne suffisent pas : elles sont marquées « secondaire » dans la
   bibliographie et doivent être remplacées par une source primaire dès que possible.
4. **Les règles de la section 12** sont des **simplifications de jeu** : cohérentes avec les
   sources, mais ce ne sont pas des données biologiques. Les distinguer dans le code.
5. **Ce n'est pas un avis vétérinaire.** L'application l'affiche en permanence (section
   « Recommandations »). Un poisson réellement malade justifie un vétérinaire.
6. Rappel du projet : aucune mention d'outil ou de société d'IA dans le dépôt (`CLAUDE.md`).

Contrôle fait à la création du document : la formule de la section 3 (fraction d'ammoniaque non
ionisée) reproduit la table de Boyd à l'arrondi près (ex. 26 °C, pH 8,0 : 0,0574 contre 0,057 ;
20 °C, pH 9 : 0,284 contre 28,4 %).

## Conventions

- mg/L = ppm ; ‰ = g/L = ppt ; 1 % de sel = 10 g/L.
- Les kits donnent souvent NO₂-N et NO₃-N : multiplier par 3,3 et 4,4 pour NO₂ et NO₃ (Merck).
- **non vérifié** : introuvable dans une source fiable ; **simplification de jeu** : règle de code.

## Résumé

- Le moteur de la simulation doit être la **qualité d'eau**, pas la pharmacie : la fraction
  toxique d'ammoniaque (NH₃) dépend du pH et de la température (≈ 0,9 % de l'ammoniaque totale à
  pH 7,2 et 26 °C, ≈ 5,7 % à pH 8,0 et 26 °C), le nitrite est toxique dès 0,1 mg/L et se
  neutralise par les chlorures (Cl⁻:NO₂⁻ de 6:1 à 10:1), un biofiltre neuf demande 6 à 8
  semaines.
- Les traitements ont des fenêtres étroites et des interactions : formol 15–25 mg/L en bain
  prolongé, permanganate 2 mg/L, cuivre libre 0,15–0,20 mg/L en eau de mer (mortel pour les
  invertébrés, inhibe la nitrification à 0,3 mg/L), praziquantel 5 mg/L, sel de 1–5 g/L (bain
  long) à 30 g/L (trempage de quelques minutes). Le charbon actif retire la plupart des
  médicaments.
- France/UE : les antimicrobiens vétérinaires sont soumis à ordonnance (règlement UE 2019/6). Le
  vert de malachite est interdit pour les animaux de consommation mais vendu légalement pour les
  poissons d'ornement. **Il n'existe pas de collyre standard pour poissons.**

## 1. Tableaux par catégorie

### 1.1 Préparation de l'eau

| Produit | Usage | Dose | Effet sur l'eau | Risques | Source |
|---|---|---|---|---|---|
| Conditionneur au thiosulfate de sodium (déchloreur simple ; compositions des marques non vérifiées) | Neutraliser chlore et chloramine | Selon étiquette | Chlore → 0 ; avec la chloramine, libère de l'ammoniaque | Pic d'ammoniaque dans un bac sans biofiltre mûr si chloramine | Merck (maladies environnementales) |
| Conditionneur liant l'ammoniaque (type Seachem Prime) | Déchlorer, déchloraminer, détoxifier temporairement NH₃/NO₂ | 5 mL / 200 L ; double dose si chloramine élevée ; jusqu'à 5× en urgence nitrite ; ½ dose si > 30 °C | Retire ≈ 1 mg/L d'ammoniaque, 4 mg/L de chloramine ou 5 mg/L de chlore par dose (texte d'étiquette reproduit par un revendeur) ; détoxification ≈ 48 h revendiquée, non vérifiée de façon indépendante | Fausse lecture élevée d'ammoniaque avec les tests de Nessler | Étiquette Seachem via revendeurs (secondaire) ; UF/IFAS FA16 |
| Bactéries nitrifiantes (Stability, Quick Start, SafeStart, Denitrol…) | Accélérer le cyclage | Stability : 5 mL/40 L le 1er jour puis 5 mL/80 L/jour 7 jours ; Quick Start : 10 mL/38 L (sources secondaires) | Aucun effet chimique immédiat | Efficacité variable, non vérifiée de façon indépendante | Étiquettes via revendeurs (secondaire) |
| Eau osmosée / déminéralisée | Baisser GH/KH, eau de récif | — | GH, KH, conductivité ≈ 0 | Jamais pure pour des poissons ni des amphibiens | UF/IFAS VM86 ; Merck |
| Reminéralisants GH/KH | Remonter GH/KH d'une eau osmosée | non vérifié | ↑ GH, ↑ conductivité | — | non vérifié |

### 1.2 pH, KH, GH, conductivité

| Produit | Usage | Dose | Effet sur l'eau | Risques | Source |
|---|---|---|---|---|---|
| Bicarbonate de sodium | Remonter KH et pH | ≈ 30 mg/L par +1 °dKH (calcul stœchiométrique, pas une dose d'étiquette) | ↑ KH, ↑ pH (plafonne vers 8,2–8,3), ↑ sodium | Hausse de pH = ↑ NH₃ toxique | Calcul (1 °dKH = 17,8 mg/L CaCO₃) |
| Corail concassé / aragonite | Tampon lent | non vérifié | ↑ KH, ↑ GH lentement | Inadapté aux poissons d'eau douce et acide | non vérifié |
| Feuilles de catappa (badamier) | Tanins, légère acidification, eau ambrée | Seachem : 1–2 feuilles / 20 L | ↓ pH modeste, amorti par le KH ; coloration brune | Effet fort seulement en eau peu tamponnée | Seachem ; Nugroho et al. |
| Bois (mopani, racines), cônes d'aulne, tourbe, acides humiques | Eau « blackwater » | non vérifié | ↓ pH, ↓ KH (tourbe), couleur | Crash de pH si KH très bas | non vérifié |
| CO₂ (plantes) | Fertilisation | non vérifié | ↓ pH | CO₂ > 40 mg/L toxique ; attention la nuit | Merck |
| Tampons commerciaux pH Up/Down | Corriger le pH | non vérifié | Variable ; certains « pH Down » seraient phosphatés (marque précise non vérifiée) | Yo-yo de pH, algues si phosphates | non vérifié |

### 1.3 Sels et minéraux

| Produit | Usage | Dose | Effet sur l'eau | Risques | Source |
|---|---|---|---|---|---|
| Sel non iodé (NaCl) | Parasites externes, stress, nitrite | 0,1–0,3 % transport ; 0,5–1 % bain de plusieurs heures ; 3 % trempage 30 s–10 min ; 5 g/L une semaine à ≥ 24 °C contre l'ich si l'espèce le tolère | ↑ conductivité, ↑ chlorure ; ne s'évapore pas | Tétras et poissons électriques ; corydoras et loches (sensibilité citée par l'usage, non vérifiée) | UF/IFAS VM86 ; Merck |
| Sel contre le nitrite | Prévenir/traiter la méthémoglobinémie | Chlorure ≥ 6× (UF/IFAS) à ≥ 10× (SRAC) le nitrite | ↑ Cl⁻ | Idem | UF/IFAS ; SRAC 462 |
| Chlorure de calcium | Chlorure + calcium | non vérifié | ↑ GH, ↑ Cl⁻ | — | Practical Fishkeeping (vulgarisation, secondaire) |
| Sulfate de magnésium (sel d'Epsom) | Soutien (constipation, œdème) selon l'usage amateur | **non vérifié** (seule donnée : bain court 30 g/L MgSO₄ + 7 g/L NaCl, 5–10 min, cas unique cité par un blog) | ↑ GH (Mg), ↑ conductivité | Hypermagnésémie possible | Source secondaire |
| Sel de mer synthétique (récif) | Eau de mer | Viser 35 ‰ (densité ≈ 1,026) | Na, Cl, Mg, Ca, KH… | Ne jamais utiliser du sel de table en récif | Holmes-Farley ; UF/IFAS |

### 1.4 Médicaments et antiparasitaires

| Produit | Usage | Dose | Effet sur l'eau | Risques | Source |
|---|---|---|---|---|---|
| Formol (formaline 37 %) | Protozoaires, monogènes, oomycètes | 15–25 mg/L bain prolongé (25 mg/L = 1 mL/10 gal US) ; ½ dose 12,5 mg/L espèces sensibles ; 250 mg/L 30 min max (≤ 170 mg/L > 25 °C) | Consomme l'oxygène | Cancérogène ; paraformaldéhyde si stocké < 7 °C ; fausse lecture NH₃ (Nessler) | Merck ; UF/IFAS FA006 |
| Vert de malachite | Ich, protozoaires, champignons | 0,10 mg/L bain indéfini ; ou 0,05–0,2 mg/L + formol 15–50 mg/L | Colore l'eau | Cancérogène ; interdit pour les poissons de consommation (UE, FDA) | Texas A&M CIR920 ; aquariumscience.org ; EFSA |
| Sera costapur | Ich, protozoaires | 1 mL / 40 L jours 1 et 3 (+5 et 7 si grave) | Formaldéhyde 20,6 mg/mL + oxalate de vert de malachite 1,8 mg/mL | Médicament vétérinaire sans ordonnance pour poissons d'ornement (fiche UE) | Notice Sera ; base UE |
| Sulfate de cuivre (eau douce) | Ich, protozoaires, algues | mg/L CuSO₄ = alcalinité totale / 100 ; jamais si alcalinité < 50 mg/L | — | Toxique pour invertébrés, escargots, amphibiens ; mortel en eau douce acide ou douce | Merck ; Texas A&M |
| Cuivre libre (eau de mer : Cupramine, sulfate de cuivre) | Cryptocaryon, Amyloodinium | Cu²⁺ 0,15–0,20 mg/L atteint en 2–4 jours, maintenu 3–6 semaines ; Cupramine 0,5 mg/L (0,25 en eau douce) 14 jours | Inhibe la nitrification à 0,3 mg/L | Invertébrés et coraux tués ; certains poissons meurent < 0,15 mg/L | Merck ; UF/IFAS FA164/FA165 ; Seachem |
| Permanganate de potassium | Protozoaires, bactéries, champignons externes | 2 mg/L (≥ 4 h) ; ajouter par paliers de 2 mg/L selon la demande en permanganate | Eau rose → brune quand il est consommé | Pas plus d'une fois par semaine ; plus toxique en eau salée, déconseillé en marin | Merck ; Texas A&M |
| Peroxyde d'hydrogène 35 % | Columnaris externe, branchies, œufs (Saprolegnia) | Dose pour poissons d'ornement : non vérifiée | Libère de l'oxygène | Espèces sensibles | Merck |
| Praziquantel (Sera, JBL, eSHa, PraziPro…) | Monogènes (Dactylogyrus, Gyrodactylus), cestodes | 5 mg/L bain prolongé | Aucun | Large marge de sécurité rapportée (étude vietnamienne : 2,5–10 mg/L sans effet visible 72 h) | Merck |
| Métronidazole (Seachem MetroPlex) | Hexamita, flagellés intestinaux | Merck : 50 mg/kg PO 5 jours dans la nourriture ; MetroPlex : 1–2 mesures / 40 L toutes les 48 h jusqu'à 3 semaines | — | Antimicrobien : ordonnance en UE (section 7) | Merck ; Seachem |
| Kanamycine (Seachem KanaPlex) | Bactéries Gram− | 1 mesure / 20 L toutes les 48 h, 3 doses max | — | Antibiotique : ordonnance en UE | Seachem |
| Oxytétracycline | Gram−, columnaris | 55–83 mg/kg/jour 10 jours (aliment) | — | Résistances fréquentes ; ordonnance | Merck |
| Florfénicol | Columnaris systémique, streptocoques | Aliment médicamenteux | — | Ordonnance | Merck |
| Érythromycine | Gram+ (Streptococcus) | 100 mg/kg 10–21 jours (aliment, aquaculture) | — | Ordonnance ; appétence | Merck |
| Nifurpirinol (Sera Baktopur Direct, JBL Furanol, Furapond, Aquafuran) | Infections bactériennes externes | Baktopur Direct 0,55 mg/L ; Furanol 0,17–0,25 mg/L (bains longs) | Nuit aux bactéries du filtre (FAQ JBL) | Statut de vente libre contesté (section 7) | Vetofish ; JBL |
| Acriflavine (Sera mycopur, avec cuivre selon revendeurs) | Champignons, frai | 1 mL / 20 L / jour, 3 jours | Colore | Cuivre → invertébrés | Notice Sera |
| JBL Ektol fluid (chlorure de benzalkonium + bleu de méthylène) | Bactéries externes | 10 mL / 50 L ; demi-dose si KH < 8 °dKH | Colore en bleu | — | JBL |
| JBL Punktol Plus | Ich | 10 mL / 100 L, tous les 2 jours pendant ≈ 15 jours (8 doses) ; « sans cuivre » | — | Principe actif non publié | JBL |
| Diflubenzuron / lufénuron | Argulus, Lernaea | Lufénuron ≈ 0,1 mg/L (cas clinique koï) | — | Tue tous les crustacés (crevettes) ; diflubenzuron : pesticide restreint aux États-Unis | Merck ; cas clinique |
| Chloroquine | Cryptocaryon | 10 mg/L 2–3 semaines | — | Usage vétérinaire | UF/IFAS FA164 |
| Itraconazole | Chytridiomycose (amphibiens) | 0,01 % bain 5 min/jour 10–11 jours (Merck) ; 0,0025 % 6 jours efficace (étude PMC) | — | Toxique pour les têtards ; mortalité chez certaines espèces à 0,01 % | Merck ; PMC4151600 |
| API Melafix (huile de mélaleuca 1 %) | « Antibactérien naturel » | 5 mL / 38 L / jour, 7 jours | — | Efficacité non démontrée dans les sources consultées : classer en « croyance » | Étiquette API (DailyMed) |

### 1.5 Entretien et équipement

| Produit | Usage | Dose | Effet sur l'eau | Risques | Source |
|---|---|---|---|---|---|
| Charbon actif | Retirer médicaments, colorants, tanins, chlore | — | ↓ médicaments, ↓ couleur | À retirer pendant tout traitement | Merck (amphibiens) ; PubMed 18817004 |
| Tests réactifs liquides / bandelettes | Mesurer NH₃/NH₄⁺, NO₂, NO₃, pH, KH, GH, Cl₂, Cu | — | — | Nessler faussé par formol et conditionneurs ; préférer salicylate | UF/IFAS FA16 ; Merck |
| Aération / pompe à air | O₂, dégazage du CO₂ | — | ↑ O₂, ↓ CO₂, ↑ pH léger | Sursaturation si fuite d'air côté aspiration | Merck |
| Chauffage / refroidisseur | Température stable | — | — | Panne de thermostat : mortalité | Merck |
| Stérilisateur UV | Eau verte, pathogènes libres | non vérifié | — | Peut dégrader certains médicaments (non vérifié) | non vérifié |
| Bac de quarantaine / hôpital | Isoler les nouveaux venus, traiter | 4–6 semaines (koï), 30 jours | — | — | UC Davis ; gouvernement de Colombie-Britannique ; Merck |

## 2. Préparation de l'eau

**Chlore et chloramine.** Selon le Merck, ces désinfectants de l'eau du robinet sont « hautement
toxiques pour les poissons » : effets nocifs dès 0,02 mg/L de chlore, mortalité à 0,04 mg/L.

- La chloramine est du chlore stabilisé par l'ammoniaque : neutralisée au thiosulfate de sodium,
  elle libère l'ammoniaque. Dans un bac neuf, des changements d'eau répétés peuvent donc faire
  monter l'ammoniaque ; un conditionneur qui lie aussi l'ammoniaque évite ce piège.
- Tester le chlore libre **et** total : une eau chloraminée donne un chlore libre nul mais un
  chlore total élevé.
- Intoxication chronique : nageoires effilochées, excès de mucus, yeux troubles, léthargie.

Pour le jeu :
- chaque changement d'eau du robinet non traitée ajoute du chlore ; la teneur dépend de la ville
  et n'a pas été vérifiée pour la France : en faire un réglage ;
- un conditionneur ramène le chlore à 0 instantanément ;
- si chloramine, ajouter une quantité équivalente d'ammoniaque (simplification), sauf si le
  produit « lie l'ammoniaque » ;
- l'ammoniaque « liée » par Prime reste mesurée par les tests au Nessler (faux positif), pas par
  ceux au salicylate (UF/IFAS).

**Cyclage.** Un biofiltre neuf demande 6 à 8 semaines pour réduire efficacement ammoniaque et
nitrite (UF/IFAS FA16). Les bactéries ont besoin d'oxygène et d'alcalinité et cessent d'être
efficaces sous 20 mg/L d'alcalinité totale. La nitrification produit des ions H⁺ et consomme
l'alcalinité : baisse progressive du pH (« old tank syndrome »). En cas d'ammoniaque : réduire
ou arrêter la nourriture 1 à 3 jours, changer 25–50 % de l'eau, garder l'oxygène > 5 mg/L.

## 3. pH, KH, GH, conductivité

**Plages cibles.** Eau douce 6,5–9,0, eau de mer 7,8–8,3 (Merck) ; récif 7,8–8,5, idéalement
8,1–8,3 (Holmes-Farley). Selon VIN/WSAVA 2019, la plupart des poissons d'eau douce s'adaptent à
des changements lents tant que le pH reste entre 5,5 et 8,5.

**Vitesse de variation tolérée** : aucune valeur chiffrée fiable trouvée (non vérifié). Donnée
apparentée : la température d'un bassin à koïs ne devrait idéalement pas varier de plus de 3 °C
par jour (VIN/WSAVA 2019).

**Crash de pH.** La nitrification consomme l'alcalinité ; quand elle tend vers 0, le pH chute
« significativement et rapidement », tuant poissons et bactéries (UF/IFAS, Merck). « Old tank
syndrome » (Merck) : alcalinité ≈ 0, pH < 6, ammoniaque totale élevée, léthargie, inappétence.

**Fraction d'ammoniaque sous forme NH₃** (fraction décimale de l'ammoniaque totale ; Boyd, Global
Seafood Alliance, d'après Emerson et al. 1975) :

| pH \ °C | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 30 | 32 |
|---|---|---|---|---|---|---|---|---|---|
| 7,2 | 0,004 | 0,005 | 0,006 | 0,007 | 0,008 | 0,009 | 0,011 | 0,012 | 0,015 |
| 7,6 | 0,011 | 0,013 | 0,015 | 0,017 | 0,020 | 0,023 | 0,027 | 0,031 | 0,036 |
| 8,0 | 0,028 | 0,033 | 0,038 | 0,043 | 0,049 | 0,057 | 0,065 | 0,075 | 0,087 |

À pH 9 et 20 °C, 28,4 % de l'ammoniaque totale est sous forme NH₃ (New Mexico State University,
d'après Francis-Floyd et al.). NH₃ non ionisé ≈ 100 fois plus toxique que l'ammonium : lésions
au-delà de 0,05 mg/L, mort des poissons sensibles vers 2,0 mg/L (UF/IFAS FA16).

Conséquence pour le jeu : 1 mg/L d'ammoniaque totale est presque inoffensif dans un bac de néons
à pH 6,5, mais dangereux dans un bac de guppys à pH 8 et 28 °C (≈ 0,065 mg/L de NH₃). Remonter
brusquement le pH d'un bac chargé en ammoniaque est dangereux.

**Formule pour le code (simplification de jeu)** : fraction NH₃ = 1 / (1 + 10^(pKa − pH)), avec
pKa = 0,09018 + 2729,92 / T(K) (forme d'Emerson et al. 1975, constantes citées de mémoire par la
recherche, puis recoupées avec la table ci-dessus ; à confirmer dans l'article d'origine).

**Acidifiants naturels.**
- *Feuilles de catappa* : Seachem indique qu'elles libèrent « des tanins et d'autres composés
  organiques qui aident à maintenir un pH plus bas et teintent doucement l'eau », 1–2 feuilles
  pour 20 L. Étude sur le Betta (Nugroho et al., Biosaintifika) : pH 6,73 avec un extrait à
  960 ppm ; un autre chiffre (pH 5,05 à 625 ppm) circule via un site secondaire. Les deux sont
  incohérents : à vérifier dans l'article. Effet réel mais modeste, fortement amorti par le KH.
- *Bois, aulne, tourbe, acides humiques* : effets qualitatifs connus, aucune quantification
  fiable trouvée (non vérifié).

**Alcalinisants.**
- *Bicarbonate de sodium* : calcul stœchiométrique (1 °dKH = 17,8 mg/L CaCO₃ = 0,357 mmol/L de
  HCO₃⁻, soit ≈ 30 mg/L de NaHCO₃).
- *Corail / aragonite* : dissolution lente, d'autant plus forte que le pH est bas ; non quantifié.

**Conversions de dureté (standard).** 1 °dGH = 10 mg/L de CaO = 17,8 mg/L CaCO₃ ; 1 °dKH =
17,8 mg/L CaCO₃ ; 1 meq/L d'alcalinité = 2,8 °dKH = 50 mg/L CaCO₃ (cohérent avec Holmes-Farley :
2,5–4 meq/L = 7–11 dKH = 125–200 mg/L CaCO₃).

## 4. Sels et minéraux

**Sel non iodé (NaCl)** (UF/IFAS, Francis-Floyd, VM86) :
- trempage à 3 % (30 g/L) de 30 s à 10 min, en retirant le poisson dès qu'il perd l'équilibre et
  se retourne ;
- bain de 0,5–1 % de 30 min à plusieurs heures ;
- 0,1–0,3 % (1–3 g/L) pour le transport et la manipulation ;
- 0,01–0,2 % (0,1–2 g/L) en traitement permanent en circuit fermé.

Autres données :
- les tétras ne tolèrent pas bien le sel, ni les poissons à sens électrique (UF/IFAS) ;
- contre l'ich : 5 g/L pendant une semaine à ≥ 24 °C « si l'espèce le tolère » (Merck) ;
- étude PMC12178657 : bain à 30 g/L pendant 30 min à 20 °C, stress léger et de courte durée,
  rétablissement complet (auteurs et espèce non confirmés) ;
- sensibilité des corydoras, loches, crevettes, escargots et plantes : affirmée par les sources
  amateurs, **non vérifiée** ici. À coder comme « prudence », pas comme seuil chiffré.

**Sel et nitrite.** Pour la maladie du sang brun, UF/IFAS conseille 6 mg/L de chlorure par mg/L
de nitrite, et en prévention au moins 20 mg/L de chlorure en étang ; le SRAC recommande au moins
10:1 (un document Texas A&M indique 9:1). D'après Boyd, 1 g de NaCl par m³ ajoute 0,61 mg/L de
chlorure, donc **1 g/L de NaCl ≈ 610 mg/L de Cl⁻**. Exemple : 2 mg/L de nitrite → 12–20 mg/L de
chlorure → environ 0,02–0,03 g/L de sel : très peu. Les poissons atteints récupèrent vite dans
une eau pauvre en nitrite mais restent plus sensibles aux infections bactériennes pendant 1 à 3
semaines (SRAC).

**Chlorure de calcium.** Practical Fishkeeping (vulgarisation) : pourrait agir aussi bien, voire
mieux, que le NaCl contre le nitrite (le calcium diminue la perméabilité des branchies). Dose non
vérifiée.

**Sel d'Epsom (MgSO₄).** Aucune dose de bac faisant autorité trouvée ; les doses de forum
(≈ 1 cuillère à café pour 19 L) sont non vérifiées. Dans le jeu : « soutien, preuves faibles »,
jamais traitement curatif.

## 5. Maladies d'eau douce et traitements

Principe (Merck) : bains et traitements topiques pour les infections externes ; nourriture
médicamenteuse et injection pour les infections internes. Le diagnostic réel passe par l'examen
microscopique d'un raclage de mucus ou d'une biopsie de branchie.

### 5.1 Points blancs (Ichthyophthirius multifiliis)
- **Symptômes** : points blancs sur la peau et les nageoires (aucun si seules les branchies sont
  atteintes), mortalité soudaine élevée (Merck).
- **Cycle** : un traitement ne tue que les formes libres (thérontes) ; d'où des traitements
  répétés : en eau froide, au minimum 5 traitements espacés de 3 à 5 jours (Texas A&M CIR920).
- **Traitements sourcés** : formol 25 mg/L, ou 12,5 mg/L pour les espèces sensibles (UF/IFAS
  FA006) ; sulfate de cuivre selon l'alcalinité (pas sous 50 mg/L) ; permanganate 2 mg/L, au
  maximum 3 applications (6 mg/L cumulés) ; vert de malachite 0,10 mg/L en bain indéfini, ou
  0,2 mg/L + formol 25 mg/L ; sel 5 g/L une semaine à ≥ 24 °C (Merck). Cuivre seul : thérontes
  tués dès 0,05 mg/L, mais plus faible concentration efficace en traitement réel : 0,4 mg/L de
  CuSO₄ (étude citée par aquariumscience.org, secondaire).
- **Rythme selon la température** (aquariumscience.org, secondaire) : au-dessus de 24 °C,
  traiter chaque jour ; de 19 à 23 °C, au minimum un jour sur deux.
- **Sans traitement** : mortalité soudaine et élevée (Merck).

### 5.2 Velours (Oodinium / Piscinoodinium ; Amyloodinium en mer)
En mer : cuivre libre 0,15–0,20 mg/L (UF/IFAS FA165). En eau douce : traitements spécifiques
non vérifiés.

### 5.3 Costia, Chilodonella, Trichodina
Signes : respiration rapide, « piping » en surface, excès de mucus, frottements (flashing),
amaigrissement. Traitement : formol ou CuSO₄ en eau douce ; formol ou Cu²⁺ en mer (Merck). Le sel
à 0,5–1 % en bain de plusieurs heures élimine certains protozoaires externes (UF/IFAS).

### 5.4 Vers plats branchiaux et cutanés (Dactylogyrus, Gyrodactylus)
Gyrodactylus est vivipare (peau, yeux) ; les ancyrocéphalidés pondent des œufs et parasitent les
branchies. Signes : excès de mucus, frottements, amaigrissement ; poissons rouges et koïs
prédisposés. Traitement de choix : praziquantel 5 mg/L en bain prolongé ; formol en alternative.
Les organophosphates (0,25 mg/L) sont abandonnés au profit du praziquantel (Merck).

### 5.5 Vers de l'ancre (Lernaea) et poux (Argulus)
Crustacés avec stades libres. Merck : diflubenzuron (restreint aux États-Unis). Mayer et al.
(Journal of Exotic Pet Medicine, 2013), koïs avec Argulus : lufénuron, un comprimé de 409,8 mg
pour 3 785 L (≈ 0,1 mg/L), une fois par semaine pendant 5 semaines, sans réapparition pendant
plus de 13 mois. Ces produits tuent tous les crustacés (crevettes) ; le praziquantel n'agit pas
sur eux.

### 5.6 Champignons (Saprolegnia, oomycètes)
Formol : « une certaine efficacité » (Merck) ; peroxyde d'hydrogène approuvé par la FDA contre
la saprolégniose des œufs (Merck) ; acriflavine (Sera mycopur : 1 mL/20 L/jour, 3 jours).
Facteur favorisant sourcé : une température basse ou inadaptée (Merck).

### 5.7 Pourriture des nageoires, columnaris, Aeromonas, hydropisie
- Aeromonas est l'infection bactérienne la plus courante des poissons d'aquarium d'eau douce
  (Merck). Signes : taches de sang, ulcères, abdomen gonflé (« hydropisie », écailles en pomme
  de pin), nageoires effilochées, yeux exorbités. Le choix de l'antibiotique demande un test de
  laboratoire (Merck).
- Columnaris (Flavobacterium columnare) : lésions cotonneuses ou visqueuses, « dos de selle ».
  Au début : permanganate ou peroxyde d'hydrogène ; si systémique : florfénicol ou
  oxytétracycline. Prévention : réduire la charge organique, éviter les blessures (Merck).
- Antibiotiques en aliment (Merck) : oxytétracycline 55–83 mg/kg/jour 10 jours ; érythromycine
  pour les Gram+.
- Pour le jeu : l'hydropisie avancée est un stade terminal à pronostic réservé. Enseigner que la
  cause est le stress et l'eau, et que le traitement réel passe par un vétérinaire.

### 5.8 Exophtalmie et yeux troubles : la question du « collyre »
Il n'existe **pas de collyre standard** pour poissons dans les sources vétérinaires consultées.
- **Causes (Merck)** : infection systémique, mauvaise qualité d'eau, sursaturation gazeuse (bulles
  dans la cornée, les nageoires, les branchies), traumatisme. Exposition chronique au chlore :
  cornées troubles.
- **Traitement selon la cause** : sursaturation → aération vigoureuse (causes typiques : pompe
  défectueuse, remplissage au tuyau immergé) ; cause bactérienne → antibiotique choisi par un
  vétérinaire ; cornée trouble due au chlore ou à l'eau → corriger l'eau.
- **Recherche uniquement** : acétazolamide en injection péribulbaire (6 mg/kg) et dorzolamide en
  collyre, testés chez le pacu, ont donné des résolutions temporaires (travaux IAAAM, archives
  VIN) : actes vétérinaires expérimentaux, pas des produits d'animalerie.
- **Cataracte** : pas de traitement hors chirurgie ; douves oculaires : aucun médicament prouvé
  (Merck). Sel d'Epsom contre le pop-eye : pratique amateur, non vérifiée.

### 5.9 Hexamita, vers intestinaux
Métronidazole dans la nourriture, 50 mg/kg pendant 5 jours (Merck) ; MetroPlex en bain selon
Seachem. Cestodes : praziquantel (Merck). Nématodes : lévamisole, fenbendazole : doses non
vérifiées.

### 5.10 Vessie natatoire, constipation
Chez les cyprinidés (poissons rouges, koïs), la vessie natatoire est à deux chambres (Merck).
Causes et traitements chiffrés (jeûne, pois, Epsom) : non vérifiés.

### 5.11 Intoxications (Merck)
- **Ammoniaque** : NH₃ > 1 mg/L, pH > 8 ; léthargie, anorexie, nage convulsive, poisson assombri.
- **Nitrite** : > 0,1 mg/L ; piping, branchies et sang brun foncé ; chlorure (sel) et changement
  d'eau.
- **Chlore** : mort subite (aigu) ; mucus, yeux troubles, nécrose des branchies (chronique).
- **Cuivre** : Cu²⁺ > 0,2 mg/L, faible alcalinité ; mort subite.
- **Zinc** : pièces de monnaie, acier galvanisé, pH acide. **H₂S** : vase anoxique remuée.

### 5.12 Stress, blessures
Une blessure de la peau complique l'osmorégulation (Merck) ; le sel à 0,1–0,3 % favorise le mucus
(UF/IFAS). Bénéfice des « protège-mucus » (ex. API Stress Coat, 5 mL/38 L, source secondaire) :
non démontré.

## 6. Produits d'entretien et d'appoint

- **Charbon actif** : retire les médicaments, à enlever pendant tout traitement. Exemple
  documenté : chez des axolotls, l'itraconazole a été retiré de l'eau après 30 minutes par des
  filtres à charbon à haut débit (PubMed 18817004). Pour les amphibiens, le Merck recommande la
  filtration au charbon pour retirer le chlore (≥ 24 h de circulation).
- **Effets des médicaments sur le biofiltre** : formol ≤ 25 mg/L et permanganate ≤ 2 mg/L :
  impact minime (Merck) ; cuivre à 0,3 mg/L : inhibe la nitrification (UF/IFAS FA165) ;
  nifurpirinol : nuit aux bactéries du filtre (FAQ JBL).
- **Tests d'eau** : kits « peu chers, faciles et raisonnablement précis » mais attention aux tests
  limités des animaleries (Merck) ; ammoniaque : préférer le salicylate au Nessler, faussé par le
  formol, les conditionneurs et l'eau de mer (UF/IFAS). Bandelettes contre réactifs : pas de
  comparaison chiffrée vérifiée.
- **Aération** : O₂ > 5 mg/L ; mortalité possible à ≤ 4 mg/L (Merck). Le formol consomme
  l'oxygène : aération vigoureuse obligatoire.
- **Zéolithe, résines anti-nitrates/phosphates, anti-algues, engrais (fer, K, NPK), anti-escargots,
  clarifiants, UV** : aucune donnée quantifiée vérifiée ; effets qualitatifs codés en
  « simplification ». Les algicides et anti-escargots cuivrés relèvent de la toxicité du cuivre.

## 7. France / UE : ce qui est vendu librement ou non

- **Antimicrobiens** : le règlement (UE) 2019/6, applicable depuis le 28 janvier 2022, les range
  parmi les médicaments vétérinaires soumis à ordonnance (art. 34) ; en France, l'arrêté du
  22 juillet 2015 subordonne la délivrance des antibiotiques vétérinaires à une ordonnance ;
  validité cinq jours pour les ordonnances d'antimicrobiens (Vetofish, résumé du règlement). Hors
  autorisation de mise sur le marché, le vétérinaire utilise la « cascade » : un produit vendu
  habituellement sans ordonnance en requiert une dans ce cadre.
- **Pour le jeu** : métronidazole, kanamycine, oxytétracycline, florfénicol, érythromycine
  affichés « sur ordonnance vétérinaire (France/UE) ». Les Seachem KanaPlex/MetroPlex sont vendus
  librement aux États-Unis ; leur statut en France n'a pas été vérifié.
- **Nifurpirinol** (Baktopur Direct, Furanol, Furapond, Aquafuran) : les sources se contredisent.
  Vetofish le présente comme antibiotique « en vente libre » pour poissons d'ornement ; un
  revendeur indique que Furanol n'est « pas en vente libre en Allemagne » ; c'est un nitrofurane,
  famille classée « haute priorité réglementaire » par la FDA (Merck). Afficher « statut variable
  selon les pays ».
- **Vert de malachite** : non autorisé pour les animaux producteurs d'aliments dans l'UE (EFSA) ;
  seuil d'intervention pour les résidus 0,5 µg/kg (règlement UE 2019/1871, applicable depuis le
  28 novembre 2022) ; usage légal pour les poissons d'ornement (BfR) ; Sera costapur F figure
  dans la base européenne des médicaments vétérinaires comme « non soumis à prescription
  vétérinaire », pour poissons d'ornement (fiche portugaise ; autorisation française non
  vérifiée).
- **Produits sans antibiotique** (praziquantel, formol, colorants, sel, permanganate) : vendus en
  animalerie ou jardinerie ; statut ANMV spécialité par spécialité non vérifié.

## 8. Amphibiens : axolotl, tritons, grenouilles

**Axolotl (eau froide)**
- Loh 2015 (WSAVA/VIN) : 15–18 °C, pH 7,4–7,6, NH₃ 0, NO₂ 0, NO₃ < 10 mg/L (tolérances : 4–24 °C,
  pH 6,5–8,0, TAN < 2,0, nitrite < 0,5, nitrate < 110 mg/L, salinité < 15 g/L).
- Chapitre de laboratoire (PMC10948202) : 16–18 °C idéal, pièce toujours sous 24 °C.
- Centre génétique Ambystoma de l'Université du Kentucky : eau reconstituée à 1,38 g/L NaCl,
  80 mg/L MgSO₄, 40 mg/L CaCl₂, 20 mg/L KCl, pH 7,1–7,6 ; les sels de la solution de Holtfreter
  « aident à décourager parasites et champignons » mais « ne sont pas essentiels », pH de 6,5 à 8.
- **Désaccord** : une clinique vétérinaire (MEAMS) recommande une salinité de 0 g/L et moins de
  21 °C. Le jeu peut montrer qu'une légère salinité de laboratoire est tolérée sans l'imposer.

**Merck, amphibiens en général** : eau exempte de chlore, d'ammoniaque, de nitrite, de pesticides
et de métaux lourds ; chloramine cassée par un agent spécifique (thiosulfate de sodium) puis
filtration sur charbon ; pas d'eau distillée ; au moins 10 % de l'eau changée chaque semaine dans
un bac établi ; la peau absorbe facilement les toxiques.

**Chytridiomycose (Batrachochytrium dendrobatidis)**
- Traitement (Merck) : itraconazole en bain à 0,01 %, 5 min/jour pendant 10–11 jours ;
  terbinafine à 0,01 % (tamponnée au bicarbonate à pH 7,2–7,4), 5 min/jour pendant 5 jours ;
  voriconazole en pulvérisation à 125 mg/L pendant 7 jours.
- Chaleur : au-dessus de 23 °C si l'espèce le supporte. **Incompatible avec l'axolotl** (16–18 °C).
- Doses réduites : Brannelly et al. (Dis Aquat Org, 2012) : 0,0025 % pendant 6 jours, 5 min/jour,
  guérit de façon fiable avec moins d'effets secondaires. Dans le protocole JoVE (PMC4151600),
  0,01 % pendant 11 jours a tué 100 % des crapauds Incilius nebulifer (n = 15), 0,005 % en a tué
  60 %.
- Axolotls d'une collection d'aquarium : 0,01 % directement dans le bac, 30 minutes tous les 5
  jours, 4 fois, puis retrait du médicament au charbon (PubMed 18817004).
- L'itraconazole est toxique pour les têtards.
- Signes (Merck, grand public) : perte d'appétit, amaigrissement, mues excessives, peau pâle ou
  grisâtre ; peut décimer une population en quelques jours.

**À ne pas donner (données partielles)** : cuivre (toxique pour les amphibiens selon la logique
de sensibilité aux métaux lourds du Merck ; seuil chiffré non vérifié) ; vert de malachite et
tétracyclines (déconseillés par une source commerciale, aucune liste vétérinaire trouvée) ; bains
de sel pour l'axolotl (6 g/L selon un distributeur australien : non vérifié).

**Tritons et grenouilles** : paramètres par espèce non vérifiés. Coder des profils génériques
« amphibien aquatique tempéré » à partir des règles du Merck, en signalant la simplification.

## 9. Koïs et bassin extérieur

- **Température et pH** : optimum 18–25 °C ; variation idéalement ≤ 3 °C par jour ; pH extrêmes
  < 5,5 ou > 8,5 (VIN/WSAVA 2019) ; un cas clinique donne un pH optimal de 7,0–7,4.
- **Sel** : 0,1–0,3 % pour stress et manipulation (UF/IFAS) ; 5 g/L une semaine contre l'ich
  (Merck). Le « 0,3 % permanent » souvent cité correspond à la borne haute de la plage
  « transport/manipulation » : ce n'est pas une dose d'entretien permanente vérifiée.
- **Permanganate** : 2 mg/L par paliers de 2 mg/L selon la demande de l'eau ; au plus une fois
  par semaine (Merck). **Formol** : 15 mg/L en bassin de préférence (il consomme l'oxygène en
  présence de phytoplancton).
- **Parasites** : Trichodina, Costia, Chilodonella : formol, CuSO₄, sel ; Gyrodactylus,
  Dactylogyrus : praziquantel 5 mg/L ; Argulus, Lernaea : diflubenzuron, lufénuron ≈ 0,1 mg/L.
- **KHV (CyHV-3)** : aucun traitement ; mortalité de 80–100 % (UC Davis) ou jusqu'à 90 %
  (Colombie-Britannique) ; maladie active entre 18 et 28 °C ; sous 15 °C la mortalité baisse mais
  les survivants restent porteurs à vie ; soutien : salinité 0,5–3 g/L, aération, contrôle des
  infections secondaires ; prévention : quarantaine d'au moins 6 semaines à 16–28 °C (UC Davis),
  4 semaines selon la Colombie-Britannique. **Aucun bouton « guérir » dans le jeu** : biosécurité
  seulement.
- **Bulles de gaz** : remplir un bassin avec un tuyau immergé (eau de puits) peut provoquer la
  maladie des bulles de gaz (Merck).
- Pompes, UV, algues filamenteuses, eau verte, hivernage : quantifications non vérifiées.

## 10. Récif et eau de mer

**Paramètres (Holmes-Farley, Reefkeeping)** : salinité 35 ‰ (densité 1,0264, conductivité
53 mS/cm) ; calcium 380–450 ppm ; alcalinité 7–11 dKH (2,5–4 meq/L) ; magnésium 1 250–1 350 ppm
(1 200–1 400 acceptable) ; pH 7,8–8,5 (8,1–8,3 préférable) ; phosphate < 0,03 ppm ; ammoniaque
< 0,1 ppm ; température 24–28 °C. Hanna Instruments donne des fourchettes légèrement différentes
(alcalinité 8–12 dKH, salinité 32–35 ppt) : désaccord mineur. Merck, eau de mer : pH 7,8–8,3,
nitrate < 70 mg/L, alcalinité > 250 mg/L CaCO₃.

**Ich marin (Cryptocaryon irritans), UF/IFAS FA164**
- Cuivre : Cu²⁺ 0,15–0,20 mg/L pendant 3–6 semaines, atteint progressivement en 2–3 jours (Merck :
  0,05 ppm/jour pour atteindre 0,15–0,2 mg/L en 3–4 jours), contrôlé au moins deux fois par jour.
- Hyposalinité : 15 g/L pendant 21–30 jours, en baissant de 5–10 g/L par jour. Inefficace contre
  les souches tolérantes ; jamais avec invertébrés, roches ou sable vivants.
- Chloroquine : 10 mg/L pendant 2–3 semaines. Formol + hyposalinité : formol 25 mg/L un jour sur
  deux + salinité 16–18 g/L pendant 4 semaines.
- Toxicité du cuivre (FA165) : la plupart des invertébrés meurent ; certains poissons meurent
  même sous 0,15 mg/L ; nitrification inhibée à 0,3 mg/L. Cupramine : 0,5 mg/L, ne pas dépasser
  0,6 mg/L (Seachem).
- Bains d'eau douce pour poissons marins : 10 minutes maximum, puis eau de mer propre (UF/IFAS
  VM86). Praziquantel : 5 mg/L en bain prolongé contre les monogènes (Merck).
- Permanganate : déconseillé en eau de mer (plus toxique quand la salinité augmente) ; molly à
  voilure : 100 % de mortalité à 3 mg/L dans une eau à 30 g/L.

**Différences avec l'eau douce** : nitrite moins toxique en mer (chlorures abondants) ; oxygène
plus bas à saturation (6,75 contre 8,27 mg/L à 25 °C) ; cuivre dosé en ion libre et non selon
l'alcalinité ; **un bac récifal ne peut jamais recevoir de cuivre**.

## 11. Paramètres cibles par espèce

> Voir aussi `docs/ESPECES.md` (2026-10-27), plus récent et plus détaillé : fiches, statut légal en
> France, compatibilité, désaccords entre sources. En cas d'écart, `docs/ESPECES.md` prévaut
> jusqu'à vérification.

| Espèce / groupe | Température | pH | Dureté | NH₃ / NO₂ / NO₃ | Salinité | Source |
|---|---|---|---|---|---|---|
| Néon (Paracheirodon innesi) | 20–26 °C | 5,0–7,0 | dH 1–2 | 0 / 0 / < 20 mg/L (Merck, eau douce) | Ne tolère pas le sel (tétras, UF/IFAS) | FishBase |
| Guppy (Poecilia reticulata) | 18–28 °C (FishBase) ; 17–28 °C (Seriously Fish) | 7,0–8,0 (FishBase) ; 7,0–8,5 (SF) | dH 9–19 (FishBase) ; 8–30 dGH (SF) | idem | Tolère l'eau saumâtre | FishBase ; Seriously Fish |
| Corydoras paleatus | 22–26 °C (Seriously Fish) ; d'autres sites : 18–24 °C (désaccord) | 6,0–7,0 | 0–12 dGH | idem | Sensibilité au sel non vérifiée | Seriously Fish |
| Koï (Cyprinus carpio) | 18–25 °C optimum | éviter < 5,5 et > 8,5 ; 7,0–7,4 cité | non vérifié | idem | 0,1–0,3 % temporaire | VIN/WSAVA |
| Axolotl | 15–18 °C (16–18 °C ; pièce < 24 °C) | 7,4–7,6 (Loh) ; 7,1–7,6 (UKY) | non vérifié | 0 / 0 / < 10 mg/L | 0 (MEAMS) ou eau reconstituée à 1,38 g/L NaCl (UKY) : désaccord | WSAVA/VIN ; PMC ; UKY |
| Grenouilles, tritons aquatiques | non vérifié | non vérifié | non vérifié | 0 / 0 / bas (Merck amphibiens) | non vérifié | Merck (général) |
| Poisson-clown (Amphiprion ocellaris) | 24–28 °C | 8,3 | — | NH₃ < 0,1 ppm | Densité 1,025 | TFH Magazine (FishBase non consulté) |
| Chirurgien bleu (Paracanthurus hepatus) | non vérifié par FishBase ; paramètres récif 24–28 °C | 7,8–8,5 | — | idem | 35 ‰ | Holmes-Farley (récif) |

## 12. Règles de simulation proposées (simplifications de jeu)

**Moteur d'eau**
1. Fraction NH₃ : table de Boyd ou formule d'Emerson (section 3). Dommage branchial si NH₃ > 0,05
   mg/L, mortalité des sensibles vers 2,0 mg/L (UF/IFAS).
2. Toxicité effective du nitrite = NO₂ × f(rapport Cl⁻/NO₂⁻) ; protection complète à ≥ 10:1,
   partielle à 6:1 (fondé sur UF/IFAS et SRAC).
3. Ajout de sel : Cl⁻ (mg/L) += 610 × g/L de NaCl (Boyd) ; le sel ne part qu'avec les changements
   d'eau.
4. Nitrification : vitesse nulle si O₂ < 5 mg/L ou alcalinité < 20 mg/L ; consommation
   d'alcalinité à chaque conversion (proportion exacte non vérifiée) ; établissement en 6–8
   semaines (UF/IFAS).
5. Crash de pH : si KH → 0, le pH chute vers < 6 (Merck).
6. Oxygène : saturation 8,27 mg/L à 25 °C (douce), 6,75 (mer) (Merck) ; modulation par la
   température = simplification.
7. Chlore : nocif dès 0,02 mg/L, mortel à 0,04 mg/L (Merck).
8. Cuivre : toxique > 0,2 mg/L (Merck) ; en eau douce, plafond de sécurité = alcalinité/100 en
   CuSO₄, interdit si alcalinité < 50 ; nitrification bloquée à 0,3 mg/L ; invertébrés tués à
   toute dose thérapeutique.

**Fiche produit (structure suggérée)** : `id`, `nom`, `catégorie` ; `dose_efficace`,
`dose_toxique`, `durée`, `fréquence_max` ; `effets_eau` {pH, KH, GH, Cl, O₂, couleur,
NH₃_lié} ; `demi-vie` (souvent non vérifiée : « retiré par changements d'eau ou charbon » en
simplification) ; `retiré_par_charbon` ; `toxique_pour` [invertébrés, amphibiens, tétras,
plantes…] ; `statut_FR` (libre / ordonnance / non vérifié) ; `niveau_preuve` (efficace / soutien /
croyance).

## 13. Liste classée de 45 produits et traitements (débutant d'abord)

**Essentiels débutant (1–12)** : 1 conditionneur déchlore/déchloramine (thiosulfate) ;
2 conditionneur liant l'ammoniaque ; 3 kit de test ammoniaque (salicylate), nitrite, nitrate ;
4 kit pH + KH + GH ; 5 thermomètre + chauffage à thermostat ; 6 pompe à air ; 7 filtre biologique ;
8 bactéries de démarrage (efficacité variable) ; 9 bac de quarantaine/hôpital ; 10 sel non iodé ;
11 test de chlore libre/total ; 12 charbon actif.

**Chimie de l'eau (13–20)** : 13 feuilles de catappa ; 14 bois, racines, cônes d'aulne (non
quantifié) ; 15 bicarbonate de sodium ; 16 corail concassé/aragonite ; 17 reminéralisant GH/KH ;
18 osmoseur/eau déminéralisée ; 19 sel de mer synthétique + réfractomètre ; 20 suppléments récif
(calcium, alcalinité, magnésium).

**Traitements sans ordonnance (21–33)** : 21 praziquantel ; 22 formol ; 23 vert de malachite +
formol (ex. Sera costapur) ; 24 permanganate de potassium ; 25 sulfate de cuivre (eau douce
tamponnée seulement) ; 26 cuivre aminé (Cupramine) en quarantaine marine ; 27 hyposalinité ;
28 bain d'eau douce pour poissons marins ; 29 bain de sel 3 % ; 30 peroxyde d'hydrogène ;
31 acriflavine ; 32 bleu de méthylène (type JBL Ektol) ; 33 nifurpirinol (statut variable).

**Vétérinaire / ordonnance (34–41)** : 34 métronidazole ; 35 kanamycine ; 36 oxytétracycline ;
37 florfénicol ; 38 érythromycine ; 39 chloroquine (marin) ; 40 lufénuron/diflubenzuron ;
41 itraconazole (amphibiens).

**Soutien ou preuves faibles (42–45)** : 42 chlorure de calcium (anti-nitrite) ; 43 sel d'Epsom ;
44 stérilisateur UV (non quantifié) ; 45 API Melafix et « remèdes naturels » (croyance).

## 14. À ne pas faire (idées reçues et erreurs de débutant)

- Mettre des poissons dans un bac pas encore cyclé : 6–8 semaines (UF/IFAS).
- Changer 100 % de l'eau : choc de chlore, de température et de pH ; UF/IFAS conseille 25–50 % en
  cas d'ammoniaque.
- Utiliser de l'eau distillée ou osmosée pure : jamais pour des poissons (UF/IFAS) ni des
  amphibiens (Merck).
- Le sel « tonique » permanent pour tous : tétras et poissons électriques le tolèrent mal ; en
  permanent, ne pas dépasser 0,01–0,2 %.
- Le poisson rouge dans un bocal : pas de filtre biologique, donc ammoniaque et nitrite garantis
  (volume minimum non vérifié).
- Remonter brutalement le pH d'un bac chargé en ammoniaque : la fraction toxique de NH₃ est
  multipliée.
- Cumuler les traitements (cuivre + formol + sel + antibiotique) ; répéter le permanganate plus
  d'une fois par semaine (Merck).
- Traiter avec le charbon actif dans le filtre : il retire le médicament.
- Mettre du cuivre avec crevettes, escargots, coraux ou amphibiens, ou en eau douce peu tamponnée
  (alcalinité < 50 mg/L).
- Arrêter le traitement de l'ich dès que les points disparaissent : traiter les cycles suivants.
- Utiliser des antibiotiques « au hasard » : diagnostic nécessaire ; ordonnance en France/UE.
- Croire qu'un collyre existe pour les yeux des poissons : corriger l'eau, aérer si sursaturation,
  consulter un vétérinaire.
- Chauffer un axolotl atteint de chytridiomycose comme une grenouille : > 23 °C est incompatible
  avec ses besoins (16–18 °C).
- Introduire une koï sans quarantaine : 4–6 semaines, seul rempart contre le KHV.
- Garder du formol au froid : sous 7 °C se forme du paraformaldéhyde très toxique ; ne jamais
  utiliser un formol trouble (Merck).

## 15. À vérifier en priorité (non vérifié lors de la recherche)

- **Doses** : sel d'Epsom en bac ; lévamisole, fenbendazole ; peroxyde d'hydrogène pour poissons
  d'ornement ; bain de sel pour l'axolotl ; velours en eau douce.
- **Chimie** : vitesse « sûre » de variation du pH ; effet chiffré du bois, de l'aulne, de la
  tourbe et des acides humiques ; constantes exactes de la formule d'Emerson (article d'origine) ;
  chlore et chloramine du robinet en France ; demi-vie de la plupart des médicaments ; effet des
  UV sur les médicaments.
- **Produits** : API pH Up/Down, Seachem Equilibrium/Alkaline Buffer, Tetra Medica/Contralck,
  eSHa 2000/Gdex/Hexamita, Sera cyprinopur/baktopur ; principe actif de JBL Punktol ; cuivre de
  Sera mycopur (revendeurs en désaccord) ; efficacité des bactéries en bouteille et des
  « protège-mucus » ; fiabilité des bandelettes contre les réactifs.
- **Espèces** : grenouilles et tritons aquatiques ; liste vétérinaire des médicaments interdits chez
  l'axolotl ; FishBase pour chirurgien bleu et poisson-clown ; sensibilité chiffrée au sel des
  corydoras, loches, crevettes, escargots et plantes ; volume minimal d'un poisson rouge.
- **Réglementation** : statut ANMV en France des spécialités au vert de malachite, au nifurpirinol
  et des antibiotiques Seachem.

## Recommandations pour aqfish

1. Construire d'abord le **moteur d'eau** (NH₃ selon pH et température, chlorures contre nitrite,
   alcalinité et crash de pH, oxygène, chlore).
2. Limiter la pharmacie du **mode débutant** aux n° 1 à 12 ; débloquer les traitements avancés
   avec dose toxique, incompatibilités et statut France affichés.
3. Afficher un **niveau de preuve** par produit (efficace / soutien / croyance / non vérifié).
4. **Pas de bouton « guérir »** pour le KHV, la cataracte ou l'hydropisie avancée : prévention et
   quarantaine.
5. Rappel permanent : « Ce jeu n'est pas un avis vétérinaire ».

## Bibliographie

Les entrées marquées *(secondaire)* sont des boutiques, forums, blogs ou sites commerciaux : à
remplacer par une source primaire.

1. Merck Veterinary Manual, maladies environnementales des animaux aquatiques — https://www.merckvetmanual.com/exotic-and-laboratory-animals/aquatic-systems/environmental-diseases-of-aquatic-animals-in-aquatic-systems
2. Global Seafood Alliance, sels minéraux et déséquilibres ioniques — https://www.globalseafood.org/advocate/mineral-salts-correct-ionic-imbalances-in-culture-water/
3. UF/IFAS EDIS VM007 — https://edis.ifas.ufl.edu/VM007
4. Merck Veterinary Manual, maladies des poissons — https://www.merckvetmanual.com/all-other-pets/fish/disorders-and-diseases-of-fish
5. PetPlace, problèmes oculaires des poissons — https://www.petplace.com/article/fish/general/common-eye-problems-of-pet-fish *(secondaire)*
6. Vetofish, règlement UE 2019/6 — https://www.vetofish.com/reglementation/reglement-ue-2019-6-medicaments-veterinaires/
7. Légifrance, arrêté du 22 juillet 2015 — https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031142007
8. Bulk Reef Supply, Seachem Prime — https://www.bulkreefsupply.com/prime-complete-concentrated-water-conditioner-seachem.html *(secondaire)*
9. Amazon, Seachem Prime — https://www.amazon.com/Seachem-Prime-Fresh-Saltwater-Conditioner/dp/B00025694O *(secondaire)*
10. Aquaforest, Seachem Prime — https://aquaforestaquarium.com/products/seachem-prime-water-conditioner *(secondaire)*
11. Amazon, Seachem Prime — https://www.amazon.com/Seachem-Prime-Fresh-Saltwater-Conditioner/dp/B0BNMR4P9Q *(secondaire)*
12. Reptile Knowledge, API Quick Start et Stress Coat — https://www.reptileknowledge.com/reptile-pedia/how-do-you-use-api-quick-start-and-stress-coat *(secondaire)*
13. Seachem, feuilles de catappa — https://www.seachem.com/catappa-leaves-sm.php
14. Merck Veterinary Manual, parasites protistes des poissons — https://www.merckvetmanual.com/multimedia/table/protistan-parasites-of-fish
15. SRAC 462, nitrite en étang — https://agrilife.org/fisheries/files/2013/09/SRAC-Publication-No.-0462-%E2%80%93-Nitrite-in-Fish-Ponds.pdf
16. Practical Fishkeeping, questions sur le nitrite — https://www.practicalfishkeeping.co.uk/features/frequently-asked-questions-on-nitrite/ *(secondaire)*
17. Betta Science, sel d'Epsom et sel — https://www.bettascience.com/epsom-salt-and-regular-salt-to-treat-freshwater-fish/ *(secondaire)*
18. UF/IFAS FA006 — https://ask.ifas.ufl.edu/publication/FA006
19. Merck Veterinary Manual, considérations thérapeutiques en aquaculture — https://www.merckvetmanual.com/exotic-and-laboratory-animals/aquaculture/therapeutic-considerations-in-aquaculture
20. EFSA, vert de malachite — https://www.efsa.europa.eu/en/press/news/160727
21. aquariumscience.org, médicaments contre l'ich — https://aquariumscience.org/index.php/10-2-2-4-ich-medications-in-more-depth/ *(secondaire : pas d'auteur nommé)*
22. Texas A&M, Ichthyophthirius multifiliis (CIR920) — https://extension.rwfm.tamu.edu/wp-content/uploads/sites/8/2013/09/Ichthyophthirius-multifiliis-White-Spot-Infections-in-Fish.pdf
23. Aquaristikshop, Sera costapur F — https://www.aquaristikshop.com/aquaristic/Sera-costapur-F/387016/ *(secondaire)*
24. Base européenne des médicaments vétérinaires — https://medicines.health.europa.eu/veterinary/en/600000097999
25. Seachem Cupramine — https://seachem.my/products/seachem-cupramine
26. Permanganate de potassium pour les infections externes des poissons — https://www.researchgate.net/publication/270172233_Potassium_permanganate_for_the_treatment_of_external_infections_of_fish
27. Seachem, dosage MetroPlex — https://seachem.zendesk.com/hc/en-us/articles/115001003394-Info-Seachem-MetroPlex-Dosing-Instructions
28. Seachem, dosage KanaPlex — https://seachem.zendesk.com/hc/en-us/articles/115001045873-Info-Seachem-KanaPlex-Dosing-Instructions
29. JBL, FAQ — https://www.jbl.de/en/faq/show_faq?faqid=183&glossary_id=66&country=mg
30. GreenAqua, Sera mycopur — https://greenaqua.hu/en/sera-mycopur-50-ml.html *(secondaire)*
31. Aquaristikshop, Sera mycopur — https://www.aquaristikshop.com/aquaristic/Sera-mycopur/387021/ *(secondaire)*
32. JBL Ektol fluid plus 250 — https://www.jbl.de/en/products/detail/8343/jbl-ektol-fluid-plus-250?country=us
33. JBL Ektol fluid plus 125 — https://www.jbl.de/en/products/detail/5564/jbl-ektol-fluid-plus-125
34. JBL Punktol Plus 125 — https://www.jbl.de/en/products/detail/5589/jbl-punktol-plus-125
35. DailyMed, étiquette API — https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=79dbc5ed-7deb-4f79-97b8-a4fcd8775cf4
36. UF/IFAS FA031 — https://ask.ifas.ufl.edu/publication/FA031
37. Reefkeeping, Holmes-Farley — https://www.reefkeeping.com/issues/2004-05/rhf/index.htm
38. VIN, actes — https://www.vin.com/apputil/project/DefaultAdv1.aspx?pId=24437&SAId=-1&id=9382754
39. Global Seafood Alliance, toxicité de l'ammoniaque — https://www.globalseafood.org/advocate/ammonia-toxicity-degrades-animal-health-growth/
40. NMSU, circulaire CR680 — https://pubs.nmsu.edu/_circulars/CR680/
41. Merck Veterinary Manual, gestion des poissons d'aquarium — https://www.merckvetmanual.com/exotic-and-laboratory-animals/aquarium-fish/management-of-aquarium-fish
42. UF/IFAS FA165 — https://ask.ifas.ufl.edu/publication/FA165
43. Merck Veterinary Manual, maladies parasitaires des poissons — https://www.merckvetmanual.com/exotic-and-laboratory-animals/aquarium-fish/parasitic-diseases-of-fish
44. NAVLE exam, parasites aquatiques — https://navleexam.com/blog/aquatic-parasites-internal-external-including-monogenea-argulus-and-laernea-navle-study-guide *(secondaire)*
45. Merck Veterinary Manual, maladies bactériennes en aquaculture — https://www.merckvetmanual.com/exotic-and-laboratory-animals/aquaculture/bacterial-diseases-in-aquaculture
46. PubMed 18817004 (itraconazole, axolotls) — https://pubmed.ncbi.nlm.nih.gov/18817004/
47. Merck Veterinary Manual, environnement des amphibiens — https://www.merckvetmanual.com/exotic-and-laboratory-animals/amphibians/environment-and-husbandry-for-amphibians
48. Vetofish, infection bactérienne sans ordonnance — https://www.vetofish.com/questions-frequentes/170832-comment-traiter-une-infection-bacterienne-sans-ordonnance/
49. PMC10948202, axolotl en laboratoire — https://pmc.ncbi.nlm.nih.gov/articles/PMC10948202
50. Ambystoma Genetic Stock Center (Kentucky), guide 2024 — https://ambystoma.uky.edu/genetic-stock-center/documents/AGSC%20_Guide_2024.pdf
51. Ambystoma Genetic Stock Center (Kentucky), élevage de l'axolotl — https://ambystoma.uky.edu/education1/guide-to-axolotl-husbandry
52. MEAMS, fiche axolotl — https://www.meams.vet/wp-content/uploads/2021/01/Axolotl-Care-Sheet-MEAMS.pdf
53. Merck Veterinary Manual, maladies infectieuses des amphibiens — https://www.merckvetmanual.com/exotic-and-laboratory-animals/amphibians/infectious-diseases-of-amphibians
54. Amphibian Ark, manuel des maladies, chapitre 8 — https://www.amphibianark.org/fileadmin/uploads/aark/Husbandry_Library/Amphibian-Disease-Manual-Chapter-8-Disease-Treatment.pdf
55. Veterinary Key, amphibiens — https://veteriankey.com/amphibians/
56. Petco, fiche axolotl — https://www.petco.com/content/content-hub/home/articlePages/caresheets/axolotl.html *(secondaire)*
57. Aquarium Industries, Mexican Walking Fish — https://www.aquariumindustries.com.au/wp-content/uploads/2015/03/Mexican-Walking-Fish_Health-Guide.pdf *(secondaire)*
58. UC Davis, herpèsvirus de la koï — https://healthtopics.vetmed.ucdavis.edu/health-topics/koi-herpesvirus-khv
59. Gouvernement de Colombie-Britannique, KHV — https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/agriculture-and-seafood/animal-and-crops/animal-disease/khv_updated_20240227.pdf
60. Koiquanta, manuel des maladies de la koï — https://koiquanta.com/koi-disease-reference-manual/ *(secondaire)*
61. Texas A&M, Cryptocaryon irritans — https://extension.rwfm.tamu.edu/wp-content/uploads/sites/8/2013/09/Cryptocaryon-irritans-Infections-Marine-White-Spot-Disease-in-Fish.pdf
62. Reef Central, forum — https://reefcentral.com/forums/showthread.php?t=2383310 *(secondaire : forum)*
63. Reefs.com, magazine — https://reefs.com/magazine/aquarium-fish-news-from-the-warfront-with-cryptocaryon-irritans-part-three-of-five/ *(secondaire)*
