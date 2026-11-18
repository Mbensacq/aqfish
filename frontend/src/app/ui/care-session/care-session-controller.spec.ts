import type { CareSoundKind } from '../../core/care-sound/care-sound';
import type { SaveStorage } from '../../core/save-storage/save-storage';
import type { PhotoImage, PhotoPixels } from '../../render/photo-capture';
import { ALGAE_PATCH_COUNT, type AlgaeWater, type ScraperRay } from '../../sim/algae';
import { setCareModeInPlace } from '../../sim/care-mode';
import { serializeCareSession, type CareSession } from '../../sim/care-session';
import type { FoodPellet } from '../../sim/food';
import { createJournal, journalLines, type Journal } from '../../sim/journal';
import type { MaintenanceTask } from '../../sim/maintenance';
import { SIPHON_SHARE_PER_POINT } from '../../sim/siphon';
import { createWaterHistory, type WaterHistory } from '../../sim/water-history';
import { createDefaultWorld, worldAlgaePatches } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import {
  CARE_SESSION_STORAGE_KEY,
  CareSessionController,
  type CareSessionPorts,
  type CareSessionView,
} from './care-session-controller';

/** Stockage en mémoire de la séance interrompue. */
class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** Stockage qui refuse tout (navigation privée, quota). */
class BrokenStorage implements SaveStorage {
  getItem(): string | null {
    throw new DOMException('refusé', 'SecurityError');
  }
  setItem(): void {
    throw new DOMException('quota', 'QuotaExceededError');
  }
}

/** Relevé 1 × 1 du bac. */
const PIXELS: PhotoPixels = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) };

/** Double de la vue : rayons choisis par le test, relevés comptés. */
class FakeView implements CareSessionView {
  ray: ScraperRay | null = null;
  photos = 0;
  photo: PhotoPixels | null = PIXELS;
  stroke: boolean[] = [];
  takePhoto(): PhotoPixels | null {
    this.photos++;
    return this.photo;
  }
  pickRay(): ScraperRay | null {
    return this.ray;
  }
  setStrokeEnabled(enabled: boolean): void {
    this.stroke.push(enabled);
  }
}

/** Ports de test : un monde réel, une vue factice, chaque appel noté. */
function harness(world: MutableWorld | null = createDefaultWorld(42) as MutableWorld) {
  const calls: string[] = [];
  const sounds: CareSoundKind[] = [];
  const steps: (string | null)[] = [];
  const tasks: MaintenanceTask[] = [];
  const downloads: { image: PhotoImage; name: string }[] = [];
  const journal: Journal = createJournal();
  const history: WaterHistory = createWaterHistory();
  const tools = { scraping: false, pruning: false };
  const state = {
    world,
    view: new FakeView() as FakeView | null,
    capture: false,
    storage: new MemoryStorage() as SaveStorage | null,
    dataUrl: (pixels: PhotoPixels): string | null => `data:${pixels.width}`,
    download: true,
  };
  const ports: CareSessionPorts = {
    world: () => state.world,
    view: () => state.view,
    isCapture: () => state.capture,
    storage: () => state.storage,
    applyWaterSetting: (apply) => {
      if (state.world && !state.capture) {
        apply(state.world);
        calls.push('applyWaterSetting');
      }
    },
    recordMaintenance: (_world, task) => tasks.push(task),
    journalOf: () => journal,
    waterHistoryOf: () => history,
    playSound: (kind) => sounds.push(kind),
    publishStep: (step) => steps.push(step),
    publishFood: () => calls.push('publishFood'),
    refreshWater: () => calls.push('refreshWater'),
    saveNow: () => calls.push('saveNow'),
    scheduleFrame: () => calls.push('scheduleFrame'),
    tools: {
      scraping: () => tools.scraping,
      toggleScraper: () => (tools.scraping = !tools.scraping),
      pruning: () => tools.pruning,
      togglePruner: () => (tools.pruning = !tools.pruning),
    },
    photo: {
      dataUrl: (pixels) => state.dataUrl(pixels),
      download: (image, name) => {
        downloads.push({ image, name });
        return state.download;
      },
      failed: () => calls.push('photoFailed'),
      clearNotice: () => calls.push('clearNotice'),
    },
  };
  const care = new CareSessionController(ports);
  return { care, state, calls, sounds, steps, tasks, downloads, journal, tools };
}

/** Avance la séance de `count` étapes sautées. */
function skip(care: CareSessionController, count: number): void {
  for (let i = 0; i < count; i++) {
    care.skipStep();
  }
}

/** Rayon vertical qui touche le fond en (x, z). */
const down = (x = 0, z = 0): ScraperRay => ({ origin: [x, 3, z], direction: [0, -1, 0] });

/** Granulé posé au sol en (x, z). */
const landed = (id: number, x: number, z: number): FoodPellet => ({
  id,
  x,
  y: 0.002,
  z,
  vy: 0,
  age: 20,
  floatY: 0.398,
  floatTime: 2,
  restY: 0.002,
});

/** Indices des plantes à tige du décor, avec une pousse à couper. */
function grownTallPlants(world: MutableWorld): number[] {
  const tall = world.decor
    .map((item, index) => (item.kind === 'plant' && item.form === 'tall' ? index : -1))
    .filter((index) => index >= 0);
  world.water = {
    ...world.water,
    plantGrowth: Object.fromEntries(tall.map((i) => [String(world.decor[i]!.seed), 9.5])),
  };
  return tall;
}

describe('CareSessionController (#694)', () => {
  describe('ouverture', () => {
    it('séance neuve aux vitres : image « avant » relevée, raclette et passage, étape publiée', () => {
      const { care, state, steps, tools } = harness();
      care.open();
      expect(care.session()).toEqual({ step: 'vitres', outcomes: {} });
      expect(care.hasBefore()).toBe(true);
      expect(state.view!.photos).toBe(1);
      expect(tools).toEqual({ scraping: true, pruning: false });
      expect(state.view!.stroke).toEqual([true]);
      expect(care.strokeEnabled()).toBe(true);
      expect(steps).toEqual(['vitres']);
    });

    it('déjà ouverte : même séance, aucun nouveau relevé', () => {
      const { care, state } = harness();
      care.open();
      care.skipStep();
      care.open();
      expect(care.session()?.step).toBe('siphon');
      expect(state.view!.photos).toBe(1);
    });

    it('reprise : séance enregistrée reprise à son étape, sans image « avant »', () => {
      const { care, state } = harness();
      const stored: CareSession = { step: 'filtre', outcomes: { vitres: 'fait', siphon: 'saute' } };
      state.storage!.setItem(CARE_SESSION_STORAGE_KEY, serializeCareSession(stored));
      care.open();
      expect(care.session()).toEqual(stored);
      expect(care.hasBefore()).toBe(false);
      expect(state.view!.photos).toBe(0);
    });

    it('sans effet avant le démarrage, en capture et en mode décor', () => {
      const none = harness(null);
      none.care.open();
      expect(none.care.session()).toBeNull();
      const capture = harness();
      capture.state.capture = true;
      capture.care.open();
      expect(capture.care.session()).toBeNull();
      const decor = harness();
      setCareModeInPlace(decor.state.world!, 'decor');
      decor.care.open();
      expect(decor.care.session()).toBeNull();
    });

    it('vue qui ne sait pas relire l’image, ou qui lève : séance sans image « avant »', () => {
      const blank = harness();
      blank.state.view!.photo = null;
      blank.care.open();
      expect(blank.care.session()?.step).toBe('vitres');
      expect(blank.care.hasBefore()).toBe(false);
      const broken = harness();
      broken.state.view!.takePhoto = () => {
        throw new Error('contexte perdu');
      };
      broken.care.open();
      expect(broken.care.hasBefore()).toBe(false);
    });

    it('stockage refusé : séance ouverte et menée, sans reprise', () => {
      const { care, state } = harness();
      state.storage = new BrokenStorage();
      care.open();
      care.skipStep();
      expect(care.session()?.step).toBe('siphon');
      state.storage = null;
      care.close();
      care.open();
      expect(care.session()?.step).toBe('vitres');
    });
  });

  describe('vitres', () => {
    it('passage sur des plaques : retirées, relevé, enregistrement, image, bruitage', () => {
      const { care, state, calls, sounds } = harness();
      const world = state.world!;
      (world as { water: AlgaeWater }).water = {
        ...world.water,
        algae: new Array<number>(ALGAE_PATCH_COUNT).fill(1),
      };
      const patch = worldAlgaePatches(world).find((p) => p.wall === 'fond')!;
      care.open();
      let x = patch.x - 0.1;
      state.view!.pickRay = () => ({ origin: [(x += 0.005), patch.y, 3], direction: [0, 0, -1] });
      care.stroke(Array.from({ length: 41 }, () => ({ x: 0, y: 0 })));
      expect(world.water.algae!.some((cover) => cover === 0)).toBe(true);
      expect(calls).toEqual(['refreshWater', 'saveNow', 'scheduleFrame']);
      expect(sounds).toEqual(['raclette']);
    });

    it('passage sans plaque, sans rayon, sans vue ou en capture : rien', () => {
      const { care, state, calls, sounds } = harness();
      care.open();
      state.view!.ray = down();
      care.stroke([{ x: 1, y: 1 }]);
      state.view!.ray = null;
      care.stroke([{ x: 1, y: 1 }]);
      state.capture = true;
      care.stroke([{ x: 1, y: 1 }]);
      state.capture = false;
      state.view = null;
      care.stroke([{ x: 1, y: 1 }]);
      expect(calls).toEqual([]);
      expect(sounds).toEqual([]);
    });

    it('« Étape terminée » : vitres au calendrier, clic, siphon ensuite', () => {
      const { care, tasks, sounds, tools } = harness();
      care.open();
      care.completeStep();
      expect(tasks).toEqual(['glass']);
      expect(sounds).toEqual(['clic']);
      expect(care.session()?.step).toBe('siphon');
      expect(care.isSiphoning()).toBe(true);
      expect(tools.scraping).toBe(false);
    });
  });

  describe('siphon', () => {
    it('chaque point compte dans la jauge ; granulés aspirés publiés et enregistrés', () => {
      const { care, state, calls, sounds } = harness();
      state.world!.food = [landed(0, 0, 0), landed(1, 0.25, 0.1)];
      care.open();
      care.skipStep();
      state.view!.ray = down();
      care.stroke([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      expect(care.session()?.siphoned).toBeCloseTo(2 * SIPHON_SHARE_PER_POINT, 10);
      expect(state.world!.food.map((pellet) => pellet.id)).toEqual([1]);
      expect(sounds).toEqual(['siphon']);
      expect(calls).toEqual(['publishFood', 'saveNow', 'scheduleFrame']);
    });

    it('passage sans granulé : jauge seulement ; hors de l’eau : rien', () => {
      const { care, state, calls, sounds } = harness();
      care.open();
      care.skipStep();
      state.view!.ray = down();
      care.stroke([{ x: 0, y: 0 }]);
      expect(calls).toEqual([]);
      state.view!.ray = { origin: [9, 3, 9], direction: [0, 1, 0] };
      care.stroke([{ x: 0, y: 0 }]);
      expect(care.session()?.siphoned).toBeCloseTo(SIPHON_SHARE_PER_POINT, 10);
      expect(sounds).toEqual(['siphon']);
    });

    it('« Étape terminée » : siphon au calendrier, passage coupé au filtre', () => {
      const { care, state, tasks } = harness();
      care.open();
      care.skipStep();
      care.completeStep();
      expect(tasks).toEqual(['siphon']);
      expect(care.session()?.step).toBe('filtre');
      expect(state.view!.stroke.at(-1)).toBe(false);
      expect(care.strokeEnabled()).toBe(false);
    });
  });

  describe('filtre', () => {
    it('sans eau de rinçage choisie : l’étape ne se termine pas', () => {
      const { care, tasks, sounds } = harness();
      care.open();
      skip(care, 2);
      care.completeStep();
      expect(care.session()?.step).toBe('filtre');
      expect(tasks).toEqual([]);
      expect(sounds).toEqual([]);
    });

    it('rinçage au robinet appliqué à « Étape terminée », filtre au calendrier', () => {
      const { care, state, tasks } = harness();
      care.open();
      care.chooseRinse('robinet');
      expect(care.session()?.rinse).toBeUndefined();
      skip(care, 2);
      const filter = state.world!.water.filter;
      care.chooseRinse('robinet');
      expect(state.world!.water.filter).toBe(filter);
      care.completeStep();
      expect(state.world!.water.filter).toBeLessThan(filter);
      expect(tasks).toEqual(['filter']);
      expect(care.session()?.step).toBe('eau');
    });

    it('rinçage dans l’eau du bac : filtre intact, nettoyage au calendrier', () => {
      const { care, state, tasks } = harness();
      care.open();
      skip(care, 2);
      const filter = state.world!.water.filter;
      care.chooseRinse('bac');
      care.completeStep();
      expect(state.world!.water.filter).toBe(filter);
      expect(tasks).toEqual(['filter']);
    });
  });

  describe('eau neuve', () => {
    it('seau neuf : conditionneur versé, écart nul ; seaux jusqu’à l’eau retirée', () => {
      const { care, state, sounds } = harness();
      state.storage!.setItem(
        CARE_SESSION_STORAGE_KEY,
        serializeCareSession({ step: 'eau', outcomes: {}, siphoned: 0.15 }),
      );
      care.conditioner.set(false);
      care.bucketGap.set(3);
      care.open();
      expect(care.conditioner()).toBe(true);
      expect(care.bucketGap()).toBe(0);
      care.pourBucket();
      care.pourBucket();
      care.pourBucket();
      expect(care.session()?.poured).toBeCloseTo(0.15, 10);
      expect(sounds).toEqual(['seau', 'seau']);
      // Seau entamé : les choix ne sont plus remis à zéro.
      care.conditioner.set(false);
      care.open();
      expect(care.conditioner()).toBe(false);
    });

    it('« Étape terminée » : eau du seau versée, calendrier, historique, journal', () => {
      const { care, state, tasks, journal } = harness();
      state.storage!.setItem(
        CARE_SESSION_STORAGE_KEY,
        serializeCareSession({ step: 'eau', outcomes: {}, siphoned: 0.1 }),
      );
      care.open();
      care.pourBucket();
      care.bucketGap.set(4);
      const temperature = state.world!.water.temperature;
      care.completeStep();
      expect(state.world!.water.temperature).toBeGreaterThan(temperature);
      expect(tasks).toEqual(['waterChange']);
      expect(journalLines(journal).map((line) => line.kind)).toEqual(['eauNeuve']);
    });

    it('rien versé : rien n’est changé ni noté ; seau hors de l’étape : sans effet', () => {
      const { care, state, tasks, sounds } = harness();
      care.open();
      care.pourBucket();
      expect(care.session()?.poured).toBeUndefined();
      skip(care, 3);
      const water = state.world!.water;
      care.completeStep();
      expect(state.world!.water).toBe(water);
      expect(tasks).toEqual([]);
      // Seul le clic de fin d'étape (#625) : aucun seau versé.
      expect(sounds).toEqual(['clic']);
    });
  });

  describe('taille', () => {
    it('coupe comptée et journal, sécateur en main ; calendrier à « Étape terminée »', () => {
      const { care, state, tasks, tools, journal } = harness();
      const tall = grownTallPlants(state.world!);
      expect(care.cutPlant(tall[0]!)).toBe(false);
      care.open();
      skip(care, 4);
      expect(care.isCutting()).toBe(true);
      expect(tools.pruning).toBe(true);
      expect(care.cutPlant(tall[0]!)).toBe(true);
      expect(care.session()?.cuts).toBe(1);
      expect(journalLines(journal).map((line) => line.kind)).toEqual(['taille']);
      expect(tasks).toEqual([]);
      care.completeStep();
      expect(tasks).toEqual(['prune']);
      expect(tools.pruning).toBe(false);
    });

    it('sans coupe : rien au calendrier ; élément qui n’est pas une plante : pas de coupe', () => {
      const { care, state, tasks } = harness();
      grownTallPlants(state.world!);
      care.open();
      skip(care, 4);
      expect(care.cutPlant(-1)).toBe(false);
      care.completeStep();
      expect(tasks).toEqual([]);
      expect(care.session()?.step).toBe('bilan');
    });

    it('bac sans plante à tailler : étape sautée d’office', () => {
      const { care, state } = harness(createDefaultWorld(42, 'recif') as MutableWorld);
      care.open();
      skip(care, 4);
      expect(care.prunable()).toBe(false);
      expect(care.session()?.step).toBe('bilan');
      expect(care.session()?.outcomes.taille).toBe('saute');
      expect(state.world!.environment).toBe('recif');
    });
  });

  describe('bilan', () => {
    it('séance faite : comparaison prête, une ligne au journal, séance oubliée', () => {
      const { care, state, journal } = harness();
      care.open();
      care.completeStep();
      skip(care, 4);
      expect(care.session()?.step).toBe('bilan');
      expect(care.comparison()).toEqual({ before: 'data:1', after: 'data:1' });
      expect(journalLines(journal).map((line) => line.kind)).toEqual(['seance']);
      expect(state.storage!.getItem(CARE_SESSION_STORAGE_KEY)).toBe('');
      // Bilan relu : pas de seconde ligne, pas de clic.
      care.completeStep();
      care.open();
      expect(journalLines(journal)).toHaveLength(1);
    });

    it('séance entièrement sautée : ni comparaison ni journal', () => {
      const { care, journal } = harness();
      care.open();
      skip(care, 5);
      expect(care.comparison()).toBeNull();
      expect(care.hasBefore()).toBe(false);
      expect(journalLines(journal)).toEqual([]);
    });

    it('encodage impossible : pas de comparaison', () => {
      const { care, state } = harness();
      state.dataUrl = () => null;
      care.open();
      care.completeStep();
      skip(care, 4);
      expect(care.comparison()).toBeNull();
      expect(care.hasBefore()).toBe(false);
    });

    it('photo avant / après : côte à côte, agrandie, nom daté ; échec signalé', () => {
      const { care, state, calls, downloads } = harness();
      expect(care.saveComparison()).toBe(false);
      care.open();
      care.completeStep();
      skip(care, 4);
      expect(care.saveComparison()).toBe(true);
      expect(calls.filter((call) => call === 'clearNotice')).toHaveLength(1);
      expect(downloads).toHaveLength(1);
      expect(downloads[0]!.name).toMatch(/\.png$/);
      expect(downloads[0]!.image.width).toBeGreaterThan(2);
      state.download = false;
      expect(care.saveComparison()).toBe(false);
    });

    it('fermeture : images libérées, outils posés, étape retirée', () => {
      const { care, state, steps, tools } = harness();
      care.open();
      care.close();
      expect(care.session()).toBeNull();
      expect(care.hasBefore()).toBe(false);
      expect(care.comparison()).toBeNull();
      expect(tools).toEqual({ scraping: false, pruning: false });
      expect(state.view!.stroke.at(-1)).toBe(false);
      expect(steps.at(-1)).toBeNull();
      // Séance interrompue : reprise à la même étape.
      expect(state.storage!.getItem(CARE_SESSION_STORAGE_KEY)).toBe(
        serializeCareSession({ step: 'vitres', outcomes: {} }),
      );
    });
  });

  it('relevés des consignes suivis à chaque relevé du bac', () => {
    const { care } = harness();
    const world = createDefaultWorld(42, 'recif') as MutableWorld;
    world.water = { ...world.water, filter: 0.25 };
    care.refreshReadouts(world);
    expect(care.filter()).toBe(0.25);
    expect(care.prunable()).toBe(false);
    expect(care.cuttable()).toBe(false);
  });

  it('sans séance : terminer, sauter, choisir ou verser ne font rien', () => {
    const { care, calls, sounds, steps } = harness();
    care.completeStep();
    care.skipStep();
    care.chooseRinse('bac');
    care.pourBucket();
    care.stroke([{ x: 0, y: 0 }]);
    expect(care.session()).toBeNull();
    expect(calls).toEqual([]);
    expect(sounds).toEqual([]);
    expect(steps).toEqual([]);
  });
});
