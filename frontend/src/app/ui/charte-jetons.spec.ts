import aquariumHost from './aquarium-host/aquarium-host.scss' with { loader: 'text' };
import beginnerGuide from './beginner-guide/beginner-guide.scss' with { loader: 'text' };
import careSession from './care-session/care-session.scss' with { loader: 'text' };
import commandsHelp from './commands-help/commands-help.scss' with { loader: 'text' };
import panelControls from './control-panel/_panel-controls.scss' with { loader: 'text' };
import accessibilitySection from './control-panel/accessibility-section.scss' with {
  loader: 'text',
};
import careSection from './control-panel/care-section.scss' with { loader: 'text' };
import controlPanel from './control-panel/control-panel.scss' with { loader: 'text' };
import daySection from './control-panel/day-section.scss' with { loader: 'text' };
import decorSection from './control-panel/decor-section.scss' with { loader: 'text' };
import environmentSection from './control-panel/environment-section.scss' with { loader: 'text' };
import populationSection from './control-panel/population-section.scss' with { loader: 'text' };
import quarantineSection from './control-panel/quarantine-section.scss' with { loader: 'text' };
import roomSection from './control-panel/room-section.scss' with { loader: 'text' };
import saveSection from './control-panel/save-section.scss' with { loader: 'text' };
import simulationSection from './control-panel/simulation-section.scss' with { loader: 'text' };
import soundSection from './control-panel/sound-section.scss' with { loader: 'text' };
import speciesSheet from './control-panel/species-sheet.scss' with { loader: 'text' };
import tanksSection from './control-panel/tanks-section.scss' with { loader: 'text' };
import treatmentNotice from './control-panel/treatment-notice.scss' with { loader: 'text' };
import waterSection from './control-panel/water-section.scss' with { loader: 'text' };
import dashboardSurface from './dashboard-frame/_dashboard-surface.scss' with { loader: 'text' };
import dashboardFrame from './dashboard-frame/dashboard-frame.scss' with { loader: 'text' };
import dashboardStatus from './dashboard-frame/dashboard-status.scss' with { loader: 'text' };
import feederPanel from './dashboard-frame/feeder-panel.scss' with { loader: 'text' };
import waterHistoryChart from './dashboard-frame/water-history-chart.scss' with { loader: 'text' };
import dayIndicator from './day-indicator/day-indicator.scss' with { loader: 'text' };
import decorBadge from './decor-badge/decor-badge.scss' with { loader: 'text' };
import decorEditor from './decor-editor/decor-editor.scss' with { loader: 'text' };
import firstTankPath from './first-tank-path/first-tank-path.scss' with { loader: 'text' };
import freeCameraPad from './free-camera-pad/free-camera-pad.scss' with { loader: 'text' };
import immersiveMode from './immersive-mode/immersive-mode.scss' with { loader: 'text' };
import pharmacy from './pharmacy/pharmacy.scss' with { loader: 'text' };
import shareOffer from './share-offer/share-offer.scss' with { loader: 'text' };
import speciesWiki from './species-wiki/species-wiki.scss' with { loader: 'text' };
import styles from '../../styles.scss' with { loader: 'text' };
import viewPresetsBar from './view-presets-bar/view-presets-bar.scss' with { loader: 'text' };

/**
 * Charte « la salle d'aquarium » (#721, `docs/INTERFACE.md`) : aucune couleur, aucun rayon et
 * aucune opacité écrits en dur hors de `ui/_panel-layout.scss`. Chaque feuille d'interface
 * est lue comme texte (sans navigateur), commentaires retirés : une valeur en dur ajoutée à
 * une feuille échoue ici, et se corrige en passant par un jeton (ou en en ajoutant un).
 */

/** Toutes les feuilles des composants d'interface (une nouvelle feuille s'ajoute ici). */
const SHEETS: Readonly<Record<string, string>> = {
  'src/styles.scss': styles,
  'aquarium-host/aquarium-host.scss': aquariumHost,
  'beginner-guide/beginner-guide.scss': beginnerGuide,
  'care-session/care-session.scss': careSession,
  'commands-help/commands-help.scss': commandsHelp,
  'control-panel/_panel-controls.scss': panelControls,
  'control-panel/accessibility-section.scss': accessibilitySection,
  'control-panel/care-section.scss': careSection,
  'control-panel/control-panel.scss': controlPanel,
  'control-panel/day-section.scss': daySection,
  'control-panel/decor-section.scss': decorSection,
  'control-panel/environment-section.scss': environmentSection,
  'control-panel/population-section.scss': populationSection,
  'control-panel/quarantine-section.scss': quarantineSection,
  'control-panel/room-section.scss': roomSection,
  'control-panel/save-section.scss': saveSection,
  'control-panel/simulation-section.scss': simulationSection,
  'control-panel/sound-section.scss': soundSection,
  'control-panel/species-sheet.scss': speciesSheet,
  'control-panel/tanks-section.scss': tanksSection,
  'control-panel/treatment-notice.scss': treatmentNotice,
  'control-panel/water-section.scss': waterSection,
  'dashboard-frame/_dashboard-surface.scss': dashboardSurface,
  'dashboard-frame/dashboard-frame.scss': dashboardFrame,
  'dashboard-frame/dashboard-status.scss': dashboardStatus,
  'dashboard-frame/feeder-panel.scss': feederPanel,
  'dashboard-frame/water-history-chart.scss': waterHistoryChart,
  'day-indicator/day-indicator.scss': dayIndicator,
  'decor-badge/decor-badge.scss': decorBadge,
  'decor-editor/decor-editor.scss': decorEditor,
  'first-tank-path/first-tank-path.scss': firstTankPath,
  'free-camera-pad/free-camera-pad.scss': freeCameraPad,
  'immersive-mode/immersive-mode.scss': immersiveMode,
  'pharmacy/pharmacy.scss': pharmacy,
  'share-offer/share-offer.scss': shareOffer,
  'species-wiki/species-wiki.scss': speciesWiki,
  'view-presets-bar/view-presets-bar.scss': viewPresetsBar,
};

/** Texte d'une feuille SCSS sans ses commentaires (de ligne et de bloc). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Valeurs interdites hors des jetons : couleur, rayon chiffré, opacité chiffrée. */
function hardCodedValues(source: string): string[] {
  const code = withoutComments(source);
  const found: string[] = [];
  for (const match of code.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi)) {
    found.push(match[0]);
  }
  for (const match of code.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) {
    if (
      !/^(?:layout\.\$radius-[a-z-]+|0)(?: (?:layout\.\$radius-[a-z-]+|0))*$/.test(
        (match[1] ?? '').trim(),
      )
    ) {
      found.push(match[0]);
    }
  }
  // 0 et 1 : caché ou visible, pas une transparence. Une variable reste permise.
  for (const match of code.matchAll(/(?:^|[\s;{])opacity:\s*([^;]+);/g)) {
    if (!/^(?:0|1|layout\.\$[a-z-]+|var\(--[a-z-]+\))$/.test((match[1] ?? '').trim())) {
      found.push(match[0].trim());
    }
  }
  return found;
}

describe('charte : valeurs en dur (#721)', () => {
  it('relève couleurs, rayons et opacités en dur, pas les jetons ni les commentaires', () => {
    const sheet =
      '// #721 : rgb(1 2 3) dans un commentaire\n' +
      '.a { color: #ebe7de; border-radius: 6px; opacity: 0.8; }\n' +
      '.b { background: rgb(20 20 24 / 72%); border-top-left-radius: 2px; }\n' +
      '.c { color: layout.$panel-ink; border-radius: layout.$radius-control; opacity: 0; }\n' +
      '.d { opacity: layout.$opacity-disabled; border-radius: 0; opacity: var(--x-y); }\n' +
      '.e { border-radius: layout.$radius-window layout.$radius-window 0 0; }';
    expect(hardCodedValues(sheet)).toEqual([
      '#ebe7de',
      'rgb(',
      'border-radius: 6px;',
      'border-top-left-radius: 2px;',
      'opacity: 0.8;',
    ]);
  });

  it('lit toutes les feuilles des composants', () => {
    expect(Object.keys(SHEETS).length).toBeGreaterThanOrEqual(37);
    for (const [name, sheet] of Object.entries(SHEETS)) {
      expect(sheet.length, name).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(SHEETS))('%s : aucune valeur en dur hors des jetons', (_name, sheet) => {
    expect(hardCodedValues(sheet)).toEqual([]);
  });
});
