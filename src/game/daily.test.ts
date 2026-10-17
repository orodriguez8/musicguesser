import { afterEach, describe, expect, it, vi } from 'vitest';
import { dailyDone, loadDaily, loadStats, recordDaily, rngPick, rngShuffle, saveDaily, seededRandom, todayKey } from './daily';

const win = { won: true, attempts: 3, score: '3/8', grid: '' };
const lose = { won: false, attempts: 8, score: 'X/8', grid: '' };

afterEach(() => vi.useRealTimers());

describe('semilla', () => {
  it('misma semilla, mismos números', () => {
    const a = seededRandom('2026-10-17:clasico');
    const b = seededRandom('2026-10-17:clasico');
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom('otra')()).not.toBe(xs[0]);
  });
  it('rngShuffle y rngPick son deterministas', () => {
    expect(rngShuffle([1, 2, 3, 4, 5], seededRandom('x'))).toEqual(rngShuffle([1, 2, 3, 4, 5], seededRandom('x')));
    expect(rngPick(['a', 'b', 'c'], seededRandom('y'))).toBe(rngPick(['a', 'b', 'c'], seededRandom('y')));
  });
});

describe('todayKey', () => {
  it('usa la hora de Madrid (a las 23:30 UTC de octubre ya es el día siguiente)', () => {
    expect(todayKey(new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-18');
    expect(todayKey(new Date('2026-10-17T21:30:00Z'))).toBe('2026-10-17');
  });
});

describe('rachas', () => {
  it('cuenta días seguidos y se rompe al fallar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    expect(recordDaily('wordle', win).streak).toBe(1);
    // El mismo día no cuenta dos veces
    expect(recordDaily('wordle', win).played).toBe(1);
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const s = recordDaily('wordle', win);
    expect(s.streak).toBe(2);
    expect(s.best).toBe(2);
    expect(s.dist[2]).toBe(2);
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    expect(recordDaily('wordle', lose).streak).toBe(0);
    expect(loadStats('wordle')).toMatchObject({ played: 3, won: 2, best: 2 });
  });

  it('si te saltas un día, la racha se pierde al abrir', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    recordDaily('clasico', win);
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    expect(loadStats('clasico').streak).toBe(0);
  });
});

describe('progreso del día', () => {
  it('se guarda solo para hoy', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
    saveDaily('albumquiz', { found: [1] });
    expect(loadDaily('albumquiz')?.data).toEqual({ found: [1] });
    expect(dailyDone('albumquiz')).toBe(false);
    saveDaily('albumquiz', { found: [1] }, win);
    expect(dailyDone('albumquiz')).toBe(true);
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    expect(loadDaily('albumquiz')).toBeNull();
  });
});
