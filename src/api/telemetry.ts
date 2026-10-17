// Estadísticas anónimas de uso (qué se juega y cuánto) y preguntas que los jugadores reportan.
// Se guardan en Supabase con el id aleatorio del dispositivo y, si hay sesión, el usuario.
// Si algo falla, no pasa nada: la app nunca espera por esto.
import { deviceId } from '../lib/device';
import { reportError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { rankingGenre, rankingLevel } from './ranking';
import type { Filter, PlayMode, Summary } from '../game/types';
import { isUrbanoFilter } from '../game/urbano';
import type { PuzzleId, PuzzleResult } from '../game/daily';

export type PlayKind = 'game' | 'challenge' | 'room' | 'puzzle';

export interface PlayRow {
  kind: PlayKind;
  mode: string;
  genre?: string | null;
  difficulty?: string | null;
  era?: string | null;
  rounds?: number | null;
  correct?: number | null;
  score?: number | null;
  won?: boolean | null;
  daily?: boolean | null;
  challenge_id?: string | null;
}

function insert(table: 'plays' | 'question_reports', row: Record<string, unknown>): Promise<boolean> {
  if (!supabase) return Promise.resolve(false);
  return Promise.resolve(supabase.from(table).insert({ device: deviceId(), ...row })).then(
    ({ error }) => {
      // La tabla aún no existe (falta ejecutar el SQL nuevo): no es un fallo de la app
      if (error && !/relation .* does not exist|schema cache/i.test(error.message)) reportError(error, `telemetria:${table}`);
      return !error;
    },
    () => false,
  );
}

export function logPlay(row: PlayRow): void {
  void insert('plays', { ...row });
}

/** Partida normal, de reto o de sala terminada. */
export function logGame(kind: Exclude<PlayKind, 'puzzle'>, summary: Summary, filter: Filter | null, challengeId?: string): void {
  const urbano = filter && isUrbanoFilter(filter);
  logPlay({
    kind,
    mode: summary.mode,
    genre: filter ? (rankingGenre(summary.mode as PlayMode, filter) ?? 'artista') : null,
    difficulty: filter && urbano ? rankingLevel(filter) : null,
    era: urbano && filter.kind === 'genres' ? (filter.era ?? null) : null,
    rounds: summary.results.length,
    correct: summary.correct,
    score: summary.score,
    challenge_id: challengeId ?? null,
  });
}

export function logPuzzle(id: PuzzleId, r: PuzzleResult, daily: boolean, level?: string): void {
  logPlay({ kind: 'puzzle', mode: id, won: r.won, daily, difficulty: daily ? null : (level ?? null), correct: r.attempts });
}

export type ReportReason = 'cancion' | 'artista' | 'anio' | 'portada' | 'audio' | 'disco' | 'opciones' | 'otro';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'cancion', label: 'La canción no es la que dice' },
  { id: 'artista', label: 'El artista está mal' },
  { id: 'anio', label: 'El año está mal' },
  { id: 'portada', label: 'La portada o el disco no corresponden' },
  { id: 'audio', label: 'El audio no suena o es otro' },
  { id: 'opciones', label: 'Las opciones confunden (dos valen)' },
  { id: 'disco', label: 'Al disco le faltan o sobran canciones' },
  { id: 'otro', label: 'Otra cosa' },
];

export interface ReportInput {
  reason: ReportReason;
  comment?: string;
  mode?: string;
  trackId?: number;
  albumId?: number;
  title?: string;
  artist?: string;
  album?: string;
}

export function reportQuestion(r: ReportInput): Promise<boolean> {
  return insert('question_reports', {
    reason: r.reason,
    comment: r.comment?.trim().slice(0, 500) || null,
    mode: r.mode ?? null,
    track_id: r.trackId ?? null,
    album_id: r.albumId ?? null,
    title: r.title?.slice(0, 200) ?? null,
    artist: r.artist?.slice(0, 200) ?? null,
    album: r.album?.slice(0, 200) ?? null,
  });
}
