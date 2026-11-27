import { TestBed } from '@angular/core/testing';

import { MOON_OPTION_STORAGE_KEY } from '../../core/moon-option/moon-option';
import { MoonOptionState } from './moon-option-state';

describe('MoonOptionState (#856)', () => {
  beforeEach(() => localStorage.removeItem(MOON_OPTION_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(MOON_OPTION_STORAGE_KEY));

  it('active la lune par défaut', () => {
    expect(TestBed.inject(MoonOptionState).enabled()).toBe(true);
  });

  it('mémorise le choix, relu par un nouvel état', () => {
    TestBed.inject(MoonOptionState).setEnabled(false);
    expect(localStorage.getItem(MOON_OPTION_STORAGE_KEY)).toBe('coupee');
    TestBed.resetTestingModule();
    expect(TestBed.inject(MoonOptionState).enabled()).toBe(false);
  });
});
