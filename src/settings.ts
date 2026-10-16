import { load, save } from './lib/storage';
import { MAX_ARTISTS, type ArtistRef, type Filter, type PlayMode, type Summary } from './game/types';
import { grade } from './game/scoring';
import { genreById } from './game/catalog';
import { ERAS, LEVELS } from './game/urbano';

export interface Settings {
  volume: number;
  /** Mostrar las 4 opciones desde el principio (se pierde el ×1,5 de escribir). */
  showOptions: boolean;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, showOptions: false };

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings) => save('settings', s);

export function loadFilter(): Filter {
  const f = load<Filter & { artist?: ArtistRef }>('filter', { kind: 'genres', genres: [] });
  // Datos guardados por versiones anteriores o manipulados: si no cuadran, filtro por defecto
  const valid = (a: ArtistRef | undefined): a is ArtistRef => typeof a?.id === 'number' && typeof a.name === 'string';
  if (f?.kind === 'artist') {
    // Antes solo se podía elegir un artista ({ artist }); ahora es una lista ({ artists })
    const artists = (Array.isArray(f.artists) ? f.artists : [f.artist]).filter(valid).slice(0, MAX_ARTISTS);
    if (artists.length) return { kind: 'artist', artists };
  }
  if (f?.kind === 'genres' && Array.isArray(f.genres)) {
    const era = ERAS.some((e) => e.id === f.era) ? f.era : undefined;
    const level = LEVELS.some((l) => l.id === f.level) ? f.level : undefined;
    return { kind: 'genres', genres: f.genres.filter((g) => genreById.has(g)), era, level };
  }
  return { kind: 'genres', genres: [] };
}
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
