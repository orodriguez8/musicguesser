// Generación de partidas de punta a punta, con Deezer y las letras simulados (sin red).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DzTrack } from '../api/deezer';
import type { Filter } from './types';
import type { Era, Level } from './urbano';

const deezer = vi.hoisted(() => ({ down: false, noPreview: new Set<number>() }));

vi.mock('../api/deezer', () => {
  const fakeTrack = (id: number, artistId = 1, n = id): DzTrack => ({
    id,
    title: `Tema ${n}`,
    duration: 200,
    rank: 100000 - n,
    preview: `https://cdn.example/${id}.mp3`,
    link: `https://deezer.example/${id}`,
    artist: { id: artistId, name: `Artista ${artistId}` },
    album: { id: 5000 + (n % 7), title: `Disco ${n % 7}`, cover_medium: 'm.jpg', cover_big: 'b.jpg' },
  });
  return {
    getTrack: vi.fn(async (id: number) => {
      if (deezer.down) throw new Error('Error de red');
      return deezer.noPreview.has(id) ? { ...fakeTrack(id), preview: '' } : fakeTrack(id);
    }),
    // Catálogo (géneros que no son urbano): 30 canciones por artista
    artistTop: vi.fn(async (artistId: number) => {
      if (deezer.down) throw new Error('Error de red');
      return Array.from({ length: 30 }, (_, i) => fakeTrack(artistId * 1000 + i, artistId, i));
    }),
    artistAlbums: vi.fn(async () => []),
    albumTracks: vi.fn(async () => []),
    relatedArtists: vi.fn(async () => []),
    searchTracks: vi.fn(async () => []),
    getAlbum: vi.fn(async (id: number) => ({ id, title: 'x', release_date: '2010-01-01', record_type: 'album', cover_medium: '', cover_big: '', artist: { id: 1, name: 'x' } })),
    dz: vi.fn(),
  };
});
vi.mock('../api/lrclib', () => ({ getLyrics: vi.fn(async () => null), lyricsHealth: { ok: 0, failed: 0 } }));
vi.mock('../api/musicbrainz', () => ({ artistType: vi.fn(async () => undefined), firstReleaseYear: vi.fn(async () => null) }));

const { buildQuestions, GameError, questionTrack } = await import('./build');
const { loadUrbano } = await import('./urbano');
const { recentTracks, recentArtists } = await import('./history');
const { editionOf } = await import('./albums');
const { normText } = await import('./text');
const { getTrack } = await import('../api/deezer');

const db = await loadUrbano();
const urbano = (era?: Era, level: Level = 'normal'): Filter => ({ kind: 'genres', genres: ['reggaeton', 'trap-es'], era, level });
const build = (mode: Parameters<typeof buildQuestions>[0], filter: Parameters<typeof buildQuestions>[1]) =>
  buildQuestions(mode, filter, () => {}, new AbortController().signal);

beforeEach(() => {
  deezer.down = false;
  deezer.noPreview.clear();
});

describe('urbano · ¿Qué canción es?', () => {
  it('10 pruebas con 4 opciones distintas y la respuesta entre ellas', async () => {
    const qs = await build('cancion', urbano('vieja', 'facil'));
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      if (q.kind !== 'cancion') throw new Error(q.kind);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => normText(o.label))).size).toBe(4);
      expect(q.options[q.answer].label).toBe(q.track.title);
      expect(q.suggest?.length).toBeGreaterThan(50);
    }
  });

  it('nunca repite canción dentro de una partida', async () => {
    const qs = await build('cancion', urbano());
    const keys = qs.map((q) => `${questionTrack(q).artistId}:${normText(questionTrack(q).title)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('solo artistas y años de la época elegida', async () => {
    const vieja = new Set(db.artists.filter((a) => a.e?.includes('vieja')).map((a) => a.id));
    const qs = await build('cancion', urbano('vieja'));
    for (const q of qs) {
      const t = questionTrack(q);
      expect(vieja.has(t.artistId)).toBe(true);
      expect(db.tracks.find((x) => x.id === t.id)!.y).toBeLessThanOrEqual(2013);
    }
  });

  it('apunta lo que ha salido y la siguiente partida no lo repite', async () => {
    const a = await build('cancion', urbano('intermedia'));
    const recent = recentTracks();
    for (const q of a) expect(recent.has(questionTrack(q).id)).toBe(true);
    expect(recentArtists().size).toBeGreaterThan(0);
    const b = await build('cancion', urbano('intermedia'));
    const first = new Set(a.map((q) => questionTrack(q).id));
    expect(b.filter((q) => first.has(questionTrack(q).id))).toHaveLength(0);
  });

  it('en 8 partidas seguidas en Fácil apenas se repiten canciones', async () => {
    const seen = new Map<number, number>();
    for (let i = 0; i < 8; i++)
      for (const q of await build('cancion', urbano('nueva', 'facil'))) seen.set(questionTrack(q).id, (seen.get(questionTrack(q).id) ?? 0) + 1);
    // 80 pruebas sobre ~130 canciones: nada debería salir 2 veces
    expect([...seen.values()].filter((n) => n > 1)).toHaveLength(0);
  });

  it('los artistas rotan: la segunda partida trae sobre todo artistas nuevos', async () => {
    const a = await build('cancion', urbano());
    const b = await build('cancion', urbano());
    const artistsA = new Set(a.map((q) => questionTrack(q).artistId));
    const repeated = b.filter((q) => artistsA.has(questionTrack(q).artistId)).length;
    expect(repeated).toBeLessThanOrEqual(2);
  });

  it('se salta las canciones sin fragmento de audio', async () => {
    const vieja = db.tracks.filter((t) => db.artistById.get(t.a)?.e?.includes('vieja'));
    vieja.slice(0, 200).forEach((t) => deezer.noPreview.add(t.id));
    const qs = await build('cancion', urbano('vieja', 'facil'));
    for (const q of qs) expect(deezer.noPreview.has(questionTrack(q).id)).toBe(false);
  });
});

describe('urbano · juegos de discos', () => {
  it('Portada: discos distintos, sin repetir los 10 últimos y artistas separados', async () => {
    const a = await build('portada', urbano());
    const b = await build('portada', urbano());
    const ed = (q: (typeof a)[number]) => editionOf(db, questionTrack(q).albumId);
    expect(new Set(a.map(ed)).size).toBe(a.length);
    const lastTen = new Set(a.slice(-10).map(ed));
    for (const q of b) expect(lastTen.has(ed(q))).toBe(false);
    for (const qs of [a, b])
      qs.forEach((q, i) => {
        const prev = qs.slice(Math.max(0, i - 3), i).map((x) => questionTrack(x).artistId);
        expect(prev).not.toContain(questionTrack(q).artistId);
      });
  });

  it('AlbumLink: una sola respuesta buena (nunca otra edición del mismo disco)', async () => {
    const qs = await build('albumlink', urbano());
    expect(qs.length).toBeGreaterThanOrEqual(5);
    for (const q of qs) {
      if (q.kind !== 'albumlink') throw new Error(q.kind);
      expect(q.feats.length).toBeGreaterThanOrEqual(3);
      const right = normText(q.options[q.answer].label);
      expect(q.options.filter((o) => normText(o.label) === right)).toHaveLength(1);
      expect(q.album.title).not.toMatch(/exitos|remix|live/i);
    }
  });

  it('AlbumLink: dos partidas seguidas no repiten disco', async () => {
    const a = await build('albumlink', urbano());
    const b = await build('albumlink', urbano());
    const ids = new Set(a.slice(-10).map((q) => editionOf(db, questionTrack(q).albumId)));
    expect(b.filter((q) => ids.has(editionOf(db, questionTrack(q).albumId))).length).toBe(0);
  });
});

describe('urbano · otros modos', () => {
  it('Máquina del tiempo trae el año de la base de datos', async () => {
    const qs = await build('anio', urbano('intermedia'));
    for (const q of qs) {
      if (q.kind !== 'anio') throw new Error(q.kind);
      expect(q.year).toBe(db.tracks.find((t) => t.id === q.track.id)!.y);
    }
  });

  it('El infiltrado: cuatro artistas y uno no cumple', async () => {
    const qs = await build('infiltrado', urbano());
    expect(qs.length).toBeGreaterThanOrEqual(5);
    for (const q of qs) {
      if (q.kind !== 'infiltrado') throw new Error(q.kind);
      expect(q.artists).toHaveLength(4);
      expect(new Set(q.artists.map((a) => a.name)).size).toBe(4);
      expect(q.track.artistName).toBe(q.artists[q.answer].name);
      expect(q.rule.length).toBeGreaterThan(3);
    }
  });

  it('El intruso: tres del mismo artista y uno de otro', async () => {
    const qs = await build('intruso', urbano());
    for (const q of qs) {
      if (q.kind !== 'intruso') throw new Error(q.kind);
      const host = q.clips.filter((_, i) => i !== q.answer).map((c) => c.artistId);
      expect(new Set(host).size).toBe(1);
      expect(q.clips[q.answer].artistId).not.toBe(host[0]);
    }
  });

  it('Partida rápida mezcla minijuegos sin repetir canción', async () => {
    const qs = await build('mezcla', urbano());
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThan(2);
    const ids = qs.flatMap((q) => (q.kind === 'intruso' ? q.clips.map((c) => c.id) : [q.track.id]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('catálogo (fuera del urbano)', () => {
  it('¿Qué canción es? con artistas de rock', async () => {
    const qs = await build('cancion', { kind: 'genres', genres: ['rock'] });
    expect(qs).toHaveLength(10);
  });
});

describe('errores para el jugador', () => {
  it('sin conexión avisa claro', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(build('cancion', urbano())).rejects.toThrow(/conexión/);
  });

  it('modos de urbano con otro género', async () => {
    await expect(build('albumlink', { kind: 'genres', genres: ['rock'] })).rejects.toBeInstanceOf(GameError);
    await expect(build('subgenero', { kind: 'artist', artists: [{ id: 1, name: 'X', picture: '' }] })).rejects.toBeInstanceOf(GameError);
  });

  it('si Deezer no responde, lo dice', async () => {
    deezer.down = true;
    await expect(build('cancion', { kind: 'genres', genres: ['pop'] })).rejects.toThrow(/Deezer no responde/);
    expect(getTrack).toBeDefined();
  });

  it('cancelar no deja la partida a medias', async () => {
    const ctrl = new AbortController();
    const p = buildQuestions('cancion', urbano(), () => {}, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow();
  });
});
