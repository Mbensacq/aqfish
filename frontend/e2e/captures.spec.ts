import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { SIM_DT } from '../src/app/sim/constants';
import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { SPECIES } from '../src/app/sim/species';
import { swimBounds } from '../src/app/sim/swimmer';
import { waterVolume } from '../src/app/sim/tank';
import { freshWater } from '../src/app/sim/water';
import { glassStats, recordTrajectories } from '../src/app/sim/trajectory';
import {
  advance,
  createDefaultWorld,
  feed,
  starveWorldInPlace,
  type MutableWorld,
  type World,
} from '../src/app/sim/world';

/**
 * Harnais de captures (projet Playwright « captures »).
 *
 * Photographie l'application sous les 5 angles du contrat de capture (plus une vue
 * trois-quarts sans filtre pixel art, `filtre=aucun`), avec une
 * graine et un temps de simulation fixes, pour suivre l'évolution visuelle nuit
 * après nuit. Lancer : `npm run captures` (sortie : CAPTURE_DIR, par défaut
 * ../docs/captures/latest).
 *
 * En plus, `trajectoires-top.png` : tracé des trajectoires vues de dessus sur
 * `TRACE_SECONDS` secondes simulées (issue #43), pour prouver un comportement de nage
 * qu'une image figée ne montre pas. Calculé hors de l'application, avec la simulation pure
 * (même graine que les captures), puis dessiné en SVG. Et `trajectoires-nourriture-top.png`
 * (issue #68) : même tracé, granulés déposés à t = 0 en `TRACE_FEEDINGS` (croix), pour voir
 * les poissons converger vers la nourriture.
 *
 * Les angles et paramètres doivent rester alignés avec
 * src/app/core/capture/capture-params.ts et docs/ARCHITECTURE.md.
 */
const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;
const SEED = Number(process.env['CAPTURE_SEED'] ?? 42);
const TIME_SECONDS = Number(process.env['CAPTURE_TIME'] ?? 30);
/**
 * Granulés posés (#117) : bac sans poissons (rien n'est mangé), quatre dépôts à t = 0, au
 * centre, sur un rocher, au pied d'une plante et sur le sable ; posés au temps de capture.
 */
const RESTING_FOOD =
  'population=neon:0,guppy:0,corydora:0&nourrir=0,0:0.3:0.03,0:-0.15:0.1,0:-0.4:0.15';
/** Granulés pour la fouille des corydoras (#427) : posés et pas encore mangés à 30 s. */
const FORAGE_FOOD = 'nourrir=8:-0.4:0.15,8:0.4:0.1,8:0:0.15,8:-0.15:-0.1';
/** Bois flotté ajouté au décor par défaut (#169) : `x:z:rotation:echelle:graine`. */
const WOOD = 'bois=-0.02:0:-0.2:1.5:7';
const FRESHWATER_LOT1 = 'population=neon:0,guppy:0,corydora:0,rasbora:8,tetra:8,kuhli:6,gourami:2';
const FRESHWATER_LOT2 =
  'population=neon:0,guppy:0,corydora:0,platy:4,danio:8,ancistrus:2,otocinclus:6';
const FRESHWATER_LOT3 = 'population=neon:0,guppy:0,corydora:0,braise:12,molly:3,miel:2';
const FRESHWATER_LOT4 = 'population=neon:0,guppy:0,corydora:0,xipho:3,cerise:8,neritine:3';
/** Courant fort au bac tropical (#460) : poissons de rivière et néons. */
const RIVER = 'courant=fort&population=neon:8,guppy:0,corydora:0,danio:8,xipho:3';
const REEF_LOT2 = 'population=clown:3,chirurgien:4,chromis:7,gobie:2,gramma:2';
const REEF_LOT3 = 'population=clown:3,chirurgien:4,chromis:7,gobie:2,gramma:2,crevette:2,blennie:1';
const OUTPUT_DIR = resolve(
  process.env['CAPTURE_DIR'] ?? join(__dirname, '..', '..', 'docs', 'captures', 'latest'),
);

test.describe('Captures', () => {
  test.beforeAll(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const camera of CAMERA_PRESETS) {
    test(`angle ${camera}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`/?capture=1&seed=${SEED}&camera=${camera}&time=${TIME_SECONDS}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

      await page.screenshot({ path: join(OUTPUT_DIR, `${camera}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Filtre désactivé (issue #33) : capture supplémentaire, les 5 angles ci-dessus restent en
  // pixel art et inchangés.
  test('angle three-quarter sans filtre', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(
      `/?capture=1&seed=${SEED}&camera=three-quarter&time=${TIME_SECONDS}&filtre=aucun`,
    );
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-sans-filtre.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Éléments de la pièce (#188), à gauche du bac : visibles en vue trois-quarts.
  const SHELF = 'etagere:-1.25:-0.17:0';
  const PLANT_ON_SHELF = 'plante-pot:-1.4:-0.17:0';
  const TABLE = 'table-basse:-1.45:0.55:0';
  const SOFA = 'canape:-1.7:0.6:1';
  const PLANT = 'plante-pot:-1:0.3:0';
  const PLANT_ON_TABLE = 'plante-pot:-1.25:0.55:0';
  // Cycle jour/nuit (issue #51) : captures supplémentaires à heure figée (`heure=`). Les
  // captures ci-dessus, sans `heure=`, sont à midi et restent inchangées.
  const DAY_CAPTURES = [
    { name: 'three-quarter-crepuscule', query: 'heure=18' },
    // Fin du crépuscule (#73) : teintes chaudes avant la nuit.
    { name: 'three-quarter-crepuscule-19h', query: 'heure=19' },
    { name: 'three-quarter-minuit', query: 'heure=0' },
    { name: 'three-quarter-sans-filtre-minuit', query: 'heure=0&filtre=aucun' },
    // Rythme du jour (#209) : la nuit, néons et guppys descendent vers le fond ; vue de côté.
    { name: 'side-minuit', query: 'camera=side&heure=0' },
    // Nourrissage (#67) : à 0 s au centre (posés sur le sable) et sur un rocher (posés
    // dessus), à 24 s (en train de couler). Les noms sans suffixe gardent le rendu en points
    // (`granules=points`) ; les voxels, rendu par défaut depuis #226, portent `-voxels`.
    {
      name: 'three-quarter-nourriture',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&granules=points',
    },
    {
      name: 'three-quarter-nourriture-minuit',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&heure=0&granules=points',
    },
    // Granulés en voxels (#117, #226), mêmes dépôts ; puis granulés posés (bac sans poissons,
    // rien n'est mangé) sur le sable, au pied d'une plante et sur un rocher, de jour et de nuit.
    {
      name: 'three-quarter-nourriture-voxels',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&granules=voxels',
    },
    { name: 'three-quarter-nourriture-posee', query: `${RESTING_FOOD}&granules=points` },
    {
      name: 'three-quarter-nourriture-posee-minuit',
      query: `${RESTING_FOOD}&granules=points&heure=0`,
    },
    { name: 'three-quarter-nourriture-posee-voxels', query: `${RESTING_FOOD}&granules=voxels` },
    {
      name: 'three-quarter-nourriture-posee-voxels-minuit',
      query: `${RESTING_FOOD}&granules=voxels&heure=0`,
    },
    {
      name: 'front-nourriture',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&camera=front&granules=points',
    },
    {
      name: 'front-nourriture-voxels',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&camera=front&granules=voxels',
    },
    // Fouille des corydoras (#427, ADR 0106) : quatre dépôts à 8 s, encore posés au temps de
    // capture ; les corydoras en épisode ont le nez au sable (vue de face : la vue de côté
    // les cache derrière les plantes).
    { name: 'front-fouille', query: `${FORAGE_FOOD}&camera=front` },
    // Population réglée (#69) : 12 néons, 2 guppys, aucun corydora.
    { name: 'three-quarter-population', query: 'population=neon:12,guppy:2,corydora:0' },
    // Catalogue d'espèces (#189) : plus de corydoras, moins de néons.
    { name: 'three-quarter-catalogue', query: 'population=neon:4,guppy:6,corydora:14' },
    // Eau douce, lot 1 (#238) : rasboras, tétras citrons, loches kuhli et gouramis nains seuls.
    { name: 'three-quarter-eau-douce-lot1', query: FRESHWATER_LOT1 },
    { name: 'front-eau-douce-lot1', query: `${FRESHWATER_LOT1}&camera=front` },
    // Eau douce, lot 2 (#362) : platys, danios zébrés, ancistrus et otocinclus seuls.
    { name: 'three-quarter-eau-douce-lot2', query: FRESHWATER_LOT2 },
    { name: 'front-eau-douce-lot2', query: `${FRESHWATER_LOT2}&camera=front` },
    // Eau douce, lot 3 (#391) : tétras braise, mollys noirs et gouramis miel seuls.
    { name: 'three-quarter-eau-douce-lot3', query: FRESHWATER_LOT3 },
    { name: 'front-eau-douce-lot3', query: `${FRESHWATER_LOT3}&camera=front` },
    // Eau douce, lot 4 (#425) : xiphos, crevettes cerises et néritines zèbres seuls.
    { name: 'three-quarter-eau-douce-lot4', query: FRESHWATER_LOT4 },
    { name: 'front-eau-douce-lot4', query: `${FRESHWATER_LOT4}&camera=front` },
    // Lot 2 de près (#370) : caméra libre au ras du fond, ancistrus (tête large, barbillons
    // clairs, dos piqueté) et otocinclus (bande noire) identifiables.
    {
      name: 'libre-eau-douce-lot2-fond',
      query: `piece=1&${FRESHWATER_LOT2}&libre=-0.05:0.3:0.4:30:-30`,
    },
    // Éditeur de décor (#167) : rocher d'indice 2 sélectionné, contour clair.
    { name: 'three-quarter-edition', query: 'edition=2' },
    // Bois flotté à branches (#169) : un bois ajouté au décor par défaut, devant les rochers.
    { name: 'three-quarter-bois', query: WOOD },
    { name: 'side-bois', query: `${WOOD}&camera=side` },
    // Dimensions du bac (#171) : le plus petit et le plus grand bac réglables, décor ramené.
    { name: 'three-quarter-petit-bac', query: 'bac=0.6:0.5:0.3' },
    { name: 'three-quarter-grand-bac', query: 'bac=2:0.9:0.9' },
    // Pièce autour du bac (#187) : sol, mur et meuble support ; sous le bac, la pièce s'efface.
    { name: 'three-quarter-piece', query: 'piece=1' },
    { name: 'front-piece', query: 'piece=1&camera=front' },
    { name: 'top-piece', query: 'piece=1&camera=top' },
    { name: 'side-piece', query: 'piece=1&camera=side' },
    { name: 'bottom-piece', query: 'piece=1&camera=bottom' },
    { name: 'three-quarter-piece-minuit', query: 'piece=1&heure=0' },
    { name: 'three-quarter-piece-grand-bac', query: 'piece=1&bac=2:0.9:0.9' },
    // Pièce fermée (#324) : de l'intérieur, vers le plafond et ses poutres (grand bac, caméra
    // plus loin, plus de plafond dans le cadre).
    { name: 'side-piece-grand-bac', query: 'piece=1&camera=side&bac=2:0.9:0.9' },
    // Caméra libre (#343) : dans la pièce, vers le bac depuis l'avant droit ; vers la fenêtre
    // du mur du fond ; vers le plafond et ses poutres.
    { name: 'libre-interieur', query: 'piece=1&libre=2.5:1:2.6:44:-12' },
    { name: 'libre-fenetre', query: 'piece=1&libre=-0.6:0.9:2.2:21:3' },
    { name: 'libre-plafond', query: 'piece=1&libre=1.8:0.7:2.8:30:30' },
    // Détails de la pièce (#363) : porte et applique du mur de droite, de jour et de nuit
    // (applique allumée, halo sur le mur).
    { name: 'libre-porte', query: 'piece=1&libre=1.2:0.85:3:-55:-8' },
    { name: 'libre-porte-minuit', query: 'piece=1&heure=0&libre=1.2:0.85:3:-55:-8' },
    // Points blancs (#366) de près : caméra libre contre la vitre, néons et corydoras.
    { name: 'libre-points-blancs', query: 'piece=1&points-blancs=1&libre=0:0.3:0.6:0:0' },
    // Pourriture des nageoires (#485) de près, même cadrage : caudales effilochées.
    { name: 'libre-pourriture', query: 'piece=1&pourriture=1&libre=0:0.3:0.6:0:0' },
    // Pièce à deux bacs (#305, lot 2b) : une commode à droite du bac, un bac moyen posé dessus.
    { name: 'three-quarter-piece-deux-bacs', query: 'piece=1&bacs=commode,moyen@0' },
    { name: 'top-piece-deux-bacs', query: 'piece=1&bacs=commode,moyen@0&camera=top' },
    // Bac de quarantaine (#547) : bac principal malade, petit bac (60 cm) posé sur une commode ;
    // caméra libre de trois quarts pour montrer les deux bacs entiers (#560).
    {
      name: 'three-quarter-piece-quarantaine',
      query: 'piece=1&points-blancs=1&bacs=commode,petit@0&libre=2.1:1.1:2.4:28:-22',
    },
    // Animalerie (#419, ADR 0102) : étagère à trois niveaux, un bac moyen sur chacun.
    {
      name: 'three-quarter-piece-animalerie',
      query: 'piece=1&bacs=etagere-animalerie,moyen@0,moyen@0,moyen@0',
    },
    // La même, de face et de plus près (caméra libre) : les trois niveaux lisibles.
    {
      name: 'libre-piece-animalerie',
      query: 'piece=1&bacs=etagere-animalerie,moyen@0,moyen@0,moyen@0&libre=0.3:0.45:3:-22:-6',
    },
    // Meubles et plantes de la pièce (#188) : chaque élément du catalogue seul, puis une
    // plante posée par gravité sur l'étagère et une autre sur la table basse.
    { name: 'three-quarter-meuble-etagere', query: `piece=1&meubles=${SHELF}` },
    { name: 'three-quarter-meuble-table', query: `piece=1&meubles=${TABLE}` },
    { name: 'three-quarter-meuble-canape', query: `piece=1&meubles=${SOFA}` },
    { name: 'three-quarter-meuble-plante', query: `piece=1&meubles=${PLANT}` },
    {
      name: 'three-quarter-meubles',
      query: `piece=1&meubles=${SHELF},${PLANT_ON_SHELF},${TABLE},${PLANT_ON_TABLE}`,
    },
    // Éditeur de la pièce (#188) : table basse sélectionnée, même contour clair que le décor.
    {
      name: 'three-quarter-meubles-edition',
      query: `piece=1&meubles=${SHELF},${PLANT_ON_SHELF},${TABLE},${PLANT_ON_TABLE}&edition-meuble=2`,
    },
    // Eau mauvaise (#207) : nitrates élevés, eau plus trouble et verdâtre (teinte seulement).
    { name: 'three-quarter-eau-mauvaise', query: 'eau=mauvaise' },
    { name: 'top-eau-mauvaise', query: 'eau=mauvaise&camera=top' },
    // Animaux affamés de longue date (#208) : santé au plancher, couleurs ternies.
    { name: 'side-affames', query: 'affames=1&camera=side' },
    { name: 'three-quarter-affames', query: 'affames=1' },
    // Points blancs (#366) : voxels clairs sur le corps et les nageoires des poissons malades.
    { name: 'front-points-blancs', query: 'points-blancs=1&camera=front' },
    { name: 'three-quarter-points-blancs', query: 'points-blancs=1' },
    // Pourriture des nageoires (#485) : caudales effilochées, liseré gris de tissu abîmé.
    { name: 'side-pourriture', query: 'pourriture=1&camera=side' },
    { name: 'front-pourriture', query: 'pourriture=1&camera=front' },
    // Velours (#532) : voile et poussière dorés sur le corps et les nageoires.
    { name: 'side-velours', query: 'velours=1&camera=side' },
    { name: 'front-velours', query: 'velours=1&camera=front' },
    // Champignons (#548) : touffes de coton blanc grisâtre sur la caudale et les nageoires.
    { name: 'side-champignons', query: 'champignons=1&camera=side' },
    { name: 'front-champignons', query: 'champignons=1&camera=front' },
    // Alevins de guppy (#459) : chaque femelle met bas, alevins aux trois jalons de croissance
    // (#566 : nouveau-né pâle, juvénile, subadulte presque coloré).
    { name: 'three-quarter-alevins', query: 'alevins=1' },
    { name: 'front-alevins', query: 'alevins=1&camera=front' },
    { name: 'top-alevins', query: 'alevins=1&camera=top' },
    // Œufs de corydoras (#478) : une ponte collée sur la vitre et dans les plantes.
    { name: 'front-oeufs', query: 'oeufs=1&camera=front' },
    { name: 'three-quarter-oeufs', query: 'oeufs=1' },
    // Courant fort (#460) : danios zébrés et xiphos face au courant, néons emportés, bulles
    // déviées vers l'aval, chevrons sombres sur le sable le long de la vitre avant.
    { name: 'three-quarter-courant', query: RIVER },
    { name: 'top-courant', query: `${RIVER}&camera=top` },
    // Feuilles de catappa (#239) : feuilles brunes au sol, eau teintée brun-thé.
    { name: 'three-quarter-catappa', query: 'catappa=3' },
    { name: 'top-catappa', query: 'catappa=5&camera=top' },
    // Algues (#476) : plaques vertes sur les vitres (fond, côtés, bas de la vitre avant).
    { name: 'front-algues', query: 'algues=0.8&camera=front' },
    { name: 'three-quarter-algues', query: 'algues=0.8' },
  ] as const;
  for (const { name, query } of DAY_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // `camera=` de la requête, s'il y en a un, remplace la vue trois-quarts (le dernier
      // paramètre répété ne compte pas : `URLSearchParams.get` lit le premier).
      const camera = query.includes('camera=') ? '' : 'camera=three-quarter&';
      await page.goto(`/?capture=1&seed=${SEED}&${camera}time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Bassin (#87) : second environnement, de dessus (sa vue par défaut, sans `camera=`),
  // en trois-quarts et à minuit. Les captures du bac tropical ci-dessus restent inchangées.
  // Fleurs des nénuphars (#104) : ouvertes à midi, fermées à minuit, vues de dessus.
  const POND_CAPTURES = [
    { name: 'bassin-top', query: 'environnement=bassin' },
    { name: 'bassin-top-minuit', query: 'environnement=bassin&heure=0' },
    { name: 'bassin-top-sans-filtre', query: 'environnement=bassin&filtre=aucun' },
    { name: 'bassin-three-quarter', query: 'environnement=bassin&camera=three-quarter' },
    {
      name: 'bassin-three-quarter-minuit',
      query: 'environnement=bassin&camera=three-quarter&heure=0',
    },
    // Bassin enterré (#105) : vues basses en coupe, sol et margelle retirés côté caméra.
    { name: 'bassin-side', query: 'environnement=bassin&camera=side' },
    { name: 'bassin-front', query: 'environnement=bassin&camera=front' },
    { name: 'bassin-bottom', query: 'environnement=bassin&camera=bottom' },
    // Pluie (#106) : gouttes et ronds à la surface, de dessus et en trois-quarts.
    { name: 'bassin-top-pluie', query: 'environnement=bassin&pluie=1' },
    {
      name: 'bassin-three-quarter-pluie',
      query: 'environnement=bassin&camera=three-quarter&pluie=1',
    },
    // Forme du bassin (#190) : ovale et haricot, de dessus et en trois-quarts.
    { name: 'bassin-top-ovale', query: 'environnement=bassin&forme=ovale' },
    {
      name: 'bassin-three-quarter-ovale',
      query: 'environnement=bassin&camera=three-quarter&forme=ovale',
    },
    { name: 'bassin-top-haricot', query: 'environnement=bassin&forme=haricot' },
    {
      name: 'bassin-three-quarter-haricot',
      query: 'environnement=bassin&camera=three-quarter&forme=haricot',
    },
  ] as const;
  for (const { name, query } of POND_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${SEED}&time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Paludarium (#129) : berge émergée et eau, vue trois-quarts par défaut (sans `camera=`),
  // coupe de côté et de face, dessus, dessous, minuit et sans filtre. Bac et bassin ci-dessus
  // inchangés.
  const PALUDARIUM_CAPTURES = [
    { name: 'paludarium-three-quarter', query: 'environnement=paludarium' },
    { name: 'paludarium-side', query: 'environnement=paludarium&camera=side' },
    { name: 'paludarium-front', query: 'environnement=paludarium&camera=front' },
    { name: 'paludarium-top', query: 'environnement=paludarium&camera=top' },
    { name: 'paludarium-bottom', query: 'environnement=paludarium&camera=bottom' },
    { name: 'paludarium-three-quarter-minuit', query: 'environnement=paludarium&heure=0' },
    // Mousses et racines (#132) : mêmes teintes sans le filtre pixel art (cf. #40).
    {
      name: 'paludarium-three-quarter-sans-filtre',
      query: 'environnement=paludarium&filtre=aucun',
    },
  ] as const;
  for (const { name, query } of PALUDARIUM_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${SEED}&time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Récif (#148) : eau bleue, sable corallien et coraux (#149), sans habitants ; vue
  // trois-quarts par défaut (sans `camera=`), face, dessus, côté, dessous, minuit et sans filtre.
  const REEF_CAPTURES = [
    { name: 'recif-three-quarter', query: 'environnement=recif' },
    { name: 'recif-front', query: 'environnement=recif&camera=front' },
    { name: 'recif-top', query: 'environnement=recif&camera=top' },
    { name: 'recif-side', query: 'environnement=recif&camera=side' },
    { name: 'recif-bottom', query: 'environnement=recif&camera=bottom' },
    { name: 'recif-three-quarter-minuit', query: 'environnement=recif&heure=0' },
    // Coraux (#149) : mêmes teintes sans le filtre pixel art (cf. #40).
    { name: 'recif-three-quarter-sans-filtre', query: 'environnement=recif&filtre=aucun' },
    // Récif, lot 2 (#403) : chromis verts, gobie à crevette jaune et grammas royaux mêlés aux
    // poissons-clowns et aux chirurgiens.
    { name: 'recif-three-quarter-lot2', query: `environnement=recif&${REEF_LOT2}` },
    { name: 'recif-front-lot2', query: `environnement=recif&${REEF_LOT2}&camera=front` },
    // Récif, lot 3 (#422) : crevettes nettoyeuses et blennie bicolore en plus du lot 2, gobie et
    // gramma plus lisibles (#405).
    { name: 'recif-three-quarter-lot3', query: `environnement=recif&${REEF_LOT3}` },
    { name: 'recif-front-lot3', query: `environnement=recif&${REEF_LOT3}&camera=front` },
  ] as const;
  for (const { name, query } of REEF_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${SEED}&time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Bac d'eau froide (#271) : axolotls seuls ; vue trois-quarts par défaut, côté et dessus.
  const COLD_CAPTURES = [
    { name: 'eaufroide-three-quarter', query: 'environnement=eaufroide' },
    { name: 'eaufroide-side', query: 'environnement=eaufroide&camera=side' },
    { name: 'eaufroide-top', query: 'environnement=eaufroide&camera=top' },
  ] as const;
  for (const { name, query } of COLD_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${SEED}&time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Téléphone en portrait (390 × 844, #117) : vue trois-quarts cadrée sur un écran étroit,
  // donc dézoomée, sans nourriture puis avec granulés posés en points et en voxels.
  const PHONE_CAPTURES = [
    { name: 'telephone-three-quarter', query: '' },
    { name: 'telephone-three-quarter-nourriture', query: `&${RESTING_FOOD}&granules=points` },
    {
      name: 'telephone-three-quarter-nourriture-voxels',
      query: `&${RESTING_FOOD}&granules=voxels`,
    },
  ] as const;
  for (const { name, query } of PHONE_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/?capture=1&seed=${SEED}&camera=three-quarter&time=${TIME_SECONDS}${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Panneau de contrôle ouvert (#52) : hors mode capture (le contrat de capture n'affiche
  // aucune interface), heure figée à midi, simulation à l'arrêt dès t = 0 par `vitesse=0`
  // (#232) : reproductible à l'octet comme les captures ci-dessus. Arrêtée au curseur après
  // le chargement, elle dépendait de l'instant de l'arrêt.
  test('angle front avec le panneau de contrôle ouvert', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=front&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.screenshot({ path: join(OUTPUT_DIR, 'front-panneau.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });

  // Soins des points blancs (#361) : bac malade (`points-blancs=1`), réglages ouverts, une
  // dose de médicament donnée : section « Soins » avec le traitement en cours et alerte
  // « Traitement en cours ». Simulation à l'arrêt dès t = 0, comme `front-panneau`.
  test('angle front avec le panneau de soins', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=front&heure=12&vitesse=0&points-blancs=1`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('button', { name: 'Ajouter 1 dose de médicament' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-treatment', /^5;/);
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.screenshot({ path: join(OUTPUT_DIR, 'front-soins.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });

  // Pharmacie du bac (#533) : bac malade (`points-blancs=1`), pharmacie ouverte, conseil du
  // médicament ; simulation à l'arrêt dès t = 0, comme `front-panneau`.
  test('angle front avec la pharmacie du bac ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=front&heure=12&vitesse=0&points-blancs=1`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.locator('[data-pharmacy-toggle]').click();
    await expect(page.locator('[data-pharmacy-advice]')).toHaveAttribute(
      'data-product',
      'medicament',
    );
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.screenshot({
      path: join(OUTPUT_DIR, 'front-pharmacie.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Kit de test de l'eau (#564) : bac par défaut, résultat du kit pH prêt au chargement
  // (`test-eau=ph`), pharmacie ouverte ; simulation à l'arrêt dès t = 0.
  test('angle three-quarter avec le kit de test de l’eau', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0&test-eau=ph`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.locator('[data-pharmacy-toggle]').click();
    await expect(page.locator('[data-water-test]')).toHaveAttribute('data-state', 'termine');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-kit-eau.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Mode décor (#278) : bac tropical avec des poissons d'autres milieux (clowns du récif, un
  // koï), contrat de capture (`mode=decor`), puis la même scène avec l'interface : badge à la
  // place du tableau de bord, simulation à l'arrêt dès t = 0.
  test('mode décor : capture du bac et badge', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const scene = `seed=${SEED}&camera=front&mode=decor&population=neon:8,clown:3,koi:1`;
    await page.goto(`/?capture=1&${scene}&time=${TIME_SECONDS}`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.screenshot({ path: join(OUTPUT_DIR, 'front-decor.png'), animations: 'disabled' });
    await page.goto(`/?${scene}&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(page.locator('[data-decor-badge]')).toBeVisible();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.screenshot({
      path: join(OUTPUT_DIR, 'front-decor-badge.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Liste des bacs (#306) à trois bacs (tropical, récif, paludarium), bureau et téléphone :
  // les deux autres environnements visités puis le bac tropical repris (vue trois-quarts par
  // défaut), simulation à l'arrêt dès t = 0, section « Bacs » amenée en vue. Captures
  // d'interface, comme ci-dessus.
  for (const shot of [
    { name: 'interface-liste-bacs', width: 1280, height: 720 },
    { name: 'telephone-liste-bacs', width: 390, height: 844 },
  ]) {
    test(`liste des bacs : ${shot.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(`/?seed=${SEED}&camera=front&heure=12&vitesse=0`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.getByRole('button', { name: 'Réglages' }).click();
      const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
      for (const id of ['recif', 'paludarium', 'tropical']) {
        await environment.selectOption(id);
        await expect(page.locator('app-aquarium-host')).toHaveAttribute(
          'data-aqfish-environment',
          id,
        );
      }
      await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
      const section = page.locator('[data-section="bacs"]');
      await expect(section.locator('[data-tank]')).toHaveCount(3);
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUTPUT_DIR, `${shot.name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Catalogue d'espèces (#189) à 390 px : panneau ouvert, section « Population » amenée en
  // vue (défilement interne), simulation à l'arrêt dès t = 0. Capture d'interface, comme
  // ci-dessus.
  test('téléphone avec le catalogue d’espèces ouvert', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.locator('[data-section="population"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(OUTPUT_DIR, 'telephone-catalogue.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Fiche d'espèce (#237) à 390 px : panneau ouvert, fiche du néon ouverte et amenée en vue,
  // simulation à l'arrêt dès t = 0. Capture d'interface, comme ci-dessus.
  test('téléphone avec une fiche d’espèce ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.getByRole('button', { name: 'Fiche : Néon' }).click();
    const sheet = page.locator('[data-species-sheet="neon"]');
    await expect(sheet).toBeVisible();
    await sheet.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(OUTPUT_DIR, 'telephone-fiche-espece.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Fiche du chirurgien bleu (#269) sur bureau, angle trois-quarts : mise en garde « pas pour
  // débutant » et statut légal. Simulation à l'arrêt dès t = 0, comme ci-dessus.
  test('bureau avec la fiche du chirurgien bleu ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?environnement=recif&seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.getByRole('button', { name: 'Fiche : Chirurgien bleu' }).click();
    const sheet = page.locator('[data-species-sheet="chirurgien"]');
    await expect(sheet.locator('[data-sheet-note]')).toHaveCount(1);
    await sheet.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-fiche-chirurgien.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Wiki des espèces (#287), fiche du néon ouverte, trois-quarts, bureau et téléphone :
  // simulation à l'arrêt dès t = 0. Captures d'interface, comme ci-dessus.
  for (const shot of [
    { name: 'three-quarter-wiki-fiche', width: 1280, height: 720 },
    { name: 'telephone-wiki-fiche', width: 390, height: 844 },
  ]) {
    test(`wiki des espèces : ${shot.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.getByRole('button', { name: 'Wiki des espèces' }).click();
      await page.locator('#wiki-especes [data-wiki-species="neon"]').click();
      await expect(page.locator('[data-wiki-sheet="neon"]')).toBeVisible();
      await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
      // Souris hors des panneaux : opacité de repos des boutons.
      await page.mouse.move(shot.width / 2, shot.height / 2);
      await page.screenshot({ path: join(OUTPUT_DIR, `${shot.name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Section « Eau » (#207) à 390 px : panneau ouvert, section amenée en vue, simulation à
  // l'arrêt dès t = 0. Capture d'interface, comme ci-dessus.
  test('téléphone avec la section « Eau » ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.locator('[data-section="eau"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUTPUT_DIR, 'telephone-eau.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });

  // Section « Eau » avec la jauge pH (#236), trois-quarts, 1280 × 720 : panneau ouvert,
  // section amenée en vue, simulation à l'arrêt dès t = 0. Capture d'interface, comme
  // ci-dessus.
  test('angle three-quarter avec la section « Eau » ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.locator('[data-section="eau"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-gauge="ph"]')).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-panneau-eau.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Section « Son » (#411), trois-quarts, 1280 × 720 : panneau ouvert, section amenée en vue,
  // simulation à l'arrêt dès t = 0. Son désactivé (défaut) : rien ne démarre.
  test('angle three-quarter avec la section « Son » ouverte', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
    await page.locator('[data-section="son"]').scrollIntoViewIfNeeded();
    await expect(page.getByRole('checkbox', { name: "Sons d'ambiance" })).not.toBeChecked();
    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-panneau-son.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  // Tableau de bord (#256, #260) en bordure, trois-quarts, bureau, tablette et téléphone :
  // panneaux fermés (« Commandes » à son état par défaut), simulation à l'arrêt dès t = 0.
  // Avec `alerte`, bac importé à l'eau mauvaise (ammoniaque 6, nitrites 2,5, nitrates 50) et
  // animaux affamés de longue date : cinq alertes, trois affichées. Captures d'interface.
  for (const shot of [
    { name: 'three-quarter-tableau-de-bord', width: 1280, height: 720, alert: false },
    { name: 'tablette-tableau-de-bord', width: 768, height: 1024, alert: false },
    { name: 'telephone-tableau-de-bord', width: 390, height: 844, alert: false },
    { name: 'three-quarter-tableau-de-bord-alerte', width: 1280, height: 720, alert: true },
    { name: 'tablette-tableau-de-bord-alerte', width: 768, height: 1024, alert: true },
    { name: 'telephone-tableau-de-bord-alerte', width: 390, height: 844, alert: true },
  ]) {
    test(`tableau de bord : ${shot.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(`/?seed=${SEED}&camera=three-quarter&heure=12&vitesse=0`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      if (shot.alert) {
        const world: MutableWorld = createDefaultWorld(SEED);
        world.water = { ...freshWater('tropical'), ammonia: 6, nitrite: 2.5, nitrate: 50 };
        starveWorldInPlace(world);
        const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
        const settings = page.getByRole('button', { name: 'Réglages' });
        await settings.click();
        await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
          name: 'eau.json',
          mimeType: 'application/json',
          buffer: Buffer.from(text),
        });
        await expect(page.locator('[data-dashboard] [data-gauge="nitrate"]')).toHaveAttribute(
          'data-level',
          'rouge',
        );
        await expect(page.locator('[data-dashboard-status] [data-alert]')).toHaveCount(3);
        await settings.click();
        await expect(page.locator('.control-panel')).toHaveCount(0);
      }
      await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
      await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-tick', '0');
      await expect(page.locator('[data-dashboard]').getByRole('meter')).toHaveCount(5);
      // Souris hors du cadre : opacité de repos.
      await page.mouse.move(shot.width / 2, shot.height / 2);
      await page.screenshot({ path: join(OUTPUT_DIR, `${shot.name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Alerte chlore (#530) : eau non traitée versée sans conditionneur, vue de face.
  test('tableau de bord : front-tableau-de-bord-chlore', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/?seed=${SEED}&camera=front&heure=12&vitesse=0`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const world: MutableWorld = createDefaultWorld(SEED);
    world.water = { ...freshWater('tropical'), chlorine: 0.15, untreatedTap: true };
    const settings = page.getByRole('button', { name: 'Réglages' });
    await settings.click();
    await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
      name: 'chlore.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) }),
      ),
    });
    await expect(page.locator('[data-dashboard-status] [data-alert]').first()).toContainText(
      'Chlore',
    );
    await settings.click();
    await expect(page.locator('.control-panel')).toHaveCount(0);
    // L'import remet la caméra du bac : revenir à la vue de face.
    await page.getByRole('button', { name: 'Face' }).click();
    await page.mouse.move(640, 360);
    await page.screenshot({
      path: join(OUTPUT_DIR, 'front-tableau-de-bord-chlore.png'),
      animations: 'disabled',
    });
  });

  test('tracé des trajectoires, vue de dessus', async ({ page }) => {
    const svg = trajectorySvg(SEED, TRACE_SECONDS);
    await page.setViewportSize({ width: svg.width, height: svg.height });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1c22">${svg.markup}</body></html>`,
    );
    await page.screenshot({ path: join(OUTPUT_DIR, 'trajectoires-top.png') });
  });

  test('tracé des trajectoires avec nourriture, vue de dessus', async ({ page }) => {
    const svg = trajectorySvg(SEED, TRACE_FOOD_SECONDS, TRACE_FEEDINGS);
    await page.setViewportSize({ width: svg.width, height: svg.height });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1c22">${svg.markup}</body></html>`,
    );
    await page.screenshot({ path: join(OUTPUT_DIR, 'trajectoires-nourriture-top.png') });
  });
});

/** Dépôts du tracé avec nourriture (issue #68) : à t = 0, en eau libre (x, z en mètres). */
const TRACE_FEEDINGS: readonly { x: number; z: number }[] = [
  { x: -0.25, z: 0.1 },
  { x: 0.1, z: 0 },
  { x: 0.4, z: 0.15 },
];
const TRACE_FOOD_SECONDS = 30;

const TRACE_SECONDS = Number(process.env['CAPTURE_TRACE_TIME'] ?? 60);
/** Pixels par mètre du tracé. */
const TRACE_SCALE = 1000;
const TRACE_PADDING = 40;
/** Hauteur d'une ligne de légende, en pixels. */
const TRACE_LINE_HEIGHT = 22;
const TRACE_COLORS: Record<string, string> = {
  neon: '#3fa9f5',
  guppy: '#e8a33d',
  corydora: '#f2ead8',
};

/**
 * Tracé SVG vu de dessus (X vers la droite, Z vers le bas, comme la vue `top`) : vitres
 * (trait plein), limite de nage `wallMargin` (tirets), obstacles (disques), une polyligne
 * par poisson, et une légende sur plusieurs lignes avec la médiane des distances minimales
 * aux vitres (nombres au format français).
 */
function trajectorySvg(
  seed: number,
  seconds: number,
  feedings: readonly { x: number; z: number }[] = [],
): { markup: string; width: number; height: number } {
  const water = waterVolume();
  const steps = Math.round(seconds / SIM_DT);
  let start: World = createDefaultWorld(seed);
  for (const { x, z } of feedings) {
    start = feed(start, x, z);
  }
  const traces = recordTrajectories(start, steps, 3);
  // Statistiques de #43 sur les néons et les guppys, comparables d'un cycle à l'autre.
  const stats = glassStats(
    traces.filter((t) => t.species !== 'corydora'),
    water,
    0.1,
  );
  // Légende : une ligne de texte par entrée, pour ne jamais déborder du tracé (#85).
  const textLines = [
    `graine ${seed}, ${seconds} s simulées — néons (bleu), guppys (orange), corydoras (blanc)` +
      ` — rochers (gris) et plantes (vert) vus de dessus, survolables`,
    `néons et guppys : médiane des distances minimales aux vitres : ${frNumber(stats.medianMinimum * 100)} cm,` +
      ` positions à moins de 10 cm : ${frNumber(stats.nearFraction * 100)} %`,
  ];
  if (feedings.length > 0) {
    textLines.push(
      `${start.food.length - advance(start, steps).food.length} granulés mangés sur ` +
        `${start.food.length} en ${seconds} s (croix rouges : dépôts à t = 0)`,
    );
  }
  const width = Math.round((water.maxX - water.minX) * TRACE_SCALE) + 2 * TRACE_PADDING;
  const tankBottom = Math.round((water.maxZ - water.minZ) * TRACE_SCALE) + 2 * TRACE_PADDING;
  const height = tankBottom + TRACE_LINE_HEIGHT * textLines.length + 8;
  const px = (x: number) => (TRACE_PADDING + (x - water.minX) * TRACE_SCALE).toFixed(1);
  const pz = (z: number) => (TRACE_PADDING + (z - water.minZ) * TRACE_SCALE).toFixed(1);
  const hard = swimBounds(SPECIES.neon, water).hard;
  const rect = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, style: string) =>
    `<rect x="${px(b.minX)}" y="${pz(b.minZ)}" width="${((b.maxX - b.minX) * TRACE_SCALE).toFixed(1)}" height="${((b.maxZ - b.minZ) * TRACE_SCALE).toFixed(1)}" fill="none" ${style}/>`;
  // Obstacles vus de dessus (#55) : un disque par sphère de collision, rochers en gris,
  // plantes en vert. Les formes du décor suivent les obstacles explicites, dans l'ordre.
  const decorStart = start.obstacles.length - start.decor.length;
  const obstacles = start.obstacles
    .map((o, i) => {
      const plant = i >= decorStart && start.decor[i - decorStart]?.kind === 'plant';
      const style = plant
        ? 'fill="#4caf50" fill-opacity="0.18" stroke="#4caf50" stroke-width="1"'
        : 'fill="#8d8a99" fill-opacity="0.35" stroke="#b7b4c4" stroke-width="1"';
      const spheres = o.shape === 'sphere' ? [o] : o.spheres;
      return spheres
        .map(
          (sp) =>
            `<circle cx="${px(sp.x)}" cy="${pz(sp.z)}" r="${(sp.radius * TRACE_SCALE).toFixed(1)}" ${style}/>`,
        )
        .join('');
    })
    .join('');
  const lines = traces
    .map(
      (t) =>
        `<polyline fill="none" stroke="${TRACE_COLORS[t.species] ?? '#f2ead8'}" stroke-width="1.5" stroke-opacity="0.8" points="${t.points.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ')}"/>`,
    )
    .join('');
  // Granulés : croix rouges aux points de dépôt.
  const crosses = feedings
    .map(
      ({ x, z }) =>
        `<path d="M${(+px(x) - 9).toFixed(1)},${(+pz(z) - 9).toFixed(1)} l18,18 m0,-18 l-18,18" stroke="#e63946" stroke-width="3"/>`,
    )
    .join('');
  const texts = textLines
    .map(
      (line, i) =>
        `<text x="${TRACE_PADDING}" y="${tankBottom + TRACE_LINE_HEIGHT * (i + 1) - 6}" fill="#f2ead8" font-size="15">${line}</text>`,
    )
    .join('');
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif">` +
    rect(water, 'stroke="#a8e6cf" stroke-width="2"') +
    rect(hard, 'stroke="#6a6779" stroke-width="1" stroke-dasharray="6 4"') +
    obstacles +
    lines +
    crosses +
    texts +
    `</svg>`;
  return { markup, width, height };
}

/** Nombre à une décimale, virgule décimale (format français) : 8.8 → « 8,8 ». */
function frNumber(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
