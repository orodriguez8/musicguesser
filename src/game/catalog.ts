import data from '../data/catalog.json';
import type { ArtistRef, Family, Filter } from './types';

export interface Genre {
  id: string;
  label: string;
  family: Family;
  artists: ArtistRef[];
}

export const GENRES: Genre[] = data.genres.map((g) => ({
  id: g.id,
  label: g.label,
  family: g.family as Family,
  artists: g.artists.map((a) => ({ id: a.id, name: a.name, picture: a.picture, genreId: g.id })),
}));

export const genreById = new Map(GENRES.map((g) => [g.id, g]));

export function selectedGenres(ids: string[]): Genre[] {
  return ids.length ? GENRES.filter((g) => ids.includes(g.id)) : GENRES;
}

export function artistsOf(ids: string[]): ArtistRef[] {
  return selectedGenres(ids).flatMap((g) => g.artists);
}

/** Todos los géneros de las familias seleccionadas (para ¿Qué subgénero?). */
export function familyGenres(ids: string[]): Genre[] {
  const families = new Set(selectedGenres(ids).map((g) => g.family));
  return GENRES.filter((g) => families.has(g.family));
}

export function filterLabel(f: Filter): string {
  if (f.kind === 'artist') return f.artist.name;
  if (!f.genres.length) return 'Todos los géneros';
  const labels = selectedGenres(f.genres).map((g) => g.label);
  return labels.length > 3 ? `${labels.slice(0, 2).join(' · ')} +${labels.length - 2}` : labels.join(' · ');
}
