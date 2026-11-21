import { SETTINGS_CATEGORIES } from '../settings-window/settings-categories';
import { settingsSummaries, type SettingsSummaryState } from './settings-summaries';

const BASE: SettingsSummaryState = {
  environment: 'tropical',
  tankCount: 1,
  animals: 12,
  temperature: 25.4,
  current: 'coupe',
  ichCount: 0,
  treating: false,
  decorVisible: true,
  rain: false,
  speed: 1,
  hour: 14.5,
  clockRunning: true,
  soundOn: false,
  volume: 0.3,
  reducedMotion: false,
  saveStatus: 'active',
};

const summary = (patch: Partial<SettingsSummaryState>) => settingsSummaries({ ...BASE, ...patch });

describe('settingsSummaries (#722, tranche 3)', () => {
  it('résume chacune des catégories, par une ligne non vide', () => {
    const summaries = settingsSummaries(BASE);
    for (const category of SETTINGS_CATEGORIES) {
      expect(summaries[category.id], category.id).toMatch(/\S/);
    }
    expect(Object.keys(summaries).sort()).toEqual(SETTINGS_CATEGORIES.map((c) => c.id).sort());
  });

  it('valeurs par défaut du bac tropical', () => {
    expect(settingsSummaries(BASE)).toEqual({
      bac: 'Bac tropical',
      population: '12 animaux',
      eau: 'Eau à 25 °C',
      soins: 'Rien à soigner',
      decor: 'Décor affiché',
      temps: '×1, 14:30',
      affichage: 'Sans pluie ici',
      son: 'Coupés',
      accessibilite: 'Mouvements normaux',
      sauvegarde: 'Enregistré automatiquement',
    });
  });

  it('bac et milieu : nombre de bacs seulement s’il y en a plusieurs', () => {
    expect(summary({ tankCount: 0 }).bac).toBe('Bac tropical');
    expect(summary({ tankCount: 3 }).bac).toBe('Bac tropical, 3 bacs');
    expect(summary({ environment: 'bassin' }).bac).not.toBe('Bac tropical');
  });

  it('affichage (#762) : la pluie au bassin seulement', () => {
    expect(summary({ rain: true }).affichage).toBe('Sans pluie ici');
    expect(summary({ environment: 'bassin' }).affichage).toBe('Pas de pluie');
    expect(summary({ environment: 'bassin', rain: true }).affichage).toBe('Pluie sur le bassin');
  });

  it('population : zéro, un, plusieurs ; valeurs absurdes ramenées à zéro', () => {
    expect(summary({ animals: 0 }).population).toBe('Aucun animal');
    expect(summary({ animals: 1 }).population).toBe('1 animal');
    expect(summary({ animals: 2 }).population).toBe('2 animaux');
    expect(summary({ animals: -4 }).population).toBe('Aucun animal');
    expect(summary({ animals: Number.NaN }).population).toBe('Aucun animal');
  });

  it('eau : température arrondie, courant seulement s’il tourne', () => {
    expect(summary({ temperature: 25.6 }).eau).toBe('Eau à 26 °C');
    expect(summary({ current: 'doux' }).eau).toBe('Eau à 25 °C, courant doux');
    expect(summary({ current: 'fort' }).eau).toBe('Eau à 25 °C, courant fort');
    expect(summary({ temperature: Number.NaN }).eau).toBe('Eau à ? °C');
  });

  it('soins : traitement en cours avant les malades', () => {
    expect(summary({ ichCount: 1 }).soins).toBe('1 animal à soigner');
    expect(summary({ ichCount: 3 }).soins).toBe('3 animaux à soigner');
    expect(summary({ ichCount: 3, treating: true }).soins).toBe('Traitement en cours');
  });

  it('décor, accessibilité', () => {
    expect(summary({ decorVisible: false }).decor).toBe('Décor masqué');
    expect(summary({ reducedMotion: true }).accessibilite).toBe('Mouvements réduits');
  });

  it('temps : pause, vitesse décimale, heure figée', () => {
    expect(summary({ speed: 0 }).temps).toBe('Pause, 14:30');
    expect(summary({ speed: 0.5, hour: 9.25 }).temps).toBe('×0,5, 09:15');
    expect(summary({ clockRunning: false, hour: 0 }).temps).toBe('×1, 00:00, heure figée');
  });

  it('son : volume en pour cent, borné', () => {
    expect(summary({ soundOn: true }).son).toBe('Activés, volume 30 %');
    expect(summary({ soundOn: true, volume: 2 }).son).toBe('Activés, volume 100 %');
    expect(summary({ soundOn: true, volume: -1 }).son).toBe('Activés, volume 0 %');
    expect(summary({ soundOn: true, volume: Number.NaN }).son).toBe('Activés, volume 0 %');
  });

  it('sauvegarde : chaque état', () => {
    expect(summary({ saveStatus: 'plein' }).sauvegarde).toBe('Stockage plein');
    expect(summary({ saveStatus: 'indisponible' }).sauvegarde).toBe('Stockage indisponible');
    expect(summary({ saveStatus: null }).sauvegarde).toBe('Sauvegarde désactivée');
  });
});
