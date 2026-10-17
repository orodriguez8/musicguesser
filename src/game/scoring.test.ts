import { describe, expect, it } from 'vitest';
import { cancion, track } from '../test/helpers';
import { BASE_POINTS, grade, roundPoints, speedFactor, streakMultiplier, TYPED_BONUS, yearPoints } from './scoring';
import type { Outcome, Question } from './types';

const ok = (over: Partial<Outcome> = {}): Outcome => ({ correct: true, typed: false, factor: 1, short: '', reveal: '', ...over });

describe('puntuación', () => {
  it('la racha sube un 10 % por acierto hasta ×1,5', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(3)).toBeCloseTo(1.3);
    expect(streakMultiplier(9)).toBeCloseTo(1.5);
  });

  it('la velocidad nunca baja del 40 %', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(15000)).toBeCloseTo(0.7);
    expect(speedFactor(999999)).toBe(0.4);
  });

  it('Máquina del tiempo: exacto vale 1.500 y cada año resta 150', () => {
    expect(yearPoints(0)).toBe(1500);
    expect(yearPoints(2)).toBe(700);
    expect(yearPoints(10)).toBe(0);
  });

  it('escribir vale ×1,5 y se redondea a decenas', () => {
    const q = cancion(track());
    expect(roundPoints(q, ok(), 0)).toBe(BASE_POINTS);
    expect(roundPoints(q, ok({ typed: true }), 0)).toBe(BASE_POINTS * TYPED_BONUS);
    expect(roundPoints(q, ok({ factor: 0.333 }), 0)).toBe(330);
    expect(roundPoints(q, ok({ correct: false }), 4)).toBe(0);
  });

  it('en Máquina del tiempo un fallo cercano suma algo, sin racha', () => {
    const q = { kind: 'anio', track: track(), year: 2010 } as unknown as Question;
    expect(roundPoints(q, ok({ correct: false, basePoints: 400 }), 3)).toBe(400);
    expect(roundPoints(q, ok({ basePoints: 1000 }), 2)).toBe(1200);
  });

  it('el máximo posible cabe en el límite del servidor (3.000 por acierto)', () => {
    const q = cancion(track());
    expect(roundPoints(q, ok({ typed: true }), 99)).toBeLessThanOrEqual(3000);
  });

  it('notas', () => {
    expect(grade(10).letter).toBe('S');
    expect(grade(8).letter).toBe('A');
    expect(grade(6).letter).toBe('B');
    expect(grade(4).letter).toBe('C');
    expect(grade(0).letter).toBe('D');
  });
});
