// Las 10 pruebas de una partida, listas para mandarlas a otros jugadores (salas en directo)
// o guardarlas (reto a un amigo). Las listas del autocompletado no viajan enteras: el urbano
// las rehace con su base de datos y el resto manda solo los títulos que había en juego.
import { getTrack } from '../api/deezer';
import { GENRES } from '../game/catalog';
import { normText } from '../game/text';
import type { PlayMode, Question, Track } from '../game/types';
import { loadUrbano } from '../game/urbano';
import { mapLimit, uniqueBy } from '../lib/util';

export interface PackedGame {
  v: 1;
  mode: PlayMode;
  label: string;
  urbano: boolean;
  questions: Question[];
  songs?: string[];
  albums?: string[];
}

const strip = (q: Question): Question => {
  if (!('suggest' in q)) return q;
  const { suggest: _omit, ...rest } = q;
  return rest as Question;
};

export function packGame(mode: PlayMode, label: string, urbano: boolean, qs: Question[]): PackedGame {
  const pick = (kinds: Question['kind'][]) =>
    qs.flatMap((q) => (kinds.includes(q.kind) && 'suggest' in q && q.suggest ? q.suggest : []));
  // Fuera del urbano mandamos los títulos que había en juego (unas centenas, poca cosa)
  const songs = urbano ? undefined : [...new Set(pick(['cancion', 'misteriosa']))];
  const albums = urbano ? undefined : [...new Set(pick(['portada', 'albumlink']))];
  return { v: 1, mode, label, urbano, questions: qs.map(strip), songs, albums };
}

const tracksOf = (q: Question): Track[] => (q.kind === 'intruso' ? q.clips : [q.track]);

/**
 * Prepara una partida recibida: rehace el autocompletado y, si hace falta, renueva los
 * enlaces de audio (Deezer los caduca a las pocas horas; los retos pueden jugarse días después).
 */
export async function unpackGame(p: PackedGame, opts: { refreshAudio: boolean }): Promise<Question[]> {
  const qs = structuredClone(p.questions);
  if (opts.refreshAudio) {
    const all = qs.flatMap(tracksOf);
    await mapLimit(all, 4, async (t) => {
      const fresh = await getTrack(t.id).catch(() => null);
      if (fresh?.preview) t.preview = fresh.preview;
    });
  }

  const labels = (kinds: Question['kind'][]) =>
    qs.flatMap((q) => (kinds.includes(q.kind) && 'options' in q ? q.options.map((o) => o.label) : []));
  const sorted = (xs: string[]) => uniqueBy(xs.filter(Boolean), normText).sort((a, b) => a.localeCompare(b, 'es'));
  let songs = p.songs ?? [];
  let albums = p.albums ?? [];
  if (p.urbano) {
    const db = await loadUrbano();
    songs = db.tracks.map((t) => t.t);
    albums = db.albums.map((a) => a.t);
  }
  const songBank = sorted([...songs, ...labels(['cancion', 'misteriosa'])]);
  const albumBank = sorted([...albums, ...labels(['portada', 'albumlink'])]);
  const artistBank = sorted([
    ...GENRES.flatMap((g) => g.artists.map((a) => a.name)),
    ...qs.flatMap(tracksOf).map((t) => t.artistName),
    ...labels(['artista']),
  ]);
  for (const q of qs) {
    if (q.kind === 'cancion' || q.kind === 'misteriosa') q.suggest = songBank;
    else if (q.kind === 'artista') q.suggest = artistBank;
    else if (q.kind === 'portada' || q.kind === 'albumlink') q.suggest = albumBank;
  }
  return qs;
}
