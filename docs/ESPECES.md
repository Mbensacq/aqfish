# Espèces : fiches sourcées, compatibilité et statut légal en France

Référentiel de départ pour les fiches d'espèces (ADR 0058), le wiki (#252) et la mise en règle
du catalogue (#262). Il vient d'une recherche documentaire du 2026-10-27 (sources en fin de
fichier). Il complète `docs/SOINS.md` ; pour les paramètres par espèce, **ce fichier prévaut**
sur `docs/SOINS.md` § 11 jusqu'à vérification.

## Comment l'utiliser (consigne aux agents)

1. **Point de départ, pas vérité.** Avant de coder une valeur, la recouper avec une source
   fiable (FishBase, SeaLifeBase, Seriously Fish, AmphibiaWeb, IUCN, étude publiée, fiche
   universitaire ou vétérinaire) et **chercher plus loin** pour les champs « non vérifié ».
   Corriger ce fichier dans la même PR quand une source le contredit.
2. **Jamais de valeur inventée.** Une donnée sans source consultable est « approximation de
   jeu » (code, fiche, ce fichier). Les désaccords entre sources sont affichés, pas arbitrés en
   silence.
3. **Niveaux de confiance** : _élevée_ (base scientifique ou taxonomique, étude publiée, texte
   réglementaire, fiche universitaire) ; _moyenne_ (base aquariophile reconnue et maintenue,
   fiche de clinique vétérinaire) ; _faible / secondaire_ (boutique, blog, forum, synthèse
   encyclopédique) ; _non vérifié_. Les sources secondaires sont à remplacer par des primaires.
4. **Statut légal** : le droit français a été lu à partir de l'arrêté du 8 octobre 2018 et de
   l'arrêté modificatif du 5 septembre 2025, **pas** de la version consolidée de Légifrance
   (inaccessible pendant la recherche). Tout statut affiché porte « à vérifier auprès de la
   DDPP » tant qu'il n'a pas été confirmé sur la version consolidée. Le jeu ne propose jamais
   une espèce interdite ou soumise à certificat de capacité dès le premier individu (#262).
5. **Robustesse ≠ seuil de confort** : une CL50 (dose qui tue la moitié des animaux en 4 jours)
   sert à comparer la robustesse des espèces, jamais à définir une eau acceptable.
6. Ce n'est pas un avis vétérinaire ni juridique.

## Résumé

- **Dans le code** (#269, ADR 0062) : statut légal par fiche et liste d'exclusion dans
  `frontend/src/app/sim/species-legal.ts` ; aucun statut confirmé à la source consolidée.
- **Environnements** (#271, ADR 0065) : l'axolotl vit seul dans le bac d'eau froide (17 °C) ;
  le paludarium (20 °C, seul point commun des plages préférées) accueille sonneurs orientaux
  et tritons à ventre de feu, cohabitation **possible sous conditions** d'après des
  témoignages d'éleveurs seulement ([60], faible : grand bac, œufs et têtards du sonneur
  mangés par les tritons, avis partagés). À recouper avec une source primaire ; toujours non
  vérifiable au 2026-10-28 (voir « Vérifications du 2026-10-28 »).
- **Bac tropical à 24 °C** (#286, ADR 0067) : seule eau dans la plage préférée commune du néon,
  du guppy et du corydoras (23–24 °C), et dans toutes les plages des sources citées.
- Fiches utilisables (avec badges de confiance) : néon, guppy, corydoras poivré, axolotl,
  poisson-clown (paramètres d'eau de source secondaire seulement), chirurgien bleu.
- **Fiche koï à bloquer** : aucun paramètre chiffré vérifié.
- **Xénope (_Xenopus laevis_) : interdit en France**, ne jamais le proposer.
- **Grenouille naine africaine (_Hymenochirus_)** : famille Pipidae ; en lecture littérale de
  l'annexe 2 de l'arrêté, certificat de capacité dès 1 individu (non confirmé). Ne pas la
  proposer sans confirmation officielle.
- **Triton générique** à remplacer par _Cynops pyrrhogaster_ ou _C. orientalis_ (« Autres
  Caudata », 1 à 40 sans formalité) : eau fraîche 14–20 °C, sans poissons.
- **Chirurgien bleu** : pas une espèce de débutant (31 cm, au moins 300 L, sujets surtout
  prélevés dans la nature).

## Tableau récapitulatif (espèces actuelles et paludarium)

| Espèce                                                           | T°                                                   | pH                                            | GH/KH                                        | Volume / dimensions min                                                                                 | Groupe                                                    | Régime                        | Caractère                      | Difficulté                                     | Sources (confiance)                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- | ------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- |
| Néon (_Paracheirodon innesi_)                                    | 21–25 °C                                             | 4,0–7,5                                       | 1–12 dGH ; KH non vérifié                    | base 60 × 30 cm (~54 L)                                                                                 | groupe requis ; effectif non vérifié                      | omnivore micro-prédateur      | paisible                       | facile (souche commerciale fragile)            | Seriously Fish (moyenne)                                       |
| Guppy (_Poecilia reticulata_)                                    | 17–28 °C                                             | 7,0–8,5                                       | 8–30 dGH                                     | base 45 × 30 cm (~41 L)                                                                                 | groupe requis                                             | omnivore                      | paisible                       | facile                                         | Seriously Fish (moyenne)                                       |
| Corydoras poivré (_Hoplisoma paleatum_, ex-_Corydoras paleatus_) | 22–26 °C                                             | 6,0–7,0                                       | 0–12 dGH                                     | 61 × 38 × 30 cm (~70 L)                                                                                 | groupe requis                                             | omnivore opportuniste de fond | paisible                       | facile                                         | Seriously Fish (moyenne)                                       |
| Koï (_Cyprinus rubrofuscus_ / _C. carpio_)                       | non vérifié                                          | non vérifié                                   | non vérifié                                  | bassin ; volume non vérifié                                                                             | non vérifié                                               | non vérifié                   | non vérifié                    | non vérifié                                    | USGS NAS (élevée : taxonomie, KHV)                             |
| Poisson rouge (_Carassius auratus_)                              | 4–25 °C (OATA) ; 4–30 °C (FishKeeper)                | 6,0–8,0 (OATA) ; 7,0–8,0 préféré (FishKeeper) | 5–19 dGH (OATA) ; jusqu'à 25 dH (FishKeeper) | 100 L pour un adulte, + 50 L par adulte (OATA) ; bassin ≥ 60 cm de profondeur par endroits (FishKeeper) | sociable, en groupe (FishKeeper) ; peut vivre seul (OATA) | omnivore                      | paisible                       | facile                                         | OATA [65] (moyenne), FishKeeper [66] (secondaire)              |
| Axolotl (_Ambystoma mexicanum_)                                  | 15,5–18 °C idéal ; > 23 °C = stress thermique        | 6,5–8 (idéal 7,4–7,6)                         | GH 7–14                                      | non vérifié                                                                                             | seul ou entre axolotls                                    | carnivore                     | calme, sans poissons           | intermédiaire                                  | AmphibiaWeb (élevée), Agave Vet (moyenne), étude MDPI (élevée) |
| Poisson-clown (_Amphiprion ocellaris_)                           | 23–27 °C (secondaire)                                | 8,0–8,5 (secondaire)                          | densité 1,020–1,026 (secondaire)             | ~114 L ; > 190 L avec anémone (secondaire)                                                              | couple                                                    | omnivore planctonophage       | territorial autour de son hôte | facile si né en captivité                      | FishBase (élevée), Saltcorner (faible)                         |
| Chirurgien bleu (_Paracanthurus hepatus_)                        | non vérifié                                          | non vérifié                                   | non vérifié                                  | ≥ 300 L pour 1 individu < 20 cm (OATA via secondaire) ; 700 L (ReefApp, secondaire)                     | non vérifié                                               | zooplancton + algues          | aiguillon venimeux             | **pas pour débutant**                          | FishBase (élevée), études sur le commerce (élevée)             |
| Grenouille naine (_Hymenochirus boettgeri_)                      | optimum 25 °C ; 20–25 °C en protocole de laboratoire | 7,6–7,8 optimum ; 7 ± 0,4 en laboratoire      | conductivité 900 ± 100 µS/cm (laboratoire)   | non vérifié                                                                                             | non vérifié                                               | carnivore par aspiration      | paisible, timide               | **statut légal à vérifier**                    | AmphibiaWeb (élevée), protocole de laboratoire (moyenne)       |
| Triton à ventre de feu chinois (_Cynops orientalis_)             | 14–20 °C ; éviter > 23 °C                            | non vérifié                                   | non vérifié                                  | non vérifié                                                                                             | non vérifié                                               | carnivore (invertébrés)       | paisible, sans poissons        | intermédiaire (souvent prélevé dans la nature) | Caudata Culture (moyenne)                                      |

## Qualité d'eau : règles générales

- **Cycle de l'azote** : ammoniac → nitrite → nitrate par des bactéries ; plus on nourrit, plus
  il y a d'ammoniac ; certains médicaments (surtout les antibiotiques) nuisent aux bactéries
  nitrifiantes (UF/IFAS FA16, élevée). L'ammoniac est le paramètre le plus important après
  l'oxygène.
- **Ammoniac** : les tests mesurent l'ammoniac total (TAN) ; la forme non ionisée NH₃ est
  « environ 100 fois plus toxique » et sa part augmente avec le pH et la température ;
  dommages au-delà de 0,05 mg/L de NH₃, mort à 2,0 mg/L ; toute présence d'ammoniac signale un
  problème (UF/IFAS FA16, élevée). **Cible : 0.**
- **Nitrite** : toxique dès 0,10 mg/L ; environ 10 mg/L de chlorure pour 1 mg/L de nitrite
  réduisent sa toxicité (UF/IFAS, élevée). Pendant une mise en route, ne pas laisser TAN ou
  nitrite dépasser 1 ppm, sinon changer un tiers de l'eau (NMSU, moyenne). **Cible : 0.**
- **Nitrate** : Camargo et al. 2005 (Chemosphere, élevée) : 10 mg/L de NO₃-N peut nuire à long
  terme aux espèces d'eau douce ; 2 mg/L de NO₃-N protégerait les plus sensibles ; 20 mg/L de
  NO₃-N serait en général acceptable en mer. **Unités** : NO₃-N × 4,43 = NO₃ (2 mg/L N ≈ 8,9
  mg/L NO₃ ; 10 ≈ 44 ; 20 ≈ 89). Cible pratique en aquariophilie : **< 20 mg/L de NO₃** en eau
  douce (PetMD, contenu vétérinaire, moyenne) ; **< 10 mg/L** pour l'axolotl (Agave Vet).
  Toujours afficher l'unité (NO₃ ou NO₃-N).
- **CL50** : chez le betta adulte, CL50 sur 96 h de 1,7 g/L d'ammoniac total-N, 7,7 mg/L de
  NH₃-N et 343,6 mg/L de nitrite-N (BMC Zoology 2023, élevée) ; la CL50 96 h des poissons d'eau
  douce se situe généralement entre 0,068 et 2,0 mg/L de NH₃. Pour le jeu : la robustesse peut
  moduler la _vitesse_ de dégradation de la santé, jamais la cible.
- **Catégories** : eau douce tropicale NH₃ = 0, NO₂ = 0, NO₃ < 20 mg/L ; eau froide (koï,
  poisson rouge) mêmes principes, températures non vérifiées ; marin : seuils Reefkeeping non
  revérifiés ici ; amphibiens : axolotl, ammoniac 0, nitrate < 10 ppm, eau dure (GH 7–14),
  jamais d'eau distillée (Agave Vet). La valeur « nitrite 1 ppm » de cette fiche est
  probablement une coquille : afficher 0.
- **Quarantaine** : la « maladie du néon » (microsporidie) est quasi incurable une fois avancée
  (Seriously Fish) ; la transmission la plus probable passe par des poissons introduits sans
  quarantaine (secondaire). Les koïs portent et transmettent le KHV (USGS). Durée de
  quarantaine chiffrée : non vérifiée ici (voir `docs/SOINS.md`, koïs : 4 à 6 semaines).

## Fiches des espèces actuelles

### Néon — _Paracheirodon innesi_ (Myers, 1936)

- **Taxonomie** : anciens noms _Hyphessobrycon innesi_, _Cheirodon innesi_ (Seriously Fish).
- **Origine** : bassin amazonien (Colombie, Brésil, Pérou) ; ruisseaux forestiers et petits
  affluents ; eau acide, dureté carbonatée et conductivité négligeables, teintée d'acides
  humiques (eau noire), parfois eau claire ; fond de branches, racines et litière.
- **Taille** : 30 mm en longueur standard. Durée de vie : non vérifié.
- **Eau** : 21–25 °C, pH 4,0–7,5, 1–12 dGH (Seriously Fish révisé en 2026, moyenne).
  **Désaccords** : un texte plus ancien de la même source indiquait pH 5,5–6,5, gH 1–5,
  26,5–29 °C ; un importateur (Quality Marine, secondaire) donne pH 3,5–7,5 et 21–29 °C ;
  `docs/SOINS.md` cite FishBase 20–26 °C, pH 5,0–7,0. Afficher 21–25 °C et signaler que les
  néons d'élevage sont plus adaptables que les sauvages.
- **Bac** : base 60 × 30 cm (~54 L) ; éclairage tamisé, plantes d'ombre (_Microsorum_,
  _Taxiphyllum_, _Cryptocoryne_), plantes flottantes, bois, litière de feuilles ; grégaire,
  effectif minimal chiffré non vérifié.
- **Alimentation** : micro-prédateur omnivore ; détails non vérifiés.
- **Comportement** : paisible, avec d'autres espèces paisibles.
- **Reproduction** : ovipare (dispersion des œufs) ; facilité non vérifiée.
- **Maladies** : « maladie du néon » (microsporidiose), quasi incurable une fois avancée ;
  souche commerciale affaiblie par des années d'élevage (Seriously Fish).
- **Débutant** : oui, dans un bac stable et mature. Erreur classique : bac non cyclé ou trop
  chaud.
- **Statut** : IUCN « Least Concern » (via synthèse encyclopédique, moyenne).

### Guppy — _Poecilia reticulata_

- **Origine** : nord-est de l'Amérique du Sud et sud des Caraïbes (Venezuela, Trinidad,
  Guyana) ; certaines populations en eau saumâtre.
- **Taille** : 60 mm en longueur standard au maximum. Durée de vie : non vérifié.
- **Eau** : 17–28 °C, pH 7,0–8,5, 8–30 dGH ; **poisson d'eau dure** : à long terme, eau
  moyennement dure ou plus (Seriously Fish).
- **Bac** : base 45 × 30 cm (~41 L) ; plantes flottantes, pas de courant fort.
- **Alimentation** : omnivore ; dans la nature, les débris d'algues sont souvent la plus grande
  part du régime ; peut manger des œufs et ses alevins (synthèse citant Magurran 2005,
  moyenne).
- **Comportement** : paisible, grégaire. **Reproduction** : vivipare, très prolifique.
- **Débutant** : oui, **si l'eau est dure**. Erreur classique : le mélanger avec des espèces
  d'eau douce et acide.

### Corydoras poivré — _Hoplisoma paleatum_ (anciennement _Corydoras paleatus_)

- **Taxonomie** : transfert récent de _Corydoras_ vers _Hoplisoma_ (Seriously Fish, synthèse) ;
  synonymes _Callichthys paleatus_, _Corydoras maculatus_, _C. marmoratus_. Afficher les deux
  noms.
- **Origine** : sud du Brésil, Uruguay, Paraguay, Argentine ; rivières, affluents, eaux
  stagnantes.
- **Taille** : 70 mm en longueur standard ; femelles plus grandes et plus rondes.
- **Eau** : 22–26 °C, pH 6,0–7,0, jusqu'à 12 dGH ; pH et température stables (Seriously Fish).
  **Désaccord** : 16–24 °C chez Animalia.bio (secondaire). Afficher 22–26 °C et noter la
  tolérance au frais. Dans le jeu, plage préférée 22–24 °C (approximation : recoupement des
  deux sources) ; le bac tropical est à 24 °C pour rester dans les deux (ADR 0067).
- **Bac** : 61 × 38 × 30 cm (~70 L) ; **substrat sableux** (les barbillons s'infectent sur un
  gravier mal entretenu) ; cachettes.
- **Respiration** : respiration aérienne facultative par l'intestin (Plaul et al. 2016, PubMed,
  élevée) : ses remontées en surface sont normales, **ne pas les pénaliser** dans la
  simulation.
- **Alimentation** : omnivore opportuniste (vers, crustacés, végétaux, zoobenthos) ; aliment
  sec coulant de qualité et petites proies vivantes ou congelées. **Idée reçue « nettoyeur »** :
  il doit recevoir sa propre nourriture.
- **Cohabitation** : paisible, en groupe ; petits tétras et cichlidés nains sont des compagnons
  idéaux (Seriously Fish).
- **Reproduction** : ovipare, position en « T » ; ponte déclenchée par un grand changement d'eau
  environ 5 °C plus fraîche ; environ 2 mâles par femelle.
- **Débutant** : oui. **Statut** : IUCN « Least Concern ».

### Koï — _Cyprinus rubrofuscus_ (ou _Cyprinus carpio_ selon les sources)

- **Taxonomie** : l'USGS (NAS) range la koï sous _Cyprinus rubrofuscus_ Lacepède, 1803 (carpe
  de l'Amour), synonymes _C. carpio_, _C. carpio haematopterus_, et précise qu'elle est souvent
  identifiée à tort comme carpe européenne (Kottelat & Freyhof 2007). Une note taxonomique de
  2025 (Zenodo) indique que _C. rubrofuscus_ est « largement accepté comme distinct » de
  _C. carpio_ mais génétiquement très proche. Afficher « _Cyprinus rubrofuscus_ (koï, forme
  domestique), souvent nommée _C. carpio_ dans les anciennes sources ».
- **Origine du taxon sauvage** : bassins de l'Amour au fleuve Rouge (synthèse USFWS).
- **Taille, eau, volume, alimentation, longévité, statut légal en France** : **non vérifié**.
  Consulter FishBase et une source vétérinaire avant d'afficher des chiffres.
- **Maladies** : porteuse et vectrice du KHV, capable de fortes mortalités (USGS, élevée).
- **Débutant** : bassin extérieur seulement.

### Poisson rouge — _Carassius auratus_ (#654, consulté le 2026-11-16)

- **Taille** : jusqu'à environ 25 cm en aquarium, 40 cm et plus rapportés (OATA [65]) ;
  30 cm et plus (FishKeeper [66]).
- **Eau** : 4–25 °C, pH 6,0–8,0, 5–19 °dH, ammoniaque et nitrite nuls, nitrate au plus
  20 mg/L au-dessus de l'eau du robinet (OATA) ; FishKeeper : 4–30 °C, pH 7,0–8,0 (neutre à
  alcalin préféré), eau dure jusqu'à 25 dH, éviter l'eau douce et acide. Sans chauffage.
- **Volume** : au moins 100 L pour un adulte, 50 L de plus par adulte (OATA) ; en bassin, au
  moins 60 cm de profondeur par endroits (FishKeeper).
- **Alimentation** : granulés, bâtonnets, flocons, aliments congelés ou vivants ; aliment au
  germe de blé en fin d'automne (FishKeeper).
- **Longévité** : 6 à 8 ans couramment, 20 ans et plus avec une bonne eau (OATA) ; record cité
  de 43 ans (FishKeeper).
- **Cohabitation** : peut vivre seul ou avec d'autres poissons ; ne pas mêler comètes et formes
  de fantaisie (OATA). Koï : aucune des deux sources n'en parle ; règle de jeu (ADR 0147) :
  compatibles (même eau froide, la koï du jeu épargne le poisson rouge). Axolotl et poissons
  tropicaux : incompatibles (températures ; axolotl « sans poissons »).
- **Dans le jeu** : proposé au bassin, sans y être peuplé d'office ; trois robes (commun,
  sarasa, jaune) tirées de la graine. Plage préférée 15–22 °C : **approximation de jeu**.
- **Reproduction** (#675, FishKeeper [66]) : poursuite de frai dès 15 °C ; œufs déposés parmi la
  végétation aquatique (ou sur des « mops » de frai), éclosion en 48 à 72 h selon la
  température ; en grand bassin, d'autres poissons mangent les œufs. **Dans le jeu**
  (`sim/eggs.ts`, ADR 0150) : un groupe sain et nourri, dans une eau bonne entre 15 et 22 °C
  (haut de plage : approximation), fraie le long des tiges des nénuphars ou au pied des
  plantes ; les adultes mangent les œufs à portée ; éclosion sans alevin (hors périmètre).
  Rythme, nombre d'œufs et incubation : **approximations de jeu**.
- **Statut légal en France** : forme domestique, statut **non vérifié** ; ne jamais relâcher
  (OATA).

### Axolotl — _Ambystoma mexicanum_

- **Origine** : lacs Xochimilco et Chalco (Mexique) ; ne survit plus dans la nature que dans
  les canaux de Xochimilco (Caudata Culture).
- **Taille** : adulte typique de 20 à 28 cm en longueur totale, jusqu'à 43 cm (Caudata Culture,
  moyenne). Durée de vie : non vérifié.
- **Température** : trouvé entre 16 et 23 °C dans la nature ; gamétogenèse supprimée à 27 °C
  (Animals/MDPI 2023, élevée). Agave Vet : idéal ≈ 15,5–18 °C, ≈ 21–22 °C tolérable, au-delà
  de ≈ 23 °C stress thermique, perte d'appétit et mort (moyenne).
- **Eau** : pH 6,5–8 (idéal 7,4–7,6), GH 7–14 ; éviter l'eau trop douce ou distillée ; courant
  lent ; changements d'eau de 30 à 50 % une à trois fois par semaine (Agave Vet). **Erreur à ne
  pas reprendre** : « eau saumâtre » (PetMD).
- **Alimentation** : carnivore (détails non vérifiés).
- **Cohabitation** : ne se mélange pas aux poissons (Fishkeeper, secondaire) ; incompatible
  avec tous les poissons tropicaux du jeu (températures).
- **Statut** : IUCN **En danger critique**, CITES **annexe II**, protection spéciale au Mexique
  (AmphibiaWeb, élevée). **France** : l'arrêté du 11 août 2006 classe certaines formes comme
  domestiques (désaccord entre sources secondaires : « albinos blancs et dorés » ou « seule la
  variété albinos ») ; les formes non domestiques relèvent de « Autres Caudata » : **1 à 40
  sans formalité**, certificat de capacité au-delà (arrêtés de 2018 et 2025). Afficher : « légal
  jusqu'à 40 individus sans démarche ; ne jamais relâcher ; à vérifier auprès de la DDPP ».

### Poisson-clown ocellaris — _Amphiprion ocellaris_

- **Origine** : Indo-Pacifique ouest ; récifs et lagons abrités, de 1 à 15 m (FishBase,
  Animal Diversity Web, élevée).
- **Taille** : 11 cm en longueur totale (FishBase).
- **Biologie** : vit dans de grandes anémones (_Heteractis magnifica_, _Stichodactyla
  gigantea_, _S. mertensii_) ; hermaphrodite protandre, couple monogame ; œufs gardés par le
  mâle ; élevé artificiellement pour le commerce (FishBase). En marin c'est l'exception : selon
  UF/IFAS (FA224), plus de 90 % des poissons d'eau douce sont disponibles nés en captivité, mais
  la grande majorité des poissons marins d'ornement sont prélevés dans la nature.
- **Eau** : 23–27 °C, densité 1,020–1,026, pH 8,0–8,5 (Saltcorner, **secondaire** : à
  confirmer avec Reefkeeping).
- **Bac** : ~114 L minimum, plus de 190 L avec une anémone (secondaire). **Il vit très bien sans
  anémone** ; les anémones hôtes sont difficiles et déconseillées au débutant (secondaire).
- **Débutant** : oui pour les individus nés en captivité ; le récif reste plus exigeant que
  l'eau douce. Statut IUCN et CITES : non vérifié.
- **Dans le jeu** (#653, `sim/eggs.ts`) : un couple sain et nourri, dans une eau bonne entre
  24 et 28 °C, colle 4 à 10 œufs orange sur le rocher le plus proche de son anémone (ou sur le
  sable à son pied) ; ils éclosent en larves planctoniques qui quittent le bac. Rythme, nombre
  et incubation : **approximations de jeu** (une vraie ponte compte plusieurs centaines d'œufs
  et éclot en une semaine environ, non vérifié ici).
- **Garde de la ponte** (#670, `sim/clutch-guard.ts`) : le mâle garde les œufs (FishBase,
  ci-dessus). Dans le jeu, le sexe n'est pas modélisé : le premier clown adulte sain et pas trop
  affamé reste à quelques centimètres de la ponte jusqu'à l'éclosion, en va-et-vient devant les
  œufs (la ventilation) avec de courtes sorties vers l'anémone, et ne court pas aux granulés ;
  affamé, il retourne manger et un autre clown le relaie. Rayon, rythme et seuil de faim :
  **approximations de jeu** ; le retrait des œufs morts n'est pas simulé.

### Chirurgien bleu — _Paracanthurus hepatus_ (Linnaeus, 1766)

- **Origine** : Indo-Pacifique ; terrasses récifales externes battues par le courant, 2 à 40 m ;
  juvéniles dans les branches de _Pocillopora eydouxi_ (FishBase, élevée).
- **Taille** : **31 cm** en longueur totale (FishBase). **Alimentation** : zooplancton et
  algues. **Danger** : glande à venin associée à l'épine du pédoncule caudal.
- **Bac** : au moins 300 L pour un individu de moins de 20 cm (OATA, via un revendeur,
  secondaire) ; 700 L et « délicat » selon ReefApp (secondaire). **Désaccord** : FishBase le dit
  « very popular and hardy ». Afficher l'exigence de volume et la difficulté réelle.
- **Origine des sujets** : surtout prélevés dans la nature ; 20 % des poissons échangés
  (14 852 individus) dans un village étudié en Indonésie (npj Ocean Sustainability 2023) ;
  classé « non durable » par une analyse productivité-susceptibilité (Marine Ecology Progress
  Series 2020) malgré son statut IUCN « Least Concern ». Premiers nés en captivité en 2016
  (Université de Floride) ; production commerciale pas encore faisable (UF/IFAS FA224, 2020).
- **Débutant** : **non**.

## Paludarium : espèces réelles et légales

### Cadre légal français (synthèse, à vérifier sur la version consolidée)

- **Texte** : arrêté du 8 octobre 2018 fixant les règles générales de détention d'animaux
  d'espèces non domestiques, modifié par l'arrêté du 5 septembre 2025 (en vigueur le
  10 septembre 2025). Annexe 2 : trois régimes selon l'effectif : (a) pas de formalité,
  (b) déclaration, (c) certificat de capacité et autorisation d'ouverture. Depuis 2025, la
  déclaration se fait **avant** l'acquisition. La Fédération Française d'Aquariophilie juge que
  le texte de 2025 change très peu de choses pour l'aquariophilie.
- **« Autres Caudata »** (hors annexe A CITES/UE et espèces protégées) : 1 à 40 sans formalité,
  certificat au-delà : _Cynops_, _Paramesotriton_, _Pleurodeles waltl_, axolotl non domestique.
- **_Triturus_ spp.** : certificat de capacité dès 1 individu.
- **« Autres espèces de Pipidae (dont _Xenopus_ spp.) »** : certificat dès 1 individu ;
  _Hymenochirus_ appartient aux Pipidae.
- **« Autres Anoures »** (hors annexe A et espèces protégées) : 1 à 40 sans formalité.
- **Espèces indigènes** : l'arrêté du 8 janvier 2021 protège les amphibiens et reptiles de
  métropole ; détention de spécimens prélevés dans la nature interdite, spécimens nés en
  captivité soumis à certificat de capacité. Ne **jamais** proposer de tritons ou grenouilles
  français dans le jeu.

### Grenouille

- **_Xenopus laevis_ (xénope lisse) : à exclure.** Ajouté à la liste des espèces exotiques
  envahissantes préoccupantes pour l'Union (règlement UE 1143/2014) par le règlement
  d'exécution (UE) 2022/1203 ; en France, l'arrêté du 14 février 2018 interdit son
  introduction dans le milieu naturel, sa détention, son transport, son échange, sa vente et
  son achat (Base d'information espèces introduites, élevée). Plus de 15 000 individus capturés
  dans les Deux-Sèvres entre 2011 et 2013 ; vecteur de la chytridiomycose.
- **_Hymenochirus boettgeri_ (grenouille naine africaine)** : famille Pipidae ; du Nigeria et
  du Cameroun au bassin du Congo, eaux calmes et ombragées ; femelles jusqu'à 35 mm ; conditions
  optimales pH 7,6–7,8 et 25 °C (Rabb 1963 via AmphibiaWeb, élevée) ; protocole de laboratoire :
  20–25 °C, pH 7 ± 0,4, 900 ± 100 µS/cm (moyenne) ; prédateur par aspiration, sans langue ;
  timide ; IUCN « Least Concern », pas de CITES. **France** : la ligne « Autres espèces de
  Pipidae » imposerait un certificat de capacité dès 1 individu (lecture littérale, non
  confirmée, souvent ignorée en pratique). **Ne pas la proposer** sans confirmation officielle.
- **Alternative** : un anoure de la ligne « Autres Anoures » (1 à 40 sans formalité),
  aquatique ou semi-aquatique, compatible avec l'environnement, sourcé. Aucun candidat n'a été
  vérifié dans cette recherche : à chercher (#262). À défaut, retirer la grenouille plutôt que
  d'afficher une espèce inexacte.
- **Retenu au cycle 86 (#270, ADR 0064) : _Bombina orientalis_ (sonneur oriental)**, anoure
  semi-aquatique de Corée, du nord-est de la Chine et du sud-est de la Sibérie (1 700 à
  3 000 m) ; adulte d'environ 6 cm ; terrarium à 20–24 °C, une dizaine de centimètres d'eau et
  un quart de berge sèche ; carnivore (insectes, vers, petites proies) (anapsid.org,
  **secondaire**, [59]). Exotique, hors Pipidae : ligne « Autres Anoures » supposée, **non
  confirmée** sur l'annexe 2 (copies FAOLEX et AIDA lues jusqu'aux oiseaux seulement) ;
  confiance faible. Ne pas confondre avec _Bombina variegata_ (sonneur à ventre jaune),
  indigène protégé, ajouté à la liste d'exclusion.

### Triton : _Cynops_ recommandé

- **Triton à ventre de feu chinois, _Cynops orientalis_** (synonyme _Hypselotriton
  orientalis_) : endémique de Chine centrale et orientale ; 6 à 10,3 cm (mâles sous 8 cm) ;
  aquarium **frais 14–20 °C**, éviter au-dessus de 23 °C ; planté, avec petites zones émergées
  et plantes flottantes ; adultes très aquatiques ; carnivore (vers, insectes, crustacés),
  adulte gardé au frais nourri environ tous les trois jours (Caudata Culture, moyenne).
  **Sans poissons** (écart de température, prédation et morsures mutuelles, parasites des
  poissons) et pas avec des amphibiens plus grands et agressifs. Fragile, souvent prélevé dans
  la nature et en mauvais état en animalerie : privilégier les sujets nés en captivité. IUCN
  « Least Concern » (2020), pas de CITES ; **désaccord d'échelle** : reclassé « quasi menacé »
  au niveau national en Chine (Ecology and Evolution 2021). France : « Autres Caudata », 1 à 40
  sans formalité.
- **Triton à ventre de feu japonais, _Cynops pyrrhogaster_** : 10 à 15 cm ; 15,5–24 °C la plus
  grande partie de l'année ; dix ans de vie raisonnables en captivité ; plus facile à trouver né
  en captivité (Reptiles Magazine, **secondaire**). Même régime légal. **Meilleur choix
  pédagogique** si l'on veut encourager les animaux nés en captivité (à recouper).
- _**Pleurodeles waltl**_ : non indigène en France (péninsule Ibérique, nord du Maroc) ;
  « Autres Caudata » ; paramètres non vérifiés.
- **_Paramesotriton_ spp.** : « Autres Caudata » ; tout le genre à l'annexe II CITES depuis la
  CoP18 (2019) ; paramètres non vérifiés.

## Matrice de compatibilité

✅ compatible ; ⚠️ possible sous conditions ; ❌ incompatible (raison indiquée).

|                  | Néon | Guppy                                 | Cory poivré                                      | Koï                        | Axolotl                                                          | Clown              | Chirurgien                    | Hymenochirus                        | Cynops                                 |
| ---------------- | ---- | ------------------------------------- | ------------------------------------------------ | -------------------------- | ---------------------------------------------------------------- | ------------------ | ----------------------------- | ----------------------------------- | -------------------------------------- |
| **Néon**         | —    | ⚠️ pH commun 7,0–7,5, dureté 8–12 dGH | ✅ 22–25 °C, pH 6–7 ; tétras = compagnons idéaux | ❌ bassin froid / tropical | ❌ T° ; axolotl sans poissons                                    | ❌ eau douce / mer | ❌ eau douce / mer            | ⚠️ 25 °C, pH 7–7,5 ; statut légal   | ❌ T° ; Cynops sans poissons           |
| **Guppy**        | ⚠️   | —                                     | ⚠️ pH commun ≈ 7,0, 8–12 dGH                     | ❌ bassin / aquarium       | ❌ T° ; sans poissons                                            | ❌                 | ❌                            | ⚠️ pH 7,6–7,8 ; grenouille timide   | ❌ sans poissons ; T°                  |
| **Cory poivré**  | ✅   | ⚠️                                    | —                                                | ❌                         | ❌ T° ; sans poissons                                            | ❌                 | ❌                            | ⚠️ pH hors plage 6–7 ; fond partagé | ❌ T° ; sans poissons                  |
| **Koï**          | ❌   | ❌                                    | ❌                                               | —                          | ❌ sans poissons ; carpes impliquées dans le déclin de l'axolotl | ❌                 | ❌                            | ❌                                  | ❌ sans poissons                       |
| **Axolotl**      | ❌   | ❌                                    | ❌                                               | ❌                         | —                                                                | ❌                 | ❌                            | ❌ T° 25 / 15–18 °C                 | ❌ pas avec des amphibiens plus grands |
| **Clown**        | ❌   | ❌                                    | ❌                                               | ❌                         | ❌                                                               | —                  | ⚠️ même eau, mais ≥ 300–700 L | ❌                                  | ❌                                     |
| **Chirurgien**   | ❌   | ❌                                    | ❌                                               | ❌                         | ❌                                                               | ⚠️                 | —                             | ❌                                  | ❌                                     |
| **Hymenochirus** | ⚠️   | ⚠️                                    | ⚠️                                               | ❌                         | ❌                                                               | ❌                 | ❌                            | —                                   | ❌ T° 25 / 14–20 °C                    |
| **Cynops**       | ❌   | ❌                                    | ❌                                               | ❌                         | ❌                                                               | ❌                 | ❌                            | ❌                                  | —                                      |

**Règle proposée pour la simulation** : compatibilité = intersection non vide des plages
(T°, pH, GH), même milieu (douce ou marine), et aucune règle d'exclusion (« sans poissons »
pour axolotl et _Cynops_ ; taille, prédation). Le niveau ⚠️ reflète la largeur de
l'intersection. Conséquence : le paludarium d'avant #271 (axolotl + grenouille + triton)
n'était pas cohérent avec ces sources (#262) ; depuis l'ADR 0065, l'axolotl a son bac d'eau
froide.

**Poisson rouge** (#654, ADR 0147) : la règle de température est appliquée par classe d'eau
(`WATER_CLASSES`, `sim/compatibility.ts`) : eau froide (koï, axolotl, poisson rouge) et eau
tropicale (bac tropical, récif) sont déconseillées ensemble ; le paludarium (20 °C) est
tempéré. Poisson rouge ❌ toutes les espèces tropicales (T°), ❌ axolotl (« sans poissons »),
✅ koï (même eau, approximation de jeu), ✅ sonneur et triton (20 °C dans sa plage).

**Crevette cerise face aux grands omnivores du bac tropical** (#429, 2026-11-05) : FishKeeper
réserve la crevette aux bacs de « petits poissons paisibles », les plus grands la prenant pour
un en-cas, sans nommer d'espèce. Décision du jeu (`EXTRA_PREDATORS`, `sim/compatibility.ts`) :

- **xipho** ❌ (ADR 0104 : FishBase compte les crustacés dans son régime) ;
- **molly** ❌, **approximation de jeu** : l'un des deux plus grands nageurs du bac, omnivore
  du zoobenthos [63], aucune source lue ne le cite face à la crevette ;
- **gourami nain** ✅ : Seriously Fish cite la crevette cerise comme compagne possible [62] ;
- **gourami miel** ✅, approximation de jeu : petit et timide, aucune mention [64].

## Espèces candidates (à sourcer une par une avant ajout)

- **Vérifié partiellement** : poisson-mandarin (_Synchiropus splendidus_) : larves dépendantes
  des copépodes vivants, espèce « largement prélevée dans la nature » (Aquaculture 2018 et
  2020, élevée), individus qui refusent tout sauf les proies vivantes (synthèse) : **pas pour
  débutant**. _Hoplisoma sterbai_ (ex-_Corydoras sterbai_) : toxine possible sous stress ou en
  surpopulation (synthèse secondaire, à confirmer sur Planet Catfish).
- **Eau douce tropicale, débutant probable** (chiffres non vérifiés) : platy, molly, xipho,
  endler, danio rerio, rasbora arlequin, tétra citron, tétra braise, corydoras bronze,
  _C. pygmaeus_, ancistrus, otocinclus, gourami miel, betta splendens (robustesse azotée
  documentée, besoins de volume non vérifiés).
- **Plus exigeantes ou sous conditions** : néon cardinalis, nez rouge, barbu de Sumatra (réputé
  mordeur de nageoires, non vérifié), gourami nain, gourami perlé, ramirezi, apistogramma,
  scalaire (prédateur potentiel des néons, non vérifié), discus, loche kuhli, loche clown.
- **Eau froide / bassin** : poisson rouge (ajouté, #654), white cloud (_Tanichthys albonubes_), ide,
  esturgeon : tailles et volumes à documenter.
- **Invertébrés** : _Neocaridina_, _Caridina_, néritine, planorbe, ampullaire (vérifier le
  statut UE des ampullaires) ; consulter SeaLifeBase.
- **Récif** : gobies, demoiselles, chromis, crevette nettoyeuse, oursins et étoiles courants.
- Pour chaque espèce ajoutée : statut légal en France (CITES, espèces exotiques envahissantes
  de l'Union, annexe 2 de l'arrêté de 2018 modifié), origine des sujets (élevage ou nature).

## Idées reçues à corriger dans le wiki

- « Le poisson-clown a besoin d'une anémone » : non (secondaire).
- « Dory est un poisson facile » : non (31 cm, ≥ 300 L, prélèvements jugés non durables).
- « Le poisson-mandarin convient au débutant » : non (copépodes vivants).
- « Les corydoras nettoient le bac » : non, ils ont besoin de leur nourriture.
- « L'axolotl vit en eau saumâtre » : non, eau douce dure, fraîche et lente.
- « Un bocal suffit » : bocaux non filtrés inadaptés (secondaire) ; position d'un organisme de
  référence non vérifiée.
- « 1 cm de poisson par litre » : aucune source fiable ne valide cette règle ; les fiches de
  référence raisonnent en dimensions minimales du bac par espèce. Non vérifié comme « mythe
  officiel ».
- « L'ancistrus se nourrit seul d'algues » : non vérifié.

## Vérifications du 2026-10-28 (cycle 90, #284 et #286)

Recherche faite pour lever les points de confiance faible ; aucune source primaire n'a pu être
lue. Rien n'est relevé ni présenté comme confirmé.

| Point                                                                                                                  | Source visée                                                           | Résultat au 2026-10-28                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statut légal de _Bombina orientalis_ (« Autres Anoures ») et de _Cynops orientalis_ (« Autres Caudata »), #284 point 1 | Légifrance, version consolidée de l'arrêté du 8 octobre 2018, annexe 2 | **Toujours non vérifiable** : Légifrance refuse l'accès depuis l'environnement de l'équipe ; la copie FAOLEX trouvée est l'arrêté du 14 octobre 2019 (Guadeloupe), qui modifie une autre ligne de l'annexe 2 sans la reproduire. Confiances inchangées dans `sim/species-legal.ts` (faible pour le sonneur, moyenne pour le triton) |
| Taille, température et besoins du sonneur oriental, #284 point 2                                                       | AmphibiaWeb, fiche _Bombina orientalis_ (n° 2045)                      | **Toujours non vérifiable** : la page renvoie une vérification anti-robot, aucun contenu lu. Fiche du jeu inchangée (anapsid.org, secondaire, [59])                                                                                                                                                                                 |
| Cohabitation sonneur oriental / triton à ventre de feu, #286 point 2                                                   | Source primaire (étude, fiche universitaire ou vétérinaire)            | **Toujours non vérifiable** : aucune source primaire trouvée sur ce couple ; seule reste [60] (témoignages, faible). ADR 0065 inchangée                                                                                                                                                                                             |

À reprendre par une session qui aura accès à Légifrance et à AmphibiaWeb (ou par Mathis).

### Nouvel essai du 2026-11-05 (cycle 151, #284 point 1)

| Point                                                                                                      | Source visée                                                 | Résultat au 2026-11-05                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lignes « Autres Anoures » (_Bombina orientalis_) et « Autres Caudata » (_Cynops orientalis_) de l'annexe 2 | Légifrance, version consolidée de l'arrêté du 8 octobre 2018 | **Toujours non vérifiable** : Légifrance n'a pas été lisible. Copie préfectorale du texte initial lue (préfecture de Maine-et-Loire, PDF « arrete_du_8_octobre_2018… », [61]) : son article 14 fixe bien le seuil d'autorisation des amphibiens adultes au-delà de **40** animaux, cohérent avec « 1 à 40 sans formalité » ; l'extraction du PDF s'arrête dans l'annexe 2 avant les amphibiens, les deux lignes n'ont donc pas été lues. Texte initial seulement, pas la version consolidée (arrêté modificatif du 5 septembre 2025 non repris). Confiances inchangées dans `sim/species-legal.ts` |

## Données d'écologie (#784 eau douce tropicale, #785 mer et eau froide, #786 paludarium)

Première tranche de #727 (`docs/ECOSYSTEME.md` § 3.1), dans `sim/species-ecology.ts`, exposée
par la fiche (`ecology`) mais **pas encore utilisée** par la simulation. Taille, volume minimal,
groupe, températures, pH et dureté conseillée restent ceux de la fiche ; s'ajoutent :

| Donnée                           | Sourcé                                                                                                                                                                | Approximation de jeu                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Classe de densité                | Poissons tropicaux : 1,5 à 2 L par cm (RSPCA) ; eau froide : 4 L par cm (RSPCA)                                                                                       | Invertébrés (1 à 1,5 L/cm) et récif (2 à 3 L/cm) : à sourcer                                                     |
| Volume par adulte supplémentaire | Néritine : 40 L (Aquarium Breeder, « 1 pour 20 à 40 L »)                                                                                                              | Aucune source pour les autres : la classe de densité s'applique                                                  |
| Dureté tolérée                   | —                                                                                                                                                                     | Toutes : plage conseillée élargie de quelques degrés (aucune source ne distingue préférée et tolérée)            |
| Régime détaillé                  | Ancistrus, otocinclus (Seriously Fish) ; molly (Seriously Fish) ; xipho (FishBase) ; crevette cerise (Garnelio, FishKeeper) ; néritine (Aquarium Breeder, FishKeeper) | Les autres                                                                                                       |
| Proies                           | Guppy, corydoras, rasbora, kuhli, danio : au moins les jeunes crevettes (Practical Fishkeeping) ; xipho (FishKeeper)                                                  | Tétra citron, gourami nain, platy, molly : jeunes crevettes                                                      |
| Prédateurs                       | — (la source de chaque prédateur de la crevette cerise est portée par ses proies, ligne au-dessus)                                                                    | Crevette cerise : liste mixte, donc approximation (point 17) ; les autres : aucun connu parmi les espèces du jeu |
| Comportement                     | Gourami nain, ancistrus, xipho territoriaux ; danio nageur rapide (Seriously Fish, FishKeeper)                                                                        | Les autres ; aucun mangeur de nageoires retenu dans la tranche                                                   |

La crevette nettoyeuse (récif) est rangée dans cette tranche par l'issue : classe « récif » et
dureté tolérée (KH) en approximation.

### Mer et eau froide (#785)

Deuxième tranche, mêmes champs. En mer, la dureté tolérée est une KH (alcalinité) élargie
autour de celle du récif de la fiche (KH 7–11).

| Donnée                           | Sourcé                                                                                                                                                                                           | Approximation de jeu                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Classe de densité                | Poisson rouge : eau froide, 4 L par cm (RSPCA)                                                                                                                                                   | Koï : eau froide (la règle de la RSPCA vise le poisson rouge) ; les six poissons de mer : récif (2 à 3 L/cm, à sourcer)      |
| Volume par adulte supplémentaire | Poisson rouge : 100 L pour le premier adulte, puis 50 L par adulte (OATA) ; **désaccord** RSPCA, au moins 60 L chacun : le jeu garde l'OATA, plus stricte jusqu'à 4 adultes seulement (point 15) | Koï : aucun (bassin de 800 L de la fiche, non vérifié, point 3) ; mer : aucun, la classe de densité s'applique               |
| Dureté tolérée                   | —                                                                                                                                                                                                | Toutes : plage conseillée élargie (KH 6–12 en mer, GH 4–22 pour le poisson rouge, GH 4–25 pour la koï)                       |
| Régime détaillé                  | Chromis (Wikipédia, secondaire) ; gramma (Wikipédia, secondaire) ; blennie (FishBase, niveau trophique 2,0) ; poisson rouge (FishKeeper)                                                         | Clown, chirurgien, gobie, koï ; granulés du chromis et de la blennie                                                         |
| Proies                           | Poisson rouge : crevettes cerises adultes (Practical Fishkeeping)                                                                                                                                | Les autres : aucune parmi les espèces du jeu                                                                                 |
| Prédateurs                       | —                                                                                                                                                                                                | Aucun connu parmi les espèces du jeu (les prédateurs du chromis, « grands poissons », n'y sont pas)                          |
| Comportement                     | Gramma territorial (Wikipédia, secondaire)                                                                                                                                                       | Clown, chirurgien, blennie territoriaux ; chirurgien et chromis nageurs rapides ; aucun mangeur de nageoires dans la tranche |

### Paludarium (#786) : données obligatoires

Dernière tranche, mêmes champs, dans `sim/species-ecology-amphibiens.ts`. Les données
d'écologie sont désormais **obligatoires** : `SpeciesSheet.ecology` n'est plus optionnel et
`SPECIES_ECOLOGY` doit avoir une entrée par espèce (le compilateur l'impose, un test le
vérifie pour les 29 espèces).

**Part d'eau** : la densité d'un amphibien se compte sur l'eau du milieu, berge déduite.
`AMPHIBIAN_WATER_SHARE` donne la part du volume remplie d'eau et `amphibianWaterLiters` le
volume d'eau d'un milieu ; la classe « amphibien » et le volume minimal de la fiche s'y
appliquent (point 18).

| Donnée                           | Sourcé                                                         | Approximation de jeu                                                                                                          |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Part d'eau                       | Sonneur oriental : 0,75, « un quart de berge sèche » (Anapsid) | Axolotl : 1 (entièrement aquatique) ; triton : 0,9 (« très aquatique, petites zones émergées », Caudata Culture, non chiffré) |
| Classe de densité                | —                                                              | Amphibien : 3 à 4 L d'eau par cm (3 L/cm redonnent les 75 L de la fiche de l'axolotl de 25 cm)                                |
| Volume par adulte supplémentaire | —                                                              | Aucun : la classe de densité s'applique                                                                                       |
| Dureté tolérée                   | —                                                              | Plage conseillée élargie (GH 5–22 pour l'axolotl, GH 3–18 pour le sonneur et le triton)                                       |
| Régime détaillé                  | —                                                              | Granulés pour l'axolotl et le triton ; aucun aliment du bac pour le sonneur (proies vivantes seulement)                       |
| Proies, prédateurs               | —                                                              | Aucun parmi les espèces du jeu : les trois vivent sans poissons ni crevettes                                                  |
| Comportement                     | —                                                              | Ni territorial, ni mangeur de nageoires, ni nageur rapide                                                                     |

Les exclusions légales (_Xenopus_, Pipidae dont _Hymenochirus_, _Triturus_, indigènes
protégées comme _Bombina variegata_) restent testées avec la tranche.

## Capacité du bac (#807, tranche 1 de #729)

Le calcul de capacité (`sim/tank-capacity.ts`, ADR 0171) lit les données ci-dessus et la fiche ;
chaque valeur garde la source ou le statut de son champ, repris dans la raison d'un verdict.

| Valeur                                  | Sourcé                                                                       | Approximation de jeu                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Plafond et conseillé                    | Tropicaux : 1,5 L/cm (plafond) et 2 L/cm (conseillé), RSPCA                  | Bornes basse et haute des classes invertébré, récif et amphibien                         |
| Besoin avec volume par adulte en plus   | Poisson rouge : 100 L puis 50 L (OATA, désaccord RSPCA, point 15)            | Néritine : la première compte aussi 40 L (le volume minimal de la fiche, 30 L, est plus bas) |
| Âge des animaux                         | —                                                                            | Tout animal compte comme un adulte                                                       |
| Volume d'eau réel                       | —                                                                            | Plantes non déduites ; coraux et anémones à la moitié de leur boîte ; sol échantillonné au cm |

## Brouteurs d'algues (#833, tranche 1 de #732)

Le broutage (`sim/grazing.ts`, ADR 0179) lit le régime ci-dessus (algues) et la table `GRAZERS`.

| Valeur                                   | Sourcé                                                                                       | Approximation de jeu                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Vitesse de broutage                      | —                                                                                            | Couverture par seconde : ancistrus 1/150, néritine 1/200, otocinclus 1/300, crevette cerise 1/600      |
| Faim calmée par une plaque mangée        | —                                                                                            | Une plaque pleine calme une faim pleine                                                                |
| Algues dures                             | Crevettes : n'en viennent pas à bout (Garnelio)                                              | Deux plaques sur huit ; mangées par la néritine et l'ancistrus, pas par l'otocinclus                   |
| Faim qui use la santé sans nourriture    | Néritine : meurt de faim sans algues ni nourriture d'appoint (Aquarium Breeder)              | Crevette cerise : nourrie par le biofilm, non simulé, sa faim reste sans effet (tranche 2 de #732)     |
| Biofilm                                  | —                                                                                            | Non simulé                                                                                             |

## Verdicts par paire (#816, tranche 1 de #730)

Calcul pur `verdict(a, b)` (`sim/verdict.ts`, ADR 0174). Depuis #818 (tranche 2), il est lu
par l'interface : liste « Espèces encore possibles » de la section Population
(`sim/possible-species.ts`) et raisons sourcées sous l'espèce ajoutée. Les rivalités des
nageurs et les mélanges déconseillés du tableau de bord suivent toujours `sim/compatibility.ts`. Règles de
`docs/ECOSYSTEME.md` § 3.2 : classes d'eau (douce ou mer ; froide ou tropicale), plages
préférées puis tolérées (température, pH, dureté), prédation (listes nominatives des données
d'écologie, sinon règle de taille des prédateurs du jeu), comportement (territoriaux, mangeurs
de nageoires, nageurs rapides et lents, « sans poissons »). ✅ compatible ; ⚠️ précautions ;
❌ incompatible.

Matrice générée par `verdictMatrixMarkdown()` (`sim/verdict-matrix.ts`, commande dans son
en-tête) ; la regénérer à chaque changement des fiches, de l'écologie ou des règles. Les paires
de classes d'eau différentes sont incompatibles par la classe seule (approximation de jeu, le
classement du jeu) et ne sont pas détaillées.

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. néon | — | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 2. guppy | ✅ | — | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 3. corydora | ✅ | ✅ | — | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 4. koï | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 5. axolotl | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 6. sonneur oriental | ✅ | ✅ | ✅ | ❌ | ❌ | — | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 7. triton à ventre de feu | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 8. poisson-clown | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| 9. chirurgien bleu | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| 10. rasbora arlequin | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ |
| 11. tétra citron | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 12. loche kuhli | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | — | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| 13. gourami nain | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ |
| 14. platy | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 15. danio zébré | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 16. ancistrus commun | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ❌ |
| 17. otocinclus | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 18. tétra braise | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| 19. molly | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | — | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| 20. gourami miel | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 21. chromis vert | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 22. gobie à crevette jaune | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 23. gramma royal | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | — | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| 24. crevette nettoyeuse | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | — | ✅ | ❌ | ❌ | ❌ | ❌ |
| 25. blennie bicolore | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| 26. xipho | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ⚠️ | ✅ | ❌ |
| 27. crevette cerise | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | — | ✅ | ❌ |
| 28. néritine zèbre | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | — | ❌ |
| 29. poisson rouge | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |

| Paire | Verdict | Raisons et sources |
|---|---|---|
| néon et triton à ventre de feu | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| néon et molly | ⚠️ | dureté (précautions) [documentation du projet (Seriously Fish ; FishBase : dH 1–2, désaccord) ; https://www.seriouslyfish.com/species/poecilia-sphenops (15 à 30 °dGH)] |
| guppy et triton à ventre de feu | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| guppy et crevette cerise | ⚠️ | guppy : mange les jeunes (précautions) [https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/ (mange au moins les jeunes crevettes)] |
| corydora et triton à ventre de feu | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| corydora et molly | ⚠️ | dureté (précautions) [documentation du projet (Seriously Fish) ; https://www.seriouslyfish.com/species/poecilia-sphenops (15 à 30 °dGH)] |
| corydora et crevette cerise | ⚠️ | corydora : mange les jeunes (précautions) [https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/ (mange au moins les jeunes crevettes)] |
| koï et axolotl | ❌ | axolotl : vit sans poissons (incompatible) [documentation du projet (FishKeeper, secondaire : ne se mélange pas aux poissons)] |
| koï et sonneur oriental | ❌ | koï : mange les plus petits (taille) (incompatible) [approximation de jeu] |
| koï et triton à ventre de feu | ❌ | koï : mange les plus petits (taille) (incompatible) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| axolotl et sonneur oriental | ❌ | température (précautions) [documentation du projet (WSAVA/VIN ; PMC10948202) ; https://anapsid.org/bombina.html (secondaire) (température du terrarium)] ; axolotl : mange les plus petits (taille) (incompatible) [approximation de jeu] |
| axolotl et poisson rouge | ❌ | axolotl : vit sans poissons (incompatible) [documentation du projet (FishKeeper, secondaire : ne se mélange pas aux poissons)] |
| triton à ventre de feu et rasbora arlequin | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et tétra citron | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et loche kuhli | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et gourami nain | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et platy | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et danio zébré | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et ancistrus commun | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et otocinclus | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et tétra braise | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et molly | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et gourami miel | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et xipho | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et crevette cerise | ❌ | triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et néritine zèbre | ❌ | température (précautions) [approximation de jeu] ; triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| triton à ventre de feu et poisson rouge | ❌ | triton à ventre de feu : vit sans poissons (incompatible) [documentation du projet (Caudata Culture : sans poissons)] |
| poisson-clown et chirurgien bleu | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| poisson-clown et gramma royal | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| poisson-clown et blennie bicolore | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| chirurgien bleu et gramma royal | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| chirurgien bleu et blennie bicolore | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| rasbora arlequin et molly | ⚠️ | pH (précautions) [approximation de jeu] ; dureté (précautions) [approximation de jeu] |
| rasbora arlequin et crevette cerise | ⚠️ | rasbora arlequin : mange les jeunes (précautions) [https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/ (mange au moins les jeunes crevettes)] |
| rasbora arlequin et néritine zèbre | ⚠️ | pH (précautions) [approximation de jeu] |
| tétra citron et molly | ⚠️ | dureté (précautions) [approximation de jeu] |
| tétra citron et crevette cerise | ⚠️ | tétra citron : mange les jeunes (précautions) [approximation de jeu] |
| loche kuhli et platy | ⚠️ | pH (précautions) [approximation de jeu] |
| loche kuhli et molly | ⚠️ | pH (précautions) [approximation de jeu] ; dureté (précautions) [approximation de jeu] |
| loche kuhli et xipho | ⚠️ | pH (précautions) [approximation de jeu] |
| loche kuhli et crevette cerise | ⚠️ | loche kuhli : mange les jeunes (précautions) [https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/ (mange au moins les jeunes crevettes)] |
| loche kuhli et néritine zèbre | ⚠️ | pH (précautions) [approximation de jeu] |
| gourami nain et ancistrus commun | ⚠️ | deux espèces territoriales (précautions) [https://www.seriouslyfish.com/species/trichogaster-lalius (mâle parfois agressif) ; https://www.seriouslyfish.com/species/ancistrus-cf-cirrhosus (envers ses congénères)] |
| gourami nain et xipho | ⚠️ | deux espèces territoriales (précautions) [https://www.seriouslyfish.com/species/trichogaster-lalius (mâle parfois agressif) ; https://fishkeeper.co.uk/fish/freshwater/livebearers/swordtail (les mâles se disputent)] |
| gourami nain et crevette cerise | ⚠️ | gourami nain : mange les jeunes (précautions) [approximation de jeu] |
| platy et crevette cerise | ⚠️ | platy : mange les jeunes (précautions) [approximation de jeu] |
| danio zébré et crevette cerise | ⚠️ | danio zébré : mange les jeunes (précautions) [https://www.practicalfishkeeping.co.uk/features/what-can-i-keep-with-shrimp/ (petits danios : au moins les jeunes crevettes)] |
| ancistrus commun et xipho | ⚠️ | deux espèces territoriales (précautions) [https://www.seriouslyfish.com/species/ancistrus-cf-cirrhosus (envers ses congénères) ; https://fishkeeper.co.uk/fish/freshwater/livebearers/swordtail (les mâles se disputent)] |
| otocinclus et molly | ⚠️ | dureté (précautions) [approximation de jeu] |
| tétra braise et molly | ⚠️ | pH (précautions) [approximation de jeu] ; dureté (précautions) [approximation de jeu] |
| tétra braise et néritine zèbre | ⚠️ | pH (précautions) [approximation de jeu] |
| molly et crevette cerise | ⚠️ | dureté (précautions) [approximation de jeu] ; molly : mange les jeunes (précautions) [approximation de jeu] |
| gramma royal et blennie bicolore | ⚠️ | deux espèces territoriales (précautions) [approximation de jeu] |
| xipho et crevette cerise | ⚠️ | xipho : mange les jeunes (précautions) [https://fishkeeper.co.uk/fish/freshwater/livebearers/swordtail (mange alevins et crevettes naines)] |

Désaccords entre sources :

- néon et molly : dureté (précautions) [documentation du projet (Seriously Fish ; FishBase : dH 1–2, désaccord) ; https://www.seriouslyfish.com/species/poecilia-sphenops (15 à 30 °dGH)]

## Non vérifié et désaccords

1. Néon : 21–25 °C (Seriously Fish 2026) / 26,5–29 °C (ancien texte) / 21–29 °C (importateur) /
   20–26 °C (FishBase via `docs/SOINS.md`).
2. Corydoras poivré : 22–26 °C (Seriously Fish) / 16–24 °C (Animalia.bio, secondaire). Non
   arbitré : le bac tropical (24 °C, ADR 0067) est dans les deux plages.
3. Koï : _C. rubrofuscus_ / _C. carpio_ ; tous les paramètres chiffrés non vérifiés.
4. Axolotl : « eau saumâtre » (PetMD) contredite ; « nitrite 1 ppm » (Agave Vet) probablement
   erroné ; formes domestiques en France : désaccord entre sources secondaires.
5. Chirurgien bleu : « hardy » (FishBase) / « delicate » (ReefApp) ; 300 L / 700 L.
6. _Cynops orientalis_ : LC mondial (IUCN 2020) / « quasi menacé » national en Chine.
7. _Hymenochirus_ : régime légal français non confirmé par l'administration.
8. Poisson-clown : paramètres d'eau de source secondaire ; IUCN non vérifié.
9. Espèces candidates : paramètres non vérifiés.
10. Durée de quarantaine et règle « 1 cm/L » : non vérifiées.
11. Platy et molly, gestation (#674, 2026-11-17) : aucune source lue ne la chiffre ; le jeu leur
    donne le calendrier du guppy (portée de 300 s simulées, 2 à 6 alevins, adulte à 1 200 s,
    `sim/fry.ts`) : **approximation de jeu**. Le sexe d'un individu, non rendu, suit l'alternance
    des identifiants (impair = femelle).
12. Néritine, volume par adulte (#784) : « 1 pour 20 à 40 L » (Aquarium Breeder), fourchette
    sans critère ; le jeu garde la borne stricte, 40 L.
13. Gourami nain et crevettes (#784) : Practical Fishkeeping cite les « grands gouramis » ; que
    le gourami nain mange les jeunes crevettes est une **approximation de jeu**.
14. Dureté du guppy : 8–30 °dGH (Seriously Fish) / dH 9–19 (FishBase) ; la fiche garde
    Seriously Fish et écrit « désaccord » dans sa référence (#788).
15. Poisson rouge, volume (#785) : 100 L puis 50 L par adulte supplémentaire (OATA) / au moins
    60 L chacun (RSPCA) ; le jeu garde l'OATA et l'écrit dans la référence de la fiche
    (`ecology.extraLitersPerAdult`). L'OATA n'est plus stricte que jusqu'à 4 adultes (250 L contre
    240 L) ; les deux règles s'égalisent à 5 (300 L) et la RSPCA est plus stricte au-delà
    (6 adultes : 360 L contre 350 L). Comportement fixé par un test (#790) ; quand la simulation
    lira ce volume (#728 et suivantes), elle pourra garder le maximum des deux règles.
16. Koï, volume du bassin (#785) : aucune source consultable pendant le cycle (accès réseau des
    agents limité aux registres de paquets) ; 800 L restent une **approximation de jeu**.
17. Prédateurs de la crevette cerise (#788) : la liste mêle prédateurs sourcés (guppy, corydoras,
    rasbora, kuhli, danio et poisson rouge : Practical Fishkeeping ; xipho : FishKeeper) et
    approximations (tétra citron, gourami nain, platy, molly). Le champ `predators` de la crevette
    est donc une **approximation de jeu** ; la source de chaque prédateur reste dans son champ
    `prey`, pour qu'aucun champ sourcé ne recouvre une valeur non sourcée (testé).
18. Amphibiens, volume (#786) : aucune source consultable ne donne de litres par cm pour les
    amphibiens ; la classe « amphibien » (3 à 4 L d'eau par cm) et les parts d'eau de l'axolotl
    et du triton sont des **approximations de jeu**, choisies pour que le volume minimal de
    chaque fiche, berge déduite, loge un adulte au plafond de densité (testé).
    **Arbitré** (#813, ADR 0177) : quatre fiches de soins secondaires ([67] à [70], dont une
    rédigée par une vétérinaire) donnent un volume de **terrarium entier** pour le triton
    (56,8 L pour un, 18,9 L par adulte de plus) et le sonneur (37,9 L pour un couple ;
    désaccord : 56,8 L pour cinq selon [70]). Décision : sonneur et triton seront comptés sur
    le volume du milieu, berge comprise ; l'axolotl reste compté sur l'eau. **Mis en œuvre**
    au cycle 307 (`sim/semi-terrestrial-needs.ts`) : au paludarium par défaut, 2 sonneurs et
    1 triton demandent 94,6 L des 105 L du milieu (90 %) ; un second triton est refusé.
19. Capacité des bacs par défaut (#807) : au plafond, le bassin (7 koïs de 60 cm, eau froide
    4 L/cm, règle de la RSPCA pour le poisson rouge appliquée à la koï) demande 1 680 L pour
    834 L d'eau, et le paludarium (classe « amphibien » 3 L/cm, approximation) 114 L pour 45,7 L
    d'eau réelle, berge déduite. **Arbitré** (#811, ADR 0173) : populations par défaut ramenées
    sous la capacité (bassin : 3 koïs, 86 % ; paludarium : 2 sonneurs, 79 %, tritons proposés
    seulement), faute de source donnant des litres d'eau par cm pour les koïs adultes ou les
    amphibiens (les fiches de soins secondaires donnent un volume de terrarium entier).

20. Verdict par paire (#816, ADR 0174) : la fraction de taille de la prédation (un tiers), les
    longues nageoires du guppy et toutes les plages de pH des fiches sont des **approximations
    de jeu** ; Practical Fishkeeping cite les « grands gouramis » face aux crevettes, le jeu
    garde le gourami nain parmi les mangeurs de jeunes en approximation (point 13). Aucun
    mangeur de nageoires ni nageur lent dans le jeu : les règles existent, sans paire concernée.

## Bibliographie

_(secondaire)_ : boutique, blog, forum, synthèse encyclopédique ou article non scientifique, à
remplacer par une source primaire.

1. Base d'information espèces introduites, _Xenopus laevis_ — https://base-information-especes-introduites.fr/espece/xenopus-laevis/
2. UF/IFAS EDIS — https://journals.flvc.org/edis/article/download/118012/115984/172109
3. Ammonia in Aquatic Systems (UF/IFAS FA16) — https://extension.rwfm.tamu.edu/wp-content/uploads/sites/8/2013/09/Ammonia-in-Aquatic-Systems1.pdf
4. NMSU, circulaire CR680 — https://pubs.nmsu.edu/_circulars/CR680/
5. Camargo et al. 2005, Nitrate Toxicity to Aquatic Animals — https://www.researchgate.net/publication/8063535_Nitrate_Toxicity_to_Aquatic_Animals_A_Review_With_New_Data_for_Freshwater_Invertebrates
6. Monster Fish Keepers, toxicité du nitrate — https://www.monsterfishkeepers.com/forums/threads/nitrate-toxicity.765019/ _(secondaire : forum)_
7. PetMD, intoxication au nitrate — https://www.petmd.com/fish/conditions/toxicity/nitrate-poisoning-fish
8. BMC Zoology 2023 (CL50 du betta) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10621081/
9. Agave Vet, fiche axolotl — https://agavevetcare.com/wp-content/uploads/2023/10/Axolotl-Care-Sheet.pdf
10. Seriously Fish, _Paracheirodon innesi_ — https://www.seriouslyfish.com/species/paracheirodon-innesi
11. Neon tetra — https://en.wikipedia.org/wiki/Neon_tetra _(secondaire)_
12. USGS NAS, koï — https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=3294
13. Quality Marine, _Paracheirodon innesi_ — https://www.qualitymarine.com/news/paracheirodon-innesi/ _(secondaire)_
14. Seriously Fish, _Poecilia reticulata_ — https://www.seriouslyfish.com/species/poecilia-reticulata
15. Guppy — https://en.wikipedia.org/wiki/Guppy _(secondaire)_
16. Seriously Fish, _Corydoras paleatus_ — https://www.seriouslyfish.com/species/corydoras-paleatus
17. _Hoplisoma paleatum_ — https://en.wikipedia.org/wiki/Hoplisoma_paleatum _(secondaire)_
18. Seriously Fish, genre _Corydoras_ — https://www.seriouslyfish.com/genus/corydoras/
19. Animalia, _Corydoras paleatus_ — https://animalia.bio/corydoras-paleatus _(secondaire)_
20. Science.gov, _Corydoras paleatus_ — https://www.science.gov/topicpages/f/fish+corydoras+paleatus
21. Zenodo, note taxonomique 2025 — https://zenodo.org/records/15822600
22. Britannica, koï — https://www.britannica.com/animal/koi-fish _(secondaire)_
23. _Cyprinus rubrofuscus_ — https://en.wikipedia.org/wiki/Cyprinus_rubrofuscus _(secondaire)_
24. USFWS, Ecological Risk Screening Summary, koï — https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Koi.pdf
25. Caudata Culture, _Ambystoma mexicanum_ — https://www.caudata.org/cc/species/Ambystoma/A_mexicanum.shtml
26. MDPI Animals 2023, axolotl — https://www.mdpi.com/2076-2615/13/5/874
27. PetMD, axolotl — https://www.petmd.com/reptile/species/axolotl-ambystoma-mexicanum
28. Fishkeeper, axolotl — https://www.fishkeeper.co.uk/fish/freshwater/miscellaneous/axolotl _(secondaire)_
29. Axolotl — https://en.wikipedia.org/wiki/Axolotl _(secondaire)_
30. AmphibiaWeb, _Ambystoma mexicanum_ — https://amphibiaweb.org/cgi/amphib_query?where-genus=Ambystoma&where-species=mexicanum&account=mol
31. Code animal, axolotl — https://www.code-animal.com/axolotl-nouvelle-mode-dans-des-zoos/ _(secondaire)_
32. Kohen Avocats, détention d'animaux sauvages — https://kohenavocats.com/animal-sauvage-chez-soi-renard-tortue-loutre-axolotl-declaration-certificat-capacite-sanctions-2026/ _(secondaire, fiabilité faible)_
33. Animal Diversity Web, _Amphiprion ocellaris_ — https://animaldiversity.org/accounts/Amphiprion_ocellaris/
34. FishBase, _Amphiprion ocellaris_ — https://www.fishbase.se/Fieldguide/FieldGuideSummary.php?genusname=Amphiprion&speciesname=ocellaris&c_code=702
35. Saltcorner, poisson-clown — http://www.saltcorner.com/AquariumLibrary/browsespecies.php?CritterID=22&filter=0 _(secondaire)_
36. FishLore, poisson-clown — https://www.fishlore.com/Profiles-ClownFish.htm _(secondaire)_
37. FishBase, _Paracanthurus hepatus_ — https://www.fishbase.se/summary/Paracanthurus-hepatus.html
38. ReefApp, _Paracanthurus hepatus_ — https://reefapp.net/en/encyclopedia/paracanthurus-hepatus _(secondaire)_
39. Tropical Fish Co, chirurgien bleu (recommandation OATA citée) — https://tropicalfishco.co.uk/products/palette-surgeonfish-paracanthurus-hepatus _(secondaire)_
40. npj Ocean Sustainability 2023, commerce en Indonésie — https://www.nature.com/articles/s44183-023-00033-7
41. Baillargeon et al. 2020 (MEPS), analyse productivité-susceptibilité — https://cites.org/sites/default/files/eng/prog/marine_ornamental_fishes/workshops/brisbane_052024/baillargeon_et_al_2020_psa_of_data_limited_fisheries_marpol.pdf
42. Marcelli et al. 2016, _Paracanthurus hepatus_ en Méditerranée — https://link.springer.com/article/10.1007/s12526-016-0573-3
43. La Ferme Tropicale, législation — https://www.lafermetropicale.com/content/39-legislation _(secondaire)_
44. Fédération Française d'Aquariophilie, arrêté de 2025 — https://www.fedeaqua.org/pratique/legislation/2853-modification-de-larrete-du-8-octobre-2018-fixant-les-regles-generales-de-detention-danimaux-despeces-non-domestiques
45. Texte de l'arrêté du 8 octobre 2018 — https://www.eleveur-de-carduelines.com/article/arrete-du-8-octobre-2018-fixant-les-regles-generales-de-detention-danimaux-despeces-non-domestiques/ _(secondaire : reproduction du texte)_
46. INERIS AIDA, arrêté du 5 septembre 2025 — https://aida.ineris.fr/reglementation/arrete-050925-modifiant-larrete-8-octobre-2018-fixant-regles-generales-detention
47. Kohen Avocats, espèces interdites en bassin et aquarium — https://kohenavocats.com/perche-soleil-poisson-chat-gambusie-xenope-bassin-aquarium-interdit-vendre-relacher-risques-2026/ _(secondaire)_
48. AmphibiaWeb, _Hymenochirus boettgeri_ — https://amphibiaweb.org/cgi/amphib_query?where-genus=Hymenochirus&where-species=boettgeri
49. Housing and Care for _Hymenochirus boettgeri_ (protocole) — https://www.researchgate.net/publication/376066713_Housing_and_Care_for_Hymenochirus_boettgeri_v1
50. Ecology and Evolution 2021 (_Cynops orientalis_) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8328465/
51. Caudata Culture, _Cynops orientalis_ — https://www.caudata.org/cc/species/Cynops/C_orientalis.shtml
52. Caudata Culture, FAQ — https://www.caudata.org/cc/faq/FAQcar.shtml
53. Reptiles Magazine, _Cynops pyrrhogaster_ — https://reptilesmagazine.com/japanese-fire-bellied-newt-care-sheet/ _(secondaire)_
54. _Pleurodeles waltl_ — https://en.wikipedia.org/wiki/Iberian_ribbed_newt _(secondaire)_
55. Aquaculture 2018, poisson-mandarin — https://www.sciencedirect.com/science/article/abs/pii/S0044848617319737
56. Aquaculture 2020, poisson-mandarin — https://www.sciencedirect.com/science/article/abs/pii/S0044848619316175
57. _Synchiropus splendidus_ — https://en.wikipedia.org/wiki/Synchiropus_splendidus _(secondaire)_
58. _Hoplisoma sterbai_ — https://en.wikipedia.org/wiki/Sterba%27s_corydoras _(secondaire)_
59. _Bombina orientalis_, fiche de soins — https://anapsid.org/bombina.html _(secondaire, consultée le 2026-10-27, #270)_
60. Caudata.org, fil « FB Newts + FB Toad = ?? » (avril 2007) — https://www.caudata.org/threads/fb-newts-fb-toad.3236/ _(témoignages, faible, consulté le 2026-10-27, #271)_
61. Arrêté du 8 octobre 2018 fixant les règles générales de détention d'animaux d'espèces non domestiques, copie préfectorale (texte initial) — https://www.maine-et-loire.gouv.fr/contenu/telechargement/9307/72734/file/arrete_du_8_octobre_2018_fixant_les_regles_generales_de_detention_d_animaux_d_especes_non_domestiques_.pdf _(officielle, non consolidée, consultée le 2026-11-05, #284)_
62. Seriously Fish, _Trichogaster lalius_ — https://www.seriouslyfish.com/species/trichogaster-lalius _(consultée le 2026-11-05, #429 : la crevette cerise y est citée comme compagne possible du gourami nain)_
63. Seriously Fish, _Poecilia sphenops_ — https://www.seriouslyfish.com/species/poecilia-sphenops _(consultée le 2026-11-05, #429 : omnivore, zoobenthos et détritus ; aucune mention des crevettes)_
64. Seriously Fish, _Trichogaster chuna_ — https://www.seriouslyfish.com/species/trichogaster-chuna _(consultée le 2026-11-05, #429 : petits invertébrés dans la nature ; aucune mention des crevettes)_
65. OATA (Ornamental Aquatic Trade Association), « How to look after goldfish in an aquarium » — https://ornamentalfish.org/what-we-do/advice-information/care-sheets/caresheets-coldwater-fish/how-to-look-after-goldfish-in-an-aquarium-fishtank/ _(consultée le 2026-11-16, #654 : 4–25 °C, pH 6–8, 5–19 °dH, 100 L + 50 L par adulte, 25 cm en aquarium)_
66. FishKeeper, goldfish — https://www.fishkeeper.co.uk/fish/freshwater/pond-fish/goldfish- _(secondaire : boutique ; consultée le 2026-11-16, #654 : 4–30 °C, pH 7–8, sociable)_
67. PetMD, « Fire-Bellied Newt Care Sheet », M. Zayas, DVM (2023) — https://www.petmd.com/exotic/fire-bellied-newt-care-sheet _(secondaire, rédigée par une vétérinaire ; consultée le 2026-11-25, #813 : 15 gallons pour un triton, 20 pour deux, milieu entier)_
68. Reptiles Magazine, « Chinese Fire-bellied Newt » — https://reptilesmagazine.com/Frog-Amphibian-Species/Chinese-Fire-bellied-Newt/ _(secondaire, rédaction ; consultée le 2026-11-25, #813 : 20 gallons pour quatre tritons au plus)_
69. Reptiles Magazine, « Oriental Fire-bellied Toad » — https://reptilesmagazine.com/Frog-Amphibian-Species/Oriental-Fire-bellied-Toad/ _(secondaire, rédaction ; consultée le 2026-11-25, #813 : 10 gallons pour un couple au plus, partie sèche et partie en eau)_
70. amphibiancare.com, « Fire-Bellied Toad » (2008) — https://www.amphibiancare.com/frogs/caresheets/firebelliedtoad.html _(secondaire, sans auteur ; consultée le 2026-11-25, #813 : 15 gallons, 61 × 30 × 30 cm, pour cinq adultes ; berge sur la moitié aux deux tiers du sol)_
