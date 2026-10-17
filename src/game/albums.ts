// Discos "de verdad" para los juegos de discos: sin recopilatorios, remixes ni directos,
// y con cada disco una sola vez aunque Deezer tenga la edición normal y la deluxe.
import { normText, stripExtras } from './text';
import type { UAlbum, UrbanoDB } from './urbano';

/** Recopilatorios, directos y versiones: no son el disco que la gente recuerda. */
const NOT_AN_ALBUM =
  /\b(exitos|éxitos|greatest|hits|best of|lo mejor|remix|remixes|remixpilation|en vivo|live|unplugged|ac[uú]stico?|symphonic|sinf[oó]nico|instrumental|karaoke|track by track|commentary|collection|colecci[oó]n|anniversary|aniversario|salsa|bachata|hip hop)\b/i;
/** Intros, interludios y skits: no son canciones para adivinar. */
const NOT_A_SONG = /\b(intro|outro|interlude|interludio|skit|preludio)\b/i;
/** Versiones de una canción (remix, directo...): si son casi todo el disco, no es un disco normal. */
const VERSION = /\b(remix|mix|live|en vivo|versi[oó]n|version|instrumental|acapella|acoustic|ac[uú]stica|commentary)\b/i;

/** Discos de un homónimo que Deezer mezcla con el artista (Alvaro Díaz cantante de copla). */
const WRONG_ARTIST = new Set([6616073, 499742551, 207866022]);

/** Sin tildes: en JavaScript \b no ve la "É" de "Éxitos" como letra y la palabra no se detecta. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const MIN_TRACKS = 7;
const MAX_TRACKS = 22;

const songKey = (t: string) => normText(stripExtras(t)) || normText(t);
const titleKey = (t: string) => normText(stripExtras(t).replace(/\b(deluxe|edition|edici[oó]n|expanded|reloaded|side [ab])\b/gi, ''));

/** Recopilatorios, directos, remixes... o discos que no son de este artista. */
export const looksLikeCompilation = (al: UAlbum) => NOT_AN_ALBUM.test(plain(al.t)) || WRONG_ARTIST.has(al.id);

/** Las canciones del disco que se pueden adivinar: sin intros, versiones ni repetidas. */
function cleanTracks(al: UAlbum): string[] | null {
  const versions = al.tr.filter((t) => VERSION.test(t)).length;
  if (versions > al.tr.length * 0.3) return null;
  const seen = new Set<string>();
  return al.tr.filter((t) => {
    if (NOT_A_SONG.test(t) || VERSION.test(t)) return false;
    const k = songKey(t);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface Index {
  /** id de cualquier edición → id de la edición que usamos */
  edition: Map<number, number>;
  /** Discos válidos para Album Quiz, con la lista de canciones ya limpia */
  quiz: UAlbum[];
}

const cache = new WeakMap<UrbanoDB, Index>();

function build(db: UrbanoDB): Index {
  const byArtist = new Map<number, UAlbum[]>();
  for (const al of db.albums) byArtist.set(al.a, [...(byArtist.get(al.a) ?? []), al]);

  const edition = new Map<number, number>();
  const quiz: UAlbum[] = [];
  for (const list of byArtist.values()) {
    const songs = list.map((al) => new Set(al.tr.map(songKey)));
    // Ediciones del mismo disco: mismo título base o casi las mismas canciones
    const parent = list.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const shared = [...songs[j]].filter((k) => songs[i].has(k)).length;
        const small = Math.min(songs[i].size, songs[j].size);
        const title = titleKey(list[i].t);
        const same = (!!title && title === titleKey(list[j].t)) || (shared >= 4 && shared >= small * 0.6);
        if (same) parent[root(j)] = root(i);
      }
    const groups = new Map<number, UAlbum[]>();
    list.forEach((al, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), al]));
    for (const group of groups.values()) {
      // La edición que más se escucha y que no sea un recopilatorio
      const best = [...group].sort((x, y) => Number(looksLikeCompilation(x)) - Number(looksLikeCompilation(y)) || y.f - x.f)[0];
      for (const al of group) edition.set(al.id, best.id);
      if (best.k !== 'album' || looksLikeCompilation(best)) continue;
      const tr = cleanTracks(best);
      if (tr && tr.length >= MIN_TRACKS && tr.length <= MAX_TRACKS) quiz.push({ ...best, tr });
    }
  }
  // Los discos conjuntos (OASIS de Bad Bunny y J Balvin...) salen una vez por artista: nos
  // quedamos con una sola copia, la del artista con más fans
  const fans = (al: UAlbum) => db.artistById.get(al.a)?.f ?? 0;
  const seen = new Set<number>();
  const unique = [...quiz]
    .sort((x, y) => fans(y) - fans(x))
    .filter((al) => !seen.has(al.id) && (seen.add(al.id), true));
  return { edition, quiz: unique };
}

function index(db: UrbanoDB): Index {
  let i = cache.get(db);
  if (!i) cache.set(db, (i = build(db)));
  return i;
}

/** El mismo id para todas las ediciones de un disco (normal, deluxe, aniversario...). */
export const editionOf = (db: UrbanoDB, albumId: number) => index(db).edition.get(albumId) ?? albumId;

/** Discos que valen para Album Quiz (una edición por disco, canciones limpias). */
export const quizAlbums = (db: UrbanoDB) => index(db).quiz;
