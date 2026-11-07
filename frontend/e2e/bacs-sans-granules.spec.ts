import { expect, test } from '@playwright/test';

/**
 * QA de #492 : un bac habité sans animal nourri aux granulés (Paludarium) l'indique dans la
 * liste des bacs, avec une infobulle ; les bacs de poissons gardent leur faim.
 */
test('la liste des bacs dit « sans granulés » au Paludarium et garde la faim des poissons (#492)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
  for (const id of ['recif', 'paludarium', 'tropical']) {
    await environment.selectOption(id);
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-environment', id);
  }
  const rows = page.locator('[data-section="bacs"] [data-tank]');
  await expect(rows).toHaveCount(3);
  const paludarium = rows.filter({ hasText: 'Paludarium' });
  await expect(paludarium).toContainText('sans granulés');
  await expect(paludarium).not.toContainText('faim');
  await expect(paludarium.locator('button')).toHaveAttribute('title', /ne mange de granulés/);
  const tropical = rows.filter({ hasText: 'Bac tropical' });
  await expect(tropical).toContainText('faim');
  await expect(tropical).not.toContainText('sans granulés');
  expect(errors).toEqual([]);
});
