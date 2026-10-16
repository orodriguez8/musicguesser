// Elección del reto de cada puzle. Con la semilla del día sale el mismo para todo el mundo.
import { normText } from './text';
import { rngPick, rngShuffle } from './daily';
import { coverUrl, artistPicUrl, type Level, type UAlbum, type UArtist, type UrbanoDB } from './urbano';

export interface PuzzleOpts {
  rng: () => number;
  /** Géneros urbanos en juego (el reto del día usa los dos) */
  genres: string[];
  level: Level;
}

const DAILY_GENRES = ['reggaeton', 'trap-es'];
export const dailyOpts = (rng: () => number): PuzzleOpts => ({ rng, genres: DAILY_GENRES, level: 'normal' });

/** Los N artistas con más fans: en Fácil solo los muy conocidos. */
function famousArtists(db: UrbanoDB, o: PuzzleOpts): UArtist[] {
  const list = db.artists.filter((a) => o.genres.includes(a.g)).sort((x, y) => y.f - x.f);
  const n = o.level === 'facil' ? 25 : o.level === 'normal' ? 55 : list.length;
  return list.slice(0, n);
}

// ---------- Clásico ----------

export const CLASICO_TRIES = 8;

export function pickClasico(db: UrbanoDB, o: PuzzleOpts): UArtist {
  return rngPick(famousArtists(db, o).filter((a) => a.d && a.c), o.rng);
}

/** ok = igual; up/down = el secreto es mayor/menor; near-* = y además está cerca. */
export type Hint = 'ok' | 'up' | 'down' | 'near-up' | 'near-down' | 'no';

export interface ClasicoCell {
  label: string;
  value: string;
  hint: Hint;
}

const COUNTRY_SHORT: Record<string, string> = {
  PR: 'Puerto Rico',
  CO: 'Colombia',
  ES: 'España',
  AR: 'Argentina',
  PA: 'Panamá',
  VE: 'Venezuela',
  DO: 'R. Dominicana',
  CU: 'Cuba',
  CL: 'Chile',
  US: 'EE. UU.',
  MX: 'México',
  MA: 'Marruecos',
};

const GENRE_SHORT: Record<string, string> = { reggaeton: 'Reggaetón', 'trap-es': 'Trap/rap' };

function numHint(guess: number | null | undefined, target: number | null | undefined, near: number): Hint {
  if (guess == null || target == null) return 'no';
  if (guess === target) return 'ok';
  const dir = target > guess ? 'up' : 'down';
  return Math.abs(guess - target) <= near ? `near-${dir}` : dir;
}

function fansLabel(f: number): string {
  if (f >= 1e6) return `${(f / 1e6).toFixed(1).replace('.', ',')} M`;
  if (f >= 1e3) return `${Math.round(f / 1e3)} mil`;
  return String(f);
}

/** Fila de pistas al probar un artista (verde = igual, flechas = el secreto es mayor/menor). */
export function compareArtists(g: UArtist, t: UArtist): ClasicoCell[] {
  const fansRatio = g.f && t.f ? Math.max(g.f, t.f) / Math.min(g.f, t.f) : 99;
  return [
    { label: 'País', value: COUNTRY_SHORT[g.c ?? ''] ?? '¿?', hint: g.c && g.c === t.c ? 'ok' : 'no' },
    { label: 'Género', value: GENRE_SHORT[g.g] ?? g.g, hint: g.g === t.g ? 'ok' : 'no' },
    { label: 'Tipo', value: g.ty === 'group' ? 'Grupo' : 'Solista', hint: (g.ty ?? 'person') === (t.ty ?? 'person') ? 'ok' : 'no' },
    { label: 'Debut', value: String(g.d ?? '¿?'), hint: numHint(g.d, t.d, 2) },
    {
      label: 'Fans',
      value: fansLabel(g.f),
      hint: fansRatio < 1.05 ? 'ok' : t.f > g.f ? (fansRatio < 1.6 ? 'near-up' : 'up') : fansRatio < 1.6 ? 'near-down' : 'down',
    },
    { label: 'Discos', value: String(g.na), hint: numHint(g.na, t.na, 1) },
  ];
}

// ---------- Wordle ----------

export const WORDLE_TRIES = 6;

/** "Bad Bunny" → "BADBUNNY" (sin espacios, tildes ni símbolos). */
export const wordleWord = (name: string) => normText(name).replace(/[^a-z]/g, '').toUpperCase();

export function pickWordle(db: UrbanoDB, o: PuzzleOpts): UArtist {
  const ok = famousArtists(db, o).filter((a) => {
    const w = wordleWord(a.n);
    return w.length >= 4 && w.length <= 9 && /^[a-z]/i.test(a.n);
  });
  return rngPick(ok, o.rng);
}

export type LetterState = 'ok' | 'near' | 'no';

/** Colores de Wordle, contando bien las letras repetidas. */
export function scoreWord(guess: string, target: string): LetterState[] {
  const res: LetterState[] = Array.from({ length: guess.length }, () => 'no');
  const left = new Map<string, number>();
  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) res[i] = 'ok';
    else left.set(target[i], (left.get(target[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (res[i] === 'ok') continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) {
      res[i] = 'near';
      left.set(guess[i], n - 1);
    }
  }
  return res;
}

// ---------- Album Quiz ----------

export function pickAlbumQuiz(db: UrbanoDB, o: PuzzleOpts): UAlbum {
  const famous = new Set(famousArtists(db, o).map((a) => a.id));
  const albums = db.albums
    .filter((al) => al.k === 'album' && famous.has(al.a) && al.tr.length >= 7 && al.tr.length <= 22)
    .sort((x, y) => y.f - x.f);
  const n = o.level === 'facil' ? 30 : o.level === 'normal' ? 90 : albums.length;
  return rngPick(albums.slice(0, Math.max(n, 1)), o.rng);
}

// ---------- Pirámide ----------

export interface PyramidSong {
  id: number;
  title: string;
  artist: string;
  cover: string;
  rank: number;
  year: number;
}

export const PYRAMID_SIZE = 5;

/** Cinco canciones conocidas, de artistas distintos y con popularidades bien separadas. */
export function pickPiramide(db: UrbanoDB, o: PuzzleOpts): PyramidSong[] {
  const pool = db.tracks
    .filter((t) => o.genres.includes(db.artistById.get(t.a)?.g ?? ''))
    .sort((x, y) => y.r - x.r)
    .slice(0, o.level === 'facil' ? 400 : o.level === 'normal' ? 1200 : 3000);
  for (let attempt = 0; attempt < 200; attempt++) {
    const pick = rngShuffle(pool, o.rng).slice(0, 40);
    const chosen: typeof pool = [];
    for (const t of pick.sort((x, y) => y.r - x.r)) {
      const last = chosen[chosen.length - 1];
      if (chosen.some((c) => c.a === t.a)) continue;
      // Al menos un 12 % de diferencia con la anterior: si no, sería lotería
      if (last && t.r > last.r / 1.12) continue;
      chosen.push(t);
      if (chosen.length === PYRAMID_SIZE) break;
    }
    if (chosen.length === PYRAMID_SIZE) {
      return rngShuffle(chosen, o.rng).map((t) => {
        const al = t.al ? db.albumById.get(t.al) : undefined;
        const a = db.artistById.get(t.a)!;
        return { id: t.id, title: t.t, artist: a.n, cover: al ? coverUrl(al.m, 250) : artistPicUrl(a.p), rank: t.r, year: t.y };
      });
    }
  }
  return [];
}
