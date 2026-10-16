import { load, save } from './lib/storage';
import type { Filter, PlayMode, Summary } from './game/types';
import { grade } from './game/scoring';

export interface Settings {
  volume: number;
  /** Mostrar las 4 opciones desde el principio (se pierde el ×2 de escribir). */
  showOptions: boolean;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, showOptions: false };

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings) => save('settings', s);

export const loadFilter = (): Filter => load<Filter>('filter', { kind: 'genres', genres: [] });
export const saveFilter = (f: Filter) => save('filter', f);

export interface RecordEntry {
  score: number;
  grade: string;
  label: string;
  date: string;
}

export type Records = Partial<Record<PlayMode, RecordEntry>>;

export const loadRecords = (): Records => load<Records>('records', {});

/** Guarda la partida si es récord del modo. Devuelve si lo ha sido. */
export function recordGame(s: Summary): { records: Records; isRecord: boolean } {
  const records = loadRecords();
  const prev = records[s.mode];
  const isRecord = !prev || s.score > prev.score;
  if (isRecord) {
    records[s.mode] = { score: s.score, grade: grade(s.correct).letter, label: s.filterLabel, date: new Date().toISOString() };
    save('records', records);
  }
  return { records, isRecord: isRecord && s.score > 0 };
}

export function clearRecords(): Records {
  save('records', {});
  return {};
}
