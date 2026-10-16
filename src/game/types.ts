export type Family = 'urbano' | 'metal' | 'otros';

export interface ArtistRef {
  id: number;
  name: string;
  picture: string;
  genreId?: string;
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

export type Filter = { kind: 'genres'; genres: string[] } | { kind: 'artist'; artist: ArtistRef };

export type ModeId =
  | 'cancion'
  | 'artista'
  | 'completa'
  | 'misteriosa'
  | 'anio'
  | 'portada'
  | 'intruso'
  | 'subgenero';

export type PlayMode = ModeId | 'mezcla';

export interface Option {
  label: string;
  sub?: string;
}

export type Question =
  | { kind: 'cancion'; track: Track; options: Option[]; answer: number; accept: string[] }
  | { kind: 'artista'; track: Track; options: Option[]; answer: number; accept: string[] }
  | { kind: 'subgenero'; track: Track; options: Option[]; answer: number }
  | { kind: 'completa'; track: Track; context: string[]; options: Option[]; answer: number }
  | { kind: 'misteriosa'; track: Track; lines: string[]; options: Option[]; answer: number; accept: string[] }
  | { kind: 'anio'; track: Track; year: number }
  | { kind: 'portada'; track: Track; options: Option[]; answer: number; accept: string[] }
  | { kind: 'intruso'; host: { name: string; picture?: string }; clips: Track[]; answer: number };

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
