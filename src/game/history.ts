import { load, save } from '../lib/storage';

/** Canciones recientes que intentamos no repetir entre partidas. */
const MAX_TRACKS = 150;
/** Artistas que fueron respuesta hace poco: se dejan descansar al elegir los de la partida. */
const MAX_ARTISTS = 40;

interface Recent {
  tracks: number[];
  artists: number[];
}

function read(): Recent {
  const r = load<Partial<Recent>>('recent', {});
  const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number') : []);
  return { tracks: nums(r.tracks), artists: nums(r.artists) };
}

export function recentTracks(): Set<number> {
  return new Set(read().tracks);
}

export function recentArtists(): Set<number> {
  return new Set(read().artists);
}

/** Apunta lo que ha salido en una partida (lo más nuevo, al principio). */
export function remember(trackIds: number[], artistIds: number[]): void {
  const r = read();
  const tracks = [...new Set([...trackIds, ...r.tracks])].slice(0, MAX_TRACKS);
  const artists = [...new Set([...artistIds, ...r.artists])].slice(0, MAX_ARTISTS);
  save('recent', { tracks, artists });
}

/** Pone primero lo que no ha salido últimamente, sin cambiar el orden dentro de cada grupo. */
export function freshFirst<T>(items: T[], isRecent: (x: T) => boolean): T[] {
  return [...items.filter((x) => !isRecent(x)), ...items.filter(isRecent)];
}
