import { test } from '@playwright/test';

import {
  checkPanelInViewport,
  checkSettingsWindowInViewport,
  PANEL_VIEWPORTS,
  PANELS,
  SETTINGS_CASES,
} from './outils-cadrage';

/**
 * Cadrage des panneaux à 1280 × 720 (bureau, format des captures ; #108, #79) : chaque
 * panneau de `PANELS` ouvert tient dans la fenêtre, sans recouvrir la barre des vues ni les
 * boutons d'interface. Séparé de `cadrage-panneaux.spec.ts` pour la répartition de la CI (#600).
 */
for (const viewport of PANEL_VIEWPORTS.slice(0, 1)) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const panelCase of PANELS) {
      test(`panneau « ${panelCase.name} » ouvert : dans la fenêtre, sans recouvrir la barre des vues`, async ({
        page,
      }) => {
        await checkPanelInViewport(page, panelCase, viewport);
      });
    }

    for (const settingsCase of SETTINGS_CASES) {
      test(`fenêtre « ${settingsCase.name} » ouverte : entière, page couverte par son fond`, async ({
        page,
      }) => {
        await checkSettingsWindowInViewport(page, settingsCase, viewport);
      });
    }
  });
}
