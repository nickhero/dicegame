import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../../src/utils/random';

describe('SeededRandom', () => {
  it('produces deterministic results with same seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different results with different seeds', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(99);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    expect(results1).not.toEqual(results2);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt() returns values in [min, max]', () => {
    const rng = new SeededRandom(456);
    for (let i = 0; i < 1000; i++) {
      const val = rng.nextInt(3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
    }
  });

  it('nextInt() covers the full range', () => {
    const rng = new SeededRandom(789);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      seen.add(rng.nextInt(1, 6));
    }
    expect(seen.size).toBe(6);
  });

  it('shuffle() produces a permutation', () => {
    const rng = new SeededRandom(42);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect(shuffled.sort()).toEqual(arr);
  });

  it('shuffle() is deterministic', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    expect(rng1.shuffle([...arr])).toEqual(rng2.shuffle([...arr]));
  });

  it.each([
    { seed: 0, label: 'zero' },
    { seed: -5, label: 'negative' },
    { seed: NaN, label: 'NaN' },
    { seed: Infinity, label: 'Infinity' },
  ])('handles degenerate seed ($label) and returns values in [0, 1)', ({ seed }) => {
    const rng = new SeededRandom(seed);
    for (let i = 0; i < 100; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('pick() returns an element from the array', () => {
    const rng = new SeededRandom(42);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });
});
