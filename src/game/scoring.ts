import type { Outcome, Question } from './types';

export const ROUNDS = 10;
export const BASE_POINTS = 1000;
/** Escribir la respuesta en vez de elegirla entre las 4 opciones. */
export const TYPED_BONUS = 1.5;

/** Segundos que se desbloquean en ¿Qué canción es? y cuánto vale acertar en cada paso. */
export const HEARDLE_STEPS = [1, 2, 4, 8, 16];
export const HEARDLE_FACTORS = [1, 0.8, 0.6, 0.45, 0.3];

/** Resolución de la portada (píxeles por lado; 0 = nítida) y su valor. */
export const PIXEL_LEVELS = [6, 10, 16, 26, 44, 0];
export const PIXEL_FACTORS = [1, 0.85, 0.7, 0.55, 0.4, 0.3];

export function streakMultiplier(streakBefore: number): number {
  return 1 + 0.1 * Math.min(streakBefore, 5);
}

/** Cuanto antes respondes, más puntos: 100 % al instante, 40 % al final de la ventana. */
export function speedFactor(elapsedMs: number, windowMs = 30000): number {
  return Math.max(0.4, 1 - (elapsedMs / windowMs) * 0.6);
}

export function yearPoints(diff: number): number {
  return diff === 0 ? 1500 : Math.max(0, BASE_POINTS - 150 * diff);
}

export function roundPoints(q: Question, o: Outcome, streakBefore: number): number {
  const mult = streakMultiplier(streakBefore);
  let pts = 0;
  if (q.kind === 'anio') pts = (o.basePoints ?? 0) * (o.correct ? mult : 1);
  else if (o.correct) pts = BASE_POINTS * o.factor * (o.typed ? TYPED_BONUS : 1) * mult;
  return Math.round(pts / 10) * 10;
}

export function grade(correct: number): { letter: string; title: string } {
  if (correct >= 10) return { letter: 'S', title: 'Oído absoluto' };
  if (correct >= 8) return { letter: 'A', title: 'Oído de oro' };
  if (correct >= 6) return { letter: 'B', title: 'Buen oído' };
  if (correct >= 4) return { letter: 'C', title: 'Vas pillando' };
  return { letter: 'D', title: 'Tapones puestos' };
}
