import { describe, expect, it } from 'vitest';
import { realDb } from '../test/helpers';
import { editionOf, looksLikeCompilation, quizAlbums } from './albums';
import type { UAlbum, UrbanoDB } from './urbano';

const db = realDb();
const byTitle = (t: string) => db.albums.find((a) => a.t === t)!;

function fakeDb(albums: Partial<UAlbum>[]): UrbanoDB {
  const full = albums.map((a, i) => ({ id: i + 1, a: 1, t: `Disco ${i}`, y: 2020, k: 'album' as const, m: '', f: 100, tr: [], ft: [], ...a }));
  return {
    artists: [],
    albums: full,
    tracks: [],
    people: {},
    artistById: new Map(),
    albumById: new Map(full.map((a) => [a.id, a])),
  } as unknown as UrbanoDB;
}

const songs = (n: number, prefix = 'Tema') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

describe('ediciones', () => {
  it('la deluxe y la normal cuentan como el mismo disco', () => {
    expect(editionOf(db, byTitle('King Of Kings 10th Anniversary').id)).toBe(editionOf(db, byTitle('King Of Kings').id));
    expect(editionOf(db, byTitle('MAÑANA SERÁ BONITO (BICHOTA SEASON)').id)).toBe(editionOf(db, byTitle('MAÑANA SERÁ BONITO').id));
    expect(editionOf(db, byTitle('INTER SHIBUYA').id)).toBe(editionOf(db, byTitle('INTER SHIBUYA - LA MAFIA').id));
  });

  it('discos distintos siguen siendo distintos', () => {
    expect(editionOf(db, byTitle('King Of Kings').id)).not.toBe(editionOf(db, byTitle('The Last Don').id));
  });

  it('un id desconocido se queda como está', () => {
    expect(editionOf(db, 123)).toBe(123);
  });

  it('agrupa por canciones compartidas aunque el título cambie', () => {
    const f = fakeDb([
      { t: 'Original', tr: songs(10), f: 50 },
      { t: 'Edición Platino', tr: [...songs(10), 'Extra 1', 'Extra 2'], f: 500 },
      { t: 'Otro disco', tr: songs(10, 'Otra') },
    ]);
    expect(editionOf(f, 1)).toBe(2);
    expect(editionOf(f, 2)).toBe(2);
    expect(editionOf(f, 3)).toBe(3);
  });

  it('dos títulos vacíos no se juntan por el título', () => {
    const f = fakeDb([
      { t: '(Intro)', tr: songs(8) },
      { t: '[Remix]', tr: songs(8, 'Otra') },
    ]);
    expect(editionOf(f, 1)).not.toBe(editionOf(f, 2));
  });
});

describe('Album Quiz', () => {
  const quiz = quizAlbums(db);

  it('una sola edición por disco', () => {
    const ed = quiz.map((a) => editionOf(db, a.id));
    expect(new Set(ed).size).toBe(ed.length);
  });

  it('sin recopilatorios, remixes ni directos', () => {
    expect(quiz.some(looksLikeCompilation)).toBe(false);
    for (const t of ['Real Hasta la Muerte Exitos', 'Remix Album', 'La Fama Que Camina Unplugged'])
      expect(quiz.some((a) => a.t === t)).toBe(false);
  });

  it('sin los discos del homónimo de Alvaro Díaz', () => {
    expect(quiz.some((a) => a.t.includes('Se Llama Copla'))).toBe(false);
  });

  it('listas limpias: entre 7 y 22 canciones, sin intros ni repetidas', () => {
    for (const a of quiz) {
      expect(a.tr.length).toBeGreaterThanOrEqual(7);
      expect(a.tr.length).toBeLessThanOrEqual(22);
      expect(a.tr.some((t) => /\b(intro|interlude|skit|outro)\b/i.test(t))).toBe(false);
    }
    const vibras = quiz.find((a) => a.t === 'Vibras')!;
    expect(vibras.tr).not.toContain('En Mí (Interlude)');
    expect(vibras.tr).toContain('En Mí');
  });

  it('no modifica la base de datos original', () => {
    expect(byTitle('Vibras').tr).toContain('En Mí (Interlude)');
  });

  it('descarta discos que son casi todo versiones', () => {
    const f = fakeDb([{ t: 'Normal', tr: [...songs(5).map((s) => `${s} (Remix)`), ...songs(5, 'Otra')] }]);
    expect(quizAlbums(f)).toHaveLength(0);
  });

  it('hay discos de sobra para jugar', () => {
    expect(quiz.length).toBeGreaterThan(400);
  });
});
