import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT } from './disease';
import type { SpeciesId } from './species';
import {
  averageHealthLevel,
  averageHungerLevel,
  EMPTY_HEALTH_SUMMARY,
  healthItems,
  healthSummary,
  HUNGRY_AVERAGE,
  percent,
  readHealth,
  readHunger,
  sameHealthSummary,
  SICK_HEALTH,
  WEAK_HEALTH,
  type HealthSubject,
} from './health-summary';
import { HEALTH_FLOOR, STARVING_HUNGER } from './wellbeing';
import { createDefaultWorld, starveWorld } from './world';

function animal(health: number, hunger = 0.5, species: SpeciesId = 'neon'): HealthSubject {
  return { species, health, hunger };
}

describe('synthèse de la santé (#260)', () => {
  it('bac sans animal : aucune moyenne, aucun compte', () => {
    expect(healthSummary([])).toEqual(EMPTY_HEALTH_SUMMARY);
    expect(EMPTY_HEALTH_SUMMARY.averageHealth).toBeNull();
    expect(EMPTY_HEALTH_SUMMARY.averageHunger).toBeNull();
  });

  it('un seul animal en pleine santé : moyennes égales à ses valeurs, aucun malade', () => {
    expect(healthSummary([animal(1, 0.25)])).toEqual({
      animals: 1,
      averageHealth: 1,
      averageHunger: 0.25,
      sick: 0,
      weak: 0,
      starving: 0,
      distressed: 0,
      ich: 0,
      ichAggravated: 0,
      weakWithoutIch: 0,
      finRot: 0,
      finRotAdvanced: 0,
      velvet: 0,
      velvetAdvanced: 0,
      fungus: 0,
      fungusAdvanced: 0,
      diseased: 0,
      weakWithoutDisease: 0,
    });
  });

  it('moyennes sur plusieurs animaux', () => {
    const summary = healthSummary([animal(1, 0), animal(0.6, 1), animal(0.5, 0.5)]);
    expect(summary.averageHealth).toBeCloseTo(0.7, 12);
    expect(summary.averageHunger).toBeCloseTo(0.5, 12);
  });

  it('seuils compris : santé égale à SICK_HEALTH = malade, à WEAK_HEALTH = faible', () => {
    expect(healthSummary([animal(SICK_HEALTH)]).sick).toBe(1);
    expect(healthSummary([animal(SICK_HEALTH + 1e-9)]).sick).toBe(0);
    const weak = healthSummary([animal(WEAK_HEALTH)]);
    expect(weak.weak).toBe(1);
    expect(weak.sick).toBe(1);
    expect(weak.distressed).toBe(1);
    expect(healthSummary([animal(WEAK_HEALTH + 1e-9)]).weak).toBe(0);
  });

  it('santé au plancher : malade, faible et en détresse', () => {
    const summary = healthSummary([animal(HEALTH_FLOOR, 0)]);
    expect(summary).toMatchObject({ sick: 1, weak: 1, starving: 0, distressed: 1 });
    expect(summary.averageHealth).toBe(HEALTH_FLOOR);
  });

  it('faim maximale (seuil compris) : affamé et en détresse, compté une seule fois', () => {
    const summary = healthSummary([animal(HEALTH_FLOOR, STARVING_HUNGER), animal(1, 0.999)]);
    expect(summary).toMatchObject({ starving: 1, weak: 1, distressed: 1 });
  });

  it('valeurs non finies : santé comptée pleine, faim comptée nulle', () => {
    const summary = healthSummary([animal(Number.NaN, Number.NaN), animal(Infinity, -Infinity)]);
    expect(summary.averageHealth).toBe(1);
    expect(summary.averageHunger).toBe(0);
    expect(summary).toMatchObject({ sick: 0, weak: 0, starving: 0, distressed: 0 });
  });

  it('valeurs hors bornes ramenées : santé dans [plancher, 1], faim dans [0, 1]', () => {
    expect(readHealth(-3)).toBe(HEALTH_FLOOR);
    expect(readHealth(7)).toBe(1);
    expect(readHunger(-1)).toBe(0);
    expect(readHunger(4)).toBe(1);
    const summary = healthSummary([animal(-3, 4)]);
    expect(summary.averageHealth).toBe(HEALTH_FLOOR);
    expect(summary.starving).toBe(1);
  });

  it('espèces non nourries aux granulés : leur faim ne compte ni dans la moyenne ni comme affamée', () => {
    const summary = healthSummary([animal(1, 1, 'axolotl'), animal(1, 1, 'grenouille')]);
    expect(summary.averageHunger).toBeNull();
    expect(summary.starving).toBe(0);
    expect(summary.distressed).toBe(0);
    const mixed = healthSummary([animal(1, 1, 'axolotl'), animal(1, 0.2, 'neon')]);
    expect(mixed.averageHunger).toBe(0.2);
  });

  it('monde par défaut : tous en bonne santé ; affamé de longue date : tous en détresse', () => {
    const world = createDefaultWorld(42);
    const healthy = healthSummary(world.entities);
    expect(healthy.animals).toBe(world.entities.length);
    expect(healthy).toMatchObject({ averageHealth: 1, sick: 0, distressed: 0 });
    const starved = healthSummary(starveWorld(world).entities);
    expect(starved).toMatchObject({
      averageHealth: HEALTH_FLOOR,
      averageHunger: 1,
      sick: world.entities.length,
      distressed: world.entities.length,
    });
  });

  it('égalité affichée : au pour cent près, comptes compris', () => {
    const a = healthSummary([animal(0.951, 0.5)]);
    const b = healthSummary([animal(0.9512, 0.5004)]);
    expect(sameHealthSummary(a, b)).toBe(true);
    expect(sameHealthSummary(a, healthSummary([animal(0.94, 0.5)]))).toBe(false);
    expect(sameHealthSummary(a, healthSummary([animal(0.951, 0.5), animal(0.951, 0.5)]))).toBe(
      false,
    );
    expect(sameHealthSummary(EMPTY_HEALTH_SUMMARY, healthSummary([]))).toBe(true);
  });

  it('pour cent : arrondi, null conservé, non fini → null', () => {
    expect(percent(0.925)).toBe(93);
    expect(percent(null)).toBeNull();
    expect(percent(Number.NaN)).toBeNull();
  });

  it('niveaux des moyennes : seuils compris dans le niveau inférieur', () => {
    expect(averageHealthLevel(null)).toBe('vert');
    expect(averageHealthLevel(1)).toBe('vert');
    expect(averageHealthLevel(SICK_HEALTH)).toBe('orange');
    expect(averageHealthLevel(WEAK_HEALTH)).toBe('rouge');
    expect(averageHealthLevel(Number.NaN)).toBe('vert');
    expect(averageHungerLevel(null)).toBe('vert');
    expect(averageHungerLevel(HUNGRY_AVERAGE - 0.01)).toBe('vert');
    expect(averageHungerLevel(HUNGRY_AVERAGE)).toBe('orange');
    expect(averageHungerLevel(STARVING_HUNGER)).toBe('rouge');
  });

  it('lignes affichées : texte, niveau et texte lu', () => {
    const items = healthItems(healthSummary([animal(0.5, 1), animal(1, 0)]));
    expect(items.map((i) => i.id)).toEqual(['health', 'hunger', 'sick', 'distressed']);
    expect(items.map((i) => i.value)).toEqual(['75 %', '50 %', '1', '1']);
    expect(items.map((i) => i.level)).toEqual(['orange', 'vert', 'orange', 'rouge']);
    expect(items[0]?.spoken).toBe('Santé moyenne : 75 %, à surveiller');
    expect(items[3]?.spoken).toBe('Animaux en détresse ou affamés : 1 sur 2, critique');
  });

  it('lignes d’un bac vide : tirets, tout au vert', () => {
    const items = healthItems(EMPTY_HEALTH_SUMMARY);
    expect(items.map((i) => i.value)).toEqual(['–', '–', '0', '0']);
    expect(items.every((i) => i.level === 'vert')).toBe(true);
    expect(items[0]?.spoken).toBe('Santé moyenne : aucun animal, bon');
    expect(items[1]?.spoken).toBe('Faim moyenne : aucun animal nourri aux granulés, bon');
  });
});

describe('synthèse et alertes : lecture seule (#260)', () => {
  it('ne modifient pas les animaux (objets gelés acceptés)', () => {
    const animals = Object.freeze([
      Object.freeze({ species: 'neon' as const, health: 0.3, hunger: 1 }),
      Object.freeze({ species: 'koi' as const, health: Number.NaN, hunger: 2 }),
    ]);
    expect(() => healthSummary(animals)).not.toThrow();
    expect(animals[0]).toEqual({ species: 'neon', health: 0.3, hunger: 1 });
  });
});

describe('synthèse de la santé : points blancs (#366)', () => {
  const visible = ICH_VISIBLE_AT + 1;

  it('sans malade (champ absent, incubation, valeur invalide) : comptes à zéro, rien ne change', () => {
    const base = [
      { species: 'neon' as const, health: 1, hunger: 0.3 },
      { species: 'guppy' as const, health: 0.9, hunger: 0.3 },
    ];
    const plain = healthSummary(base);
    expect(plain).toMatchObject({ ich: 0, ichAggravated: 0, sick: 0 });
    for (const ich of [0, ICH_VISIBLE_AT - 0.5, Number.NaN, -1, ICH_AGGRAVATED_AT + 1]) {
      const summary = healthSummary(base.map((a) => ({ ...a, ich })));
      expect(summary, `ich = ${ich}`).toEqual(plain);
      expect(healthItems(summary), `ich = ${ich}`).toEqual(healthItems(plain));
    }
  });

  it('points visibles et aggravés : comptés, et comptés malades une seule fois', () => {
    const summary = healthSummary([
      { species: 'neon', health: 1, hunger: 0.3, ich: visible },
      { species: 'neon', health: 0.5, hunger: 0.3, ich: ICH_AGGRAVATED_AT },
      { species: 'guppy', health: 0.5, hunger: 0.3 },
      { species: 'guppy', health: 1, hunger: 0.3 },
    ]);
    expect(summary).toMatchObject({ animals: 4, ich: 2, ichAggravated: 1, sick: 3 });
  });

  it('ligne « Malades » : orange, et le texte lu nomme les points blancs', () => {
    const summary = healthSummary([
      { species: 'neon', health: 1, hunger: 0.3, ich: visible },
      { species: 'neon', health: 1, hunger: 0.3, ich: visible },
      { species: 'guppy', health: 1, hunger: 0.3 },
    ]);
    const sick = healthItems(summary).find((item) => item.id === 'sick');
    expect(sick).toMatchObject({ value: '2', level: 'orange' });
    expect(sick?.spoken).toBe(
      'Animaux malades : 2 sur 3, dont 2 avec des points blancs, à surveiller',
    );
  });

  it('synthèses égales seulement si les comptes de points blancs le sont', () => {
    const a = healthSummary([{ species: 'neon', health: 1, hunger: 0.3, ich: visible }]);
    const b = healthSummary([{ species: 'neon', health: 1, hunger: 0.3, ich: ICH_AGGRAVATED_AT }]);
    expect(sameHealthSummary(a, b)).toBe(false);
    const later = healthSummary([{ species: 'neon', health: 1, hunger: 0.3, ich: visible + 10 }]);
    expect(sameHealthSummary(a, later)).toBe(true);
  });
});
