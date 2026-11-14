import { expect, test } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import {
  hostEl,
  card,
  open,
  importAlgaeTank,
  visiblePatches,
  openSession,
  sweepMouse,
} from './outils-seance';

/**
 * Séance d'entretien guidée, lot 1 (issue #604, ADR 0138) : « Entretenir le bac » dans le
 * calendrier d'entretien ouvre la séance à l'étape « vitres » ; glisser la raclette sur le bac
 * retire les plaques d'algues là où elle passe ; « Étape terminée » inscrit les vitres au
 * calendrier ; chaque étape se passe ; « Plus tard » interrompt, la séance reprend à son étape,
 * même après un rechargement. Bac tropical couvert d'algues, simulation en pause. Siphon et eau
 * neuve : `seance-siphon.spec.ts` ; au doigt : `seance-toucher.spec.ts` (#620).
 */
test.describe('séance d’entretien (#604)', () => {
  test('souris : raclette, étape terminée au calendrier, étapes passées, bilan', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    expect(await visiblePatches(page)).toBe(ALGAE_PATCH_COUNT);
    const captureDir = process.env['CAPTURE_DIR'];
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    await expect(card(page)).toContainText('Les vitres');
    await expect(card(page)).toContainText(`${ALGAE_PATCH_COUNT} taches vertes`);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-care-session', 'vitres');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-scraper', 'true');
    const population = await hostEl(page).getAttribute('data-aqfish-population');
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-vitres-avant.png` });
    }

    await sweepMouse(page);
    await expect.poll(() => visiblePatches(page)).toBeLessThan(ALGAE_PATCH_COUNT);
    await expect(card(page)).not.toContainText(`${ALGAE_PATCH_COUNT} taches vertes`);
    // La raclette ne touche pas aux animaux.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', population!);
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-vitres-apres.png` });
    }

    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-scraper', 'false');
    for (const step of ['filtre', 'eau', 'taille', 'bilan']) {
      await card(page).locator('[data-care-skip]').click();
      await expect(card(page)).toHaveAttribute('data-step', step);
    }
    await expect(card(page).locator('[data-care-summary]')).toContainText('Les vitres : fait');
    await expect(card(page).locator('[data-care-summary]')).toContainText('Le siphon : passé');
    await card(page).locator('[data-care-close]').click();
    await expect(card(page)).toHaveCount(0);
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-care-session', /.*/);

    // Les vitres sont au calendrier d'entretien et au journal.
    await page.locator('[data-maintenance]').click();
    await expect(page.locator('[data-maintenance-task="glass"]')).toContainText(
      'Nettoyage des vitres : Dans 14 j',
    );
    await expect(page.locator('[data-maintenance-log]')).toContainText('Nettoyage des vitres');
    // Séance finie : la suivante repart des vitres.
    await page.locator('[data-care-session-open]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    expect(errors).toEqual([]);
  });

  test('interrompue : reprise à la même étape, aussi après un rechargement', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await openSession(page);
    // Bac par défaut, sans algues : rien à racler.
    await expect(card(page)).toContainText('rien à racler');
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await card(page).locator('[data-care-close]').click();
    await expect(card(page)).toHaveCount(0);
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await card(page).locator('[data-care-close]').click();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    expect(errors).toEqual([]);
  });

  test('mode décor : aucun bouton de séance', async ({ page }) => {
    await page.goto('/?mode=decor');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(page.locator('[data-maintenance]')).toHaveCount(0);
    await expect(page.locator('[data-care-session-open]')).toHaveCount(0);
  });
});
