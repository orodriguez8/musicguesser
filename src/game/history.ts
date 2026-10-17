import { load, save } from '../lib/storage';

/** Canciones recientes que intentamos no repetir entre partidas. */
const MAX_TRACKS = 400;
/** Artistas que fueron respuesta hace poco: se dejan descansar al elegir los de la partida. */
const MAX_ARTISTS = 60;

interface Recent {
  tracks: number[];
  artists: number[];
}

/** Cuánto hace que salió cada id (0 = en la última partida). Lo que no está, no ha salido. */
export type Recency = ReadonlyMap<number, number>;

const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number') : []);
const toRecency = (ids: number[]): Recency => new Map(ids.map((id, i) => [id, i]));

function read(): Recent {
  const r = load<Partial<Recent>>('recent', {});
  return { tracks: nums(r.tracks), artists: nums(r.artists) };
}

export function recentTracks(): Recency {
  return toRecency(read().tracks);
}

export function recentArtists(): Recency {
  return toRecency(read().artists);
}

/** Apunta lo que ha salido en una partida (lo más nuevo, al principio). */
export function remember(trackIds: number[], artistIds: number[]): void {
  const r = read();
  const tracks = [...new Set([...trackIds, ...r.tracks])].slice(0, MAX_TRACKS);
  const artists = [...new Set([...artistIds, ...r.artists])].slice(0, MAX_ARTISTS);
  save('recent', { tracks, artists });
}

/**
 * Pone primero lo que no ha salido últimamente y después lo que salió hace más tiempo,
 * así todo va rotando. Lo que empata conserva el orden de entrada.
 */
export function freshFirst<T>(items: T[], recent: Recency, id: (x: T) => number): T[] {
  const ago = (x: T) => recent.get(id(x)) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => ago(b) - ago(a));
}

// ---------- Discos ----------

/** Un disco no vuelve a salir hasta que hayan pasado otros 10... */
const ALBUM_GAP = 10;
/** ...ni otro del mismo artista hasta que hayan salido discos de otros 3. */
const ARTIST_GAP = 3;

export type AlbumGame = 'albumquiz' | 'albumlink' | 'portada';

interface AlbumSeen {
  id: number;
  a: number;
}

function readAlbums(game: AlbumGame): AlbumSeen[] {
  const list = load<unknown>(`recent-albums:${game}`, []);
  return Array.isArray(list)
    ? list.filter((x): x is AlbumSeen => typeof x?.id === 'number' && typeof x?.a === 'number')
    : [];
}

/** Apunta los discos que han salido, en el orden en que salieron. */
export function rememberAlbums(game: AlbumGame, played: AlbumSeen[]): void {
  if (!played.length) return;
  const ids = new Set(played.map((x) => x.id));
  const list = [...[...played].reverse(), ...readAlbums(game).filter((x) => !ids.has(x.id))];
  save(`recent-albums:${game}`, list.slice(0, ALBUM_GAP * 3));
}

/**
 * Elige hasta n discos, en orden: ninguno de los 10 últimos y nunca el mismo artista que
 * en alguno de los 3 discos anteriores (contando los de partidas pasadas). Si con un filtro
 * pequeño no hay bastantes, primero se relaja lo del artista y, solo después, lo del disco.
 */
export function pickFreshAlbums<T>(game: AlbumGame, items: T[], n: number, album: (x: T) => AlbumSeen): T[] {
  const past = readAlbums(game);
  const blocked = new Set(past.slice(0, ALBUM_GAP).map((x) => x.id));
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n) {
    const lastArtists = new Set([...out.map((x) => album(x).a).reverse(), ...past.map((x) => x.a)].slice(0, ARTIST_GAP));
    const ok = (x: T, rules: number) => {
      const al = album(x);
      if (used.has(al.id)) return false;
      if (rules >= 1 && blocked.has(al.id)) return false;
      if (rules >= 2 && lastArtists.has(al.a)) return false;
      return true;
    };
    let next: T | undefined;
    for (const rules of [2, 1, 0]) if ((next = items.find((x) => ok(x, rules)))) break;
    if (next === undefined) break;
    out.push(next);
    used.add(album(next).id);
  }
  return out;
}

// ---------- Puzles ----------

/** Lo que ha salido en los puzles libres de artista o de canciones (Clásico, Wordle, Pirámide). */
export function recentPuzzle(game: string): Recency {
  return toRecency(nums(load<unknown>(`recent-puzzle:${game}`, [])));
}

export function rememberPuzzle(game: string, ids: number[], keep = 40): void {
  const old = nums(load<unknown>(`recent-puzzle:${game}`, []));
  save(`recent-puzzle:${game}`, [...new Set([...ids, ...old])].slice(0, keep));
}
