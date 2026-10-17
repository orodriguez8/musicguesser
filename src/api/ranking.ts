import { isNetworkError, reportError } from '../lib/errors';
import { load, save } from '../lib/storage';
import { supabase } from '../lib/supabase';
import type { Filter, PlayMode, Summary } from '../game/types';
import { genreById } from '../game/catalog';
import { isUrbanoFilter, type Level } from '../game/urbano';

export type Period = 'semana' | 'siempre';

export interface BoardRow {
  pos: number;
  user_id: string;
  username: string;
  avatar: string;
  score: number;
  correct: number;
  played_at: string;
}

/**
 * Para qué ranking de género cuenta una partida:
 * - filtrada por un solo género → ese género (y también el general)
 * - varios géneros o todos → solo el general ('mix')
 * - un artista concreto → no puntúa (sería demasiado fácil con tu artista favorito)
 */
export function rankingGenre(mode: PlayMode, filter: Filter): string | null {
  if (filter.kind === 'artist') return null;
  if (mode !== 'subgenero' && filter.genres.length === 1 && genreById.has(filter.genres[0])) return filter.genres[0];
  return 'mix';
}

/** Dificultad con la que puntúa una partida (fuera del urbano, siempre Normal). */
export function rankingLevel(filter: Filter): Level {
  return isUrbanoFilter(filter) ? (filter.level ?? 'normal') : 'normal';
}

// Normal no se envía: así funciona también con la versión del servidor anterior a las dificultades
const levelArg = (level: Level) => (level === 'normal' ? {} : { p_difficulty: level });

export async function fetchLeaderboard(mode: PlayMode, genre: string, period: Period, level: Level = 'normal'): Promise<BoardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('leaderboard', { p_mode: mode, p_genre: genre, p_period: period, p_limit: 50, ...levelArg(level) });
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[];
}

export async function fetchMyRank(
  mode: PlayMode,
  genre: string,
  period: Period,
  level: Level = 'normal',
): Promise<{ pos: number; score: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_rank', { p_mode: mode, p_genre: genre, p_period: period, ...levelArg(level) });
  if (error || !data?.length) return null;
  return data[0] as { pos: number; score: number };
}

export type SubmitResult =
  | { ok: true; weekPos: number | null }
  | { ok: false; reason: 'not_eligible' | 'not_logged' | 'error' | 'queued'; message: string };

const SUBMIT_ERRORS: Record<string, string> = {
  not_authenticated: 'Tu sesión ha caducado. Vuelve a entrar para guardar la partida.',
  incomplete_game: 'Solo puntúan las partidas de 10 pruebas.',
  invalid_score: 'Esta puntuación no es válida.',
  too_fast: 'Has enviado otra partida hace un momento. Espera unos segundos.',
  // El servidor aún no tiene el ranking por dificultad (falta ejecutar el SQL nuevo)
  'Could not find the function': 'El ranking por dificultad todavía no está activado.',
  p_difficulty: 'El ranking por dificultad todavía no está activado.',
};

export async function submitScore(summary: Summary, filter: Filter): Promise<SubmitResult> {
  if (!supabase) return { ok: false, reason: 'error', message: 'El ranking no está disponible.' };
  const genre = rankingGenre(summary.mode, filter);
  const level = rankingLevel(filter);
  if (!genre) return { ok: false, reason: 'not_eligible', message: 'Las partidas con artistas concretos no puntúan en el ranking.' };
  if (summary.results.length !== 10) return { ok: false, reason: 'not_eligible', message: SUBMIT_ERRORS.incomplete_game };
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return { ok: false, reason: 'not_logged', message: 'Entra con tu cuenta para aparecer en el ranking.' };

  const entry: PendingScore = {
    user: session.session.user.id,
    mode: summary.mode,
    genre,
    score: summary.score,
    correct: summary.correct,
    rounds: summary.results.length,
    level,
    at: Date.now(),
  };
  const error = await sendScore(entry);
  if (error) {
    // Sin conexión: se guarda y se sube sola cuando vuelva la red
    if (isOffline(error)) {
      queue([...readPending(), entry]);
      return { ok: false, reason: 'queued', message: 'Sin conexión: la subiremos al ranking en cuanto vuelvas a tener internet.' };
    }
    const key = Object.keys(SUBMIT_ERRORS).find((k) => error.includes(k));
    if (!key) reportError(new Error(error), 'ranking:submit', { mode: summary.mode, genre, level });
    return { ok: false, reason: 'error', message: key ? SUBMIT_ERRORS[key] : 'No se ha podido guardar la partida en el ranking.' };
  }
  const mine = await fetchMyRank(summary.mode, 'todos', 'semana', level).catch(() => null);
  return { ok: true, weekPos: mine?.pos ?? null };
}

// ---------- Partidas pendientes de subir (sin conexión) ----------

interface PendingScore {
  user: string;
  mode: PlayMode;
  genre: string;
  score: number;
  correct: number;
  rounds: number;
  level: Level;
  at: number;
}

/** Una partida guardada sin conexión caduca a los 7 días (el ranking semanal ya habría cerrado). */
const PENDING_TTL = 7 * 864e5;
/** El servidor pide 25 s entre partidas: al vaciar la cola, dejamos ese margen. */
const PENDING_GAP_MS = 26_000;

const isOffline = (message: string) => (typeof navigator !== 'undefined' && navigator.onLine === false) || isNetworkError(message);

function readPending(): PendingScore[] {
  const list = load<unknown>('pending-scores', []);
  return Array.isArray(list)
    ? list.filter((x): x is PendingScore => !!x && typeof x.user === 'string' && typeof x.score === 'number' && Date.now() - x.at < PENDING_TTL)
    : [];
}

const queue = (list: PendingScore[]) => save('pending-scores', list.slice(-20));

export const pendingScores = () => readPending().length;

/** Sube una partida; devuelve el mensaje de error o null si ha ido bien. */
async function sendScore(p: PendingScore): Promise<string | null> {
  if (!supabase) return 'El ranking no está disponible.';
  try {
    const { error } = await supabase.rpc('submit_score', {
      p_mode: p.mode,
      p_genre: p.genre,
      p_score: p.score,
      p_correct: p.correct,
      p_rounds: p.rounds,
      ...levelArg(p.level),
    });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

let flushing = false;

/** Sube lo que quedó pendiente (al abrir la app, al entrar o al volver la conexión). */
export async function flushPendingScores(): Promise<number> {
  if (!supabase || flushing) return 0;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return 0;
  flushing = true;
  let sent = 0;
  try {
    const wait = () => new Promise((r) => setTimeout(r, PENDING_GAP_MS));
    for (let tries = 0; tries < 40; tries++) {
      const next = readPending().find((p) => p.user === uid);
      if (!next) break;
      if (sent > 0) await wait();
      const error = await sendScore(next);
      if (error && isOffline(error)) break;
      // Acabas de subir otra: se espera y se reintenta la misma
      if (error?.includes('too_fast')) {
        await wait();
        continue;
      }
      // Enviada, o rechazada por algo que no se arregla reintentando: fuera de la cola
      queue(readPending().filter((p) => !(p.user === next.user && p.at === next.at)));
      if (!error) sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}
