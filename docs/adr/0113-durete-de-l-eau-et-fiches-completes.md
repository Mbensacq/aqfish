# 0113 — Dureté de l'eau (GH, KH) et fiches complètes du wiki

- Statut : acceptée
- Date : 2026-11-07
- Auteur : Dev, cycle 170, issue #484 (reste des épopées #229 et #252)

## Contexte

Le pH est simulé (ADR 0057) et comparé à la plage de chaque espèce dans le wiki (ADR 0068),
mais le modèle d'eau n'avait pas de dureté, et les fiches n'avaient ni dureté, ni durée de
vie, ni tolérances azotées. L'issue exclut l'effet de la dureté sur la santé et sur le pH
(pouvoir tampon), les produits qui la modifient et une jauge de plus au tableau de bord.

## Décision

1. **Dureté dans l'eau du bac, facultative** (`sim/water-hardness.ts`) : `WaterState.gh`
   (°dGH) et `WaterState.kh` (°dKH), dans [0, 400]. Absents, le bac a la dureté de **l'eau du
   robinet du jeu** de son environnement (`TAP_HARDNESS`). L'eau neuve n'écrit aucun champ :
   l'empreinte dorée du monde, les sauvegardes et les captures ne changent pas d'un octet, et
   une sauvegarde antérieure se relit sans changement de schéma.
2. **Valeurs du robinet** : approximations de jeu (tropical GH 10 / KH 6, bassin 12 / 8,
   paludarium 8 / 5, eau froide 14 / 8), choisies pour tomber dans la plage de dureté de toute
   la population par défaut de chaque lieu (testé) ; récif : eau de mer reconstituée, KH 8
   dans les 7–11 dKH de Holmes-Farley (`docs/SOINS.md` § 3), GH 350 en ordre de grandeur du
   calcium et du magnésium de l'eau de mer.
3. **Pas de dérive** : le pas de simulation ne touche pas à la dureté. Le changement d'eau la
   rapproche de `WATER_CHANGE_SHARE` de celle du robinet, comme le pH ; revenue à moins de
   `HARDNESS_TRACE` (0,05 °d) de celle-ci, le champ disparaît. Aujourd'hui, seule une
   sauvegarde écrite à la main porte une dureté différente : le modèle est prêt pour les
   produits et la consommation du KH par la nitrification (hors périmètre, issue à venir).
4. **Fiches** (`sim/species-sheet.ts`) : `hardness` (plage `gh` en eau douce, `kh` en eau de
   mer, où la GH de l'eau de mer n'a pas de sens pour l'aquariophile) et `lifespan` (années),
   chacun avec son statut. Sourcés : néon 1–12, guppy 8–30, corydoras 0–12 dGH
   (`docs/ESPECES.md`, Seriously Fish), molly 15–30 dGH (Seriously Fish), xipho 8–20 °dH
   (FishBase), récif 7–11 dKH (Holmes-Farley, paramètre de bac commun aux espèces de récif).
   Toutes les autres duretés et **toutes** les durées de vie sont des approximations de jeu
   (aucune source consultable pendant le cycle).
5. **Fiche complète du wiki seulement** : `detailRows` (dureté, durée de vie, seuils
   d'ammoniaque, de nitrite et de nitrate du jeu, `COMPOUND_THRESHOLDS`, communs à toutes les
   espèces) s'affiche dans « Besoins » du wiki ; la fiche du panneau « Population » garde ses
   onze lignes (place comptée à 1280 × 720).
6. **Comparaison avec le bac** : `tankComparison` prend la dureté du bac en option et ajoute
   une ligne « Dureté (GH) » ou « Dureté carbonatée (KH) ». La fiche n'ayant qu'une plage,
   elle sert de plage préférée et tolérée : « dans la plage » ou « hors plage », jamais
   « limite », avec l'écart en texte. Le relevé de l'eau (`WaterReadout`) porte `gh` et `kh`
   au dixième, que l'application passe au wiki (`waterGh`, `waterKh`).

## Options écartées

- **Écrire la dureté dans l'eau neuve** (`freshWater`) : deux tests de référence (empreinte
  dorée, eau entière) et toutes les sauvegardes auraient changé pour une valeur constante.
- **Une plage tolérée et une préférée de dureté** : aucune source n'en donne deux ; en
  inventer une seconde aurait doublé les approximations.
- **Seuils azotés par espèce** : la simulation n'en a qu'un jeu, commun ; afficher autre chose
  aurait menti sur le jeu. Les sensibilités connues restent dans les mises en garde (crevette
  cerise et nitrates, par exemple).

## Conséquences

- La comparaison du wiki a trois lignes (au lieu de deux) quand la dureté est connue.
- Une espèce d'eau dure (le molly, 15–30 dGH) peut apparaître « hors plage » de dureté dans
  le bac tropical par défaut : information seulement, sans effet sur la santé.
- Captures sans interface identiques à l'octet ; la capture du wiki (fiche du néon) change.
