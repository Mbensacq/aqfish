import {
  ALERT_ORDER,
  dashboardAlerts,
  type AlertInput,
  type AlertId,
  type DashboardAlert,
} from './dashboard-alerts';
import { mixWarnings } from './compatibility';
import { EMPTY_HEALTH_SUMMARY, type HealthSummary } from './health-summary';
import {
  ALERT_TOPICS,
  GAME_SIMPLIFICATION,
  GUIDE_STEPS,
  WHY_TOPIC_ORDER,
  helpStatusText,
  whyTopic,
  whyTopics,
} from './beginner-help';
import { NO_FISH } from './population';
import { DEFAULT_WATER_SAMPLE, type WaterSample } from './water-dashboard';
import type { PhBands } from './water-ph';
import { COMPOUND_THRESHOLDS, type WaterCompound } from './water-quality';

const BANDS: PhBands = { ideal: { min: 6.5, max: 7.5 }, tolerated: { min: 6, max: 8 } };

const HEALTHY: HealthSummary = {
  ...EMPTY_HEALTH_SUMMARY,
  animals: 10,
  averageHealth: 1,
  averageHunger: 0,
};

function input(sample: Partial<WaterSample> = {}, health: Partial<HealthSummary> = {}): AlertInput {
  return {
    sample: { ...DEFAULT_WATER_SAMPLE, ph: 7, ...sample },
    phBands: BANDS,
    health: { ...HEALTHY, ...health },
  };
}

/** Valeur au-dessus du seuil « mauvais » d'un composé (seuils de `sim/water-quality.ts`). */
function high(compound: WaterCompound): number {
  return COMPOUND_THRESHOLDS[compound].bad * 1.25;
}

/** États hors plage, un par sujet d'alerte, avec l'alerte attendue. */
const OUT_OF_RANGE: readonly (readonly [string, AlertInput, AlertId])[] = [
  ['ammoniaque haute', input({ ammonia: high('ammonia') }), 'ammonia'],
  ['nitrites hauts', input({ nitrite: high('nitrite') }), 'nitrite'],
  ['nitrates hauts', input({ nitrate: high('nitrate') }), 'nitrate'],
  ['eau trop chaude', input({ temperature: 34 }), 'temperature'],
  ['eau trop froide', input({ temperature: 14 }), 'temperature'],
  ['pH trop acide', input({ ph: 5 }), 'ph'],
  ['pH un peu basique', input({ ph: 7.8 }), 'ph'],
  ['animaux affamés', input({}, { starving: 2 }), 'hunger'],
  ['animaux malades', input({}, { sick: 1 }), 'health'],
  [
    'mélange déconseillé',
    {
      ...input(),
      mixes: mixWarnings(['axolotl', 'grenouille'], { ...NO_FISH, axolotl: 2, grenouille: 3 }),
    },
    'mix',
  ],
  ['mesure invalide', input({ nitrite: Number.NaN }), 'nitrite'],
];

describe('aides pour débutant (#240)', () => {
  describe('alertes : chaque état hors plage a son alerte, son action et son « Pourquoi ? »', () => {
    it.each(OUT_OF_RANGE)('%s', (_label, state, expected) => {
      const alerts = dashboardAlerts(state);
      const alert = alerts.find((a) => a.id === expected);
      expect(alert, expected).toBeDefined();
      expect(alert!.action.trim()).not.toBe('');
      expect(alert!.cause.trim()).not.toBe('');
      expect(whyTopic(ALERT_TOPICS[expected]).paragraphs.length).toBeGreaterThan(0);
    });

    it('les cas couvrent tous les sujets d’alerte', () => {
      const covered = new Set(OUT_OF_RANGE.map(([, , id]) => id));
      expect([...covered].sort()).toEqual([...ALERT_ORDER].sort());
    });

    it.each([
      ['eau neuve et animaux en forme', input()],
      ['bornes basses saines', input({ ammonia: 0, nitrite: 0, nitrate: 0 })],
      [
        'composés juste sous le seuil « à surveiller »',
        input({
          ammonia: COMPOUND_THRESHOLDS.ammonia.watch * 0.9,
          nitrite: COMPOUND_THRESHOLDS.nitrite.watch * 0.9,
          nitrate: COMPOUND_THRESHOLDS.nitrate.watch * 0.9,
        }),
      ],
      ['pH au milieu de l’idéal', input({ ph: 7 })],
    ])('aucune alerte pour un état normal : %s', (_label, state) => {
      expect(dashboardAlerts(state)).toEqual([] as DashboardAlert[]);
    });

    it('toute alerte a une explication, et la table ne vise que des sujets existants', () => {
      for (const id of ALERT_ORDER) {
        expect(WHY_TOPIC_ORDER, id).toContain(ALERT_TOPICS[id]);
      }
      expect(Object.keys(ALERT_TOPICS).sort()).toEqual([...ALERT_ORDER].sort());
    });
  });

  describe('contenu', () => {
    it('explications : identifiants uniques, titres et paragraphes non vides', () => {
      const topics = whyTopics();
      expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
      expect(topics.map((t) => t.id)).toEqual(WHY_TOPIC_ORDER);
      for (const topic of topics) {
        expect(topic.title.trim(), topic.id).not.toBe('');
        expect(topic.paragraphs.length, topic.id).toBeGreaterThan(0);
        for (const paragraph of topic.paragraphs) {
          expect(paragraph.trim(), topic.id).not.toBe('');
        }
        expect(helpStatusText(topic.status).trim()).not.toBe('');
      }
    });

    it('les sujets demandés par l’issue existent : azote, acclimatation, eau trouble', () => {
      for (const id of ['azote', 'acclimatation', 'eau-trouble'] as const) {
        expect(whyTopic(id).id).toBe(id);
      }
    });

    it('guide : cinq étapes dans l’ordre, identifiants uniques, textes non vides', () => {
      expect(GUIDE_STEPS.map((s) => s.id)).toEqual([
        'installer',
        'murir',
        'especes',
        'nourrir',
        'entretenir',
      ]);
      for (const step of GUIDE_STEPS) {
        for (const text of [step.title, step.text, step.inGame, helpStatusText(step.status)]) {
          expect(text.trim(), step.id).not.toBe('');
        }
        if (step.topic !== null) {
          expect(WHY_TOPIC_ORDER, step.id).toContain(step.topic);
        }
      }
    });

    it('aucun identifiant partagé entre étapes et explications (ancres du dialogue)', () => {
      const ids = [...WHY_TOPIC_ORDER, ...GUIDE_STEPS.map((s) => s.id)];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('aucun titre en double', () => {
      const titles = [...whyTopics().map((t) => t.title), ...GUIDE_STEPS.map((s) => s.title)];
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('statut : une source citée, ou la mention « Simplification de jeu »', () => {
      expect(helpStatusText({ kind: 'approximation' })).toBe(GAME_SIMPLIFICATION);
      expect(helpStatusText({ kind: 'source', reference: 'docs/SOINS.md § 2' })).toBe(
        'Source : documentation du projet',
      );
      for (const item of [...whyTopics(), ...GUIDE_STEPS]) {
        if (item.status.kind === 'source') {
          // Traçabilité dans les données ; à l'écran, la publication sans chemin du dépôt (#302).
          expect(item.status.reference, item.id).toMatch(/^docs\/SOINS\.md § /);
          const shown = helpStatusText(item.status);
          expect(shown, item.id).toMatch(/^Source : documentation du projet \(.+\)$/);
          expect(shown, item.id).not.toMatch(/docs\/|\.md|§/);
        }
      }
    });

    it('nitrates : la baisse par le seul changement d’eau est marquée comme règle du jeu (#302)', () => {
      const text = whyTopic('azote').paragraphs.join(' ');
      expect(text).toContain('dans le jeu, seul un changement d’eau partiel les fait baisser');
      expect(text).toContain('les plantes en absorbent aussi une partie');
      expect(text).not.toContain('ne partent qu’avec');
    });

    it('une valeur chiffrée sans source porte la mention de simplification', () => {
      // Les chiffres de réalité (6 à 8 semaines, 25 à 50 %) viennent de docs/SOINS.md.
      for (const item of whyTopics()) {
        if (item.paragraphs.some((p) => /\d/.test(p))) {
          expect(item.status.kind, item.id).toBe('source');
        }
      }
      for (const step of GUIDE_STEPS) {
        if (/\d/.test(step.text)) {
          expect(step.status.kind, step.id).toBe('source');
        }
      }
    });

    it('données figées', () => {
      expect(Object.isFrozen(whyTopic('azote').status)).toBe(true);
    });
  });
});
