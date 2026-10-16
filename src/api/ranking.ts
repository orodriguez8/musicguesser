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
  | { ok: false; reason: 'not_eligible' | 'not_logged' | 'error'; message: string };

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

  const { error } = await supabase.rpc('submit_score', {
    p_mode: summary.mode,
    p_genre: genre,
    p_score: summary.score,
    p_correct: summary.correct,
    p_rounds: summary.results.length,
    ...levelArg(level),
  });
  if (error) {
    const key = Object.keys(SUBMIT_ERRORS).find((k) => error.message.includes(k));
    return { ok: false, reason: 'error', message: key ? SUBMIT_ERRORS[key] : 'No se ha podido guardar la partida en el ranking.' };
  }
  const mine = await fetchMyRank(summary.mode, 'todos', 'semana', level).catch(() => null);
  return { ok: true, weekPos: mine?.pos ?? null };
}
