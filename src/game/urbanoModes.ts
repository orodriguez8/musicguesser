// Minijuegos de 10 pruebas que solo existen con urbano (necesitan la base de datos):
// El infiltrado y AlbumLink.
import { shuffle, uniqueBy } from '../lib/util';
import { editionOf, looksLikeCompilation } from './albums';
import { pickFreshAlbums } from './history';
import type { Pool } from './pool';
import { normText } from './text';
import type { InfiltradoArtist, Option, Question, Track } from './types';
import { artistPicUrl, artistsIn, coverUrl, type Era, type Level, type UArtist, type UrbanoDB } from './urbano';

export interface UrbanoCtx {
  db: UrbanoDB;
  pool: Pool;
  genres: string[];
  era?: Era;
  level: Level;
  /** Canciones ya usadas en esta partida */
  used: Set<number>;
}

function withOptions(correct: Option, distractors: Option[]): { options: Option[]; answer: number } {
  const options = shuffle([correct, ...distractors.slice(0, 3)]);
  return { options, answer: options.indexOf(correct) };
}

// ---------- El infiltrado ----------

const COUNTRY: Record<string, string> = {
  PR: 'Puerto Rico',
  CO: 'Colombia',
  ES: 'España',
  AR: 'Argentina',
  PA: 'Panamá',
  VE: 'Venezuela',
  DO: 'República Dominicana',
  CU: 'Cuba',
  CL: 'Chile',
  US: 'Estados Unidos',
  MX: 'México',
  MA: 'Marruecos',
};

interface Rule {
  /** Tipo de condición: se van alternando para que haya variedad */
  type: 'pais' | 'debut' | 'grupo' | 'mujer' | 'colab';
  text: string;
  /** Cumplen la condición */
  members: UArtist[];
  /** Seguro que no la cumplen (con margen, por si los datos fallan por poco) */
  outsiders: UArtist[];
  detail: (a: UArtist) => string;
  why: (a: UArtist) => string;
}

/** Con quién ha colaborado cada artista (en un sentido o en otro), según las canciones de la base. */
function collabMap(db: UrbanoDB): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    if (a === b) return;
    (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
  };
  for (const t of db.tracks)
    for (const f of t.ft ?? []) {
      if (!db.artistById.has(f)) continue;
      add(t.a, f);
      add(f, t.a);
    }
  return m;
}
let collabs: Map<number, Set<number>> | null = null;

function rules(db: UrbanoDB, artists: UArtist[]): Rule[] {
  const out: Rule[] = [];
  const known = artists.filter((a) => a.c && COUNTRY[a.c]);
  const byCountry = new Map<string, UArtist[]>();
  for (const a of known) byCountry.set(a.c!, [...(byCountry.get(a.c!) ?? []), a]);
  for (const [c, members] of byCountry) {
    if (members.length < 3) continue;
    out.push({
      type: 'pais',
      text: `Son de ${COUNTRY[c]}`,
      members,
      outsiders: known.filter((a) => a.c !== c),
      detail: (a) => COUNTRY[a.c!],
      why: (a) => `${a.n} es de ${COUNTRY[a.c!]}`,
    });
  }

  for (const year of [2006, 2010, 2014, 2018]) {
    const withDebut = artists.filter((a) => a.d);
    const before = withDebut.filter((a) => a.d! <= year - 2);
    const after = withDebut.filter((a) => a.d! >= year + 2);
    if (before.length >= 3 && after.length)
      out.push({
        type: 'debut',
        text: `Debutaron antes de ${year}`,
        members: before,
        outsiders: after,
        detail: (a) => `Debut: ${a.d}`,
        why: (a) => `${a.n} debutó en ${a.d}`,
      });
    if (after.length >= 3 && before.length)
      out.push({
        type: 'debut',
        text: `Debutaron después de ${year}`,
        members: after,
        outsiders: before,
        detail: (a) => `Debut: ${a.d}`,
        why: (a) => `${a.n} debutó en ${a.d}`,
      });
  }

  const groups = artists.filter((a) => a.ty === 'group');
  const solos = artists.filter((a) => a.ty === 'person');
  if (groups.length >= 3)
    out.push({
      type: 'grupo',
      text: 'Son grupos o dúos',
      members: groups,
      outsiders: solos,
      detail: (a) => (a.ty === 'group' ? 'Grupo' : 'Solista'),
      why: (a) => `${a.n} es solista`,
    });

  const women = artists.filter((a) => a.s === 'female');
  const men = artists.filter((a) => a.s === 'male');
  if (women.length >= 3)
    out.push({
      type: 'mujer',
      text: 'Son mujeres',
      members: women,
      outsiders: men,
      detail: (a) => (a.s === 'female' ? 'Mujer' : 'Hombre'),
      why: (a) => `${a.n} es un hombre`,
    });

  // Colaboraciones: el infiltrado es de otra época, para no fallar por una colaboración que no tengamos
  collabs ??= collabMap(db);
  const stars = artists.filter((a) => (collabs!.get(a.id)?.size ?? 0) >= 3).sort((x, y) => y.f - x.f).slice(0, 25);
  for (const star of stars) {
    const with_ = collabs.get(star.id)!;
    const members = artists.filter((a) => with_.has(a.id));
    const debut = star.d ?? 2015;
    const outsiders = artists.filter((a) => a.id !== star.id && !with_.has(a.id) && a.d && Math.abs(a.d - debut) >= 8);
    if (members.length >= 3 && outsiders.length)
      out.push({
        type: 'colab',
        text: `Tienen canción con ${star.n}`,
        members,
        outsiders,
        detail: (a) => (with_.has(a.id) ? `Con ${star.n}` : `Sin ${star.n}`),
        why: (a) => `${a.n} no tiene canciones con ${star.n}`,
      });
  }
  return out;
}

/** Fácil: artistas conocidos; Difícil: cualquiera. */
function famous(list: UArtist[], level: Level): UArtist[] {
  const sorted = [...list].sort((x, y) => y.f - x.f);
  const n = level === 'facil' ? 12 : level === 'normal' ? 30 : sorted.length;
  return sorted.slice(0, Math.max(n, 3));
}

export function genInfiltrado(ctx: UrbanoCtx, count: number): Question[] {
  const { db, pool } = ctx;
  // Solo artistas de la época elegida
  const artists = artistsIn(db, ctx.genres, ctx.era);
  // Por turnos: un tipo de condición cada vez (si no, casi todo serían colaboraciones)
  const byType = new Map<Rule['type'], Rule[]>();
  for (const r of shuffle(rules(db, artists))) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const types = shuffle([...byType.keys()]);
  const out: Question[] = [];
  const usedRules = new Set<string>();
  const usedInfiltrators = new Set<number>();
  for (let i = 0; out.length < count && types.length && i < count * 8; i++) {
    const list = byType.get(types[i % types.length])!;
    const rule = list.find((r) => !usedRules.has(r.text)) ?? list[i % list.length];
    if (!rule) continue;
    // El infiltrado tiene que tener una canción con audio en la partida (para el resumen)
    const candidates = shuffle(rule.outsiders).filter(
      (a) => !usedInfiltrators.has(a.id) && (pool.byArtist.get(a.id) ?? []).some((t) => !ctx.used.has(t.id)),
    );
    const infiltrator = candidates[0];
    if (!infiltrator) continue;
    const track = (pool.byArtist.get(infiltrator.id) ?? []).find((t) => !ctx.used.has(t.id))!;
    const members = shuffle(famous(rule.members.filter((a) => a.id !== infiltrator.id), ctx.level)).slice(0, 3);
    if (members.length < 3) continue;
    const cards = shuffle([...members, infiltrator]);
    const toCard = (a: UArtist): InfiltradoArtist => ({ name: a.n, picture: artistPicUrl(a.p), detail: rule.detail(a) });
    usedRules.add(rule.text);
    usedInfiltrators.add(infiltrator.id);
    ctx.used.add(track.id);
    out.push({
      kind: 'infiltrado',
      track,
      rule: rule.text,
      artists: cards.map(toCard),
      answer: cards.indexOf(infiltrator),
      why: rule.why(infiltrator),
    });
  }
  return out;
}

// ---------- AlbumLink ----------

export function genAlbumLink(ctx: UrbanoCtx, count: number): Question[] {
  const { db, pool } = ctx;
  const withFeats = (id: number) => {
    const al = db.albumById.get(id);
    return al && al.ft.length >= 3 && !looksLikeCompilation(al) ? al : null;
  };
  // Discos de los que suena alguna canción en la partida (así hay audio para el resumen).
  // Ni los 10 últimos discos ni el mismo artista que en los 3 anteriores.
  const picks = pickFreshAlbums(
    'albumlink',
    shuffle(pool.tracks).filter((t) => !ctx.used.has(t.id) && withFeats(t.albumId)),
    count,
    (t) => ({ id: editionOf(db, t.albumId), a: t.artistId }),
  );
  const eraIds = new Set(artistsIn(db, ctx.genres, ctx.era).map((a) => a.id));
  const allAlbums = db.albums.filter((al) => al.ft.length >= 2 && eraIds.has(al.a) && !looksLikeCompilation(al));
  return picks.map((t: Track): Question => {
    const al = db.albumById.get(t.albumId)!;
    const artist = db.artistById.get(al.a)!;
    ctx.used.add(t.id);
    const near = (y: number | null) => (al.y && y ? Math.abs(al.y - y) : 99);
    const others = uniqueBy(
      [
        // (nunca otra edición del mismo disco: serían dos respuestas buenas)
        ...shuffle(allAlbums.filter((x) => x.a === al.a && editionOf(db, x.id) !== editionOf(db, al.id))).slice(0, 1),
        // Discos de otros artistas de la misma época
        ...shuffle(allAlbums.filter((x) => x.a !== al.a).sort((x, y) => near(x.y) - near(y.y)).slice(0, 12)),
      ].filter((x) => normText(x.t) !== normText(al.t)),
      (x) => normText(x.t),
    );
    const label = (x: { t: string; a: number }) => ({ label: x.t, sub: db.artistById.get(x.a)?.n });
    const { options, answer } = withOptions(label(al), others.map(label));
    return {
      kind: 'albumlink',
      track: t,
      album: { title: al.t, artist: artist.n, year: al.y, cover: coverUrl(al.m) },
      feats: shuffle(al.ft).slice(0, 8),
      options,
      answer,
      accept: [al.t],
    };
  });
}
