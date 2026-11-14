import { expect, test } from '@playwright/test';

import {
  hostEl,
  card,
  open,
  importDirtyTank,
  foodCount,
  nitrate,
  siphonPercent,
  openSession,
  sweepMouse,
} from './outils-seance';

/**
 * Séance d'entretien guidée, lot 2 (issue #605, ADR 0139) : siphon des restes de nourriture en
 * vue de dessus, jauge de l'eau retirée, eau neuve sans conditionneur et froide (deux
 * avertissements), dilution des nitrates, siphon et changement d'eau au calendrier.
 */
test.describe('séance d’entretien : siphon et eau neuve (#605)', () => {
  test('souris : siphon des restes, eau neuve sans conditionneur et froide, calendrier', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await open(page);
    await importDirtyTank(page);
    const food = await foodCount(page);
    expect(food).toBeGreaterThan(10);
    expect(await nitrate(page)).toBe(40);
    await openSession(page);
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await expect(card(page)).toContainText('Promenez le tuyau');
    await expect(card(page).locator('[data-care-done]')).toHaveCount(0);
    const population = await hostEl(page).getAttribute('data-aqfish-population');

    // Vue de dessus : un seul passage du tuyau sur la ligne de restes (z = 0, milieu de l'écran)
    // suffit à retirer des restes et à faire monter la jauge (#620).
    await page.locator('[data-preset="top"]').click();
    await sweepMouse(page, [0.5]);
    await expect.poll(() => foodCount(page)).toBeLessThan(food);
    await expect.poll(() => siphonPercent(page)).toBeGreaterThan(0);
    await expect(card(page).locator('[data-care-hint]')).toContainText('% de l’eau retirée');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', population!);
    // L'eau retirée ne change pas les concentrations : seule l'eau neuve dilue.
    expect(await nitrate(page)).toBe(40);
    const captureDir = process.env['CAPTURE_DIR'];
    await page.locator('[data-preset="side"]').click();
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-siphon-side.png` });
    }
    const siphoned = await siphonPercent(page);

    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'filtre');
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'eau');
    await expect(card(page)).toContainText(`0 % sur ${siphoned} %`);
    await card(page).locator('[data-care-conditioner]').uncheck();
    await card(page).locator('[data-care-bucket]').selectOption('-6');
    await expect(card(page).locator('[data-care-warning]')).toHaveCount(2);
    await expect(card(page)).toContainText('chlore du robinet');
    await expect(card(page)).toContainText('plus froide que le bac de 6 °C');
    while ((await card(page).locator('[data-care-pour]').count()) > 0) {
      await card(page).locator('[data-care-pour]').click();
    }
    await expect(card(page)).toContainText('Le bac est plein');
    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'taille');
    await expect.poll(() => nitrate(page)).toBeLessThan(40);
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-eau-apres.png` });
    }
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page).locator('[data-care-summary]')).toContainText('Le siphon : fait');
    await expect(card(page).locator('[data-care-summary]')).toContainText('L’eau neuve : fait');
    await card(page).locator('[data-care-close]').click();

    await page.locator('[data-maintenance]').click();
    await expect(page.locator('[data-maintenance-task="siphon"]')).toContainText(
      'Siphon du sol : Dans 7 j',
    );
    await expect(page.locator('[data-maintenance-task="waterChange"]')).toContainText(
      'Changement d’eau : Dans 7 j',
    );
    expect(errors).toEqual([]);
  });
});
