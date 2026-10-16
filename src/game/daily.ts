// Puzles (Clásico, Wordle, Album Quiz, Top 10, Pirámide): reto del día igual para todos,
// modo libre ilimitado, rachas y estadísticas (guardadas solo en este navegador).
import { load, save } from '../lib/storage';

export type PuzzleId = 'clasico' | 'wordle' | 'albumquiz' | 'top10' | 'piramide';

/** Día en España (el reto cambia a medianoche de Madrid para todos). */
export function todayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(d);
}

function yesterdayKey(): string {
  return todayKey(new Date(Date.now() - 864e5));
}

/** Generador aleatorio con semilla: misma semilla → mismos números en todos los móviles. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const rngPick = <T,>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

// ---------- Estadísticas ----------

export interface PuzzleStats {
  played: number;
  won: number;
  streak: number;
  best: number;
  lastDay?: string;
  /** Partidas ganadas según el nº de intentos (índice 0 = a la primera) */
  dist: number[];
}

const EMPTY: PuzzleStats = { played: 0, won: 0, streak: 0, best: 0, dist: [] };

export function loadStats(id: PuzzleId): PuzzleStats {
  const s = load<Partial<PuzzleStats>>(`puzzle-stats:${id}`, {});
  const stats = { ...EMPTY, ...s, dist: Array.isArray(s.dist) ? s.dist : [] };
  // Si ayer no jugaste el reto, la racha se ha roto
  if (stats.lastDay && stats.lastDay !== todayKey() && stats.lastDay !== yesterdayKey()) stats.streak = 0;
  return stats;
}

/** Resultado de un reto terminado. Solo el reto del día cuenta para la racha. */
export interface PuzzleResult {
  won: boolean;
  /** Intentos usados (o aciertos, en los puzles de completar) */
  attempts: number;
  /** Texto corto para compartir: "4/8", "7/12"… */
  score: string;
  /** Cuadritos para compartir */
  grid: string;
}

export function recordDaily(id: PuzzleId, r: PuzzleResult): PuzzleStats {
  const s = loadStats(id);
  const day = todayKey();
  if (s.lastDay === day) return s;
  s.played++;
  if (r.won) {
    s.won++;
    s.streak = s.lastDay === yesterdayKey() ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.dist[r.attempts - 1] = (s.dist[r.attempts - 1] ?? 0) + 1;
  } else s.streak = 0;
  s.lastDay = day;
  save(`puzzle-stats:${id}`, s);
  return s;
}

// ---------- Progreso del reto del día (para no perderlo al cerrar la app) ----------

interface Saved<T> {
  day: string;
  data: T;
  result?: PuzzleResult;
}

export function loadDaily<T>(id: PuzzleId): Saved<T> | null {
  const s = load<Saved<T> | null>(`puzzle-day:${id}`, null);
  return s && s.day === todayKey() ? s : null;
}

export function saveDaily<T>(id: PuzzleId, data: T, result?: PuzzleResult): void {
  save(`puzzle-day:${id}`, { day: todayKey(), data, result });
}

/** ¿Ya has terminado el reto de hoy? */
export function dailyDone(id: PuzzleId): boolean {
  return !!loadDaily(id)?.result;
}
