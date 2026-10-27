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
3. **Niveaux de confiance** : *élevée* (base scientifique ou taxonomique, étude publiée, texte
   réglementaire, fiche universitaire) ; *moyenne* (base aquariophile reconnue et maintenue,
   fiche de clinique vétérinaire) ; *faible / secondaire* (boutique, blog, forum, synthèse
   encyclopédique) ; *non vérifié*. Les sources secondaires sont à remplacer par des primaires.
4. **Statut légal** : le droit français a été lu à partir de l'arrêté du 8 octobre 2018 et de
   l'arrêté modificatif du 5 septembre 2025, **pas** de la version consolidée de Légifrance
   (inaccessible pendant la recherche). Tout statut affiché porte « à vérifier auprès de la
   DDPP » tant qu'il n'a pas été confirmé sur la version consolidée. Le jeu ne propose jamais
   une espèce interdite ou soumise à certificat de capacité dès le premier individu (#262).
5. **Robustesse ≠ seuil de confort** : une CL50 (dose qui tue la moitié des animaux en 4 jours)
   sert à comparer la robustesse des espèces, jamais à définir une eau acceptable.
6. Ce n'est pas un avis vétérinaire ni juridique.

## Résumé

- Fiches utilisables (avec badges de confiance) : néon, guppy, corydoras poivré, axolotl,
  poisson-clown (paramètres d'eau de source secondaire seulement), chirurgien bleu.
- **Fiche koï à bloquer** : aucun paramètre chiffré vérifié.
- **Xénope (*Xenopus laevis*) : interdit en France**, ne jamais le proposer.
- **Grenouille naine africaine (*Hymenochirus*)** : famille Pipidae ; en lecture littérale de
  l'annexe 2 de l'arrêté, certificat de capacité dès 1 individu (non confirmé). Ne pas la
  proposer sans confirmation officielle.
- **Triton générique** à remplacer par *Cynops pyrrhogaster* ou *C. orientalis* (« Autres
  Caudata », 1 à 40 sans formalité) : eau fraîche 14–20 °C, sans poissons.
- **Chirurgien bleu** : pas une espèce de débutant (31 cm, au moins 300 L, sujets surtout
  prélevés dans la nature).

## Tableau récapitulatif (espèces actuelles et paludarium)

| Espèce | T° | pH | GH/KH | Volume / dimensions min | Groupe | Régime | Caractère | Difficulté | Sources (confiance) |
|---|---|---|---|---|---|---|---|---|---|
| Néon (*Paracheirodon innesi*) | 21–25 °C | 4,0–7,5 | 1–12 dGH ; KH non vérifié | base 60 × 30 cm (~54 L) | groupe requis ; effectif non vérifié | omnivore micro-prédateur | paisible | facile (souche commerciale fragile) | Seriously Fish (moyenne) |
| Guppy (*Poecilia reticulata*) | 17–28 °C | 7,0–8,5 | 8–30 dGH | base 45 × 30 cm (~41 L) | groupe requis | omnivore | paisible | facile | Seriously Fish (moyenne) |
| Corydoras poivré (*Hoplisoma paleatum*, ex-*Corydoras paleatus*) | 22–26 °C | 6,0–7,0 | 0–12 dGH | 61 × 38 × 30 cm (~70 L) | groupe requis | omnivore opportuniste de fond | paisible | facile | Seriously Fish (moyenne) |
| Koï (*Cyprinus rubrofuscus* / *C. carpio*) | non vérifié | non vérifié | non vérifié | bassin ; volume non vérifié | non vérifié | non vérifié | non vérifié | non vérifié | USGS NAS (élevée : taxonomie, KHV) |
| Axolotl (*Ambystoma mexicanum*) | 15,5–18 °C idéal ; > 23 °C = stress thermique | 6,5–8 (idéal 7,4–7,6) | GH 7–14 | non vérifié | seul ou entre axolotls | carnivore | calme, sans poissons | intermédiaire | AmphibiaWeb (élevée), Agave Vet (moyenne), étude MDPI (élevée) |
| Poisson-clown (*Amphiprion ocellaris*) | 23–27 °C (secondaire) | 8,0–8,5 (secondaire) | densité 1,020–1,026 (secondaire) | ~114 L ; > 190 L avec anémone (secondaire) | couple | omnivore planctonophage | territorial autour de son hôte | facile si né en captivité | FishBase (élevée), Saltcorner (faible) |
| Chirurgien bleu (*Paracanthurus hepatus*) | non vérifié | non vérifié | non vérifié | ≥ 300 L pour 1 individu < 20 cm (OATA via secondaire) ; 700 L (ReefApp, secondaire) | non vérifié | zooplancton + algues | aiguillon venimeux | **pas pour débutant** | FishBase (élevée), études sur le commerce (élevée) |
| Grenouille naine (*Hymenochirus boettgeri*) | optimum 25 °C ; 20–25 °C en protocole de laboratoire | 7,6–7,8 optimum ; 7 ± 0,4 en laboratoire | conductivité 900 ± 100 µS/cm (laboratoire) | non vérifié | non vérifié | carnivore par aspiration | paisible, timide | **statut légal à vérifier** | AmphibiaWeb (élevée), protocole de laboratoire (moyenne) |
| Triton à ventre de feu chinois (*Cynops orientalis*) | 14–20 °C ; éviter > 23 °C | non vérifié | non vérifié | non vérifié | non vérifié | carnivore (invertébrés) | paisible, sans poissons | intermédiaire (souvent prélevé dans la nature) | Caudata Culture (moyenne) |

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
  moduler la *vitesse* de dégradation de la santé, jamais la cible.
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

### Néon — *Paracheirodon innesi* (Myers, 1936)
- **Taxonomie** : anciens noms *Hyphessobrycon innesi*, *Cheirodon innesi* (Seriously Fish).
- **Origine** : bassin amazonien (Colombie, Brésil, Pérou) ; ruisseaux forestiers et petits
  affluents ; eau acide, dureté carbonatée et conductivité négligeables, teintée d'acides
  humiques (eau noire), parfois eau claire ; fond de branches, racines et litière.
- **Taille** : 30 mm en longueur standard. Durée de vie : non vérifié.
- **Eau** : 21–25 °C, pH 4,0–7,5, 1–12 dGH (Seriously Fish révisé en 2026, moyenne).
  **Désaccords** : un texte plus ancien de la même source indiquait pH 5,5–6,5, gH 1–5,
  26,5–29 °C ; un importateur (Quality Marine, secondaire) donne pH 3,5–7,5 et 21–29 °C ;
  `docs/SOINS.md` cite FishBase 20–26 °C, pH 5,0–7,0. Afficher 21–25 °C et signaler que les
  néons d'élevage sont plus adaptables que les sauvages.
- **Bac** : base 60 × 30 cm (~54 L) ; éclairage tamisé, plantes d'ombre (*Microsorum*,
  *Taxiphyllum*, *Cryptocoryne*), plantes flottantes, bois, litière de feuilles ; grégaire,
  effectif minimal chiffré non vérifié.
- **Alimentation** : micro-prédateur omnivore ; détails non vérifiés.
- **Comportement** : paisible, avec d'autres espèces paisibles.
- **Reproduction** : ovipare (dispersion des œufs) ; facilité non vérifiée.
- **Maladies** : « maladie du néon » (microsporidiose), quasi incurable une fois avancée ;
  souche commerciale affaiblie par des années d'élevage (Seriously Fish).
- **Débutant** : oui, dans un bac stable et mature. Erreur classique : bac non cyclé ou trop
  chaud.
- **Statut** : IUCN « Least Concern » (via synthèse encyclopédique, moyenne).

### Guppy — *Poecilia reticulata*
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

### Corydoras poivré — *Hoplisoma paleatum* (anciennement *Corydoras paleatus*)
- **Taxonomie** : transfert récent de *Corydoras* vers *Hoplisoma* (Seriously Fish, synthèse) ;
  synonymes *Callichthys paleatus*, *Corydoras maculatus*, *C. marmoratus*. Afficher les deux
  noms.
- **Origine** : sud du Brésil, Uruguay, Paraguay, Argentine ; rivières, affluents, eaux
  stagnantes.
- **Taille** : 70 mm en longueur standard ; femelles plus grandes et plus rondes.
- **Eau** : 22–26 °C, pH 6,0–7,0, jusqu'à 12 dGH ; pH et température stables (Seriously Fish).
  **Désaccord** : 16–24 °C chez Animalia.bio (secondaire). Afficher 22–26 °C et noter la
  tolérance au frais.
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

### Koï — *Cyprinus rubrofuscus* (ou *Cyprinus carpio* selon les sources)
- **Taxonomie** : l'USGS (NAS) range la koï sous *Cyprinus rubrofuscus* Lacepède, 1803 (carpe
  de l'Amour), synonymes *C. carpio*, *C. carpio haematopterus*, et précise qu'elle est souvent
  identifiée à tort comme carpe européenne (Kottelat & Freyhof 2007). Une note taxonomique de
  2025 (Zenodo) indique que *C. rubrofuscus* est « largement accepté comme distinct » de
  *C. carpio* mais génétiquement très proche. Afficher « *Cyprinus rubrofuscus* (koï, forme
  domestique), souvent nommée *C. carpio* dans les anciennes sources ».
- **Origine du taxon sauvage** : bassins de l'Amour au fleuve Rouge (synthèse USFWS).
- **Taille, eau, volume, alimentation, longévité, statut légal en France** : **non vérifié**.
  Consulter FishBase et une source vétérinaire avant d'afficher des chiffres.
- **Maladies** : porteuse et vectrice du KHV, capable de fortes mortalités (USGS, élevée).
- **Débutant** : bassin extérieur seulement.

### Axolotl — *Ambystoma mexicanum*
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

### Poisson-clown ocellaris — *Amphiprion ocellaris*
- **Origine** : Indo-Pacifique ouest ; récifs et lagons abrités, de 1 à 15 m (FishBase,
  Animal Diversity Web, élevée).
- **Taille** : 11 cm en longueur totale (FishBase).
- **Biologie** : vit dans de grandes anémones (*Heteractis magnifica*, *Stichodactyla
  gigantea*, *S. mertensii*) ; hermaphrodite protandre, couple monogame ; œufs gardés par le
  mâle ; élevé artificiellement pour le commerce (FishBase). En marin c'est l'exception : selon
  UF/IFAS (FA224), plus de 90 % des poissons d'eau douce sont disponibles nés en captivité, mais
  la grande majorité des poissons marins d'ornement sont prélevés dans la nature.
- **Eau** : 23–27 °C, densité 1,020–1,026, pH 8,0–8,5 (Saltcorner, **secondaire** : à
  confirmer avec Reefkeeping).
- **Bac** : ~114 L minimum, plus de 190 L avec une anémone (secondaire). **Il vit très bien sans
  anémone** ; les anémones hôtes sont difficiles et déconseillées au débutant (secondaire).
- **Débutant** : oui pour les individus nés en captivité ; le récif reste plus exigeant que
  l'eau douce. Statut IUCN et CITES : non vérifié.

### Chirurgien bleu — *Paracanthurus hepatus* (Linnaeus, 1766)
- **Origine** : Indo-Pacifique ; terrasses récifales externes battues par le courant, 2 à 40 m ;
  juvéniles dans les branches de *Pocillopora eydouxi* (FishBase, élevée).
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
  certificat au-delà : *Cynops*, *Paramesotriton*, *Pleurodeles waltl*, axolotl non domestique.
- ***Triturus* spp.** : certificat de capacité dès 1 individu.
- **« Autres espèces de Pipidae (dont *Xenopus* spp.) »** : certificat dès 1 individu ;
  *Hymenochirus* appartient aux Pipidae.
- **« Autres Anoures »** (hors annexe A et espèces protégées) : 1 à 40 sans formalité.
- **Espèces indigènes** : l'arrêté du 8 janvier 2021 protège les amphibiens et reptiles de
  métropole ; détention de spécimens prélevés dans la nature interdite, spécimens nés en
  captivité soumis à certificat de capacité. Ne **jamais** proposer de tritons ou grenouilles
  français dans le jeu.

### Grenouille
- ***Xenopus laevis* (xénope lisse) : à exclure.** Ajouté à la liste des espèces exotiques
  envahissantes préoccupantes pour l'Union (règlement UE 1143/2014) par le règlement
  d'exécution (UE) 2022/1203 ; en France, l'arrêté du 14 février 2018 interdit son
  introduction dans le milieu naturel, sa détention, son transport, son échange, sa vente et
  son achat (Base d'information espèces introduites, élevée). Plus de 15 000 individus capturés
  dans les Deux-Sèvres entre 2011 et 2013 ; vecteur de la chytridiomycose.
- ***Hymenochirus boettgeri* (grenouille naine africaine)** : famille Pipidae ; du Nigeria et
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

### Triton : *Cynops* recommandé
- **Triton à ventre de feu chinois, *Cynops orientalis*** (synonyme *Hypselotriton
  orientalis*) : endémique de Chine centrale et orientale ; 6 à 10,3 cm (mâles sous 8 cm) ;
  aquarium **frais 14–20 °C**, éviter au-dessus de 23 °C ; planté, avec petites zones émergées
  et plantes flottantes ; adultes très aquatiques ; carnivore (vers, insectes, crustacés),
  adulte gardé au frais nourri environ tous les trois jours (Caudata Culture, moyenne).
  **Sans poissons** (écart de température, prédation et morsures mutuelles, parasites des
  poissons) et pas avec des amphibiens plus grands et agressifs. Fragile, souvent prélevé dans
  la nature et en mauvais état en animalerie : privilégier les sujets nés en captivité. IUCN
  « Least Concern » (2020), pas de CITES ; **désaccord d'échelle** : reclassé « quasi menacé »
  au niveau national en Chine (Ecology and Evolution 2021). France : « Autres Caudata », 1 à 40
  sans formalité.
- **Triton à ventre de feu japonais, *Cynops pyrrhogaster*** : 10 à 15 cm ; 15,5–24 °C la plus
  grande partie de l'année ; dix ans de vie raisonnables en captivité ; plus facile à trouver né
  en captivité (Reptiles Magazine, **secondaire**). Même régime légal. **Meilleur choix
  pédagogique** si l'on veut encourager les animaux nés en captivité (à recouper).
- ***Pleurodeles waltl*** : non indigène en France (péninsule Ibérique, nord du Maroc) ;
  « Autres Caudata » ; paramètres non vérifiés.
- ***Paramesotriton* spp.** : « Autres Caudata » ; tout le genre à l'annexe II CITES depuis la
  CoP18 (2019) ; paramètres non vérifiés.

## Matrice de compatibilité

✅ compatible ; ⚠️ possible sous conditions ; ❌ incompatible (raison indiquée).

| | Néon | Guppy | Cory poivré | Koï | Axolotl | Clown | Chirurgien | Hymenochirus | Cynops |
|---|---|---|---|---|---|---|---|---|---|
| **Néon** | — | ⚠️ pH commun 7,0–7,5, dureté 8–12 dGH | ✅ 22–25 °C, pH 6–7 ; tétras = compagnons idéaux | ❌ bassin froid / tropical | ❌ T° ; axolotl sans poissons | ❌ eau douce / mer | ❌ eau douce / mer | ⚠️ 25 °C, pH 7–7,5 ; statut légal | ❌ T° ; Cynops sans poissons |
| **Guppy** | ⚠️ | — | ⚠️ pH commun ≈ 7,0, 8–12 dGH | ❌ bassin / aquarium | ❌ T° ; sans poissons | ❌ | ❌ | ⚠️ pH 7,6–7,8 ; grenouille timide | ❌ sans poissons ; T° |
| **Cory poivré** | ✅ | ⚠️ | — | ❌ | ❌ T° ; sans poissons | ❌ | ❌ | ⚠️ pH hors plage 6–7 ; fond partagé | ❌ T° ; sans poissons |
| **Koï** | ❌ | ❌ | ❌ | — | ❌ sans poissons ; carpes impliquées dans le déclin de l'axolotl | ❌ | ❌ | ❌ | ❌ sans poissons |
| **Axolotl** | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ T° 25 / 15–18 °C | ❌ pas avec des amphibiens plus grands |
| **Clown** | ❌ | ❌ | ❌ | ❌ | ❌ | — | ⚠️ même eau, mais ≥ 300–700 L | ❌ | ❌ |
| **Chirurgien** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | — | ❌ | ❌ |
| **Hymenochirus** | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | — | ❌ T° 25 / 14–20 °C |
| **Cynops** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |

**Règle proposée pour la simulation** : compatibilité = intersection non vide des plages
(T°, pH, GH), même milieu (douce ou marine), et aucune règle d'exclusion (« sans poissons »
pour axolotl et *Cynops* ; taille, prédation). Le niveau ⚠️ reflète la largeur de
l'intersection. Conséquence : le paludarium actuel (axolotl + grenouille + triton) n'est pas
cohérent avec ces sources (#262).

## Espèces candidates (à sourcer une par une avant ajout)

- **Vérifié partiellement** : poisson-mandarin (*Synchiropus splendidus*) : larves dépendantes
  des copépodes vivants, espèce « largement prélevée dans la nature » (Aquaculture 2018 et
  2020, élevée), individus qui refusent tout sauf les proies vivantes (synthèse) : **pas pour
  débutant**. *Hoplisoma sterbai* (ex-*Corydoras sterbai*) : toxine possible sous stress ou en
  surpopulation (synthèse secondaire, à confirmer sur Planet Catfish).
- **Eau douce tropicale, débutant probable** (chiffres non vérifiés) : platy, molly, xipho,
  endler, danio rerio, rasbora arlequin, tétra citron, tétra braise, corydoras bronze,
  *C. pygmaeus*, ancistrus, otocinclus, gourami miel, betta splendens (robustesse azotée
  documentée, besoins de volume non vérifiés).
- **Plus exigeantes ou sous conditions** : néon cardinalis, nez rouge, barbu de Sumatra (réputé
  mordeur de nageoires, non vérifié), gourami nain, gourami perlé, ramirezi, apistogramma,
  scalaire (prédateur potentiel des néons, non vérifié), discus, loche kuhli, loche clown.
- **Eau froide / bassin** : poisson rouge, white cloud (*Tanichthys albonubes*), ide,
  esturgeon : tailles et volumes à documenter.
- **Invertébrés** : *Neocaridina*, *Caridina*, néritine, planorbe, ampullaire (vérifier le
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

## Non vérifié et désaccords

1. Néon : 21–25 °C (Seriously Fish 2026) / 26,5–29 °C (ancien texte) / 21–29 °C (importateur) /
   20–26 °C (FishBase via `docs/SOINS.md`).
2. Corydoras poivré : 22–26 °C (Seriously Fish) / 16–24 °C (Animalia.bio, secondaire).
3. Koï : *C. rubrofuscus* / *C. carpio* ; tous les paramètres chiffrés non vérifiés.
4. Axolotl : « eau saumâtre » (PetMD) contredite ; « nitrite 1 ppm » (Agave Vet) probablement
   erroné ; formes domestiques en France : désaccord entre sources secondaires.
5. Chirurgien bleu : « hardy » (FishBase) / « delicate » (ReefApp) ; 300 L / 700 L.
6. *Cynops orientalis* : LC mondial (IUCN 2020) / « quasi menacé » national en Chine.
7. *Hymenochirus* : régime légal français non confirmé par l'administration.
8. Poisson-clown : paramètres d'eau de source secondaire ; IUCN non vérifié.
9. Espèces candidates : paramètres non vérifiés.
10. Durée de quarantaine et règle « 1 cm/L » : non vérifiées.

## Bibliographie

*(secondaire)* : boutique, blog, forum, synthèse encyclopédique ou article non scientifique, à
remplacer par une source primaire.

1. Base d'information espèces introduites, *Xenopus laevis* — https://base-information-especes-introduites.fr/espece/xenopus-laevis/
2. UF/IFAS EDIS — https://journals.flvc.org/edis/article/download/118012/115984/172109
3. Ammonia in Aquatic Systems (UF/IFAS FA16) — https://extension.rwfm.tamu.edu/wp-content/uploads/sites/8/2013/09/Ammonia-in-Aquatic-Systems1.pdf
4. NMSU, circulaire CR680 — https://pubs.nmsu.edu/_circulars/CR680/
5. Camargo et al. 2005, Nitrate Toxicity to Aquatic Animals — https://www.researchgate.net/publication/8063535_Nitrate_Toxicity_to_Aquatic_Animals_A_Review_With_New_Data_for_Freshwater_Invertebrates
6. Monster Fish Keepers, toxicité du nitrate — https://www.monsterfishkeepers.com/forums/threads/nitrate-toxicity.765019/ *(secondaire : forum)*
7. PetMD, intoxication au nitrate — https://www.petmd.com/fish/conditions/toxicity/nitrate-poisoning-fish
8. BMC Zoology 2023 (CL50 du betta) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10621081/
9. Agave Vet, fiche axolotl — https://agavevetcare.com/wp-content/uploads/2023/10/Axolotl-Care-Sheet.pdf
10. Seriously Fish, *Paracheirodon innesi* — https://www.seriouslyfish.com/species/paracheirodon-innesi
11. Neon tetra — https://en.wikipedia.org/wiki/Neon_tetra *(secondaire)*
12. USGS NAS, koï — https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=3294
13. Quality Marine, *Paracheirodon innesi* — https://www.qualitymarine.com/news/paracheirodon-innesi/ *(secondaire)*
14. Seriously Fish, *Poecilia reticulata* — https://www.seriouslyfish.com/species/poecilia-reticulata
15. Guppy — https://en.wikipedia.org/wiki/Guppy *(secondaire)*
16. Seriously Fish, *Corydoras paleatus* — https://www.seriouslyfish.com/species/corydoras-paleatus
17. *Hoplisoma paleatum* — https://en.wikipedia.org/wiki/Hoplisoma_paleatum *(secondaire)*
18. Seriously Fish, genre *Corydoras* — https://www.seriouslyfish.com/genus/corydoras/
19. Animalia, *Corydoras paleatus* — https://animalia.bio/corydoras-paleatus *(secondaire)*
20. Science.gov, *Corydoras paleatus* — https://www.science.gov/topicpages/f/fish+corydoras+paleatus
21. Zenodo, note taxonomique 2025 — https://zenodo.org/records/15822600
22. Britannica, koï — https://www.britannica.com/animal/koi-fish *(secondaire)*
23. *Cyprinus rubrofuscus* — https://en.wikipedia.org/wiki/Cyprinus_rubrofuscus *(secondaire)*
24. USFWS, Ecological Risk Screening Summary, koï — https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Koi.pdf
25. Caudata Culture, *Ambystoma mexicanum* — https://www.caudata.org/cc/species/Ambystoma/A_mexicanum.shtml
26. MDPI Animals 2023, axolotl — https://www.mdpi.com/2076-2615/13/5/874
27. PetMD, axolotl — https://www.petmd.com/reptile/species/axolotl-ambystoma-mexicanum
28. Fishkeeper, axolotl — https://www.fishkeeper.co.uk/fish/freshwater/miscellaneous/axolotl *(secondaire)*
29. Axolotl — https://en.wikipedia.org/wiki/Axolotl *(secondaire)*
30. AmphibiaWeb, *Ambystoma mexicanum* — https://amphibiaweb.org/cgi/amphib_query?where-genus=Ambystoma&where-species=mexicanum&account=mol
31. Code animal, axolotl — https://www.code-animal.com/axolotl-nouvelle-mode-dans-des-zoos/ *(secondaire)*
32. Kohen Avocats, détention d'animaux sauvages — https://kohenavocats.com/animal-sauvage-chez-soi-renard-tortue-loutre-axolotl-declaration-certificat-capacite-sanctions-2026/ *(secondaire, fiabilité faible)*
33. Animal Diversity Web, *Amphiprion ocellaris* — https://animaldiversity.org/accounts/Amphiprion_ocellaris/
34. FishBase, *Amphiprion ocellaris* — https://www.fishbase.se/Fieldguide/FieldGuideSummary.php?genusname=Amphiprion&speciesname=ocellaris&c_code=702
35. Saltcorner, poisson-clown — http://www.saltcorner.com/AquariumLibrary/browsespecies.php?CritterID=22&filter=0 *(secondaire)*
36. FishLore, poisson-clown — https://www.fishlore.com/Profiles-ClownFish.htm *(secondaire)*
37. FishBase, *Paracanthurus hepatus* — https://www.fishbase.se/summary/Paracanthurus-hepatus.html
38. ReefApp, *Paracanthurus hepatus* — https://reefapp.net/en/encyclopedia/paracanthurus-hepatus *(secondaire)*
39. Tropical Fish Co, chirurgien bleu (recommandation OATA citée) — https://tropicalfishco.co.uk/products/palette-surgeonfish-paracanthurus-hepatus *(secondaire)*
40. npj Ocean Sustainability 2023, commerce en Indonésie — https://www.nature.com/articles/s44183-023-00033-7
41. Baillargeon et al. 2020 (MEPS), analyse productivité-susceptibilité — https://cites.org/sites/default/files/eng/prog/marine_ornamental_fishes/workshops/brisbane_052024/baillargeon_et_al_2020_psa_of_data_limited_fisheries_marpol.pdf
42. Marcelli et al. 2016, *Paracanthurus hepatus* en Méditerranée — https://link.springer.com/article/10.1007/s12526-016-0573-3
43. La Ferme Tropicale, législation — https://www.lafermetropicale.com/content/39-legislation *(secondaire)*
44. Fédération Française d'Aquariophilie, arrêté de 2025 — https://www.fedeaqua.org/pratique/legislation/2853-modification-de-larrete-du-8-octobre-2018-fixant-les-regles-generales-de-detention-danimaux-despeces-non-domestiques
45. Texte de l'arrêté du 8 octobre 2018 — https://www.eleveur-de-carduelines.com/article/arrete-du-8-octobre-2018-fixant-les-regles-generales-de-detention-danimaux-despeces-non-domestiques/ *(secondaire : reproduction du texte)*
46. INERIS AIDA, arrêté du 5 septembre 2025 — https://aida.ineris.fr/reglementation/arrete-050925-modifiant-larrete-8-octobre-2018-fixant-regles-generales-detention
47. Kohen Avocats, espèces interdites en bassin et aquarium — https://kohenavocats.com/perche-soleil-poisson-chat-gambusie-xenope-bassin-aquarium-interdit-vendre-relacher-risques-2026/ *(secondaire)*
48. AmphibiaWeb, *Hymenochirus boettgeri* — https://amphibiaweb.org/cgi/amphib_query?where-genus=Hymenochirus&where-species=boettgeri
49. Housing and Care for *Hymenochirus boettgeri* (protocole) — https://www.researchgate.net/publication/376066713_Housing_and_Care_for_Hymenochirus_boettgeri_v1
50. Ecology and Evolution 2021 (*Cynops orientalis*) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8328465/
51. Caudata Culture, *Cynops orientalis* — https://www.caudata.org/cc/species/Cynops/C_orientalis.shtml
52. Caudata Culture, FAQ — https://www.caudata.org/cc/faq/FAQcar.shtml
53. Reptiles Magazine, *Cynops pyrrhogaster* — https://reptilesmagazine.com/japanese-fire-bellied-newt-care-sheet/ *(secondaire)*
54. *Pleurodeles waltl* — https://en.wikipedia.org/wiki/Iberian_ribbed_newt *(secondaire)*
55. Aquaculture 2018, poisson-mandarin — https://www.sciencedirect.com/science/article/abs/pii/S0044848617319737
56. Aquaculture 2020, poisson-mandarin — https://www.sciencedirect.com/science/article/abs/pii/S0044848619316175
57. *Synchiropus splendidus* — https://en.wikipedia.org/wiki/Synchiropus_splendidus *(secondaire)*
58. *Hoplisoma sterbai* — https://en.wikipedia.org/wiki/Sterba%27s_corydoras *(secondaire)*
