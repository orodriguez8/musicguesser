import { getAlbum, searchTracks, type DzAlbum } from '../api/deezer';
import { getLyrics, lyricsHealth } from '../api/lrclib';
import { artistType, firstReleaseYear } from '../api/musicbrainz';
import { abortError, collect, mapLimit, range, sample, shuffle, uniqueBy } from '../lib/util';
import { artistsOf, catalogArtistType, familyGenres, GENRES, genreById } from './catalog';
import { albumCount, displayTitle, loadPool, mergePools, relatedRefs, type Pool } from './pool';
import { ROUNDS } from './scoring';
import { normText, similarity, stripExtras } from './text';
import type { ArtistRef, Filter, ModeId, Option, PlayMode, Progress, Question, Track } from './types';

interface Ctx {
  filter: Filter;
  pool: Pool;
  signal: AbortSignal;
  progress: (p: Progress) => void;
  related?: Pool;
}

const artistMode = (ctx: Ctx) => ctx.filter.kind === 'artist';

/**
 * De dónde sacar opciones falsas. Jugando con un solo artista, sus propias canciones pueden
 * no llegar a 3 alternativas: entonces se completan con las de artistas parecidos.
 */
const distractorPool = (ctx: Ctx) => ctx.related ?? ctx.pool;

/** Reparte las canciones entre artistas distintos, tirando de lo más conocido de cada uno. */
function spread(pool: Pool, count: number, perArtist: number): Track[] {
  const queues = shuffle([...pool.byArtist.values()].map((ts) => shuffle(ts.slice(0, perArtist))));
  const out: Track[] = [];
  const used = new Set<number>();
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      const t = q.shift();
      if (t && !used.has(t.id)) {
        out.push(t);
        used.add(t.id);
        if (out.length >= count) break;
      }
    }
  }
  return out;
}

function withOptions(correct: Option, distractors: Option[]): { options: Option[]; answer: number } {
  const options = shuffle([correct, ...distractors.slice(0, 3)]);
  return { options, answer: options.indexOf(correct) };
}

/** Títulos falsos: primero del mismo artista (más difícil), luego del resto. */
function titleDistractors(t: Track, pool: Pool): Option[] {
  const key = normText(t.title);
  const same = shuffle((pool.byArtist.get(t.artistId) ?? []).slice(0, 30));
  const others = shuffle(pool.tracks.filter((x) => x.artistId !== t.artistId));
  return uniqueBy(
    [...same, ...others].filter((x) => normText(x.title) !== key),
    (x) => normText(x.title),
  )
    .slice(0, 3)
    .map((x) => ({ label: x.title }));
}

async function withRelated(ctx: Ctx): Promise<Pool> {
  if (ctx.filter.kind !== 'artist') return ctx.pool;
  if (ctx.related) return ctx.related;
  ctx.progress({ label: 'Buscando artistas parecidos…' });
  try {
    const refs = await relatedRefs(ctx.filter.artist, 5);
    const rel = await loadPool(refs, { signal: ctx.signal });
    ctx.related = mergePools(ctx.pool, rel);
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    // Sin artistas parecidos: los modos que los necesitan generarán menos preguntas
    ctx.related = ctx.pool;
  }
  return ctx.related;
}

// ---------- Generadores por modo ----------

async function genCancion(ctx: Ctx, count: number): Promise<Question[]> {
  return spread(ctx.pool, count, artistMode(ctx) ? 40 : 12)
    .map((t): Question => {
      const { options, answer } = withOptions({ label: t.title }, titleDistractors(t, distractorPool(ctx)));
      return { kind: 'cancion', track: t, options, answer, accept: [t.title] };
    })
    .filter((q) => q.kind === 'cancion' && q.options.length === 4);
}

async function genArtista(ctx: Ctx, count: number): Promise<Question[]> {
  const pool = await withRelated(ctx);
  if (pool.artists.length < 4) return [];
  const qs = spread(pool, count, 10).flatMap((t) => {
    const candidates = artistMode(ctx) ? pool.artists : (genreById.get(t.genreId ?? '')?.artists ?? pool.artists);
    const distract = shuffle(
      candidates.filter((a) => a.id !== t.artistId && normText(a.name) !== normText(t.artistName)),
    )
      .slice(0, 3)
      .map((a) => ({ label: a.name }));
    if (distract.length < 3) return [];
    const { options, answer } = withOptions({ label: t.artistName }, distract);
    const q: Extract<Question, { kind: 'artista' }> = { kind: 'artista', track: t, options, answer, accept: [t.artistName] };
    return [q];
  });

  // ¿Grupo o solista? Así nadie escribe el nombre del cantante cuando la respuesta es la banda.
  // Catálogo: dato precalculado. Artistas de fuera (búsqueda, parecidos): MusicBrainz.
  const unknown = uniqueBy(
    qs.filter((q) => !catalogArtistType.has(q.track.artistId)),
    (q) => q.track.artistId,
  );
  if (unknown.length) ctx.progress({ label: 'Comprobando si son grupos o solistas…' });
  const looked = new Map<number, Awaited<ReturnType<typeof artistType>>>();
  await mapLimit(unknown, 2, async (q) => {
    looked.set(q.track.artistId, await artistType(q.track.artistName).catch(() => undefined));
  });
  for (const q of qs) q.artistType = catalogArtistType.get(q.track.artistId) ?? looked.get(q.track.artistId);
  return qs;
}

async function genSubgenero(ctx: Ctx, count: number): Promise<Question[]> {
  const byGenre = new Map<string, Track[]>();
  for (const a of ctx.pool.artists) {
    if (!a.genreId) continue;
    const list = byGenre.get(a.genreId) ?? [];
    list.push(...shuffle((ctx.pool.byArtist.get(a.id) ?? []).slice(0, 12)).slice(0, 4));
    byGenre.set(a.genreId, list);
  }
  if (byGenre.size < 2) return [];
  const queues = shuffle([...byGenre.entries()].map(([g, ts]) => [g, shuffle(ts)] as const));
  const picked: Track[] = [];
  while (picked.length < count && queues.some(([, q]) => q.length)) {
    for (const [, q] of queues) {
      const t = q.shift();
      if (t) picked.push(t);
      if (picked.length >= count) break;
    }
  }
  return picked.map((t): Question => {
    const g = genreById.get(t.genreId!)!;
    const sameFamily = shuffle(GENRES.filter((x) => x.family === g.family && x.id !== g.id));
    const rest = shuffle(GENRES.filter((x) => x.family !== g.family));
    const distract = [...sameFamily, ...rest].slice(0, 3).map((x) => ({ label: x.label }));
    const { options, answer } = withOptions({ label: g.label }, distract);
    return { kind: 'subgenero', track: t, options, answer };
  });
}

const okLine = (l: string) => l.length >= 12 && l.length <= 90 && l.split(' ').length >= 3;

function makeCompleta(t: Track, lines: string[]): Question | null {
  const n = lines.map(normText);
  for (const i of shuffle(range(1, lines.length - 1))) {
    const ans = lines[i + 1];
    if (!okLine(ans) || !okLine(lines[i]) || n[i + 1] === n[i] || n[i + 1] === n[i - 1]) continue;
    // Si el mismo par de versos aparece en otro sitio seguido de otra frase, sería ambiguo
    const ambiguous = range(1, lines.length - 1).some(
      (j) => j !== i && n[j] === n[i] && n[j - 1] === n[i - 1] && n[j + 1] !== n[i + 1],
    );
    if (ambiguous) continue;
    const distract = uniqueBy(
      shuffle(lines.filter((l, k) => okLine(l) && ![i - 1, i, i + 1].includes(k))),
      normText,
    )
      .filter((l) => ![n[i - 1], n[i], n[i + 1]].includes(normText(l)) && similarity(normText(l), n[i + 1]) < 0.6)
      .slice(0, 3);
    if (distract.length < 3) continue;
    const { options, answer } = withOptions(
      { label: ans },
      distract.map((l) => ({ label: l })),
    );
    return { kind: 'completa', track: t, context: [lines[i - 1], lines[i]], options, answer };
  }
  return null;
}

function makeMisteriosa(t: Track, lines: string[], pool: Pool): Question | null {
  const title = normText(t.title);
  const artist = normText(t.artistName);
  const gives = (line: string) => {
    const n = normText(line);
    return (title.length >= 3 && n.includes(title)) || (artist.length >= 4 && n.includes(artist));
  };
  const usable = (i: number) => {
    const [a, b] = [lines[i], lines[i + 1]];
    if (!okLine(a) || !okLine(b) || normText(a) === normText(b)) return false;
    // Que la frase no chive el título ni el artista ("Bad Bunny, baby")
    return !gives(a) && !gives(b);
  };
  const idxs = shuffle(range(0, lines.length - 1)).filter(usable);
  // Preferimos versos con chicha: dos frases cortas ("hasta abajo") no hay quien las adivine
  const i = idxs.find((k) => lines[k].length + lines[k + 1].length >= 50) ?? idxs[0];
  if (i == null) return null;
  const { options, answer } = withOptions({ label: t.title }, titleDistractors(t, pool));
  if (options.length < 4) return null;
  return { kind: 'misteriosa', track: t, lines: [lines[i], lines[i + 1]], options, answer, accept: [t.title] };
}

async function genLyrics(ctx: Ctx, count: number, kind: 'completa' | 'misteriosa'): Promise<Question[]> {
  const candidates = spread(ctx.pool, count * 5, artistMode(ctx) ? 50 : 15);
  let found = 0;
  ctx.progress({ label: 'Buscando letras…', done: 0, total: count });
  return collect(
    candidates,
    3,
    count,
    async (t) => {
      const lines = await getLyrics(t);
      if (!lines) return null;
      const q = kind === 'completa' ? makeCompleta(t, lines) : makeMisteriosa(t, lines, distractorPool(ctx));
      if (q) ctx.progress({ label: 'Buscando letras…', done: ++found, total: count });
      return q;
    },
    ctx.signal,
  );
}

const BAD_ALBUM =
  /\b(greatest|best of|hits|collection|anthology|essentials?|remaster(ed)?|anniversary|live|en vivo|edition|edici[oó]n|gold|platinum|soundtrack|b\.?s\.?o|compilation|recopilatorio)\b/i;

/**
 * Año original: el más antiguo entre los discos de Deezer (sin recopilatorios ni reediciones)
 * y la fecha de primer lanzamiento que conoce MusicBrainz.
 */
async function originalYear(t: Track): Promise<number | null> {
  const now = new Date().getFullYear();
  const [dzYear, mbYear] = await Promise.all([deezerYear(t, now), firstReleaseYear(t.artistName, t.title)]);
  const years = [dzYear, mbYear].filter((y): y is number => y != null && y <= now);
  return years.length ? Math.min(...years) : null;
}

async function deezerYear(t: Track, now: number): Promise<number | null> {
  const years: number[] = [];
  const consider = (al: DzAlbum | null) => {
    if (!al?.release_date) return;
    const y = Number(al.release_date.slice(0, 4));
    if (!y || y < 1950 || y > now) return;
    if (al.record_type === 'compile' || BAD_ALBUM.test(al.title)) return;
    years.push(y);
  };
  consider(await getAlbum(t.albumId).catch(() => null));
  const found = await searchTracks(`artist:"${t.artistName}" track:"${t.title}"`).catch(() => []);
  const ids = uniqueBy(
    found.filter(
      (x) => x.artist?.id === t.artistId && x.album && x.album.id !== t.albumId && normText(displayTitle(x)) === normText(t.title),
    ),
    (x) => x.album!.id,
  )
    .slice(0, 3)
    .map((x) => x.album!.id);
  (await Promise.all(ids.map((id) => getAlbum(id).catch(() => null)))).forEach(consider);
  return years.length ? Math.min(...years) : null;
}

async function genAnio(ctx: Ctx, count: number): Promise<Question[]> {
  const candidates = spread(ctx.pool, count * 2, artistMode(ctx) ? 50 : 12);
  let found = 0;
  ctx.progress({ label: 'Comprobando fechas de lanzamiento…', done: 0, total: count });
  return collect(
    candidates,
    3,
    count,
    async (t): Promise<Question | null> => {
      const year = await originalYear(t);
      if (!year) return null;
      ctx.progress({ label: 'Comprobando fechas de lanzamiento…', done: ++found, total: count });
      return { kind: 'anio', track: t, year };
    },
    ctx.signal,
  );
}

const albumLabel = (t: Track) => stripExtras(t.albumTitle) || t.albumTitle;

async function genPortada(ctx: Ctx, count: number): Promise<Question[]> {
  const tracks = spread(ctx.pool, count * 3, artistMode(ctx) ? 60 : 15);
  const albums = uniqueBy(tracks, (t) => `${t.artistId}:${normText(albumLabel(t))}`).slice(0, count);
  const allAlbums = uniqueBy(distractorPool(ctx).tracks, (t) => `${t.artistId}:${normText(albumLabel(t))}`);
  return albums.flatMap((t): Question[] => {
    const key = normText(albumLabel(t));
    const same = shuffle(allAlbums.filter((x) => x.artistId === t.artistId));
    const others = shuffle(allAlbums.filter((x) => x.artistId !== t.artistId));
    const distract = uniqueBy(
      [...same, ...others].filter((x) => normText(albumLabel(x)) !== key),
      (x) => normText(albumLabel(x)),
    )
      .slice(0, 3)
      .map((x) => ({ label: albumLabel(x), sub: x.artistName }));
    if (distract.length < 3) return [];
    const { options, answer } = withOptions({ label: albumLabel(t), sub: t.artistName }, distract);
    return [{ kind: 'portada', track: t, options, answer, accept: [t.albumTitle] }];
  });
}

async function genIntruso(ctx: Ctx, count: number): Promise<Question[]> {
  const pool = await withRelated(ctx);
  const hosts: ArtistRef[] =
    ctx.filter.kind === 'artist'
      ? [ctx.filter.artist]
      : shuffle(pool.artists.filter((a) => (pool.byArtist.get(a.id)?.length ?? 0) >= 3));
  if (!hosts.length) return [];
  const used = new Set<number>();
  const out: Question[] = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const host = hosts[i % hosts.length];
    const own = shuffle((pool.byArtist.get(host.id) ?? []).slice(0, 25).filter((t) => !used.has(t.id))).slice(0, 3);
    const strangers = pool.tracks.filter((t) => t.artistId !== host.id && !used.has(t.id));
    const sameGenre = strangers.filter((t) => t.genreId === host.genreId);
    const intruder = sample(sameGenre.length ? sameGenre : strangers);
    if (own.length < 3 || !intruder) continue;
    [...own, intruder].forEach((t) => used.add(t.id));
    const clips = shuffle([...own, intruder]);
    out.push({ kind: 'intruso', host: { name: own[0].artistName, picture: host.picture }, clips, answer: clips.indexOf(intruder) });
  }
  return out;
}

const GEN: Record<ModeId, (ctx: Ctx, count: number) => Promise<Question[]>> = {
  cancion: genCancion,
  artista: genArtista,
  completa: (ctx, n) => genLyrics(ctx, n, 'completa'),
  misteriosa: (ctx, n) => genLyrics(ctx, n, 'misteriosa'),
  anio: genAnio,
  portada: genPortada,
  intruso: genIntruso,
  subgenero: genSubgenero,
};

async function genMezcla(ctx: Ctx): Promise<Question[]> {
  const plan: ModeId[] = ['cancion', 'artista', 'anio', 'misteriosa', 'portada', 'cancion', 'intruso', 'completa', 'subgenero', 'artista'];
  if (artistMode(ctx)) plan[plan.indexOf('subgenero')] = 'cancion';
  const need = new Map<ModeId, number>();
  plan.forEach((m) => need.set(m, (need.get(m) ?? 0) + 1));
  const got = new Map<ModeId, Question[]>();
  for (const [m, n] of need) {
    ctx.progress({ label: 'Preparando pruebas variadas…' });
    got.set(m, await GEN[m](ctx, n).catch(() => []));
    if (ctx.signal.aborted) throw abortError();
  }
  // Lo que no se haya podido generar (p. ej. sin letras) se rellena con ¿Qué canción es?
  const missing = plan.filter((m) => !(got.get(m)?.length));
  const extra = missing.length ? await genCancion(ctx, missing.length + 2) : [];
  const usedIds = new Set<number>();
  return plan.flatMap((m) => {
    const q = got.get(m)?.shift() ?? extra.shift();
    if (!q) return [];
    const id = q.kind === 'intruso' ? q.clips[q.answer].id : q.track.id;
    if (usedIds.has(id) && extra.length) {
      const alt = extra.shift()!;
      usedIds.add(alt.kind === 'intruso' ? alt.clips[alt.answer].id : alt.track.id);
      return [alt];
    }
    usedIds.add(id);
    return [q];
  });
}

function pickArtists(mode: PlayMode, filter: Filter): ArtistRef[] {
  if (filter.kind === 'artist') return [filter.artist];
  if (mode === 'subgenero') {
    const genres = familyGenres(filter.genres);
    const per = Math.max(2, Math.floor(16 / genres.length));
    return genres.flatMap((g) => shuffle(g.artists).slice(0, per));
  }
  return shuffle(artistsOf(filter.genres)).slice(0, mode === 'mezcla' ? 16 : 12);
}

/** Mínimo de pruebas para que una partida tenga sentido (si no llegamos a 10). */
export const MIN_ROUNDS = 5;

const NOT_ENOUGH: Partial<Record<PlayMode, string>> = {
  completa: 'No hemos encontrado suficientes letras para estos artistas. Prueba con otros géneros o con otro modo.',
  misteriosa: 'No hemos encontrado suficientes letras para estos artistas. Prueba con otros géneros o con otro modo.',
  anio: 'No hemos podido fechar suficientes canciones. Prueba con otro filtro.',
  artista: 'Hacen falta al menos 4 artistas distintos para este modo.',
  intruso: 'No hay suficientes artistas parecidos para montar este modo. Prueba con otro.',
  subgenero: 'Este modo necesita géneros, no un artista concreto.',
};

/** Los errores con este mensaje se enseñan tal cual al jugador. */
export class GameError extends Error {}

export async function buildQuestions(
  mode: PlayMode,
  filter: Filter,
  progress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<Question[]> {
  if (navigator.onLine === false) throw new GameError('Parece que no tienes conexión a internet.');
  if (mode === 'subgenero' && filter.kind === 'artist') throw new GameError(NOT_ENOUGH.subgenero!);
  // Géneros guardados que ya no existen en el catálogo: se ignoran (vacío = todos)
  if (filter.kind === 'genres') filter = { kind: 'genres', genres: filter.genres.filter((g) => genreById.has(g)) };

  const artists = pickArtists(mode, filter);
  progress({ label: 'Buscando canciones…', done: 0, total: artists.length });
  const pool = await loadPool(artists, {
    deep: filter.kind === 'artist',
    signal,
    onStep: (done, total) => progress({ label: 'Buscando canciones…', done, total }),
  });
  if (!pool.tracks.length) {
    if (pool.failed && pool.failed >= artists.length)
      throw new GameError('Deezer no responde ahora mismo. Revisa tu conexión y vuelve a intentarlo en un momento.');
    throw new GameError(
      filter.kind === 'artist'
        ? `No hemos encontrado canciones de ${filter.artist.name} con fragmento disponible en Deezer.`
        : 'No hemos encontrado canciones con este filtro. Prueba con otro.',
    );
  }

  const ctx: Ctx = { filter, pool, signal, progress };

  // Validaciones de un artista concreto: ¿tiene material suficiente para este modo?
  if (filter.kind === 'artist') {
    const name = filter.artist.name;
    const songs = pool.tracks.length;
    if (songs < MIN_ROUNDS)
      throw new GameError(`${name} solo tiene ${songs} ${songs === 1 ? 'canción' : 'canciones'} con fragmento en Deezer. Hacen falta al menos ${MIN_ROUNDS}.`);
    const albums = albumCount(pool.tracks);
    if (mode === 'portada' && albums < MIN_ROUNDS)
      throw new GameError(`${name} solo tiene ${albums} ${albums === 1 ? 'disco' : 'discos'} en Deezer y Portada pixelada necesita al menos ${MIN_ROUNDS}. Prueba otro modo.`);
    // Opciones falsas de artistas parecidos por si las suyas no llegan
    if (mode !== 'anio' && mode !== 'completa') await withRelated(ctx);
  }

  const healthBefore = { ...lyricsHealth };
  const qs = mode === 'mezcla' ? await genMezcla(ctx) : await GEN[mode](ctx, ROUNDS);
  if (signal.aborted) throw abortError();
  // Mejor una partida algo más corta que ninguna
  if (qs.length < MIN_ROUNDS) {
    if (mode === 'completa' || mode === 'misteriosa') {
      const ok = lyricsHealth.ok - healthBefore.ok;
      const failed = lyricsHealth.failed - healthBefore.failed;
      if (failed > ok) throw new GameError('El servicio de letras (LRCLIB) no responde ahora mismo. Prueba otro modo o vuelve en un rato.');
    }
    throw new GameError(NOT_ENOUGH[mode] ?? 'No hay suficientes canciones con este filtro.');
  }
  return qs.slice(0, ROUNDS);
}

/** La canción "representativa" de una pregunta (para el resumen final). */
export function questionTrack(q: Question): Track {
  return q.kind === 'intruso' ? q.clips[q.answer] : q.track;
}
