import { SIM_DT } from './constants';
import { assertTimeStep } from './time-step';

describe('assertTimeStep', () => {
  it.each([SIM_DT, Number.MIN_VALUE, 1, Number.MAX_VALUE])('accepte dt = %s', (dt) => {
    expect(() => assertTimeStep(dt)).not.toThrow();
  });

  it.each([0, -0, -SIM_DT, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuse dt = %s',
    (dt) => {
      expect(() => assertTimeStep(dt)).toThrow(RangeError);
    },
  );
});
