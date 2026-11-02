import { expect, test, type Page } from '@playwright/test';

import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { setPopulationInPlace } from '../src/app/sim/population';
import { ROOM_ANIMAL_CAP, ROOM_TANK_CAP, roomAnimalCount } from '../src/app/sim/room-limits';
import { serializeRoom } from '../src/app/sim/room-save';
import { addTank, createRoom, type RoomState } from '../src/app/sim/room-state';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Plafonds de la pièce, suite (#396, ADR 0096) : une sauvegarde de pièce à 16 bacs, chargée
 * d'un coup plutôt que construite bac par bac (lent en rendu logiciel), puis :
 *
 * - ajouter un bac depuis le catalogue « Bacs et meubles » affiche `ROOM_TANK_CAP_MESSAGE`
 *   et ne change rien ;
 * - changer pour un environnement jamais visité (le bassin) crée son bac de départ ramené à
 *   la place restante sous le plafond d'animaux.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const catalog = (page: Page) => page.locator('[data-section="bacs-meubles"]');
const notice = (page: Page) => page.locator('[data-section="population"] [data-room-cap]');

/** Places laissées sous le plafond d'animaux par la sauvegarde. */
const FREE = 3;

/**
 * Pièce de `ROOM_TANK_CAP` bacs tropicaux (bac affiché, puis petits bacs posés au sol en
 * rangées, comme `room-limits.spec.ts`), peuplés de néons jusqu'à `ROOM_ANIMAL_CAP - FREE`
 * animaux en tout.
 */
function fullRoom(): RoomState {
  let room = createRoom(3);
  for (let i = 1; i < ROOM_TANK_CAP; i++) {
    const x = Math.round((-3.6 + ((i - 1) % 8) * 0.65) * 100) / 100;
    const z = Math.round((-2.6 + Math.floor((i - 1) / 8) * 0.5) * 100) / 100;
    const result = addTank(room, {
      environment: 'tropical',
      size: 'petit',
      placement: { supportId: null, x, z, quarter: 0 },
    });
    if (!result.ok) {
      throw new Error(`bac ${i} refusé : ${result.reason}`);
    }
    room = result.room;
  }
  // Néons ajoutés bac après bac (chaque bac borné par son plafond) jusqu'au total voulu.
  for (const tank of room.tanks) {
    const world = tank.world as MutableWorld;
    const missing = ROOM_ANIMAL_CAP - FREE - roomAnimalCount(room);
    if (missing <= 0) {
      break;
    }
    const neons = world.entities.filter((fish) => fish.species === 'neon').length;
    setPopulationInPlace(world, 'neon', neons + missing);
  }
  if (roomAnimalCount(room) !== ROOM_ANIMAL_CAP - FREE) {
    throw new Error(`pièce à ${roomAnimalCount(room)} animaux`);
  }
  return room;
}

async function total(page: Page): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  return raw
    .split(',')
    .filter((part) => part.includes(':'))
    .reduce((sum, part) => sum + Number(part.split(':')[1]), 0);
}

test.describe('Plafond de bacs de la pièce (#396)', () => {
  // Pièce de 16 bacs dessinée en rendu logiciel : chaque image est lente.
  test.setTimeout(240_000);

  test('pièce à 16 bacs : ajout refusé avec message ; bac de départ ramené à la place restante', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const text = serializeRoom(fullRoom(), 0);
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      SAVE_STORAGE_KEY,
      text,
    ] as const);
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', String(ROOM_TANK_CAP));
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('section.control-panel')).toBeVisible();
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');

    await test.step('16 bacs : « Ajouter le bac » affiche le plafond, rien ne change', async () => {
      await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
      await expect(catalog(page)).toBeVisible();
      await expect(catalog(page).getByRole('status')).toHaveCount(0);
      await catalog(page).getByRole('button', { name: 'Ajouter le bac' }).click();
      await expect(catalog(page).getByRole('status')).toHaveText(
        'La pièce est pleine (16 bacs au plus) : retirez-en un d’abord.',
      );
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', String(ROOM_TANK_CAP));
      await expect(catalog(page).locator('[data-room-tank]')).toHaveCount(ROOM_TANK_CAP);
      // Pièce masquée : les images suivantes sont plus rapides.
      await page.getByRole('checkbox', { name: 'Afficher la pièce' }).uncheck();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'false');
    });

    await test.step('bassin jamais visité : 3 koïs au lieu de 7, la pièce à son plafond', async () => {
      expect(createDefaultWorld(3, 'bassin').entities.length).toBeGreaterThan(FREE);
      const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
      await environment.selectOption('bassin');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
      await expect.poll(() => total(page)).toBe(FREE);
      await expect(notice(page)).toHaveText(
        'Plafond de la pièce atteint : 240 animaux au plus, tous bacs confondus.',
      );
    });
    expect(errors).toEqual([]);
  });
});
