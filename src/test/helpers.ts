// Utilidades compartidas por los tests.
import raw from '../data/urbano.json';
import type { Question, RoundResult, Summary, Track } from '../game/types';
import type { UrbanoDB } from '../game/urbano';

/** La base de datos real del urbano, montada como la monta loadUrbano(). */
export function realDb(): UrbanoDB {
  const r = raw as unknown as Omit<UrbanoDB, 'artistById' | 'albumById'>;
  return { ...r, artistById: new Map(r.artists.map((a) => [a.id, a])), albumById: new Map(r.albums.map((a) => [a.id, a])) };
}

let nextId = 1;

export function track(over: Partial<Track> = {}): Track {
  const id = over.id ?? nextId++;
  return {
    id,
    title: `Canción ${id}`,
    artistId: 1,
    artistName: 'Artista',
    albumId: 100,
    albumTitle: 'Disco',
    cover: '',
    coverSmall: '',
    preview: `https://cdn.example/${id}.mp3`,
    link: `https://deezer.example/${id}`,
    rank: 1000,
    duration: 180,
    ...over,
  };
}

export function cancion(t: Track = track()): Question {
  return { kind: 'cancion', track: t, options: [{ label: t.title }, { label: 'B' }, { label: 'C' }, { label: 'D' }], answer: 0, accept: [t.title] };
}

export function summary(over: Partial<Summary> = {}, rounds = 10, correct = 7): Summary {
  const results: RoundResult[] = Array.from({ length: rounds }, (_, i) => ({
    question: cancion(track()),
    outcome: { correct: i < correct, typed: false, factor: 1, short: i < correct ? '✓' : '✗', reveal: '' },
    points: i < correct ? 1000 : 0,
  }));
  return {
    mode: 'cancion',
    filterLabel: 'Reggaetón',
    results,
    score: results.reduce((s, r) => s + r.points, 0),
    correct,
    bestStreak: correct,
    ...over,
  };
}
