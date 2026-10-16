// Base de datos del urbano (reggaetón y trap latino), generada con `npm run urbano`.
// Se carga solo cuando hace falta: pesa bastante más que el resto del catálogo.
import type { ArtistKind, Filter } from './types';

export const URBANO_GENRES = new Set(['reggaeton', 'trap-es']);

/** ¿Se juega solo con géneros urbanos? (Solo entonces hay épocas y dificultad.) */
export function isUrbanoFilter(f: Filter): f is Extract<Filter, { kind: 'genres' }> {
  return f.kind === 'genres' && f.genres.length > 0 && f.genres.every((g) => URBANO_GENRES.has(g));
}

export interface UArtist {
  id: number;
  /** nombre */
  n: string;
  /** md5 de la foto en Deezer */
  p: string;
  /** género del catálogo */
  g: string;
  /** fans en Deezer */
  f: number;
  ty?: ArtistKind;
  /** país (ISO, p. ej. PR, CO, ES) */
  c?: string;
  /** male / female */
  s?: string;
  /** año de nacimiento o de formación */
  b?: number;
  /** año de debut */
  d: number | null;
  /** nº de discos de estudio */
  na: number;
}

export interface UAlbum {
  id: number;
  a: number;
  t: string;
  y: number | null;
  k: 'album' | 'ep';
  /** md5 de la portada */
  m: string;
  f: number;
  /** canciones, en orden */
  tr: string[];
  /** artistas invitados */
  ft: string[];
}

export interface UTrack {
  id: number;
  a: number;
  t: string;
  y: number;
  /** popularidad en Deezer */
  r: number;
  al?: number;
  /** IDs de los colaboradores */
  ft?: number[];
  /** nombres de colaboradores sacados del título, si no hay IDs */
  fn?: string[];
}

export interface UrbanoDB {
  artists: UArtist[];
  albums: UAlbum[];
  tracks: UTrack[];
  people: Record<string, string>;
  artistById: Map<number, UArtist>;
  albumById: Map<number, UAlbum>;
}

let loading: Promise<UrbanoDB> | null = null;

export function loadUrbano(): Promise<UrbanoDB> {
  loading ??= import('../data/urbano.json')
    .then((m) => {
      const raw = m.default as unknown as Omit<UrbanoDB, 'artistById' | 'albumById'>;
      return {
        ...raw,
        artistById: new Map(raw.artists.map((a) => [a.id, a])),
        albumById: new Map(raw.albums.map((a) => [a.id, a])),
      };
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

// ---------- Épocas ----------

export type Era = 'vieja' | 'intermedia' | 'nueva';

export const ERAS: { id: Era; label: string; from: number; to: number }[] = [
  { id: 'vieja', label: 'Vieja escuela', from: 0, to: 2012 },
  { id: 'intermedia', label: 'Intermedia', from: 2013, to: 2020 },
  { id: 'nueva', label: 'Nueva', from: 2021, to: 9999 },
];

export function eraOf(year: number): Era {
  return ERAS.find((e) => year >= e.from && year <= e.to)?.id ?? 'nueva';
}

// ---------- Dificultad ----------

export type Level = 'facil' | 'normal' | 'dificil';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'facil', label: 'Fácil', desc: 'Los temazos que conoce todo el mundo' },
  { id: 'normal', label: 'Normal', desc: 'De todo un poco' },
  { id: 'dificil', label: 'Difícil', desc: 'Temas menos conocidos, artistas de culto y clásicos' },
];

// ---------- Imágenes ----------

export const coverUrl = (md5: string, size = 500) =>
  `https://cdn-images.dzcdn.net/images/cover/${md5}/${size}x${size}-000000-80-0-0.jpg`;
export const artistPicUrl = (md5: string, size = 250) =>
  `https://cdn-images.dzcdn.net/images/artist/${md5}/${size}x${size}-000000-80-0-0.jpg`;

/** Nombre de un artista o colaborador por su ID de Deezer. */
export function personName(db: UrbanoDB, id: number): string | undefined {
  return db.artistById.get(id)?.n ?? db.people[id];
}
