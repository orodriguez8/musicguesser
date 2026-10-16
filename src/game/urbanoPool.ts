// Partidas de urbano: las canciones salen de la base de datos (con su año y su popularidad)
// en vez de los "top" de Deezer. Así se puede filtrar por época y dificultad.
import { getTrack } from '../api/deezer';
import { abortError, mapLimit, nonNull, shuffle } from '../lib/util';
import { freshFirst } from './history';
import type { Pool } from './pool';
import type { ArtistRef, Filter, Track } from './types';
import { artistPicUrl, artistsIn, coverUrl, ERAS, loadUrbano, type Level, type UArtist, type UrbanoDB, type UTrack } from './urbano';

type GenresFilter = Extract<Filter, { kind: 'genres' }>;

/**
 * Qué canciones de cada artista entran según la dificultad (0 = su canción más escuchada).
 * Difícil se salta sus 2 grandes éxitos pero se queda en temas conocidos, nada de rarezas.
 */
const SONGS: Record<Level, [number, number]> = {
  facil: [0, 6],
  normal: [0, 12],
  dificil: [2, 16],
};


export interface UrbanoPool {
  pool: Pool;
  /** Títulos de toda la base (sin audio), para las opciones falsas. */
  labels: Pool;
  /** Año original de cada canción (Máquina del tiempo no tiene que buscarlo). */
  years: Map<number, number>;
  /** Todos los artistas de la época elegida (opciones de ¿Quién canta?) */
  eraArtists: ArtistRef[];
  db: UrbanoDB;
}

/** Artistas en juego: los de la época elegida; en Fácil, solo la mitad más famosa. */
export function filterArtists(db: UrbanoDB, f: GenresFilter): UArtist[] {
  const list = artistsIn(db, f.genres, f.era).sort((x, y) => y.f - x.f);
  return f.level === 'facil' ? list.slice(0, Math.max(8, Math.ceil(list.length / 2))) : list;
}

function candidates(db: UrbanoDB, f: GenresFilter): UTrack[] {
  const era = ERAS.find((e) => e.id === f.era);
  const [from, to] = SONGS[f.level ?? 'normal'];
  const byArtist = new Map<number, UTrack[]>();
  for (const t of db.tracks) byArtist.set(t.a, [...(byArtist.get(t.a) ?? []), t]);
  return filterArtists(db, f).flatMap((a) => {
    let songs = (byArtist.get(a.id) ?? []).sort((x, y) => y.r - x.r);
    // De un artista de varias épocas, sus canciones de la época elegida (Anuel "antiguo" en la intermedia)
    if (era) {
      const inEra = songs.filter((t) => t.y >= era.from - 1 && t.y <= era.to + 1);
      if (inEra.length >= 4) songs = inEra;
    }
    const slice = songs.slice(from, to);
    return slice.length >= 3 ? slice : songs.slice(0, to);
  });
}

/** Reparte entre artistas: primero lo que no ha salido últimamente, como mucho perArtist de cada uno. */
function pick(list: UTrack[], recent: Set<number>, count: number, perArtist: number, clusters = 0): UTrack[] {
  const byArtist = new Map<number, UTrack[]>();
  for (const t of shuffle(list)) {
    const l = byArtist.get(t.a) ?? [];
    l.push(t);
    byArtist.set(t.a, l);
  }
  const all = shuffle([...byArtist.values()]).map((ts) => freshFirst(ts, (t) => recent.has(t.id)));
  let queues = all.map((ts) => ts.slice(0, perArtist));
  if (perArtist > 4) {
    // Varias canciones de cada artista: menos artistas, y de los que tengan bastantes
    const rich = queues.filter((q) => q.length >= 4);
    queues = (rich.length >= 4 ? rich : queues).slice(0, Math.ceil(count / perArtist) + 1);
  }
  const out: UTrack[] = [];
  // Unos pocos artistas con 5 canciones cada uno (Partida rápida necesita alguno para El intruso)
  const rich = all.filter((ts) => ts.length >= 5).slice(0, clusters);
  for (const ts of rich) {
    out.push(...ts.slice(0, 5));
    queues = queues.filter((q) => q[0]?.a !== ts[0].a);
  }
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      const t = q.shift();
      if (t) out.push(t);
      if (out.length >= count) break;
    }
  }
  return out;
}

function toRef(db: UrbanoDB, id: number): ArtistRef {
  const a = db.artistById.get(id)!;
  return { id: a.id, name: a.n, picture: artistPicUrl(a.p), genreId: a.g, type: a.ty };
}

function makePool(tracks: Track[], db: UrbanoDB): Pool {
  const byArtist = new Map<number, Track[]>();
  for (const t of tracks) {
    const l = byArtist.get(t.artistId) ?? [];
    l.push(t);
    byArtist.set(t.artistId, l);
  }
  return { tracks, byArtist, artists: [...byArtist.keys()].filter((id) => db.artistById.has(id)).map((id) => toRef(db, id)) };
}

export async function loadUrbanoPool(
  f: GenresFilter,
  opts: {
    count: number;
    /** Canciones por artista como máximo (El intruso necesita varias del mismo). */
    perArtist: number;
    /** Solo canciones de discos con 3 o más colaboraciones (AlbumLink). */
    albumsWithFeats?: boolean;
    /** Artistas que traen 5 canciones (para que El intruso salga en Partida rápida) */
    clusters?: number;
    recent: Set<number>;
    signal: AbortSignal;
    onStep?: (done: number, total: number) => void;
  },
): Promise<UrbanoPool> {
  const db = await loadUrbano();
  let list = candidates(db, f);
  if (opts.albumsWithFeats) {
    const linked = list.filter((t) => t.al && (db.albumById.get(t.al)?.ft.length ?? 0) >= 3);
    if (linked.length >= 15) list = linked;
  }
  const chosen = pick(list, opts.recent, opts.count, opts.perArtist, opts.clusters);
  let done = 0;
  let failed = 0;
  // El audio caduca a las pocas horas: lo pedimos a Deezer en el momento
  const tracks = (
    await mapLimit(chosen, 4, async (u): Promise<Track | null> => {
      if (opts.signal.aborted) throw abortError();
      const dz = await getTrack(u.id).catch(() => (failed++, null));
      opts.onStep?.(++done, chosen.length);
      if (!dz?.preview || dz.readable === false || !dz.album) return null;
      const a = db.artistById.get(u.a)!;
      const album = u.al ? db.albumById.get(u.al) : undefined;
      return {
        id: u.id,
        title: u.t,
        artistId: u.a,
        artistName: a.n,
        albumId: album?.id ?? dz.album.id,
        albumTitle: album?.t ?? dz.album.title,
        cover: album ? coverUrl(album.m) : dz.album.cover_big || dz.album.cover_medium,
        coverSmall: album ? coverUrl(album.m, 250) : dz.album.cover_medium || dz.album.cover_big,
        preview: dz.preview,
        link: dz.link,
        rank: u.r,
        duration: dz.duration,
        genreId: a.g,
      };
    })
  ).filter(nonNull);
  if (opts.signal.aborted) throw abortError();

  // Opciones falsas: canciones de artistas de la misma época (solo hace falta el título)
  const eraIds = new Set(artistsIn(db, f.genres, f.era).map((a) => a.id));
  const labelTracks: Track[] = db.tracks
    .filter((t) => eraIds.has(t.a))
    .sort((x, y) => y.r - x.r)
    .map((t) => {
      const a = db.artistById.get(t.a)!;
      return {
        id: t.id,
        title: t.t,
        artistId: t.a,
        artistName: a.n,
        albumId: t.al ?? 0,
        albumTitle: (t.al && db.albumById.get(t.al)?.t) || '',
        cover: '',
        coverSmall: '',
        preview: '',
        link: '',
        rank: t.r,
        duration: 0,
        genreId: a.g,
      };
    });

  return {
    pool: { ...makePool(tracks, db), failed },
    labels: makePool(labelTracks, db),
    years: new Map(chosen.map((t) => [t.id, t.y])),
    eraArtists: [...eraIds].map((id) => toRef(db, id)),
    db,
  };
}
