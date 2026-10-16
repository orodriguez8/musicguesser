import { albumTracks, artistAlbums, artistTop, relatedArtists, type DzAlbumRef, type DzTrack } from '../api/deezer';
import { abortError, mapLimit, nonNull, uniqueBy } from '../lib/util';
import { normText } from './text';
import type { ArtistRef, Track } from './types';

// Versiones que no queremos en el juego: remixes, directos, sped up, karaoke…
const VERSION_JUNK =
  /\b(remix|rmx|live|en vivo|en directo|sped ?up|slowed|reverb|acoustic|ac[uú]stic[oa]?|instrumental|karaoke|8d|nightcore|demo|cover|a ?cappella|rehearsal|reprise|mashup|bootleg)\b/i;
const LEADING_JUNK = /^(intro|outro|interlude|interludio|skit|prelude|preludio)\b/i;
// Estas palabras delatan una versión aunque estén en el título principal ("Candy Remix Parte 1")
const TITLE_JUNK = /\b(remix|rmx|sped ?up|slowed|karaoke|nightcore)\b/i;

export function displayTitle(t: { title: string; title_short?: string }): string {
  const base = (t.title_short || t.title).replace(/\s*[([](?:feat|ft|with|con)\.?\s[^)\]]*[)\]]/gi, '').trim();
  return base || t.title;
}

function versionInfo(t: DzTrack): string {
  const parts = [t.title_version ?? '', ...(t.title.match(/[([][^)\]]*[)\]]/g) ?? [])];
  const dash = t.title.indexOf(' - ');
  if (dash > 0) parts.push(t.title.slice(dash + 3));
  return parts.join(' ');
}

export function toTrack(t: DzTrack, album?: DzAlbumRef, genreId?: string): Track | null {
  if (!t.preview || t.readable === false || !t.artist) return null;
  if (VERSION_JUNK.test(versionInfo(t)) || TITLE_JUNK.test(t.title)) return null;
  const title = displayTitle(t);
  if (!title || LEADING_JUNK.test(title)) return null;
  const al = t.album ?? album;
  if (!al) return null;
  return {
    id: t.id,
    title,
    artistId: t.artist.id,
    artistName: t.artist.name,
    albumId: al.id,
    albumTitle: al.title,
    cover: al.cover_big || al.cover_medium,
    coverSmall: al.cover_medium || al.cover_big,
    preview: t.preview,
    link: t.link,
    rank: t.rank ?? 0,
    duration: t.duration,
    genreId,
  };
}

const trackCache = new Map<string, Promise<Track[]>>();

async function loadArtistTracks(artist: ArtistRef, deep: boolean): Promise<Track[]> {
  const top = (await artistTop(artist.id, 50).catch(() => []))
    .map((t) => toTrack(t, undefined, artist.genreId))
    .filter(nonNull)
    .filter((t) => t.artistId === artist.id);
  let tracks = top;
  // El "top" de Deezer se queda muy corto con grupos pequeños: entonces recorremos sus discos.
  if (deep || tracks.length < 12) {
    const albums = (await artistAlbums(artist.id).catch(() => [])).filter((a) => a.record_type !== 'compile');
    const ordered = [
      ...albums.filter((a) => a.record_type !== 'single'),
      ...albums.filter((a) => a.record_type === 'single'),
    ].slice(0, deep ? 8 : 5);
    const lists = await mapLimit(ordered, 3, (a) =>
      albumTracks(a.id)
        .then((ts) => ts.map((t) => toTrack(t, a, artist.genreId)))
        .catch(() => []),
    );
    tracks = [...tracks, ...lists.flat().filter(nonNull).filter((t) => t.artistId === artist.id)];
  }
  return uniqueBy(tracks, (t) => normText(t.title));
}

export function getArtistTracks(artist: ArtistRef, deep = false): Promise<Track[]> {
  const key = `${artist.id}:${deep ? 1 : 0}`;
  let p = trackCache.get(key);
  if (!p) {
    p = loadArtistTracks(artist, deep);
    trackCache.set(key, p);
    p.catch(() => trackCache.delete(key));
    // Los enlaces de audio caducan: no reutilizamos más de 30 min
    setTimeout(() => trackCache.delete(key), 30 * 60 * 1000);
  }
  return p;
}

export interface Pool {
  tracks: Track[];
  byArtist: Map<number, Track[]>;
  artists: ArtistRef[];
}

export async function loadPool(
  artists: ArtistRef[],
  opts: { deep?: boolean; signal?: AbortSignal; onStep?: (done: number, total: number) => void } = {},
): Promise<Pool> {
  let done = 0;
  const lists = await mapLimit(artists, 4, async (a) => {
    if (opts.signal?.aborted) throw abortError();
    const ts = await getArtistTracks(a, opts.deep).catch(() => [] as Track[]);
    opts.onStep?.(++done, artists.length);
    return ts;
  });
  if (opts.signal?.aborted) throw abortError();
  const byArtist = new Map<number, Track[]>();
  const ok: ArtistRef[] = [];
  artists.forEach((a, i) => {
    if (lists[i].length) {
      byArtist.set(a.id, lists[i]);
      ok.push(a);
    }
  });
  return { tracks: lists.flat(), byArtist, artists: ok };
}

export function mergePools(a: Pool, b: Pool): Pool {
  return {
    tracks: uniqueBy([...a.tracks, ...b.tracks], (t) => t.id),
    byArtist: new Map([...a.byArtist, ...b.byArtist]),
    artists: uniqueBy([...a.artists, ...b.artists], (x) => x.id),
  };
}

export async function relatedRefs(artist: ArtistRef, n = 5): Promise<ArtistRef[]> {
  const rel = await relatedArtists(artist.id).catch(() => []);
  return rel
    .filter((a) => a.id !== artist.id)
    .slice(0, n)
    .map((a) => ({ id: a.id, name: a.name, picture: a.picture_medium, genreId: artist.genreId }));
}
