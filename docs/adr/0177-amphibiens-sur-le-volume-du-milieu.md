# 0177 — Amphibiens semi-terrestres comptés sur le volume du milieu (arbitrage)

- Statut : acceptée ; mise en œuvre au cycle 307 (issue #813)
- Date : 2026-11-25
- Auteur : Dev, cycle 300, issue #813 (suite des ADR 0171 et 0173)

## Contexte

Depuis l'ADR 0173, le paludarium par défaut compte 2 sonneurs orientaux et aucun triton :
la classe « amphibien » (3 L d'eau par cm, **approximation de jeu**, `docs/ESPECES.md`
point 18) est comptée sur l'eau seule, berge déduite (ADR 0171), soit 45,7 L sur les 105 L du
milieu. Un triton (30 L) et deux sonneurs (36 L) demandent 66 L : ils ne cohabitent plus en
mode soins. L'issue #813 demande de sourcer le besoin d'espace des amphibiens sur le volume du
**milieu entier** (terre et eau), ou une surface de berge.

## Sources trouvées (consultées le 2026-11-25)

Aucune source primaire (étude, recommandation d'un zoo ou d'une société savante). Quatre fiches
de soins secondaires, toutes en **volume de terrarium entier**, sans part d'eau ni de berge
chiffrée (bibliographie de `docs/ESPECES.md`, [67] à [70]) :

| Espèce                         | Source                                                              | Valeur                                                                                     | Litres                                 |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Triton à ventre de feu         | PetMD, fiche rédigée par une vétérinaire (M. Zayas, DVM, 2023) [67] | 15 gallons pour un adulte, 20 gallons pour deux                                            | 56,8 L, puis 18,9 L par adulte de plus |
| Triton à ventre de feu chinois | Reptiles Magazine, rédaction (2013, revue 2021) [68]                | 20 gallons pour quatre au plus                                                             | 75,7 L pour 4                          |
| Sonneur oriental               | Reptiles Magazine, rédaction (2013, revue 2021) [69]                | 10 gallons pour un couple au plus                                                          | 37,9 L pour 2                          |
| Sonneur oriental               | amphibiancare.com, sans auteur (2008) [70]                          | 15 gallons (61 × 30 × 30 cm) pour cinq adultes ; berge sur la moitié aux deux tiers du sol | 56,8 L pour 5                          |

**Désaccords** : pour le triton, 56,8 L pour un seul (PetMD) contre 75,7 L pour quatre
(Reptiles Magazine) ; pour le sonneur, 19 L par animal [69] contre 11 L [70].

## Décision

1. Les sources exploitables existent, au niveau de confiance de la fiche actuelle du sonneur
   (anapsid.org, secondaire, [59]) : elles donnent un volume de **milieu**, pas d'eau. Pour les
   amphibiens **semi-terrestres** (sonneur, triton), le besoin se comptera sur le **volume du
   milieu** (litres bruts du bac, berge comprise : 105 L pour le paludarium par défaut), et non
   plus sur l'eau berge déduite. L'axolotl, entièrement aquatique (part d'eau 1), reste compté
   sur l'eau avec la classe « amphibien ».
2. Valeurs retenues, les plus exigeantes de chaque désaccord (même principe que la RSPCA
   pour le poisson rouge) :
   - triton : volume minimal 56,8 L, 18,9 L par adulte de plus (PetMD, vétérinaire) ;
   - sonneur : 37,9 L pour un couple (Reptiles Magazine), soit un besoin de 18,9 L par
     adulte (n × 18,9 L) et un milieu d'au moins 37,9 L (verdict `volume-minimal`, vérifié à
     part) ; désaccord avec [70] affiché. Attention : la formule actuelle
     `max(volume minimal, e) + (n − 1) × e` compterait 56,8 L pour le couple ; la source donne
     le couple comme unité, la mise en œuvre doit donc compter n × e pour le sonneur.
     Le triton entre tel quel dans le modèle « volume minimal + volume par adulte
     supplémentaire » (`speciesNeedLiters`, ADR 0171) : 56,8 L, 75,7 L, 94,6 L…
3. Conséquence attendue au paludarium par défaut : 2 sonneurs (37,9 L) et 1 triton (56,8 L)
   demandent 94,7 L pour 105 L (90 %) : **ils cohabitent** ; un second triton (113,6 L) est
   refusé. La population par défaut pourra redevenir 2 sonneurs et 1 triton.
4. La cohabitation elle-même reste de confiance **faible** (témoignages, [60]) : le verdict
   par paire (ADR 0174) n'est pas modifié par cette décision.

## Options écartées

- **Garder l'eau seule** : aucune source ne donne de litres d'eau par cm pour ces espèces ;
  la règle actuelle est une approximation de jeu plus stricte que toutes les fiches trouvées.
- **Appliquer les litres de terrarium à l'eau** (berge déduite) : mélange deux mesures, déjà
  écarté par l'ADR 0173.
- **Retenir les valeurs les plus favorables** ([68], [70]) : ce serait choisir la source pour
  faire passer la population voulue.
- **Surface de berge** : seule [70] en parle (proportion du sol, pas une surface par animal).

## Mise en œuvre (proposition du cycle 300)

Le calcul mêle désormais deux références de volume dans un même bac. Proposition : chaque
espèce consomme une fraction de sa référence (eau ou milieu) et l'occupation du bac est la
somme des fractions ; les raisons affichées donnent les litres de la référence de l'espèce.
À traiter dans `sim/tank-capacity.ts` et `sim/capacity-shown.ts`, avec un test de capacité
(un sonneur et un triton acceptés au paludarium par défaut en mode soins), les empreintes
`paludarium` expliquées si la population par défaut change, et `docs/ESPECES.md` (point 18)
mis à jour.

## Mise en œuvre (cycle 307)

- `sim/semi-terrestrial-needs.ts` porte les valeurs sourcées du sonneur (18,9 L par adulte dès
  le premier, milieu d'au moins 37,9 L, désaccord de [70] dans la référence) et du triton
  (56,8 L, puis 18,9 L par adulte). Les fiches (`species-sheet.ts`, volume conseillé de 40 L en
  approximation) ne changent pas : elles restent l'affichage du wiki, la capacité lit ce module.
- `sim/tank-capacity.ts` : chaque profil a une **référence** (`eau` ou `milieu`) ; le bac reçoit
  `milieuLiters` (litres bruts de la boîte d'eau, berge comprise : 105 L au paludarium par
  défaut). L'occupation est la somme des fractions (`populationLoad`) ; le volume minimal d'une
  espèce du milieu se compare au milieu. Sans espèce du milieu, le calcul est inchangé.
- `CapacityStatus` sépare `needLiters` (eau réelle) et `milieuNeedLiters` ; la ligne et
  l'alerte de capacité écrivent la part du milieu à part.
- Population par défaut **inchangée** (2 sonneurs, 36 %) : un triton est accepté en mode soins
  (90 %), un second refusé. La repeupler d'office changerait les empreintes et les captures du
  paludarium, sans être demandé par #813 : à décider dans une issue de fonctionnalité.
