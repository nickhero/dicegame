import { describe, it, expect } from 'vitest';
import { SERVER_TIMING, type SpeedMode } from '../../src/game/ServerTypes';

describe('ServerTypes', () => {
  describe('SERVER_TIMING', () => {
    const expectedModes: SpeedMode[] = ['normal', 'fast', 'instant'];
    const expectedDelayKeys = [
      'attackDelay',
      'battleAnimDelay',
      'turnEndDelay',
      'powerUpDelay',
      'allianceDelay',
      'surrenderDelay',
    ] as const;

    it('has all speed modes', () => {
      for (const mode of expectedModes) {
        expect(SERVER_TIMING[mode], `missing speed mode: ${mode}`).toBeDefined();
      }
    });

    it('has no extra speed modes', () => {
      expect(Object.keys(SERVER_TIMING).sort()).toEqual([...expectedModes].sort());
    });

    it.each(expectedModes)('"%s" mode has all delay keys', (mode) => {
      const timing = SERVER_TIMING[mode];
      for (const key of expectedDelayKeys) {
        expect(timing[key], `${mode}.${key} missing`).toBeDefined();
        expect(typeof timing[key]).toBe('number');
      }
    });

    it('normal delays are greater than fast delays', () => {
      for (const key of expectedDelayKeys) {
        expect(
          SERVER_TIMING.normal[key],
          `normal.${key} should be > fast.${key}`,
        ).toBeGreaterThan(SERVER_TIMING.fast[key]);
      }
    });

    it('instant mode has all delays set to 0', () => {
      for (const key of expectedDelayKeys) {
        expect(SERVER_TIMING.instant[key], `instant.${key} should be 0`).toBe(0);
      }
    });

    it('all delay values are non-negative integers', () => {
      for (const mode of expectedModes) {
        for (const key of expectedDelayKeys) {
          const value = SERVER_TIMING[mode][key];
          expect(value, `${mode}.${key} should be >= 0`).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(value), `${mode}.${key} should be integer`).toBe(true);
        }
      }
    });
  });
});
