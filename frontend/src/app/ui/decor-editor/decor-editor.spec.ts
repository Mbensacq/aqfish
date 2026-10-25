import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { MAX_DECOR_ITEMS } from '../../sim/decor-edit';
import { MAX_ROOM_ITEMS } from '../../sim/room';
import { DEFAULT_TANK, type TankDimensions } from '../../sim/tank';
import {
  DECOR_TOOLS,
  DecorEditor,
  decorEditorHint,
  ROOM_TOOLS,
  TANK_DIMENSION_FIELDS,
  type EditorTool,
} from './decor-editor';

describe('decorEditorHint', () => {
  it('dit ce que fera un clic, selon l’outil et la sélection', () => {
    expect(decorEditorHint('rock', null, false)).toBe('Cliquez sur le sable pour poser : rocher.');
    expect(decorEditorHint('tuft', null, false)).toContain('touffe');
    expect(decorEditorHint('select', null, false)).toContain('sélectionner');
    expect(decorEditorHint('rock', 0, false)).toContain('Suppr');
    expect(decorEditorHint('rock', null, true)).toContain(String(MAX_DECOR_ITEMS));
    expect(decorEditorHint('rock', 0, false)).toContain('Glissez');
  });

  it('dit pourquoi une pose a été refusée, avant tout le reste', () => {
    expect(decorEditorHint('rock', 2, false, true)).toContain('refusée');
    expect(decorEditorHint('select', null, true, true)).toContain('chevaucherait');
  });

  it('dit qu’un élément a été posé sans chute faute de moteur (#170), après un refus', () => {
    expect(decorEditorHint('rock', 3, false, false, true)).toContain('posé sur le sable');
    expect(decorEditorHint('rock', 3, false, true, true)).toContain('refusée');
  });

  it('pièce (#188) : poser sur le parquet ou un meuble, quart de tour, refus expliqué', () => {
    expect(decorEditorHint('etagere', null, false)).toBe(
      'Cliquez sur le parquet ou un meuble pour poser : étagère.',
    );
    expect(decorEditorHint('plante-pot', null, true)).toContain(String(MAX_ROOM_ITEMS));
    expect(decorEditorHint('select', 0, false, false, false, true)).toContain('quart de tour');
    expect(decorEditorHint('canape', null, false, true)).toContain('hors de la pièce');
    expect(decorEditorHint('select', 1, false, true, false, true)).toContain('en l’air');
    // Un élément du décor sélectionné garde ses consignes, même outil de la pièce choisi.
    expect(decorEditorHint('canape', 2, false)).toContain('changent la taille');
    expect(ROOM_TOOLS.map((t) => t.id)).toEqual(['etagere', 'table-basse', 'canape', 'plante-pot']);
  });

  it('propose la sélection puis chaque type du catalogue', () => {
    expect(DECOR_TOOLS.map((t) => t.id)).toEqual(['select', 'rock', 'wood', 'tall', 'tuft']);
  });
});

@Component({
  imports: [DecorEditor],
  template: `<app-decor-editor
      [tool]="tool()"
      [selection]="selection()"
      [count]="count()"
      [refused]="refused()"
      [dimensions]="dimensions()"
      [roomTools]="roomTools()"
      [roomSelected]="roomSelected()"
      [roomCount]="roomCount()"
      (dimensionsChanged)="dims.push($event)"
      (rotateRequested)="rotations.push($event)"
      (scaleRequested)="scales.push($event)"
      (toolChanged)="tools.push($event)"
      (deleteRequested)="deletes = deletes + 1"
      (deselectRequested)="deselects = deselects + 1"
      (closed)="closes = closes + 1"
    />
    <input aria-label="champ" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHost {
  readonly tool = signal<EditorTool>('rock');
  readonly roomTools = signal(false);
  readonly roomSelected = signal(false);
  readonly roomCount = signal(3);
  readonly selection = signal<number | null>(null);
  readonly count = signal(10);
  readonly refused = signal(false);
  readonly dimensions = signal<TankDimensions | null>(DEFAULT_TANK);
  readonly dims: TankDimensions[] = [];
  readonly tools: EditorTool[] = [];
  readonly rotations: number[] = [];
  readonly scales: number[] = [];
  deletes = 0;
  deselects = 0;
  closes = 0;
}

describe('DecorEditor', () => {
  let fixture: ComponentFixture<TestHost>;
  const root = () => fixture.nativeElement as HTMLElement;
  const host = () => fixture.componentInstance;
  const button = (text: string) =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    )!;
  const key = (k: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  beforeEach(async () => {
    fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('affiche les outils, l’outil courant coché, et émet le choix', async () => {
    const radios = [...root().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent?.trim())).toEqual([
      'Sélection',
      'Rocher',
      'Bois flotté',
      'Grande plante',
      'Touffe',
    ]);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    button('Touffe').click();
    expect(host().tools).toEqual(['tuft']);
    host().tool.set('tuft');
    await fixture.whenStable();
    expect(button('Touffe').getAttribute('aria-checked')).toBe('true');
    expect(root().querySelector('[data-decor-count]')?.textContent?.trim()).toBe(
      `10 / ${MAX_DECOR_ITEMS} éléments`,
    );
  });

  it('« Supprimer » et Suppr : seulement avec une sélection', async () => {
    button('Supprimer').click();
    key('Delete');
    expect(host().deletes).toBe(0);
    expect(button('Supprimer').getAttribute('aria-disabled')).toBe('true');
    host().selection.set(3);
    await fixture.whenStable();
    expect(button('Supprimer').getAttribute('aria-disabled')).toBe('false');
    button('Supprimer').click();
    key('Delete');
    key('Backspace');
    expect(host().deletes).toBe(3);
  });

  it('tourner et redimensionner : boutons et touches, seulement avec une sélection', async () => {
    const pose = (id: string) => root().querySelector<HTMLButtonElement>(`[data-pose="${id}"]`)!;
    expect(
      [...root().querySelectorAll('[data-pose]')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Tourner de −15°', 'Tourner de +15°', 'Réduire', 'Agrandir']);
    pose('droite').click();
    key('ArrowLeft');
    key('+');
    expect(host().rotations).toEqual([]);
    expect(host().scales).toEqual([]);
    expect(pose('agrandir').getAttribute('aria-disabled')).toBe('true');
    host().selection.set(0);
    await fixture.whenStable();
    expect(pose('agrandir').getAttribute('aria-disabled')).toBe('false');
    pose('gauche').click();
    pose('droite').click();
    pose('reduire').click();
    pose('agrandir').click();
    key('ArrowRight');
    key('ArrowLeft');
    key('-');
    key('+');
    key('=');
    expect(host().rotations).toEqual([-1, 1, 1, -1]);
    expect(host().scales).toEqual([-1, 1, -1, 1, 1]);
    // Avec Ctrl (zoom du navigateur) : ignoré.
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true }),
    );
    expect(host().scales.length).toBe(5);
    key('ArrowRight', root().querySelector('input')!);
    expect(host().rotations.length).toBe(4);
  });

  it('affiche le refus d’une pose', async () => {
    host().selection.set(0);
    host().refused.set(true);
    await fixture.whenStable();
    expect(root().querySelector('[data-decor-hint]')?.textContent).toContain('refusée');
  });

  it('Échap désélectionne, puis termine ; « Terminer » termine', async () => {
    host().selection.set(1);
    await fixture.whenStable();
    key('Escape');
    expect(host().deselects).toBe(1);
    expect(host().closes).toBe(0);
    host().selection.set(null);
    await fixture.whenStable();
    key('Escape');
    expect(host().closes).toBe(1);
    button('Terminer').click();
    expect(host().closes).toBe(2);
  });

  it('ignore les touches tapées dans un champ, et n’écoute plus une fois détruit', async () => {
    host().selection.set(0);
    await fixture.whenStable();
    key('Delete', root().querySelector('input')!);
    expect(host().deletes).toBe(0);
    fixture.destroy();
    key('Delete');
    expect(host().deletes).toBe(0);
  });

  it('dimensions du bac (#171) : trois curseurs en centimètres, bornés, masqués sans réglage', async () => {
    expect(TANK_DIMENSION_FIELDS.map((f) => [f.key, f.min, f.max, f.step])).toEqual([
      ['width', 60, 200, 10],
      ['depth', 30, 90, 5],
      ['height', 50, 90, 5],
    ]);
    for (const f of TANK_DIMENSION_FIELDS) {
      const input = root().querySelector<HTMLInputElement>(`[data-dimension="${f.key}"]`)!;
      expect([input.min, input.max, input.step]).toEqual([f.min, f.max, f.step].map(String));
    }
    const slider = (k: string) =>
      root().querySelector<HTMLInputElement>(`[data-dimension="${k}"]`)!;
    expect(slider('width').value).toBe('120');
    expect(slider('depth').value).toBe('50');
    expect(slider('height').value).toBe('60');
    expect(slider('width').getAttribute('aria-valuetext')).toBe('120 cm');
    expect(root().querySelector('[data-tank-dimensions]')?.textContent).toContain('120 cm');
    slider('depth').value = '35';
    slider('depth').dispatchEvent(new Event('change'));
    expect(host().dims).toEqual([{ width: 1.2, height: 0.6, depth: 0.35 }]);
    // Une flèche sur un curseur ne tourne pas la sélection (champ de saisie).
    host().selection.set(0);
    await fixture.whenStable();
    key('ArrowLeft', slider('width'));
    expect(host().rotations).toEqual([]);
    host().dimensions.set(null);
    await fixture.whenStable();
    expect(root().querySelector('[data-tank-dimensions]')).toBeNull();
  });

  it('pièce affichée (#188) : outils de la pièce, compte, échelle inactive pour un meuble', async () => {
    expect(root().querySelector('[data-room-count]')).toBeNull();
    host().roomTools.set(true);
    await fixture.whenStable();
    const radios = [...root().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.slice(-4).map((r) => r.textContent?.trim())).toEqual([
      'Étagère',
      'Table basse',
      'Canapé',
      'Plante en pot',
    ]);
    expect(root().querySelector('[data-room-count]')?.textContent?.trim()).toBe(
      `Pièce : 3 / ${MAX_ROOM_ITEMS} meubles`,
    );
    button('Canapé').click();
    expect(host().tools).toEqual(['canape']);
    host().selection.set(0);
    host().roomSelected.set(true);
    await fixture.whenStable();
    const grow = root().querySelector<HTMLButtonElement>('[data-pose="agrandir"]')!;
    expect(grow.getAttribute('aria-disabled')).toBe('true');
    expect(root().querySelector('[data-pose="droite"]')?.getAttribute('aria-disabled')).toBe(
      'false',
    );
    grow.click();
    key('+');
    key('ArrowRight');
    expect(host().scales).toEqual([]);
    expect(host().rotations).toEqual([1]);
  });
});
