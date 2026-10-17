import { describe, expect, it } from 'vitest';
import { abortError, collect, fmtDecimal, fmtFans, fmtInt, isAbort, mapLimit, nonNull, range, sample, shuffle, uniqueBy } from './util';

describe('formatos', () => {
  it('fmtInt agrupa con puntos', () => {
    expect(fmtInt(8420)).toBe('8.420');
    expect(fmtInt(1234567.4)).toBe('1.234.567');
    expect(fmtInt(999)).toBe('999');
  });
  it('fmtFans', () => {
    expect(fmtFans(2_500_000)).toBe('2,5 M fans');
    expect(fmtFans(45_600)).toBe('46 mil fans');
    expect(fmtFans(12)).toBe('12 fans');
  });
  it('fmtDecimal usa coma', () => {
    expect(fmtDecimal(1.25, 2)).toBe('1,25');
    expect(fmtDecimal(3)).toBe('3,0');
  });
});

describe('listas', () => {
  it('shuffle no pierde ni inventa elementos y no toca el original', () => {
    const a = [1, 2, 3, 4, 5];
    const s = shuffle(a);
    expect([...s].sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });
  it('sample devuelve un elemento o undefined', () => {
    expect([1, 2, 3]).toContain(sample([1, 2, 3]));
    expect(sample([])).toBeUndefined();
  });
  it('uniqueBy se queda con el primero', () => {
    expect(uniqueBy([{ k: 1, v: 'a' }, { k: 1, v: 'b' }, { k: 2, v: 'c' }], (x) => x.k).map((x) => x.v)).toEqual(['a', 'c']);
  });
  it('range y nonNull', () => {
    expect(range(2, 5)).toEqual([2, 3, 4]);
    expect([1, null, 2, undefined].filter(nonNull)).toEqual([1, 2]);
  });
});

describe('abort', () => {
  it('reconoce el AbortError', () => {
    expect(isAbort(abortError())).toBe(true);
    expect(isAbort(new Error('x'))).toBe(false);
  });
});

describe('mapLimit', () => {
  it('conserva el orden y no pasa del límite', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe('collect', () => {
  it('para al tener los que necesita y salta los fallos', async () => {
    const seen: number[] = [];
    const out = await collect([1, 2, 3, 4, 5, 6], 1, 2, async (n) => {
      seen.push(n);
      if (n === 1) throw new Error('falla');
      return n % 2 === 0 ? n : null;
    });
    expect(out).toEqual([2, 4]);
    expect(seen).toEqual([1, 2, 3, 4]);
  });
  it('lanza AbortError si se cancela', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(collect([1, 2], 1, 2, async (n) => n, ctrl.signal)).rejects.toSatisfy(isAbort);
  });
});
