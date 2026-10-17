import { describe, expect, it } from 'vitest';
import { realDb } from '../test/helpers';
import { seededRandom } from './daily';
import { rememberAlbums, rememberPuzzle } from './history';
import {
  compareArtists,
  dailyOpts,
  pickAlbumQuiz,
  pickClasico,
  pickPiramide,
  pickWordle,
  PYRAMID_SIZE,
  scoreWord,
  wordleWord,
  type PuzzleOpts,
} from './puzzles';
import type { Level, UAlbum } from './urbano';

const db = realDb();
const free = (seed: string, level: Level = 'normal'): PuzzleOpts => ({ rng: seededRandom(seed), genres: ['reggaeton', 'trap-es'], level, fresh: true });

describe('reto del día', () => {
  it('es el mismo para todos con la misma fecha', () => {
    const a = pickAlbumQuiz(db, dailyOpts(seededRandom('2026-10-17:albumquiz')));
    const b = pickAlbumQuiz(db, dailyOpts(seededRandom('2026-10-17:albumquiz')));
    expect(a.id).toBe(b.id);
    expect(pickClasico(db, dailyOpts(seededRandom('d:clasico'))).id).toBe(pickClasico(db, dailyOpts(seededRandom('d:clasico'))).id);
  });

  it('no mira el historial (si no, a cada uno le saldría uno distinto)', () => {
    const before = pickAlbumQuiz(db, dailyOpts(seededRandom('dia')));
    rememberAlbums('albumquiz', [{ id: before.id, a: before.a }]);
    expect(pickAlbumQuiz(db, dailyOpts(seededRandom('dia'))).id).toBe(before.id);
  });
});

describe('Album Quiz libre', () => {
  for (const level of ['facil', 'normal', 'dificil'] as const) {
    it(`${level}: 40 partidas sin repetir disco en 10 ni artista en 3`, () => {
      const seq: UAlbum[] = [];
      for (let i = 0; i < 40; i++) {
        const al = pickAlbumQuiz(db, free(`${level}${i}`, level));
        rememberAlbums('albumquiz', [{ id: al.id, a: al.a }]);
        seq.push(al);
      }
      seq.forEach((al, i) => {
        expect(seq.slice(Math.max(0, i - 10), i).map((x) => x.id)).not.toContain(al.id);
        expect(seq.slice(Math.max(0, i - 3), i).map((x) => x.a)).not.toContain(al.a);
      });
    });
  }

  it('Fácil solo saca discos muy conocidos', () => {
    const famous = [...db.albums].sort((x, y) => y.f - x.f);
    const al = pickAlbumQuiz(db, free('x', 'facil'));
    expect(famous.findIndex((a) => a.id === al.id)).toBeLessThan(200);
  });
});

describe('Clásico y Wordle libres', () => {
  it('no repiten artista mientras queden otros', () => {
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      const a = pickClasico(db, free(`c${i}`, 'facil'));
      expect(seen).not.toContain(a.id);
      seen.push(a.id);
      rememberPuzzle('clasico', [a.id]);
    }
  });

  it('Wordle: palabra de 4 a 9 letras', () => {
    for (let i = 0; i < 20; i++) {
      const w = wordleWord(pickWordle(db, free(`w${i}`)).n);
      expect(w).toMatch(/^[A-Z]{4,9}$/);
    }
  });
});

describe('Wordle', () => {
  it('wordleWord quita espacios, tildes y símbolos', () => {
    expect(wordleWord('Bad Bunny')).toBe('BADBUNNY');
    expect(wordleWord('Ñengo Flow')).toBe('NENGOFLOW');
  });
  it('scoreWord cuenta bien las letras repetidas', () => {
    expect(scoreWord('OZUNA', 'OZUNA')).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(scoreWord('AAAXX', 'XAXAX')).toEqual(['near', 'ok', 'no', 'near', 'ok']);
    expect(scoreWord('LLLLL', 'HELLO')).toEqual(['no', 'no', 'ok', 'ok', 'no']);
  });
});

describe('Clásico', () => {
  it('compara país, género, tipo, debut, fans y discos', () => {
    const [a, b] = db.artists.filter((x) => x.d && x.c);
    const same = compareArtists(a, a);
    expect(same.every((c) => c.hint === 'ok')).toBe(true);
    const cells = compareArtists(a, b);
    expect(cells.map((c) => c.label)).toEqual(['País', 'Género', 'Tipo', 'Debut', 'Fans', 'Discos']);
  });
});

describe('Pirámide', () => {
  it('5 canciones de artistas distintos y popularidades separadas', () => {
    for (let i = 0; i < 10; i++) {
      const songs = pickPiramide(db, free(`p${i}`));
      expect(songs).toHaveLength(PYRAMID_SIZE);
      expect(new Set(songs.map((s) => s.artist)).size).toBe(PYRAMID_SIZE);
      const ranks = songs.map((s) => s.rank).sort((x, y) => y - x);
      for (let k = 1; k < ranks.length; k++) expect(ranks[k]).toBeLessThanOrEqual(ranks[k - 1] / 1.12);
    }
  });

  it('en libre evita las canciones de las últimas pirámides', () => {
    const first = pickPiramide(db, free('rep'));
    rememberPuzzle('piramide', first.map((s) => s.id));
    const again = pickPiramide(db, free('rep'));
    expect(again.some((s) => first.some((f) => f.id === s.id))).toBe(false);
  });
});
