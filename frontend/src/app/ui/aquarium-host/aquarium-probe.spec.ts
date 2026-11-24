import { freshWater } from '../../sim/water';
import { waterReadout } from '../../sim/water-quality';
import { createDefaultWorld } from '../../sim/world';
import type { World } from '../../sim/world-types';
import * as attributes from './aquarium-attributes';
import {
  DEAD_ATTRIBUTE,
  FEEDER_ATTRIBUTE,
  HOUR_ATTRIBUTE,
  LAMP_ATTRIBUTE,
  LIGHT_RAYS_ATTRIBUTE,
  PLANTS_ATTRIBUTE,
  SAVE_ATTRIBUTE,
  TICK_ATTRIBUTE,
  TREATMENT_ATTRIBUTE,
} from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';

/** Attributs publiés par l'hôte au moment du découpage (#693) : un contrat pour les e2e. */
const PUBLISHED_ATTRIBUTES = [
  'data-aqfish-algae',
  'data-aqfish-animaux-signales',
  'data-aqfish-bacteries',
  'data-aqfish-camera',
  'data-aqfish-camera-libre',
  'data-aqfish-capacity',
  'data-aqfish-care-session',
  'data-aqfish-catappa',
  'data-aqfish-current',
  'data-aqfish-decor',
  'data-aqfish-decor-count',
  'data-aqfish-decor-physics',
  'data-aqfish-decor-selected',
  'data-aqfish-editing',
  'data-aqfish-environment',
  'data-aqfish-feeder',
  'data-aqfish-filter',
  'data-aqfish-fond',
  'data-aqfish-fond-pause',
  'data-aqfish-food',
  'data-aqfish-food-style',
  'data-aqfish-fouling',
  'data-aqfish-fouling-cells',
  'data-aqfish-hour',
  'data-aqfish-hour-frozen',
  'data-aqfish-lamp',
  'data-aqfish-mode',
  'data-aqfish-morts',
  'data-aqfish-mouvements-reduits',
  'data-aqfish-ph',
  'data-aqfish-plants',
  'data-aqfish-population',
  'data-aqfish-pruner',
  'data-aqfish-rain',
  'data-aqfish-rayons',
  'data-aqfish-room',
  'data-aqfish-room-count',
  'data-aqfish-room-selected',
  'data-aqfish-room-supports',
  'data-aqfish-room-tanks',
  'data-aqfish-save',
  'data-aqfish-scraper',
  'data-aqfish-seed',
  'data-aqfish-selected-tank',
  'data-aqfish-shape',
  'data-aqfish-speed',
  'data-aqfish-tank',
  'data-aqfish-target',
  'data-aqfish-tick',
  'data-aqfish-treatment',
  'data-aqfish-water',
];

/** Attributs `data-aqfish-*` de l'élément, triés. */
function published(element: HTMLElement): string[] {
  return element
    .getAttributeNames()
    .filter((name) => name.startsWith('data-aqfish-'))
    .sort();
}

/** Appelle chaque publication de la sonde une fois, avec des valeurs non vides. */
function publishAll(probe: AquariumProbe, world: World): void {
  probe.publishTick(world);
  probe.publishFood(world);
  probe.publishLightRays(0.5, 3.7);
  probe.publishLamp(1);
  probe.publishHour(12);
  probe.publishPlants('3,4', 0.8);
  probe.publishFeeder({ stock: 12, hours: [9, 18] });
  probe.publishWater(waterReadout(freshWater('tropical'), 'tropical'));
  probe.publishTreatment({ products: 'sel', remainingDays: 4.5, medicationDays: null });
  probe.publishFilterBacteria(100);
  probe.publishCapacity(0.78);
  probe.publishAlgae(0, 0, 8);
  probe.publishFouling({ glass: 0.2, floor: 0.1 }, { glass: 3, floor: 1 });
  probe.publishDead(1);
  probe.publishPopulation('neon:12');
  probe.publishCareMode('soins');
  probe.publishCurrent('doux');
  probe.publishAlertHighlight(2);
  probe.publishEnvironment('tropical');
  probe.publishTank('rectangle', { width: 1.2, height: 0.6, depth: 0.5 });
  probe.publishSeed(7);
  probe.publishSpeed(1);
  probe.publishDecorVisible(true);
  probe.publishFreeCamera(false);
  probe.publishReducedMotion(false);
  probe.publishRain(false);
  probe.publishRoomShown(false);
  probe.publishRoomCount(0);
  probe.publishRoomCatalog(1, 0);
  probe.publishSelectedTank(0);
  probe.publishFoodStyle('voxels');
  probe.publishScraper(false);
  probe.publishPruner(false);
  probe.publishCareSession('vitres');
  probe.publishDecorPhysics('pret');
  probe.publishEditing(false);
  probe.publishDecorCount(10);
  probe.publishDecorSelection(null);
  probe.publishRoomSelection(0);
  probe.publishSave('active');
  probe.publishHourFrozen(false);
  probe.publishFilter('pixel');
  probe.publishCamera({ cameraPosition: () => [1, 2, 3], cameraTarget: () => [0, 0.3, 0] });
  probe.publishWallpaper('defaut');
  probe.publishWallpaperPaused(false);
}

describe('AquariumProbe (#693)', () => {
  let element: HTMLElement;
  let probe: AquariumProbe;
  let world: World;

  beforeEach(() => {
    element = document.createElement('div');
    probe = new AquariumProbe(element);
    world = createDefaultWorld(7);
  });

  it('publie exactement la liste des attributs du contrat, ni plus ni moins', () => {
    publishAll(probe, world);
    expect(published(element)).toEqual(PUBLISHED_ATTRIBUTES);
  });

  it('chaque attribut déclaré dans aquarium-attributes est publié par la sonde', () => {
    const declared = Object.values(attributes).sort();
    expect(declared).toEqual(PUBLISHED_ATTRIBUTES);
  });

  it('occupation du bac (#809) : pourcentage entier, « inf » sans eau', () => {
    probe.publishCapacity(0.784);
    expect(element.getAttribute('data-aqfish-capacity')).toBe('78');
    probe.publishCapacity(Number.POSITIVE_INFINITY);
    expect(element.getAttribute('data-aqfish-capacity')).toBe('inf');
  });

  it("n'écrit rien de plus que les attributs data-aqfish-*", () => {
    publishAll(probe, world);
    expect(element.getAttributeNames().every((name) => name.startsWith('data-aqfish-'))).toBe(true);
  });

  it('pas et granulés : réécrits seulement quand ils changent, rien sans monde', () => {
    const write = vi.spyOn(element, 'setAttribute');
    probe.publishTick(null);
    probe.publishFood(null);
    expect(write).not.toHaveBeenCalled();
    probe.publishTick(world);
    probe.publishTick(world);
    probe.publishFood(world);
    probe.publishFood(world);
    expect(write).toHaveBeenCalledTimes(2);
    expect(element.getAttribute(TICK_ATTRIBUTE)).toBe(String(world.tick));
  });

  it('heure au centième, 23,999 publiée « 0.00 », écrite seulement si elle change', () => {
    const write = vi.spyOn(element, 'setAttribute');
    probe.publishHour(23.999);
    expect(element.getAttribute(HOUR_ATTRIBUTE)).toBe('0.00');
    probe.publishHour(0.001);
    expect(write).toHaveBeenCalledTimes(1);
    probe.publishHour(7.256);
    expect(element.getAttribute(HOUR_ATTRIBUTE)).toBe('7.26');
  });

  it('lampe et rayons : arrondis, réécrits seulement quand ils changent', () => {
    const write = vi.spyOn(element, 'setAttribute');
    probe.publishLamp(0.504);
    probe.publishLamp(0.496);
    probe.publishLightRays(0.25, 2.1);
    probe.publishLightRays(0.25, 2.9);
    expect(write).toHaveBeenCalledTimes(2);
    expect(element.getAttribute(LAMP_ATTRIBUTE)).toBe('0.50');
    expect(element.getAttribute(LIGHT_RAYS_ATTRIBUTE)).toBe('0.25;2');
  });

  it('plantes : pousses et lumière du fond en %, vide sans plante à tige', () => {
    probe.publishPlants('', 1);
    expect(element.getAttribute(PLANTS_ATTRIBUTE)).toBe(';100');
    const write = vi.spyOn(element, 'setAttribute');
    probe.publishPlants('', 0.999);
    expect(write).not.toHaveBeenCalled();
  });

  it('distributeur : « aucun » ou réserve;heures, vrai seulement s’il a changé', () => {
    expect(probe.publishFeeder(undefined)).toBe(true);
    expect(element.getAttribute(FEEDER_ATTRIBUTE)).toBe('aucun');
    expect(probe.publishFeeder(undefined)).toBe(false);
    expect(probe.publishFeeder({ stock: 0, hours: [9] })).toBe(true);
    expect(element.getAttribute(FEEDER_ATTRIBUTE)).toBe('0;9');
  });

  it('corps, traitement, alerte et séance : attribut retiré à zéro ou sans valeur', () => {
    publishAll(probe, world);
    probe.publishDead(0);
    probe.publishTreatment(null);
    probe.publishAlertHighlight(0);
    probe.publishCareSession(null);
    const names = published(element);
    expect(names).not.toContain(DEAD_ATTRIBUTE);
    expect(names).not.toContain(TREATMENT_ATTRIBUTE);
    expect(names).not.toContain('data-aqfish-animaux-signales');
    expect(names).not.toContain('data-aqfish-care-session');
  });

  it('traitement : second champ vide sans médicament', () => {
    probe.publishTreatment({ products: 'sel', remainingDays: 4.5, medicationDays: null });
    expect(element.getAttribute(TREATMENT_ATTRIBUTE)).toBe('4.5;');
    probe.publishTreatment({ products: 'médicament', remainingDays: 2, medicationDays: 0.8 });
    expect(element.getAttribute(TREATMENT_ATTRIBUTE)).toBe('2;0.8');
  });

  it('sauvegarde sans état (capture) : attribut laissé tel quel', () => {
    probe.publishSave(null);
    expect(element.hasAttribute(SAVE_ATTRIBUTE)).toBe(false);
    probe.publishSave('plein');
    probe.publishSave(null);
    expect(element.getAttribute(SAVE_ATTRIBUTE)).toBe('plein');
  });

  it('caméra : rien sans vue, coordonnées au millième sinon', () => {
    probe.publishCamera(null);
    expect(published(element)).toEqual([]);
    probe.publishCamera({ cameraPosition: () => [1, -0.5, 2], cameraTarget: () => [0, 0, 0] });
    expect(element.getAttribute('data-aqfish-camera')).toBe('1.000,-0.500,2.000');
    expect(element.getAttribute('data-aqfish-target')).toBe('0.000,0.000,0.000');
  });

  it('relevé de l’eau : hasWater faux avant la première publication, vrai après', () => {
    expect(probe.hasWater()).toBe(false);
    probe.publishWater(waterReadout(freshWater('tropical'), 'tropical'));
    expect(probe.hasWater()).toBe(true);
    expect(element.getAttribute('data-aqfish-water')).toBe('bonne;24;24;0;0;0');
    expect(element.getAttribute('data-aqfish-ph')).toBe('7;ideal');
    expect(element.getAttribute('data-aqfish-catappa')).toBe('0;0');
  });

  it('sélections : « aucun » sans sélection, indice sinon', () => {
    probe.publishDecorSelection(null);
    probe.publishRoomSelection(3);
    expect(element.getAttribute('data-aqfish-decor-selected')).toBe('aucun');
    expect(element.getAttribute('data-aqfish-room-selected')).toBe('3');
  });
});
