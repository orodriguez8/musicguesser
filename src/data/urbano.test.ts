// La base de datos del urbano que se publica tiene que estar sana.
import { describe, expect, it } from 'vitest';
// @ts-expect-error script en JS sin tipos
import { checkUrbano } from '../../scripts/check-urbano.mjs';
import raw from './urbano.json';
import { ERAS } from '../game/urbano';

const db = raw as unknown as {
  artists: { id: number; n: string; g: string; e?: string[] }[];
  albums: { id: number; a: number; t: string }[];
  tracks: { id: number; a: number; t: string; y: number; r: number; al?: number }[];
};

describe('urbano.json', () => {
  it('sin fallos graves (referencias rotas, títulos vacíos, ids repetidos)', () => {
    const { errors } = checkUrbano(raw);
    expect(errors).toEqual([]);
  });

  it('todos los artistas tienen género y época válidos', () => {
    const eras = new Set(ERAS.map((e) => e.id));
    for (const a of db.artists) {
      expect(['reggaeton', 'trap-es']).toContain(a.g);
      expect(a.e?.length, a.n).toBeGreaterThan(0);
      for (const e of a.e ?? []) expect(eras.has(e as never), `${a.n}: ${e}`).toBe(true);
    }
  });

  it('tamaño razonable', () => {
    expect(db.artists.length).toBeGreaterThan(90);
    expect(db.tracks.length).toBeGreaterThan(8000);
  });

  it('cada época tiene artistas', () => {
    for (const e of ERAS) expect(db.artists.filter((a) => a.e?.includes(e.id)).length, e.id).toBeGreaterThan(10);
  });

  it('el informe de calidad detecta lo que tiene que detectar', () => {
    const fake = {
      artists: [{ id: 1, n: 'A', g: 'reggaeton', e: [] }],
      albums: [
        { id: 10, a: 1, t: 'Grandes Éxitos', f: 100, tr: [] },
        { id: 11, a: 2, t: 'Huérfano', f: 100, tr: [] },
      ],
      tracks: [
        { id: 1, a: 1, t: 'Hola', y: 2020, r: 1 },
        { id: 2, a: 1, t: 'Hola (feat. B)', y: 2020, r: 1 },
        { id: 2, a: 3, t: '', y: 1900, r: 1, al: 99 },
      ],
    };
    const { errors, warnings } = checkUrbano(fake);
    expect(errors.some((e: string) => e.includes('no existe'))).toBe(true);
    expect(errors.some((e: string) => e.includes('mismo id'))).toBe(true);
    expect(errors.some((e: string) => e.includes('sin título'))).toBe(true);
    expect(Object.keys(warnings)).toEqual(
      expect.arrayContaining(['Artistas sin época', 'Canciones repetidas (mismo artista y título)', 'Recopilatorios, remixes o directos', 'Años raros']),
    );
  });
});
