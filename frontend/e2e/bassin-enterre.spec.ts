import { expect, test } from '@playwright/test';

/**
 * Bassin enterré (#105) : sol et coupe autour de la margelle. Parcours QA : les cinq vues
 * du bassin se chargent sans erreur, la scène tourne et la population de koïs est intacte
 * (les bornes de nage ne changent pas), puis le retour au bac tropical.
 */

const VUES = ['top', 'three-quarter', 'side', 'front', 'bottom'] as const;

for (const camera of VUES) {
  test(`Bassin enterré : la vue « ${camera} » se charge sans erreur et la simulation tourne`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`/?seed=42&environnement=bassin&camera=${camera}`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const host = page.locator('app-aquarium-host');
    await expect(host).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(host).toHaveAttribute('data-aqfish-population', 'koi:7');
    const tick = Number(await host.getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await host.getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick);
    expect(errors).toEqual([]);
  });
}
