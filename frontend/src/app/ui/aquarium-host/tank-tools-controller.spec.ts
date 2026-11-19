import type { AquariumView } from '../../render/aquarium-view';
import type { DecorPick } from '../../render/decor-pick';
import { createWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import { PRUNER_ATTRIBUTE, SCRAPER_ATTRIBUTE } from './aquarium-attributes';
import { AquariumProbe } from './aquarium-probe';
import { TankToolsController } from './tank-tools-controller';

const RAY = {
  origin: [0, 0, 5] as const,
  direction: [0, 0, -1] as const,
};

/** Double de la vue : rend le choix et le rayon demandés par le test. */
class FakeView {
  pick: DecorPick = null;
  ray: typeof RAY | null = RAY;
  pickDecor(): DecorPick {
    return this.pick;
  }
  pickRay(): typeof RAY | null {
    return this.ray;
  }
}

describe('TankToolsController (#696)', () => {
  let element: HTMLElement;
  let world: MutableWorld | null;
  let capture: boolean;
  let editing: boolean;
  let cutting: boolean;
  let siphoning: boolean;
  let calls: string[];
  let view: FakeView;
  let tools: TankToolsController;

  beforeEach(() => {
    element = document.createElement('div');
    world = createWorld(5, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    capture = false;
    editing = false;
    cutting = false;
    siphoning = false;
    calls = [];
    view = new FakeView();
    tools = new TankToolsController({
      probe: new AquariumProbe(element),
      world: () => world,
      isCapture: () => capture,
      applyWaterSetting: (apply) => {
        calls.push('réglage');
        if (world && !capture) {
          apply(world);
        }
      },
      records: {
        recordMaintenance: (_world, task) => calls.push(`entretien:${task}`),
        journalOf: () => ({ entries: [], version: 0 }),
      },
      refreshPopulation: () => calls.push('effectifs'),
      editor: {
        editing: () => editing,
        editAt: () => calls.push('édition'),
      },
      care: {
        isCutting: () => cutting,
        cutPlant: (index) => calls.push(`coupe:${index}`) > 0,
        isSiphoning: () => siphoning,
      },
      feed: (x, z) => calls.push(`nourrir:${x},${z}`),
    });
  });

  const click = (): void => {
    tools.canvasClick(view as unknown as AquariumView, 10, 10);
    tools.surfaceClick(1, 2);
  };

  it('raclette et sécateur : un seul outil en main, attributs publiés', () => {
    tools.toggleScraper();
    expect(tools.scraping()).toBe(true);
    expect(element.getAttribute(SCRAPER_ATTRIBUTE)).toBe('true');
    tools.togglePruner();
    expect(tools.pruning()).toBe(true);
    expect(tools.scraping()).toBe(false);
    expect(element.getAttribute(PRUNER_ATTRIBUTE)).toBe('true');
    expect(element.getAttribute(SCRAPER_ATTRIBUTE)).toBe('false');
  });

  it('en capture : aucun outil ne se prend', () => {
    capture = true;
    tools.toggleScraper();
    tools.togglePruner();
    expect(tools.scraping()).toBe(false);
    expect(tools.pruning()).toBe(false);
    expect(element.getAttribute(SCRAPER_ATTRIBUTE)).toBeNull();
  });

  it('clic sans outil : nourrit au point de la surface', () => {
    click();
    expect(calls).toEqual(['nourrir:1,2']);
  });

  it('clic en mode édition : édite, ne nourrit pas', () => {
    editing = true;
    click();
    expect(calls).toEqual(['édition']);
  });

  it('raclette en main : racle le long du rayon, ne nourrit pas', () => {
    tools.toggleScraper();
    click();
    expect(calls).toEqual(['réglage']);
  });

  it('raclette en main sans rayon : rien', () => {
    tools.toggleScraper();
    view.ray = null;
    click();
    expect(calls).toEqual([]);
  });

  it('sécateur pendant la séance : coupe la pousse de la plante visée', () => {
    tools.togglePruner();
    cutting = true;
    view.pick = { kind: 'item', index: 3 };
    click();
    expect(calls).toEqual(['coupe:3']);
  });

  it('sécateur hors séance : taille la plante visée ; rien hors d’un élément', () => {
    tools.togglePruner();
    view.pick = { kind: 'item', index: 0 };
    click();
    expect(calls).toEqual(['réglage']);
    calls = [];
    view.pick = null;
    click();
    expect(calls).toEqual([]);
  });

  it('épuisette : clic sans corps touché, la nourriture suit', () => {
    world!.dead = [];
    click();
    expect(calls).toEqual(['réglage', 'nourrir:1,2']);
  });

  it('tuyau du siphon en main : ne nourrit pas', () => {
    siphoning = true;
    click();
    expect(calls).toEqual([]);
  });

  it('taille et raclage avant le démarrage : faux et -1', () => {
    world = null;
    expect(tools.prunePlant(0)).toBe(false);
    expect(tools.scrapeAlong(RAY.origin, RAY.direction)).toBe(-1);
    expect(tools.netAlong(RAY.origin, RAY.direction)).toBe(false);
    expect(calls).toEqual(['réglage', 'réglage', 'réglage']);
  });
});
