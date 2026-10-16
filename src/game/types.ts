import type { Era, Level } from './urbano';

export type Family = 'urbano' | 'metal' | 'otros';

/** Grupo o solista (según MusicBrainz). */
export type ArtistKind = 'group' | 'person';

export interface ArtistRef {
  id: number;
  name: string;
  picture: string;
  genreId?: string;
  type?: ArtistKind;
}

export interface Track {
  id: number;
  title: string;
  artistId: number;
  artistName: string;
  albumId: number;
  albumTitle: string;
  cover: string;
  coverSmall: string;
  preview: string;
  link: string;
  rank: number;
  duration: number;
  genreId?: string;
}

/**
 * Jugar con géneros o con uno o varios artistas concretos (hasta MAX_ARTISTS).
 * Época y dificultad solo existen con géneros urbanos.
 */
export type Filter =
  | { kind: 'genres'; genres: string[]; era?: Era; level?: Level }
  | { kind: 'artist'; artists: ArtistRef[] };

export const MAX_ARTISTS = 5;

export type ModeId =
  | 'cancion'
  | 'artista'
  | 'completa'
  | 'misteriosa'
  | 'anio'
  | 'portada'
  | 'intruso'
  | 'subgenero'
  | 'infiltrado'
  | 'albumlink';

export type PlayMode = ModeId | 'mezcla';

export interface Option {
  label: string;
  sub?: string;
}

export type Question =
  | { kind: 'cancion'; track: Track; options: Option[]; answer: number; accept: string[]; suggest?: string[] }
  | { kind: 'artista'; track: Track; options: Option[]; answer: number; accept: string[]; artistType?: ArtistKind; suggest?: string[] }
  | { kind: 'subgenero'; track: Track; options: Option[]; answer: number }
  | { kind: 'completa'; track: Track; context: string[]; options: Option[]; answer: number }
  | { kind: 'misteriosa'; track: Track; lines: string[]; options: Option[]; answer: number; accept: string[]; suggest?: string[] }
  | { kind: 'anio'; track: Track; year: number }
  | { kind: 'portada'; track: Track; options: Option[]; answer: number; accept: string[]; suggest?: string[] }
  | { kind: 'intruso'; host: { name: string; picture?: string }; clips: Track[]; answer: number }
  /** 4 artistas y una condición que cumplen todos menos uno. track = una canción del infiltrado. */
  | { kind: 'infiltrado'; track: Track; rule: string; artists: InfiltradoArtist[]; answer: number; why: string }
  /** Adivina el disco por sus colaboraciones. track = una canción de ese disco. */
  | {
      kind: 'albumlink';
      track: Track;
      album: { title: string; artist: string; year: number | null; cover: string };
      feats: string[];
      options: Option[];
      answer: number;
      accept: string[];
      suggest?: string[];
    };

export interface InfiltradoArtist {
  name: string;
  picture: string;
  /** Dato que se enseña al resolver ("Colombia", "debutó en 2016"…) */
  detail: string;
}

export interface Outcome {
  correct: boolean;
  /** 0–1: penalización por segundos escuchados, nitidez, tiempo… */
  factor: number;
  typed: boolean;
  /** Texto corto para la tira de 10 pruebas ("2s", "±3", "—") */
  short: string;
  /** Respuesta correcta para mostrarla si fallas */
  reveal: string;
  seconds?: number;
  yearDiff?: number;
  /** Solo Máquina del tiempo: puntos base según la distancia */
  basePoints?: number;
}

export interface RoundResult {
  question: Question;
  outcome: Outcome;
  points: number;
}

export interface Summary {
  mode: PlayMode;
  filterLabel: string;
  results: RoundResult[];
  score: number;
  correct: number;
  bestStreak: number;
}

export interface Progress {
  label: string;
  done?: number;
  total?: number;
}
